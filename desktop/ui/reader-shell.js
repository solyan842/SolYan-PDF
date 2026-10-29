// Recompose existing Reader commands. No PDF engine or edit/export code lives here.
import { t } from './reader-language.js';
import {defaultPdfCheckEnabled,setDefaultPdfCheckEnabled,openPdfDefaultSettings} from './reader-default-app.js';
const $=id=>document.getElementById(id);
const node=(tag,props={})=>Object.assign(document.createElement(tag),props);
export function installReaderShell(api,panels){
  const commands=new Map();
  for(const b of document.querySelectorAll('[id]'))commands.set(b.id,b);
  for(const panel of Object.values(panels))for(const b of panel.children)commands.set(b.id,b);
  const take=id=>$(id)||commands.get(id);
  function icon(b,label,asset){
    label??=b.textContent.trim();b.title=label;b.setAttribute('aria-label',label);b.classList.add('icon-button');
    if(asset){b.replaceChildren(node('img',{src:`./reader-icons/${asset}-outline.svg`,alt:''}));}
    else {const image=b.querySelector('img');if(image)b.replaceChildren(image);}
    return b;
  }
  const header=document.querySelector('header'),toolbar=document.querySelector('.toolbar');
  const brand=header.querySelector('strong');brand.textContent='sReader';
  header.append(icon($('open'),'Mở PDF (Ctrl+O)','file-pdf'),icon($('saveCurrent'),'Lưu (Ctrl+S)','floppy-disk'),icon($('save'),'Lưu thành… (Ctrl+Shift+S)','copy'),$('tabs'));
  header.querySelector('.spacer')?.remove();
  const drag=node('div',{className:'title-drag',title:'Kéo cửa sổ · nhấp đúp để phóng to'}),caption=node('div',{id:'windowControls',hidden:true});
  const tools=$('tools');tools.replaceChildren(node('img',{src:'./vendor/sTool_PDF.png',alt:''}),node('span',{textContent:'sTool PDF ↗'}));
  header.append(drag,tools,caption);
  const invoke=(action)=>window.__TAURI__.core.invoke('reader_window_control',{action});
  for(const [action,label,glyph]of [['minimize','Thu nhỏ','−'],['maximize','Phóng to / khôi phục','□'],['close','Đóng cửa sổ','×']]){
    const b=node('button',{id:'window-'+action,textContent:glyph,title:label});b.setAttribute('aria-label',label);
    b.onclick=api.attempt(async()=>{if(action==='close'){if([...api.documents.values()].some(d=>d.dirty)&&!confirm(t('Đóng cửa sổ và bỏ thay đổi chưa lưu?')))return;await api.beforeClose();}await invoke(action);});caption.append(b);
  }
  // Native start_dragging on the FIRST pointerdown consumes the second click,
  // so WebView2 never delivers a usable dblclick. Start a drag only after the
  // pointer has actually moved; a true double-click toggles OS maximize/restore.
  let pendingDrag=null;
  drag.addEventListener('pointerdown',event=>{
    if(event.button!==0||caption.hidden)return;
    pendingDrag={id:event.pointerId,x:event.clientX,y:event.clientY};
  });
  drag.addEventListener('pointermove',api.attempt(async event=>{
    if(!pendingDrag||event.pointerId!==pendingDrag.id||caption.hidden)return;
    if(Math.hypot(event.clientX-pendingDrag.x,event.clientY-pendingDrag.y)<6)return;
    pendingDrag=null;
    await invoke('drag');
  }));
  for(const eventName of ['pointerup','pointercancel','pointerleave']){
    drag.addEventListener(eventName,()=>{pendingDrag=null;});
  }
  drag.addEventListener('dblclick',api.attempt(async event=>{
    if(event.button!==0||caption.hidden)return;
    event.preventDefault();
    pendingDrag=null;
    await invoke('maximize');
  }));
  if(window.__TAURI__?.core)invoke('available').then(on=>{caption.hidden=!on;}).catch(()=>{});
  const left=node('div',{className:'toolbar-left'}),center=node('div',{className:'toolbar-center'}),right=node('div',{className:'toolbar-right'});
  toolbar.replaceChildren(left,center,right);
  left.append(take('sideToggle'));
  function move(id,target){const b=take(id);if(!b)throw Error('Missing Reader command '+id);target.append(b);return b;}
  for(const id of ['selectText','pan','rotateView'])icon(move(id,left));
  icon(move('bookmarkAdd',left),'Đánh dấu trang','bookmark-simple');
  for(const id of ['annot-ink','annot-highlight','annot-note','typewriter','sign','annot-erase'])icon(move(id,center),id==='sign'?'Ký nhanh':undefined,({'annot-ink':'pen',sign:'signature','annot-erase':'eraser'})[id]);
  function popup(id,label,asset,host){
    const b=icon(node('button',{id,textContent:label}),label,asset),p=node('div',{id:id+'Panel',className:'command-popover'});
    p.setAttribute('popover','auto');b.setAttribute('popovertarget',p.id);b.setAttribute('aria-expanded','false');
    p.addEventListener('toggle',()=>b.setAttribute('aria-expanded',String(p.matches(':popover-open'))));
    p.addEventListener('click',e=>{if(e.target.closest('button,a'))p.hidePopover();});host.append(b);document.body.append(p);return p;
  }
  const markup=popup('moreAnnotations','Thêm công cụ chú thích','rectangle',center);
  // The format settings are docked on the right; no detached pen/color popover.
  // Retain the color inputs as hidden state mirrors for the annotation engine.
  const styleState=take('annotationStyles');styleState.hidden=true;document.body.append(styleState);
  markup.append(node('h3',{textContent:'Chú thích'}));
  for(const b of [...panels.comment.children])markup.append(b);
  const fill=popup('fillMenu','Điền & ký','note-pencil',center);
  fill.append(node('h3',{textContent:'Điền & ký'}));for(const b of [...panels.sign.children])fill.append(b);
  for(const id of ['query','findPrevious','findNext','matches'])move(id,right);
  icon(move('theme',right));
  const menu=popup('readerMenu','Menu','list',right);menu.append(node('h3',{textContent:'Tài liệu'}));
  function shortcut(label,target){const b=node('button',{textContent:label});b.onclick=()=>take(target).click();menu.append(b);}
  shortcut('Mở PDF…    Ctrl+O','open');shortcut('Lưu    Ctrl+S','saveCurrent');shortcut('Lưu thành…    Ctrl+Shift+S','save');
  for(const b of [...panels.home.children])menu.append(b);
  const view=node('details'),summary=node('summary',{textContent:'Chế độ xem'});view.append(summary);menu.append(view);
  for(const b of [...panels.view.children])view.append(b);
  shortcut('Trình chiếu tài liệu (F11)','presentation');
  // Read metadata from the existing PDF.js document, never from a native
  // unrestricted path and never update the input PDF or pending annotations.
  const properties=node('dialog',{id:'readerProperties'});
  properties.setAttribute('aria-labelledby','readerPropertiesTitle');
  const propertiesTitle=node('h2',{id:'readerPropertiesTitle',textContent:'Thuộc tính tài liệu'});
  const propertiesDetails=node('dl',{id:'readerPropertiesDetails'});
  const propertiesClose=node('button',{id:'readerPropertiesClose',textContent:'Đóng'});
  propertiesClose.onclick=()=>properties.close();
  properties.append(propertiesTitle,propertiesDetails,propertiesClose);
  document.body.append(properties);
  const propertiesButton=node('button',{id:'documentProperties',textContent:'Thuộc tính tài liệu…'});
  propertiesButton.onclick=api.attempt(async()=>{
    const selected=api.current();
    if(!selected){api.message(t('Mở PDF trước.'));return;}
    const [metadata,page,sourceBytes]=await Promise.all([selected.pdf.getMetadata(),selected.pdf.getPage(1),api.readSourceBytes(selected)]);
    // A document may be closed or another tab activated while metadata loads.
    if(!api.documents.has(selected.id)||api.current()!==selected)return;
    const info=metadata?.info||{};
    const format=value=>{
      if(value===null||value===undefined||value==='')return t('Không có thông tin');
      // Metadata is untrusted PDF text: textContent only, no HTML.
      return String(value).replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,500)||t('Không có thông tin');
    };
    const pageWidth=Math.abs(page.view[2]-page.view[0]);
    const pageHeight=Math.abs(page.view[3]-page.view[1]);
    const formatPoint=value=>Number(value.toFixed(2)).toLocaleString(document.documentElement.lang==='en'?'en-US':'vi-VN');
    const size=(sourceBytes.byteLength/1024).toLocaleString(document.documentElement.lang==='en'?'en-US':'vi-VN',{maximumFractionDigits:1});
    const fields=[
      ['file','Tên tệp',selected.name],
      ['pages','Số trang',selected.pdf.numPages],
      ['size','Dung lượng',size+' KB'],
      ['firstPage','Kích thước trang đầu',formatPoint(pageWidth)+' × '+formatPoint(pageHeight)+' pt'],
      ['version','Phiên bản PDF',info.PDFFormatVersion],
      ['title','Tiêu đề',info.Title],
      ['author','Tác giả',info.Author],
      ['subject','Chủ đề',info.Subject],
      ['keywords','Từ khóa',info.Keywords],
      ['creator','Ứng dụng tạo',info.Creator],
      ['producer','Phần mềm PDF',info.Producer],
      ['created','Ngày tạo',info.CreationDate],
      ['modified','Ngày sửa',info.ModDate]
    ];
    propertiesDetails.replaceChildren();
    for(const [key,label,value]of fields){
      const term=node('dt',{textContent:t(label)}),description=node('dd',{textContent:format(value)});
      description.dataset.property=key;
      propertiesDetails.append(term,description);
    }
    propertiesTitle.textContent=t('Thuộc tính tài liệu');
    propertiesClose.textContent=t('Đóng');
    properties.showModal();
  });
  menu.append(propertiesButton);
  const footer=node('footer',{id:'readerFooter'}),navigation=node('div',{className:'footer-navigation'}),views=node('div',{className:'footer-views'}),zoom=node('div',{className:'zoom-pill',ariaLabel:'Thu phóng'});
  const first=node('button',{id:'firstPage',textContent:'«',title:'Trang đầu'}),last=node('button',{id:'lastPage',textContent:'»',title:'Trang cuối'});first.setAttribute('aria-label','Trang đầu');last.setAttribute('aria-label','Trang cuối');first.onclick=()=>{if(api.current())api.current().view.currentPageNumber=1;};last.onclick=()=>{if(api.current())api.current().view.currentPageNumber=api.current().pdf.numPages;};
  take('previous').textContent='‹';take('next').textContent='›';navigation.append(first);for(const id of ['previous','pageNumber','pageCount','next'])navigation.append(take(id));navigation.append(last);
  for(const id of ['singlePage','continuous','twoPage'])icon(move(id,views),undefined,({singlePage:'page-single',continuous:'page-continuous',twoPage:'pages-two'})[id]);
  const slider=node('input',{id:'zoomRange',type:'range',min:25,max:400,step:5,value:100});slider.setAttribute('aria-label','Thu phóng');slider.title='Thu phóng';slider.oninput=()=>{const select=take('zoom');let option=select.querySelector('[data-slider]');if(!option){option=node('option');option.dataset.slider='true';select.append(option);}option.value=String(Number(slider.value)/100);option.textContent=slider.value+'%';select.value=option.value;select.dispatchEvent(new Event('change'));};
  zoom.append(take('zoomOut'),slider,take('zoom'),take('zoomIn'));
  const message=node('span',{id:'status',textContent:$('status').textContent});message.setAttribute('role','status');message.setAttribute('aria-live','polite');$('status').replaceWith(footer);footer.append(navigation,message,views,zoom,icon(move('presentation',footer),undefined,'presentation'));
  const sidebar=$('sidebar'),strip=sidebar.querySelector('.sideTabs');sidebar.append(strip);
  const modes=[['showThumbs','Trang','squares-four'],['showOutline','Mục lục','list-bullets'],['showBookmarks','Dấu trang','bookmark-simple']];
  for(const [id,label,asset]of modes){const b=icon($(id),label,asset);b.addEventListener('click',()=>modes.forEach(([key])=>$(key).setAttribute('aria-pressed',String(key===id))));}strip.firstChild.setAttribute('aria-pressed','true');
  const night=node('button',{id:'pageNight',textContent:'Đảo màu trang'});night.setAttribute('aria-pressed','false');
  night.onclick=()=>{const on=document.body.classList.toggle('page-night');night.setAttribute('aria-pressed',String(on));};menu.append(night);
  const help=node('dialog',{id:'shortcutsDialog'});help.append(node('h2',{textContent:'Phím tắt'}));
  for(const [keys,label]of [['Ctrl+O','Mở PDF'],['Ctrl+F','Tìm trong tài liệu'],['Ctrl+S','Lưu'],['Ctrl + lăn chuột','Thu phóng'],['Ctrl+Shift+S','Lưu thành bản PDF mới'],['Ctrl+Z / Ctrl+Y','Hoàn tác / làm lại chú thích'],['Delete','Xóa đối tượng đang chọn'],['Ctrl+B','Đánh dấu trang'],['F9','Ẩn / hiện thanh bên'],['F11','Trình chiếu tài liệu'],['← / → · PgUp / PgDn','Trang trước / sau khi trình chiếu'],['F1','Phím tắt'],['Esc','Thoát trình chiếu / đóng hộp thoại']]){const p=node('p');p.append(node('kbd',{textContent:keys}),document.createTextNode('  '+label));help.append(p);}
  const close=node('button',{textContent:'Đóng'});close.onclick=()=>help.close();help.append(close);document.body.append(help);
  const helpButton=node('button',{id:'shortcuts',textContent:'Phím tắt    F1'});helpButton.onclick=()=>help.showModal();menu.append(helpButton);
  const settings=node('dialog',{id:'readerSettings'}),theme=node('select',{id:'readerTheme'}),invert=node('input',{id:'readerInvert',type:'checkbox'});
  for(const [value,label]of [['light','Sáng'],['dark','Tối']])theme.append(node('option',{value,textContent:label}));
  const themeLabel=node('label',{textContent:'Giao diện'}),invertLabel=node('label',{textContent:'Đảo màu trang'});themeLabel.append(theme);invertLabel.append(invert);
  theme.onchange=()=>{if(theme.value!==document.documentElement.dataset.theme)take('theme').click();};invert.onchange=()=>night.click();
  const defaultCheck=node('input',{id:'readerSettingsCheckDefault',type:'checkbox'});
  const checkLabel=node('label',{textContent:'Luôn kiểm tra ứng dụng PDF mặc định khi mở sReader'});checkLabel.append(defaultCheck);
  defaultCheck.onchange=()=>setDefaultPdfCheckEnabled(defaultCheck.checked);
  const chooseDefault=node('button',{id:'readerSettingsChooseDefault',textContent:'Chọn sReader làm ứng dụng mở PDF mặc định…'});
  chooseDefault.onclick=api.attempt(()=>openPdfDefaultSettings());
  const defaultSection=node('div',{className:'reader-default-setting'});
  defaultSection.append(checkLabel,chooseDefault);
  defaultSection.hidden=!window.__TAURI__?.core;
  const done=node('button',{textContent:'Đóng'});done.onclick=()=>settings.close();
  settings.append(node('h2',{textContent:'Tùy chọn hiển thị'}),themeLabel,invertLabel,node('p',{textContent:'Màu giao diện được nhớ trên máy. Đảo màu trang chỉ đổi cách hiển thị; PDF lưu và chữ ký vẫn giữ màu gốc.'}),defaultSection,done);
  document.body.append(settings);
  const settingsButton=node('button',{id:'settings',textContent:'Tùy chọn hiển thị…'});
  settingsButton.onclick=()=>{theme.value=document.documentElement.dataset.theme;invert.checked=document.body.classList.contains('page-night');defaultCheck.checked=defaultPdfCheckEnabled();settings.showModal();};menu.append(settingsButton);
  const about=node('dialog',{id:'readerAbout'}),logo=node('img',{src:'./vendor/sReader_PDF.png',alt:'sReader PDF',className:'about-logo'}),version=node('span',{id:'aboutVersion',textContent:'…'});
  about.append(logo,node('h2',{textContent:'sReader PDF'}));
  const email=node('a',{href:'mailto:yansign841@gmail.com',textContent:'yansign841@gmail.com'});
  const website=node('a',{href:'https://www.youtube.com/@SolYan-Music',textContent:'https://www.youtube.com/@SolYan-Music',target:'_blank',rel:'noopener noreferrer'});
  for(const [link,kind]of [[email,'email'],[website,'website']]){
    link.addEventListener('click',api.attempt(async event=>{
      if(!window.__TAURI__?.core)return; // Normal browser: keep native link navigation.
      event.preventDefault();
      // WebView2 does not automatically forward target=_blank to the user's
      // default browser. The native command opens only fixed About URLs.
      await window.__TAURI__.core.invoke('reader_open_external',{kind});
    }));
  }
  for(const [label,value]of [['Phiên bản',version],['Tác giả','Hoang Minh Anh / SolYan84'],['Email',email],['Website',website]]){const row=node('p');row.append(node('strong',{textContent:label+': '}),typeof value==='string'?document.createTextNode(value):value);about.append(row);}
  const aboutClose=node('button',{textContent:'Đóng'});aboutClose.onclick=()=>about.close();about.append(aboutClose);document.body.append(about);
  const aboutButton=node('button',{id:'about',textContent:'Giới thiệu…'});aboutButton.onclick=api.attempt(async()=>{about.showModal();let value;try{value=await window.__TAURI__?.core?.invoke('reader_version');}catch{}if(typeof value!=='string')value=(await(await fetch('./vendor/reader-version.json')).json()).version;version.textContent=value;});menu.append(aboutButton);
  document.addEventListener('keydown',e=>{const editing=e.target.closest('input,textarea,[contenteditable=true]');if(e.key==='F1'){e.preventDefault();if(!help.open)help.showModal();}if(e.key==='F9'){e.preventDefault();$('sideToggle').click();}if(e.ctrlKey&&!editing&&e.key.toLowerCase()==='b'){e.preventDefault();take('bookmarkAdd').click();}});
  // Keep the accessible title on every small original control.
  for(const b of document.querySelectorAll('.toolbar button,.zoom-pill button'))if(!b.title)b.title=b.getAttribute('aria-label')||b.textContent.trim();
}
