import type {ScheduleDraft} from './types';
export type OcrWord={text:string;bbox:{x0:number;y0:number;x1:number;y1:number}};
export function parseScheduleText(text:string,words:OcrWord[]=[]):ScheduleDraft{
  const compact=text.replace(/(?<=[가-힣])\s+(?=[가-힣])/g,'');
  const region=compact.match(/([가-힣]+\s*\d*\s*구역)/)?.[1].replace(/\s/g,'')||'';
  const d=text.match(/(20\d{2})\s*[년.\-/]\s*(\d{1,2})\s*[월.\-/]\s*(\d{1,2})\s*일?/);
  const date=d?`${d[1]}-${d[2].padStart(2,'0')}-${d[3].padStart(2,'0')}`:'';
  const lotPattern=/^\d{1,5}\s*[-–—]\s*\d{1,4}$/;
  // Locate the lot column before looking at numbers; road addresses and phone
  // numbers elsewhere in a table must not become survey folders.
  const header=words.find(w=>w.text.replace(/\s/g,'')==='번지');
  const towns=words.filter(w=>/^[가-힣]+동$/.test(w.text.trim()));
  const anchors=header?[header]:towns;
  const candidates=words.filter(w=>lotPattern.test(w.text.trim())&&anchors.some(a=>Math.abs((a.bbox.x0+a.bbox.x1-w.bbox.x0-w.bbox.x1)/2)<Math.max(65,a.bbox.x1-a.bbox.x0)*1.1&&w.bbox.y0>a.bbox.y0));
  const folders:ScheduleDraft['folders']=[];
  for(const w of candidates.sort((a,b)=>a.bbox.y0-b.bbox.y0)){
    const town=towns.filter(t=>Math.abs(t.bbox.x0-w.bbox.x0)<100&&t.bbox.y0<=w.bbox.y0).sort((a,b)=>b.bbox.y0-a.bbox.y0)[0]?.text;
    folders.push({lot:(town?town+' ':'')+w.text.replace(/\s/g,'').replace(/[–—]/g,'-'),time:'',name:'',phones:[],address:'',notes:'',group:1});
  }
  if(!folders.length){
    for(const match of text.matchAll(/([가-힣]+동)\s*(\d{1,5})\s*[-–—]\s*(\d{1,4})(?!\d)/g))folders.push({lot:`${match[1]} ${match[2]}-${match[3]}`,time:'',name:'',phones:[],address:'',notes:'',group:1});
  }
  return {region,date,folders,warnings:['인식한 지역·날짜·번지와 건물·호수를 원본과 비교해 주세요.']};
}
export async function recognizeSchedule(file:File,onProgress:(value:number)=>void):Promise<ScheduleDraft>{
  const {tableLines,readTableRows,readScheduleHeader}=await import('./table-ocr');
  const bitmap=await createImageBitmap(file);
  const scale=Math.min(2200/bitmap.width,4000/bitmap.height);
  const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
  const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx){bitmap.close();throw new Error('사진을 열 수 없습니다.');}
  ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const scan={width:canvas.width,height:canvas.height,pixels:ctx.getImageData(0,0,canvas.width,canvas.height).data,async crop(r:import('./table-ocr').Rect){const c=document.createElement('canvas');c.width=r.width+40;c.height=r.height+40;const out=c.getContext('2d')!;out.fillStyle='white';out.fillRect(0,0,c.width,c.height);out.drawImage(canvas,r.left,r.top,r.width,r.height,20,20,r.width,r.height);return c;}};
  const lines=tableLines(scan);
  const {createWorker}=await import('tesseract.js');
  // Korean tessdata requests an optional Traditional Chinese sublanguage;
  // limit initialization to the two models bundled with this application.
  const config:Partial<import('tesseract.js').InitOptions>&{tessedit_load_sublangs:string}={tessedit_load_sublangs:''};
  const worker=await createWorker(['kor','eng'],1,{workerPath:'/ocr/worker.min.js',corePath:'/ocr/tesseract-core-lstm.wasm.js',langPath:'/ocr',logger:m=>{if(!lines&&m.status==='recognizing text')onProgress(Math.round(m.progress*100));}},config);
  try{
    if(lines){
      onProgress(10);const draft=await readScheduleHeader(worker,scan,lines.rows[0],parseScheduleText);
      const table=await readTableRows(worker,scan,lines,onProgress);
      onProgress(100);return {...draft,folders:table.folders,warnings:table.warnings};
    }
    const {data}=await worker.recognize(canvas,{}, {text:true,blocks:true});
    const words=data.blocks?.flatMap(b=>b.paragraphs.flatMap(p=>p.lines.flatMap(l=>l.words)))||[];
    const result=parseScheduleText(data.text,words);result.warnings.unshift('표의 칸을 구분하지 못했습니다. 누락된 일정이 없는지 원본의 행 수와 비교해 주세요.');return result;
  }finally{await worker.terminate();}
}
