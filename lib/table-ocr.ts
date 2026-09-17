import type {Worker,ImageLike} from 'tesseract.js';
import type {ScheduleDraft} from './types';
export type Rect={left:number;top:number;width:number;height:number};
export type ScanImage={width:number;height:number;pixels:Uint8Array|Uint8ClampedArray;crop:(r:Rect)=>Promise<ImageLike>};
// Find long continuous dark strokes, rather than treating dense text as a rule.
export function tableLines(image:ScanImage){
  const {width:w,height:h,pixels:p}=image;
  const dark=(x:number,y:number)=>{const i=(y*w+x)*4;return p[i]<110&&p[i+1]<110&&p[i+2]<110;};
  const ys:number[]=[];
  for(let y=0;y<h;y++){let run=0,best=0;for(let x=0;x<w;x++){run=dark(x,y)?run+1:0;best=Math.max(best,run);}if(best>w*.48)ys.push(y);}
  const merge=(values:number[])=>{const groups:number[][]=[];for(const v of values){const last=groups.at(-1);if(last&&v-last.at(-1)!<8)last.push(v);else groups.push([v]);}return groups.map(g=>Math.round((g[0]+g[g.length-1])/2));};
  const rows=merge(ys);if(rows.length<4)return null;
  const first=rows[0],last=rows[rows.length-1],xs:number[]=[];
  for(let x=0;x<w;x++){let count=0;for(let y=first;y<=last;y++)if(dark(x,y))count++;if(count>(last-first)*.65)xs.push(x);}
  const cols=merge(xs);if(cols.length<5)return null;
  // This is the numbered survey table layout: narrow number column, then lot.
  if(cols[1]-cols[0]>(cols[2]-cols[1])*.9)return null;
  return {rows,cols};
}
export function readLotCell(text:string){
  const joined=text.normalize('NFKC').replace(/[–—−_]/g,'-').replace(/([가-힣])\s+(?=[가-힣])/g,'$1');
  const town=joined.match(/([가-힣]+[동리가])/u)?.[1]||'';
  const numbers=joined.match(/(?<![\d-])(\d{1,5})\s*-\s*(\d{1,4})(?![\d-])/);
  // A missing hyphen is not inferred: keep the row for explicit correction.
  return numbers?`${town?town+' ':''}${numbers[1]}-${numbers[2]}`:'';
}
export async function readTableRows(worker:Worker,image:ScanImage,lines:NonNullable<ReturnType<typeof tableLines>>,onProgress:(p:number)=>void){
  const {rows,cols}=lines,folders:ScheduleDraft['folders']=[],warnings:string[]=[];
  const allSpans=rows.slice(1,-1).map((top,i)=>({top,bottom:rows[i+2]}));
  const heights=allSpans.map(r=>r.bottom-r.top).sort((a,b)=>a-b);
  const minimum=Math.max(12,heights[Math.floor(heights.length/2)]*.35);
  const spans=allSpans.filter(r=>r.bottom-r.top>=minimum);
  if(spans.length>100)throw new Error('일정이 100개를 넘습니다. 사진을 나눠 등록해 주세요.');
  await worker.setParameters({tessedit_pageseg_mode:'6' as import('tesseract.js').PSM});
  for(let i=0;i<spans.length;i++){
    const {top,bottom}=spans[i];
    const result=await worker.recognize(await image.crop({left:cols[1]+5,top:top+5,width:cols[2]-cols[1]-10,height:bottom-top-10}));
    const lot=readLotCell(result.data.text);
    if(!lot)warnings.push(`일정 ${i+1}의 번지를 읽지 못했습니다. 원본을 확인해 입력해 주세요.`);
    folders.push({lot,time:'',name:'',phones:[],address:'',notes:'',group:1});
    onProgress(25+(i+1)/spans.length*70);
  }
  return {folders,warnings};
}
