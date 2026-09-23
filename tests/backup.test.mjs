import test from 'node:test';
import assert from 'node:assert/strict';
import {backupPath,validateBackup,sha256} from '../lib/backup-format.ts';
test('backup paths never permit directory traversal or mixed document types',()=>{
 const p=backupPath('photo','../secret','image/png');assert.equal(p.split('/').length,3);assert.ok(!p.split('/').includes('..'));
 assert.throws(()=>validateBackup({format:'hana-backup',version:2}));
});
test('full backup rejects inconsistent/missing file hashes and duplicate IDs',()=>{
 const m={format:'hana-backup',version:1,backupId:crypto.randomUUID(),createdAt:new Date().toISOString(),folders:[],photos:[],sources:[],drawings:[],files:[]};
 assert.equal(validateBackup(m).version,1);
 assert.throws(()=>validateBackup({...m,files:[{kind:'photo',id:'x',path:'../../bad',size:1,sha256:'bad'}]}));
});
test('hash detects changes to original bytes',async()=>{assert.equal(await sha256(new TextEncoder().encode('abc')),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');assert.notEqual(await sha256(new Uint8Array([0])),await sha256(new Uint8Array([1])));});
