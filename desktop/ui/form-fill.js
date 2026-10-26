(()=>{
const $=id=>document.getElementById(id),input=$('fileInput'),pick=$('pickFile'),remove=$('removeFile'),selected=$('selectedFile'),fileName=$('fileName'),fileMeta=$('fileMeta'),fieldsNode=$('fields'),save=$('saveForm'),status=$('status'),zone=$('dropzone');
let file=null,bytes=null,fields=[],busy=false,loading=false;
function say(text,kind=''){status.textContent=text;status.className='status-text'+(kind?' '+kind:'');}
function update(){save.disabled=!file||!fields.length||busy||loading;pick.disabled=busy||loading;remove.disabled=busy||loading;}
function fieldKind(field){const lib=window.PDFLib;if(lib.PDFTextField&&field instanceof lib.PDFTextField)return 'text';if(lib.PDFCheckBox&&field instanceof lib.PDFCheckBox)return 'checkbox';if(lib.PDFDropdown&&field instanceof lib.PDFDropdown)return 'dropdown';if(lib.PDFOptionList&&field instanceof lib.PDFOptionList)return 'options';if(lib.PDFRadioGroup&&field instanceof lib.PDFRadioGroup)return 'radio';return 'unsupported';}
function fieldRow(field,index){
 const type=field.constructor?.name||'PDFField',name=field.getName(),row=document.createElement('div'),label=document.createElement('label');
 row.className='option-group';label.textContent=name;row.append(label);
 if(fieldKind(field)==='text'){
  const control=document.createElement('input');control.type='text';control.className='text-input';control.value=field.getText()||'';control.dataset.index=index;control.dataset.kind='text';row.append(control);
 }else if(fieldKind(field)==='checkbox'){
  const control=document.createElement('input');control.type='checkbox';control.checked=field.isChecked();control.dataset.index=index;control.dataset.kind='checkbox';row.append(control);
 }else if(fieldKind(field)==='dropdown'||fieldKind(field)==='options'){
  const control=type==='PDFDropdown'?document.createElement('select'):document.createElement('select');control.className='text-input';control.multiple=fieldKind(field)==='options';control.dataset.index=index;control.dataset.kind=fieldKind(field);
  const current=field.getSelected()||[];
  for(const option of field.getOptions()){const item=document.createElement('option');item.value=option;item.textContent=option;item.selected=current.includes(option);control.append(item);}
  row.append(control);
 }else if(fieldKind(field)==='radio'){
  const control=document.createElement('select');control.className='text-input';control.dataset.index=index;control.dataset.kind='radio';
  const empty=document.createElement('option');empty.value='';empty.textContent='Chưa chọn';control.append(empty);
  for(const option of field.getOptions()){const item=document.createElement('option');item.value=option;item.textContent=option;item.selected=field.getSelected()===option;control.append(item);}
  row.append(control);
 }else{
  const control=document.createElement('span');control.className='muted-small';control.textContent='Chỉ đọc ('+type+')';row.append(control);
 }
 return row;
}
function clear(){
 file=null;bytes=null;fields=[];input.value='';selected.hidden=true;fieldsNode.replaceChildren();fieldsNode.hidden=true;update();say('Chọn PDF để đọc các trường.');
}
async function accept(next){
 if(!next)return;
 if(!/\.pdf$/i.test(next.name)){say('Chỉ hỗ trợ PDF.','error');return}
 if(!next.size||next.size>100*1024*1024){say('PDF trống hoặc vượt 100 MB.','error');return}
 loading=true;file=null;bytes=null;fields=[];fieldsNode.replaceChildren();fieldsNode.hidden=true;update();say('Đang đọc biểu mẫu…');
 try{
  const source=await next.arrayBuffer(),doc=await window.PDFLib.PDFDocument.load(source,{ignoreEncryption:false,updateMetadata:false}),form=doc.getForm();
  const available=form.getFields().filter(field=>fieldKind(field)!=='unsupported');
  if(!available.length)throw new Error('Không tìm thấy trường AcroForm có thể điền.');
  file=next;bytes=source;fields=available;fileName.textContent=next.name;fileMeta.textContent=available.length+' trường biểu mẫu';selected.hidden=false;
  available.forEach((field,index)=>fieldsNode.append(fieldRow(field,index)));fieldsNode.hidden=false;say('Đã đọc '+available.length+' trường.');update();
 }catch(error){say('Không đọc được biểu mẫu: '+(error?.message||error),'error');}
 finally{loading=false;update();}
}
async function saveFile(){
 if(!file||!bytes||!fields.length||busy)return;busy=true;update();
 try{
  const doc=await window.PDFLib.PDFDocument.load(bytes,{ignoreEncryption:false,updateMetadata:false}),form=doc.getForm(),targetFields=form.getFields().filter(field=>fieldKind(field)!=='unsupported');
  for(const control of fieldsNode.querySelectorAll('[data-index]')){
   const field=targetFields[Number(control.dataset.index)];
   if(control.dataset.kind==='text')field.setText(control.value);
   else if(control.dataset.kind==='checkbox'){if(control.checked)field.check();else field.uncheck();}
   else if(control.dataset.kind==='dropdown'||control.dataset.kind==='radio'){if(control.value)field.select(control.value);}
   else if(control.dataset.kind==='options')field.select(Array.from(control.selectedOptions,option=>option.value));
  }
  const output=await doc.save({useObjectStreams:true}),url=URL.createObjectURL(new Blob([output],{type:'application/pdf'})),anchor=document.createElement('a');
  anchor.href=url;anchor.download=window.SOLYAN_OUTPUT_NAME(file.name,'filled');document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);say('Đã tạo bản PDF đã điền. Chọn Lưu hoặc Lưu thành ở phần kết quả.','success');
 }catch(error){say('Không lưu được biểu mẫu: '+(error?.message||error),'error');}
 finally{busy=false;update();}
}
pick.addEventListener('click',()=>input.click());input.addEventListener('change',()=>accept(input.files?.[0]));remove.addEventListener('click',clear);save.addEventListener('click',saveFile);
for(const type of ['dragenter','dragover'])zone.addEventListener(type,event=>{event.preventDefault();zone.classList.add('drag')});
for(const type of ['dragleave','drop'])zone.addEventListener(type,event=>{event.preventDefault();zone.classList.remove('drag')});
zone.addEventListener('drop',event=>accept(event.dataTransfer?.files?.[0]));
update();
})();


