(() => {
  const { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFString } = window.PDFLib;
  const N = name => PDFName.of(name);
  const FIRST=N('First'), LAST=N('Last'), NEXT=N('Next'), PREV=N('Prev'), PARENT=N('Parent'), TITLE=N('Title'), DEST=N('Dest'), ACTION=N('A'), ACTION_TYPE=N('S'), ACTION_DEST=N('D'), COUNT=N('Count'), OUTLINES=N('Outlines');
  const MAX_NODES=1000, MAX_DEPTH=16, MAX_TITLE=512, MAX_PAGES=500;
  function lookup(document, object) { return object instanceof PDFRef ? document.context.lookup(object) : object; }
  function dict(document, object) { const value=lookup(document,object); return value instanceof PDFDict ? value : undefined; }
  function array(document, object) { const value=lookup(document,object); return value instanceof PDFArray ? value : undefined; }
  function pageFromDestination(document, destination, pageRefs) {
    const items=array(document,destination); if(!items||items.size()<1) return undefined;
    const page=items.get(0); return page instanceof PDFRef ? pageRefs.get(page.toString()) : undefined;
  }
  function pageFromItem(document, item, pageRefs) {
    const direct=pageFromDestination(document,item.get(DEST),pageRefs); if(direct) return direct;
    const action=dict(document,item.get(ACTION)); if(!action) return undefined;
    const type=lookup(document,action.get(ACTION_TYPE));
    if(!(type instanceof PDFName)||type.asString()!=='/GoTo') return undefined;
    return pageFromDestination(document,action.get(ACTION_DEST),pageRefs);
  }
  async function extract(bytes) {
    const document=await PDFDocument.load(bytes), pages=document.getPages();
    const pageRefs=new Map(pages.map((page,index)=>[page.ref.toString(),index+1]));
    const outlines=dict(document,document.catalog.get(OUTLINES)); if(!outlines) return [];
    const visited=new Set(); let seen=0;
    function walk(first,depth) {
      if(depth>MAX_DEPTH&&first) throw Error(`Outline vượt quá ${MAX_DEPTH} cấp.`);
      const result=[]; let current=first;
      while(current) {
        const identity=current instanceof PDFRef?current.toString():String(current);
        if(!identity||visited.has(identity)) break; visited.add(identity);
        if(++seen>MAX_NODES) throw Error(`Outline vượt quá ${MAX_NODES} mục.`);
        const item=dict(document,current); if(!item) break;
        const titleValue=lookup(document,item.get(TITLE));
        const title=titleValue instanceof PDFString||titleValue instanceof PDFHexString?titleValue.decodeText().trim():'Bookmark';
        result.push({title:title||'Bookmark',pageNumber:pageFromItem(document,item,pageRefs)||1,children:walk(item.get(FIRST),depth+1)});
        current=item.get(NEXT);
      }
      return result;
    }
    return walk(outlines.get(FIRST),1);
  }
  function normalize(nodes,pageCount) {
    let count=0;
    function level(items,depth) {
      if(depth>MAX_DEPTH&&items.length) throw Error(`Bookmark vượt quá ${MAX_DEPTH} cấp.`);
      return items.map(node=>{
        if(++count>MAX_NODES) throw Error(`Bookmark vượt quá ${MAX_NODES} mục.`);
        const title=String(node.title??'').trim(); if(!title) throw Error('Tiêu đề bookmark không được để trống.');
        if(title.length>MAX_TITLE) throw Error(`Tiêu đề bookmark vượt quá ${MAX_TITLE} ký tự.`);
        const raw=Number(node.pageNumber),page=Number.isFinite(raw)?Math.min(pageCount,Math.max(1,Math.trunc(raw))):1;
        return {title,pageNumber:page,children:level(Array.isArray(node.children)?node.children:[],depth+1)};
      });
    }
    return level(Array.isArray(nodes)?nodes:[],1);
  }
  function buildLevel(document,nodes,parentRef) {
    if(!nodes.length) return {descendantCount:0};
    const pages=document.getPages();
    const entries=nodes.map(node=>{
      const page=pages[node.pageNumber-1];
      const object=document.context.obj({Title:PDFHexString.fromText(node.title),Parent:parentRef,Dest:[page.ref,'Fit']});
      return {node,dict:object,ref:document.context.register(object)};
    });
    entries.forEach((entry,index)=>{if(index>0)entry.dict.set(PREV,entries[index-1].ref);if(index+1<entries.length)entry.dict.set(NEXT,entries[index+1].ref)});
    let descendantCount=entries.length;
    for(const entry of entries){
      const children=buildLevel(document,entry.node.children,entry.ref);
      if(children.first&&children.last){entry.dict.set(FIRST,children.first);entry.dict.set(LAST,children.last);entry.dict.set(COUNT,document.context.obj(children.descendantCount));descendantCount+=children.descendantCount}
    }
    return {first:entries[0].ref,last:entries.at(-1).ref,descendantCount};
  }
  async function write(bytes,nodes) {
    const document=await PDFDocument.load(bytes),pageCount=document.getPageCount(); if(!pageCount)throw Error('PDF không có trang.');
    const normalized=normalize(nodes,pageCount);
    if(!normalized.length){document.catalog.delete(OUTLINES);return new Uint8Array(await document.save({useObjectStreams:true}))}
    const outline=document.context.obj({Type:'Outlines'}),ref=document.context.register(outline),level=buildLevel(document,normalized,ref);
    if(level.first&&level.last){outline.set(FIRST,level.first);outline.set(LAST,level.last);outline.set(COUNT,document.context.obj(level.descendantCount))}
    document.catalog.set(OUTLINES,ref); return new Uint8Array(await document.save({useObjectStreams:true}));
  }
  function clamp(page,pageCount){return Math.min(pageCount,Math.max(1,Math.trunc(Number.isFinite(page)?page:1)))}
  function plan(nodes,pageCount,maxDepth=0,allowDuplicates=false) {
    if(!Number.isInteger(pageCount)||pageCount<1)throw Error('PDF không có trang hợp lệ.');
    if(!Number.isInteger(maxDepth)||maxDepth<0||maxDepth>15)throw Error('Độ sâu bookmark phải từ 0 đến 15.');
    const points=[];let order=0;
    function collect(items,depth){for(const node of items){points.push({title:String(node.title||'Chapter').trim()||'Chapter',pageNumber:clamp(Number(node.pageNumber),pageCount),depth,order:order++});if(depth<maxDepth&&node.children?.length)collect(node.children,depth+1)}}
    collect(nodes,0); if(!points.length)throw Error('PDF không có bookmark phù hợp để tách.');
    points.sort((a,b)=>a.pageNumber-b.pageNumber||a.order-b.order);
    const selected=[];
    for(const point of points){const previous=selected.at(-1);if(!allowDuplicates&&previous&&previous.pageNumber===point.pageNumber){previous.title=`${previous.title} · ${point.title}`.slice(0,240);previous.depth=Math.min(previous.depth,point.depth)}else selected.push({...point})}
    if(selected.length>500)throw Error('Số chapter vượt giới hạn 500.');
    return selected.map((point,index)=>({title:point.title,startPage:point.pageNumber,endPage:selected[index+1]?Math.max(point.pageNumber,selected[index+1].pageNumber-1):pageCount,depth:point.depth}));
  }
  function chapterFilename(index,title,total) {
    const width=Math.max(2,String(total).length),safe=String(title).normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').replace(/\s+/g,' ').replace(/[. ]+$/g,'').trim().slice(0,120)||`chapter-${index+1}`;
    return `${String(index+1).padStart(width,'0')} ${safe}.pdf`;
  }
  async function split(bytes,maxDepth=0,allowDuplicates=false) {
    const source=await PDFDocument.load(bytes),pageCount=source.getPageCount();
    if(!pageCount)throw Error('PDF không có trang.');if(pageCount>MAX_PAGES)throw Error(`Tách theo bookmark giới hạn ${MAX_PAGES} trang.`);
    const ranges=plan(await extract(bytes),pageCount,maxDepth,allowDuplicates),parts=[];
    for(let index=0;index<ranges.length;index++){
      const range=ranges[index],indexes=Array.from({length:range.endPage-range.startPage+1},(_,i)=>range.startPage-1+i),output=await PDFDocument.create();
      for(const page of await output.copyPages(source,indexes))output.addPage(page);
      parts.push({...range,filename:chapterFilename(index,range.title,ranges.length),bytes:new Uint8Array(await output.save({useObjectStreams:true}))});
    }
    return parts;
  }
  window.SOLYAN_BOOKMARKS={extract,write,plan,split,chapterFilename,MAX_NODES,MAX_DEPTH,MAX_TITLE,MAX_PAGES};
})();
