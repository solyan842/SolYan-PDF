use std::net::{IpAddr, ToSocketAddrs};


fn public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            let [a,b,c,_] = ip.octets();
            !ip.is_private() && !ip.is_loopback() && !ip.is_link_local()
                && !ip.is_multicast() && !ip.is_broadcast() && !ip.is_documentation()
                && a != 0 && a < 224 && !(a == 100 && (64..=127).contains(&b))
                && !(a == 198 && (18..=19).contains(&b))
                && !(a==192 && ((b==0 && c==0)||(b==88 && c==99)))
        }
        IpAddr::V6(ip) => ip.to_ipv4_mapped().map(|v|public_ip(IpAddr::V4(v))).unwrap_or_else(|| {
            // Only global-unicast IPv6; reject local, multicast and transition ranges.
            let s=ip.segments(); (s[0] & 0xe000)==0x2000 && s[0]!=0x2002 && s[0]!=0x3fff
                && !(s[0]==0x2001 && s[1]<=0x01ff) && !(s[0]==0x2001 && s[1]==0x0db8)
        }),
    }
}
pub fn checked_url(raw: &str) -> Result<url::Url,String> {
    if raw.len()>4096 || raw.chars().any(|c|c.is_control() || matches!(c,'\u{202a}'..='\u{202e}'|'\u{2066}'..='\u{2069}')) {return Err("Địa chỉ không hợp lệ".into());}
    let u=url::Url::parse(raw).map_err(|_|"Địa chỉ không hợp lệ")?;
    if !matches!(u.scheme(),"https"|"http") || !u.username().is_empty() || u.password().is_some() {return Err("Chỉ cho phép liên kết web HTTP/HTTPS không chứa tài khoản".into());}
    let host=u.host_str().ok_or("Thiếu tên miền")?.trim_matches(['[',']']);
    if let Ok(ip)=host.parse::<IpAddr>() {if !public_ip(ip){return Err("Không mở địa chỉ mạng nội bộ hoặc dành riêng".into());}}
    else if !host.contains('.') || [".local",".localhost",".internal",".home",".lan"].iter().any(|s|host.trim_end_matches('.').ends_with(s)) {return Err("Không mở tên miền mạng nội bộ".into());}
    Ok(u)
}

#[tauri::command]
pub async fn reader_open_pdf_link(window: tauri::WebviewWindow, address: String) -> Result<String,String> {
    super::reader_window(&window)?;
    if !cfg!(feature="reader-only") {return Err("Chỉ dùng trong sReader độc lập".into());}
    let u=checked_url(&address)?;
    // A native prompt is mandatory on EVERY invocation. Renderer cannot supply an
    // approval flag or remembered permission, and there is no arbitrary opener IPC.
    #[cfg(windows)] {
        let owner=window.hwnd().map_err(|e|e.to_string())?.0 as isize;
        tauri::async_runtime::spawn_blocking(move || {
            let host=u.host_str().ok_or("Thiếu tên miền")?;
            let ips:Vec<_>=(host.trim_matches(['[',']']),u.port_or_known_default().unwrap_or(443)).to_socket_addrs().map_err(|_|"Không xác minh được địa chỉ mạng; liên kết bị chặn")?.collect();
            if ips.is_empty() || ips.iter().any(|a|!public_ip(a.ip())) {return Err("Tên miền trỏ tới mạng nội bộ hoặc địa chỉ bị chặn".into());}
            use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW,MB_YESNOCANCEL,MB_ICONWARNING,MB_DEFBUTTON3,IDYES,IDNO};
            let wide=|s:&str|s.encode_utf16().chain(Some(0)).collect::<Vec<_>>();
            let title=wide("sReader PDF — Cảnh báo liên kết");
            let text=wide(&format!("Tài liệu muốn mở trang web bên ngoài.\n\nTên miền: {host}\nĐịa chỉ: {u}\n\nChỉ mở nếu bạn tin cậy địa chỉ này.\nCó = Cho phép; Không = Chặn; Hủy = Không mở."));
            let choice=unsafe{MessageBoxW(owner as _,text.as_ptr(),title.as_ptr(),MB_YESNOCANCEL|MB_ICONWARNING|MB_DEFBUTTON3)};
            if choice!=IDYES {return Ok(if choice==IDNO {"blocked"} else {"cancelled"}.into());}
            let target=wide(u.as_str());let verb=wide("open");
            let result=unsafe{super::ShellExecuteW(owner as _,verb.as_ptr(),target.as_ptr(),std::ptr::null(),std::ptr::null(),1)};
            if (result as isize)<=32{return Err("Windows không mở được trình duyệt".into());}
            Ok("opened".into())
        }).await.map_err(|e|e.to_string())?
    }
    #[cfg(not(windows))] {let _=(u,window);Err("Cần Windows để xác nhận liên kết".into())}
}

pub fn navigation_allowed(url:&url::Url)->bool {
    // No remote document may ever replace the Reader's privileged webview.
    ((url.scheme()=="tauri" && url.host_str()==Some("localhost"))
        || (matches!(url.scheme(),"http"|"https") && url.host_str()==Some("tauri.localhost")))
        && url.path()=="/reader.html" && url.query().is_none()
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn rejects_dangerous_and_local_urls(){for u in ["javascript:alert(1)","file:///C:/x","data:text/html,x","https://a:b@example.com","http://127.1","http://2130706433","http://10.0.0.1","http://169.254.169.254","http://100.64.0.1","http://[::1]","http://[::ffff:127.0.0.1]","https://printer.local","https://intranet"]{assert!(checked_url(u).is_err(),"{u}");}assert!(checked_url("https://example.com/a?b=1#c").is_ok());}
    #[test] fn webview_stays_on_reader(){for u in ["https://example.com","http://localhost/reader.html","http://tauri.localhost/evil.html","http://tauri.localhost/reader.html?remote=1","file:///reader.html"] {assert!(!navigation_allowed(&url::Url::parse(u).unwrap()));}assert!(navigation_allowed(&url::Url::parse("http://tauri.localhost/reader.html#page=2").unwrap()));}
}
