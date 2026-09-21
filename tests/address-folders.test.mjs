import test from 'node:test';
import assert from 'node:assert/strict';
import {addressParts,addressNodes,matchingAddress,withinAddress} from '../lib/address-folders.ts';
const f=(id,lot,unit='',date='2026-09-17',address='')=>({id,region:'사직4',date,lot,unit,address,count:1,bytes:10});
test('same villa across dates joins photos, room and building stay separate',()=>{
 const a=f('a','망미동 937-029','만주골든빌 B동 201호');
 const b=f('b','망미동 937-29','만주골든빌 B동 201호','2026-09-18');
 const c=f('c','망미동 937-029','만주골든빌 B동 202호');
 const d=f('d','망미동 938-029','만주골든빌 B동 201호');
 assert.equal(addressParts(a).length,2);
 assert.equal(addressParts(a)[1].label,'B동 201호');
 assert.deepEqual(matchingAddress([a,b,c,d],a).map(x=>x.id),['a','b']);
 assert.equal(addressNodes([a,b,c,d],[]).length,2);
 assert.equal(addressNodes([a,b,c],addressParts(a).slice(0,1).map(x=>x.key)).length,2);
 assert.ok(addressParts(a).every(x=>!x.label.includes('2026')));
});
test('apartments have building, block and naturally sorted room levels',()=>{
 const a=f('a','명장동 300-089','한신아파트 2동 1001호');
 const b=f('b','명장동 300-89','한신아파트 2동 201호');
 const c=f('c','명장동 300-89','한신아파트 3동 201호');
 const p=addressParts(a);assert.equal(p.length,3);assert.equal(p[1].label,'2동');
 assert.deepEqual(addressNodes([a,b,c],p.slice(0,2).map(x=>x.key)).map(x=>x.label),['201호','1001호']);
 assert.equal(withinAddress(c,p.slice(0,2).map(x=>x.key)),false);
});
test('different regions and unidentified addresses never merge; road and parentheses parsed',()=>{
 const a=f('a','명장동 300-089','','2026-09-17','충렬대로 100 (한신아파트 2동 302호)');
 assert.deepEqual(addressParts(a).slice(1).map(x=>x.label),['2동','302호']);
 assert.equal(matchingAddress([a,{...a,id:'b',region:'다른구역'}],a).length,1);
 assert.equal(matchingAddress([f('a',''),f('b','')],f('a','')).length,1);
});
test('compact imported units retain block, room and building names',()=>{
 const a=f('a','망미동 937-029','만주골든빌B동201호');
 const b=f('b','망미동 937-29','만주골든빌 B동 201호');
 assert.deepEqual(matchingAddress([a,b],a).map(x=>x.id),['a','b']);
 const apt=f('c','명장동 497-076','아림파크2동312호');
 assert.deepEqual(addressParts(apt).slice(1).map(p=>p.label),['2동','312호']);
});
test('whole-building records remain reachable beside rooms with no building name',()=>{
 const whole=f('a','망미동 123-1');const room=f('b','망미동 123-1','201호');
 const top=addressNodes([whole,room],[])[0];assert.equal(top.leaf,false);
 const children=addressNodes([whole,room],[top.key]);
 assert.equal(children.length,2);assert.ok(children.some(n=>n.folders.some(f=>f.id==='a')));
});
test('address view starts with general/separate building categories; date view does not',()=>{
 const general=f('g','망미동 123-1');const villa=f('v','망미동 937-29','만주골든빌 B동 201호');const apt=f('a','명장동 300-89','한신아파트 2동 302호');
 const all=[general,villa,apt];const nodes=addressNodes(all,[],true);
 assert.deepEqual(new Set(nodes.map(n=>n.label)),new Set(['일반건물','구분건물']));
 const separate=nodes.find(n=>n.label==='구분건물');assert.equal(separate.folders.length,2);assert.equal(separate.leaf,false);
 assert.equal(withinAddress(general,[separate.key],true),false);
 assert.equal(addressParts(apt,true).length,4);assert.equal(addressParts(apt)[0].label.includes('구분건물'),false);
 assert.equal(addressNodes(all,[separate.key],true).length,2);
});
