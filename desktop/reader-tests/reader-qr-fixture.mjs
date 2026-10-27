import {PDFDocument,PDFName} from 'pdf-lib';
import {readFileSync} from 'node:fs';

// Public synthetic QR; never replace this with an owner's activation QR/PDF.
export const qrFixture=JSON.parse(readFileSync(new URL('./qr-ccitt-fixture.json',import.meta.url),'utf8'));
export async function qrPdf(){
 const pdf=await PDFDocument.create(),page=pdf.addPage([300,400]);
 const image=pdf.context.stream(Buffer.from(qrFixture.ccitt,'base64'),{
  Type:'XObject',Subtype:'Image',Width:qrFixture.width,Height:qrFixture.height,
  ColorSpace:'DeviceGray',BitsPerComponent:1,Filter:'CCITTFaxDecode',
  DecodeParms:pdf.context.obj({K:-1,Columns:qrFixture.width,Rows:qrFixture.height,BlackIs1:true}),
 });
 page.node.set(PDFName.of('Resources'),pdf.context.obj({XObject:{QR:pdf.context.register(image)}}));
 page.node.addContentStream(pdf.context.register(pdf.context.flateStream('q 180 0 0 180 60 120 cm /QR Do Q')));
 return Buffer.from(await pdf.save());
}
export async function qrMatches(canvas){
 return canvas.evaluate((canvas,f)=>{
  const ctx=canvas.getContext('2d'),count=f.modules.length;let matches=0;
  for(let y=0;y<count;y++)for(let x=0;x<count;x++){
   const px=Math.floor(canvas.width*(60+180*(f.quietZone+x+.5)/(count+2*f.quietZone))/300);
   const py=Math.floor(canvas.height*(100+180*(f.quietZone+y+.5)/(count+2*f.quietZone))/400);
   const [r,g,b,a]=ctx.getImageData(px,py,1,1).data;
   if(a>240&&(f.modules[y][x]?(r<50&&g<50&&b<50):(r>205&&g>205&&b>205)))matches++;
  }return matches;
 },qrFixture);
}

