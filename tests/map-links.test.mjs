import test from 'node:test';
import assert from 'node:assert/strict';
import {mapAddresses,mapLinks} from '../lib/map-links.ts';
test('map queries use road or lot without apartment units or contact details',()=>{
 assert.deepEqual(mapAddresses({address:'과정로85번길 12-4 (영미주택 B동 201호)',lot:'망미동 435-038'}),['과정로85번길 12-4','망미동 435-038']);
 assert.deepEqual(mapAddresses({address:'',lot:'사직동 159-10'}),['사직동 159-10']);
 assert.deepEqual(mapAddresses({address:'',lot:''}),[]);
});
test('mobile map schemes preserve Korean query and provide encoded web fallback',()=>{
 const address='망미동 435-038 & A';
 for(const provider of ['kakao','naver']){
  const ios=mapLinks(provider,address,'ios','https://hana.example');
  const app=new URL(ios.app);assert.equal(app.searchParams.get(provider==='kakao'?'q':'query'),address);
  if(provider==='naver')assert.equal(app.searchParams.get('appname'),'https://hana.example');
  const android=mapLinks(provider,address,'android','https://hana.example');
  assert.ok(android.app.startsWith('intent://search?'));
  assert.ok(android.app.includes('S.browser_fallback_url='+encodeURIComponent(android.web)));
  const desktop=mapLinks(provider,address,'web','https://hana.example');assert.equal(desktop.app,desktop.web);assert.ok(desktop.web.startsWith('https://'));
 }
});
