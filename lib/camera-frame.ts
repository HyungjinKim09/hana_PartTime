// Capture is landscape by default; delivered files are portrait.
// Rotate pixels, not just CSS or EXIF metadata.
// Screen orientation is deliberately not used: it may be locked, and the
// browser may already have rotated the camera stream.
// Versioned: the old setting rotated the live preview and was subsequently
// overridden by portrait normalization. This setting rotates only the output.
export const CAMERA_TURNS_KEY='hana-camera-save-quarter-turns-v2';
export function parseCameraTurns(value:string|null):number{return value!==null&&/^[0-3]$/.test(value)?Number(value):1;}

export function landscapeFrameLayout(width:number,height:number,turns:number){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('Camera frame not ready');
  const rotation=((height>width?90:0)+((turns%4)+4)%4*90)%360;
  return {width:rotation%180?height:width,height:rotation%180?width:height,rotation};
}

export function drawLandscapeFrame(canvas:HTMLCanvasElement,source:CanvasImageSource,width:number,height:number,turns:number,maxWidth=Infinity){
  const layout=landscapeFrameLayout(width,height,turns);
  drawFrame(canvas,source,width,height,layout,maxWidth);
}

export function drawSavedFrame(canvas:HTMLCanvasElement,source:CanvasImageSource,width:number,height:number,turns:number,maxWidth=Infinity){
  // Never normalize again after applying the user's angle: doing so made
  // adjacent quarter turns produce identical files.
  drawFrame(canvas,source,width,height,landscapeFrameLayout(width,height,turns),maxWidth);
}

// Site camera only. The live video is displayed directly by the browser.
// Clockwise rotation at save time converts landscape to portrait; already
// portrait video must not be normalized twice (which previously inverted it).
export function drawPortraitCapture(canvas:HTMLCanvasElement,source:CanvasImageSource,width:number,height:number){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('Camera frame not ready');
  const landscape=width>height;
  drawFrame(canvas,source,width,height,{width:landscape?height:width,height:landscape?width:height,rotation:landscape?90:0},Infinity);
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
