import {attribution,parseAttribution} from '@/lib/attribution';
import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {ApiError,failure,identityUser,json,limitedBody,storage} from '@/lib/storage';
import {drawingSchema,drawingOrientationInput,parseDrawingOrientation,drawingMetadataInput,DRAWING_MODEL,DRAWING_DAILY_LIMIT,parseDrawingMetadata} from '@/lib/drawing';
import {drawingLabelReviewInput,parseDrawingLabelReview} from '@/lib/drawing-label-review';

async function context(request:Request){
  const user=await identityUser(request),owner=user.owner,{db}=storage(),id=new URL(request.url).searchParams.get('photo');
  if(!id||!await db.prepare("SELECT id FROM photos WHERE id=? AND owner=? AND kind='drawing' AND deleted=0").bind(id,owner).first())throw new ApiError('도면 사진을 찾을 수 없습니다.',404);
  return {owner,db,id,user};
}
async function body(request:Request){try{return JSON.parse(new TextDecoder().decode(await limitedBody(request,900000)));}catch(e){if(e instanceof ApiError)throw e;throw new ApiError('도면 내용을 확인해 주세요.');}}
export async function GET(request:Request){try{
  const {owner,db,id}=await context(request);
  const row=await db.prepare('SELECT draft,revision,updated_by FROM drawing_drafts WHERE photo_id=? AND owner=?').bind(id,owner).first<{draft:string;revision:number;updated_by:string|null}>();
  return json({draft:row?JSON.parse(row.draft):null,revision:row?.revision||0,updatedBy:parseAttribution(row?.updated_by),aiAvailable:!!env.AI});
}catch(e){return failure(e);}}
export async function PUT(request:Request){try{
  const {owner,db,id,user}=await context(request),parsed=z.object({draft:drawingSchema,revision:z.number().int().min(0)}).safeParse(await body(request));
  if(!parsed.success)throw new ApiError('도면의 선, 글자, 미터 치수를 확인해 주세요.');
  const {draft,revision}=parsed.data,stamp=attribution(user);
  // A deleted photo cannot acquire an orphan draft; concurrent edits cannot overwrite each other.
  const result=await db.prepare(`INSERT INTO drawing_drafts (photo_id,owner,draft,revision,updated_at,updated_by)
    SELECT id,owner,?,1,?,? FROM photos WHERE id=? AND owner=? AND deleted=0 AND kind='drawing' AND (?=0 OR EXISTS (SELECT 1 FROM drawing_drafts WHERE photo_id=?))
    ON CONFLICT(photo_id) DO UPDATE SET draft=excluded.draft,revision=drawing_drafts.revision+1,updated_at=excluded.updated_at,updated_by=excluded.updated_by WHERE drawing_drafts.owner=? AND drawing_drafts.revision=? RETURNING revision`)
    .bind(JSON.stringify(draft),new Date().toISOString(),stamp,id,owner,revision,id,owner,revision).first<{revision:number}>();
  if(!result)throw new ApiError('다른 화면에서 도면이 변경되었거나 사진이 삭제됐습니다. 현재 작업을 비지오로 내려받고 다시 열어 주세요.',409);
  return json({saved:true,revision:result.revision,updatedBy:parseAttribution(stamp)});
}catch(e){return failure(e);}}
export async function POST(request:Request){try{
  const {db}=await context(request);
  const parsed=z.object({mode:z.enum(['orientation','metadata','labels']).default('metadata'),image:z.string().max(850000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/)}).safeParse(await body(request));
  if(!parsed.success)throw new ApiError('도면 사진을 읽지 못했습니다. JPG 또는 PNG 사진으로 다시 시도해 주세요.');
  if(!env.AI)throw new ApiError('자동 인식 연결이 아직 설정되지 않았습니다. 도면 편집과 비지오 저장은 사용할 수 있습니다.',503);
  const day=new Date().toISOString().slice(0,10);
  const reserved=await db.prepare('INSERT INTO drawing_ai_usage (day,requests) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET requests=requests+1 WHERE requests<? RETURNING requests').bind(day,DRAWING_DAILY_LIMIT).first<{requests:number}>();
  if(!reserved)throw new ApiError('오늘의 도면 자동 인식 한도(20회)에 도달했습니다. 기존 도면 편집과 다운로드는 계속 사용할 수 있습니다.',429);
  let result:unknown;
  try{result=await env.AI.run(DRAWING_MODEL,parsed.data.mode==='orientation'?drawingOrientationInput(parsed.data.image):parsed.data.mode==='labels'?drawingLabelReviewInput(parsed.data.image):drawingMetadataInput(parsed.data.image));}
  catch{throw new ApiError('자동 인식 서비스를 사용할 수 없습니다. 무료 사용량 또는 연결 상태를 확인해 주세요. 기존 도면은 유지됩니다.',503);}
  try{return json(parsed.data.mode==='orientation'?{...parseDrawingOrientation(result),remaining:DRAWING_DAILY_LIMIT-reserved.requests}:parsed.data.mode==='labels'?{...parseDrawingLabelReview(result),remaining:DRAWING_DAILY_LIMIT-reserved.requests}:{metadata:parseDrawingMetadata(result),remaining:DRAWING_DAILY_LIMIT-reserved.requests});}
  catch{throw new ApiError('인식 결과가 불완전합니다. 도면 부분이 크게 보이는 사진으로 다시 시도해 주세요. 기존 작업은 유지됩니다.',422);}
}catch(e){return failure(e);}}
