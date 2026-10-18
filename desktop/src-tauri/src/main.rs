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
async fn desktop_open_reader(app: tauri::AppHandle) -> Result<(), String> {
    let installed = app.path().local_data_dir().map_err(|e| e.to_string())?.join("sReader PDF").join("solyan-pdf-reader.exe");
    if installed.is_file() {
        let mut command = Command::new(installed);
        #[cfg(windows)]
        command.creation_flags(0x08000000);
        return command.spawn().map(|_| ()).map_err(|e| e.to_string());
    }
    if let Some(window) = app.get_webview_window("reader") {
        return window.set_focus().map_err(|e| e.to_string());
    }
    tauri::WebviewWindowBuilder::new(&app, "reader", tauri::WebviewUrl::App("reader.html".into()))
        .title("sReader PDF").inner_size(1440.0, 920.0).disable_drag_drop_handler().build().map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
async fn reader_save_as(window: tauri::WebviewWindow, bytes: Vec<u8>, name: String) -> Result<Option<String>, String> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::Controls::Dialogs::{GetSaveFileNameW, CommDlgExtendedError, OPENFILENAMEW, OFN_OVERWRITEPROMPT, OFN_PATHMUSTEXIST, OFN_NOCHANGEDIR};
        use windows_sys::Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH};
        if bytes.len() > 250 * 1024 * 1024 || !bytes.starts_with(b"%PDF-") { return Err("Invalid or oversized PDF output".into()); }
        let safe_name: String = name.chars().filter(|c| !"<>:\"/\\|?*".contains(*c) && !c.is_control()).take(180).collect();
        let mut file = vec![0u16; 32768];
        let initial: Vec<u16> = safe_name.encode_utf16().collect();
        file[..initial.len()].copy_from_slice(&initial);
        let filter: Vec<u16> = "PDF document\0*.pdf\0\0".encode_utf16().collect();
        let extension: Vec<u16> = "pdf\0".encode_utf16().collect();
        let title: Vec<u16> = "SolYan Reader — Lưu thành\0".encode_utf16().collect();
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
        Ok(Some(path.to_string_lossy().to_string()))
    }
    #[cfg(not(windows))]
    { let _ = (window, bytes, name); Err("Native Save As is available on Windows".into()) }
}

#[tauri::command]
async fn reader_initial_file() -> Result<Option<(String, Vec<u8>)>, String> {
    // Only the file supplied by Windows at launch; this command accepts no path
    // from web content and does not expose arbitrary filesystem access.
    let path = match std::env::args_os().skip(1).map(PathBuf::from).find(|path| path.extension().map(|e| e.to_string_lossy().eq_ignore_ascii_case("pdf")).unwrap_or(false)) {
        Some(path) => path, None => return Ok(None),
    };
    if fs::metadata(&path).map_err(|e| e.to_string())?.len() > 200 * 1024 * 1024 { return Err("Reader R1 PDF size limit is 200 MB".into()); }
    let name = path.file_name().ok_or("Missing PDF filename")?.to_string_lossy().to_string();
    fs::read(path).map(|bytes| Some((name, bytes))).map_err(|e| e.to_string())
}

#[tauri::command]
async fn desktop_switch_tools(app: tauri::AppHandle) -> Result<(), String> {
    if !cfg!(feature = "reader-only") {
        if let Some(window) = app.get_webview_window("main") { return window.set_focus().map_err(|e| e.to_string()); }
        return tauri::WebviewWindowBuilder::new(&app, "main", tauri::WebviewUrl::App("index.html".into()))
            .title("sTool PDF").inner_size(1440.0, 920.0).build().map(|_| ()).map_err(|e| e.to_string());
    }
    let base = app.path().local_data_dir().map_err(|e| e.to_string())?;
    let path = [base.join("sTool PDF").join("solyan-pdf-desktop.exe"), base.join("SolYan PDF").join("solyan-pdf-desktop.exe")].into_iter().find(|p| p.is_file()).ok_or("Chưa cài sTool PDF")?;
    let mut command = Command::new(path);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    command.spawn().map(|_| ()).map_err(|e| e.to_string())
}

fn main() {
    let app = tauri::Builder::default()
        .manage(CoreState::default())
        .setup(|app| {
            if cfg!(feature = "reader-only") { return Ok(()); }
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
        .invoke_handler(tauri::generate_handler![desktop_core_session, desktop_open_reader, desktop_switch_tools, reader_save_as, reader_initial_file])
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
