// Capture is landscape by default; delivered files are portrait.
// Rotate pixels, not just CSS or EXIF metadata.
// Screen orientation is deliberately not used: it may be locked, and the
// browser may already have rotated the camera stream.
export const CAMERA_TURNS_KEY='hana-camera-quarter-turns';
export function parseCameraTurns(value:string|null):number{return value!==null&&/^[0-3]$/.test(value)?Number(value):0;}

export function landscapeFrameLayout(width:number,height:number,turns:number){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('Camera frame not ready');
  const rotation=((height>width?90:0)+((turns%4)+4)%4*90)%360;
  return {width:rotation%180?height:width,height:rotation%180?width:height,rotation};
}

export function drawLandscapeFrame(canvas:HTMLCanvasElement,source:CanvasImageSource,width:number,height:number,turns:number,maxWidth=Infinity){
  const layout=landscapeFrameLayout(width,height,turns);
  drawFrame(canvas,source,width,height,layout,maxWidth);
}

export function drawPortraitFrame(canvas:HTMLCanvasElement,source:CanvasImageSource,width:number,height:number,turns:number){
  const preview=landscapeFrameLayout(width,height,turns);
  const layout=preview.width>preview.height?{width:preview.height,height:preview.width,rotation:(preview.rotation+90)%360}:preview;
  drawFrame(canvas,source,width,height,layout,Infinity);
}

function drawFrame(canvas:HTMLCanvasElement,source:CanvasImageSource,width:number,height:number,layout:{width:number;height:number;rotation:number},maxWidth:number){
  const scale=Math.min(1,maxWidth/Math.max(layout.width,layout.height));
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
