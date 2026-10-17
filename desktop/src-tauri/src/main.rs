#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

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
    fn attach(child: &Child) -> Result<Self, String> {
        let handle = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
        if handle.is_null() {
            return Err(format!(
                "could not create Windows core job object: {}",
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
                "could not configure Windows core job object: {}",
                std::io::Error::last_os_error()
            ));
        }

        let process_handle = child.as_raw_handle() as HANDLE;
        if unsafe { AssignProcessToJobObject(handle, process_handle) } == 0 {
            return Err(format!(
                "could not assign local core to Windows job object: {}",
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
            unsafe {
                CloseHandle(self.0 as HANDLE);
            }
            self.0 = 0;
        }
    }
}

struct CoreProcess {
    child: Child,
    #[cfg(windows)]
    _job: WindowsJob,
}

#[derive(Default)]
struct CoreState {
    process: Mutex<Option<CoreProcess>>,
    session: Mutex<Option<CoreSession>>,
    startup_error: Mutex<Option<String>>,
}

#[tauri::command]
fn desktop_core_session(state: State<'_, CoreState>) -> Result<String, String> {
    if let Some(error) = state
        .startup_error
        .lock()
        .map_err(|_| "core startup state is unavailable".to_string())?
        .clone()
    {
        return Err(error);
    }

    let session = state
        .session
        .lock()
        .map_err(|_| "core session state is unavailable".to_string())?
        .clone()
        .ok_or_else(|| "local core is not ready".to_string())?;

    Ok(format!("{}\n{}", session.endpoint, session.token))
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
        .map_err(|error| format!("could not reserve local core port: {error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("could not read local core port: {error}"))?
        .port();
    drop(listener);
    Ok(port)
}

fn wait_for_health(port: u16, token: &str) -> Result<(), String> {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    for _ in 0..100 {
        if let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(300)) {
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

fn prepend_path(directory: &Path) -> OsString {
    let mut value = OsString::from(directory.as_os_str());
    value.push(";");
    if let Some(existing) = std::env::var_os("PATH") {
        value.push(existing);
    }
    value
}

fn start_core(app: &tauri::AppHandle) -> Result<(CoreProcess, CoreSession), String> {
    let core_exe = app
        .path()
        .resolve("core/solyan-core.exe", BaseDirectory::Resource)
        .map_err(|error| format!("could not resolve local core resource: {error}"))?;
    let qpdf_root = app
        .path()
        .resolve("core/qpdf", BaseDirectory::Resource)
        .map_err(|error| format!("could not resolve qpdf resource: {error}"))?;
    let qpdf_exe = find_file(&qpdf_root, "qpdf.exe")
        .ok_or_else(|| format!("qpdf.exe was not found under {}", qpdf_root.display()))?;
    let qpdf_bin = qpdf_exe
        .parent()
        .ok_or_else(|| "qpdf binary directory could not be resolved".to_string())?;

    if !core_exe.is_file() {
        return Err(format!("local core executable is missing: {}", core_exe.display()));
    }

    let port = free_loopback_port()?;
    let token = random_token();
    let mut command = Command::new(&core_exe);
    command
        .arg("--port")
        .arg(port.to_string())
        .arg("--token")
        .arg(&token)
        .env("PATH", prepend_path(qpdf_bin))
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

    if let Err(error) = wait_for_health(port, &token) {
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

fn main() {
    let app = tauri::Builder::default()
        .manage(CoreState::default())
        .setup(|app| {
            let state = app.state::<CoreState>();
            match start_core(app.handle()) {
                Ok((process, session)) => {
                    *state
                        .process
                        .lock()
                        .map_err(|_| "core process state poisoned")? = Some(process);
                    *state.session.lock().map_err(|_| "core session state poisoned")? = Some(session);
                }
                Err(error) => {
                    *state
                        .startup_error
                        .lock()
                        .map_err(|_| "core error state poisoned")? = Some(error);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![desktop_core_session])
        .build(tauri::generate_context!())
        .expect("error while building SolYan PDF Desktop");

    app.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit) {
            stop_core(app_handle);
        }
    });
}
