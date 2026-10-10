type Axis='width'|'height';
type DimensionLabel={text:string;x?:number;y?:number;box?:number[]};
type Evidence={widthMeters?:number|null;heightMeters?:number|null;labels:DimensionLabel[];dimensionChains:{axis:Axis;labels:number[];terms?:string[]}[];lines?:{a:{x:number;y:number};b:{x:number;y:number}}[];sourceWidth?:number;sourceHeight?:number};
const tolerance=.03;
const normalizedText=(text:string)=>text.normalize('NFKC').trim();
const printedNumber=(label:DimensionLabel|undefined)=>{
 const text=label&&normalizedText(label.text);
 if(!text||!/^\d+(?:\.\d+)?\s*(?:m|미터)?$/i.test(text))return null;
 const value=Number.parseFloat(text);return value>0&&value<=1000?value:null;
};
type Segment={axis:Axis;start:number;end:number;across:number};

function observedGeometry(metadata:Evidence){
 const width=metadata.sourceWidth,height=metadata.sourceHeight;
 if(!width||!height||!Number.isFinite(width)||!Number.isFinite(height)||width<30||height<30||!metadata.lines?.length)return null;
 const scaleX=width/1000,scaleY=height/1000,maxSide=Math.max(width,height),join=Math.max(3,maxSide*.004);
 const segments=metadata.lines.flatMap<Segment>(line=>{
  const ax=line.a.x*scaleX,ay=line.a.y*scaleY,bx=line.b.x*scaleX,by=line.b.y*scaleY,dx=Math.abs(bx-ax),dy=Math.abs(by-ay);
  if(![ax,ay,bx,by].every(Number.isFinite)||Math.max(dx,dy)<join)return [];
  if(dy<=dx*.1)return [{axis:'width' as const,start:Math.min(ax,bx),end:Math.max(ax,bx),across:(ay+by)/2}];
  if(dx<=dy*.1)return [{axis:'height' as const,start:Math.min(ay,by),end:Math.max(ay,by),across:(ax+bx)/2}];
  return [];
 });
 if(!segments.length)return null;
 // Junctions may split one observed edge into several vector segments.
 const merged:Segment[]=[];
 for(const segment of segments.sort((a,b)=>a.axis.localeCompare(b.axis)||a.across-b.across||a.start-b.start)){
  const previous=merged.find(edge=>edge.axis===segment.axis&&Math.abs(edge.across-segment.across)<=join&&segment.start<=edge.end+join&&segment.end>=edge.start-join);
  if(previous){previous.start=Math.min(previous.start,segment.start);previous.end=Math.max(previous.end,segment.end);}else merged.push({...segment});
 }
 const points=metadata.lines.flatMap(line=>[line.a,line.b]).filter(point=>Number.isFinite(point.x)&&Number.isFinite(point.y));
 const xs=points.map(point=>point.x*scaleX),ys=points.map(point=>point.y*scaleY);
 const bounds={left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...ys),bottom:Math.max(...ys)};
 const box=(label:DimensionLabel)=>{
  if(!Number.isFinite(label.x)||!Number.isFinite(label.y))return null;
  const values=label.box;
  if(values?.length===4&&values.every(Number.isFinite)&&values[0]<=values[2]&&values[1]<=values[3])return {left:values[0]*scaleX,top:values[1]*scaleY,right:values[2]*scaleX,bottom:values[3]*scaleY};
  return {left:label.x!*scaleX,top:label.y!*scaleY,right:label.x!*scaleX,bottom:label.y!*scaleY};
 };
 const nearest=(label:DimensionLabel)=>{
  const text=box(label);if(!text)return null;
  const distances=merged.map(edge=>{
   const minX=edge.axis==='width'?edge.start:edge.across,maxX=edge.axis==='width'?edge.end:edge.across;
   const minY=edge.axis==='height'?edge.start:edge.across,maxY=edge.axis==='height'?edge.end:edge.across;
   return {edge,distance:Math.hypot(Math.max(0,minX-text.right,text.left-maxX),Math.max(0,minY-text.bottom,text.top-maxY))};
  }).sort((a,b)=>a.distance-b.distance);
  const first=distances[0],other=distances.find(item=>item.edge.axis!==first.edge.axis),margin=Math.max(3,maxSide*.005);
  if(first.distance>maxSide*.12||other&&(other.distance-first.distance<=margin||first.distance>other.distance*.75))return null;
  return {axis:first.edge.axis,edges:distances.filter(item=>item.edge.axis===first.edge.axis&&item.distance<=first.distance+margin).map(item=>item.edge),box:text};
 };
 return {nearest,fullHeight:(label:DimensionLabel)=>{
  const match=nearest(label);if(!match||match.axis!=='height')return false;
  const side=match.box.right<bounds.left?'left':match.box.left>bounds.right?'right':null;
  if(!side)return false;
  return match.edges.every(edge=>Math.abs(edge.across-bounds[side])<=join&&Math.abs(edge.start-bounds.top)<=join&&Math.abs(edge.end-bounds.bottom)<=join);
 }};
}

// Positions only establish whether written segments follow one dimension axis.
// They never determine the measurement or replace a missing printed number.
function alignment(labels:DimensionLabel[],axis:Axis){
 if(labels.length<2||labels.some(label=>!Number.isFinite(label.x)||!Number.isFinite(label.y)))return 'unknown';
 const along=labels.map(label=>axis==='width'?label.x!:label.y!),across=labels.map(label=>axis==='width'?label.y!:label.x!);
 const span=Math.max(...along)-Math.min(...along),offset=Math.max(...across)-Math.min(...across);
 if(offset>Math.max(120,span*2.5))return 'opposite';
 return offset<=Math.max(35,span*.15)?'aligned':'offset';
}

export function resolveDimensions(metadata:Evidence){
 const warnings:string[]=[],notes:string[]=[];
 const geometry=observedGeometry(metadata);
 const chains=metadata.dimensionChains.map(chain=>{
  if(!chain.terms?.length)return {...chain,ambiguous:false};
  if(chain.labels.length===chain.terms.length&&new Set(chain.labels).size===chain.labels.length&&chain.labels.every((index,i)=>metadata.labels[index]&&normalizedText(metadata.labels[index].text)===normalizedText(chain.terms![i])))return {...chain,ambiguous:false};
  if(chain.terms.some(term=>metadata.labels.filter(label=>normalizedText(label.text)===normalizedText(term)).length>1))return {...chain,labels:[],ambiguous:true};
  const used=new Set<number>();
  return {...chain,ambiguous:false,labels:chain.terms.map(term=>{
   const index=metadata.labels.findIndex((label,i)=>!used.has(i)&&normalizedText(label.text)===normalizedText(term));
   used.add(index);return index;
  })};
 });
 const read=(axis:Axis)=>{
  const name=axis==='width'?'가로':'세로',total=axis==='width'?metadata.widthMeters:metadata.heightMeters;
  if(chains.some(chain=>chain.axis===axis&&chain.ambiguous))warnings.push(`같은 숫자가 여러 곳에 있어 ${name} 치수의 위치를 구분하지 못했습니다. 원본을 확인해 주세요.`);
  let candidates=chains.filter(chain=>chain.axis===axis).map(chain=>{
   const labels=chain.labels.map(index=>metadata.labels[index]);
   const numbers=labels.map(printedNumber);
   const valid=chain.labels.length>0&&new Set(chain.labels).size===chain.labels.length&&!numbers.some(n=>n===null);
   return {chain,value:valid?Math.round((numbers as number[]).reduce((sum,n)=>sum+n,0)*1000)/1000:null,alignment:valid?alignment(labels,axis):'unknown'};
  });
  const otherAxis=candidates.filter(candidate=>candidate.value!=null&&candidate.chain.labels.some(index=>{const nearest=geometry?.nearest(metadata.labels[index]);return nearest&&nearest.axis!==axis;}));
  if(otherAxis.length){
   warnings.push(`서로 다른 방향의 구간이 섞인 ${name} 치수 합계는 관측된 선과 비교해 제외했습니다. 원본을 확인해 주세요.`);
   candidates=candidates.filter(candidate=>!otherAxis.includes(candidate));
  }
  const opposite=candidates.filter(candidate=>candidate.alignment==='opposite');
  if(opposite.length){
   warnings.push(`서로 반대쪽에 적힌 ${name} 치수는 연속 구간으로 더하지 않았습니다.`);
   candidates=candidates.filter(candidate=>candidate.alignment!=='opposite');
  }
  // A stepped edge can legitimately have offset dimension labels. Only discard
  // its conflicting chain when an aligned, complete chain also verifies the total.
  if(total!=null&&candidates.some(candidate=>candidate.alignment==='aligned'&&candidate.value!=null&&Math.abs(candidate.value-total)<=tolerance)){
   const mixed=candidates.filter(candidate=>candidate.alignment==='offset'&&candidate.value!=null&&Math.abs(candidate.value-total)>tolerance);
   if(mixed.length){
    warnings.push(`서로 다른 방향의 구간이 섞인 ${name} 치수 합계는 제외했습니다. 원본을 확인해 주세요.`);
    candidates=candidates.filter(candidate=>!mixed.includes(candidate));
   }
  }
  // Only written outside totals beside a complete observed height edge can fill
  // a missing height chain. Invalid/ambiguous candidates remain and block this.
  if(axis==='height'&&!candidates.length&&geometry){
   const recovered=metadata.labels.flatMap((label,index)=>{const value=printedNumber(label);return value!=null&&geometry.fullHeight(label)?[{index,value}]:[];});
   candidates=recovered.map(item=>({chain:{axis:'height' as const,labels:[item.index],ambiguous:false},value:item.value,alignment:'unknown'}));
  }
  const values=candidates.map(candidate=>candidate.value);
  if(!values.length||values.some(value=>value===null||value>1000)||Math.max(...values as number[])-Math.min(...values as number[])>tolerance){
   warnings.push(`전체 ${name} 치수를 확인해 주세요. 읽힌 치수가 없거나 합계가 일치하지 않습니다.`);return null;
  }
  const value=values[0]!;
  if(total!=null&&Math.abs(total-value)>tolerance){
   warnings.push(`전체 ${name} 치수와 구간 합계가 달라 자동 입력하지 않았습니다.`);return null;
  }
  notes.push(`${name}: ${candidates[0].chain.labels.map(i=>metadata.labels[i].text).join(' + ')} = ${value}m (자동 인식, 원본 확인 필요)`);
  return value;
 };
 return {widthMeters:read('width'),heightMeters:read('height'),warnings,notes};
}
