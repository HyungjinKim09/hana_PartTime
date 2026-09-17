export type ZipEntry = { name: string; size: number; open: () => Promise<ReadableStream<Uint8Array>> };
const encoder = new TextEncoder();
const crcTable = Uint32Array.from({length:256}, (_, n) => { let c=n; for(let k=0;k<8;k++) c=(c&1)?0xedb88320^(c>>>1):c>>>1; return c>>>0; });
export function safeFilename(input: string): string {
  let name=input.normalize('NFC').replace(/[\\/<>:"|?*\x00-\x1f]/g,'_').replace(/^[. ]+|[. ]+$/g,'').slice(0,120);
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name='_'+name;
  return name || 'photo';
}
function block(size:number) { const bytes=new Uint8Array(size); return {bytes,view:new DataView(bytes.buffer)}; }

// ZIP64, uncompressed: original bytes are streamed once, without buffering an archive.
async function* zipChunks(entries: ZipEntry[]): AsyncGenerator<Uint8Array> {
  const directory:Uint8Array[]=[];
  let offset=BigInt(0);
  for(const entry of entries) {
    const name=encoder.encode(entry.name), start=offset;
    const h=block(30+name.length+20);
    h.view.setUint32(0,0x04034b50,true); h.view.setUint16(4,45,true); h.view.setUint16(6,0x0808,true);
    h.view.setUint16(12,0x5d21,true);
    h.view.setUint32(18,0xffffffff,true); h.view.setUint32(22,0xffffffff,true);
    h.view.setUint16(26,name.length,true); h.view.setUint16(28,20,true); h.bytes.set(name,30);
    const p=30+name.length; h.view.setUint16(p,1,true); h.view.setUint16(p+2,16,true);
    h.view.setBigUint64(p+4,BigInt(entry.size),true); h.view.setBigUint64(p+12,BigInt(entry.size),true);
    yield h.bytes; offset+=BigInt(h.bytes.length);
    let crc=0xffffffff, size=0;
    const reader=(await entry.open()).getReader();
    let complete=false;
    try { for(;;) { const {value,done}=await reader.read(); if(done){complete=true;break;}
      size+=value.length;
      if(size>entry.size) throw new Error('Original size mismatch');
      for(const byte of value) crc=crcTable[(crc^byte)&255]^(crc>>>8);
      offset+=BigInt(value.length); yield value;
    }} finally {if(!complete) await reader.cancel().catch(()=>{}); reader.releaseLock();}
    if(size!==entry.size) throw new Error('Original size mismatch');
    crc=(crc^0xffffffff)>>>0;
    const d=block(24); d.view.setUint32(0,0x08074b50,true); d.view.setUint32(4,crc,true);
    d.view.setBigUint64(8,BigInt(size),true); d.view.setBigUint64(16,BigInt(size),true);
    yield d.bytes; offset+=BigInt(24);
    const c=block(46+name.length+28);
    c.view.setUint32(0,0x02014b50,true); c.view.setUint16(4,45,true); c.view.setUint16(6,45,true); c.view.setUint16(8,0x0808,true);
    c.view.setUint16(14,0x5d21,true); c.view.setUint32(16,crc,true); c.view.setUint32(20,0xffffffff,true); c.view.setUint32(24,0xffffffff,true);
    c.view.setUint16(28,name.length,true); c.view.setUint16(30,28,true); c.view.setUint32(42,0xffffffff,true);
    if(entry.name.endsWith('/')) c.view.setUint32(38,0x10,true);
    c.bytes.set(name,46); const q=46+name.length; c.view.setUint16(q,1,true); c.view.setUint16(q+2,24,true);
    c.view.setBigUint64(q+4,BigInt(size),true); c.view.setBigUint64(q+12,BigInt(size),true); c.view.setBigUint64(q+20,start,true);
    directory.push(c.bytes);
  }
  const directoryStart=offset;
  for(const c of directory){yield c; offset+=BigInt(c.length);}
  const e=block(56); e.view.setUint32(0,0x06064b50,true); e.view.setBigUint64(4,BigInt(44),true);
  e.view.setUint16(12,45,true); e.view.setUint16(14,45,true);
  e.view.setBigUint64(24,BigInt(entries.length),true); e.view.setBigUint64(32,BigInt(entries.length),true);
  e.view.setBigUint64(40,offset-directoryStart,true); e.view.setBigUint64(48,directoryStart,true); yield e.bytes;
  const locator=block(20); locator.view.setUint32(0,0x07064b50,true); locator.view.setBigUint64(8,offset,true); locator.view.setUint32(16,1,true); yield locator.bytes;
  const end=block(22); end.view.setUint32(0,0x06054b50,true); end.view.setUint16(8,0xffff,true); end.view.setUint16(10,0xffff,true); end.view.setUint32(12,0xffffffff,true); end.view.setUint32(16,0xffffffff,true); yield end.bytes;
}
export function createZipStream(entries:ZipEntry[]):ReadableStream<Uint8Array> {
  const iterator=zipChunks(entries);
  return new ReadableStream({async pull(controller){try{const next=await iterator.next(); if(next.done) controller.close(); else controller.enqueue(next.value);}catch(error){controller.error(error);}},async cancel(){await iterator.return(undefined);}});
}
