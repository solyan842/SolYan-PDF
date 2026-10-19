//! OS-supplied file requests only. No command accepts a filesystem path from JS.
use std::{collections::{HashMap, HashSet, VecDeque}, fs::{self, File}, io::Read, path::{Path, PathBuf}};

pub const MAX_REQUESTS: usize = 32;
const MAX_BYTES: u64 = 200 * 1024 * 1024;
pub type Ticket = (String, String, String, Option<String>);

#[derive(Default)]
pub struct OpenQueue {
    pending: VecDeque<Result<(String, PathBuf), String>>,
    grants: HashMap<String, PathBuf>,
    counter: u64,
    sources: HashSet<String>,
    overflow: bool,
}
impl OpenQueue {
    pub fn is_source(&self, path: &Path) -> bool {
        if let Ok(path) = fs::canonicalize(path) {
            let key = path.to_string_lossy().to_string();
            #[cfg(windows)]
            let key = key.to_lowercase();
            return self.sources.contains(&key);
        }
        false
    }
    pub fn enqueue(&mut self, paths: impl IntoIterator<Item = PathBuf>, cwd: &Path) {
        for path in paths {
            if !path.extension().map(|x| x.to_string_lossy().eq_ignore_ascii_case("pdf")).unwrap_or(false) { continue; }
            if self.pending.len() + self.grants.len() >= MAX_REQUESTS { self.overflow = true; break; }
            let path = if path.is_absolute() { path } else { cwd.join(path) };
            let request = fs::canonicalize(&path).map_err(|e| format!("Không mở được PDF: {e}"))
                .and_then(|path| {
                    if !path.is_file() { return Err("Đường dẫn PDF không phải tệp.".into()); }
                    let key = path.to_string_lossy().to_string();
                    #[cfg(windows)]
                    let key = key.to_lowercase();
                    self.sources.insert(key.clone());
                    Ok((key, path))
                });
            // Collapse repeated pending launches, but allow reactivation after delivery.
            if let Ok((key, _)) = &request {
                if self.pending.iter().any(|x| matches!(x, Ok((other, _)) if other == key)) { continue; }
            }
            self.pending.push_back(request);
        }
    }
    pub fn next(&mut self) -> Option<Ticket> {
        match self.pending.pop_front() {
            Some(Ok((source, path))) => {
                self.counter += 1;
                let ticket = self.counter.to_string();
                let name = path.file_name()?.to_string_lossy().to_string();
                self.grants.insert(ticket.clone(), path);
                Some((ticket, source, name, None))
            }
            Some(Err(error)) => Some((String::new(), String::new(), String::new(), Some(error))),
            None if self.overflow => {
                self.overflow = false;
                Some((String::new(), String::new(), String::new(), Some("Mỗi đợt mở tối đa 32 PDF. Hãy mở lại các tệp còn lại.".into())))
            }
            None => None,
        }
    }
    pub fn take(&mut self, ticket: &str) -> Result<PathBuf, String> {
        self.grants.remove(ticket).ok_or_else(|| "Yêu cầu mở tệp không tồn tại hoặc đã dùng.".into())
    }
}

pub fn read_pdf(path: &Path) -> Result<Vec<u8>, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let metadata = file.metadata().map_err(|e| e.to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_BYTES { return Err("Reader giới hạn mỗi PDF ở 200 MB.".into()); }
    let mut bytes = Vec::new();
    file.take(MAX_BYTES + 1).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_BYTES { return Err("PDF đã vượt giới hạn 200 MB khi đọc.".into()); }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn cleanup(root: PathBuf) {
        assert_eq!(root.parent(), Some(std::env::temp_dir().as_path()));
        assert!(root.file_name().unwrap().to_string_lossy().starts_with("solyan-reader-queue-"));
        fs::remove_dir_all(root).unwrap();
    }
    fn fixtures() -> PathBuf {
        let root = std::env::temp_dir().join(format!("solyan-reader-queue-{}-{}", std::process::id(), rand::random::<u64>()));
        fs::create_dir_all(root.join("other")).unwrap();
        fs::write(root.join("Tiếng Việt (1).pdf"), b"%PDF-fixture").unwrap();
        fs::write(root.join("other/Tiếng Việt (1).pdf"), b"%PDF-other").unwrap();
        root
    }
    #[test]
    fn canonical_paths_dedupe_pending_but_not_same_basename_or_reactivation() {
        let root = fixtures();
        let mut queue = OpenQueue::default();
        queue.enqueue(["Tiếng Việt (1).pdf", "./Tiếng Việt (1).pdf", "other/Tiếng Việt (1).pdf"].map(PathBuf::from), &root);
        let first = queue.next().unwrap(); let other = queue.next().unwrap();
        assert!(queue.is_source(&root.join("./Tiếng Việt (1).pdf")));
        let output = root.join("working-copy.pdf"); fs::write(&output, b"%PDF-copy").unwrap();
        assert!(!queue.is_source(&output));
        assert_eq!(first.2, other.2); assert_ne!(first.1, other.1); assert!(queue.next().is_none());
        assert_eq!(read_pdf(&queue.take(&first.0).unwrap()).unwrap(), b"%PDF-fixture");
        assert!(queue.take(&first.0).is_err()); assert!(queue.take("C:/arbitrary.pdf").is_err());
        queue.take(&other.0).unwrap();
        queue.enqueue([PathBuf::from("Tiếng Việt (1).pdf")], &root);
        assert_eq!(queue.next().unwrap().1, first.1);
        cleanup(root);
    }
    #[test]
    fn invalid_requests_do_not_block_later_files_and_queue_is_bounded() {
        let root = fixtures(); let mut queue = OpenQueue::default();
        queue.enqueue(["missing.pdf", "bad.txt", "Tiếng Việt (1).pdf"].map(PathBuf::from), &root);
        assert!(queue.next().unwrap().3.is_some());
        let ticket = queue.next().unwrap(); assert!(ticket.3.is_none());
        queue.take(&ticket.0).unwrap(); assert!(queue.next().is_none());
        // Outstanding grants count against the same limit as queued requests.
        for _ in 0..MAX_REQUESTS { queue.enqueue([PathBuf::from("Tiếng Việt (1).pdf")], &root); queue.next().unwrap(); }
        queue.enqueue([PathBuf::from("Tiếng Việt (1).pdf")], &root);
        assert!(queue.next().unwrap().3.is_some()); assert!(queue.next().is_none());
        cleanup(root);
    }
    #[cfg(windows)]
    #[test]
    fn windows_case_alias_focuses_same_source() {
        let root = fixtures(); let mut queue = OpenQueue::default();
        queue.enqueue([PathBuf::from("TIẾNG VIỆT (1).PDF"), PathBuf::from("Tiếng Việt (1).pdf")], &root);
        assert!(queue.next().unwrap().3.is_none()); assert!(queue.next().is_none());
        assert!(queue.is_source(&root.join("TIẾNG VIỆT (1).PDF")));
        cleanup(root);
    }
}
