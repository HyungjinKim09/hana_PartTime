import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'node:http';
const module=await import('../lib/library-cache.ts').catch(()=>null);
test('returning to loaded scopes and concurrent consumers reuse one response',async()=>{
 assert.ok(module,'a scoped request store is required');const requests=[];const server=createServer((request,response)=>{requests.push(request.url);response.setHeader('Content-Type','application/json');setTimeout(()=>response.end(JSON.stringify({scope:request.url})),10);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port,cache=new module.LibraryCache();
 try{const a=base+'/api/library?folder=A';const b=base+'/api/library?folder=B';const responses=await Promise.all([cache.get(a),cache.get(a)]);assert.deepEqual(responses[0],responses[1]);await cache.get(b);await cache.get(a);assert.equal(requests.length,2);cache.invalidate(url=>new URL(url).searchParams.get('folder')==='A');await cache.get(a);await cache.get(b);assert.equal(requests.length,3);cache.clear();await cache.get(b);assert.equal(requests.length,4);}finally{cache.clear();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('unauthorized responses purge previously loaded private data',async()=>{assert.ok(module);let authorized=true;const server=createServer((_request,response)=>{response.statusCode=authorized?200:401;response.end(JSON.stringify(authorized?{private:'sample'}:{error:'로그인 필요'}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,cache=new module.LibraryCache();try{await cache.get(base+'/old');authorized=false;await assert.rejects(cache.get(base+'/new'),e=>e.status===401);assert.equal(cache.peek(base+'/old'),undefined);}finally{cache.clear();server.closeAllConnections();await new Promise(r=>server.close(r));}});
