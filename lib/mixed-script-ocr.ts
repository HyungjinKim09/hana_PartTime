import type {Worker,Page,ImageLike,Bbox,Symbol as OcrSymbol} from 'tesseract.js';
type Reading=Pick<Page,'text'|'blocks'>;
const symbols=(data:Reading)=>(data.blocks||[]).flatMap(b=>b.paragraphs.flatMap(p=>p.lines.flatMap(l=>l.words.flatMap(w=>w.symbols))));
export async function refineMixedCell(primary:Reading,image:ImageLike,kind:'name'|'address',getEnglish:()=>Promise<Worker>,crop:(box:Bbox)=>Promise<ImageLike>,readPrefix?:(right:number)=>Promise<string>,readKorean?:()=>Promise<Reading>):Promise<{text:string;changed:boolean}>{
 const text=primary.text.trim();
 // Tiny marks after a complete room number can be decoded as repeated o/O.
 // Remove them only when an independent Korean pass confirms the entire prefix.
 const trailingNoise=kind==='address'?text.match(/^(.*\d\s*호)\s*[oO]{2,4}\s*$/u):null;
 if(trailingNoise&&readKorean){
  const reread=(await readKorean()).text.trim().replace(/(\d\s*호)\s*(?:[oOㅇ]{2,4}|으)\s*$/u,'$1');
  if(reread.replace(/\s/g,'')===trailingNoise[1].replace(/\s/g,''))return {text:trailingNoise[1].trim(),changed:true};
 }
 // When mixed OCR turns the Korean 동 suffix into Latin (for example AF),
 // require a Korean reread plus a verified Latin block letter before repairing it.
 const missingBlock=kind==='address'?text.match(/([A-Za-z&^<>]{1,3})\s*(\d+\s*호)/):null;
 if(missingBlock&&readKorean){
  const korean=await readKorean();
  const retry=await refineMixedCell(korean,image,kind,getEnglish,crop);
  const confirmed=retry.text.match(/([A-Za-z])\s*동\s*(\d+\s*호)/);
  if(confirmed&&confirmed[2].replace(/\s/g,'')===missingBlock[2].replace(/\s/g,'')&&missingBlock[1].startsWith(confirmed[1])){
   return {text:text.slice(0,missingBlock.index!)+confirmed[1]+'동 '+missingBlock[2]+text.slice(missingBlock.index!+missingBlock[0].length),changed:true};
  }
 }

 const name=kind==='name'?text.match(/^([가-힣]{2,}(?:\s+[가-힣]+)*)\s*([0-9&^<>()ㄱ-ㅎㅏ-ㅣ]{0,3})$/u):null;
 const blocks=kind==='address'?[...text.matchAll(/(?<![A-Za-z0-9])([0185]|[&^<>]{1,2})\s*동/g)]:[];
 if((!name&&!blocks.length)||(name&&!name[2]&&!readPrefix))return {text,changed:false};
 const en=await getEnglish();await en.setParameters({tessedit_pageseg_mode:'6' as import('tesseract.js').PSM});
 const english=symbols((await en.recognize(image,{}, {text:true,blocks:true})).data);
 async function verify(candidate:OcrSymbol|undefined){
  if(!candidate||!candidate.text.match(/^[A-Za-z0-9&^<>()]$/)||candidate.bbox.x1<=candidate.bbox.x0||candidate.bbox.y1<=candidate.bbox.y0)return '';
  await en.setParameters({tessedit_pageseg_mode:'10' as import('tesseract.js').PSM});
  const result=(await en.recognize(await crop(candidate.bbox))).data;
  const value=result.text.trim();
  // Never force a digit into the alphabet with a whitelist. English letters must
  // be corroborated; disagreement between two letter readings remains manual.
  if(!/^[A-Za-z]$/.test(value)||result.confidence<88)return '';
  if(/^[A-Za-z]$/.test(candidate.text)&&candidate.text.toUpperCase()!==value.toUpperCase())return '';
  return value;
 }
 if(name){
  const last=english.at(-1),letter=await verify(last);
  if(letter&&last){
   // If the suffix disappeared entirely, the remaining image must independently
   // produce the same Korean name. This avoids treating a Hangul stroke as Latin.
   if(name[2]||(readPrefix&&(await readPrefix(last.bbox.x0)).replace(/\s/g,'')===name[1].replace(/\s/g,'')))return {text:name[1]+letter,changed:true};
  }
  return {text,changed:false};
 }
 const base=symbols(primary),edits:{start:number;end:number;value:string}[]=[];let cursor=0;
 for(const match of blocks){
  let index=base.findIndex((s,i)=>i>=cursor&&base.slice(i,i+match[1].length).map(x=>x.text).join('')===match[1]&&base[i+match[1].length]?.text==='동');if(index<0)continue;cursor=index+match[1].length+1;
  const box=base[index].bbox;
  const candidate=english.filter(s=>Math.abs(s.bbox.x0-box.x0)<Math.max(5,(box.y1-box.y0)*.35)&&s.bbox.y0<box.y1&&s.bbox.y1>box.y0).sort((a,b)=>Math.abs(a.bbox.x0-box.x0)-Math.abs(b.bbox.x0-box.x0))[0];
  const letter=await verify(candidate);if(letter)edits.push({start:match.index!,end:match.index!+match[0].length,value:letter+'동'});
 }
 let output=text;for(const edit of edits.reverse())output=output.slice(0,edit.start)+edit.value+output.slice(edit.end);
 return {text:output,changed:output!==text};
}
