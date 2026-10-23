//! Native output destination selection, source preservation and atomic writing.
//! No sidecar, model, renderer-supplied absolute path or eager file write.
use std::path::{Path,PathBuf};
use std::{collections::HashMap,sync::Mutex,io::{Read,Write}};
use sha2::{Digest,Sha256};

#[derive(Default)]pub struct OutputState(pub Mutex<HashMap<String,PathBuf>>);

fn protect_source(path:&Path,hashes:&[String])->Result<(),String>{
    if hashes.iter().any(|s|s.len()!=64||!s.bytes().all(|b|b.is_ascii_hexdigit())){return Err("Invalid source fingerprint".into());}
    if !path.exists(){return Ok(());}
    let mut file=std::fs::File::open(path).map_err(|e|e.to_string())?;
    let mut hash=Sha256::new();let mut buffer=[0u8;65536];
    loop{let n=file.read(&mut buffer).map_err(|e|e.to_string())?;if n==0{break;}hash.update(&buffer[..n]);}
    let digest=format!("{:x}",hash.finalize());
    if hashes.iter().any(|s|s.eq_ignore_ascii_case(&digest)){return Err("PDF nguồn được bảo vệ. Hãy chọn tên hoặc thư mục khác.".into());}
    Ok(())
}

fn write_output(path:&Path,bytes:&[u8],hashes:&[String])->Result<(),String>{
    if bytes.is_empty()||bytes.len()>250*1024*1024{return Err("Invalid or oversized output".into());}
    protect_source(path,hashes)?;
    let temporary=path.with_file_name(format!(".solyan-{}.tmp",crate::random_token()));
    let result=(||{
        let mut file=std::fs::OpenOptions::new().write(true).create_new(true).open(&temporary).map_err(|e|e.to_string())?;
        file.write_all(bytes).and_then(|_|file.sync_all()).map_err(|e|e.to_string())?;drop(file);
        // Recheck immediately before replacing an existing output.
        protect_source(path,hashes)?;
        #[cfg(windows)]{
            use std::os::windows::ffi::OsStrExt;
            use windows_sys::Win32::Storage::FileSystem::{MoveFileExW,MOVEFILE_REPLACE_EXISTING,MOVEFILE_WRITE_THROUGH};
            let from:Vec<u16>=temporary.as_os_str().encode_wide().chain(Some(0)).collect();
            let to:Vec<u16>=path.as_os_str().encode_wide().chain(Some(0)).collect();
            if unsafe{MoveFileExW(from.as_ptr(),to.as_ptr(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH)}==0{return Err(std::io::Error::last_os_error().to_string());}
        }
        #[cfg(not(windows))]std::fs::rename(&temporary,path).map_err(|e|e.to_string())?;
        Ok(())
    })();
    if result.is_err(){let _=std::fs::remove_file(&temporary);}result
}

#[tauri::command]
pub async fn stool_save_output(window:tauri::WebviewWindow,state:tauri::State<'_,OutputState>,bytes:Vec<u8>,name:String,id:String,save_as:bool,source_hashes:Vec<String>)->Result<Option<String>,String>{
    if window.label()!="main"||id.is_empty()||id.len()>128||bytes.is_empty()||bytes.len()>250*1024*1024||source_hashes.len()>1024{return Err("Invalid output request".into());}
    let mut outputs=state.0.try_lock().map_err(|_|"Một hộp thoại lưu khác đang mở. Hãy hoàn tất trước.")?;
    if outputs.len()>=256&&!outputs.contains_key(&id){return Err("Output limit reached; reopen the tool".into());}
    save_selected(&mut outputs,&id,&bytes,save_as,&source_hashes,||{
        #[cfg(windows)]{choose(window.hwnd().map_err(|e|e.to_string())?.0,Path::new(&name))}
        #[cfg(not(windows))]{let _=name;Err("Native saving requires Windows".into())}
    })
}

fn save_selected(outputs:&mut HashMap<String,PathBuf>,id:&str,bytes:&[u8],save_as:bool,source_hashes:&[String],chooser:impl FnOnce()->Result<Option<PathBuf>,String>)->Result<Option<String>,String>{
    let existing=if save_as{None}else{outputs.get(id).cloned()};
    let path=if let Some(path)=existing{path}else{let Some(path)=chooser()?else{return Ok(None);};path};
    write_output(&path,&bytes,&source_hashes)?;
    outputs.insert(id.into(),path.clone());Ok(Some(path.to_string_lossy().into_owned()))
}

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
    #[test]fn atomic_save_preserves_source_and_replaces_only_selected_output(){
        let root=std::env::temp_dir().join(format!("stool-save-{}",crate::random_token()));std::fs::create_dir(&root).unwrap();
        let source=root.join("source.pdf");let output=root.join("output.pdf");let original=b"%PDF-public-source";
        std::fs::write(&source,original).unwrap();let hashes=vec![format!("{:x}",Sha256::digest(original))];
        assert!(write_output(&source,b"replacement",&hashes).is_err());assert_eq!(std::fs::read(&source).unwrap(),original);
        write_output(&output,b"%PDF-first",&hashes).unwrap();write_output(&output,b"%PDF-second",&hashes).unwrap();
        assert_eq!(std::fs::read(&output).unwrap(),b"%PDF-second");
        assert!(write_output(&output,b"",&hashes).is_err());assert_eq!(std::fs::read(&output).unwrap(),b"%PDF-second");
        assert_eq!(std::fs::read_dir(&root).unwrap().count(),2);std::fs::remove_dir_all(root).unwrap();
    }
    #[test]fn save_reuses_path_and_save_as_cancel_keeps_previous_destination(){
        let root=std::env::temp_dir().join(format!("stool-save-flow-{}",crate::random_token()));std::fs::create_dir(&root).unwrap();
        let first=root.join("chosen.pdf");let second=root.join("different.pdf");let mut outputs=HashMap::new();
        assert_eq!(save_selected(&mut outputs,"result",b"first",false,&[],||Ok(None)).unwrap(),None);
        assert!(outputs.is_empty());assert_eq!(std::fs::read_dir(&root).unwrap().count(),0);
        save_selected(&mut outputs,"result",b"first",false,&[],||Ok(Some(first.clone()))).unwrap();
        save_selected(&mut outputs,"result",b"second",false,&[],||panic!("Save must reuse chosen destination")).unwrap();
        assert_eq!(std::fs::read(&first).unwrap(),b"second");
        assert_eq!(save_selected(&mut outputs,"result",b"third",true,&[],||Ok(None)).unwrap(),None);
        assert_eq!(outputs.get("result"),Some(&first));assert_eq!(std::fs::read(&first).unwrap(),b"second");
        save_selected(&mut outputs,"result",b"third",true,&[],||Ok(Some(second.clone()))).unwrap();
        assert_eq!(outputs.get("result"),Some(&second));assert_eq!(std::fs::read(&second).unwrap(),b"third");
        assert_eq!(std::fs::read(&first).unwrap(),b"second");std::fs::remove_dir_all(root).unwrap();
    }
}
