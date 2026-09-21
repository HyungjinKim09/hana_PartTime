import type {Worker,ImageLike} from 'tesseract.js';
import type {ScheduleDraft} from './types';
import {normalizeRoadAddress} from './address.js';
export type MixedCellReader=(data:Pick<import('tesseract.js').Page,'text'|'blocks'>,image:ImageLike,kind:'name'|'address')=>Promise<{text:string;changed:boolean}>;
export type Rect={left:number;top:number;width:number;height:number};
export type ScanImage={width:number;height:number;pixels:Uint8Array|Uint8ClampedArray;crop:(r:Rect)=>Promise<ImageLike>};
export async function readScheduleHeader(worker:Worker,image:ScanImage,bottom:number,parse:(text:string)=>ScheduleDraft){
  const header=await image.crop({left:0,top:0,width:image.width,height:Math.max(1,bottom-5)});
  await worker.setParameters({tessedit_pageseg_mode:'11' as import('tesseract.js').PSM,user_defined_dpi:'150'});
  const draft=parse((await worker.recognize(header)).data.text);
  if(!draft.region||!draft.date){
    await worker.setParameters({tessedit_pageseg_mode:'6' as import('tesseract.js').PSM});
    const second=parse((await worker.recognize(header)).data.text);
    draft.region=draft.region||second.region;draft.date=draft.date||second.date;
  }
  // A separate date line avoids the title/company text distorting segmentation.
  if(!draft.date||!draft.region){
    const bands:{top:number;bottom:number}[]=[];
    for(let y=0;y<bottom-8;y++){
      let count=0;for(let x=0;x<image.width;x++){const i=(y*image.width+x)*4;if(image.pixels[i]<140&&image.pixels[i+1]<140&&image.pixels[i+2]<140)count++;}
      if(count>8){const last=bands.at(-1);if(last&&y-last.bottom<8)last.bottom=y;else bands.push({top:y,bottom:y});}
    }
    await worker.setParameters({tessedit_pageseg_mode:'7' as import('tesseract.js').PSM});
    for(const band of bands.filter(b=>b.bottom-b.top>10).slice(-4).reverse()){
      const line=await image.crop({left:0,top:band.top,width:image.width,height:band.bottom-band.top+1});
      const retry=parse((await worker.recognize(line)).data.text);draft.date=draft.date||retry.date;draft.region=draft.region||retry.region;
      if(draft.date&&draft.region)break;
    }
  }
  return draft;
}
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
export function readLotCell(text:string,region=''){
  const joined=text.normalize('NFKC').replace(/[–—−_]/g,'-').replace(/([가-힣])\s+(?=[가-힣])/g,'$1');
  let town=joined.match(/([가-힣]+[동리가])/u)?.[1]||'';
  if(!town){
    const stem=region.replace(/\d*구역$/,'');
    const suspect=joined.match(/^([가-힣]+)[통등](?=\s*\d)/)?.[1];
    if(stem&&suspect===stem)town=stem+'동';
  }
  const numbers=joined.match(/(?<![\d-])(\d{1,5})\s*-\s*(\d{1,4})(?![\d-])/);
  // A missing hyphen is not inferred: keep the row for explicit correction.
  return numbers?`${town?town+' ':''}${numbers[1]}-${numbers[2]}`:'';
}
export async function readTableRows(worker:Worker,image:ScanImage,lines:NonNullable<ReturnType<typeof tableLines>>,onProgress:(p:number)=>void,region='',refine?:MixedCellReader){
  const {rows,cols}=lines,folders:ScheduleDraft['folders']=[],warnings:string[]=[];
  const allSpans=rows.slice(1,-1).map((top,i)=>({top,bottom:rows[i+2]}));
  const heights=allSpans.map(r=>r.bottom-r.top).sort((a,b)=>a-b);
  const minimum=Math.max(12,heights[Math.floor(heights.length/2)]*.35);
  const spans=allSpans.filter(r=>r.bottom-r.top>=minimum);
  if(spans.length>100)throw new Error('일정이 100개를 넘습니다. 사진을 나눠 등록해 주세요.');
  await worker.setParameters({tessedit_pageseg_mode:'6' as import('tesseract.js').PSM,user_defined_dpi:'150'});
  for(let i=0;i<spans.length;i++){
    const {top,bottom}=spans[i];
    async function cell(column:number){
      if(column+1>=cols.length)return '';
      const crop=await image.crop({left:cols[column]+5,top:top+5,width:cols[column+1]-cols[column]-10,height:bottom-top-10});
      const mixed=!!refine&&(column===2||column===5);
      const result=await worker.recognize(crop,{},mixed?{text:true,blocks:true}:{text:true});
      if(mixed){try{const corrected=await refine!(result.data,crop,column===2?'name':'address');if(corrected.changed)warnings.push(`일정 ${i+1}: ${column===2?'이름':'주소'}의 영문 표식을 별도로 확인해 보완했습니다. (${result.data.text.trim()} → ${corrected.text}) 원본과 비교해 주세요.`);return corrected.text;}catch{warnings.push(`일정 ${i+1}: 영문 보완 인식을 완료하지 못했습니다. ${column===2?'이름':'주소'}를 원본과 확인해 주세요.`);}}
      if(column===4){
        const original=result.data.text.trim().replace(/\s+/g,'');
        // Mixed Korean/English OCR can read short Korean time labels as Latin.
        // Confirm the phrase from the image; never map an arbitrary Latin token.
        if(original&&!/\d/.test(original)&&!/^(오전중|오후중|아무때나)$/.test(original)){
          try{
            await worker.reinitialize('kor',1,{tessedit_load_sublangs:''} as Partial<import('tesseract.js').InitOptions>);
            await worker.setParameters({tessedit_pageseg_mode:'6' as import('tesseract.js').PSM,user_defined_dpi:'150'});
            const retry=(await worker.recognize(crop)).data.text.trim().replace(/\s+/g,'');
            if(/^(오전중|오후중|아무때나)$/.test(retry))return retry;
            warnings.push(`일정 ${i+1}: 방문시간을 원본과 확인해 주세요. (${original})`);
          }finally{
            await worker.reinitialize('kor+eng',1,{tessedit_load_sublangs:''} as Partial<import('tesseract.js').InitOptions>);
            await worker.setParameters({tessedit_pageseg_mode:'6' as import('tesseract.js').PSM,user_defined_dpi:'150'});
          }
        }
      }
      return result.data.text.trim();
    }
    let lotText=await cell(1),lot=readLotCell(lotText,region);
    if(!lot||!/[가-힣]/.test(lot)){
      await worker.setParameters({tessedit_pageseg_mode:'11' as import('tesseract.js').PSM});
      const retryText=await cell(1),retry=readLotCell(retryText,region);
      await worker.setParameters({tessedit_pageseg_mode:'6' as import('tesseract.js').PSM});
      if(retry&&(!lot||/[가-힣]/.test(retry))){lotText=retryText;lot=retry;}
    }
    if(lot!==readLotCell(lotText))warnings.push(`일정 ${i+1}: 동 이름을 표 제목의 지역명과 대조해 보정했습니다. (${lot}) 원본을 확인해 주세요.`);
    if(lot&&!/[가-힣]/.test(lot))warnings.push(`일정 ${i+1}: 숫자 번지만 읽었습니다. 동 이름을 포함해 주소를 확인해 주세요.`);
    if(!lot)warnings.push(`일정 ${i+1}의 번지를 읽지 못했습니다. 원본을 확인해 입력해 주세요.`);
    const name=(await cell(2)).replace(/\s+/g,'');
    const phoneText=(await cell(3)).replace(/\s+/g,'');
    const phones=phoneText.match(/0\d{1,2}-\d{3,4}-\d{4}/g)||[];
    const time=(await cell(4)).replace(/\s+/g,'').replace(/[〜～]/g,'~');
    const address=normalizeRoadAddress(await cell(5));
    const notes=(await cell(6)).split(/\r?\n/).map(line=>line.replace(/[ \t]+/g,' ').trim()).filter(Boolean).join('\n');
    const unit=/\d\s*호/.test(address)?address.replace(/\s+/g,''):'';
    if(/[A-Za-z]/.test(address)&&unit)warnings.push(`일정 ${i+1}: 영문이 섞인 건물·동 이름을 원본과 확인해 주세요. (${address})`);
    folders.push({lot,unit,time,name,phones,address,notes,group:1});
    onProgress(25+(i+1)/spans.length*70);
  }
  const repeated=new Set(folders.filter((f,i)=>folders.some((other,j)=>i!==j&&other.lot===f.lot)).map(f=>f.lot));
  for(let i=0;i<folders.length;i++)if(repeated.has(folders[i].lot)&&!folders[i].unit)warnings.push(`일정 ${i+1}: 같은 번지가 여러 번 나옵니다. 건물·호수를 입력해 구분해 주세요.`);
  return {folders,warnings};
}
