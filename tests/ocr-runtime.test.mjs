import {fileURLToPath} from 'node:url';
import {createWorker} from 'tesseract.js';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const runtime=createRequire(require.resolve('wrangler/package.json'));
const sharp=createRequire(runtime.resolve('miniflare'))('sharp');
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="480"><rect width="1000" height="480" fill="white"/><g fill="black" font-size="48" font-family="sans-serif"><text x="80" y="100">FIELD SURVEY</text><text x="80" y="200">2026-09-21</text><text x="80" y="300">158-22</text><text x="80" y="400">159-4</text></g></svg>';
const image=await sharp(Buffer.from(svg)).png().toBuffer();
const worker=await createWorker(['kor','eng'],1,{langPath:fileURLToPath(new URL('../public/ocr/',import.meta.url)),cacheMethod:'none',corePath:fileURLToPath(new URL('../public/ocr/tesseract-core-lstm.wasm.js',import.meta.url))},{tessedit_load_sublangs:''});
try{const {data}=await worker.recognize(image,{}, {text:true,blocks:true});assert.match(data.text,/2026.09.21/);assert.match(data.text,/158.22/);assert.ok(data.blocks.length);console.log('PASS: self-hosted Korean/English model loading, OCR date and lot recognition, word bounding boxes');}finally{await worker.terminate();}
