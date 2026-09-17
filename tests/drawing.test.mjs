import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {drawingSchema,parseDrawingResponse,drawingInput} from '../lib/drawing.ts';
import {createVisio,visioParts} from '../lib/visio.ts';
const draft={version:1,widthMeters:12.4,heightMeters:6.7,lines:[{id:'outer',a:{x:0,y:0},b:{x:1000,y:0},dashed:false},{id:'inside',a:{x:250,y:0},b:{x:250,y:1000},dashed:true}],labels:[{id:'name',x:500,y:500,text:'방 & <거실>'}],warnings:[]};
test('AI result must be bounded vector data, not executable content',()=>{
  assert.equal(parseDrawingResponse({choices:[{message:{content:JSON.stringify(draft)}}]}).lines.length,2);
  assert.equal(parseDrawingResponse({response:'```json\n'+JSON.stringify(draft)+'\n```'}).labels[0].text,'방 & <거실>');
  assert.throws(()=>parseDrawingResponse({response:'not JSON'}));
  assert.equal(drawingSchema.safeParse({...draft,lines:[{...draft.lines[0],b:{x:1001,y:0}}]}).success,false);
  assert.equal(drawingSchema.safeParse({...draft,lines:[draft.lines[0],draft.lines[0]]}).success,false);
  assert.equal(drawingSchema.safeParse({...draft,lines:[{...draft.lines[0],b:{x:0,y:0}}]}).success,false);
  assert.equal(drawingSchema.safeParse({...draft,widthMeters:-1}).success,false);
});
test('AI input sends an image and limits output; missing metric size blocks export',()=>{
  const input=drawingInput('data:image/jpeg;base64,test');assert.equal(input.messages[0].content[1].image_url.url,'data:image/jpeg;base64,test');assert.equal(input.max_completion_tokens,6000);
  assert.throws(()=>createVisio({...draft,widthMeters:null}),/전체/);
});
test('VSDX is a valid ZIP with independently editable solid/dashed lines, Korean labels and metric scale',()=>{
  const parts=visioParts(draft);assert.match(parts['visio/pages/page1.xml'],/방 &amp; &lt;거실&gt;/);
  const check=spawnSync('python',['-c',`import sys,io,zipfile,xml.etree.ElementTree as E
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()));assert z.testzip() is None
for n in z.namelist(): E.fromstring(z.read(n))
ns={'v':'http://schemas.microsoft.com/office/visio/2012/main'}
page=E.fromstring(z.read('visio/pages/page1.xml'));shapes=page.findall('v:Shapes/v:Shape',ns);assert len(shapes)==3
def c(shape,n): return shape.find('v:Cell[@N="'+n+'"]',ns).get('V')
assert abs(float(c(shapes[0],'Width'))*0.0254-12.4)<1e-8
assert c(shapes[0],'LinePattern')=='1' and c(shapes[1],'LinePattern')=='2'
assert shapes[0].find('v:Cell[@N="Width"]',ns).get('F')=='SQRT((EndX-BeginX)^2+(EndY-BeginY)^2)'
assert shapes[0].find('v:Section/v:Row[@T="LineTo"]/v:Cell[@N="X"]',ns).get('F')=='Width'
assert shapes[2].find('v:Text',ns).text=='방 & <거실>'
ps=E.fromstring(z.read('visio/pages/pages.xml')).find('v:Page/v:PageSheet',ns)
assert abs(float(c(ps,'PageScale'))/float(c(ps,'DrawingScale'))-0.02)<1e-8
assert not any(n.endswith(('.png','.jpg')) for n in z.namelist())
print('ZIP CRC, XML, scale, shapes and Unicode verified')`],{input:createVisio(draft),encoding:'utf8'});
  assert.equal(check.status,0,check.stderr);console.log(check.stdout.trim());
});

test('Metric extent uses drawn lines, not whitespace around the recognized plan',()=>{
  const parts=visioParts({...draft,lines:[{id:'outer',a:{x:100,y:300},b:{x:900,y:300},dashed:false}]});
  const width=Number(parts['visio/pages/page1.xml'].match(/N="Width" V="([^"]+)"/)[1]);assert.ok(Math.abs(width*0.0254-12.4)<1e-9);
});
