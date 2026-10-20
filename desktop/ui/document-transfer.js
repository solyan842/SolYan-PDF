// User-requested local transfer only. One-use records, 200 MB per PDF, one-hour expiry.
const TTL=3600_000,MAX=200*1024*1024;
function database(){return new Promise((resolve,reject)=>{const req=indexedDB.open('solyan.document-transfer',1);req.onupgradeneeded=()=>req.result.createObjectStore('files',{keyPath:'token'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function transaction(mode,work){const db=await database();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('files',mode),store=tx.objectStore('files');let result;work(store,value=>result=value);tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Transfer cancelled'));});}finally{db.close();}}
export async function putTransfer(file){
  if(file.size>MAX||file.size<5||await file.slice(0,5).text()!=='%PDF-')throw Error('Invalid or oversized PDF transfer.');
  const token=crypto.randomUUID(),now=Date.now();
  await transaction('readwrite',(store)=>{const cursor=store.openCursor();cursor.onsuccess=()=>{const c=cursor.result;if(c){if(now-c.value.created>TTL)c.delete();c.continue();}};store.add({token,file,name:file.name,created:now});});return token;
}
export async function takeTransfer(token){
  if(!/^[0-9a-f-]{36}$/.test(token))throw Error('Invalid transfer ticket.');
  const record=await transaction('readwrite',(store,result)=>{const req=store.get(token);req.onsuccess=()=>{result(req.result);store.delete(token);};});
  if(!record||Date.now()-record.created>TTL)throw Error('Transfer expired or already opened.');return new File([record.file],record.name,{type:'application/pdf'});
}
