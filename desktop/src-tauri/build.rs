use std::{env, fs, path::Path};

fn main() {
    // Preserve the supplied approved artwork byte-for-byte. The two builds have
    // separate bundle identities, resources and Windows shortcut icons.
    let source = if env::var_os("CARGO_FEATURE_READER_ONLY").is_some() {
        "../branding/sReader_PDF/app.ico"
    } else {
        "../branding/sTool_PDF/app.ico"
    };
    fs::create_dir_all("icons").expect("create icon staging directory");
    fs::copy(source, Path::new("icons/icon.ico")).expect("stage approved Windows icon");
    println!("cargo:rerun-if-changed=../branding/sReader_PDF/app.ico");
    println!("cargo:rerun-if-changed=../branding/sTool_PDF/app.ico");
    println!("cargo:rerun-if-env-changed=CARGO_FEATURE_READER_ONLY");
    tauri_build::build()
}
