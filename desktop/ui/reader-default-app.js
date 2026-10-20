// Reader-only default PDF prompt. Windows owns the final default-app decision.
const preferenceKey='sreader.checkDefaultPdfAtStartup';
export function defaultPdfCheckEnabled(){
  try{return localStorage.getItem(preferenceKey)!=='false';}
  catch{return true;}
}
export function setDefaultPdfCheckEnabled(enabled){
  try{localStorage.setItem(preferenceKey,enabled?'true':'false');}catch{}
}
export async function openPdfDefaultSettings(native=globalThis.__TAURI__){
  if(!native?.core?.invoke)throw Error('Chỉ hỗ trợ trên ứng dụng Windows.');
  return native.core.invoke('reader_open_external',{kind:'pdf-default-settings'});
}
export function installDefaultPdfPrompt({native=globalThis.__TAURI__,message=()=>{}}={}){
  if(!native?.core?.invoke)return null;
  const dialog=document.createElement('dialog');dialog.id='readerDefaultPdfPrompt';
  dialog.setAttribute('aria-labelledby','readerDefaultPdfTitle');
  const heading=document.createElement('div');heading.className='reader-default-heading';
  const logo=document.createElement('img');logo.src='./vendor/sReader_PDF.png';logo.alt='';
  const title=document.createElement('h2');title.id='readerDefaultPdfTitle';title.textContent='sReader PDF';
  heading.append(logo,title);
  const description=document.createElement('p');
  description.textContent='sReader PDF chưa phải ứng dụng mặc định mở tệp PDF. Bạn muốn chọn sReader làm ứng dụng mặc định không?';
  const note=document.createElement('p');note.className='reader-default-note';
  note.textContent='Windows yêu cầu bạn xác nhận việc chọn ứng dụng. Chúng tôi sẽ đưa bạn tới mục sReader trong ứng dụng mặc định (nếu Windows hỗ trợ).';
  const label=document.createElement('label');label.className='reader-default-check';
  const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.id='readerAlwaysCheckPdf';checkbox.checked=defaultPdfCheckEnabled();
  label.append(checkbox,document.createTextNode('Luôn kiểm tra khi khởi động sReader PDF'));
  const actions=document.createElement('div');actions.className='dialogActions';
  const no=document.createElement('button');no.type='button';no.id='readerDefaultPdfNo';no.textContent='Không';
  const yes=document.createElement('button');yes.type='button';yes.id='readerDefaultPdfYes';yes.className='primary';yes.textContent='Có';
  actions.append(no,yes);dialog.append(heading,description,note,label,actions);document.body.append(dialog);
  dialog.addEventListener('close',()=>setDefaultPdfCheckEnabled(checkbox.checked));
  // Persist synchronously before closing: the native <dialog> "close" event
  // fires asynchronously, so immediately querying preference could still see
  // the old value after the dialog is visually hidden (Reader CI #21).
  no.onclick=()=>{setDefaultPdfCheckEnabled(checkbox.checked);dialog.close();};
  yes.onclick=async()=>{
    setDefaultPdfCheckEnabled(checkbox.checked);dialog.close();
    try{await openPdfDefaultSettings(native);}
    catch(error){message('Không mở được mục ứng dụng mặc định: '+String(error?.message||error));}
  };
  let checked=false;
  async function check(){
    if(checked||!defaultPdfCheckEnabled())return;
    checked=true;
    let state;
    try{state=await native.core.invoke('reader_pdf_default_state');}
    catch{return;}
    if(state!=='other'||!defaultPdfCheckEnabled())return;
    // File opened from Explorer: don't interrupt reading or automated file acceptance.
    if(document.querySelector('#tabs .tab'))return;
    // Don't interrupt a native Save As, signature dialog or active form edit.
    if(document.querySelector('dialog[open]')){
      checked=false;
      document.querySelector('dialog[open]')?.addEventListener('close',()=>setTimeout(check,250),{once:true});
      return;
    }
    checkbox.checked=defaultPdfCheckEnabled();
    if(!dialog.open)dialog.showModal();
  }
  // PDF reading becomes interactive first. The check is background-only.
  setTimeout(()=>{void check();},1800);
  return dialog;
}
