export type Rotation=0|90|180|270;
export type Crop={left:number;top:number;right:number;bottom:number};
export function rotateQuad(quad:{x:number;y:number}[],rotation:Rotation){
 if(!quad.length)return [];
 const points=quad.map(p=>rotatePoint(p,rotation)),shift=(4-rotation/90)%4;
 return [...points.slice(shift),...points.slice(0,shift)];
}
export function rotatePoint(p:{x:number;y:number},rotation:Rotation,size=1000){
  switch(rotation){case 90:return {x:size-p.y,y:p.x};case 180:return {x:size-p.x,y:size-p.y};case 270:return {x:p.y,y:size-p.x};default:return {...p};}
}
export function rotateBox(box:number[],rotation:Rotation,size=1000){
  const a=rotatePoint({x:box[0],y:box[1]},rotation,size),b=rotatePoint({x:box[2],y:box[3]},rotation,size);
  return [Math.min(a.x,b.x),Math.min(a.y,b.y),Math.max(a.x,b.x),Math.max(a.y,b.y)] as [number,number,number,number];
}
export function rotateCrop(crop:Crop,rotation:Rotation):Crop{const [left,top,right,bottom]=rotateBox([crop.left,crop.top,crop.right,crop.bottom],rotation,100);return {left,top,right,bottom};}
export function rotationTransform(rotation:Rotation){return rotation===90?'translate(100 0) rotate(90)':rotation===180?'translate(100 100) rotate(180)':rotation===270?'translate(0 100) rotate(270)':undefined;}
export function rotateCanvas(source:HTMLImageElement|HTMLCanvasElement,rotation:Rotation){
  const w='naturalWidth' in source?source.naturalWidth:source.width,h='naturalHeight' in source?source.naturalHeight:source.height;
  const canvas=document.createElement('canvas');canvas.width=rotation%180?h:w;canvas.height=rotation%180?w:h;
  const ctx=canvas.getContext('2d')!;ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(rotation*Math.PI/180);ctx.drawImage(source,-w/2,-h/2);return canvas;
}

// Models often return a one-character box for vertically stacked Korean words.
// Expand only the text exclusion hint; the exported label and position stay editable.
export function textExclusionBox(label:{text:string;box:number[]},width:number,height:number){
  const box=[...label.box];const count=label.text.replace(/[^가-힣]/g,'').length;
  const w=(box[2]-box[0])*width/1000,h=(box[3]-box[1])*height/1000;
  if(count>=2&&count<=5&&w>0&&w<40&&h<w*count){const cy=(box[1]+box[3])/2,half=Math.min(90,w*count/height*500);box[1]=Math.max(0,cy-half);box[3]=Math.min(1000,cy+half);}
  return box;
}

// One numbered contact sheet lets the model re-read uncertain handwriting
// without asking it to relocate labels or redraw any part of the plan.
export function drawingLabelReviewImage(source:HTMLCanvasElement,labels:{box:number[]}[]){
  if(!labels.length||labels.length>8)throw Error('확인할 글자 범위를 확인해 주세요.');
  const tileWidth=360,tileHeight=240,columns=Math.min(2,labels.length),sheet=document.createElement('canvas');
  sheet.width=tileWidth*columns;sheet.height=tileHeight*Math.ceil(labels.length/columns);
  const context=sheet.getContext('2d')!;context.fillStyle='#fff';context.fillRect(0,0,sheet.width,sheet.height);context.font='20px sans-serif';context.imageSmoothingQuality='high';
  labels.forEach((label,index)=>{
    const [left,top,right,bottom]=label.box,pad=Math.max(12,Math.max(source.width,source.height)*.012);
    const x=Math.max(0,left/1000*source.width-pad),y=Math.max(0,top/1000*source.height-pad);
    const width=Math.min(source.width,right/1000*source.width+pad)-x,height=Math.min(source.height,bottom/1000*source.height+pad)-y;
    if(width<=0||height<=0)throw Error('확인할 글자 범위를 확인해 주세요.');
    const column=index%columns,row=Math.floor(index/columns),scale=Math.min((tileWidth-32)/width,(tileHeight-48)/height);
    context.fillStyle='#111';context.fillText('#'+index,column*tileWidth+12,row*tileHeight+24);
    context.drawImage(source,x,y,width,height,column*tileWidth+(tileWidth-width*scale)/2,row*tileHeight+36+(tileHeight-48-height*scale)/2,width*scale,height*scale);
  });
  let image=sheet.toDataURL('image/jpeg',.85);if(image.length>850000)image=sheet.toDataURL('image/jpeg',.6);
  if(image.length>850000)throw Error('확대 글자 이미지가 너무 큽니다.');return image;
}
