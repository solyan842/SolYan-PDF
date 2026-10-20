//! Same-user, one-use local PDF exchange. No arbitrary JS filesystem paths.
use std::{fs,io::{Read,Write},path::{Path,PathBuf},time::{Duration,SystemTime}};
const MAX:u64=200*1024*1024;
fn valid(token:&str)->bool{token.len()==64&&token.bytes().all(|c|c.is_ascii_hexdigit())}
pub fn create(root:&Path,token:&str,bytes:&[u8],name:&str)->Result<PathBuf,String>{
    if !valid(token)||bytes.len() as u64>MAX||!bytes.starts_with(b"%PDF-"){return Err("Invalid PDF transfer".into());}
    fs::create_dir_all(root).map_err(|e|e.to_string())?;cleanup(root);
    let folder=root.join(token);fs::create_dir(&folder).map_err(|e|e.to_string())?;
    let clean:String=name.chars().filter(|c|!"<>:\"/\\|?*".contains(*c)&&!c.is_control()).take(100).collect();
    let stem=clean.trim().trim_end_matches('.');let name=if stem.to_lowercase().ends_with(".pdf"){format!("SolYan-{stem}")}else{format!("SolYan-{stem}.pdf")};
    let path=folder.join(name);let mut file=fs::OpenOptions::new().write(true).create_new(true).open(&path).map_err(|e|e.to_string())?;
    file.write_all(bytes).and_then(|_|file.sync_all()).map_err(|e|e.to_string())?;Ok(path)
}
pub fn take(root:&Path,token:&str)->Result<(String,Vec<u8>),String>{
    if !valid(token){return Err("Invalid transfer ticket".into());}
    let folder=root.join(token);let root=fs::canonicalize(root).map_err(|e|e.to_string())?;
    let resolved=fs::canonicalize(&folder).map_err(|e|e.to_string())?;
    if resolved.parent()!=Some(root.as_path()){return Err("Transfer outside inbox".into());}
    if fs::metadata(&resolved).and_then(|m|m.modified()).ok().and_then(|t|t.elapsed().ok()).unwrap_or(Duration::MAX)>Duration::from_secs(3600){return Err("Transfer expired".into());}
    let files:Vec<_>=fs::read_dir(&resolved).map_err(|e|e.to_string())?.filter_map(Result::ok).collect();
    if files.len()!=1{return Err("Invalid transfer contents".into());}let path=files[0].path();
    if fs::symlink_metadata(&path).map_err(|e|e.to_string())?.file_type().is_symlink(){return Err("Invalid transfer link".into());}
    let mut bytes=Vec::new();fs::File::open(&path).map_err(|e|e.to_string())?.take(MAX+1).read_to_end(&mut bytes).map_err(|e|e.to_string())?;
    if bytes.len() as u64>MAX||!bytes.starts_with(b"%PDF-"){return Err("Invalid PDF transfer".into());}
    let name=path.file_name().unwrap_or_default().to_string_lossy().to_string();fs::remove_file(&path).map_err(|e|e.to_string())?;let _=fs::remove_dir(&resolved);Ok((name,bytes))
}
pub fn cleanup(root:&Path){
    let Ok(entries)=fs::read_dir(root)else{return;};
    for entry in entries.flatten(){let token=entry.file_name().to_string_lossy().to_string();if !valid(&token){continue;}
        let path=entry.path();let Ok(meta)=fs::symlink_metadata(&path)else{continue;};if !meta.is_dir()||meta.file_type().is_symlink(){continue;}
        if SystemTime::now().duration_since(meta.modified().unwrap_or(SystemTime::now())).unwrap_or_default()<Duration::from_secs(3600){continue;}
        if let Ok(files)=fs::read_dir(&path){for file in files.flatten(){if file.file_type().map(|t|t.is_file()).unwrap_or(false){let _=fs::remove_file(file.path());}}}let _=fs::remove_dir(path);
    }
}
pub fn consume_reader_copy(root:&Path,path:&Path){
    let Some(folder)=path.parent()else{return;};let Some(token)=folder.file_name().and_then(|n|n.to_str())else{return;};if !valid(token){return;}
    let (Ok(actual),Ok(expected))=(folder.parent().map(fs::canonicalize).unwrap_or_else(||Err(std::io::Error::other("No parent"))),fs::canonicalize(root))else{return;};
    if actual!=expected||fs::symlink_metadata(folder).map(|m|m.file_type().is_symlink()).unwrap_or(true){return;}
    if fs::remove_file(path).is_ok(){let _=fs::remove_dir(folder);}
}
#[cfg(test)]mod tests{
    use super::*;
    #[test]fn transfer_is_one_use_and_rejects_traversal(){let root=std::env::temp_dir().join(format!("solyan-handoff-test-{}",std::process::id()));let token="a".repeat(64);let source=b"%PDF-synthetic";let path=create(&root,&token,source,"Tiếng Việt.pdf").unwrap();assert_eq!(fs::read(&path).unwrap(),source);assert!(take(&root,"../outside").is_err());let(name,bytes)=take(&root,&token).unwrap();assert!(name.contains("Tiếng Việt"));assert_eq!(bytes,source);assert!(take(&root,&token).is_err());assert!(create(&root,&"b".repeat(64),b"bad","x.pdf").is_err());let _=fs::remove_dir(root);}
}
