"use client";
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {AttributionLabel} from './attribution-label';
import type {Attribution} from '@/lib/attribution';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {drawingSchema,drawingMetadataSchema,drawingBounds,type DrawingDraft} from '@/lib/drawing';
import {rotateCanvas,rotateCrop,rotateQuad,textExclusionBox,drawingLabelReviewImage,rotationTransform,type Rotation} from '@/lib/drawing-image';
import type {TraceLine} from '@/lib/drawing-trace';
import {drawingTask} from '@/lib/drawing-worker-client';
import {reviewLines,validQuad,type Corner} from '@/lib/drawing-processing';
import {orthogonalize} from '@/lib/drawing-geometry';
import {resolveDimensions} from '@/lib/drawing-dimensions';
import {drawingLabelReviewCandidates,drawingLabelReviewSchema,applyDrawingLabelReview} from '@/lib/drawing-label-review';
import {safeFilename} from '@/lib/zip';
import type {Photo} from '@/lib/types';

type Point={x:number;y:number};
type Tool='select'|'solid'|'dashed'|'text';
const empty=():DrawingDraft=>({version:1,widthMeters:null,heightMeters:null,lines:[],labels:[],warnings:[]});
const TRACE_REVISION=5;
export function DrawingEditor({photo,onClose}:{photo:Photo;onClose:()=>void}){
  const [updatedBy,setUpdatedBy]=useState<Attribution|undefined>();
  const [draft,setDraft]=useState<DrawingDraft>(empty),[revision,setRevision]=useState(0),[dirty,setDirty]=useState(false);
  const [busy,setBusy]=useState('불러오는 중…'),[error,setError]=useState(''),[notice,setNotice]=useState(''),[aiAvailable,setAiAvailable]=useState(false);
  const [overlay,setOverlay]=useState(true);
  const [quad,setQuad]=useState<Corner[]>([]),[picking,setPicking]=useState(false),[correctedOverlay,setCorrectedOverlay]=useState('');
  const [rotation,setRotation]=useState<Rotation>(0),[imageSize,setImageSize]=useState({width:1,height:1});
  const [imageReady,setImageReady]=useState(false);
  const [image,setImage]=useState(''),[selected,setSelected]=useState(''),[tool,setTool]=useState<Tool>('select'),[start,setStart]=useState<Point|null>(null);
  const [undo,setUndo]=useState<DrawingDraft[]>([]),[newText,setNewText]=useState('방'),[zoom,setZoom]=useState(1);
  const [crop,setCrop]=useState({left:0,top:0,right:100,bottom:100});
  const svg=useRef<SVGSVGElement>(null),img=useRef<HTMLImageElement>(null),current=useRef(draft),lock=useRef(false),generation=useRef(0);
  const drag=useRef<{id:string;end:'a'|'b'|'label';pointer:number}|null>(null);
  useLayoutEffect(()=>{current.current=draft;},[draft]);
  const api='/api/drawings?photo='+encodeURIComponent(photo.id);
  useEffect(()=>{
    const controller=new AbortController();let url='';
    void (async()=>{try{
      const [metadata,original]=await Promise.all([fetch(api,{signal:controller.signal}),fetch('/api/photos/'+photo.id,{signal:controller.signal})]);
      const data=await metadata.json() as {error?:string;draft:unknown;revision:number;updatedBy?:Attribution;aiAvailable:boolean};if(!metadata.ok)throw new Error(data.error||'도면을 열지 못했습니다.');
      if(!original.ok)throw new Error('원본 사진을 열지 못했습니다.');
      const blob=await original.blob();if(controller.signal.aborted)return;
      url=URL.createObjectURL(blob);setImage(url);setDraft(data.draft?drawingSchema.parse(data.draft):empty());if(data.draft){const loaded=drawingSchema.parse(data.draft);if(loaded.source){setCrop(loaded.source.crop);setRotation(loaded.source.rotation);setQuad(loaded.source.quad||[]);}}setRevision(data.revision);setUpdatedBy(data.updatedBy);setAiAvailable(data.aiAvailable);
    }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'도면을 열지 못했습니다.');}finally{if(!controller.signal.aborted)setBusy('');}})();
    return()=>{controller.abort();generation.current++;if(url)URL.revokeObjectURL(url);};
  },[api,photo.id]);
  useEffect(()=>{if(!dirty&&!busy)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty,busy]);
  useEffect(()=>{
    const source=draft.source,element=img.current;
    if(!source?.quad||!imageReady||!element)return;
    const controller=new AbortController();
    void (async()=>{try{
      const rotated=rotateCanvas(element,source.rotation),canvas=document.createElement('canvas');
      const sw=rotated.width*(source.crop.right-source.crop.left)/100,sh=rotated.height*(source.crop.bottom-source.crop.top)/100,scale=Math.min(1,1600/Math.max(sw,sh));
      canvas.width=Math.round(sw*scale);canvas.height=Math.round(sh*scale);
      canvas.getContext('2d')!.drawImage(rotated,rotated.width*source.crop.left/100,rotated.height*source.crop.top/100,sw,sh,0,0,canvas.width,canvas.height);
      const pixels=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height);
      const result=await drawingTask<{data:Uint8ClampedArray;width:number;height:number}>({mode:'rectify',data:pixels.data,width:canvas.width,height:canvas.height,quad:source.quad},controller.signal);
      canvas.width=result.width;canvas.height=result.height;canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(result.data),result.width,result.height),0,0);
      if(!controller.signal.aborted)setCorrectedOverlay(canvas.toDataURL('image/jpeg',0.85));
    }catch{if(!controller.signal.aborted)setError('보정 원본을 표시하지 못했습니다. 다시 열어 주세요.');}})();
    return()=>controller.abort();
  },[draft.source,imageReady,image]);
  function change(next:DrawingDraft){setUndo(old=>[...old.slice(-39),current.current]);setDraft(next);setDirty(true);setNotice('');}
  function close(){if(busy)return;if(dirty&&!window.confirm('저장하지 않은 도면 변경을 버리고 닫을까요?'))return;onClose();}
  async function recognize(withText=true){
    if(lock.current||!img.current?.naturalWidth)return;
    if((draft.lines.length||draft.labels.length)&&!window.confirm('현재 편집 내용을 새 인식 초안으로 바꿀까요? 저장된 도면은 저장 버튼을 누르기 전까지 유지됩니다.'))return;
    lock.current=true;setBusy('도면을 자동 인식하고 있어요…');setError('');const run=++generation.current;
    try{
      let canvas=document.createElement('canvas');const source=rotateCanvas(img.current,rotation);
      const sx=source.width*crop.left/100,sy=source.height*crop.top/100,sw=source.width*(crop.right-crop.left)/100,sh=source.height*(crop.bottom-crop.top)/100;
      if(sw<20||sh<20)throw new Error('인식 범위를 확인해 주세요. 오른쪽·아래쪽은 왼쪽·위쪽보다 커야 합니다.');
      const scale=Math.min(1,1600/Math.max(sw,sh));
      canvas.width=Math.round(sw*scale);canvas.height=Math.round(sh*scale);const context=canvas.getContext('2d')!;context.imageSmoothingQuality='high';context.drawImage(source,sx,sy,sw,sh,0,0,canvas.width,canvas.height);

      const jpeg=(maxSide=960):string=>{const small=document.createElement('canvas');const ratio=Math.min(1,maxSide/Math.max(canvas.width,canvas.height));small.width=Math.round(canvas.width*ratio);small.height=Math.round(canvas.height*ratio);small.getContext('2d')!.drawImage(canvas,0,0,small.width,small.height);let value=small.toDataURL('image/jpeg',0.85);if(value.length>850000)value=small.toDataURL('image/jpeg',0.6);if(value.length>850000&&maxSide>960)return jpeg(960);if(value.length>850000)throw new Error('사진 용량이 큽니다. 도면 부분을 잘라서 다시 등록해 주세요.');return value;};
      let resultCrop=crop,resultRotation=rotation,resultQuad=quad;
      let metadata={rotation:0,widthMeters:null,heightMeters:null,labels:[],warnings:[],dimensionChains:[]} as ReturnType<typeof drawingMetadataSchema.parse>;
      if(withText){
        setBusy('사진 방향을 확인하고 있어요…');
        const directionResponse=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'orientation',image:jpeg()}),signal:AbortSignal.timeout(60000)});
        const direction=await directionResponse.json() as {rotation:Rotation;error?:string};if(!directionResponse.ok)throw new Error(direction.error||'사진 방향 확인에 실패했습니다.');
        if(![0,90,180,270].includes(direction.rotation))throw new Error('사진 방향을 확인해 주세요.');
        if(direction.rotation){canvas=rotateCanvas(canvas,direction.rotation);resultCrop=rotateCrop(crop,direction.rotation);resultRotation=((rotation+direction.rotation)%360) as Rotation;resultQuad=rotateQuad(quad,direction.rotation);}
      }
      if(resultQuad.length){if(!validQuad(resultQuad))throw new Error('모서리 4개를 왼쪽 위부터 시계 방향으로 지정해 주세요.');setBusy('사진 원근을 보정하고 있어요…');const pixels=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height);const corrected=await drawingTask<{data:Uint8ClampedArray;width:number;height:number}>({mode:'rectify',data:pixels.data,width:canvas.width,height:canvas.height,quad:resultQuad});canvas.width=corrected.width;canvas.height=corrected.height;canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(corrected.data),corrected.width,corrected.height),0,0);}
      if(withText){
        setBusy('도면 글자와 치수를 읽고 있어요…');
        const response=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'metadata',image:jpeg(1600)}),signal:AbortSignal.timeout(150000)});
        const data=await response.json() as {error?:string;metadata:unknown};if(!response.ok)throw new Error(data.error||'자동 인식에 실패했습니다.');metadata=drawingMetadataSchema.parse(data.metadata);
        const candidates=drawingLabelReviewCandidates(metadata);
        if(candidates.length){
          setBusy('읽기 어려운 글자를 확대해 다시 확인하고 있어요…');
          try{
            const reviewResponse=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'labels',image:drawingLabelReviewImage(canvas,candidates.map(i=>metadata.labels[i]))}),signal:AbortSignal.timeout(60000)});
            const result=await reviewResponse.json() as {error?:string};if(!reviewResponse.ok)throw new Error(result.error||'확대 글자 확인에 실패했습니다.');
            metadata=applyDrawingLabelReview(metadata,candidates,drawingLabelReviewSchema.parse(result));
          }catch{metadata.warnings=['확대 글자 확인을 완료하지 못했습니다. 읽기 어려운 글자는 원본과 비교해 주세요.',...metadata.warnings].slice(0,15);}
        }
      }
      if(run!==generation.current)return;
      const pixels=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height);
      setBusy('고해상도 선과 작은 구분선을 추출하고 있어요…');
      const lines=await drawingTask<TraceLine[]>({mode:'trace',data:pixels.data,width:canvas.width,height:canvas.height,boxes:metadata.labels.map(t=>textExclusionBox(t,canvas.width,canvas.height))});
      if(run!==generation.current)return;
      if(!lines.length)throw new Error('선을 충분히 찾지 못했습니다. 도면 부분만 포함하도록 인식 범위를 줄여 주세요.');
      const dimensions=resolveDimensions({...metadata,lines,sourceWidth:canvas.width,sourceHeight:canvas.height});
      change(drawingSchema.parse({version:1,source:{method:'pixel-trace',revision:TRACE_REVISION,quad:resultQuad.length?resultQuad:undefined,rotation:resultRotation,width:canvas.width,height:canvas.height,crop:resultCrop},widthMeters:dimensions.widthMeters,heightMeters:dimensions.heightMeters,lines,labels:metadata.labels.map((t,i)=>({id:'text-'+i,text:t.text,x:t.x,y:t.y})),warnings:[...metadata.warnings.slice(0,8),...dimensions.notes,...dimensions.warnings,'사진의 선을 추출하고 수평·수직에서 15° 이내인 선을 직각 보정했습니다. 흐린 선과 글씨는 원본과 비교해 주세요.','전체 가로·세로 치수를 확인한 후 비지오로 저장해 주세요.']}));setRotation(resultRotation);setCrop(resultCrop);setQuad(resultQuad);setOverlay(true);setSelected('');setStart(null);setTool('select');setNotice('초안입니다. 원본과 비교해 치수와 구분선을 확인한 후 저장하세요.');
    }catch(e){if(run===generation.current)setError(e instanceof Error?e.message:'자동 인식을 완료하지 못했습니다.');}
    finally{lock.current=false;if(run===generation.current)setBusy('');}
  }
  async function save(){
    if(lock.current)return;lock.current=true;setBusy('저장 중…');setError('');
    try{const checked=drawingSchema.safeParse(draft);if(!checked.success)throw new Error('선이 한 개 이상 필요합니다. 좌표와 치수를 확인해 주세요.');
      const response=await fetch(api,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({draft:checked.data,revision})});const data=await response.json() as {error?:string;draft:unknown;revision:number;updatedBy?:Attribution};if(!response.ok)throw new Error(data.error||'저장에 실패했습니다.');setRevision(data.revision);setUpdatedBy(data.updatedBy);setDirty(false);setNotice('도면을 저장했습니다. 다시 열어 계속 편집할 수 있습니다.');
    }catch(e){setError(e instanceof Error?e.message:'저장에 실패했습니다.');}finally{lock.current=false;setBusy('');}
  }
  async function download(){try{setError('');const {createVisio}=await import('@/lib/visio');const bytes=createVisio(draft),url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.ms-visio.drawing'}));const a=document.createElement('a');a.href=url;a.download=safeFilename(photo.filename.replace(/\.[^.]+$/,''))+'_도면.vsdx';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);setNotice('비지오 다운로드를 요청했습니다. 브라우저 다운로드 목록을 확인해 주세요. 사이트에서 이어서 편집하려면 도면 저장을 눌러 주세요.');}catch(e){setError(e instanceof Error?e.message:'비지오 파일을 만들지 못했습니다.');}}
  function point(e:React.PointerEvent):Point{const rect=svg.current!.getBoundingClientRect();return {x:Math.round(Math.max(0,Math.min(1000,(e.clientX-rect.left)/rect.width*1000))),y:Math.round(Math.max(0,Math.min(1000,(e.clientY-rect.top)/rect.height*1000)))};}
  function canvasClick(e:React.PointerEvent<SVGSVGElement>){
    if(busy||drag.current)return;const p=point(e);
    if(tool==='select'){setSelected('');return;}
    if(tool==='text'){if(!newText.trim())return;const id=crypto.randomUUID();change({...draft,labels:[...draft.labels,{id,...p,text:newText.trim()}]});setSelected(id);return;}
    if(!start){setStart(p);return;}
    let end=p;if(Math.abs(p.x-start.x)>Math.abs(p.y-start.y))end={x:p.x,y:start.y};else end={x:start.x,y:p.y};
    if(Math.hypot(end.x-start.x,end.y-start.y)<1)return;
    const id=crypto.randomUUID();change({...draft,lines:[...draft.lines,{id,a:start,b:end,dashed:tool==='dashed'}]});setStart(null);setSelected(id);
  }
  function beginDrag(e:React.PointerEvent,id:string,end:'a'|'b'|'label'){
    e.stopPropagation();if(busy||tool!=='select')return;setSelected(id);setUndo(old=>[...old.slice(-39),draft]);drag.current={id,end,pointer:e.pointerId};svg.current!.setPointerCapture(e.pointerId);
  }
  function move(e:React.PointerEvent){const d=drag.current;if(!d)return;const p=point(e);setDraft(old=>d.end==='label'?{...old,labels:old.labels.map(t=>t.id===d.id?{...t,...p}:t)}:{...old,lines:old.lines.map(l=>{const other=d.end==='a'?l.b:l.a;return l.id===d.id&&Math.hypot(p.x-other.x,p.y-other.y)>=0.1?{...l,[d.end]:p}:l;})});setDirty(true);}
  const review=new Set(reviewLines(draft.lines));
  const bounds=drawingBounds(draft);
  const line=draft.lines.find(l=>l.id===selected),label=draft.labels.find(t=>t.id===selected);
  const coord=(value:number,_axis:'x'|'y')=>Number((value/10).toFixed(2));
  function editPoint(value:string,axis:'x'|'y',end?:'a'|'b'){
    const n=Number(value);if(!Number.isFinite(n))return;const v=Math.max(0,Math.min(1000,n*10));
    if(line&&end&&Math.hypot((axis==='x'?v:line[end].x)-line[end==='a'?'b':'a'].x,(axis==='y'?v:line[end].y)-line[end==='a'?'b':'a'].y)<0.1)return;
    if(line&&end)change({...draft,lines:draft.lines.map(l=>l.id===selected?{...l,[end]:{...l[end],[axis]:v}}:l)});
    else if(label)change({...draft,labels:draft.labels.map(t=>t.id===selected?{...t,[axis]:v}:t)});
  }
  return <Dialog open onOpenChange={open=>{if(!open)close();}}><DialogContent className="drawing-dialog" onInteractOutside={e=>e.preventDefault()} onEscapeKeyDown={e=>{if(busy||dirty)e.preventDefault();}}><DialogHeader><DialogTitle>자동 도면 · 비지오 편집</DialogTitle><DialogDescription>{photo.filename} · 실선은 외곽, 점선은 내부 구분입니다. 문·창문은 추가하지 않습니다.</DialogDescription></DialogHeader>
    {error&&<p className="error-banner" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <AttributionLabel value={updatedBy} label="최근 도면 저장"/><div className="drawing-actions"><button className="primary-button" disabled={!!busy||picking||!imageReady||!aiAvailable} onClick={()=>void recognize()}>방향·치수 자동 인식</button><button className="secondary-button" disabled={!!busy||picking||!imageReady} onClick={()=>void recognize(false)}>사진 선만 추출</button><button className="secondary-button" disabled={!!busy||!dirty} onClick={()=>void save()}>도면 저장</button><button className="secondary-button" disabled={!!busy||!draft.lines.length} onClick={()=>void download()}>비지오(.vsdx) 다운로드</button><button className="subtle-button" disabled={!!busy} onClick={close}>닫기</button></div>
    {busy&&<p role="status">{busy}</p>}{!busy&&!aiAvailable&&<p className="drawing-help">자동 인식 연결이 아직 설정되지 않았습니다. 선·글자 편집과 비지오 저장은 사용할 수 있습니다.</p>}
    <p className="drawing-help">자동 인식은 도면 사진을 Cloudflare AI로 전송합니다. 방향·글자 인식과 필요한 확대 확인에 AI 요청을 최대 3회 사용하며 하루 요청 한도는 20회입니다.</p>
    <div className="drawing-size"><label>베란다 포함 전체 가로(m)<input aria-label="전체 가로 미터" type="number" min="0.01" step="0.1" max="1000" disabled={!!busy} value={draft.widthMeters??''} onChange={e=>change({...draft,widthMeters:e.target.value?Number(e.target.value):null})}/></label><label>전체 세로(m)<input aria-label="전체 세로 미터" type="number" min="0.01" step="0.1" max="1000" disabled={!!busy} value={draft.heightMeters??''} onChange={e=>change({...draft,heightMeters:e.target.value?Number(e.target.value):null})}/></label><label>편집 확대<input aria-label="편집 확대" type="range" min="1" max="3" step="0.25" value={zoom} onChange={e=>setZoom(Number(e.target.value))}/></label></div>
    <div className="drawing-toolbar" role="group" aria-label="도면 도구">{(['select','solid','dashed','text'] as const).map(t=><button key={t} className={tool===t?'primary-button':'secondary-button'} disabled={!!busy} aria-pressed={tool===t} onClick={()=>{setTool(t);setStart(null);}}>{{select:'선택·이동',solid:'실선 추가',dashed:'점선 추가',text:'글자 추가'}[t]}</button>)}<button className="secondary-button" disabled={!!busy||!draft.lines.length} onClick={()=>{change({...draft,lines:orthogonalize(draft.lines,draft.source?.width??1000,draft.source?.height??1000)});setNotice('수평·수직에서 15° 이내인 선을 직각으로 맞추고 교점의 짧은 돌출을 정리했습니다. 확인 후 도면 저장을 눌러 주세요.');}}>직각·돌출 보정</button><button className="subtle-button" disabled={!!busy||!undo.length} onClick={()=>{setDraft(undo[undo.length-1]);setUndo(undo.slice(0,-1));setDirty(true);setSelected('');setStart(null);}}>되돌리기</button>{tool==='text'&&<input aria-label="추가할 글자" value={newText} maxLength={100} onChange={e=>setNewText(e.target.value)}/>}</div>
    <p className="drawing-help">{tool==='select'?'선을 선택하고 양 끝의 점을 끌어 이동하세요. 글자는 끌어서 옮길 수 있습니다.':tool==='text'?'글자를 입력한 뒤 도면에서 놓을 위치를 누르세요.':start?'선의 끝점을 누르세요. 수평·수직으로 맞춰집니다.':'선의 시작점과 끝점을 차례로 누르세요.'}</p>
    <p className="drawing-help">주황색 선은 연결되지 않은 끝점이 있어 확인이 필요합니다 ({review.size}개). 표시가 없어도 누락이 없다는 뜻은 아닙니다. 원본과 비교하세요.</p>
    <div className="drawing-comparison"><section><h3>원본 도면 · 인식 범위</h3>{image&&<div className="drawing-source" onPointerDown={e=>{if(!picking||busy)return;const rect=e.currentTarget.getBoundingClientRect(),x=(e.clientX-rect.left)/rect.width*100,y=(e.clientY-rect.top)/rect.height*100;if(x<crop.left||x>crop.right||y<crop.top||y>crop.bottom)return;const next=[...quad,{x:(x-crop.left)/(crop.right-crop.left)*1000,y:(y-crop.top)/(crop.bottom-crop.top)*1000}];setQuad(next);if(next.length===4)setPicking(false);}} style={{aspectRatio:String(rotation%180?imageSize.height/imageSize.width:imageSize.width/imageSize.height)}}><img ref={img} style={{display:'none'}} src={image} alt="원본 도면" onLoad={event=>{setImageReady(true);setImageSize({width:event.currentTarget.naturalWidth,height:event.currentTarget.naturalHeight});}} onError={()=>setError('이 형식은 브라우저에서 볼 수 없습니다. JPG 또는 PNG로 다시 등록해 주세요.')}/><svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{display:'block',width:'100%',height:'100%'}}><image href={image} width="100" height="100" preserveAspectRatio="none" transform={rotationTransform(rotation)}/><polyline points={quad.map(p=>`${crop.left+p.x/1000*(crop.right-crop.left)},${crop.top+p.y/1000*(crop.bottom-crop.top)}`).join(' ')} fill="none" stroke="#d47700" strokeWidth="0.5"/>{quad.map((p,i)=><g key={i}><circle cx={crop.left+p.x/1000*(crop.right-crop.left)} cy={crop.top+p.y/1000*(crop.bottom-crop.top)} r="1" fill="#d47700"/><text x={crop.left+p.x/1000*(crop.right-crop.left)+1} y={crop.top+p.y/1000*(crop.bottom-crop.top)-1} fontSize="3">{i+1}</text></g>)}</svg><div className="drawing-crop-box" style={{left:crop.left+'%',top:crop.top+'%',width:(crop.right-crop.left)+'%',height:(crop.bottom-crop.top)+'%'}}/></div>}<div className="drawing-actions"><button className="secondary-button" disabled={!!busy} onClick={()=>{setQuad([]);setPicking(false);setRotation(((rotation+270)%360) as Rotation);setCrop(rotateCrop(crop,270));}}>왼쪽으로 90°</button><button className="secondary-button" disabled={!!busy} onClick={()=>{setQuad([]);setPicking(false);setRotation(((rotation+90)%360) as Rotation);setCrop(rotateCrop(crop,90));}}>오른쪽으로 90°</button></div><p className="drawing-help">글자가 바르게 보이는 방향인지 확인하세요. 자동 인식에서도 방향을 확인합니다. 파란 테두리에 도면과 치수만 들어오도록 범위를 조절하면 인식에 도움이 됩니다.</p><div className="drawing-actions"><button className="secondary-button" disabled={!!busy||!imageReady} onClick={()=>{setQuad([]);setPicking(true);}}>원근 보정 · 모서리 지정</button><button className="subtle-button" disabled={!!busy||(!quad.length&&!picking)} onClick={()=>{setQuad([]);setPicking(false);}}>원근 보정 해제</button></div><p className="drawing-help">{picking?`사진에서 왼쪽 위 → 오른쪽 위 → 오른쪽 아래 → 왼쪽 아래 순서로 종이의 직사각형 영역을 눌러 주세요 (${quad.length}/4).`:quad.length===4?'원근 보정 적용 예정. 자동 인식 시 사진 방향과 치수도 함께 확인합니다.':'도면의 ㄱ자 외곽이 아닌 종이의 직사각형 네 모서리를 지정하세요. 치수와 베란다가 모두 들어가야 합니다.'}</p><div className="drawing-crop-controls">{(['left','top','right','bottom'] as const).map(edge=><label key={edge}>{{left:'왼쪽',top:'위쪽',right:'오른쪽',bottom:'아래쪽'}[edge]} (%)<input aria-label={`인식 범위 ${edge}`} type="number" min="0" max="100" step="1" disabled={!!busy} value={crop[edge]} onChange={e=>{setQuad([]);setPicking(false);setCrop({...crop,[edge]:Math.max(0,Math.min(100,Number(e.target.value)))});}}/></label>)}</div></section><section><h3>편집 초안 {dirty?'· 미저장':''}</h3>{draft.source&&draft.source.revision!==TRACE_REVISION&&<p className="drawing-help">이전 검출 방식의 저장 도면입니다. 새 인식으로 다시 만들어 주세요.</p>}{draft.source?<label><input type="checkbox" checked={overlay} onChange={e=>setOverlay(e.target.checked)}/> 원본 겹쳐 보기</label>:draft.lines.length>0?<p className="drawing-help">이전 방식으로 만든 초안입니다. 인식 범위를 도면에 맞춘 후 다시 인식해 주세요.</p>:null}<div className="drawing-canvas-scroll"><svg ref={svg} role="img" aria-label="도면 편집 영역" viewBox="0 0 1000 1000" preserveAspectRatio="none" style={{width:`${zoom*100}%`,aspectRatio:String(draft.source?draft.source.width/draft.source.height:draft.widthMeters&&draft.heightMeters?draft.widthMeters/draft.heightMeters*bounds.height/bounds.width:1.4)}} onPointerDown={canvasClick} onPointerMove={move} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
      {/* eslint-disable-next-line react-hooks/refs -- beginDrag touches DOM refs only in pointer event callbacks, never during this map render. */}
      <rect width="1000" height="1000" fill="white"/>{overlay&&draft.source?.quad&&correctedOverlay&&<image href={correctedOverlay} width="1000" height="1000" preserveAspectRatio="none" opacity="0.65"/>}{overlay&&draft.source&&!draft.source.quad&&image&&<svg width="1000" height="1000" viewBox={`${draft.source.crop.left} ${draft.source.crop.top} ${draft.source.crop.right-draft.source.crop.left} ${draft.source.crop.bottom-draft.source.crop.top}`} preserveAspectRatio="none" pointerEvents="none"><image href={image} width="100" height="100" preserveAspectRatio="none" transform={rotationTransform(draft.source.rotation)} opacity="0.65"/></svg>}{draft.lines.map(l=><g key={l.id}><line x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} stroke={selected===l.id?'#2159b5':review.has(l.id)?'#b56b00':overlay&&draft.source?'#df2626':'#202020'} strokeWidth={l.dashed?1.3:2.1} strokeDasharray={l.dashed?'6 5':undefined} vectorEffect="non-scaling-stroke"/><line x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y} stroke="transparent" strokeWidth="18" vectorEffect="non-scaling-stroke" onPointerDown={e=>{if(tool==='select'){e.stopPropagation();setSelected(l.id);}}}/>{selected===l.id&&(['a','b'] as const).map(end=><circle key={end} cx={l[end].x} cy={l[end].y} r="9" fill="#2159b5" onPointerDown={e=>{beginDrag(e,l.id,end);}}/>)}</g>)}{draft.labels.map(t=><text key={t.id} x={t.x} y={t.y} fontSize="23" textAnchor="middle" dominantBaseline="middle" fill={selected===t.id?'#2159b5':'#202020'} onPointerDown={e=>{beginDrag(e,t.id,'label');}}>{t.text}</text>)}{start&&<circle cx={start.x} cy={start.y} r="7" fill="#2159b5"/>}</svg></div></section></div>
    {(line||label)&&<fieldset className="drawing-properties" disabled={!!busy}><legend>선택한 {line?'선':'글자'} 수정 · 좌표 % (편집 화면 기준)</legend>{line&&<><label><input type="checkbox" checked={line.dashed} onChange={e=>change({...draft,lines:draft.lines.map(l=>l.id===selected?{...l,dashed:e.target.checked}:l)})}/>내부 구분 점선</label>{(['a','b'] as const).map(end=><div key={end}>{end==='a'?'시작':'끝'} {(['x','y'] as const).map(axis=><label key={axis}>{axis.toUpperCase()}<input aria-label={`${end} ${axis}`} type="number" step="0.01" value={coord(line[end][axis],axis)} onChange={e=>editPoint(e.target.value,axis,end)}/></label>)}</div>)}</>}{label&&<><label>글자<input aria-label="선택한 글자" value={label.text} maxLength={100} onChange={e=>change({...draft,labels:draft.labels.map(t=>t.id===selected?{...t,text:e.target.value}:t)})}/></label>{(['x','y'] as const).map(axis=><label key={axis}>{axis.toUpperCase()}<input aria-label={`글자 ${axis}`} type="number" step="0.01" value={coord(label[axis],axis)} onChange={e=>editPoint(e.target.value,axis)}/></label>)}</>}<button className="subtle-button" onClick={()=>{change({...draft,lines:draft.lines.filter(l=>l.id!==selected),labels:draft.labels.filter(t=>t.id!==selected)});setSelected('');}}>선택 항목 삭제</button></fieldset>}
    {draft.warnings.length>0&&<div className="drawing-help"><strong>인식 확인 사항</strong><ul>{draft.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></div>}
  </DialogContent></Dialog>;
}
