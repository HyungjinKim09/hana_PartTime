import test from 'node:test';
import assert from 'node:assert/strict';
import { createZipStream, safeFilename } from '../lib/zip.ts';
import { spawnSync } from 'node:child_process';

test('ZIP preserves Korean directories, empty folders, and original bytes', async () => {
  const bytes = new TextEncoder().encode('original photo bytes 123456789');
  const entries = [
    { name: '사직4구역/2026-09-17/사직동 158-22/', size: 0, open: async () => new Blob([]).stream() },
    { name: '사직4구역/2026-09-17/사직동 158-22/001_사진.jpg', size: bytes.length, open: async () => new Blob([bytes]).stream() },
    { name: '사직4구역/2026-09-17/사직동 159-4/', size: 0, open: async () => new Blob([]).stream() },
  ];
  const archive = Buffer.from(await new Response(createZipStream(entries)).arrayBuffer());
  const checked = spawnSync('python', ['-c', 'import sys,io,zipfile,json; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() is None; print(json.dumps({"names":z.namelist(),"data":z.read(z.namelist()[1]).decode()},ensure_ascii=False))'], {input: archive, encoding: 'utf8'});
  assert.equal(checked.status, 0, checked.stderr);
  assert.deepEqual(JSON.parse(checked.stdout), {names: entries.map(x=>x.name), data: 'original photo bytes 123456789'});
});

test('unsafe Windows paths become harmless single filenames', () => {
  assert.equal(safeFilename('../사진:1?.jpg'), '_사진_1_.jpg');
  assert.equal(safeFilename('CON'), '_CON');
  assert.ok(!safeFilename('..\\secret.jpg').includes('\\'));
});

test('a missing original fails the ZIP instead of silently dropping it', async () => {
  const stream = createZipStream([{name:'missing.jpg',size:3,open:async()=>{throw new Error('missing original')}}]);
  await assert.rejects(new Response(stream).arrayBuffer(), /missing original/);
});

test('unexpected file size fails instead of producing a corrupt success', async () => {
  const stream = createZipStream([{name:'short.jpg',size:8,open:async()=>new Blob(['abc']).stream()}]);
  await assert.rejects(new Response(stream).arrayBuffer(), /size/i);
});
