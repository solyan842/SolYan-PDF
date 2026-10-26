#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod service_health;
mod output_save;
#[cfg(windows)] mod port_owner;
use rand::RngCore;
use std::{
    ffi::OsString,
    fs,
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::Duration,
};
use tauri::{path::BaseDirectory, Manager, State};

#[cfg(windows)]
use std::os::windows::{io::AsRawHandle, process::CommandExt};

#[cfg(windows)]
use windows_sys::Win32::{
    Foundation::{CloseHandle, HANDLE},
    System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        TerminateJobObject, QueryInformationJobObject, JobObjectBasicAccountingInformation,
        JOBOBJECT_BASIC_ACCOUNTING_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    },
};

#[derive(Clone)]
struct CoreSession {
    endpoint: String,
    token: String,
}

#[cfg(windows)]
struct WindowsJob(usize);

#[cfg(windows)]
impl WindowsJob {
    fn active_processes(&self) -> Result<u32,String> {
        let mut info:JOBOBJECT_BASIC_ACCOUNTING_INFORMATION=unsafe{std::mem::zeroed()};
        if unsafe{QueryInformationJobObject(self.0 as HANDLE,JobObjectBasicAccountingInformation,
            &mut info as *mut _ as *mut _,std::mem::size_of_val(&info) as u32,std::ptr::null_mut())}==0 {
            return Err(format!("Cannot query sidecar job: {}",std::io::Error::last_os_error()));
        }
        Ok(info.ActiveProcesses)
    }
    fn terminate_and_wait(&self) -> Result<(),String> {
        if unsafe{TerminateJobObject(self.0 as HANDLE,1)}==0 {
            return Err(format!("Cannot terminate sidecar job: {}",std::io::Error::last_os_error()));
        }
        let started=std::time::Instant::now();
        loop {
            if self.active_processes()?==0{return Ok(());}
            if started.elapsed()>=Duration::from_secs(10){return Err("Sidecar job did not finish terminating in ten seconds".into());}
            thread::sleep(Duration::from_millis(20));
        }
    }
    fn attach(child: &Child) -> Result<Self, String> {
        let handle = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
        if handle.is_null() {
            return Err(format!(
                "could not create Windows sidecar job object: {}",
                std::io::Error::last_os_error()
            ));
        }

        let job = Self(handle as usize);
        let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let configured = unsafe {
            SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &limits as *const _ as *const _,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
        };
        if configured == 0 {
            return Err(format!(
                "could not configure Windows sidecar job object: {}",
                std::io::Error::last_os_error()
            ));
        }

        let process_handle = child.as_raw_handle() as HANDLE;
        if unsafe { AssignProcessToJobObject(handle, process_handle) } == 0 {
            return Err(format!(
                "could not assign local sidecar to Windows job object: {}",
                std::io::Error::last_os_error()
            ));
        }

        Ok(job)
    }
}

#[cfg(windows)]
impl Drop for WindowsJob {
    fn drop(&mut self) {
        if self.0 != 0 {
            unsafe { CloseHandle(self.0 as HANDLE); }
            self.0 = 0;
        }
    }
}

struct CoreProcess {
    child: Child,
    #[cfg(windows)]
    _job: WindowsJob,
}

struct OfficeProcess {
    child: Child,
    #[cfg(windows)]
    _job: WindowsJob,
}

struct OcrProcess {
    child: Child,
    #[cfg(windows)]
    _job: WindowsJob,
}

struct SignProcess {
    child: Child,
    #[cfg(windows)]
    _job: WindowsJob,
}

struct ArchiveProcess {
    child: Child,
    #[cfg(windows)]
    _job: WindowsJob,
}

trait ManagedJob {
    #[cfg(windows)] fn job(&self)->Option<&WindowsJob>;
}

macro_rules! owned_health {
    ($($kind:ty),+) => {$(impl ManagedJob for $kind{
        #[cfg(windows)] fn job(&self)->Option<&WindowsJob>{Some(&self._job)}
    }
    impl $kind{
        fn healthy(&self,port:u16,token:Option<&str>,engine:&str)->bool{
            service_health::probe(port,token,engine,|stream|{
                #[cfg(windows)]{port_owner::connection_belongs_to_job(stream,self._job.0)}
                #[cfg(not(windows))]{let _=stream;true}
            })
        }
    })+};
}
owned_health!(CoreProcess,OfficeProcess,OcrProcess,SignProcess,ArchiveProcess);

// Lightweight shell owns no sidecar on startup. Each service is started at
// most once, when a user explicitly invokes the corresponding tool.
#[derive(Clone)]
struct ServicePlan {
    office_port: u16,
    ocr_port: u16,
    ocr_token: String,
    sign_port: u16,
    sign_token: String,
    archive_port: u16,
    archive_token: String,
}
impl ServicePlan {
    fn create() -> Result<Self, String> {
        let mut used=std::collections::HashSet::new();
        let mut next=|| -> Result<u16,String> {
            for _ in 0..16 {
                let port=free_loopback_port()?;
                if used.insert(port) {return Ok(port);}
            }
            Err("Cannot allocate distinct service loopback ports".into())
        };
        Ok(Self{
            office_port:next()?,ocr_port:next()?,ocr_token:random_token(),
            sign_port:next()?,sign_token:random_token(),
            archive_port:next()?,archive_token:random_token()
        })
    }
    fn url(port:u16)->String {format!("http://127.0.0.1:{port}")}
}

#[derive(Default)]
struct CoreState {
    // Protects first-use planning and all start/stop transitions against
    // concurrent tool clicks. Heavy work runs on blocking worker threads.
    launch_lock: Mutex<()>,
    plan: Mutex<Option<ServicePlan>>,
    process: Mutex<Option<CoreProcess>>,
    office_process: Mutex<Option<OfficeProcess>>,
    ocr_process: Mutex<Option<OcrProcess>>,
    sign_process: Mutex<Option<SignProcess>>,
    archive_process: Mutex<Option<ArchiveProcess>>,
    session: Mutex<Option<CoreSession>>,
    startup_error: Mutex<Option<String>>,
}
fn service_plan(state:&CoreState)->Result<ServicePlan,String>{
    let mut slot=state.plan.lock().map_err(|_|"sTool service plan lock unavailable")?;
    if slot.is_none(){*slot=Some(ServicePlan::create()?);}
    slot.clone().ok_or("sTool service plan unavailable".into())
}
// Check the owned Child, not a stale cached session or an arbitrary TCP port.
// Even an exited launcher may leave a worker in its job; retire that job first.
fn managed_child_healthy<T:ManagedJob>(
    process:&mut Option<T>,
    select:impl Fn(&mut T)->&mut Child,
    healthy:impl FnOnce(&T)->bool,
    label:&str,
)->Result<bool,String>{
    let Some(stale)=process.as_mut() else{return Ok(false);};
    let alive=select(stale).try_wait().map_err(|e|format!("Cannot inspect {label} process: {e}"))?.is_none();
    if alive&&healthy(stale){return Ok(true);}
    // Child::wait only covers the launcher. Closing a KILL_ON_JOB_CLOSE handle
    // initiates descendant termination but does not wait for the worker's port.
    // Keep the slot/handle on errors: no replacement before this job is empty.
    #[cfg(windows)] if let Some(job)=stale.job(){
        job.terminate_and_wait().map_err(|e|format!("Cannot retire {label}: {e}"))?;
    }
    {
        let child=select(stale);
        if let Err(error)=child.kill(){
            if child.try_wait().map_err(|e|e.to_string())?.is_none(){return Err(format!("Cannot retire unresponsive {label}: {error}"));}
        }
        child.wait().map_err(|e|format!("Cannot reap unresponsive {label}: {e}"))?;
    }
    *process=None;
    Ok(false)
}

// Job accounting can reach zero before Windows releases the worker's TCP
// endpoint. Wait for exclusive bindability BEFORE spawning a replacement.
// Never send requests/credentials to the old or a foreign listener.
fn wait_for_available_port(port:u16,label:&str)->Result<(),String>{
    let started=std::time::Instant::now();
    loop{
        match TcpListener::bind(("127.0.0.1",port)){
            Ok(listener)=>{drop(listener);return Ok(());},
            Err(error)=>{
                if started.elapsed()>=Duration::from_secs(10){return Err(format!("{label} port did not become available: {error}"));}
            }
        }
        thread::sleep(Duration::from_millis(20));
    }
}

#[cfg(all(test,windows))]
mod recovery_tests{
    use super::*;
    struct OwnedTestChild{child:Child}
    impl ManagedJob for OwnedTestChild{fn job(&self)->Option<&WindowsJob>{None}}
    impl Drop for OwnedTestChild{fn drop(&mut self){let _=self.child.kill();let _=self.child.wait();}}
    fn child()->OwnedTestChild{
        let mut command=Command::new("ping.exe");
        command.args(["-n","30","127.0.0.1"]).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).creation_flags(0x08000000);
        OwnedTestChild{child:command.spawn().unwrap()}
    }
    #[test]fn healthy_process_keeps_its_pid(){
        let mut slot=Some(child());let pid=slot.as_ref().unwrap().child.id();
        assert!(managed_child_healthy(&mut slot,|p|&mut p.child,|_|true,"test").unwrap());
        assert_eq!(slot.as_ref().unwrap().child.id(),pid);
        assert!(slot.as_mut().unwrap().child.try_wait().unwrap().is_none());
    }
    #[test]fn unresponsive_process_is_reaped_without_touching_other_tools(){
        let mut other=child();let mut slot=Some(child());
        assert!(!managed_child_healthy(&mut slot,|p|&mut p.child,|_|false,"test").unwrap());
        assert!(slot.is_none());assert!(other.child.try_wait().unwrap().is_none());
        // The next request may create one replacement in the empty slot.
        slot=Some(child());assert!(managed_child_healthy(&mut slot,|p|&mut p.child,|_|true,"replacement").unwrap());
    }
    #[test]fn absent_and_exited_processes_do_not_probe_stale_ports(){
        let mut slot:Option<OwnedTestChild>=None;
        assert!(!managed_child_healthy(&mut slot,|p|&mut p.child,|_|panic!("stale probe"),"missing").unwrap());
        slot=Some(child());slot.as_mut().unwrap().child.kill().unwrap();slot.as_mut().unwrap().child.wait().unwrap();
        assert!(!managed_child_healthy(&mut slot,|p|&mut p.child,|_|panic!("stale probe"),"exited").unwrap());assert!(slot.is_none());
    }
    fn foreign_listener()->(u16,std::thread::JoinHandle<Vec<u8>>){
        let listener=TcpListener::bind(("127.0.0.1",0)).unwrap();let port=listener.local_addr().unwrap().port();
        let task=std::thread::spawn(move||{
            let(mut socket,_)=listener.accept().unwrap();socket.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
            let mut bytes=Vec::new();socket.read_to_end(&mut bytes).unwrap();bytes
        });(port,task)
    }
    #[test]fn foreign_reuse_connection_receives_no_token_or_request(){
        let unrelated=child();let job=WindowsJob::attach(&unrelated.child).unwrap();
        let(port,server)=foreign_listener();
        assert!(!service_health::probe(port,Some("must-not-leak"),"qpdf",|stream|port_owner::connection_belongs_to_job(stream,job.0)));
        assert!(server.join().unwrap().is_empty());
    }
    #[test]fn all_startup_health_paths_reject_a_stolen_port_before_sending(){
        let unrelated=child();let job=WindowsJob::attach(&unrelated.child).unwrap();
        for check in [wait_for_core_health,wait_for_ocr_health,wait_for_sign_health,wait_for_archive_health]{
            let(port,server)=foreign_listener();assert!(check(port,"must-not-leak",&job).is_err());assert!(server.join().unwrap().is_empty());
        }
        let(port,server)=foreign_listener();assert!(wait_for_office_health(port,&job).is_err());assert!(server.join().unwrap().is_empty());
    }
    #[test]fn real_owned_socket_is_accepted_and_invalid_job_is_rejected(){
        for descendant in [false,true]{
        let port=free_loopback_port().unwrap();
        // Only the stdlib socket endpoint is used; CI already provides Python.
        let python=std::env::var_os("STOOL_TEST_PYTHON").unwrap_or_else(||"python.exe".into());
        let script="import socket,sys\ns=socket.socket();s.bind(('127.0.0.1',int(sys.argv[1])));s.listen(1)\nc,_=s.accept();r=c.recv(8192)\nassert b'X-SolYan-Desktop-Token: owned-test-token' in r\nc.sendall(b'HTTP/1.1 200 OK\\r\\nConnection: close\\r\\n\\r\\n{\"status\":\"ok\",\"engine\":\"qpdf\"}');c.close();s.close()";
        let mut command=Command::new(python);
        if descendant{
            // Match PyInstaller's launcher/worker ownership: attach the launcher
            // first, then let it create the process that actually owns the socket.
            command.args(["-u","-c","import subprocess,sys;sys.stdin.readline();sys.exit(subprocess.call([sys.executable,'-u','-c',sys.argv[1],sys.argv[2]]))",script,&port.to_string()]);
        }else{command.args(["-u","-c",script,&port.to_string()]);}
        command.stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::inherit()).creation_flags(0x08000000);
        let mut owned=OwnedTestChild{child:command.spawn().unwrap()};let job=WindowsJob::attach(&owned.child).unwrap();
        if descendant{owned.child.stdin.take().unwrap().write_all(b"go\n").unwrap();}
        let started=std::time::Instant::now();
        loop{
            if service_health::probe(port,Some("owned-test-token"),"\"engine\":\"qpdf\"",|stream|{
                assert!(!port_owner::connection_belongs_to_job(stream,0));
                assert!(!port_owner::connection_belongs_to_job(stream,usize::MAX));
                port_owner::connection_belongs_to_job(stream,job.0)
            }){break;}
            assert!(owned.child.try_wait().unwrap().is_none(),"owned HTTP helper exited before a successful authenticated probe");
            assert!(started.elapsed()<Duration::from_secs(10),"owned endpoint was not ready");std::thread::sleep(Duration::from_millis(50));
        }
        assert!(owned.child.wait().unwrap().success());
        }
    }
    #[test]fn frozen_descendant_is_gone_before_same_port_replacement_even_if_launcher_exited(){
        use std::io::{BufRead,BufReader};
        for exited_launcher in [false,true]{
            let mut other=child();
            let port=free_loopback_port().unwrap();
            let python=std::env::var_os("STOOL_TEST_PYTHON").unwrap_or_else(||"python.exe".into());
            let worker="import socket,os,time,sys\ns=socket.socket();s.bind(('127.0.0.1',int(sys.argv[1])));s.listen();print(os.getpid(),flush=True);time.sleep(60)";
            let launcher="import subprocess,sys\nsys.stdin.readline();p=subprocess.Popen([sys.executable,'-u','-c',sys.argv[1],sys.argv[2]],stdout=subprocess.PIPE,text=True)\nprint(p.stdout.readline(),end='',flush=True);sys.stdin.readline()";
            let mut command=Command::new(python);
            command.args(["-u","-c",launcher,worker,&port.to_string()]).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::inherit()).creation_flags(0x08000000);
            let mut owned=CoreProcess{child:command.spawn().unwrap(),_job:WindowsJob(0)};
            owned._job=WindowsJob::attach(&owned.child).unwrap();
            owned.child.stdin.as_mut().unwrap().write_all(b"go\n").unwrap();
            let output=owned.child.stdout.take().unwrap();
            let(sender,receiver)=std::sync::mpsc::channel();
            std::thread::spawn(move||{let mut line=String::new();let read=BufReader::new(output).read_line(&mut line);let _=sender.send(read.map(|_|line));});
            let line=receiver.recv_timeout(Duration::from_secs(10)).expect("worker readiness deadline").unwrap();
            let worker_pid:u32=line.trim().parse().unwrap();
            // Exercise the production native suspension implementation; only a
            // test-owned PID is passed, no CIM, executable-name or global kill.
            let helper=Path::new(env!("CARGO_MANIFEST_DIR")).join("../backend/stool-process-smoke.ps1");
            let script=format!("$ErrorActionPreference='Stop';$s=Get-Content -Raw '{}';$n=[regex]::Match($s,\"(?s)Add-Type @'\\r?\\n(.*?)\\r?\\n'@\").Groups[1].Value;Add-Type $n;[StoolFreeze]::Freeze([Diagnostics.Process[]]@([Diagnostics.Process]::GetProcessById({worker_pid})))",helper.display());
            assert!(Command::new("powershell.exe").args(["-NoProfile","-NonInteractive","-Command",&script]).creation_flags(0x08000000).status().unwrap().success());
            assert!(TcpStream::connect(("127.0.0.1",port)).is_ok(),"frozen worker still owns its listener");
            if exited_launcher{owned.child.stdin.take().unwrap().write_all(b"exit\n").unwrap();owned.child.wait().unwrap();}
            let mut slot=Some(owned);
            assert!(!managed_child_healthy(&mut slot,|p|&mut p.child,|_|false,"frozen-test").unwrap());
            assert!(slot.is_none());
            // Immediate exclusive rebind verifies that the descendant is gone
            // before a replacement may start. Unrelated engine stays alive.
            wait_for_available_port(port,"test replacement").unwrap();
            let replacement=TcpListener::bind(("127.0.0.1",port)).expect("old worker must release the port before replacement");
            assert!(other.child.try_wait().unwrap().is_none());drop(replacement);
        }
    }
}
fn ensure_core(app:&tauri::AppHandle,state:&CoreState,plan:&ServicePlan)->Result<String,String>{
    {
        let mut owned=state.process.lock().map_err(|_|"sTool core process lock unavailable")?;
        let cached=state.session.lock().map_err(|_|"sTool core session lock unavailable")?.clone();
        if managed_child_healthy(&mut *owned,|p|&mut p.child,|process|cached.as_ref().is_some_and(|session|{
            session.endpoint.rsplit(':').next().and_then(|p|p.parse().ok())
                .is_some_and(|port|process.healthy(port,Some(&session.token),"\"engine\":\"qpdf\""))
        }),"Core")? {
            let existing=cached.as_ref().ok_or("Core session unavailable")?;
            return Ok(format!("{}\n{}",existing.endpoint,existing.token));
        }
    }
    *state.session.lock().map_err(|_|"sTool core session lock unavailable")?=None;
    let (process,session)=start_core(
        app,&ServicePlan::url(plan.office_port),
        &ServicePlan::url(plan.ocr_port),&plan.ocr_token,
        &ServicePlan::url(plan.sign_port),&plan.sign_token,
        &ServicePlan::url(plan.archive_port),&plan.archive_token)?;
    let result=format!("{}\n{}",session.endpoint,session.token);
    *state.process.lock().map_err(|_|"sTool core process lock unavailable")?=Some(process);
    *state.session.lock().map_err(|_|"sTool core session lock unavailable")?=Some(session);
    Ok(result)
}
#[tauri::command]
async fn desktop_core_session(app:tauri::AppHandle)->Result<String,String>{
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<CoreState>();
        let _lock=state.launch_lock.lock().map_err(|_|"sTool launch lock unavailable")?;
        let plan=service_plan(&state)?;
        ensure_core(&app,&state,&plan)
    }).await.map_err(|e|format!("sTool core startup worker failed: {e}"))?
}
#[tauri::command]
async fn desktop_service_ready(app:tauri::AppHandle,service:String)->Result<bool,String>{
    if !matches!(service.as_str(),"office"|"ocr"|"sign"|"archive"){
        return Err("Unsupported sTool service".into());
    }
    tauri::async_runtime::spawn_blocking(move||{
        let state=app.state::<CoreState>();
        let _lock=state.launch_lock.lock().map_err(|_|"sTool launch lock unavailable")?;
        let plan=service_plan(&state)?;
        match service.as_str(){
            "office"=>{
                let mut slot=state.office_process.lock().map_err(|_|"Office process lock unavailable")?;
                if !managed_child_healthy(&mut *slot,|p|&mut p.child,|p|p.healthy(plan.office_port,None,"LibreOffice"),"Office")? {
                    let (process,_)=start_office(&app,plan.office_port)?;
                    *slot=Some(process);
                }
            }
            "ocr"=>{
                let mut slot=state.ocr_process.lock().map_err(|_|"OCR process lock unavailable")?;
                if !managed_child_healthy(&mut *slot,|p|&mut p.child,|p|p.healthy(plan.ocr_port,Some(&plan.ocr_token),"\"engine\":\"PaddleOCR\""),"OCR")? {
                    let (process,_,_)=start_ocr(&app,plan.ocr_port,&plan.ocr_token)?;
                    *slot=Some(process);
                }
            }
            "sign"=>{
                let mut slot=state.sign_process.lock().map_err(|_|"Signing process lock unavailable")?;
                if !managed_child_healthy(&mut *slot,|p|&mut p.child,|p|p.healthy(plan.sign_port,Some(&plan.sign_token),"\"engine\":\"pyHanko\""),"Signing")? {
                    let (process,_,_)=start_sign(&app,plan.sign_port,&plan.sign_token)?;
                    *slot=Some(process);
                }
            }
            "archive"=>{
                let mut slot=state.archive_process.lock().map_err(|_|"Archive process lock unavailable")?;
                if !managed_child_healthy(&mut *slot,|p|&mut p.child,|p|p.healthy(plan.archive_port,Some(&plan.archive_token),"\"engine\":\"OCRmyPDF\""),"Archive")? {
                    let (process,_,_)=start_archive(&app,plan.archive_port,&plan.archive_token)?;
                    *slot=Some(process);
                }
            }
            _=>unreachable!()
        }
        Ok(true)
    }).await.map_err(|e|format!("sTool service worker failed: {e}"))?
}

fn random_token() -> String {
    let mut bytes = [0_u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn find_file(root: &Path, file_name: &str) -> Option<PathBuf> {
    let entries = fs::read_dir(root).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file()
            && path
                .file_name()
                .and_then(|value| value.to_str())
                .is_some_and(|value| value.eq_ignore_ascii_case(file_name))
        {
            return Some(path);
        }
        if path.is_dir() {
            if let Some(found) = find_file(&path, file_name) {
                return Some(found);
            }
        }
    }
    None
}

fn free_loopback_port() -> Result<u16, String> {
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .map_err(|error| format!("could not reserve local sidecar port: {error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("could not read local sidecar port: {error}"))?
        .port();
    drop(listener);
    Ok(port)
}

fn wait_for_core_health(port: u16, token: &str, #[cfg(windows)] job:&WindowsJob) -> Result<(), String> {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    for _ in 0..100 {
        if let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(300)) {
            #[cfg(windows)] if !port_owner::connection_belongs_to_job(&stream,job.0){return Err("Core port is not owned by its managed Windows job".into());}
            let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
            let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
            let request = format!(
                "GET /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nX-SolYan-Desktop-Token: {token}\r\nConnection: close\r\n\r\n"
            );
            if stream.write_all(request.as_bytes()).is_ok() {
                let mut response = String::new();
                if stream.read_to_string(&mut response).is_ok()
                    && response.contains(" 200 ")
                    && response.contains("\"status\":\"ok\"")
                    && response.contains("\"engine\":\"qpdf\"")
                {
                    return Ok(());
                }
            }
        }
        thread::sleep(Duration::from_millis(200));
    }
    Err("local core did not reach qpdf-backed health in time".to_string())
}

fn wait_for_office_health(port: u16, #[cfg(windows)] job:&WindowsJob) -> Result<(), String> {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    for _ in 0..60 {
        if let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(500)) {
            #[cfg(windows)] if !port_owner::connection_belongs_to_job(&stream,job.0){return Err("Office port is not owned by its managed Windows job".into());}
            let _ = stream.set_read_timeout(Some(Duration::from_secs(20)));
            let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
            let request = format!(
                "GET /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
            );
            if stream.write_all(request.as_bytes()).is_ok() {
                let mut response = String::new();
                if stream.read_to_string(&mut response).is_ok()
                    && response.contains(" 200 ")
                    && response.contains("\"status\":\"ok\"")
                    && response.contains("LibreOffice")
                {
                    return Ok(());
                }
            }
        }
        thread::sleep(Duration::from_millis(500));
    }
    Err("local Office sidecar did not reach LibreOffice-backed health in time".to_string())
}


fn wait_for_ocr_health(port: u16, token: &str, #[cfg(windows)] job:&WindowsJob) -> Result<(), String> {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    for _ in 0..180 {
        if let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(400)) {
            #[cfg(windows)] if !port_owner::connection_belongs_to_job(&stream,job.0){return Err("OCR port is not owned by its managed Windows job".into());}
            let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
            let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
            let request = format!(
                "GET /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nX-SolYan-Desktop-Token: {token}\r\nConnection: close\r\n\r\n"
            );
            if stream.write_all(request.as_bytes()).is_ok() {
                let mut response = String::new();
                if stream.read_to_string(&mut response).is_ok()
                    && response.contains(" 200 ")
                    && response.contains("\"status\":\"ok\"")
                    && response.contains("\"engine\":\"PaddleOCR\"")
                {
                    return Ok(());
                }
            }
        }
        thread::sleep(Duration::from_millis(500));
    }
    Err("local OCR sidecar did not reach healthy state".to_string())
}

fn wait_for_sign_health(port: u16, token: &str, #[cfg(windows)] job:&WindowsJob) -> Result<(), String> {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    for _ in 0..120 {
        if let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(400)) {
            #[cfg(windows)] if !port_owner::connection_belongs_to_job(&stream,job.0){return Err("Signing port is not owned by its managed Windows job".into());}
            let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
            let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
            let request = format!(
                "GET /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nX-SolYan-Desktop-Token: {token}\r\nConnection: close\r\n\r\n"
            );
            if stream.write_all(request.as_bytes()).is_ok() {
                let mut response = String::new();
                if stream.read_to_string(&mut response).is_ok()
                    && response.contains(" 200 ")
                    && response.contains("\"status\":\"ok\"")
                    && response.contains("\"engine\":\"pyHanko\"")
                {
                    return Ok(());
                }
            }
        }
        thread::sleep(Duration::from_millis(500));
    }
    Err("local signing sidecar did not reach pyHanko health".to_string())
}

fn wait_for_archive_health(port: u16, token: &str, #[cfg(windows)] job:&WindowsJob) -> Result<(), String> {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    for _ in 0..120 {
        if let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(400)) {
            #[cfg(windows)] if !port_owner::connection_belongs_to_job(&stream,job.0){return Err("Archive port is not owned by its managed Windows job".into());}
            let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
            let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
            let request = format!(
                "GET /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nX-SolYan-Desktop-Token: {token}\r\nConnection: close\r\n\r\n"
            );
            if stream.write_all(request.as_bytes()).is_ok() {
                let mut response = String::new();
                if stream.read_to_string(&mut response).is_ok()
                    && response.contains(" 200 ")
                    && response.contains("\"status\":\"ok\"")
                    && response.contains("\"engine\":\"OCRmyPDF\"")
                {
                    return Ok(());
                }
            }
        }
        thread::sleep(Duration::from_millis(500));
    }
    Err("local archive sidecar did not reach OCRmyPDF health".to_string())
}

fn prepend_paths(directories: &[&Path]) -> Result<OsString, String> {
    let mut paths: Vec<PathBuf> = directories.iter().map(|path| path.to_path_buf()).collect();
    if let Some(existing) = std::env::var_os("PATH") {
        paths.extend(std::env::split_paths(&existing));
    }
    std::env::join_paths(paths).map_err(|error| format!("could not compose sidecar PATH: {error}"))
}

fn start_office(app: &tauri::AppHandle, port: u16) -> Result<(OfficeProcess, String), String> {
    wait_for_available_port(port,"Office")?;
    let office_exe = app
        .path()
        .resolve("office/solyan-office.exe", BaseDirectory::Resource)
        .map_err(|error| format!("could not resolve local Office sidecar resource: {error}"))?;
    let libreoffice_root = app
        .path()
        .resolve("office/libreoffice", BaseDirectory::Resource)
        .map_err(|error| format!("could not resolve LibreOffice resource: {error}"))?;
    let soffice_exe = find_file(&libreoffice_root, "soffice.com")
        .or_else(|| find_file(&libreoffice_root, "soffice.exe"))
        .ok_or_else(|| format!("soffice executable was not found under {}", libreoffice_root.display()))?;
    let soffice_bin = soffice_exe
        .parent()
        .ok_or_else(|| "LibreOffice binary directory could not be resolved".to_string())?;

    if !office_exe.is_file() {
        return Err(format!("local Office sidecar executable is missing: {}", office_exe.display()));
    }

    let mut command = Command::new(&office_exe);
    command
        .arg("--port")
        .arg(port.to_string())
        .env("PATH", prepend_paths(&[soffice_bin])?)
        .env("SOLYAN_LIBREOFFICE_BINARY", &soffice_exe)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(windows)]
    command.creation_flags(0x08000000);

    let mut child = command
        .spawn()
        .map_err(|error| format!("could not start local Office sidecar: {error}"))?;

    #[cfg(windows)]
    let job = match WindowsJob::attach(&child) {
        Ok(job) => job,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
    };

    if let Err(error) = wait_for_office_health(port, #[cfg(windows)] &job) {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }

    Ok((
        OfficeProcess {
            child,
            #[cfg(windows)]
            _job: job,
        },
        format!("http://127.0.0.1:{port}"),
    ))
}


fn start_ocr(app: &tauri::AppHandle, port: u16, token: &str) -> Result<(OcrProcess, String, String), String> {
    wait_for_available_port(port,"OCR")?;
    let ocr_exe = app
        .path()
        .resolve("ocr/solyan-ocr.exe", BaseDirectory::Resource)
        .map_err(|error| format!("could not resolve local OCR sidecar resource: {error}"))?;
    let ocr_root = app
        .path()
        .resolve("ocr", BaseDirectory::Resource)
        .map_err(|error| format!("could not resolve local OCR resources: {error}"))?;
    let tesseract_exe = ocr_root.join("tesseract").join("tesseract.exe");
    let tessdata = ocr_root.join("tesseract").join("tessdata");
    let model_cache = ocr_root.join("paddlex-cache");
    if !ocr_exe.is_file() {
        return Err(format!("OCR sidecar is missing: {}", ocr_exe.display()));
    }
    if !tesseract_exe.is_file() || !tessdata.is_dir() {
        return Err("pinned Tesseract OCR runtime is missing".to_string());
    }
    if !model_cache.join("solyan-model-inventory.json").is_file()
        || !model_cache.join("official_models").is_dir()
    {
        return Err("pinned offline PaddleOCR models are missing".to_string());
    }
    let tesseract_bin = tesseract_exe
        .parent()
        .ok_or_else(|| "Tesseract binary directory is unavailable".to_string())?;
    let mut command = Command::new(&ocr_exe);
    command
        .arg("--port")
        .arg(port.to_string())
        .arg("--token")
        .arg(&token)
        .env("SOLYAN_TESSERACT_BINARY", &tesseract_exe)
        .env("TESSDATA_PREFIX", &tessdata)
        .env("TESSERACT_LANG", "vie+eng")
        .env("OCR_LANG", "vi")
        .env("PADDLE_PDX_CACHE_HOME", &model_cache)
        .env("SOLYAN_OCR_MODEL_ROOT", model_cache.join("official_models"))
        .env("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
        .env("PATH", prepend_paths(&[tesseract_bin])?)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(windows)]
    command.creation_flags(0x08000000);

    let mut child = command
        .spawn()
        .map_err(|error| format!("could not start local OCR sidecar: {error}"))?;

    #[cfg(windows)]
    let job = match WindowsJob::attach(&child) {
        Ok(job) => job,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
    };

    if let Err(error) = wait_for_ocr_health(port, &token, #[cfg(windows)] &job) {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }

    Ok((
        OcrProcess {
            child,
            #[cfg(windows)]
            _job: job,
        },
        format!("http://127.0.0.1:{port}"),
        token.to_owned(),
    ))
}

fn start_sign(app: &tauri::AppHandle, port: u16, token: &str) -> Result<(SignProcess, String, String), String> {
    wait_for_available_port(port,"Signing")?;
    let exe = app
        .path()
        .resolve("sign/solyan-sign.exe", BaseDirectory::Resource)
        .map_err(|error| format!("could not resolve signing sidecar: {error}"))?;
    if !exe.is_file() {
        return Err(format!("bundled signing sidecar missing: {}", exe.display()));
    }
    let mut command = Command::new(&exe);
    command
        .arg("--port")
        .arg(port.to_string())
        .arg("--token")
        .arg(&token)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(windows)]
    command.creation_flags(0x08000000);

    let mut child = command
        .spawn()
        .map_err(|error| format!("could not start signing sidecar: {error}"))?;

    #[cfg(windows)]
    let job = match WindowsJob::attach(&child) {
        Ok(job) => job,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
    };

    if let Err(error) = wait_for_sign_health(port, &token, #[cfg(windows)] &job) {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }

    Ok((
        SignProcess {
            child,
            #[cfg(windows)]
            _job: job,
        },
        format!("http://127.0.0.1:{port}"),
        token.to_owned(),
    ))
}

fn start_archive(app: &tauri::AppHandle, port: u16, token: &str) -> Result<(ArchiveProcess, String, String), String> {
    wait_for_available_port(port,"Archive")?;
    let exe = app
        .path()
        .resolve("archive/solyan-archive.exe", BaseDirectory::Resource)
        .map_err(|error| format!("could not resolve archive sidecar: {error}"))?;
    let tesseract_exe = app
        .path()
        .resolve("ocr/tesseract/tesseract.exe", BaseDirectory::Resource)
        .map_err(|error| format!("could not resolve pinned Tesseract: {error}"))?;
    if !exe.is_file() || !tesseract_exe.is_file() {
        return Err("bundled PDF/A or Tesseract sidecar is missing".to_string());
    }
    let tesseract_dir = tesseract_exe
        .parent()
        .ok_or_else(|| "Tesseract binary directory is unavailable".to_string())?;
    let tessdata = tesseract_dir.join("tessdata");
    if !tessdata.is_dir() {
        return Err("pinned Tesseract language resources missing for archive sidecar".to_string());
    }
    let mut command = Command::new(&exe);
    command
        .arg("--port")
        .arg(port.to_string())
        .arg("--token")
        .arg(&token)
        .env("TESSDATA_PREFIX", &tessdata)
        .env("PATH", prepend_paths(&[tesseract_dir])?)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(windows)]
    command.creation_flags(0x08000000);

    let mut child = command
        .spawn()
        .map_err(|error| format!("could not start PDF/A sidecar: {error}"))?;

    #[cfg(windows)]
    let job = match WindowsJob::attach(&child) {
        Ok(job) => job,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
    };
    if let Err(error) = wait_for_archive_health(port, &token, #[cfg(windows)] &job) {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }
    Ok((
        ArchiveProcess {
            child,
            #[cfg(windows)]
            _job: job,
        },
        format!("http://127.0.0.1:{port}"),
        token.to_owned(),
    ))
}

fn start_core(app: &tauri::AppHandle, office_endpoint: &str, ocr_endpoint: &str, ocr_token: &str, sign_endpoint: &str, sign_token: &str, archive_endpoint: &str, archive_token: &str) -> Result<(CoreProcess, CoreSession), String> {
    let core_exe = app
        .path()
        .resolve("core/solyan-core.exe", BaseDirectory::Resource)
        .map_err(|error| format!("could not resolve local core resource: {error}"))?;
    let qpdf_root = app
        .path()
        .resolve("core/qpdf", BaseDirectory::Resource)
        .map_err(|error| format!("could not resolve qpdf resource: {error}"))?;
    let poppler_root = app
        .path()
        .resolve("core/poppler", BaseDirectory::Resource)
        .map_err(|error| format!("could not resolve Poppler resource: {error}"))?;
    let qpdf_exe = find_file(&qpdf_root, "qpdf.exe")
        .ok_or_else(|| format!("qpdf.exe was not found under {}", qpdf_root.display()))?;
    let pdftoppm_exe = find_file(&poppler_root, "pdftoppm.exe")
        .ok_or_else(|| format!("pdftoppm.exe was not found under {}", poppler_root.display()))?;
    let qpdf_bin = qpdf_exe
        .parent()
        .ok_or_else(|| "qpdf binary directory could not be resolved".to_string())?;
    let poppler_bin = pdftoppm_exe
        .parent()
        .ok_or_else(|| "Poppler binary directory could not be resolved".to_string())?;

    if !core_exe.is_file() {
        return Err(format!("local core executable is missing: {}", core_exe.display()));
    }

    let port = free_loopback_port()?;
    wait_for_available_port(port,"Core")?;
    let token = random_token();
    let mut command = Command::new(&core_exe);
    command
        .arg("--port")
        .arg(port.to_string())
        .arg("--token")
        .arg(&token)
        .env("PATH", prepend_paths(&[qpdf_bin, poppler_bin])?)
        .env("OFFICE_SERVICE_URL", office_endpoint)
        .env("OCR_SERVICE_URL", ocr_endpoint)
        .env("SOLYAN_OCR_TOKEN", ocr_token)
        .env("SIGN_SERVICE_URL", sign_endpoint)
        .env("SOLYAN_SIGN_TOKEN", sign_token)
        .env("ARCHIVE_SERVICE_URL", archive_endpoint)
        .env("SOLYAN_ARCHIVE_TOKEN", archive_token)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(windows)]
    command.creation_flags(0x08000000);

    let mut child = command
        .spawn()
        .map_err(|error| format!("could not start local core: {error}"))?;

    #[cfg(windows)]
    let job = match WindowsJob::attach(&child) {
        Ok(job) => job,
        Err(error) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
    };

    if let Err(error) = wait_for_core_health(port, &token, #[cfg(windows)] &job) {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }

    Ok((
        CoreProcess {
            child,
            #[cfg(windows)]
            _job: job,
        },
        CoreSession {
            endpoint: format!("http://127.0.0.1:{port}"),
            token,
        },
    ))
}

fn stop_core(app: &tauri::AppHandle) {
    let state = app.state::<CoreState>();
    if let Ok(mut process) = state.process.lock() {
        if let Some(mut managed) = process.take() {
            let _ = managed.child.kill();
            let _ = managed.child.wait();
        }
    };
}

fn stop_ocr(app: &tauri::AppHandle) {
    let state = app.state::<CoreState>();
    if let Ok(mut process) = state.ocr_process.lock() {
        if let Some(mut managed) = process.take() {
            let _ = managed.child.kill();
            let _ = managed.child.wait();
        }
    };
}

fn stop_office(app: &tauri::AppHandle) {
    let state = app.state::<CoreState>();
    if let Ok(mut process) = state.office_process.lock() {
        if let Some(mut managed) = process.take() {
            let _ = managed.child.kill();
            let _ = managed.child.wait();
        }
    };
}

fn stop_sign(app: &tauri::AppHandle) {
    let state = app.state::<CoreState>();
    if let Ok(mut process) = state.sign_process.lock() {
        if let Some(mut managed) = process.take() {
            let _ = managed.child.kill();
            let _ = managed.child.wait();
        }
    };
}

fn stop_archive(app: &tauri::AppHandle) {
    let state = app.state::<CoreState>();
    if let Ok(mut process) = state.archive_process.lock() {
        if let Some(mut managed) = process.take() {
            let _ = managed.child.kill();
            let _ = managed.child.wait();
        }
    };
}

fn main() {
    let app=tauri::Builder::default()
        .manage(CoreState::default()).manage(output_save::OutputState::default())
        .setup(|app|{
            tauri::WebviewWindowBuilder::from_config(app,&app.config().app.windows[0])?
                .initialization_script(concat!(include_str!("../../ui/output-name.js"),"\n",include_str!("../../ui/output-save.js"))).build()?;
            Ok(())
        })
        // No PyInstaller/Paddle/LibreOffice/pyHanko/OCRmyPDF launched while
        // the Home window is displayed. Core starts on first tool execution;
        // specialized services start only for their matching tool.
        .invoke_handler(tauri::generate_handler![desktop_core_session,desktop_service_ready,output_save::stool_save_output])
        .build(tauri::generate_context!())
        .expect("error while building sTool PDF Windows");

    app.run(|app_handle,event|{
        if matches!(event,tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit){
            stop_core(app_handle);
            stop_ocr(app_handle);
            stop_sign(app_handle);
            stop_archive(app_handle);
            stop_office(app_handle);
        }
    });
}

