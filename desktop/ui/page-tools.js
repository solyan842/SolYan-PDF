(() => {
  const configs = {
    split: { operation:'split', title:'Tách PDF', suffix:'part', description:'Tách PDF thành các tệp theo số trang mỗi phần.', note:'Mỗi phần là một PDF riêng. Tệp gốc không bị thay đổi.' },
    'extract-pages': { operation:'extract', title:'Trích xuất trang', suffix:'extracted', description:'Lấy các trang đã chọn thành một PDF mới.', note:'Thứ tự trang xuất theo đúng dãy bạn nhập.' },
    reorder: { operation:'reorder', title:'Sắp xếp trang', suffix:'reordered', description:'Tạo PDF mới theo thứ tự trang bạn chỉ định.', note:'Nội dung trang được giữ; cấu trúc form/annotation tương tác có thể không được giữ nguyên.' },
    'remove-pages': { operation:'remove', title:'Xóa trang', suffix:'pages-removed', description:'Loại các trang đã chọn khỏi bản PDF kết quả.', note:'PDF nguồn được giữ nguyên. Không thể xóa hết trang của tài liệu.' },
    rotate: { operation:'rotate', title:'Xoay PDF', suffix:'rotated', description:'Xoay các trang đã chọn rồi tạo PDF mới.', note:'Xoay trang giữ nguyên nội dung trang và không ghi đè PDF nguồn.' },
    crop: { operation:'crop', title:'Cắt vùng trang', suffix:'cropped', description:'Điều chỉnh vùng hiển thị của các trang PDF.', note:'Cắt vùng hiển thị; nội dung ngoài vùng cắt vẫn có thể tồn tại trong PDF.' },
    metadata: { operation:'metadata', title:'Chỉnh thông tin PDF', suffix:'metadata', description:'Cập nhật tiêu đề, tác giả, chủ đề và từ khóa.', note:'Lưu metadata vào một tệp PDF mới.' },
    'page-numbers': { operation:'numbering', title:'Đánh số trang', suffix:'numbered', description:'Ghi số hiển thị trực tiếp lên từng trang PDF.', note:'Số trang được vẽ lên PDF, không thay đổi nhãn trang.' },
    bates: { operation:'bates', title:'Đánh số Bates', suffix:'bates', description:'Ghi mã Bates liên tiếp lên từng trang.', note:'Tiền tố Bates dùng chữ Latin cơ bản.' }
  };
  const mode = new URLSearchParams(location.search).get('tool') || '';
  const config = configs[mode];
  const $ = id => document.getElementById(id);
  const zone=$('dropzone'),input=$('fileInput'),pick=$('pickFile'),remove=$('removeFile');
  const selected=$('selectedFile'),name=$('fileName'),meta=$('fileMeta'),runBtn=$('runBtn'),status=$('status'),result=$('result');
  const pageRange=$('pageRange'),pageRangeGroup=$('pageRangeGroup'),orderGroup=$('orderGroup'),splitGroup=$('splitGroup'),rotationGroup=$('rotationGroup'),cropGroup=$('cropGroup'),metadataGroup=$('metadataGroup'),numberGroup=$('numberGroup');
  let sourceFile=null,sourceBytes=null,pageCount=0,busy=false,loading=false;

  if(!config){
    $('toolTitle').textContent='Công cụ chưa khả dụng';
    $('toolDescription').textContent='Cấu hình công cụ trang PDF không hợp lệ.';
    pick.disabled=true;runBtn.disabled=true;return;
  }
  document.title=config.title+' — SolYan PDF';
  $('breadcrumb').textContent='Công cụ › '+config.title;
  $('toolIcon').textContent=config.operation==='rotate'?'↻':config.operation==='split'?'✂':'▤';
  $('toolTitle').textContent=config.title;$('toolDescription').textContent=config.description;
  $('optionTitle').textContent=config.title;
  $('operationNote').textContent=config.note;
  pageRangeGroup.hidden=!['extract','remove','rotate'].includes(config.operation);
  orderGroup.hidden=config.operation!=='reorder';
  splitGroup.hidden=config.operation!=='split';
  rotationGroup.hidden=config.operation!=='rotate';
  cropGroup.hidden=config.operation!=='crop';
  metadataGroup.hidden=config.operation!=='metadata';
  numberGroup.hidden=!['numbering','bates'].includes(config.operation);
  if(config.operation==='numbering')$('batesPrefix').disabled=true;
  if(config.operation==='rotate'){pageRange.value='all';$('pageRangeLabel').textContent='Trang cần xoay';$('pageRangeHint').textContent='Nhập trang như 1,3-5 hoặc all.';}
  if(config.operation==='remove')$('pageRangeLabel').textContent='Trang cần xóa';

  function setStatus(text,kind=''){status.textContent=text;status.classList.remove('error','success');if(kind)status.classList.add(kind);}
  function update(){runBtn.disabled=!sourceFile||busy||loading;pick.disabled=busy||loading;remove.disabled=busy||loading;}
  function clearFile(){sourceFile=null;sourceBytes=null;pageCount=0;input.value='';selected.hidden=true;result.hidden=true;update();setStatus('Chọn một tệp PDF để bắt đầu.');}
  function setFile(file){
    if(!file)return;
    if(!file.name.toLocaleLowerCase().endsWith('.pdf')){setStatus('Chỉ hỗ trợ tệp PDF.','error');return;}
    if(!file.size||file.size>100*1024*1024){setStatus('PDF trống hoặc vượt giới hạn 100 MB.','error');return;}
    loading=true;sourceFile=null;sourceBytes=null;selected.hidden=true;result.hidden=true;update();setStatus('Đang đọc cấu trúc trang PDF…');
    file.arrayBuffer().then(async bytes=>{
      if(!window.PDFLib?.PDFDocument)throw new Error('PDF-lib chưa được đóng gói.');
      const pdf=await window.PDFLib.PDFDocument.load(bytes,{ignoreEncryption:false,updateMetadata:false});
      const count=pdf.getPageCount();
      if(!count||count>500)throw new Error('PDF phải có từ 1 đến 500 trang.');
      sourceFile=file;sourceBytes=bytes;pageCount=count;name.textContent=file.name;meta.textContent=count+' trang · '+(file.size/1048576).toFixed(2)+' MB';
      selected.hidden=false;
      if(config.operation==='reorder')$('pageOrder').value=Array.from({length:count},(_,i)=>i+1).join(',');
      setStatus('Đã đọc '+count+' trang. Sẵn sàng xử lý.');
    }).catch(error=>setStatus('Không đọc được PDF: '+(error?.message||error),'error')).finally(()=>{loading=false;update();});
  }
  function parsePages(value,total,allowAll=false){
    const text=String(value||'').trim();
    if(allowAll&&text.toLowerCase()==='all')return Array.from({length:total},(_,i)=>i);
    if(!text)throw new Error('Nhập ít nhất một số trang.');
    const pages=[],seen=new Set();
    for(const token of text.split(',')){
      const part=token.trim(),match=part.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if(!match)throw new Error('Dãy trang không hợp lệ. Dùng dạng 1,3-5.');
      const first=Number(match[1]),last=Number(match[2]||match[1]);
      if(first<1||last<first||last>total)throw new Error('Số trang phải nằm trong khoảng 1–'+total+'.');
      for(let page=first;page<=last;page++){
        if(seen.has(page))throw new Error('Không nhập trùng số trang.');
        seen.add(page);pages.push(page-1);
      }
    }
    return pages;
  }
  function createDownload(bytes,filename){
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;document.body.appendChild(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  async function makePdf(pdf,indices){
    const target=await window.PDFLib.PDFDocument.create();
    const pages=await target.copyPages(pdf,indices);
    for(const page of pages)target.addPage(page);
    return target.save({useObjectStreams:true});
  }
  async function run(){
    if(!sourceFile||busy||loading)return;
    busy=true;update();result.hidden=true;setStatus('Đang xử lý '+pageCount+' trang…');
    try{
      const pdf=await window.PDFLib.PDFDocument.load(sourceBytes,{ignoreEncryption:false,updateMetadata:false});
      let outputs=[];
      if(config.operation==='split'){
        const perPart=Number($('pagesPerPart').value);
        if(!Number.isInteger(perPart)||perPart<1||perPart>pageCount)throw new Error('Số trang mỗi tệp phải từ 1 đến '+pageCount+'.');
        const partCount=Math.ceil(pageCount/perPart);
        if(partCount>20)throw new Error('Giảm số tệp kết quả xuống tối đa 20 bằng cách tăng số trang mỗi tệp.');
        for(let start=0;start<pageCount;start+=perPart){
          const end=Math.min(pageCount,start+perPart),indices=Array.from({length:end-start},(_,i)=>start+i);
          const bytes=await makePdf(pdf,indices);
          outputs.push({bytes,name:window.SOLYAN_OUTPUT_NAME(sourceFile.name,'part-'+(outputs.length+1)+'-of-'+partCount)});
        }
      }else if(config.operation==='extract'){
        const pages=parsePages(pageRange.value,pageCount);
        outputs.push({bytes:await makePdf(pdf,pages),name:window.SOLYAN_OUTPUT_NAME(sourceFile.name,config.suffix)});
      }else if(config.operation==='remove'){
        const removePages=new Set(parsePages(pageRange.value,pageCount));
        if(removePages.size>=pageCount)throw new Error('Không thể xóa toàn bộ trang PDF.');
        const keep=Array.from({length:pageCount},(_,i)=>i).filter(i=>!removePages.has(i));
        outputs.push({bytes:await makePdf(pdf,keep),name:window.SOLYAN_OUTPUT_NAME(sourceFile.name,config.suffix)});
      }else if(config.operation==='reorder'){
        const order=parsePages($('pageOrder').value,pageCount);
        if(order.length!==pageCount)throw new Error('Thứ tự phải liệt kê đủ '+pageCount+' trang.');
        outputs.push({bytes:await makePdf(pdf,order),name:window.SOLYAN_OUTPUT_NAME(sourceFile.name,config.suffix)});
      }else if(config.operation==='crop'){
        const margins={left:Number($('cropLeft').value),right:Number($('cropRight').value),top:Number($('cropTop').value),bottom:Number($('cropBottom').value)};
        if(Object.values(margins).some(value=>!Number.isFinite(value)||value<0))throw new Error('Lề cắt phải là số không âm.');
        for(const page of pdf.getPages()){
          const box=page.getCropBox(),width=box.width-margins.left-margins.right,height=box.height-margins.top-margins.bottom;
          if(width<=0||height<=0)throw new Error('Lề cắt không được lớn hơn kích thước trang.');
          page.setCropBox(box.x+margins.left,box.y+margins.bottom,width,height);
        }
        outputs.push({bytes:await pdf.save({useObjectStreams:true}),name:window.SOLYAN_OUTPUT_NAME(sourceFile.name,config.suffix)});
      }else if(config.operation==='metadata'){
        const title=$('metaTitle').value.trim(),author=$('metaAuthor').value.trim(),subject=$('metaSubject').value.trim();
        const keywords=$('metaKeywords').value.split(',').map(value=>value.trim()).filter(Boolean);
        if(title)pdf.setTitle(title);if(author)pdf.setAuthor(author);if(subject)pdf.setSubject(subject);if(keywords.length)pdf.setKeywords(keywords);
        outputs.push({bytes:await pdf.save({useObjectStreams:true}),name:window.SOLYAN_OUTPUT_NAME(sourceFile.name,config.suffix)});
      }else if(config.operation==='numbering'||config.operation==='bates'){
        const start=Number($('numberStart').value),size=Number($('numberSize').value),prefix=$('batesPrefix').value.trim();
        if(!Number.isInteger(start)||start<1||start>999999999)throw new Error('Số bắt đầu phải từ 1 đến 999999999.');
        if(!Number.isFinite(size)||size<6||size>72)throw new Error('Cỡ chữ phải từ 6 đến 72 point.');
        if(config.operation==='bates'&&Array.from(prefix).some(ch=>ch.charCodeAt(0)<32||ch.charCodeAt(0)>126))throw new Error('Tiền tố Bates chỉ dùng chữ Latin cơ bản.');
        if(prefix.length>24)throw new Error('Tiền tố Bates tối đa 24 ký tự.');
        const font=await pdf.embedFont(window.PDFLib.StandardFonts.Helvetica),position=$('numberPosition').value;
        pdf.getPages().forEach((page,index)=>{
          const text=config.operation==='bates'?prefix+String(start+index).padStart(6,'0'):String(start+index);
          const {width,height}=page.getSize(),x=Math.max(8,(width-font.widthOfTextAtSize(text,size))/2),y=position==='top'?Math.max(8,height-size-12):10;
          page.drawText(text,{x,y,size,font,color:window.PDFLib.rgb(.2,.2,.2)});
        });
        outputs.push({bytes:await pdf.save({useObjectStreams:true}),name:window.SOLYAN_OUTPUT_NAME(sourceFile.name,config.suffix)});
      }else if(config.operation==='rotate'){
        const pages=parsePages(pageRange.value,pageCount,true),angle=Number($('rotation').value);
        for(const index of pages){const page=pdf.getPage(index),current=page.getRotation().angle;page.setRotation(window.PDFLib.degrees((current+angle)%360));}
        outputs.push({bytes:await pdf.save({useObjectStreams:true}),name:window.SOLYAN_OUTPUT_NAME(sourceFile.name,config.suffix)});
      }
      if(!outputs.length)throw new Error('Không tạo được kết quả.');
      for(const output of outputs)createDownload(output.bytes,output.name);
      $('resultMessage').textContent=config.operation==='split'?'Đã tạo '+outputs.length+' tệp PDF mới.':'Đã tạo '+outputs[0].name+'.';
      result.hidden=false;setStatus('Hoàn tất. PDF nguồn không bị thay đổi. Chọn Lưu/Lưu thành trong phần kết quả.','success');
    }catch(error){setStatus('Không thể xử lý PDF: '+(error?.message||error),'error');}
    finally{busy=false;update();}
  }
  pick.addEventListener('click',()=>input.click());
  input.addEventListener('change',()=>setFile(input.files?.[0]));
  remove.addEventListener('click',clearFile);
  runBtn.addEventListener('click',run);
  for(const type of ['dragenter','dragover'])zone.addEventListener(type,event=>{event.preventDefault();zone.classList.add('drag')});
  for(const type of ['dragleave','drop'])zone.addEventListener(type,event=>{event.preventDefault();zone.classList.remove('drag')});
  zone.addEventListener('drop',event=>setFile(event.dataTransfer?.files?.[0]));
  update();
})();



