// Bounded reuse check for the existing loopback /health protocol. Startup keeps
// its engine-specific readiness budget; Home never invokes this adapter.
use std::{io::{Read,Write},net::{SocketAddr,TcpStream},time::{Duration,Instant}};

pub fn probe(port:u16,token:Option<&str>,engine:&str)->bool{
    probe_with_budget(port,token,engine,Duration::from_secs(2))
}

fn probe_with_budget(port:u16,token:Option<&str>,engine:&str,budget:Duration)->bool{
    let started=Instant::now();
    let address=SocketAddr::from(([127,0,0,1],port));
    let Ok(mut stream)=TcpStream::connect_timeout(&address,budget) else{return false;};
    let header=token.map(|t|format!("X-SolYan-Desktop-Token: {t}\r\n")).unwrap_or_default();
    let request=format!("GET /health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n{header}Connection: close\r\n\r\n");
    let remaining=budget.saturating_sub(started.elapsed());
    if remaining.is_zero()||stream.set_write_timeout(Some(remaining)).is_err()||stream.write_all(request.as_bytes()).is_err(){return false;}
    let mut bytes=Vec::new();let mut buffer=[0u8;2048];
    loop{
        let remaining=budget.saturating_sub(started.elapsed());
        if remaining.is_zero()||stream.set_read_timeout(Some(remaining)).is_err(){return false;}
        match stream.read(&mut buffer){
            Ok(0)=>break,
            Ok(n)=>{bytes.extend_from_slice(&buffer[..n]);if bytes.len()>16384{return false;}},
            Err(_)=>return false,
        }
    }
    let Ok(response)=std::str::from_utf8(&bytes) else{return false;};
    let Some((headers,body))=response.split_once("\r\n\r\n") else{return false;};
    // Match the same engine identity as existing startup health, but require
    // the status on the HTTP status line rather than an arbitrary substring.
    (headers.starts_with("HTTP/1.1 200 ")||headers.starts_with("HTTP/1.0 200 "))
        && body.contains("\"status\":\"ok\"") && body.contains(engine)
}

#[cfg(test)]
mod tests{
    use super::*;
    use std::{net::TcpListener,thread};
    fn server(response:&'static str)->(u16,thread::JoinHandle<String>){
        let listener=TcpListener::bind(("127.0.0.1",0)).unwrap();let port=listener.local_addr().unwrap().port();
        let task=thread::spawn(move||{let(mut socket,_)=listener.accept().unwrap();let mut request=[0u8;2048];let n=socket.read(&mut request).unwrap();socket.write_all(response.as_bytes()).unwrap();String::from_utf8_lossy(&request[..n]).into_owned()});
        (port,task)
    }
    #[test]fn authenticated_matching_engine_can_be_reused(){
        let(port,task)=server("HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n{\"status\":\"ok\",\"engine\":\"qpdf\"}");
        assert!(probe(port,Some("test-session-token"),"\"engine\":\"qpdf\""));
        assert!(task.join().unwrap().contains("X-SolYan-Desktop-Token: test-session-token\r\n"));
    }
    #[test]fn error_status_and_wrong_engine_are_not_reused(){
        for response in ["HTTP/1.1 503 Busy\r\n\r\n{\"status\":\"ok\",\"engine\":\"qpdf\",\"message\":\" 200 \"}","HTTP/1.1 200 OK\r\n\r\n{\"status\":\"ok\",\"engine\":\"PaddleOCR\"}"]{
            let(port,task)=server(response);assert!(!probe(port,None,"\"engine\":\"qpdf\""));task.join().unwrap();
        }
    }
    #[test]fn living_but_silent_server_has_a_bounded_failure(){
        let listener=TcpListener::bind(("127.0.0.1",0)).unwrap();let port=listener.local_addr().unwrap().port();
        let task=thread::spawn(move||{let(_socket,_)=listener.accept().unwrap();thread::sleep(Duration::from_millis(250));});
        let before=Instant::now();assert!(!probe_with_budget(port,None,"qpdf",Duration::from_millis(60)));
        assert!(before.elapsed()<Duration::from_secs(1));task.join().unwrap();
    }
    #[test]fn trickling_or_oversized_responses_cannot_extend_the_budget(){
        let listener=TcpListener::bind(("127.0.0.1",0)).unwrap();let port=listener.local_addr().unwrap().port();
        let task=thread::spawn(move||{let(mut socket,_)=listener.accept().unwrap();for _ in 0..30{if socket.write_all(b"x").is_err(){break;}thread::sleep(Duration::from_millis(15));}});
        let before=Instant::now();assert!(!probe_with_budget(port,None,"qpdf",Duration::from_millis(80)));assert!(before.elapsed()<Duration::from_secs(1));task.join().unwrap();
        let response=Box::leak(format!("HTTP/1.1 200 OK\r\n\r\n{}", "x".repeat(20000)).into_boxed_str());
        let(port,task)=server(response);assert!(!probe(port,None,"qpdf"));let _=task.join();
    }
}
