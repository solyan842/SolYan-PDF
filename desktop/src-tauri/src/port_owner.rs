// Windows owns the endpoint/PID table; never infer ownership from a health body
// or an executable name. Check the established server half of this exact socket.
use std::{net::{SocketAddr,TcpStream},time::Duration,thread};
use windows_sys::Win32::{
    Foundation::{CloseHandle,ERROR_INSUFFICIENT_BUFFER,HANDLE},
    NetworkManagement::IpHelper::{GetExtendedTcpTable,MIB_TCPROW_OWNER_PID,MIB_TCPTABLE_OWNER_PID,MIB_TCP_STATE_ESTAB,TCP_TABLE_OWNER_PID_ALL},
    Networking::WinSock::AF_INET,
    System::{JobObjects::IsProcessInJob,Threading::{OpenProcess,PROCESS_QUERY_LIMITED_INFORMATION}},
};

fn server_pid(client:SocketAddr,server:SocketAddr)->Result<Option<u32>,()>{
    let (SocketAddr::V4(client),SocketAddr::V4(server))=(client,server) else{return Err(());};
    if !client.ip().is_loopback()||!server.ip().is_loopback(){return Err(());}
    let mut size=0;
    let first=unsafe{GetExtendedTcpTable(std::ptr::null_mut(),&mut size,0,AF_INET as u32,TCP_TABLE_OWNER_PID_ALL,0)};
    if first!=ERROR_INSUFFICIENT_BUFFER{return Err(());}
    for _ in 0..3{
        if size<4||size>16*1024*1024{return Err(());}
        // u32 allocation preserves the DWORD alignment required by Win32.
        let mut table=vec![0u32;(size as usize+3)/4];
        let allocated=table.len()*4;
        let result=unsafe{GetExtendedTcpTable(table.as_mut_ptr().cast(),&mut size,0,AF_INET as u32,TCP_TABLE_OWNER_PID_ALL,0)};
        if result==ERROR_INSUFFICIENT_BUFFER{continue;}
        if result!=0{return Err(());}
        let offset=std::mem::offset_of!(MIB_TCPTABLE_OWNER_PID,table);
        let count=table[0] as usize;
        if size as usize>allocated||(size as usize)<offset||count>(size as usize-offset)/std::mem::size_of::<MIB_TCPROW_OWNER_PID>(){return Err(());}
        let rows=unsafe{std::slice::from_raw_parts(table.as_ptr().cast::<u8>().add(offset).cast::<MIB_TCPROW_OWNER_PID>(),count)};
        return Ok(rows.iter().find(|row|
            row.dwState==MIB_TCP_STATE_ESTAB as u32
            && row.dwLocalAddr==u32::from_ne_bytes(server.ip().octets())
            && u16::from_be(row.dwLocalPort as u16)==server.port()
            && row.dwRemoteAddr==u32::from_ne_bytes(client.ip().octets())
            && u16::from_be(row.dwRemotePort as u16)==client.port()
        ).map(|row|row.dwOwningPid));
    }
    Err(())
}

pub fn connection_belongs_to_job(stream:&TcpStream,job:usize)->bool{
    if job==0{return false;}
    let (Ok(client),Ok(server))=(stream.local_addr(),stream.peer_addr()) else{return false;};
    for attempt in 0..3{
        match server_pid(client,server){
            Ok(Some(pid))=>{
                let process=unsafe{OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION,0,pid)};
                if process.is_null(){return false;}
                let mut belongs=0;
                let queried=unsafe{IsProcessInJob(process,job as HANDLE,&mut belongs)};
                unsafe{CloseHandle(process);}
                return queried!=0&&belongs!=0;
            },
            Ok(None) if attempt<2=>thread::sleep(Duration::from_millis(10)),
            _=>return false,
        }
    }
    false
}
