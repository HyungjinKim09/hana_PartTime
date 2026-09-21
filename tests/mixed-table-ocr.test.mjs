import test from 'node:test';
import assert from 'node:assert/strict';
import {readTableRows} from '../lib/table-ocr.ts';
test('table reader retains corrected English name and unit and surfaces review warnings',async()=>{
 const texts=['','망미동 937-020','김정미ㅅ^','010-1234-5678','10:00','영미주택 8동 201호','메모'];
 const worker={async setParameters(){},async recognize(column){return {data:{text:texts[Number(column)],blocks:[]}}}};
 const scan={async crop(r){return String(Math.floor(r.left/100));}};
 const seen=[];
 const result=await readTableRows(worker,scan,{rows:[0,40,140],cols:[0,100,200,300,400,500,600,700]},()=>{},'망미5구역',async(data,image,kind)=>{seen.push(kind);return {text:kind==='name'?'김정미A':'영미주택 B동 201호',changed:true};});
 assert.deepEqual(seen,['name','address']);assert.equal(result.folders[0].name,'김정미A');assert.equal(result.folders[0].unit,'영미주택B동201호');assert.equal(result.folders[0].phones[0],'010-1234-5678');assert.ok(result.warnings.some(w=>w.includes('김정미A')));assert.ok(result.warnings.some(w=>w.includes('B동')));
});
test('English helper failure keeps original row editable instead of aborting the import',async()=>{
 const texts=['','망미동 937-020','김정미8','','','영미주택 8동 201호',''];
 const worker={async setParameters(){},async recognize(column){return {data:{text:texts[Number(column)],blocks:[]}}}};
 const result=await readTableRows(worker,{async crop(r){return String(Math.floor(r.left/100));}},{rows:[0,40,140],cols:[0,100,200,300,400,500,600,700]},()=>{},'',async()=>{throw Error('offline');});
 assert.equal(result.folders[0].name,'김정미8');assert.equal(result.folders[0].address,'영미주택 8동 201호');assert.equal(result.warnings.length,2);
});

test('Korean visit-time phrases survive mixed OCR and worker language is restored',async()=>{
 for(const phrase of ['오전중','오후중','아무때나']){
  let lang='kor+eng';const changes=[];
  const worker={async setParameters(){},async reinitialize(next){lang=next;changes.push(next);},async recognize(column){return {data:{text:Number(column)===4?(lang==='kor'?phrase:'HE'):Number(column)===1?'망미동 937-7':'',blocks:[]}}}};
  const result=await readTableRows(worker,{async crop(r){return String(Math.floor(r.left/100));}},{rows:[0,40,140],cols:[0,100,200,300,400,500,600,700]},()=>{},'망미5구역');
  assert.equal(result.folders[0].time,phrase);assert.deepEqual(changes,['kor','kor+eng']);
 }
});
test('numeric times and recognized Korean phrases remain unchanged without another model pass',async()=>{
 for(const time of ['오전 중','오후중','아무때나','10:00~11:00','13:00이후','오후 3시']){
  const worker={async setParameters(){},async recognize(column){return {data:{text:Number(column)===4?time:Number(column)===1?'망미동 937-7':'',blocks:[]}}}};
  const result=await readTableRows(worker,{async crop(r){return String(Math.floor(r.left/100));}},{rows:[0,40,140],cols:[0,100,200,300,400,500,600,700]},()=>{},'망미5구역');
  assert.equal(result.folders[0].time,time.replace(/\s/g,''));
 }
});

test('unrecognized time remains editable and warns instead of guessing a phrase',async()=>{
 let lang='kor+eng';
 const worker={async setParameters(){},async reinitialize(next){lang=next;},async recognize(column){return {data:{text:Number(column)===4?(lang==='kor'?'확인불가':'HE'):Number(column)===1?'망미동 937-7':'',blocks:[]}}}};
 const result=await readTableRows(worker,{async crop(r){return String(Math.floor(r.left/100));}},{rows:[0,40,140],cols:[0,100,200,300,400,500,600,700]},()=>{},'망미5구역');
 assert.equal(result.folders[0].time,'HE');assert.equal(lang,'kor+eng');assert.ok(result.warnings.some(w=>w.includes('방문시간')));
});
