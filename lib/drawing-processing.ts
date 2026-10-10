import type {TraceLine} from './drawing-trace';
export type Corner={x:number;y:number};
// Remove slowly varying illumination; retain the original photograph for review.
export function normalizePaper(data:Uint8ClampedArray,width:number,height:number){
 if(width<30||height<30||width>1600||height>1600||data.length!==width*height*4)throw Error('도면 이미지 크기를 확인해 주세요.');
 const stride=width+1,integral=new Float64Array(stride*(height+1)),gray=new Uint8Array(width*height);
 for(let y=0;y<height;y++){let sum=0;for(let x=0;x<width;x++){const i=y*width+x;gray[i]=(data[i*4]+data[i*4+1]+data[i*4+2])/3;sum+=gray[i];integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+sum;}}
 const radius=Math.max(16,Math.round(Math.max(width,height)*.025)),out=new Uint8ClampedArray(data.length);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const l=Math.max(0,x-radius),r=Math.min(width,x+radius+1),t=Math.max(0,y-radius),b=Math.min(height,y+radius+1);
  const mean=(integral[b*stride+r]-integral[t*stride+r]-integral[b*stride+l]+integral[t*stride+l])/((r-l)*(b-t));
  // Only lift deeply shadowed regions. Whitening normal paper amplifies its grid.
  const i=(y*width+x)*4,v=Math.min(255,gray[y*width+x]*Math.max(1,Math.min(4,90/Math.max(24,mean))));out[i]=out[i+1]=out[i+2]=v;out[i+3]=255;
 }
 return out;
}
export function validQuad(q:Corner[]){
 if(q.length!==4||q.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>1000||p.y>1000))return false;
 return q.every((a,i)=>{const b=q[(i+1)%4],c=q[(i+2)%4];return (b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x)>1000;});
}
// Inverse projective sampling: four observed paper corners -> flat rectangle.
// This does not infer the building outline or invent any missing strokes.
export function rectifyDrawing(data:Uint8ClampedArray,width:number,height:number,q:Corner[]){
 if(!validQuad(q)||width<30||height<30||width>1600||height>1600||data.length!==width*height*4)throw Error('모서리를 왼쪽 위부터 시계 방향으로 지정해 주세요.');
 const p=q.map(v=>({x:v.x*(width-1)/1000,y:v.y*(height-1)/1000}));
 const [a,b,c,d]=p,dx=b.x-c.x,dy=b.y-c.y,ex=d.x-c.x,ey=d.y-c.y;
 const sx=a.x-b.x+c.x-d.x,sy=a.y-b.y+c.y-d.y,den=dx*ey-ex*dy;
 const g=(sx*ey-ex*sy)/den,h=(dx*sy-sx*dy)/den;
 const A=b.x-a.x+g*b.x,B=d.x-a.x+h*d.x,D=b.y-a.y+g*b.y,E=d.y-a.y+h*d.y;
 const distance=(u:Corner,v:Corner)=>Math.hypot(u.x-v.x,u.y-v.y);
 const rawW=Math.max(distance(a,b),distance(d,c))+1,rawH=Math.max(distance(a,d),distance(b,c))+1,scale=Math.min(1,1600/Math.max(rawW,rawH));
 const w=Math.max(30,Math.round(rawW*scale)),ht=Math.max(30,Math.round(rawH*scale));
 const out=new Uint8ClampedArray(w*ht*4);
 for(let y=0;y<ht;y++)for(let x=0;x<w;x++){
  const u=x/(w-1),v=y/(ht-1),z=g*u+h*v+1;
  const px=Math.max(0,Math.min(width-1,(A*u+B*v+a.x)/z)),py=Math.max(0,Math.min(height-1,(D*u+E*v+a.y)/z));
  const x0=Math.floor(px),y0=Math.floor(py),x1=Math.min(width-1,x0+1),y1=Math.min(height-1,y0+1),fx=px-x0,fy=py-y0;
  for(let k=0;k<4;k++)out[(y*w+x)*4+k]=(data[(y0*width+x0)*4+k]*(1-fx)+data[(y0*width+x1)*4+k]*fx)*(1-fy)+(data[(y1*width+x0)*4+k]*(1-fx)+data[(y1*width+x1)*4+k]*fx)*fy;
 }
 return {data:out,width:w,height:ht};
}
export function reviewLines(lines:TraceLine[]){
 const touches=(p:Corner,l:TraceLine)=>{const dx=l.b.x-l.a.x,dy=l.b.y-l.a.y,t=Math.max(0,Math.min(1,((p.x-l.a.x)*dx+(p.y-l.a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-l.a.x-t*dx,p.y-l.a.y-t*dy)<8;};
 return lines.filter(l=>[l.a,l.b].some(p=>!lines.some(other=>other.id!==l.id&&touches(p,other)))).map(l=>l.id);
}
