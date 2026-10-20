// Shared, docked Format inspector for Reader ink, highlighting and Typewriter.
// No external runtime, toolbar duplication, modal dialog or PDF rasterization.
const PALETTE=['#ffe000','#77dff2','#adfa71','#ea69b8','#fa3434','#7a67dc','#188fcf','#2a9c22','#3067e2','#121821','#898e95','#ffffff'];
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const node=(tag,props={},text='')=>Object.assign(document.createElement(tag),props,{textContent:text});
const makeButton=(id,label,title=label)=>node('button',{type:'button',id,title,'aria-label':title},label);
export function installReaderFormat({textDialog,textInput,fontSelect,sizeInput,textColor,
  onAnnotationChange,onArrange,onClose,onTextChange}){
  const root=node('aside',{id:'readerFormatPanel',hidden:true});
  root.setAttribute('aria-label','Format · Định dạng');
  const header=node('div',{className:'format-header'});
  const heading=node('strong',{id:'readerFormatTitle'},'Format');
  const close=makeButton('readerFormatClose','×','Đóng Format');
  close.onclick=onClose;header.append(heading,close);
  const scroller=node('div',{className:'format-scroll'});
  const previewSection=node('section',{className:'format-section'});
  const previewHeading=node('h3',{},'Xem trước · Preview');
  const preview=node('div',{id:'readerFormatPreview',className:'format-preview'});
  preview.setAttribute('aria-live','polite');
  previewSection.append(previewHeading,preview);
  const annotationSection=node('section',{id:'readerAnnotationFormat',className:'format-section'});
  const styleHeading=node('h3',{id:'readerStyleTitle'},'Kiểu tô sáng');
  const palette=node('div',{id:'formatColorPalette',className:'format-palette'});
  const customRow=node('label',{className:'format-custom-color'});
  const customColor=node('input',{id:'formatCustomColor',type:'color',value:'#ffe000'});
  customColor.setAttribute('aria-label','Màu tùy chỉnh');
  customRow.append(document.createTextNode('Màu tùy chỉnh'),customColor);
  const paletteRow=node('div',{className:'format-palette-row'});
  for(const color of PALETTE){
    const button=makeButton('', '', 'Chọn màu '+color);
    button.className='format-color';button.dataset.color=color;button.style.background=color;
    button.onclick=()=>{customColor.value=color;applyAnnotation({color});};
    palette.append(button);
  }
  paletteRow.append(palette,customRow);
  const widthRow=node('label',{className:'format-inline',id:'formatPenWidthRow'});
  const widthSelect=node('select',{id:'formatPenWidth'});
  for(const width of [1,2,3,4,6,8])widthSelect.append(node('option',{value:String(width)},width.toFixed(1)+' pt'));
  widthRow.append(document.createTextNode('Độ dày nét'),widthSelect);
  const opacityRow=node('label',{className:'format-inline'});
  const opacityLabel=node('span',{},'Độ mờ');
  const opacity=node('input',{id:'formatOpacity',type:'range',min:0,max:100,step:1,value:30});
  const opacityValue=node('output',{id:'formatOpacityValue'},'30%');
  opacityRow.append(opacityLabel,opacity,opacityValue);
  annotationSection.append(styleHeading,paletteRow,widthRow,opacityRow);
  const textSection=node('section',{id:'readerTextFormat',className:'format-section'});
  textSection.append(node('h3',{},'Kiểu chữ · Text Style'),textDialog);
  const textTools=node('div',{id:'readerTextFormatting',className:'format-text-tools'});
  const flags={};
  for(const [key,symbol,label]of [['bold','B','In đậm'],['italic','I','In nghiêng'],['underline','U','Gạch dưới'],['strike','S','Gạch ngang']]){
    const button=makeButton('formatText'+key[0].toUpperCase()+key.slice(1),symbol,label);
    button.dataset.style=key;button.setAttribute('aria-pressed','false');
    flags[key]=button;textTools.append(button);
    button.onclick=()=>{button.setAttribute('aria-pressed',String(button.getAttribute('aria-pressed')!=='true'));notifyText();};
  }
  const alignment=node('div',{id:'formatTextAlignment',className:'format-text-align'});
  let alignValue='left';
  const alignButtons={};
  for(const [key,symbol,label]of [['left','≡','Căn trái'],['center','≡','Căn giữa'],['right','≡','Căn phải']]){
    const b=makeButton('formatAlign'+key[0].toUpperCase()+key.slice(1),symbol,label);
    b.dataset.align=key;b.setAttribute('aria-pressed',String(key==='left'));alignButtons[key]=b;
    b.onclick=()=>{alignValue=key;for(const [id,el]of Object.entries(alignButtons))el.setAttribute('aria-pressed',String(id===key));notifyText();};
    alignment.append(b);
  }
  const spacingRow=node('label',{className:'format-inline'});
  const spacing=node('select',{id:'formatLineSpacing'});
  for(const v of [1,1.15,1.25,1.5,1.75,2])spacing.append(node('option',{value:String(v)},String(v)+' ×'));
  spacing.value='1.25';spacingRow.append(document.createTextNode('Giãn dòng'),spacing);
  spacing.onchange=notifyText;
  textSection.append(textTools,alignment,spacingRow);
  const arrange=node('section',{id:'readerFormatArrange',className:'format-section'});
  arrange.append(node('h3',{},'Sắp xếp · Arrange'));
  const arrangeLabel=node('div',{className:'format-group-label'},'Căn giữa trang · Page Center');
  const centerTools=node('div',{className:'format-arrange-row'});
  for(const [id,label,symbol]of [['centerX','Giữa trang theo chiều ngang','⇔'],['centerY','Giữa trang theo chiều dọc','⇕']]){
    const b=makeButton('format'+id,label==='Giữa trang theo chiều ngang'?'↔':'↕',label);centerTools.append(b);b.onclick=()=>onArrange(id);
  }
  arrange.append(arrangeLabel,centerTools,node('div',{className:'format-group-label'},'Căn chỉnh · Alignment'));
  const alignTools=node('div',{className:'format-arrange-row'});
  for(const [id,symbol,label]of [['left','⫷','Căn trái'],['hcenter','↔','Căn ngang'],['right','⫸','Căn phải'],['top','⇡','Căn trên'],['vcenter','↕','Căn dọc'],['bottom','⇣','Căn dưới']]){
    const b=makeButton('formatArrange'+id,symbol,label);alignTools.append(b);b.onclick=()=>onArrange(id);
  }
  arrange.append(alignTools,node('div',{className:'format-group-label'},'Phân bố · Distribute'));
  const distributeTools=node('div',{className:'format-arrange-row'});
  for(const [id,symbol,label]of [['distributeX','⋯','Phân bố ngang: cần chọn ít nhất 3 đối tượng'],['distributeY','⋮','Phân bố dọc: cần chọn ít nhất 3 đối tượng']]){
    const b=makeButton('formatArrange'+id,symbol,label);b.disabled=true;
    distributeTools.append(b);
  }
  arrange.append(distributeTools);
  scroller.append(previewSection,annotationSection,textSection,arrange);
  root.append(header,scroller);document.querySelector('main').append(root);
  const defaults={ink:{color:'#2459c3',opacity:1,strokeWidth:2},
    highlight:{color:'#ffcf4a',opacity:.3,strokeWidth:2}};
  let currentKind='ink',currentItem=null;
  function currentStyle(){
    const selected=currentItem?.kind===currentKind?currentItem:null;
    return selected||defaults[currentKind];
  }
  function updatePreview(){
    const style=currentStyle();
    if(currentKind==='text'){
      const line=textInput.value.trim()||'Sample · Mẫu chữ';
      const text=node('div',{className:'format-preview-text'},line.slice(0,90));
      text.style.fontFamily=fontSelect.options[fontSelect.selectedIndex]?.textContent||'Arial';
      text.style.fontSize=clamp(Number(sizeInput.value)||14,8,48)+'px';
      text.style.color=textColor.value;
      text.style.fontWeight=flags.bold.getAttribute('aria-pressed')==='true'?'700':'400';
      text.style.fontStyle=flags.italic.getAttribute('aria-pressed')==='true'?'italic':'normal';
      text.style.textDecoration=[flags.underline.getAttribute('aria-pressed')==='true'?'underline':'',flags.strike.getAttribute('aria-pressed')==='true'?'line-through':''].filter(Boolean).join(' ');
      text.style.textAlign=alignValue;preview.replaceChildren(text);return;
    }
    const stroke=node('div',{className:'format-preview-stroke'});
    stroke.style.background=style.color;stroke.style.opacity=String(style.opacity);
    stroke.style.height=currentKind==='highlight'?'16px':Math.max(2,style.strokeWidth)+'px';
    stroke.style.borderRadius=currentKind==='highlight'?'1px':'10px';
    stroke.style.transform=currentKind==='ink'?'rotate(-7deg)':'none';
    preview.replaceChildren(stroke);
  }
  function reflectStyle(){
    if(currentKind==='text'){updatePreview();return;}
    const s=currentStyle();customColor.value=s.color;
    opacity.value=String(Math.round(s.opacity*100));opacityValue.textContent=opacity.value+'%';
    widthSelect.value=String(s.strokeWidth||2);
    for(const b of palette.children)b.setAttribute('aria-pressed',String(b.dataset.color.toLowerCase()===s.color.toLowerCase()));
    updatePreview();
  }
  function applyAnnotation(patch){
    Object.assign(defaults[currentKind],patch);
    if(currentItem?.kind===currentKind)onAnnotationChange(currentItem,patch);
    reflectStyle();
  }
  customColor.oninput=()=>applyAnnotation({color:customColor.value});
  opacity.oninput=()=>applyAnnotation({opacity:clamp(Number(opacity.value)/100,0,1)});
  widthSelect.onchange=()=>applyAnnotation({strokeWidth:clamp(Number(widthSelect.value),1,8)});
  function notifyText(){updatePreview();onTextChange?.();}
  for(const input of [fontSelect,sizeInput,textColor,textInput])input.addEventListener('input',notifyText);
  function textStyles(){
    const result={align:alignValue,lineSpacing:Number(spacing.value)};
    for(const [key,b]of Object.entries(flags))result[key]=b.getAttribute('aria-pressed')==='true';
    return result;
  }
  function loadTextStyles(styles={}){
    alignValue=['left','center','right'].includes(styles.align)?styles.align:'left';
    for(const [key,b]of Object.entries(flags))b.setAttribute('aria-pressed',String(Boolean(styles[key])));
    for(const [key,b]of Object.entries(alignButtons))b.setAttribute('aria-pressed',String(key===alignValue));
    spacing.value=String(styles.lineSpacing||1.25);
    if(!spacing.value)spacing.value='1.25';
    updatePreview();
  }
  function show(kind,item=null){
    if(!['ink','highlight','text'].includes(kind))return hide();
    currentKind=kind;currentItem=item?.kind===kind?item:null;
    root.hidden=false;document.body.dataset.formatKind=kind;
    annotationSection.hidden=kind==='text';textSection.hidden=kind!=='text';
    widthRow.hidden=kind!=='ink';
    styleHeading.textContent=kind==='ink'?'Kiểu bút vẽ · Pencil Style':'Kiểu tô sáng · Highlight Style';
    if(kind==='text'){
      if(!textDialog.open)textDialog.show();updatePreview();
    }else{if(textDialog.open)textDialog.close();reflectStyle();}
  }
  function hide(){
    root.hidden=true;delete document.body.dataset.formatKind;
    currentItem=null;if(textDialog.open)textDialog.close();
  }
  function selected(item){
    if(item&&['ink','highlight'].includes(item.kind))show(item.kind,item);
    else if(item?.kind==='text')show('text',item);
    else if(!item&&root.hidden===false&&currentKind!=='text')reflectStyle();
  }
  function getAnnotationStyle(kind){return {...(defaults[kind]||defaults.ink)};}
  return {root,show,hide,selected,updatePreview,textStyles,loadTextStyles,getAnnotationStyle,
    hasVisibleFormat:()=>!root.hidden};
}
