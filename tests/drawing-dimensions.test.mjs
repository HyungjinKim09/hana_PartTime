import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveDimensions} from '../lib/drawing-dimensions.ts';
import {rotateQuad} from '../lib/drawing-image.ts';
test('uses complete written chains including balconies and checks opposing sides',()=>{
 const labels=['1.0','10.3','1.1','5.3','1.4','6.7'].map(text=>({text}));
 const result=resolveDimensions({labels,dimensionChains:[{axis:'width',labels:[0,1,2]},{axis:'height',labels:[3,4]},{axis:'height',labels:[5]}]});
 assert.equal(result.widthMeters,12.4);assert.equal(result.heightMeters,6.7);
});
test('conflicting, duplicated, unreadable or absent evidence cannot set dimensions',()=>{
 const labels=['10.3','6.7','8.9','방'].map(text=>({text}));
 assert.equal(resolveDimensions({labels,dimensionChains:[{axis:'height',labels:[1]},{axis:'height',labels:[2]}]}).heightMeters,null);
 for(const indices of [[0,0],[3],[9]])assert.equal(resolveDimensions({labels,dimensionChains:[{axis:'width',labels:indices}]}).widthMeters,null);
 assert.equal(resolveDimensions({labels,dimensionChains:[]}).widthMeters,null);
});
test('quarter turns preserve ordered perspective corners through a full cycle',()=>{
 const quad=[{x:50,y:60},{x:900,y:90},{x:950,y:900},{x:80,y:950}];
 const rotated=rotateQuad(quad,90);
 assert.deepEqual(rotated[0],{x:50,y:80});
 assert.deepEqual(rotateQuad(rotated,270),quad);
});
test('text evidence avoids model indexing errors but must appear in observed labels',()=>{
 const labels=['1.0','10.3','1.1','6.7'].map(text=>({text}));
 assert.equal(resolveDimensions({labels,dimensionChains:[{axis:'width',labels:[],terms:['1.0','10.3','1.1']}]}).widthMeters,12.4);
 assert.equal(resolveDimensions({labels,dimensionChains:[{axis:'width',labels:[],terms:['12.4']}]}).widthMeters,null);
});
test('opposite-side lengths cannot be added when the read total contradicts them',()=>{
 const result=resolveDimensions({heightMeters:6.7,labels:[{text:'5.3'},{text:'6.7'}],dimensionChains:[{axis:'height',labels:[],terms:['5.3','6.7']}]});
 assert.equal(result.heightMeters,null);
});
test('aligned complete dimensions survive a contradictory chain crossing a vertical notch',()=>{
 const labels=[
  {text:'1.0',x:133,y:125},{text:'10.3',x:533,y:105},{text:'1.1',x:883,y:135},
  {text:'4.4',x:295,y:665},{text:'1.4',x:430,y:720},{text:'5.9',x:625,y:805},
 ];
 const dimensionChains=[{axis:'width',labels:[0,1,2]},{axis:'width',labels:[3,4,5]}];
 const result=resolveDimensions({widthMeters:12.4,labels,dimensionChains});
 assert.equal(result.widthMeters,12.4);
 assert.match(result.warnings.join(' '),/서로 다른 방향/);
 // Without the matching total, the photograph alone cannot prove which chain is complete.
 assert.equal(resolveDimensions({labels,dimensionChains}).widthMeters,null);
});
test('a matching model total cannot hide conflicting aligned written chains',()=>{
 const labels=[{text:'1.0',x:100,y:100},{text:'10.3',x:500,y:100},{text:'1.1',x:900,y:100},{text:'1.0',x:100,y:800},{text:'9.3',x:500,y:800},{text:'1.1',x:900,y:800}];
 const result=resolveDimensions({widthMeters:12.4,labels,dimensionChains:[{axis:'width',labels:[0,1,2]},{axis:'width',labels:[3,4,5]}]});
 assert.equal(result.widthMeters,null);
});
test('opposite sides are not consecutive height segments even without a model total',()=>{
 const labels=[{text:'5.3',x:40,y:400},{text:'6.7',x:950,y:460}];
 assert.equal(resolveDimensions({labels,dimensionChains:[{axis:'height',labels:[0,1]}]}).heightMeters,null);
});
test('offset dimensions of a stepped boundary remain usable when they agree',()=>{
 const labels=[{text:'5.3',x:40,y:400},{text:'1.4',x:430,y:720},{text:'6.7',x:950,y:460}];
 assert.equal(resolveDimensions({heightMeters:6.7,labels,dimensionChains:[{axis:'height',labels:[0,1]},{axis:'height',labels:[2]}]}).heightMeters,6.7);
});
test('matching explicit indices preserve which repeated dimensions belong to a chain',()=>{
 const labels=[{text:'6.0',x:100,y:100},{text:'6.0',x:100,y:900},{text:'6.0',x:600,y:100}];
 const result=resolveDimensions({widthMeters:12,labels,dimensionChains:[{axis:'width',labels:[0,2],terms:['6.0','6.0']}]});
 assert.equal(result.widthMeters,12);
});
test('terms without indices abstain when repeated numbers have ambiguous positions',()=>{
 const labels=[{text:'6.0',x:100,y:100},{text:'6.0',x:100,y:900},{text:'6.0',x:600,y:100}];
 const result=resolveDimensions({widthMeters:12,labels,dimensionChains:[{axis:'width',labels:[],terms:['6.0','6.0']}]});
 assert.equal(result.widthMeters,null);
 assert.match(result.warnings.join(' '),/같은 숫자.*위치/);
});
const planGeometry=()=>{
 const coordinates=[[100,200,200,200],[200,200,800,200],[800,200,900,200],[100,200,100,700],[200,200,200,700],[800,200,800,850],[900,200,900,500],[900,500,900,850],[100,700,200,700],[200,700,450,700],[450,700,450,850],[450,850,800,850],[800,850,900,850]];
 return {sourceWidth:1000,sourceHeight:600,lines:coordinates.map(([x1,y1,x2,y2],i)=>({id:'line-'+i,a:{x:x1,y:y1},b:{x:x2,y:y2},dashed:i===3||i===6||i===7}))};
};
const photographedDimensions=()=>[
 {text:'1.0',x:150,y:155,box:[140,145,160,165]},
 {text:'10.3',x:500,y:150,box:[480,140,520,160]},
 {text:'1.1',x:850,y:155,box:[840,145,860,165]},
 {text:'4.4',x:325,y:745,box:[305,735,345,755]},
 {text:'1.4',x:425,y:790,box:[410,780,440,800]},
 {text:'5.9',x:625,y:900,box:[605,890,645,910]},
 {text:'5.3',x:35,y:450,box:[20,440,50,460]},
 {text:'6.7',x:970,y:525,box:[955,515,985,535]},
];
test('observed geometry excludes a vertical notch from width even when AI totals are absent',()=>{
 const result=resolveDimensions({...planGeometry(),labels:photographedDimensions(),dimensionChains:[{axis:'width',labels:[0,1,2]},{axis:'width',labels:[3,4,5]}]});
 assert.equal(result.widthMeters,12.4);
 assert.equal(result.heightMeters,6.7);
 assert.match(result.warnings.join(' '),/다른 방향/);
});
test('a split full-height outside edge supports its printed total but a partial edge does not',()=>{
 const geometry=planGeometry(),labels=photographedDimensions();
 assert.equal(resolveDimensions({...geometry,labels:[labels[7]],dimensionChains:[]}).heightMeters,6.7);
 assert.equal(resolveDimensions({...geometry,labels:[labels[6]],dimensionChains:[]}).heightMeters,null);
 assert.equal(resolveDimensions({...geometry,labels:[],dimensionChains:[]}).heightMeters,null);
});
test('conflicting full-span outside totals and ambiguous corner geometry cannot set height',()=>{
 const geometry=planGeometry(),right=photographedDimensions()[7];
 const lines=[...geometry.lines,{id:'left-extension',a:{x:100,y:700},b:{x:100,y:850},dashed:true}];
 const left={text:'6.8',x:35,y:525,box:[20,515,50,535]};
 assert.equal(resolveDimensions({...geometry,lines,labels:[left,right],dimensionChains:[]}).heightMeters,null);
 const corner={text:'6.7',x:925,y:170,box:[915,160,935,180]};
 assert.equal(resolveDimensions({...geometry,labels:[corner],dimensionChains:[]}).heightMeters,null);
});
test('geometry cannot override duplicate evidence or disagreeing accepted height chains',()=>{
 const geometry=planGeometry(),labels=[photographedDimensions()[7],{text:'6.7',x:35,y:450},{text:'6.8'}];
 assert.equal(resolveDimensions({...geometry,labels,dimensionChains:[{axis:'height',labels:[],terms:['6.7']}]}).heightMeters,null);
 assert.equal(resolveDimensions({...geometry,labels,dimensionChains:[{axis:'height',labels:[0]},{axis:'height',labels:[2]}]}).heightMeters,null);
});
test('an observed diagonal outside the orthogonal outline prevents a false full-height total',()=>{
 const geometry=planGeometry(),label=photographedDimensions()[7];
 const lines=[...geometry.lines,{id:'diagonal-boundary',a:{x:450,y:850},b:{x:700,y:950},dashed:false}];
 assert.equal(resolveDimensions({...geometry,lines,labels:[label],dimensionChains:[]}).heightMeters,null);
});
