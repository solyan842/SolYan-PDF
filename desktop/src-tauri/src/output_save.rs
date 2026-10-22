//! Native output destination selection; reuse WebView's existing download IO.
//! No sidecar, model, renderer-supplied absolute path or eager file write.
use std::path::{Path,PathBuf};

fn suggested_name(destination:&Path)->String{
    let name=destination.file_name().unwrap_or_default().to_string_lossy();
    let safe:String=name.chars().filter(|c|!c.is_control()&&!"<>:\"/\\|?*".contains(*c)).take(180).collect();
    let safe=safe.trim_matches([' ','.']);
    if safe.is_empty(){"solyan-output.pdf".into()}else{safe.into()}
}

#[cfg(windows)]
pub fn choose(owner:windows_sys::Win32::Foundation::HWND,destination:&Path)->Result<Option<PathBuf>,String>{
    use windows_sys::Win32::UI::Controls::Dialogs::{GetSaveFileNameW,CommDlgExtendedError,OPENFILENAMEW,OFN_OVERWRITEPROMPT,OFN_PATHMUSTEXIST,OFN_NOCHANGEDIR,OFN_EXPLORER};
    let name=suggested_name(destination);
    let mut file=vec![0u16;32768];let initial:Vec<u16>=name.encode_utf16().collect();file[..initial.len()].copy_from_slice(&initial);
    let extension=Path::new(&name).extension().and_then(|e|e.to_str()).unwrap_or("pdf");
    let filter:Vec<u16>=format!("Output (*.{extension})\0*.{extension}\0All files\0*.*\0\0").encode_utf16().collect();
    let extension:Vec<u16>=extension.encode_utf16().chain(Some(0)).collect();
    let title:Vec<u16>="sTool PDF — Lưu kết quả / Save output\0".encode_utf16().collect();
    let mut dialog:OPENFILENAMEW=unsafe{std::mem::zeroed()};
    dialog.lStructSize=std::mem::size_of::<OPENFILENAMEW>() as u32;dialog.hwndOwner=owner;
    dialog.lpstrFilter=filter.as_ptr();dialog.lpstrFile=file.as_mut_ptr();dialog.nMaxFile=file.len() as u32;
    dialog.lpstrDefExt=extension.as_ptr();dialog.lpstrTitle=title.as_ptr();
    dialog.Flags=OFN_OVERWRITEPROMPT|OFN_PATHMUSTEXIST|OFN_NOCHANGEDIR|OFN_EXPLORER;
    if unsafe{GetSaveFileNameW(&mut dialog)}==0{
        let error=unsafe{CommDlgExtendedError()};
        return if error==0{Ok(None)}else{Err(format!("Windows Save dialog failed: {error}"))};
    }
    let end=file.iter().position(|c|*c==0).ok_or("Invalid output path")?;
    use std::os::windows::ffi::OsStringExt;
    Ok(Some(PathBuf::from(std::ffi::OsString::from_wide(&file[..end]))))
}

#[cfg(test)]mod tests{
    use super::*;
    #[test]fn output_suggestion_uses_only_safe_leaf_and_keeps_format(){
        assert_eq!(suggested_name(Path::new("C:/input/nested/solyan-archive.pdf")),"solyan-archive.pdf");
        assert_eq!(suggested_name(Path::new("C:/output/tables.zip")),"tables.zip");
        assert_eq!(suggested_name(Path::new("C:/output/..")),"solyan-output.pdf");
        assert!(!suggested_name(Path::new("bad<>name.txt")).contains('<'));
    }
}
