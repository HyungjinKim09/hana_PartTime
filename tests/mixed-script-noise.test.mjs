import test from 'node:test';
import assert from 'node:assert/strict';
import {refineMixedCell} from '../lib/mixed-script-ocr.ts';
const unexpected=async()=>{throw new Error('Unexpected English recognition');};
const run=(text,kind='address',reread)=>refineMixedCell({text,blocks:[]},'',kind,unexpected,unexpected,undefined,reread===undefined?undefined:async()=>({text:reread,blocks:[]}));
test('removes repeated o after a room only when Korean reread confirms full address',async()=>{
 for(const text of ['승경빌라 402호 oo','승경빌라402호oo','승경빌라 402호 OO'])assert.deepEqual(await run(text,'address','승경빌라 402호'),{text:text.slice(0,text.toLowerCase().lastIndexOf('oo')).trim(),changed:true});
});
test('keeps unconfirmed readings and real Latin names and block letters',async()=>{
 for(const [text,kind,retry] of [['승경빌라 402호 oo','address','승경빌라 403호'],['승경빌라 402호 oo','address',undefined],['김은주A','name',undefined],['SKY빌라 A동 402호','address',undefined],['승경빌라 402호 A','address',undefined]])assert.deepEqual(await run(text,kind,retry),{text,changed:false});
});

test('Korean reread may retain the same isolated circle artifacts',async()=>{
 assert.deepEqual(await run('승경빌라 402호 oo','address','승경빌라 402호 ㅇㅇ'),{text:'승경빌라 402호',changed:true});
});

test('confirms address when Korean model reads the same trailing marks as a separate eu glyph',async()=>{
 assert.deepEqual(await run('승경빌라 402호 oo','address','승경빌라 402호\n으'),{text:'승경빌라 402호',changed:true});
 assert.deepEqual(await run('승경빌라 402호 oo','address','승경빌라 403호\n으'),{text:'승경빌라 402호 oo',changed:false});
});
