import {rectifyDrawing,normalizePaper} from './drawing-processing';
import {traceDrawing} from './drawing-trace';
import {orthogonalize} from './drawing-geometry';
self.onmessage=(event)=>{
 try{
  const {mode,data,width,height,quad,boxes}=event.data;
  if(mode==='rectify'){const result=rectifyDrawing(data,width,height,quad);self.postMessage({result}, {transfer:[result.data.buffer]});}
  else self.postMessage({result:orthogonalize(traceDrawing(normalizePaper(data,width,height),width,height,boxes),width,height)});
 }catch(e){self.postMessage({error:e instanceof Error?e.message:'도면 처리에 실패했습니다.'});}
};
