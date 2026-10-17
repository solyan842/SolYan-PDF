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

#[derive(Default)]
struct CoreState {
    process: Mutex<Option<CoreProcess>>,
    office_process: Mutex<Option<OfficeProcess>>,
    ocr_process: Mutex<Option<OcrProcess>>,
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

fn wait_for_ocr_health(port: u16) -> Result<(), String> {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    for _ in 0..180 {
        if let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(500)) {
            let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
            let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
            let request = format!(
                "GET /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n"
            );
            if stream.write_all(request.as_bytes()).is_ok() {
                let mut response = String::new();
                if stream.read_to_string(&mut response).is_ok()
                    && response.contains(" 200 ")
                    && response.contains("\"status\":\"ok\"")
                    && response.contains("\"models_loaded\"")
                {
                    return Ok(());
                }
            }
        }
        thread::sleep(Duration::from_millis(500));
    }
    Err("local OCR sidecar did not reach health in time".to_string())
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

fn start_ocr(app: &tauri::AppHandle) -> Result<(OcrProcess, String), String> {
    let ocr_exe = app
        .path()
        .resolve("ocr/solyan-ocr.exe", BaseDirectory::Resource)
        .map_err(|error| format!("could not resolve local OCR sidecar: {error}"))?;
    let tesseract_root = app
        .path()
        .resolve("ocr/tesseract", BaseDirectory::Resource)
        .map_err(|error| format!("could not resolve Tesseract resource: {error}"))?;
    let cache_root = app
        .path()
        .resolve("ocr/paddlex-cache", BaseDirectory::Resource)
        .map_err(|error| format!("could not resolve PaddleX cache: {error}"))?;
    if !ocr_exe.is_file() {
        return Err(format!("local OCR sidecar missing: {}", ocr_exe.display()));
    }
    let tesseract_exe = find_file(&tesseract_root, "tesseract.exe")
        .ok_or_else(|| format!("Tesseract binary missing under {}", tesseract_root.display()))?;
    let tessdata = tesseract_root.join("tessdata");
    for language in ["vie", "eng", "osd"] {
        if !tessdata.join(format!("{language}.traineddata")).is_file() {
            return Err(format!("Tesseract {language} traineddata missing"));
        }
    }
    let official = cache_root.join("official_models");
    for model in [
        "PP-LCNet_x1_0_doc_ori",
        "UVDoc",
        "PP-LCNet_x1_0_textline_ori",
        "PP-OCRv6_medium_det",
        "PP-OCRv6_medium_rec",
    ] {
        if !official.join(model).is_dir() {
            return Err(format!("offline OCR model missing: {model}"));
        }
    }
    let tesseract_bin = tesseract_exe
        .parent()
        .ok_or_else(|| "Tesseract binary directory could not be resolved".to_string())?;
    let port = free_loopback_port()?;
    let mut command = Command::new(&ocr_exe);
    command
        .arg("--port")
        .arg(port.to_string())
        .env("PATH", prepend_paths(&[tesseract_bin])?)
        .env("SOLYAN_TESSERACT_BINARY", &tesseract_exe)
        .env("TESSDATA_PREFIX", &tessdata)
        .env("TESSERACT_LANG", "vie+eng")
        .env("OCR_LANG", "vi")
        .env("PADDLE_PDX_CACHE_HOME", &cache_root)
        .env("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
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
    if let Err(error) = wait_for_ocr_health(port) {
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
    ))
}

fn start_core(app: &tauri::AppHandle, office_endpoint: &str, ocr_endpoint: &str) -> Result<(CoreProcess, CoreSession), String> {
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

fn start_services(app: &tauri::AppHandle) -> Result<(OfficeProcess, OcrProcess, CoreProcess, CoreSession), String> {
    let (mut office, office_endpoint) = start_office(app)?;
    let (mut ocr, ocr_endpoint) = match start_ocr(app) {
        Ok(result) => result,
        Err(error) => {
            let _ = office.child.kill();
            let _ = office.child.wait();
            return Err(error);
        }
    };
    match start_core(app, &office_endpoint, &ocr_endpoint) {
        Ok((core, session)) => Ok((office, ocr, core, session)),
        Err(error) => {
            let _ = ocr.child.kill();
            let _ = ocr.child.wait();
            let _ = office.child.kill();
            let _ = office.child.wait();
            Err(error)
        }
    }
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

fn stop_core(app: &tauri::AppHandle) {
    let state = app.state::<CoreState>();
    if let Ok(mut process) = state.process.lock() {
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

fn main() {
    let app = tauri::Builder::default()
        .manage(CoreState::default())
        .setup(|app| {
            let state = app.state::<CoreState>();
            match start_services(app.handle()) {
                Ok((office, ocr, core, session)) => {
                    *state.office_process.lock().map_err(|_| "office state poisoned")? = Some(office);
                    *state.ocr_process.lock().map_err(|_| "OCR state poisoned")? = Some(ocr);
                    *state.process.lock().map_err(|_| "core state poisoned")? = Some(core);
                    *state.session.lock().map_err(|_| "session state poisoned")? = Some(session);
                }
                Err(error) => {
                    *state.startup_error.lock().map_err(|_| "startup state poisoned")? = Some(error);
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
            stop_ocr(app_handle);
            stop_office(app_handle);
        }
    });
}
