// Recompose existing Reader commands. No PDF engine or edit/export code lives here.
const $=id=>document.getElementById(id);
const node=(tag,props={})=>Object.assign(document.createElement(tag),props);
export function installReaderShell(api,panels){
  const commands=new Map();
  for(const b of document.querySelectorAll('[id]'))commands.set(b.id,b);
  for(const panel of Object.values(panels))for(const b of panel.children)commands.set(b.id,b);
  const take=id=>$(id)||commands.get(id);
  function icon(b,label,asset){
    label??=b.textContent.trim();b.title=label;b.setAttribute('aria-label',label);b.classList.add('icon-button');
    if(asset){b.replaceChildren(node('img',{src:`./reader-icons/${asset}-duotone.svg`,alt:''}));}
    else {const image=b.querySelector('img');if(image)b.replaceChildren(image);}
    return b;
  }
  const header=document.querySelector('header'),toolbar=document.querySelector('.toolbar');
  const brand=header.querySelector('strong');brand.textContent='sReader';
  header.append($('tabs'),icon($('open'),'Mở PDF (Ctrl+O)','file-pdf'),icon($('save'),'Lưu thành… (Ctrl+Shift+S)','floppy-disk'));
  header.querySelector('.spacer')?.remove();
  const drag=node('div',{className:'title-drag',title:'Kéo cửa sổ · nhấp đúp để phóng to'}),caption=node('div',{id:'windowControls',hidden:true});
  header.append(drag,caption);
  const invoke=(action)=>window.__TAURI__.core.invoke('reader_window_control',{action});
  for(const [action,label,glyph]of [['minimize','Thu nhỏ','−'],['maximize','Phóng to / khôi phục','□'],['close','Đóng cửa sổ','×']]){
    const b=node('button',{id:'window-'+action,textContent:glyph,title:label});b.setAttribute('aria-label',label);
    b.onclick=api.attempt(async()=>{if(action==='close'){if([...api.documents.values()].some(d=>d.dirty)&&!confirm('Đóng cửa sổ và bỏ thay đổi chưa lưu?'))return;api.beforeClose();}await invoke(action);});caption.append(b);
  }
  drag.onpointerdown=api.attempt(e=>{if(e.button===0&&!caption.hidden)return invoke(e.detail===2?'maximize':'drag');});
  if(window.__TAURI__?.core)invoke('available').then(on=>{caption.hidden=!on;}).catch(()=>{});
  const left=node('div',{className:'toolbar-left'}),center=node('div',{className:'toolbar-center'}),right=node('div',{className:'toolbar-right'});
  toolbar.replaceChildren(left,center,right);
  for(const id of ['sideToggle','previous','pageNumber','pageCount','next'])left.append(take(id));
  function move(id,target){const b=take(id);if(!b)throw Error('Missing Reader command '+id);target.append(b);return b;}
  for(const id of ['selectText','pan','rotateView'])icon(move(id,left));
  for(const id of ['annot-ink','annot-highlight','annot-note','sign','annot-erase'])icon(move(id,center),id==='sign'?'Ký nhanh':undefined,({'annot-ink':'pen',sign:'signature','annot-erase':'eraser'})[id]);
  function popup(id,label,asset,host){
    const b=icon(node('button',{id,textContent:label}),label,asset),p=node('div',{id:id+'Panel',className:'command-popover'});
    p.setAttribute('popover','auto');b.setAttribute('popovertarget',p.id);b.setAttribute('aria-expanded','false');
    p.addEventListener('toggle',()=>b.setAttribute('aria-expanded',String(p.matches(':popover-open'))));
    p.addEventListener('click',e=>{if(e.target.closest('button,a'))p.hidePopover();});host.append(b);document.body.append(p);return p;
  }
  const markup=popup('moreAnnotations','Thêm công cụ chú thích','rectangle',center);
  markup.append(node('h3',{textContent:'Chú thích'}));
  for(const b of [...panels.comment.children])markup.append(b);
  const fill=popup('fillMenu','Điền & ký','cursor-text',center);
  fill.append(node('h3',{textContent:'Điền & ký'}));for(const b of [...panels.sign.children])fill.append(b);
  for(const id of ['query','findPrevious','findNext','matches'])move(id,right);
  icon(move('theme',right));
  const menu=popup('readerMenu','Menu','list',right);menu.append(node('h3',{textContent:'Tài liệu'}));
  function shortcut(label,target){const b=node('button',{textContent:label});b.onclick=()=>take(target).click();menu.append(b);}
  shortcut('Mở PDF…    Ctrl+O','open');shortcut('Lưu thành…    Ctrl+Shift+S','save');
  for(const b of [...panels.home.children])menu.append(b);
  const view=node('details'),summary=node('summary',{textContent:'Chế độ xem'});view.append(summary);menu.append(view);
  for(const b of [...panels.view.children])view.append(b);
  menu.append($('tools'));
  const zoom=node('div',{className:'zoom-pill',ariaLabel:'Thu phóng'});
  for(const id of ['zoomOut','zoom','zoomIn'])zoom.append(take(id));$('documents').append(zoom);
  const sidebar=$('sidebar'),strip=sidebar.querySelector('.sideTabs');sidebar.append(strip);
  const modes=[['showThumbs','Trang','squares-four'],['showOutline','Mục lục','list-bullets'],['showBookmarks','Dấu trang','bookmark-simple']];
  for(const [id,label,asset]of modes){const b=icon($(id),label,asset);b.addEventListener('click',()=>modes.forEach(([key])=>$(key).setAttribute('aria-pressed',String(key===id))));}strip.firstChild.setAttribute('aria-pressed','true');
  const night=node('button',{id:'pageNight',textContent:'Đảo màu trang'});night.setAttribute('aria-pressed','false');
  night.onclick=()=>{const on=document.body.classList.toggle('page-night');night.setAttribute('aria-pressed',String(on));};menu.append(night);
  const help=node('dialog',{id:'shortcutsDialog'});help.append(node('h2',{textContent:'Phím tắt'}));
  for(const [keys,label]of [['Ctrl+O','Mở PDF'],['Ctrl+F','Tìm trong tài liệu'],['Ctrl+Shift+S','Lưu thành bản PDF mới'],['Ctrl+Z / Ctrl+Y','Hoàn tác / làm lại chú thích'],['Ctrl+B','Đánh dấu trang'],['F9','Ẩn / hiện thanh bên'],['F1','Phím tắt'],['Esc','Đóng menu / hộp thoại']]){const p=node('p');p.append(node('kbd',{textContent:keys}),document.createTextNode('  '+label));help.append(p);}
  const close=node('button',{textContent:'Đóng'});close.onclick=()=>help.close();help.append(close);document.body.append(help);
  const helpButton=node('button',{id:'shortcuts',textContent:'Phím tắt    F1'});helpButton.onclick=()=>help.showModal();menu.append(helpButton);
  const settings=node('dialog',{id:'readerSettings'}),theme=node('select',{id:'readerTheme'}),invert=node('input',{id:'readerInvert',type:'checkbox'});
  for(const [value,label]of [['light','Sáng'],['dark','Tối']])theme.append(node('option',{value,textContent:label}));
  const themeLabel=node('label',{textContent:'Giao diện'}),invertLabel=node('label',{textContent:'Đảo màu trang'});themeLabel.append(theme);invertLabel.append(invert);
  theme.onchange=()=>{if(theme.value!==document.documentElement.dataset.theme)take('theme').click();};invert.onchange=()=>night.click();
  const done=node('button',{textContent:'Đóng'});done.onclick=()=>settings.close();settings.append(node('h2',{textContent:'Tùy chọn hiển thị'}),themeLabel,invertLabel,node('p',{textContent:'Màu giao diện được nhớ trên máy. Đảo màu trang chỉ đổi cách hiển thị; PDF lưu và chữ ký vẫn giữ màu gốc.'}),done);document.body.append(settings);
  const settingsButton=node('button',{id:'settings',textContent:'Tùy chọn hiển thị…'});settingsButton.onclick=()=>{theme.value=document.documentElement.dataset.theme;invert.checked=document.body.classList.contains('page-night');settings.showModal();};menu.append(settingsButton);
  document.addEventListener('keydown',e=>{const editing=e.target.closest('input,textarea,[contenteditable=true]');if(e.key==='F1'){e.preventDefault();if(!help.open)help.showModal();}if(e.key==='F9'){e.preventDefault();$('sideToggle').click();}if(e.ctrlKey&&!editing&&e.key.toLowerCase()==='b'){e.preventDefault();take('bookmarkAdd').click();}});
  // Keep the accessible title on every small original control.
  for(const b of document.querySelectorAll('.toolbar button,.zoom-pill button'))if(!b.title)b.title=b.getAttribute('aria-label')||b.textContent.trim();
}
