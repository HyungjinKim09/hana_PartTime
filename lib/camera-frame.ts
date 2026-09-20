// Field photos are landscape. Rotate pixels, not just CSS or EXIF metadata.
// Screen orientation is deliberately not used: it may be locked, and the
// browser may already have rotated the camera stream.
export function landscapeFrameLayout(width:number,height:number,flipped:boolean){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('Camera frame not ready');
  return {width:Math.max(width,height),height:Math.min(width,height),rotation:(height>width?90:0)+(flipped?180:0)};
}

export function drawLandscapeFrame(canvas:HTMLCanvasElement,source:CanvasImageSource,width:number,height:number,flipped:boolean,maxWidth=Infinity){
  const layout=landscapeFrameLayout(width,height,flipped);
  const scale=Math.min(1,maxWidth/layout.width);
  const outWidth=Math.max(1,Math.round(layout.width*scale)),outHeight=Math.max(1,Math.round(layout.height*scale));
  if(canvas.width!==outWidth)canvas.width=outWidth;
  if(canvas.height!==outHeight)canvas.height=outHeight;
  const context=canvas.getContext('2d');if(!context)throw new Error('Canvas unavailable');
  const x=outWidth/layout.width,y=outHeight/layout.height;
  switch(layout.rotation){
    case 90:context.setTransform(0,y,-x,0,outWidth,0);break;
    case 180:context.setTransform(-x,0,0,-y,outWidth,outHeight);break;
    case 270:context.setTransform(0,-y,x,0,0,outHeight);break;
    default:context.setTransform(x,0,0,y,0,0);
  }
  context.drawImage(source,0,0,width,height);
}
