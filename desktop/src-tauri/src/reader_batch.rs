//! Command-line parsing for Explorer's Windows multi-file Print verb.
use std::path::PathBuf;
pub fn split_args(args: impl IntoIterator<Item=std::ffi::OsString>) -> (bool, Vec<PathBuf>, Vec<PathBuf>) {
    let mut print=false; let mut paths=Vec::new();
    for arg in args { if arg.as_os_str().eq(std::ffi::OsStr::new("--print")) { print=true; } else { paths.push(PathBuf::from(arg)); } }
    if print { (true,paths,Vec::new()) } else { (false,Vec::new(),paths) }
}
#[cfg(test)] mod tests {
 use super::*; use std::ffi::OsString;
 #[test] fn print_keeps_all_paths_and_consumes_flag(){
  let (print,files,open)=split_args([OsString::from("--print"),OsString::from("C:/PDF/A (1).pdf"),OsString::from("C:/PDF/Tiếng Việt.pdf")]);
  assert!(print); assert_eq!(files.len(),2); assert_eq!(files[1],PathBuf::from("C:/PDF/Tiếng Việt.pdf")); assert!(open.is_empty());
 }
 #[test] fn ordinary_open_paths_are_unchanged(){
  let path=PathBuf::from("C:/PDF/ordinary.pdf"); let (print,files,open)=split_args([path.clone().into_os_string()]);
  assert!(!print); assert!(files.is_empty()); assert_eq!(open,vec![path]);
 }
}