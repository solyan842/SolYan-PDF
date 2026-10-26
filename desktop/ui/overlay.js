(()=>{
const $=id=>document.getElementById(id),baseInput=$('baseInput'),overlayInput=$('overlayInput'),run=$('run'),status=$('status'),opacity=$('opacity');
let base=null,overlay=null,baseBytes=null,overlayBytes=null,basePages=0,overlayPages=0,busy=false,loading=0;
function say(text,kind=''){status.textContent=text;status.className='status-text'+(kind?' '+kind:'');}
function update(){run.disabled=!base||!overlay||busy||loading>0}
async function loadFile(file,kind){
 if(!file)return;
 if(!/\.pdf$/i.test(file.name)||!file.size||file.size>100*1024*1024){say('Chỉ hỗ trợ PDF không vượt 100 MB.','error');return}
 loading++;update();say('Đang đọc '+(kind==='base'?'PDF chính':'PDF lớp phủ')+'…');
 try{
  const bytes=await file.arrayBuffer(),doc=await window.PDFLib.PDFDocument.load(bytes,{ignoreEncryption:false,updateMetadata:false}),count=doc.getPageCount();
  if(!count||count>500)throw Error('PDF phải có từ 1 đến 500 trang.');
  if(kind==='base'){base=file;baseBytes=bytes;basePages=count;$('baseInfo').textContent=file.name+' · '+count+' trang';}
  else{overlay=file;overlayBytes=bytes;overlayPages=count;$('overlayInfo').textContent=file.name+' · '+count+' trang';}
  say('Đã đọc PDF. Chọn Tạo PDF để tiếp tục.');
 }catch(error){say('Không đọc được PDF: '+(error?.message||error),'error');}
 finally{loading--;update()}
}
async function make(){
 if(!base||!overlay||busy||loading)return;busy=true;update();say('Đang chồng nội dung PDF…');
 try{
  if(overlayPages!==1&&overlayPages!==basePages)throw Error('PDF lớp phủ phải có một trang hoặc số trang bằng PDF chính.');
  const doc=await window.PDFLib.PDFDocument.load(baseBytes,{ignoreEncryption:false,updateMetadata:false}),embedded=await doc.embedPdf(overlayBytes),alpha=Number(opacity.value);
  for(let i=0;i<basePages;i++){
   const page=doc.getPage(i),source=embedded[embedded.length===1?0:i],target=page.getSize(),size=source.size(),scale=Math.min(target.width/size.width,target.height/size.height),width=size.width*scale,height=size.height*scale;
   page.drawPage(source,{x:(target.width-width)/2,y:(target.height-height)/2,width,height,opacity:alpha});
  }
  const bytes=await doc.save({useObjectStreams:true}),url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),a=document.createElement('a');
  a.href=url;a.download=window.SOLYAN_OUTPUT_NAME(base.name,'overlay');document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);say('Đã tạo '+basePages+' trang. Chọn Lưu hoặc Lưu thành ở phần kết quả.','success');
 }catch(error){say('Không chồng được PDF: '+(error?.message||error),'error')}
 finally{busy=false;update()}
}
baseInput.addEventListener('change',()=>loadFile(baseInput.files?.[0],'base'));overlayInput.addEventListener('change',()=>loadFile(overlayInput.files?.[0],'overlay'));opacity.addEventListener('input',()=>{$('opacityValue').textContent=Math.round(Number(opacity.value)*100)+'%'});run.addEventListener('click',make);update();
})();
