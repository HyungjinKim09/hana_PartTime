export type Rotation=0|90|180|270;
export type Crop={left:number;top:number;right:number;bottom:number};
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
