import {drawingSchema,drawingBounds,type DrawingDraft} from './drawing.ts';

const xml=(s:string)=>s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const core='http://schemas.microsoft.com/office/visio/2012/main';
const rel='http://schemas.openxmlformats.org/package/2006/relationships';
const vr='http://schemas.microsoft.com/visio/2010/relationships/';
const header='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const cell=(name:string,value:string|number,unit?:string,formula?:string)=>`<Cell N="${name}" V="${xml(String(value))}"${unit?` U="${unit}"`:''}${formula?` F="${xml(formula)}"`:''}/>`;

export function visioParts(input:DrawingDraft):Record<string,string>{
  const draft=drawingSchema.parse(input),w=draft.widthMeters,h=draft.heightMeters;
  if(!w||!h)throw new Error('전체 가로·세로 길이(m)를 입력해 주세요.');
  const inch=(m:number)=>m/0.0254;
  const bounds=drawingBounds(draft);
  const minX=Math.min(bounds.left,...draft.labels.map(t=>t.x)),maxX=Math.max(bounds.left+bounds.width,...draft.labels.map(t=>t.x));
  const minY=Math.min(bounds.top,...draft.labels.map(t=>t.y)),maxY=Math.max(bounds.top+bounds.height,...draft.labels.map(t=>t.y));
  const x=(v:number)=>inch(0.75+(v-minX)*w/bounds.width),y=(v:number)=>inch(0.75+(maxY-v)*h/bounds.height);
  const pageW=inch((maxX-minX)*w/bounds.width+1.5),pageH=inch((maxY-minY)*h/bounds.height+1.5);
  let shapeId=0;
  const shapes=draft.lines.map(line=>{
    const ax=x(line.a.x),ay=y(line.a.y),bx=x(line.b.x),by=y(line.b.y),length=Math.hypot(bx-ax,by-ay);
    return `<Shape ID="${++shapeId}" NameU="Line.${shapeId}" Type="Shape" LineStyle="0" FillStyle="0" TextStyle="0">${cell('PinX',(ax+bx)/2,undefined,'(BeginX+EndX)/2')}${cell('PinY',(ay+by)/2,undefined,'(BeginY+EndY)/2')}${cell('Width',length,undefined,'SQRT((EndX-BeginX)^2+(EndY-BeginY)^2)')}${cell('Height',0)}${cell('LocPinX',length/2,undefined,'Width*0.5')}${cell('LocPinY',0)}${cell('Angle',Math.atan2(by-ay,bx-ax),undefined,'ATAN2(EndY-BeginY,EndX-BeginX)')}${cell('BeginX',ax)}${cell('BeginY',ay)}${cell('EndX',bx)}${cell('EndY',by)}${cell('LineWeight',line.dashed?0.009:0.016)}${cell('LinePattern',line.dashed?2:1)}${cell('LineColor','#202020')}${cell('FillPattern',0)}<Section N="Geometry" IX="0">${cell('NoFill',1)}<Row T="MoveTo" IX="1">${cell('X',0)}${cell('Y',0)}</Row><Row T="LineTo" IX="2">${cell('X',length,undefined,'Width')}${cell('Y',0)}</Row></Section></Shape>`;
  });
  for(const label of draft.labels){
    const tw=inch(Math.max(1.0,Math.min(4,label.text.length*0.24))),th=inch(0.45);
    shapes.push(`<Shape ID="${++shapeId}" NameU="Text.${shapeId}" Type="Shape" LineStyle="0" FillStyle="0" TextStyle="0">${cell('PinX',x(label.x))}${cell('PinY',y(label.y))}${cell('Width',tw)}${cell('Height',th)}${cell('LocPinX',tw/2,undefined,'Width*0.5')}${cell('LocPinY',th/2,undefined,'Height*0.5')}${cell('Angle',0)}${cell('LinePattern',0)}${cell('FillPattern',0)}${cell('VerticalAlign',1)}${cell('LeftMargin',0)}${cell('RightMargin',0)}${cell('TopMargin',0)}${cell('BottomMargin',0)}<Section N="Character"><Row IX="0">${cell('Font','Malgun Gothic')}${cell('Size',11/72)}${cell('Color','#202020')}${cell('LangID','ko-KR')}</Row></Section><Section N="Paragraph"><Row IX="0">${cell('HorzAlign',1)}</Row></Section><Text>${xml(label.text)}</Text></Shape>`);
  }
  return {
    '[Content_Types].xml':`${header}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/visio/document.xml" ContentType="application/vnd.ms-visio.drawing.main+xml"/><Override PartName="/visio/pages/pages.xml" ContentType="application/vnd.ms-visio.pages+xml"/><Override PartName="/visio/pages/page1.xml" ContentType="application/vnd.ms-visio.page+xml"/></Types>`,
    '_rels/.rels':`${header}<Relationships xmlns="${rel}"><Relationship Id="rId1" Type="${vr}document" Target="visio/document.xml"/></Relationships>`,
    'visio/document.xml':`${header}<VisioDocument xmlns="${core}" xml:space="preserve"><DocumentSettings TopPage="0" DefaultTextStyle="0" DefaultLineStyle="0" DefaultFillStyle="0"/><FaceNames><FaceName NameU="Malgun Gothic"/></FaceNames><StyleSheets><StyleSheet ID="0" NameU="No Style">${cell('LinePattern',1)}${cell('LineWeight',0.01)}${cell('LineColor','#202020')}${cell('FillPattern',0)}${cell('ShdwPattern',0)}${cell('BeginArrow',0)}${cell('EndArrow',0)}<Section N="Character"><Row IX="0">${cell('Font','Malgun Gothic')}${cell('Size',11/72)}${cell('Color','#202020')}</Row></Section></StyleSheet></StyleSheets></VisioDocument>`,
    'visio/_rels/document.xml.rels':`${header}<Relationships xmlns="${rel}"><Relationship Id="rId1" Type="${vr}pages" Target="pages/pages.xml"/></Relationships>`,
    'visio/pages/pages.xml':`${header}<Pages xmlns="${core}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><Page ID="0" NameU="Floor Plan" Name="도면" ViewScale="0.02" ViewCenterX="${pageW/2}" ViewCenterY="${pageH/2}"><PageSheet LineStyle="0" FillStyle="0" TextStyle="0">${cell('PageWidth',pageW)}${cell('PageHeight',pageH)}${cell('PageScale',inch(0.02),'MM')}${cell('DrawingScale',inch(1),'M')}${cell('DrawingScaleType',0)}${cell('DrawingSizeType',3)}${cell('DrawingResizeType',0)}${cell('PrintPageOrientation',w>h?2:1)}</PageSheet><Rel r:id="rId1"/></Page></Pages>`,
    'visio/pages/_rels/pages.xml.rels':`${header}<Relationships xmlns="${rel}"><Relationship Id="rId1" Type="${vr}page" Target="page1.xml"/></Relationships>`,
    'visio/pages/page1.xml':`${header}<PageContents xmlns="${core}" xml:space="preserve"><Shapes>${shapes.join('')}</Shapes></PageContents>`,
  };
}

// Small, stored ZIP32 OPC package: no runtime dependency, remote call, or embedded photo.
export function createVisio(draft:DrawingDraft):Uint8Array<ArrayBuffer>{
  const encoder=new TextEncoder(),files=Object.entries(visioParts(draft)).map(([name,body])=>({name:encoder.encode(name),body:encoder.encode(body)}));
  const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
  const size=files.reduce((n,f)=>n+30+46+2*f.name.length+f.body.length,22),out=new Uint8Array(size),v=new DataView(out.buffer);
  let offset=0;const records:{offset:number;crc:number}[]=[];
  for(const f of files){let crc=0xffffffff;for(const b of f.body)crc=crcTable[(crc^b)&255]^(crc>>>8);crc=(crc^0xffffffff)>>>0;records.push({offset,crc});v.setUint32(offset,0x04034b50,true);v.setUint16(offset+4,20,true);v.setUint16(offset+6,0x800,true);v.setUint16(offset+12,0x5d21,true);v.setUint32(offset+14,crc,true);v.setUint32(offset+18,f.body.length,true);v.setUint32(offset+22,f.body.length,true);v.setUint16(offset+26,f.name.length,true);out.set(f.name,offset+30);out.set(f.body,offset+30+f.name.length);offset+=30+f.name.length+f.body.length;}
  const start=offset;
  files.forEach((f,i)=>{v.setUint32(offset,0x02014b50,true);v.setUint16(offset+4,20,true);v.setUint16(offset+6,20,true);v.setUint16(offset+8,0x800,true);v.setUint16(offset+14,0x5d21,true);v.setUint32(offset+16,records[i].crc,true);v.setUint32(offset+20,f.body.length,true);v.setUint32(offset+24,f.body.length,true);v.setUint16(offset+28,f.name.length,true);v.setUint32(offset+42,records[i].offset,true);out.set(f.name,offset+46);offset+=46+f.name.length;});
  v.setUint32(offset,0x06054b50,true);v.setUint16(offset+8,files.length,true);v.setUint16(offset+10,files.length,true);v.setUint32(offset+12,offset-start,true);v.setUint32(offset+16,start,true);return out;
}
