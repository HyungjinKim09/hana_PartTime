import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

// Run the production function, substituting only browser/OCR dependencies.
const source=await readFile(new URL('../lib/schedule-ocr.ts',import.meta.url),'utf8');
const javascript=ts.transpile(source,{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023})
 .replace("await import('./table-ocr')",'await globalThis.__ocrTable')
 .replace("await import('tesseract.js')",'globalThis.__ocrLibrary')
 .replace("await import('./mixed-script-ocr')",'globalThis.__ocrMixed');
const {recognizeSchedule}=await import('data:text/javascript;base64,'+Buffer.from(javascript).toString('base64'));

test('cancelling while decoding a sheet closes its bitmap and never starts an OCR engine',async()=>{
 const previous={bitmap:globalThis.createImageBitmap,document:globalThis.document};
 let finishBitmap,started,spawns=0,closed=0;
 const decoding=new Promise(resolve=>started=resolve);
 globalThis.__ocrTable={tableLines:()=>null};globalThis.__ocrMixed={};
 globalThis.__ocrLibrary={createWorker:async()=>{spawns++;return {async terminate(){},async recognize(){return {data:{text:'',blocks:[]}};}};}};
 globalThis.createImageBitmap=()=>{started();return new Promise(resolve=>finishBitmap=()=>resolve({width:2,height:2,close(){closed++;}}));};
 globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},drawImage(){},getImageData:()=>({data:new Uint8ClampedArray(16)})})})};
 try{
  const controller=new AbortController(),job=recognizeSchedule(new File(['x'],'sheet.png'),()=>{},controller.signal);
  const rejected=assert.rejects(job,{name:'AbortError'});
  await decoding;controller.abort();finishBitmap();await rejected;
  assert.equal(spawns,0);assert.equal(closed,1);
 }finally{globalThis.createImageBitmap=previous.bitmap;globalThis.document=previous.document;delete globalThis.__ocrTable;delete globalThis.__ocrLibrary;delete globalThis.__ocrMixed;}
});
