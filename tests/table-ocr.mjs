import {fileURLToPath} from 'node:url';
import {createWorker} from 'tesseract.js';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {parseScheduleText} from '../lib/schedule-ocr.ts';
import {tableLines,readTableRows,readScheduleHeader} from '../lib/table-ocr.ts';
const require=createRequire(import.meta.url),runtime=createRequire(require.resolve('wrangler/package.json'));
const sharp=createRequire(runtime.resolve('miniflare'))('sharp');
const source=await sharp(fileURLToPath(new URL('./fixtures/korean-schedule.png',import.meta.url))).resize({width:2200,height:4000,fit:'inside'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const {width,height}=source.info;
const scan={width,height,pixels:source.data,async crop(r){return sharp(source.data,{raw:{width,height,channels:4}}).extract(r).extend({top:20,bottom:20,left:20,right:20,background:'white'}).png().toBuffer();}};
const lines=tableLines(scan);assert.ok(lines,'Ruled table detected');
const worker=await createWorker(['kor','eng'],1,{langPath:fileURLToPath(new URL('../public/ocr/',import.meta.url)),cacheMethod:'none'},{tessedit_load_sublangs:''});
try{
 const draft=await readScheduleHeader(worker,scan,lines.rows[0],parseScheduleText);
 const result=await readTableRows(worker,scan,lines,()=>{},draft.region);
 assert.equal(draft.region,'사직4구역');assert.equal(draft.date,'2026-09-21');
 const expected=['158-22','147-85','159-25','158-27','158-23','143-12','158-8','159-4','159-29','159-12','158-59','159-15'].map(n=>'사직동 '+n);
 assert.deepEqual(result.folders.map(f=>f.lot),expected);assert.equal(result.warnings.length,0);
 console.log('PASS: all 12 fixture rows, including the previously unresolved row; printed date and region. Synthetic fixture, not a claim about all user photographs.');
}finally{await worker.terminate();}
