import DrawingWorker from './drawing-processing.worker?worker';
export function drawingTask<T>(input:Record<string,unknown>,signal?:AbortSignal):Promise<T>{
 return new Promise((resolve,reject)=>{
  const worker=new DrawingWorker();
  const stop=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);worker.terminate();};
  const abort=()=>{stop();reject(new Error('도면 처리를 취소했습니다.'));};
  const timer=setTimeout(()=>{stop();reject(new Error('도면 처리 시간이 초과됐습니다. 인식 범위를 줄여 주세요.'));},120000);
  worker.onmessage=e=>{stop();if(e.data.error)reject(new Error(e.data.error));else resolve(e.data.result);};
  worker.onerror=()=>{stop();reject(new Error('도면 처리기를 실행하지 못했습니다. 새로고침 후 다시 시도해 주세요.'));};
  if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});worker.postMessage(input);
 });
}
