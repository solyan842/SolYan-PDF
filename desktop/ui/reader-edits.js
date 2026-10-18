/* Thin PDF-native annotation writer; no page rasterization or PDF parser. */
(function(root){
  const subtype={highlight:'Highlight',underline:'Underline',strike:'StrikeOut',note:'Text',ink:'Ink',rectangle:'Square',ellipse:'Circle',line:'Line',arrow:'Line'};
  function point(view,x,y){const[a,b,c,d,e,f]=view.transform,det=a*d-b*c;return[(d*(x-e)-c*(y-f))/det,(-b*(x-e)+a*(y-f))/det];}
  function project(view,p){const[a,b,c,d,e,f]=view.transform;return[a*p[0]+c*p[1]+e,b*p[0]+d*p[1]+f];}
  function frame(item,target){const source=item.viewport, r=item.rect, w=r.w*source.width,h=r.h*source.height;
    const tl=project(target,point(source,r.x*source.width,r.y*source.height));
    const tr=project(target,point(source,(r.x+r.w)*source.width,r.y*source.height));
    const bl=project(target,point(source,r.x*source.width,(r.y+r.h)*source.height));
    return {left:tl[0],top:tl[1],width:w,height:h,transform:`matrix(${(tr[0]-tl[0])/w},${(tr[1]-tl[1])/w},${(bl[0]-tl[0])/h},${(bl[1]-tl[1])/h},0,0)`};
  }
  async function save(bytes,items,viewportFor,lib){
    const doc=await lib.PDFDocument.load(bytes,{updateMetadata:false});
    for(const item of items){
      const type=subtype[item.kind];if(!type)throw Error(`Unsupported annotation: ${item.kind}`);
      const page=doc.getPage(item.page),v=item.viewport||await viewportFor(item.page),r=item.rect;
      const p=(x,y)=>point(v,x*v.width,y*v.height);
      const tl=p(r.x,r.y),tr=p(r.x+r.w,r.y),bl=p(r.x,r.y+r.h),br=p(r.x+r.w,r.y+r.h);
      const corners=[tl,tr,bl,br],xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1]);
      const bounds=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
      const width=Math.max(1,bounds[2]-bounds[0]),height=Math.max(1,bounds[3]-bounds[1]);
      const relative=q=>[q[0]-bounds[0],q[1]-bounds[1]];
      const color=item.color||[1,.6,0], [red,green,blue]=color;
      const operators=[`${red} ${green} ${blue} RG`,`${red} ${green} ${blue} rg`,'1.5 w','1 J','1 j'];
      const polygon=points=>points.map((q,i)=>`${relative(q).join(' ')} ${i?'l':'m'}`).join('\n');
      const data={Type:'Annot',Subtype:type,Rect:bounds,F:4,C:color,BS:{W:1.5,S:'S'},NM:lib.PDFString.of(item.id),Contents:lib.PDFHexString.fromText(item.text||''),P:page.ref};
      if(['highlight','underline','strike'].includes(item.kind)){
        data.QuadPoints=[...tl,...tr,...bl,...br];
        if(item.kind==='highlight'){operators.push('/GS gs',polygon([tl,tr,br,bl]),'h f');data.CA=.3;}
        else{const y=item.kind==='underline'?r.y+r.h:r.y+r.h/2;operators.push(polygon([p(r.x,y),p(r.x+r.w,y)]),'S');}
      }else if(item.kind==='rectangle')operators.push(`.75 .75 ${Math.max(0,width-1.5)} ${Math.max(0,height-1.5)} re S`);
      else if(item.kind==='ellipse'){
        const x=width/2,y=height/2,rx=Math.max(.1,x-1),ry=Math.max(.1,y-1),k=.5522847498;
        operators.push(`${x+rx} ${y} m`,`${x+rx} ${y+k*ry} ${x+k*rx} ${y+ry} ${x} ${y+ry} c`,`${x-k*rx} ${y+ry} ${x-rx} ${y+k*ry} ${x-rx} ${y} c`,`${x-rx} ${y-k*ry} ${x-k*rx} ${y-ry} ${x} ${y-ry} c`,`${x+k*rx} ${y-ry} ${x+rx} ${y-k*ry} ${x+rx} ${y} c S`);
      }else if(item.kind==='note'){data.Name=lib.PDFName.of('Comment');operators.push(`0 0 ${width} ${height} re f`);}
      else{
        const points=item.points?.length?item.points.map(q=>p(r.x+q[0]*r.w,r.y+q[1]*r.h)):[tl,br];
        if(item.kind==='ink')data.InkList=[points.flat()];else{data.L=[...points[0],...points.at(-1)];if(item.kind==='arrow')data.LE=[lib.PDFName.of('None'),lib.PDFName.of('OpenArrow')];}
        operators.push(polygon(points),'S');
        if(item.kind==='arrow'){const end=points.at(-1),prev=points[0],angle=Math.atan2(end[1]-prev[1],end[0]-prev[0]);operators.push(polygon([[end[0]-10*Math.cos(angle-.5),end[1]-10*Math.sin(angle-.5)],end,[end[0]-10*Math.cos(angle+.5),end[1]-10*Math.sin(angle+.5)]]),'S');}
      }
      const resources=doc.context.obj({ExtGState:{GS:{Type:'ExtGState',ca:.3,CA:1}}});
      const appearance=doc.context.register(doc.context.flateStream(operators.join('\n'),{Type:'XObject',Subtype:'Form',BBox:[0,0,width,height],Resources:resources}));
      data.AP={N:appearance};
      const annotation=doc.context.register(doc.context.obj(data));
      const annots=page.node.Annots();if(annots)annots.push(annotation);else page.node.set(lib.PDFName.of('Annots'),doc.context.obj([annotation]));
    }
    return doc.save();
  }
  const api={point,project,frame,save,subtype};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ReaderEdits=api;
})(typeof window==='undefined'?globalThis:window);
