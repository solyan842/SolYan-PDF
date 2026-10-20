export const textFonts={sans:{name:'Noto Sans',file:'NotoSans-Regular.ttf',family:'Reader Noto Sans'},serif:{name:'Noto Serif',file:'NotoSerif-Regular.ttf',family:'Reader Noto Serif'},mono:{name:'Noto Sans Mono',file:'NotoSansMono-Regular.ttf',family:'Reader Noto Mono'}};
export const windowsFontChoices={
  'win-arial':{name:'Arial',family:'Arial'},
  'win-times':{name:'Times New Roman',family:'Times New Roman'},
  'win-calibri':{name:'Calibri',family:'Calibri'},
  'win-tahoma':{name:'Tahoma',family:'Tahoma'},
  'win-verdana':{name:'Verdana',family:'Verdana'},
  'win-georgia':{name:'Georgia',family:'Georgia'},
  'win-segoe':{name:'Segoe UI',family:'Segoe UI'},
  'win-consolas':{name:'Consolas',family:'Consolas'},
  'win-courier':{name:'Courier New',family:'Courier New'},
  'win-trebuchet':{name:'Trebuchet MS',family:'Trebuchet MS'},
  'win-candara':{name:'Candara',family:'Candara'},
  'win-corbel':{name:'Corbel',family:'Corbel'},
  'win-constantia':{name:'Constantia',family:'Constantia'}
};
let windowsFontPending=null;
// Only query the machine when the Typewriter dialog is opened, never at startup.
export async function discoverWindowsFonts(){
  if(!globalThis.__TAURI__?.core)return [];
  if(!windowsFontPending)windowsFontPending=globalThis.__TAURI__.core.invoke('reader_windows_fonts')
    .then(ids=>{
      if(!Array.isArray(ids))throw Error('Danh sách font Windows không hợp lệ.');
      for(const id of ids){if(windowsFontChoices[id])textFonts[id]={...windowsFontChoices[id],system:true};}
      return ids.filter(id=>Boolean(textFonts[id]?.system));
    }).catch(error=>{windowsFontPending=null;throw error;});
  return windowsFontPending;
}
const cache=new Map();
let fontkitPending=null;
// Unicode text editing is optional; keep its large font engine off the PDF reading startup path.
async function ensureFontkit(){
  if(globalThis.fontkit?.create)return globalThis.fontkit;
  if(!fontkitPending)fontkitPending=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='./vendor/fontkit.umd.min.js';
    script.onload=()=>{
      if(globalThis.fontkit?.create)resolve(globalThis.fontkit);
      else reject(Error('Bộ xử lý font không sẵn sàng.'));
    };
    script.onerror=()=>reject(Error('Không tải được bộ xử lý font cục bộ.'));
    document.head.append(script);
  }).catch(error=>{fontkitPending=null;throw error;});
  return fontkitPending;
}
async function loadFont(id){
  const font=textFonts[id];if(!font)throw Error('Font không hợp lệ.');
  if(!cache.has(id))cache.set(id,(async()=>{
    const [kit,bytes]=await Promise.all([ensureFontkit(),font.system
      ?globalThis.__TAURI__.core.invoke('reader_windows_font',{id}).then(value=>Uint8Array.from(value))
      :fetch('./vendor/reader-fonts/'+font.file).then(async response=>{
        if(!response.ok)throw Error('Không tải được font.');
        return new Uint8Array(await response.arrayBuffer());
      })]);
    // Windows fonts are kept on the machine. Only the selected font is ever read.
    const face=new FontFace(font.family,bytes);
    await face.load();document.fonts.add(face);
    return {bytes,metrics:kit.create(bytes)};
  })().catch(error=>{cache.delete(id);throw error;}));
  return cache.get(id);
}
export async function prepareText({text,font='sans',fontSize=14,color='#182d46'}){
  text=text.replace(/\r\n?/g,'\n').replace(/\t/g,'    ').normalize('NFC');
  if(!text.trim()||text.length>2000||text.split('\n').length>20)throw Error('Nhập 1–2000 ký tự, tối đa 20 dòng.');
  if(!textFonts[font]||!Number.isFinite(fontSize)||fontSize<6||fontSize>96||!/^#[0-9a-f]{6}$/i.test(color))throw Error('Kiểu chữ không hợp lệ.');
  const {metrics}=await loadFont(font);
  for(const character of text.replace(/\n/g,''))if(!metrics.hasGlyphForCodePoint(character.codePointAt(0)))throw Error('Font không hỗ trợ ký tự: '+character);
  const lineHeight=fontSize*1.25,ascent=metrics.ascent/metrics.unitsPerEm*fontSize;
  const width=Math.max(...text.split('\n').map(line=>metrics.layout(line).positions.reduce((sum,p)=>sum+p.xAdvance,0)/metrics.unitsPerEm*fontSize),1)+4;
  const height=Math.max(lineHeight,text.split('\n').length*lineHeight)+4;
  return {kind:'text',role:'fill',label:'Văn bản',text,font,fontSize,color,lineHeight,ascent,baseWidth:width,baseHeight:height};
}
export function textVisual(item){
  const outer=document.createElement('div');outer.className='typewriter-visual';const content=document.createElement('div');content.textContent=item.text;
  Object.assign(content.style,{fontFamily:`"${textFonts[item.font].family}"`,fontSize:`${item.fontSize}px`,lineHeight:`${item.lineHeight}px`,color:item.color,padding:'2px',width:`${item.baseWidth}px`,height:`${item.baseHeight}px`,transformOrigin:'0 0',transform:`scale(${item.rect.w*item.viewport.width/item.baseWidth},${item.rect.h*item.viewport.height/item.baseHeight})`});outer.append(content);return outer;
}
export async function saveText(bytes,items,lib,{fontkit=globalThis.fontkit,loadBytes=async id=>(await loadFont(id)).bytes,point=globalThis.ReaderEdits.point}={}){
  const pdf=await lib.PDFDocument.load(bytes,{updateMetadata:false});pdf.registerFontkit(fontkit||await ensureFontkit());const embedded=new Map();
  for(const item of items){
    if(!embedded.has(item.font))embedded.set(item.font,await pdf.embedFont(await loadBytes(item.font),{subset:true}));
    const font=embedded.get(item.font),page=pdf.getPage(item.page),v=item.viewport;
    const origin=point(v,item.rect.x*v.width,item.rect.y*v.height),x=point(v,item.rect.x*v.width+1,item.rect.y*v.height),y=point(v,item.rect.x*v.width,item.rect.y*v.height+1);
    const sx=item.rect.w*v.width/item.baseWidth,sy=item.rect.h*v.height/item.baseHeight;
    page.pushOperators(lib.pushGraphicsState(),lib.concatTransformationMatrix((x[0]-origin[0])*sx,(x[1]-origin[1])*sx,-(y[0]-origin[0])*sy,-(y[1]-origin[1])*sy,...origin));
    const color=item.color.match(/[0-9a-f]{2}/gi).map(x=>parseInt(x,16)/255);
    item.text.split('\n').forEach((line,index)=>{if(line)page.drawText(line,{font,size:item.fontSize,x:2,y:-(2+item.ascent+index*item.lineHeight),color:lib.rgb(...color),lineHeight:item.lineHeight});});
    page.pushOperators(lib.popGraphicsState());
  }
  return pdf.save();
}
