//! User-local Reader history. Paths originate only from OS-granted file opens.
 //! Store no PDF bytes, signature content or unsaved edits.
use std::{collections::HashSet, fs, io::Write, path::{Path, PathBuf}};

pub const MAX_TABS: usize = 12;
pub const MAX_RECENTS: usize = 20;
const MAX_STORE: u64 = 32 * 1024;
pub type View = (String, u32, f64, f64, f64); // source, page, scale, left, top
pub type RecentRow = (usize, String, String, bool, u32);

#[derive(Clone, Debug)]
pub struct Tab {
    pub path: PathBuf,
    pub page: u32,
    pub scale: f64,
    pub left: f64,
    pub top: f64,
}
#[derive(Default, Debug)]
pub struct Store {
    pub tabs: Vec<Tab>,
    pub active: Option<PathBuf>,
    pub recent: Vec<(PathBuf, u32)>,
}

pub fn source_key(path: &Path) -> String {
    let key = path.to_string_lossy().to_string();
    #[cfg(windows)]
    let key = key.to_lowercase();
    key
}
pub fn valid_page(page:u32)->u32 {page.clamp(1,1_000_000)}
pub fn valid_scale(scale:f64)->f64 {if scale.is_finite(){scale.clamp(0.25,4.0)}else{1.0}}
pub fn valid_scroll(value:f64)->f64 {if value.is_finite(){value.clamp(0.0,1_000_000.0)}else{0.0}}
fn hex(path:&Path)->String {path.to_string_lossy().as_bytes().iter().map(|b|format!("{b:02x}")).collect()}
fn unhex(s:&str)->Option<PathBuf>{
    if s.len()>4096||s.len()%2!=0||s.is_empty(){return None;}
    let bytes=(0..s.len()).step_by(2).map(|i|u8::from_str_radix(&s[i..i+2],16).ok()).collect::<Option<Vec<_>>>()?;
    let name=String::from_utf8(bytes).ok()?;
    if name.contains('\0'){return None;}
    let path=PathBuf::from(name);
    if !path.is_absolute()||!path.extension().map(|e|e.to_string_lossy().eq_ignore_ascii_case("pdf")).unwrap_or(false){return None;}
    Some(path)
}
fn file(root:&Path)->PathBuf {root.join("reader-session-v1.txt")}
pub fn read(root:&Path)->Store {
    let Ok(meta)=fs::metadata(file(root))else{return Store::default()};
    if meta.len()>MAX_STORE{return Store::default();}
    let Ok(data)=fs::read_to_string(file(root))else{return Store::default()};
    let mut lines=data.lines();
    if lines.next()!=Some("SOLYAN_READER_V1"){return Store::default();}
    let mut store=Store::default();
    let mut seen_tabs=HashSet::new();
    let mut seen_recent=HashSet::new();
    for line in lines {
        let parts:Vec<_>=line.split('\t').collect();
        match parts.as_slice() {
            ["A",encoded]=>{if let Some(path)=unhex(encoded){store.active=Some(path);}},
            ["T",encoded,page,scale,left,top] if store.tabs.len()<MAX_TABS=>{
                if let (Some(path),Ok(page),Ok(scale),Ok(left),Ok(top))=
                    (unhex(encoded),page.parse::<u32>(),scale.parse::<f64>(),left.parse::<f64>(),top.parse::<f64>()) {
                    if seen_tabs.insert(source_key(&path)) {store.tabs.push(Tab{path,page:valid_page(page),scale:valid_scale(scale),left:valid_scroll(left),top:valid_scroll(top)});}
                }
            },
            ["R",encoded,page] if store.recent.len()<MAX_RECENTS=>{
                if let (Some(path),Ok(page))=(unhex(encoded),page.parse::<u32>()){
                    if seen_recent.insert(source_key(&path)){store.recent.push((path,valid_page(page)));}
                }
            },
            _=>{}
        }
    }
    store
}
pub fn write(root:&Path,store:&Store)->Result<(),String>{
    fs::create_dir_all(root).map_err(|e|e.to_string())?;
    let mut content=String::from("SOLYAN_READER_V1\n");
    if let Some(path)=&store.active {content.push_str(&format!("A\t{}\n",hex(path)));}
    for t in store.tabs.iter().take(MAX_TABS) {
        content.push_str(&format!("T\t{}\t{}\t{}\t{}\t{}\n",hex(&t.path),valid_page(t.page),valid_scale(t.scale),valid_scroll(t.left),valid_scroll(t.top)));
    }
    for (path,page) in store.recent.iter().take(MAX_RECENTS) {content.push_str(&format!("R\t{}\t{}\n",hex(path),valid_page(*page)));}
    if content.len()>MAX_STORE as usize{return Err("Reader session data exceeds storage limit".into());}
    let dest=file(root);
    let temp=root.join(format!(".reader-session-{}.tmp",rand::random::<u64>()));
    let mut handle=fs::OpenOptions::new().write(true).create_new(true).open(&temp).map_err(|e|e.to_string())?;
    if let Err(error)=handle.write_all(content.as_bytes()).and_then(|_|handle.sync_all()){
        drop(handle);let _=fs::remove_file(&temp);return Err(error.to_string());
    }
    drop(handle);
    #[cfg(windows)]
    let result={
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::{MoveFileExW,MOVEFILE_REPLACE_EXISTING,MOVEFILE_WRITE_THROUGH};
        let from:Vec<u16>=temp.as_os_str().encode_wide().chain(Some(0)).collect();
        let to:Vec<u16>=dest.as_os_str().encode_wide().chain(Some(0)).collect();
        if unsafe{MoveFileExW(from.as_ptr(),to.as_ptr(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH)}==0 {
            Err(std::io::Error::last_os_error().to_string())
        }else{Ok(())}
    };
    #[cfg(not(windows))]
    let result=fs::rename(&temp,&dest).map_err(|e|e.to_string());
    if result.is_err(){let _=fs::remove_file(&temp);}
    result
}
pub fn update(store:&mut Store,tabs:Vec<Tab>,active:Option<PathBuf>){
    let previously_open:HashSet<String>=store.tabs.iter().map(|t|source_key(&t.path)).collect();
    let history:HashSet<String>=store.recent.iter().map(|(path,_)|source_key(path)).collect();
    let mut seen=HashSet::new();
    store.tabs=tabs.into_iter().filter(|t|seen.insert(source_key(&t.path))).take(MAX_TABS).collect();
    store.active=active.filter(|path|store.tabs.iter().any(|t|source_key(&t.path)==source_key(path)));
    let mut ordered=Vec::new();let mut visited=HashSet::new();
    // A history clear must stay cleared until a genuinely new file is opened.
    // Existing tab page/zoom changes must NOT silently re-add cleared entries.
    if let Some(active)=&store.active{
        if let Some(t)=store.tabs.iter().find(|t|source_key(&t.path)==source_key(active)){
            let key=source_key(&t.path);
            if !previously_open.contains(&key)||history.contains(&key){
                ordered.push((t.path.clone(),t.page));visited.insert(key);
            }
        }
    }
    for t in &store.tabs {
        let key=source_key(&t.path);
        if (!previously_open.contains(&key)||history.contains(&key))&&visited.insert(key){
            ordered.push((t.path.clone(),t.page));
        }
    }
    for (p,page) in &store.recent {
        if visited.insert(source_key(p)){ordered.push((p.clone(),*page));}
    }
    store.recent=ordered.into_iter().take(MAX_RECENTS).collect();
}
pub fn recent_rows(store:&Store)->Vec<RecentRow>{
    store.recent.iter().enumerate().map(|(index,(path,page))|{
        let name=path.file_name().unwrap_or_default().to_string_lossy().to_string();
        (index,name,path.to_string_lossy().to_string(),!path.is_file(),*page)
    }).collect()
}
#[cfg(test)]
mod tests {
    use super::*;
    fn fixture()->PathBuf {let d=std::env::temp_dir().join(format!("solyan-reader-session-{}-{}",std::process::id(),rand::random::<u64>()));fs::create_dir(&d).unwrap();d}
    #[test]
    fn unicode_tabs_recent_and_active_survive_atomic_roundtrip(){
        let root=fixture();let a=root.join("Tiếng Việt (1).pdf");let b=root.join("other.pdf");
        fs::write(&a,b"%PDF-1").unwrap();fs::write(&b,b"%PDF-2").unwrap();
        let mut state=Store::default();
        update(&mut state,vec![Tab{path:a.clone(),page:3,scale:1.5,left:24.0,top:120.0},Tab{path:b.clone(),page:2,scale:1.0,left:0.0,top:0.0}],Some(b.clone()));
        write(&root,&state).unwrap();let result=read(&root);
        assert_eq!(result.tabs.len(),2);assert_eq!(result.tabs[0].path,a);
        assert_eq!(result.tabs[0].page,3);assert_eq!(result.tabs[0].top,120.0);
        assert_eq!(result.active,Some(b.clone()));assert_eq!(result.recent[0].0,b);
        fs::remove_file(&b).unwrap();assert!(recent_rows(&read(&root))[0].3);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn cleared_history_does_not_repopulate_until_a_new_document_is_opened(){
        let root=fixture();let a=root.join("a.pdf");let b=root.join("b.pdf");
        let tab=|path:PathBuf|Tab{path,page:2,scale:1.0,left:0.0,top:0.0};
        let mut store=Store::default();
        update(&mut store,vec![tab(a.clone())],Some(a.clone()));
        assert_eq!(store.recent.len(),1);
        store.recent.clear();
        update(&mut store,vec![tab(a.clone())],Some(a.clone()));
        assert!(store.recent.is_empty());
        update(&mut store,vec![tab(a),tab(b.clone())],Some(b));
        assert_eq!(store.recent.len(),1);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn bounds_duplicates_clear_and_invalid_file_are_safe(){
        let root=fixture();let a=root.join("first.pdf");
        let mut state=Store::default();
        update(&mut state,vec![Tab{path:a.clone(),page:0,scale:f64::NAN,left:f64::INFINITY,top:-2.0},Tab{path:a.clone(),page:2,scale:2.0,left:0.0,top:3.0}],Some(a.clone()));
        assert_eq!(state.tabs.len(),1);write(&root,&state).unwrap();
        let result=read(&root);assert_eq!(result.tabs[0].page,1);assert_eq!(result.tabs[0].scale,1.0);assert_eq!(result.tabs[0].left,0.0);assert_eq!(result.tabs[0].top,0.0);
        fs::write(file(&root),b"SOLYAN_READER_V1\nT\tzzz\t5\t1\t0\t0\n").unwrap();
        assert!(read(&root).tabs.is_empty());fs::remove_dir_all(root).unwrap();
    }
}
