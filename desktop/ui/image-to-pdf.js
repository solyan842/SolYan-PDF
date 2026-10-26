(()=>{
  const $=id=>document.getElementById(id),input=$('fileInput'),zone=$('dropzone'),pick=$('pickFile'),remove=$('removeFile'),selected=$('selectedFile'),name=$('fileName'),meta=$('fileMeta'),run=$('runBtn'),status=$('status');
  let files=[],busy=false;
  function say(text,kind=''){status.textContent=text;status.classList.remove('error','success');if(kind)status.classList.add(kind)}
  function update(){run.disabled=!files.length||busy;pick.disabled=busy;remove.disabled=busy}
  function accept(list){
    const incoming=Array.from(list||[]);
    if(!incoming.length)return;
    if(incoming.length>30){say('Chỉ hỗ trợ tối đa 30 ảnh mỗi lần.','error');return}
    const total=incoming.reduce((sum,file)=>sum+file.size,0);
    if(total<=0||total>100*1024*1024){say('Tổng dung lượng ảnh phải nhỏ hơn 100 MB.','error');return}
    const invalid=incoming.find(file=>!/^image\/(jpeg|png)$/i.test(file.type)&&!(/\.(jpe?g|png)$/i.test(file.name)));
    if(invalid){say('Định dạng chưa hỗ trợ: '+invalid.name,'error');return}
    files=incoming;selected.hidden=false;name.textContent=files.map(file=>file.name).join(', ');
    meta.textContent=files.length+' ảnh · '+(total/1048576).toFixed(2)+' MB';
    say('Đã chọn '+files.length+' ảnh. Sẵn sàng tạo PDF.');update();
  }
  function clear(){files=[];input.value='';selected.hidden=true;update();say('Chọn ảnh để bắt đầu.')}
  async function embed(doc,file){
    const bytes=await file.arrayBuffer(),extension=file.name.toLowerCase().split('.').pop();
    const image=extension==='png'||file.type==='image/png'?await doc.embedPng(bytes):await doc.embedJpg(bytes);
    const {width,height}=image;
    if(!width||!height||width>30000||height>30000||width*height>40000000)throw new Error('Ảnh vượt giới hạn kích thước: '+file.name);
    return {image,width,height};
  }
  async function make(){
    if(!files.length||busy)return;busy=true;update();say('Đang tạo PDF từ '+files.length+' ảnh…');
    try{
      if(!window.PDFLib?.PDFDocument||!window.SOLYAN_OUTPUT_NAME)throw new Error('Thư viện PDF chưa sẵn sàng.');
      const doc=await window.PDFLib.PDFDocument.create(),size=$('pageSize').value;
      for(const file of files){
        const {image,width,height}=await embed(doc,file);
        let pageWidth=width,pageHeight=height,x=0,y=0,drawWidth=width,drawHeight=height;
        if(size!=='fit'){
          pageWidth=size==='a4'?595.28:612;pageHeight=size==='a4'?841.89:792;
          const scale=Math.min((pageWidth-48)/width,(pageHeight-48)/height);
          drawWidth=width*scale;drawHeight=height*scale;x=(pageWidth-drawWidth)/2;y=(pageHeight-drawHeight)/2;
        }else{
          const scale=842/Math.max(width,height);pageWidth=width*scale;pageHeight=height*scale;drawWidth=pageWidth;drawHeight=pageHeight;
        }
        const page=doc.addPage([pageWidth,pageHeight]);page.drawImage(image,{x,y,width:drawWidth,height:drawHeight});
      }
      const bytes=await doc.save({useObjectStreams:true}),blob=new Blob([bytes],{type:'application/pdf'}),url=URL.createObjectURL(blob);
      const anchor=document.createElement('a');anchor.href=url;anchor.download=window.SOLYAN_OUTPUT_NAME(files[0].name,'converted');document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
      say('Đã tạo PDF gồm '+files.length+' trang. Chọn Lưu hoặc Lưu thành ở phần kết quả.','success');
    }catch(error){say('Không tạo được PDF: '+(error?.message||error),'error')}
    finally{busy=false;update()}
  }
  pick.addEventListener('click',()=>input.click());input.addEventListener('change',()=>accept(input.files));
  remove.addEventListener('click',clear);run.addEventListener('click',make);
  for(const eventName of ['dragenter','dragover'])zone.addEventListener(eventName,event=>{event.preventDefault();zone.classList.add('drag')});
  for(const eventName of ['dragleave','drop'])zone.addEventListener(eventName,event=>{event.preventDefault();zone.classList.remove('drag')});
  zone.addEventListener('drop',event=>accept(event.dataTransfer?.files));
  update();
})();
