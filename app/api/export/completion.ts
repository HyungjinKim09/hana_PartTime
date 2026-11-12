import {z} from 'zod';
import {attribution} from '@/lib/attribution';
import {mergeReceiptCoverage,type ReceiptPhotos} from '@/lib/archive-completion';
import type {SessionUser} from '@/lib/session-lookup';
import {ApiError,json,limitedBody} from '@/lib/storage';

const completionSchema=z.object({receipts:z.array(z.string().uuid()).min(1).max(1000)}).strict();

export async function recordCompletedArchive(request:Request,db:D1Database,user:SessionUser){
  let payload:unknown;
  try{
    payload=JSON.parse(new TextDecoder().decode(await limitedBody(request,50000)));
  }catch{throw new ApiError('다운로드 기록을 확인해 주세요.');}
  const parsed=completionSchema.safeParse(payload);
  if(!parsed.success)throw new ApiError('다운로드 기록을 확인해 주세요.');

  const receipts=[...new Set(parsed.data.receipts)];
  const rows=await db.prepare('SELECT folder_photos FROM archive_completion_receipts WHERE owner=? AND id IN (SELECT value FROM json_each(?)) AND expires_at>?')
    .bind(user.owner,JSON.stringify(receipts),Date.now()).all<{folder_photos:string}>();
  if(rows.results.length!==receipts.length)throw new ApiError('다운로드 기록이 만료됐습니다. 사진을 다시 내려받아 주세요.',410);

  let groups:ReceiptPhotos[];
  try{
    groups=mergeReceiptCoverage(rows.results.flatMap(row=>JSON.parse(row.folder_photos) as ReceiptPhotos[]));
  }catch(error){
    throw new ApiError(error instanceof Error?error.message:'사진 목록을 확인해 주세요.',409);
  }
  if(groups.length>10000)throw new ApiError('한 번에 최대 10,000개 사진 폴더를 선택해 주세요.',413);
  const covered=groups.filter(g=>g.ranges.length===1&&g.ranges[0][0]===0&&g.ranges[0][1]===g.total);
  const stamp=attribution(user),statements:D1PreparedStatement[]=[];
  // Check the current photo revision atomically and leave already recorded downloads intact.
  for(let offset=0;offset<covered.length;offset+=500){
    const expected=covered.slice(offset,offset+500).map(({folder,revision,total})=>({folder,revision,total}));
    statements.push(db.prepare(`WITH received AS (
      SELECT json_extract(value,'$.folder') AS folder,json_extract(value,'$.revision') AS revision,
        json_extract(value,'$.total') AS total FROM json_each(?)
    )
    UPDATE survey_folders
    SET download_photo_revision=photo_revision,downloaded_by=?,download_updated_by=?,download_revision=download_revision+1
    WHERE owner=? AND deleting=0 AND (downloaded_by IS NULL OR download_photo_revision IS NOT photo_revision)
      AND EXISTS(
        SELECT 1 FROM received r JOIN folder_stats s ON s.owner=survey_folders.owner AND s.folder=r.folder
        WHERE r.folder=survey_folders.id AND r.revision=survey_folders.photo_revision AND r.total>0 AND s.photo_count=r.total
      )
    RETURNING id`).bind(JSON.stringify(expected),stamp,stamp,user.owner));
  }
  const changed=statements.length?(await db.batch<{id:string}>(statements)).flatMap(result=>result.results):[];
  return json({marked:changed.length,ids:changed.map(row=>row.id)});
}
