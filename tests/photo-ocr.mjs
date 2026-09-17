// Run explicitly against a supplied local photograph; never commit user images.
import {createWorker} from 'tesseract.js';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {parseScheduleText} from '../lib/schedule-ocr.ts';
import {tableLines,readTableRows,readScheduleHeader} from '../lib/table-ocr.ts';
const require=createRequire(import.meta.url),runtime=createRequire(require.resolve('wrangler/package.json'));
const sharp=createRequire(runtime.resolve('miniflare'))('sharp');
const source=await sharp(process.argv[2]).resize({width:2200}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const {width,height}=source.info;
const scan={width,height,pixels:source.data,async crop(r){return sharp(source.data,{raw:{width,height,channels:4}}).extract(r).extend({top:20,bottom:20,left:20,right:20,background:'white'}).png().toBuffer();}};
const lines=tableLines(scan);if(!lines)throw new Error('Table not detected');
const worker=await createWorker(['kor','eng'],1,{langPath:new URL('../public/ocr/',import.meta.url).pathname,cacheMethod:'none'},{tessedit_load_sublangs:''});
try{
 const draft=await readScheduleHeader(worker,scan,lines.rows[0],parseScheduleText);
 console.log('Header region/date:',draft.region,draft.date);
 const result=await readTableRows(worker,scan,lines,()=>{});
 if(process.argv.includes('--mangmi')){
  assert.equal(draft.region,'망미5구역');assert.equal(draft.date,'2026-09-15');assert.equal(result.folders.length,11);
  assert.deepEqual(result.folders.map(f=>f.lot.replace('망미동 ','')),['937-7','458-2','435-1','458-2','937-29','937-7','937-7','937-7','937-7','937-5','937-5']);
  assert.deepEqual(result.folders.map(f=>f.unit.match(/\d+호/)?.[0]),['301호','503호','402호','601호','402호','202호','205호','103호','302호','401호','502호']);
  assert.equal(new Set(result.folders.map(f=>JSON.stringify([f.lot,f.unit]))).size,11);
  assert.deepEqual(result.folders.map(f=>f.time),['9:00~10:00','10:00','10:00~11:00','10:00~11:00','오전중','13:00','13:00이후','15:00','15:00~16:00','16:00','16:00~17:00']);
  assert.ok(result.warnings.some(w=>w.includes('일정 5')),'Mixed-script building name remains reviewable');
  console.log('PASS: supplied Mangmi photograph, region/date, all 11 lots/units/times, distinct identities and ambiguous building-name warning.');
 }
 console.log(JSON.stringify({region:draft.region,date:draft.date,folders:result.folders.map(({lot,unit,time})=>({lot,unit,time})),warnings:result.warnings},null,2));
}finally{await worker.terminate();}
