import {createRequire} from 'node:module';
import {createWorker} from 'tesseract.js';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {refineMixedCell} from '../lib/mixed-script-ocr.ts';
const require=createRequire(import.meta.url),runtime=createRequire(require.resolve('wrangler/package.json'));
const sharp=createRequire(runtime.resolve('miniflare'))('sharp');
const options={langPath:resolve('public/ocr'),cacheMethod:'none'};
const ko=await createWorker(['kor','eng'],1,options,{tessedit_load_sublangs:''});let en;
try{
 await ko.setParameters({tessedit_pageseg_mode:'6'});
 for(const [expected,kind] of [['김정미A','name'],['김정미B','name'],['김정미C','name'],['김정미D','name'],['김정미','name'],['김미경','name'],['김정미ㅅ','name'],['김정미8','name'],['영미주택 B동 201호','address'],['영미주택 A동 201호','address'],['영미주택 8동 201호','address']]){
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="110"><rect width="100%" height="100%" fill="white"/><text x="20" y="68" font-family="Malgun Gothic" font-size="32">${expected}</text></svg>`;
  const image=await sharp(Buffer.from(svg)).png().toBuffer();const {data}=await ko.recognize(image,{}, {text:true,blocks:true});
  const result=await refineMixedCell(data,image,kind,async()=>en||=await createWorker('eng',1,options),async b=>sharp(image).extract({left:b.x0,top:b.y0,width:b.x1-b.x0,height:b.y1-b.y0}).resize({height:90}).extend({top:20,bottom:20,left:20,right:20,background:'white'}).png().toBuffer(),async right=>(await ko.recognize(await sharp(image).extract({left:0,top:0,width:right,height:110}).png().toBuffer())).data.text,async()=>{await ko.reinitialize('kor',1,{tessedit_load_sublangs:''});try{await ko.setParameters({tessedit_pageseg_mode:'6'});return (await ko.recognize(image,{}, {text:true,blocks:true})).data;}finally{await ko.reinitialize(['kor','eng'],1,{tessedit_load_sublangs:''});await ko.setParameters({tessedit_pageseg_mode:'6'});}});
  assert.equal(result.text.replace(/\s/g,''),expected.replace(/\s/g,''),`${expected}: base=${data.text.trim()}, refined=${result.text}`);
 }
 console.log('PASS real OCR: Korean names A/B/C/D preserved; Korean-only names, numeric suffixes and numeric blocks unchanged.');
}finally{await ko.terminate();if(en)await en.terminate();}
