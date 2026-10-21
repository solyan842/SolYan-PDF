// A separate, bounded PDF.js render surface. The editable viewer stays intact.
export function installPresentation(api){
  const stage=document.createElement('section');stage.id='presentationStage';stage.hidden=true;stage.tabIndex=-1;stage.setAttribute('aria-label','Trình chiếu tài liệu');
  const area=document.createElement('div');area.id='presentationViewport';stage.append(area);
  // No floating toolbar or hints can obscure PDF pages in presentation.
  // Keyboard + / - / 0, Ctrl+wheel, and Esc continue working.
  document.body.append(stage);
  let session=null,exiting=false,resizeFrame=0;
  const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  const native=action=>window.__TAURI__.core.invoke('reader_window_control',{action});
  async function draw(){
    const s=session;if(!s)return;const generation=++s.generation;s.task?.cancel();
    const page=await s.doc.pdf.getPage(s.page);if(session!==s||generation!==s.generation)return;
    const rotation=(page.rotate+s.rotation)%360,base=page.getViewport({scale:1,rotation});
    const scale=Math.min((area.clientWidth-16)/base.width,(area.clientHeight-16)/base.height)*s.zoomFactor;
    if(!(scale>0))return;
    const viewport=page.getViewport({scale,rotation});
    const output=Math.min(devicePixelRatio||1,2,Math.sqrt(12_000_000/(viewport.width*viewport.height)));
    const paper=document.createElement('div');paper.className='presentation-paper';paper.style.width=`${viewport.width}px`;paper.style.height=`${viewport.height}px`;
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.floor(viewport.width*output));canvas.height=Math.max(1,Math.floor(viewport.height*output));canvas.style.width='100%';canvas.style.height='100%';paper.append(canvas);
    s.task=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:[output,0,0,output,0,0]});
    try{await s.task.promise;}catch(error){if(error.name==='RenderingCancelledException')return;throw error;}
    if(session!==s||generation!==s.generation)return;
    for(const item of s.doc.placements.filter(item=>item.page===s.page-1)){
      const overlay=document.createElement('div');overlay.className='presentation-mark';
      const bounds=window.ReaderEdits.frame(item,viewport);Object.assign(overlay.style,{left:`${bounds.left}px`,top:`${bounds.top}px`,width:`${bounds.width}px`,height:`${bounds.height}px`,transform:bounds.transform});
      if(item.kind)overlay.append(api.visual(item));else{const image=document.createElement('img');image.src=item.image;image.alt='';overlay.append(image);}
      paper.append(overlay);
    }
    area.replaceChildren(paper);
    if(s.centerAfterDraw){area.scrollLeft=(area.scrollWidth-area.clientWidth)/2;area.scrollTop=(area.scrollHeight-area.clientHeight)/2;s.centerAfterDraw=false;}
    stage.dataset.page=String(s.page);stage.dataset.pages=String(s.doc.pdf.numPages);stage.dataset.zoom=String(s.zoomFactor);
  }
  function redraw(){void draw().catch(error=>{api.message('Không thể trình chiếu: '+error.message);void exit();});}
  function setZoom(z){if(!session)return;z=Math.max(.5,Math.min(4,Math.round(z*1000)/1000));if(z===session.zoomFactor)return;session.zoomFactor=z;session.centerAfterDraw=true;redraw();}
  function changeZoom(step){if(session)setZoom(session.zoomFactor*step);}
  stage.addEventListener('wheel',event=>{if(!session||!event.ctrlKey)return;event.preventDefault();event.stopPropagation();changeZoom(event.deltaY<0?1.25:1/1.25);},{passive:false});
  async function exit(){
    const s=session;if(!s||exiting)return;exiting=true;session=null;s.generation++;s.task?.cancel();cancelAnimationFrame(resizeFrame);
    try{
      if(s.native){if(!s.nativeWasFullscreen)await native('presentation-leave');}
      else if(document.fullscreenElement===stage)await document.exitFullscreen();
    }finally{
      stage.hidden=true;area.replaceChildren();delete stage.dataset.zoom;document.body.classList.remove('presentation-active');
      await frame();await frame();
      if(api.documents.has(s.doc.id)){
        const d=s.doc;if(d.view.currentScaleValue!==s.scale)d.view.currentScaleValue=s.scale;
        d.view.currentPageNumber=s.originalPage;d.container.scrollLeft=s.left;d.container.scrollTop=s.top;d.view.update();
        if(api.current()===d){document.getElementById('zoom').value=s.zoom;api.render(d);(s.focus?.isConnected?s.focus:d.container).focus({preventScroll:true});}
      }
      exiting=false;
    }
  }
  async function enter(){
    if(session||exiting)return;
    const d=api.current();if(!d)throw Error('Mở PDF trước.');if(api.busy)return;
    for(const p of document.querySelectorAll(':popover-open'))p.hidePopover();
    d.view.update();
    const s=session={doc:d,page:d.view.currentPageNumber,originalPage:d.view.currentPageNumber,rotation:d.view.pagesRotation,scale:d.view.currentScaleValue,left:d.container.scrollLeft,top:d.container.scrollTop,zoom:document.getElementById('zoom').value,focus:document.activeElement,generation:0,task:null,zoomFactor:1,centerAfterDraw:false,native:Boolean(window.__TAURI__?.core&&!document.getElementById('windowControls')?.hidden)};
    stage.hidden=false;document.body.classList.add('presentation-active');
    try{
      if(s.native)s.nativeWasFullscreen=await native('presentation-enter');
      else await stage.requestFullscreen({navigationUI:'hide'});
      stage.focus({preventScroll:true});await draw();
    }catch(error){await exit();throw error;}
  }
  document.addEventListener('keydown',event=>{
    if(event.key==='F11'&&!document.querySelector('dialog[open]')){event.preventDefault();event.stopImmediatePropagation();void (session?exit():enter()).catch(error=>api.message(error.message));return;}
    if(!session)return;
    if(event.key==='Tab'||(event.target instanceof HTMLButtonElement&&['Enter',' '].includes(event.key)))return;
    event.stopImmediatePropagation();event.preventDefault();
    if(event.key==='Escape'){void exit();return;}
    if(event.key==='+'||event.key==='='||event.key==='Add'){changeZoom(1.25);return;}
    if(event.key==='-'||event.key==='Subtract'){changeZoom(1/1.25);return;}
    if(event.key==='0'){setZoom(1);return;}
    const delta=({ArrowRight:1,PageDown:1,' ':1,ArrowLeft:-1,PageUp:-1,Backspace:-1})[event.key];
    const next=event.key==='Home'?1:event.key==='End'?session.doc.pdf.numPages:delta?Math.max(1,Math.min(session.doc.pdf.numPages,session.page+delta)):session.page;
    if(next!==session.page){session.page=next;redraw();}
  },true);
  document.addEventListener('fullscreenchange',()=>{if(session&&!session.native&&document.fullscreenElement!==stage)void exit();});
  document.addEventListener('reader-document-activated',()=>{if(session&&api.current()!==session.doc)void exit();});
  new ResizeObserver(()=>{if(!session)return;cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(redraw);}).observe(stage);
  return {enter,exit};
}
