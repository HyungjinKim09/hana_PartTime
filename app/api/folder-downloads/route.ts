import {z} from 'zod';
import {ApiError,failure,identityUser,json,limitedBody,requireSameOrigin,storage} from '@/lib/storage';
import {attribution} from '@/lib/attribution';
import {mergeReceiptCoverage,type ReceiptPhotos} from '@/lib/archive-completion';
async function payload(request:Request){try{return JSON.parse(new TextDecoder().decode(await limitedBody(request,50000)));}catch{throw new ApiError('다운로드 완료 표시를 확인해 주세요.');}}
export async function POST(request:Request){try{
 const user=await identityUser(request);requireSameOrigin(request);const {db}=storage(),data=z.object({receipts:z.array(z.string().uuid()).min(1).max(1000)}).strict().safeParse(await payload(request));if(!data.success)throw new ApiError('받은 ZIP 파일의 완료 표시를 확인해 주세요.');
 const receipts=[...new Set(data.data.receipts)],rows=await db.prepare('SELECT folder_photos FROM archive_completion_receipts WHERE owner=? AND id IN (SELECT value FROM json_each(?)) AND expires_at>?').bind(user.owner,JSON.stringify(receipts),Date.now()).all<{folder_photos:string}>();
 if(rows.results.length!==receipts.length)throw new ApiError('완료 표시 정보가 만료됐습니다. 사진을 다시 내려받아 주세요.',410);
 let groups:ReceiptPhotos[];try{groups=mergeReceiptCoverage(rows.results.flatMap(row=>JSON.parse(row.folder_photos) as ReceiptPhotos[]));}catch(e){throw new ApiError(e instanceof Error?e.message:'사진 목록을 확인해 주세요.',409);}if(groups.length>10000)throw new ApiError('한 번에 최대 10,000개 사진 폴더를 선택해 주세요.',413);
 const covered=groups.filter(g=>g.ranges.length===1&&g.ranges[0][0]===0&&g.ranges[0][1]===g.total),stamp=attribution(user),statements:D1PreparedStatement[]=[];
 // Snapshot check and status write happen in one statement; racing uploads cannot be marked.
 for(let offset=0;offset<covered.length;offset+=500){const expected=JSON.stringify(covered.slice(offset,offset+500).map(({folder,revision,total})=>({folder,revision,total})));statements.push(db.prepare(`WITH received AS (SELECT json_extract(value,'$.folder') AS folder,json_extract(value,'$.revision') AS revision,json_extract(value,'$.total') AS total FROM json_each(?)) UPDATE survey_folders SET download_photo_revision=photo_revision,downloaded_by=?,download_updated_by=?,download_revision=download_revision+1 WHERE owner=? AND deleting=0 AND EXISTS(SELECT 1 FROM received r JOIN folder_stats s ON s.owner=survey_folders.owner AND s.folder=r.folder WHERE r.folder=survey_folders.id AND r.revision=survey_folders.photo_revision AND r.total>0 AND s.photo_count=r.total) RETURNING id`).bind(expected,stamp,stamp,user.owner));}
 const changed=statements.length?(await db.batch<{id:string}>(statements)).flatMap(r=>r.results):[];
 if(!changed.length)throw new ApiError('사진 목록이 변경됐거나 아직 받지 않은 분할 파일이 있습니다. 필요한 ZIP을 모두 받은 뒤 다시 표시해 주세요.',409);
 return json({marked:changed.length,skipped:groups.length-changed.length,ids:changed.map(r=>r.id)});
}catch(e){return failure(e);}}
export async function DELETE(request:Request){try{
 const user=await identityUser(request);requireSameOrigin(request);const {db}=storage(),data=z.object({folder:z.string().min(1).max(150),revision:z.number().int().positive()}).strict().safeParse(await payload(request));if(!data.success)throw new ApiError('완료 표시를 해제할 폴더를 확인해 주세요.');
 const changed=await db.prepare('UPDATE survey_folders SET downloaded_by=NULL,download_photo_revision=NULL,download_updated_by=?,download_revision=download_revision+1 WHERE owner=? AND id=? AND download_revision=? AND deleting=0 RETURNING id').bind(attribution(user),user.owner,data.data.folder,data.data.revision).first();
 if(!changed)throw new ApiError('완료 표시가 변경됐거나 폴더를 찾을 수 없습니다. 새로 확인해 주세요.',409);return json({cleared:true});
}catch(e){return failure(e);}}
