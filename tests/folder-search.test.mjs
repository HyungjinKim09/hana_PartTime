import test from 'node:test';
import assert from 'node:assert/strict';
import {searchFolders} from '../lib/folder-search.ts';
const row=(id,date,unit='만주골든빌 B동 201호')=>({id,date,region:'망미5구역',lot:'망미동 937-029',unit,address:'과정로85번길 12-4',name:'홍길동',count:2,bytes:10});
test('matches address/building/unit fragments ignoring spaces and lot padding',()=>{
 const rows=[row('a','2026-09-17')];
 for(const q of ['937-29','만주 골든빌 201호','B동201호','과정로85번길','홍길동','망미5구역'])assert.equal(searchFolders(rows,q,'address').length,1,q);
 assert.equal(searchFolders(rows,'없는건물','address').length,0);
 assert.equal(searchFolders(rows,'  ','address').length,0);
});
test('address results aggregate all dates, date results stay separate and honor supplied scope',()=>{
 const rows=[row('a','2026-09-17'),row('b','2026-09-18'),row('c','2026-09-18','만주골든빌 B동 202호')];
 const results=searchFolders(rows,'201호','address');assert.equal(results.length,1);assert.equal(results[0].count,4);assert.equal(results[0].folder.id,'b');
 assert.equal(searchFolders(rows,'201호','date').length,2);
 assert.equal(searchFolders(rows.slice(0,1),'201호','address')[0].count,2);
 assert.equal(searchFolders(rows,'2026-09-17','address')[0].count,4);
});
