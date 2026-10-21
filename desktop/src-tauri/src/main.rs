#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod reader_open;
mod reader_links;
mod reader_window_state;
mod reader_session;
mod document_handoff;

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
use tauri::{path::BaseDirectory, Emitter, Manager, State};

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

#[derive(Default)]
struct CoreState {
    process: Mutex<Option<CoreProcess>>,
    office_process: Mutex<Option<OfficeProcess>>,
    ocr_process: Mutex<Option<OcrProcess>>,
    sign_process: Mutex<Option<SignProcess>>,
    archive_process: Mutex<Option<ArchiveProcess>>,
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
        .map_err(|error| format!("could not reserve local sidecar port: {error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("could not read local sidecar port: {error}"))?
        .port();
    drop(listener);
    Ok(port)
}

fn wait_for_core_health(port: u16, token: &str) -> Result<(), String> {
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

fn wait_for_office_health(port: u16) -> Result<(), String> {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    for _ in 0..60 {
        if let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(500)) {
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


fn wait_for_ocr_health(port: u16, token: &str) -> Result<(), String> {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    for _ in 0..180 {
        if let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(400)) {
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

fn wait_for_sign_health(port: u16, token: &str) -> Result<(), String> {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    for _ in 0..120 {
        if let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(400)) {
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

fn wait_for_archive_health(port: u16, token: &str) -> Result<(), String> {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    for _ in 0..120 {
        if let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(400)) {
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

fn start_office(app: &tauri::AppHandle) -> Result<(OfficeProcess, String), String> {
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

    let port = free_loopback_port()?;
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

    if let Err(error) = wait_for_office_health(port) {
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


fn start_ocr(app: &tauri::AppHandle) -> Result<(OcrProcess, String, String), String> {
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
    let port = free_loopback_port()?;
    let token = random_token();
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

    if let Err(error) = wait_for_ocr_health(port, &token) {
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
        token,
    ))
}

fn start_sign(app: &tauri::AppHandle) -> Result<(SignProcess, String, String), String> {
    let exe = app
        .path()
        .resolve("sign/solyan-sign.exe", BaseDirectory::Resource)
        .map_err(|error| format!("could not resolve signing sidecar: {error}"))?;
    if !exe.is_file() {
        return Err(format!("bundled signing sidecar missing: {}", exe.display()));
    }
    let port = free_loopback_port()?;
    let token = random_token();
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

    if let Err(error) = wait_for_sign_health(port, &token) {
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
        token,
    ))
}

fn start_archive(app: &tauri::AppHandle) -> Result<(ArchiveProcess, String, String), String> {
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
    let port = free_loopback_port()?;
    let token = random_token();
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
    if let Err(error) = wait_for_archive_health(port, &token) {
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
        token,
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

    if let Err(error) = wait_for_core_health(port, &token) {
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

#[tauri::command]
async fn desktop_open_reader(app: tauri::AppHandle, bytes: Option<Vec<u8>>, name: Option<String>) -> Result<(), String> {
    if cfg!(feature = "reader-only") { return Err("Reader launch is available from Tools".into()); }
    let transfer=if let Some(bytes)=bytes {Some(document_handoff::create(&handoff_root(&app)?,&random_token(),&bytes,name.as_deref().unwrap_or("document.pdf"))?)}else{None};
    let installed = app.path().local_data_dir().map_err(|e| e.to_string())?.join("sReader PDF").join("solyan-pdf-reader.exe");
    if installed.is_file() {
        let mut command = Command::new(installed);
        if let Some(path)=transfer.as_ref(){command.arg(path);}
        #[cfg(windows)]
        command.creation_flags(0x08000000);
        return command.spawn().map(|_| ()).map_err(|e| e.to_string());
    }
    if let Some(path)=transfer.as_ref(){app.state::<ReaderOpenState>().queue.lock().map_err(|_|"Reader queue unavailable")?.enqueue([path.clone()],Path::new("."));}
    if let Some(window) = app.get_webview_window("reader") {
        let _=window.emit("reader-open-pending",());
        return window.set_focus().map_err(|e| e.to_string());
    }
    tauri::WebviewWindowBuilder::new(&app, "reader", tauri::WebviewUrl::App("reader.html".into()))
        .title("sReader PDF").inner_size(1440.0, 920.0).disable_drag_drop_handler().build().map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
async fn reader_save_as(window: tauri::WebviewWindow, state: State<'_, ReaderOpenState>, bytes: Vec<u8>, name: String, document: Option<String>, language: Option<String>) -> Result<Option<String>, String> {
    reader_window(&window)?;
    if document.as_ref().map(|id| id.is_empty() || id.len() > 128).unwrap_or(false) { return Err("Invalid document identity".into()); }
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::Controls::Dialogs::{GetSaveFileNameW, CommDlgExtendedError, OPENFILENAMEW, OFN_OVERWRITEPROMPT, OFN_PATHMUSTEXIST, OFN_NOCHANGEDIR};
        if bytes.len() > 250 * 1024 * 1024 || !bytes.starts_with(b"%PDF-") { return Err("Invalid or oversized PDF output".into()); }
        let safe_name: String = name.chars().filter(|c| !"<>:\"/\\|?*".contains(*c) && !c.is_control()).take(180).collect();
        let mut file = vec![0u16; 32768];
        let initial: Vec<u16> = safe_name.encode_utf16().collect();
        file[..initial.len()].copy_from_slice(&initial);
        let filter: Vec<u16> = "PDF document\0*.pdf\0\0".encode_utf16().collect();
        let extension: Vec<u16> = "pdf\0".encode_utf16().collect();
        let title: Vec<u16> = if language.as_deref() == Some("en") { "sReader PDF — Save As\0" } else { "sReader PDF — Lưu thành\0" }.encode_utf16().collect();
        let mut dialog: OPENFILENAMEW = unsafe { std::mem::zeroed() };
        dialog.lStructSize = std::mem::size_of::<OPENFILENAMEW>() as u32;
        dialog.hwndOwner = window.hwnd().map_err(|e| e.to_string())?.0;
        dialog.lpstrFilter = filter.as_ptr(); dialog.lpstrFile = file.as_mut_ptr(); dialog.nMaxFile = file.len() as u32;
        dialog.lpstrDefExt = extension.as_ptr(); dialog.lpstrTitle = title.as_ptr();
        dialog.Flags = OFN_OVERWRITEPROMPT | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR;
        if unsafe { GetSaveFileNameW(&mut dialog) } == 0 {
            let code = unsafe { CommDlgExtendedError() };
            return if code == 0 { Ok(None) } else { Err(format!("Save As dialog failed: {code}")) };
        }
        let path = PathBuf::from(String::from_utf16_lossy(&file[..file.iter().position(|&c| c == 0).unwrap_or(file.len())]));
        let sources = state.queue.lock().map_err(|_| "Reader source state unavailable")?;
        if sources.is_source(&path) { return Err("Source PDF is protected; choose another output with Save As".into()); }
        let mut outputs = state.outputs.lock().map_err(|_| "Reader output state unavailable")?;
        if document.as_ref().map(|id| outputs.len() >= 256 && !outputs.contains_key(id)).unwrap_or(false) { return Err("Reader output limit reached".into()); }
        write_reader_pdf(&path, &bytes)?;
        if let Some(id) = document { outputs.insert(id,path.clone()); }
        Ok(Some(path.to_string_lossy().to_string()))
    }
    #[cfg(not(windows))]
    { let _ = (window, state, bytes, name, document, language); Err("Native Save As is available on Windows".into()) }
}


fn write_reader_pdf(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if bytes.len() > 250 * 1024 * 1024 || !bytes.starts_with(b"%PDF-") { return Err("Invalid or oversized PDF output".into()); }
    #[cfg(windows)] {
        use windows_sys::Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH};
        let temporary = path.with_file_name(format!(".solyan-{}.tmp", random_token()));
        let mut output = fs::OpenOptions::new().write(true).create_new(true).open(&temporary).map_err(|e| e.to_string())?;
        if let Err(error) = output.write_all(&bytes).and_then(|_| output.sync_all()) { drop(output); let _ = fs::remove_file(&temporary); return Err(error.to_string()); }
        drop(output);
        use std::os::windows::ffi::OsStrExt;
        let from: Vec<u16> = temporary.as_os_str().encode_wide().chain(Some(0)).collect();
        let to: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        if unsafe { MoveFileExW(from.as_ptr(), to.as_ptr(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH) } == 0 {
            let error = std::io::Error::last_os_error(); let _ = fs::remove_file(&temporary); return Err(error.to_string());
        }

        Ok(())
    }
    #[cfg(not(windows))] { let _ = path; Err("Native saving is available on Windows".into()) }
}
#[tauri::command]
async fn reader_save(window: tauri::WebviewWindow, state: State<'_, ReaderOpenState>, bytes: Vec<u8>, document: String) -> Result<String, String> {
    reader_window(&window)?;
    let path = state.outputs.lock().map_err(|_| "Reader output state unavailable")?.get(&document).cloned().ok_or("Choose Save As before Save")?;
    let sources = state.queue.lock().map_err(|_| "Reader source state unavailable")?;
    if sources.is_source(&path) { return Err("Source PDF is protected; choose another output with Save As".into()); }
    write_reader_pdf(&path, &bytes)?;
    Ok(path.to_string_lossy().to_string())
}

struct ReaderOpenState {
    queue: Mutex<reader_open::OpenQueue>,
    outputs: Mutex<std::collections::HashMap<String, PathBuf>>,
    session_lock: Mutex<()>,
}

// All persistent paths come from OS opens or the Reader-owned profile, never
// from a webview-supplied filesystem path. Only the Reader window may call.
fn reader_session_root(app:&tauri::AppHandle)->Result<PathBuf,String>{
    app.path().app_data_dir().map_err(|e|e.to_string())
}
#[tauri::command]
fn reader_session_save(window:tauri::WebviewWindow, state:State<'_,ReaderOpenState>, tabs:Vec<reader_session::View>, active:Option<String>)->Result<(),String>{
    reader_window(&window)?;
    let transfer=handoff_root(&window.app_handle())?;
    let queue=state.queue.lock().map_err(|_|"Reader queue unavailable")?;
    let mut verified=Vec::new();
    for (key,page,scale,left,top) in tabs.into_iter().take(reader_session::MAX_TABS){
        let Some(path)=queue.path_for(&key) else {return Err("Unknown Reader session source".into());};
        if path.starts_with(&transfer){continue;}
        verified.push(reader_session::Tab{path,page:reader_session::valid_page(page),scale:reader_session::valid_scale(scale),left:reader_session::valid_scroll(left),top:reader_session::valid_scroll(top)});
    }
    let selected=if let Some(key)=active {
        let path=queue.path_for(&key).ok_or("Unknown Reader active source")?;
        if path.starts_with(&transfer){None}else{Some(path)}
    }else{None};
    let _lock=state.session_lock.lock().map_err(|_|"Reader session lock unavailable")?;
    let root=reader_session_root(&window.app_handle())?;
    let mut store=reader_session::read(&root);
    reader_session::update(&mut store,verified,selected);
    reader_session::write(&root,&store)
}
#[tauri::command]
fn reader_session_recent(window:tauri::WebviewWindow,state:State<'_,ReaderOpenState>)->Result<Vec<reader_session::RecentRow>,String>{
    reader_window(&window)?;
    let _lock=state.session_lock.lock().map_err(|_|"Reader session lock unavailable")?;
    Ok(reader_session::recent_rows(&reader_session::read(&reader_session_root(&window.app_handle())?)))
}
#[tauri::command]
fn reader_session_clear_recent(window:tauri::WebviewWindow,state:State<'_,ReaderOpenState>)->Result<(),String>{
    reader_window(&window)?;
    let _lock=state.session_lock.lock().map_err(|_|"Reader session lock unavailable")?;
    let root=reader_session_root(&window.app_handle())?;
    let mut store=reader_session::read(&root);
    store.recent.clear();
    reader_session::write(&root,&store)
}
#[tauri::command]
fn reader_session_open_recent(window:tauri::WebviewWindow,state:State<'_,ReaderOpenState>,index:usize)->Result<bool,String>{
    reader_window(&window)?;
    let path={
        let _lock=state.session_lock.lock().map_err(|_|"Reader session lock unavailable")?;
        let store=reader_session::read(&reader_session_root(&window.app_handle())?);
        store.recent.get(index).map(|entry|entry.0.clone()).ok_or("Recent file no longer exists in history")?
    };
    if !path.is_file(){return Err("Tệp PDF đã bị di chuyển hoặc xóa.".into());}
    let mut queue=state.queue.lock().map_err(|_|"Reader queue unavailable")?;
    queue.enqueue([path],Path::new("."));
    drop(queue);
    window.emit("reader-open-pending",()).map_err(|e|e.to_string())?;
    Ok(true)
}
#[tauri::command]
fn reader_session_restore(window:tauri::WebviewWindow,state:State<'_,ReaderOpenState>)->Result<(Vec<reader_session::View>,Option<String>,usize),String>{
    reader_window(&window)?;
    let store={
        let _lock=state.session_lock.lock().map_err(|_|"Reader session lock unavailable")?;
        reader_session::read(&reader_session_root(&window.app_handle())?)
    };
    let mut queue=state.queue.lock().map_err(|_|"Reader queue unavailable")?;
    let mut restores=Vec::new();
    let mut missing=0;
    for tab in store.tabs.into_iter().take(reader_session::MAX_TABS){
        if tab.path.is_file(){
            queue.enqueue([tab.path.clone()],Path::new("."));
            restores.push((reader_session::source_key(&tab.path),tab.page,tab.scale,tab.left,tab.top));
        }else{missing+=1;}
    }
    drop(queue);
    let active=store.active.map(|p|reader_session::source_key(&p));
    Ok((restores,active,missing))
}

#[tauri::command]
async fn reader_choose_files(window: tauri::WebviewWindow, state: State<'_, ReaderOpenState>, language: Option<String>) -> Result<bool, String> {
    reader_window(&window)?;
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStringExt;
        use windows_sys::Win32::UI::Controls::Dialogs::{GetOpenFileNameW, CommDlgExtendedError, OPENFILENAMEW, OFN_ALLOWMULTISELECT, OFN_EXPLORER, OFN_FILEMUSTEXIST, OFN_PATHMUSTEXIST, OFN_NOCHANGEDIR};
        let mut file = vec![0u16; 65536];
        let filter: Vec<u16> = "PDF document\0*.pdf\0\0".encode_utf16().collect();
        let title: Vec<u16> = if language.as_deref() == Some("en") { "sReader PDF — Open PDF\0" } else { "sReader PDF — Mở PDF\0" }.encode_utf16().collect();
        let mut dialog: OPENFILENAMEW = unsafe { std::mem::zeroed() };
        dialog.lStructSize = std::mem::size_of::<OPENFILENAMEW>() as u32;
        dialog.hwndOwner = window.hwnd().map_err(|e| e.to_string())?.0;
        dialog.lpstrFilter = filter.as_ptr(); dialog.lpstrFile = file.as_mut_ptr(); dialog.nMaxFile = file.len() as u32;
        dialog.lpstrTitle = title.as_ptr();
        dialog.Flags = OFN_ALLOWMULTISELECT | OFN_EXPLORER | OFN_FILEMUSTEXIST | OFN_PATHMUSTEXIST | OFN_NOCHANGEDIR;
        if unsafe { GetOpenFileNameW(&mut dialog) } == 0 {
            let error = unsafe { CommDlgExtendedError() };
            return if error == 0 { Ok(false) } else { Err(format!("Open PDF dialog failed: {error}")) };
        }
        let parts: Vec<OsString> = file.split(|x| *x == 0).take_while(|part| !part.is_empty()).map(OsString::from_wide).collect();
        let paths = if parts.len() == 1 { vec![PathBuf::from(&parts[0])] }
            else { parts.iter().skip(1).map(|name| PathBuf::from(&parts[0]).join(name)).collect() };
        state.queue.lock().map_err(|_| "Reader queue unavailable")?.enqueue(paths, Path::new(""));
        window.emit("reader-open-pending", ()).map_err(|e| e.to_string())?;
        Ok(true)
    }
    #[cfg(not(windows))]
    { let _ = (state,language); Err("Native PDF selection is available on Windows".into()) }
}
// Windows fonts remain on the owner's machine: NEVER ship Microsoft's font files.
// Only these fixed names can be read; the request cannot supply a path.
#[cfg(windows)]
const READER_FONT_ALLOWLIST: &[(&str, &str)] = &[
    ("win-arial", "arial.ttf"),
    ("win-times", "times.ttf"),
    ("win-calibri", "calibri.ttf"),
    ("win-tahoma", "tahoma.ttf"),
    ("win-verdana", "verdana.ttf"),
    ("win-georgia", "georgia.ttf"),
    ("win-segoe", "segoeui.ttf"),
    ("win-consolas", "consola.ttf"),
    ("win-courier", "cour.ttf"),
    ("win-trebuchet", "trebuc.ttf"),
    ("win-candara", "candara.ttf"),
    ("win-corbel", "corbel.ttf"),
    ("win-constantia", "constan.ttf"),
];

// Honour OS/2 fsType rights. The PDF uses subset fonts, so reject restricted,
// preview/print-only, no-subsetting and bitmap-only fonts rather than copy them.
#[cfg(windows)]
fn reader_font_bytes_impl(id: &str) -> Result<Vec<u8>, String> {
    let filename = READER_FONT_ALLOWLIST.iter().find(|(key, _)| *key == id)
        .map(|(_, filename)| *filename).ok_or("Font Windows không được hỗ trợ")?;
    let system = std::env::var_os("SystemRoot").ok_or("Không tìm thấy Windows")?;
    let path = PathBuf::from(system).join("Fonts").join(filename);
    let size = fs::metadata(&path).map_err(|_| "Font chưa được cài trên Windows")?.len();
    if !(128..=12 * 1024 * 1024).contains(&size) {
        return Err("Font Windows có kích thước không hợp lệ".into());
    }
    let bytes = fs::read(&path).map_err(|_| "Không đọc được font Windows")?;
    if !(bytes.starts_with(&[0, 1, 0, 0]) || bytes.starts_with(b"OTTO")) || bytes.len() < 12 {
        return Err("Font không phải tệp OpenType/TrueType đơn".into());
    }
    let tables = u16::from_be_bytes([bytes[4], bytes[5]]) as usize;
    let mut permitted = false;
    for index in 0..tables {
        let start = 12usize.checked_add(index * 16).ok_or("Font table error")?;
        if start + 16 > bytes.len() { return Err("Font table truncated".into()); }
        if &bytes[start..start + 4] == b"OS/2" {
            let offset = u32::from_be_bytes(bytes[start + 8..start + 12].try_into().unwrap()) as usize;
            if offset.checked_add(10).is_none_or(|end| end > bytes.len()) {
                return Err("Font OS/2 table truncated".into());
            }
            let flags = u16::from_be_bytes([bytes[offset + 8], bytes[offset + 9]]);
            // 0 = installable; 0x0008 = editable. Other modes are unsuitable.
            permitted = (flags & (0x0002 | 0x0004 | 0x0100 | 0x0200)) == 0;
            break;
        }
    }
    if !permitted { return Err("Font Windows không cho phép nhúng để chỉnh sửa PDF".into()); }
    Ok(bytes)
}

#[tauri::command]
fn reader_windows_fonts(window: tauri::WebviewWindow) -> Result<Vec<String>, String> {
    reader_window(&window)?;
    #[cfg(windows)]
    { return Ok(READER_FONT_ALLOWLIST.iter().filter(|(key, _)| reader_font_bytes_impl(key).is_ok())
        .map(|(key, _)| (*key).to_owned()).collect()); }
    #[cfg(not(windows))]
    { Ok(Vec::new()) }
}

#[tauri::command]
fn reader_windows_font(window: tauri::WebviewWindow, id: String) -> Result<Vec<u8>, String> {
    reader_window(&window)?;
    #[cfg(windows)]
    { reader_font_bytes_impl(&id) }
    #[cfg(not(windows))]
    { let _ = id; Err("Font Windows chỉ có trên máy Windows".into()) }
}

// Reader About links must be opened in the user's DEFAULT Windows browser
// (not as a blocked target=_blank popup inside the WebView).
// No shell command/argument parsing and no arbitrary URL input.
#[cfg(windows)]
#[link(name = "shell32")]
extern "system" {
    fn ShellExecuteW(
        hwnd: *mut std::ffi::c_void,
        lpoperation: *const u16,
        lpfile: *const u16,
        lpparameters: *const u16,
        lpdirectory: *const u16,
        nshowcmd: i32,
    ) -> *mut std::ffi::c_void;
}

fn reader_about_target(kind: &str) -> Option<&'static str> {
    match kind {
        "website" => Some("https://www.youtube.com/@SolYan-Music"),
        "email" => Some("mailto:yansign841@gmail.com"),
        "pdf-default-settings" => Some("ms-settings:defaultapps?registeredAppUser=sReader%20PDF"),
        _ => None,
    }
}

#[tauri::command]
fn reader_open_external(window: tauri::WebviewWindow, kind: String) -> Result<(), String> {
    reader_window(&window)?;
    if !cfg!(feature = "reader-only") {
        return Err("Chỉ ứng dụng sReader được mở liên kết ngoài".into());
    }
    let target = reader_about_target(&kind).ok_or("Liên kết không được hỗ trợ")?;
    #[cfg(windows)]
    {
        let operation: Vec<u16> = "open".encode_utf16().chain(std::iter::once(0)).collect();
        let address: Vec<u16> = target.encode_utf16().chain(std::iter::once(0)).collect();
        let result = unsafe {
            ShellExecuteW(
                std::ptr::null_mut(),
                operation.as_ptr(),
                address.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                1,
            )
        };
        if (result as isize) <= 32 {
            return Err(format!("Windows không mở được liên kết ({})", result as isize));
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = target;
        Err("Liên kết này cần trình duyệt mặc định của Windows".into())
    }
}

// Read the EFFECTIVE per-user Windows .pdf "open" association, not a
// hardcoded ProgID or an installer-created association registry entry.
#[cfg(windows)]
#[link(name = "Shlwapi")]
extern "system" {
    fn AssocQueryStringW(
        flags: u32, kind: u32, association: *const u16, verb: *const u16,
        output: *mut u16, output_chars: *mut u32,
    ) -> i32;
}

#[cfg(windows)]
fn reader_default_pdf_executable() -> Result<PathBuf, String> {
    let association: Vec<u16> = ".pdf".encode_utf16().chain(std::iter::once(0)).collect();
    let verb: Vec<u16> = "open".encode_utf16().chain(std::iter::once(0)).collect();
    // ASSOCSTR_EXECUTABLE = 2. No user-controlled registry path or command.
    let mut buffer = vec![0u16; 32768];
    let mut count = buffer.len() as u32;
    let result = unsafe {
        AssocQueryStringW(0, 2, association.as_ptr(), verb.as_ptr(),
            buffer.as_mut_ptr(), &mut count)
    };
    if result != 0 { return Err(format!("Windows PDF association unavailable ({result})")); }
    let end = buffer.iter().position(|c| *c == 0).unwrap_or(count as usize);
    let executable = String::from_utf16(&buffer[..end])
        .map_err(|_| "Windows PDF association has invalid text")?;
    if executable.is_empty() { return Err("Windows PDF association has no executable".into()); }
    Ok(PathBuf::from(executable))
}

#[cfg(windows)]
fn reader_same_executable(a: &Path, b: &Path) -> bool {
    let left = fs::canonicalize(a).unwrap_or_else(|_| a.to_path_buf());
    let right = fs::canonicalize(b).unwrap_or_else(|_| b.to_path_buf());
    left.to_string_lossy().to_lowercase() == right.to_string_lossy().to_lowercase()
}

#[tauri::command]
fn reader_pdf_default_state(window: tauri::WebviewWindow) -> Result<&'static str, String> {
    reader_window(&window)?;
    if !cfg!(feature = "reader-only") { return Ok("unknown"); }
    #[cfg(windows)]
    {
        // Unknown is not "other": do not annoy people when Windows cannot
        // answer reliably. Never mutate UserChoice or the default association.
        let Ok(associated) = reader_default_pdf_executable() else { return Ok("unknown"); };
        let Ok(current) = std::env::current_exe() else { return Ok("unknown"); };
        return Ok(if reader_same_executable(&associated, &current) {
            "default"
        } else { "other" });
    }
    #[cfg(not(windows))]
    { Ok("unknown") }
}

fn reader_window(window: &tauri::WebviewWindow) -> Result<(), String> {
    let label = if cfg!(feature = "reader-only") { "main" } else { "reader" };
    if window.label() != label { return Err("Chỉ cửa sổ Reader được nhận tệp.".into()); }
    Ok(())
}
#[tauri::command]
fn reader_version(window: tauri::WebviewWindow) -> Result<String, String> {
    reader_window(&window)?;
    Ok(env!("CARGO_PKG_VERSION").into())
}
#[tauri::command]
fn reader_window_control(window: tauri::WebviewWindow, action: String) -> Result<bool, String> {
    reader_window(&window)?;
    if !cfg!(feature = "reader-only") { return Ok(false); }
    match action.as_str() {
        "available" => return Ok(true),
        "fullscreen-state" => return window.is_fullscreen().map_err(|e| e.to_string()),
        "presentation-enter" => { reader_window_state::capture(&window); let previous = window.is_fullscreen().map_err(|e| e.to_string())?; window.set_fullscreen(true).map_err(|e| e.to_string())?; return Ok(previous); },
        "presentation-leave" => { window.set_fullscreen(false).map_err(|e|e.to_string())?; return Ok(true); },
        "minimize" => window.minimize(),
        "maximize" => if window.is_maximized().map_err(|e| e.to_string())? { window.unmaximize() } else { window.maximize() },
        "drag" => window.start_dragging(),
        "close" => window.close(),
        _ => return Err("Unknown Reader window action".into()),
    }.map_err(|e| e.to_string())?;
    Ok(true)
}
#[tauri::command]
fn reader_next_open_request(window: tauri::WebviewWindow, state: State<'_, ReaderOpenState>) -> Result<Option<reader_open::Ticket>, String> {
    reader_window(&window)?;
    let request = state.queue.lock().map_err(|_| "Reader queue unavailable")?.next();
    Ok(request)
}
#[tauri::command]
async fn reader_read_open_request(window: tauri::WebviewWindow, state: State<'_, ReaderOpenState>, ticket: String) -> Result<Vec<u8>, String> {
    reader_window(&window)?;
    let path = state.queue.lock().map_err(|_| "Reader queue unavailable")?.take(&ticket)?;
    let bytes=reader_open::read_pdf(&path)?;
    if let Ok(root)=handoff_root(&window.app_handle()){document_handoff::consume_reader_copy(&root,&path);}
    Ok(bytes)
}
#[tauri::command]
fn reader_discard_open_request(window: tauri::WebviewWindow, state: State<'_, ReaderOpenState>, ticket: String) -> Result<(), String> {
    reader_window(&window)?;
    state.queue.lock().map_err(|_| "Reader queue unavailable")?.take(&ticket)?;
    Ok(())
}

#[tauri::command]
async fn desktop_switch_tools(app: tauri::AppHandle, bytes: Option<Vec<u8>>, name: Option<String>) -> Result<(), String> {
    let external=if cfg!(feature="reader-only"){let base=app.path().local_data_dir().map_err(|e|e.to_string())?;Some([base.join("sTool PDF").join("solyan-pdf-desktop.exe"),base.join("SolYan PDF").join("solyan-pdf-desktop.exe")].into_iter().find(|p|p.is_file()).ok_or("Chưa cài sTool PDF")?)}else{None};
    let transfer=if let Some(bytes)=bytes {let token=random_token();document_handoff::create(&handoff_root(&app)?,&token,&bytes,name.as_deref().unwrap_or("document.pdf"))?;Some(token)}else{None};
    if !cfg!(feature = "reader-only") {
        if let Some(token)=transfer.as_ref(){let window=tauri::WebviewWindowBuilder::new(&app,format!("tools-handoff-{token}"),tauri::WebviewUrl::App("handoff.html".into())).title("sTool PDF").inner_size(1440.0,920.0).build().map_err(|e|e.to_string())?;let url=window.url().map_err(|e|e.to_string())?.join(&format!("handoff.html?native={token}")).map_err(|e|e.to_string())?;window.navigate(url).map_err(|e|e.to_string())?;return window.set_focus().map_err(|e|e.to_string());}
        if let Some(window) = app.get_webview_window("main") { if let Some(token)=transfer.as_ref(){let url=window.url().map_err(|e|e.to_string())?.join(&format!("handoff.html?native={token}")).map_err(|e|e.to_string())?;window.navigate(url).map_err(|e|e.to_string())?;}return window.set_focus().map_err(|e| e.to_string()); }
        return tauri::WebviewWindowBuilder::new(&app, "main", tauri::WebviewUrl::App("index.html".into()))
            .title("sTool PDF").inner_size(1440.0, 920.0).build().map(|_| ()).map_err(|e| e.to_string());
    }
    let path = external.ok_or("Tools executable unavailable")?;
    let mut command = Command::new(path);
    if let Some(token)=transfer.as_ref(){command.args(["--solyan-handoff",token]);}
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    command.spawn().map_err(|e|e.to_string())?;
    if let Some(token)=transfer {let folder=handoff_root(&app)?.join(token);tauri::async_runtime::spawn_blocking(move||{for _ in 0..150 {if !folder.exists(){return Ok(());}thread::sleep(Duration::from_millis(100));}Err("sTool chưa nhận PDF; hãy cài hai ứng dụng cùng phiên bản rồi thử lại".to_string())}).await.map_err(|e|e.to_string())??;}
    Ok(())
}

fn handoff_root(app:&tauri::AppHandle)->Result<PathBuf,String>{Ok(app.path().local_data_dir().map_err(|e|e.to_string())?.join("SolYan-PDF-Transfer"))}
#[tauri::command]
fn desktop_take_handoff(app:tauri::AppHandle,window:tauri::WebviewWindow,token:String)->Result<(String,Vec<u8>),String>{if cfg!(feature="reader-only")||(window.label()!="main"&&!window.label().starts_with("tools-handoff-")){return Err("Tools inbox only".into());}document_handoff::take(&handoff_root(&app)?,&token)}

fn main() {
    let mut requests = reader_open::OpenQueue::default();
    requests.enqueue(std::env::args_os().skip(1).map(PathBuf::from), &std::env::current_dir().unwrap_or_default());
    let builder = tauri::Builder::default().manage(ReaderOpenState { queue: Mutex::new(requests), outputs: Mutex::new(std::collections::HashMap::new()), session_lock: Mutex::new(()) });
    // First plugin, Reader only. Its mutex is scoped by vn.solyan.pdf.reader.
    #[cfg(all(windows, feature = "reader-only"))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
        let state = app.state::<ReaderOpenState>();
        if let Ok(mut queue) = state.queue.lock() {
            queue.enqueue(args.into_iter().skip(1).map(PathBuf::from), Path::new(&cwd));
        }
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.show();
            let _ = window.set_focus();
            let _ = window.emit("reader-open-pending", ());
        }
    }));
    #[cfg(all(windows,feature="reader-only"))]
    let builder=builder.plugin(tauri_plugin_window_state::Builder::default().with_state_flags(reader_window_state::flags()).build());
    let app = builder
        .on_window_event(|window, event| {
            #[cfg(all(windows, feature = "reader-only"))]
            if window.label() == "main" {
                if let Some(view)=window.app_handle().get_webview_window("main") {
                    match event {
                        tauri::WindowEvent::CloseRequested { .. } => reader_window_state::save(&view),

                        _ => {}
                    }
                }
                if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                    let state = window.state::<ReaderOpenState>();
                    if let Ok(mut queue) = state.queue.lock() {
                        queue.enqueue(paths.iter().cloned(), &std::env::current_dir().unwrap_or_default());
                    }
                    let _ = window.emit("reader-open-pending", ());
                }
            }
        })

        .manage(CoreState::default())
        .setup(|app| {
            if let Ok(root)=handoff_root(app.handle()){document_handoff::cleanup(&root);}
            if cfg!(feature = "reader-only") {
                let config=app.config().app.windows[0].clone();
                let window=tauri::WebviewWindowBuilder::from_config(app,&config)?
                    .on_navigation(reader_links::navigation_allowed)
                    .on_new_window(|_,_|tauri::webview::NewWindowResponse::Deny)
                    .build()?;
                reader_window_state::fit_to_work_area(&window);
                return Ok(());
            }
            let args:Vec<_>=std::env::args().collect();if let Some(index)=args.iter().position(|a|a=="--solyan-handoff"){if let Some(token)=args.get(index+1){if token.len()==64&&token.bytes().all(|c|c.is_ascii_hexdigit()){if let Some(window)=app.get_webview_window("main"){let url=window.url()?.join(&format!("handoff.html?native={token}"))?;window.navigate(url)?;}}}}
            let state = app.state::<CoreState>();
            match start_office(app.handle()) {
                Ok((mut office_process, office_endpoint)) => {
                    match start_ocr(app.handle()) {
                        Ok((mut ocr_process, ocr_endpoint, ocr_token)) => {
                            match start_sign(app.handle()) {
                                Ok((mut sign_process, sign_endpoint, sign_token)) => {
                                    match start_archive(app.handle()) {
                                        Ok((mut archive_process, archive_endpoint, archive_token)) => {
                                            match start_core(app.handle(), &office_endpoint, &ocr_endpoint, &ocr_token, &sign_endpoint, &sign_token, &archive_endpoint, &archive_token) {
                                                Ok((core_process, session)) => {
                                                    *state.office_process.lock().map_err(|_| "office process state poisoned")? = Some(office_process);
                                                    *state.ocr_process.lock().map_err(|_| "ocr process state poisoned")? = Some(ocr_process);
                                                    *state.sign_process.lock().map_err(|_| "sign process state poisoned")? = Some(sign_process);
                                                    *state.archive_process.lock().map_err(|_| "archive process state poisoned")? = Some(archive_process);
                                                    *state.process.lock().map_err(|_| "core process state poisoned")? = Some(core_process);
                                                    *state.session.lock().map_err(|_| "core session state poisoned")? = Some(session);
                                                }
                                                Err(error) => {
                                                    let _ = archive_process.child.kill();
                                                    let _ = archive_process.child.wait();
                                                    let _ = sign_process.child.kill();
                                                    let _ = sign_process.child.wait();
                                                    let _ = ocr_process.child.kill();
                                                    let _ = ocr_process.child.wait();
                                                    let _ = office_process.child.kill();
                                                    let _ = office_process.child.wait();
                                                    *state.startup_error.lock().map_err(|_| "core error state poisoned")? = Some(error);
                                                }
                                            }
                                        }
                                        Err(error) => {
                                            let _ = sign_process.child.kill();
                                            let _ = sign_process.child.wait();
                                            let _ = ocr_process.child.kill();
                                            let _ = ocr_process.child.wait();
                                            let _ = office_process.child.kill();
                                            let _ = office_process.child.wait();
                                            *state.startup_error.lock().map_err(|_| "archive error state poisoned")? = Some(error);
                                        }
                                    }
                                }
                                Err(error) => {
                                    let _ = ocr_process.child.kill();
                                    let _ = ocr_process.child.wait();
                                    let _ = office_process.child.kill();
                                    let _ = office_process.child.wait();
                                    *state.startup_error.lock().map_err(|_| "sign error state poisoned")? = Some(error);
                                }
                            }
                        }
                        Err(error) => {
                            let _ = office_process.child.kill();
                            let _ = office_process.child.wait();
                            *state.startup_error.lock().map_err(|_| "ocr error state poisoned")? = Some(error);
                        }
                    }
                }
                Err(error) => {
                    *state.startup_error.lock().map_err(|_| "office error state poisoned")? = Some(error);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![desktop_core_session, desktop_take_handoff, desktop_open_reader, desktop_switch_tools, reader_save_as, reader_save, reader_choose_files, reader_next_open_request, reader_read_open_request, reader_discard_open_request, reader_session_save, reader_session_recent, reader_session_clear_recent, reader_session_open_recent, reader_session_restore, reader_window_control, reader_version, reader_windows_fonts, reader_windows_font, reader_open_external, reader_pdf_default_state, reader_links::reader_open_pdf_link])
        .build(tauri::generate_context!())
        .expect("error while building SolYan PDF Desktop");

    app.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit) {
            stop_core(app_handle);
            stop_ocr(app_handle);
            stop_sign(app_handle);
            stop_archive(app_handle);
            stop_office(app_handle);
        }
    });
}

#[cfg(test)]
mod reader_about_link_tests {
    use super::reader_about_target;
    #[test]
    fn only_about_links_may_be_launched_externally() {
        assert_eq!(reader_about_target("website"), Some("https://www.youtube.com/@SolYan-Music"));
        assert_eq!(reader_about_target("email"), Some("mailto:yansign841@gmail.com"));
        assert_eq!(reader_about_target("pdf-default-settings"), Some("ms-settings:defaultapps?registeredAppUser=sReader%20PDF"));
        for untrusted in ["https://example.com", "javascript:alert(1)", "file:///C:/Windows/win.ini", "", "Website"] {
            assert_eq!(reader_about_target(untrusted), None);
        }
    }
}
