import {planBookletSides} from './vendor/reader-layout/booklet.js';
import {fitSourcePageToBox} from './vendor/reader-layout/n-up.js';
import {planPosterTiles} from './vendor/reader-layout/poster.js';
// Physical dimensions are PDF points (72/in). Rendering consumes this same plan
// for preview and output; no second layout engine and no source PDF mutation.
export function sheets(pages, sizes, options={}){
  const {mode='single',nup=1,paper=null,scale='fit',percent=100,margin=0,rotate=true,orientation='auto'}=options;
  const fit=(index,x,y,w,h)=>{
    if(index===null)return null;
    const [pw,ph]=sizes[index];
    const placement=fitSourcePageToBox({width:pw,height:ph,rotation:0},{x,y:0,width:w,height:h},0,index+1);
    let turn=rotate&&(placement.rotation===90||placement.rotation===270);
    let sw=turn?ph:pw,sh=turn?pw:ph,f=Math.min(w/sw,h/sh);
    if(scale==='actual')f=1;else if(scale==='reduce')f=Math.min(1,f);else if(scale==='custom')f=percent/100;
    return {index,x:x+(w-sw*f)/2,y:y+(h-sh*f)/2,width:sw*f,height:sh*f,turn};
  };
  const result=[];
  if(mode==='tile'){
    if(!paper)throw Error('Chọn khổ giấy để chia trang lớn.');
    for(const index of pages){const [pw,ph]=sizes[index],f=percent/100,w=paper[0]-2*margin,h=paper[1]-2*margin;
      if(w<=0||h<=0)throw Error('Lề vượt khổ giấy.');
      const columns=Math.ceil(pw*f/w),rows=Math.ceil(ph*f/h);
      // Reuse existing validated grid/order planner. Printing retains physical
      // scale instead of the web Poster tool's fit-to-tile scaling.
      const tiles=planPosterTiles([{width:pw,height:ph}],{xFactor:columns,yFactor:rows,pageSize:'A4',rightToLeft:false});
      for(const tile of tiles)result.push({size:paper,items:[{index,x:margin-tile.column*w,y:margin-tile.row*h,width:pw*f,height:ph*f,turn:false}],clip:[margin,margin,w,h]});
    }return result;
  }
  let order=pages.slice(),count=nup;
  if(mode==='booklet'){
    if(!paper)throw Error('Chọn khổ giấy để in sách.');
    const sides=planBookletSides(order.length,{spine:'left',gutter:0,outerMargin:0,border:false,duplexPass:'both',flipOnShortEdge:false});
    const folded=sides.flatMap(side=>[side.left===null?null:order[side.left],side.right===null?null:order[side.right]]);
    order=folded;count=2;
  }
  for(let start=0;start<order.length;start+=count){
    const batch=order.slice(start,start+count);let size=(paper||sizes[batch.find(x=>x!==null)]).slice();if(!paper&&orientation!=='auto'){size.sort((a,b)=>a-b);if(orientation==='landscape')size.reverse();}const cols=count===2?2:Math.ceil(Math.sqrt(count)),rows=Math.ceil(count/cols),w=(size[0]-2*margin)/cols,h=(size[1]-2*margin)/rows;
    if(w<=0||h<=0)throw Error('Lề vượt khổ giấy.');
    result.push({size,items:batch.map((p,i)=>fit(p,margin+(i%cols)*w,margin+Math.floor(i/cols)*h,w,h)).filter(Boolean),clip:[margin,margin,size[0]-2*margin,size[1]-2*margin]});
  }return result;
}
