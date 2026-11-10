import {z} from 'zod';
import {ApiError,failure,identityUser,json,limitedBody,requireSameOrigin,storage} from '@/lib/storage';
import {attribution,parseAttribution} from '@/lib/attribution';
import {findFolder} from '@/lib/folders';
import {surveyParticipants} from '@/lib/survey-participants';
async function administrator(request:Request){const user=await identityUser(request);if(!user.isAdmin)throw new ApiError('관리자만 조사 인원을 지정할 수 있습니다.',403);return user;}
export async function GET(request:Request){try{
 const user=await administrator(request),{db}=storage(),params=new URL(request.url).searchParams,folder=params.get('folder')||'',cursor=params.get('cursor')||'',q=(params.get('q')||'').trim();
 if(folder.length>150||cursor.length>150||q.length>80)throw new ApiError('조사 인원 조회 범위를 확인해 주세요.');
 const row=await findFolder(db,user.owner,folder);if(!row)throw new ApiError('폴더를 찾을 수 없습니다.',404);
 const members=await db.prepare('SELECT id,display_name AS name,username,active FROM site_members WHERE owner=? AND id>? AND instr(lower(display_name||\' \'||username),lower(?))>0 ORDER BY id LIMIT 61').bind(user.owner,cursor,q).all();
 const people=await surveyParticipants(db,user.owner,[{key:'folder',folder}]);
 return json({revision:row.participants_revision,assigned:JSON.parse(row.assigned_participants||'[]'),assignedBy:parseAttribution(row.assigned_participants_by),people:people.get('folder'),choices:[...(!cursor&&(!q||('관리자 '+user.username).toLowerCase().includes(q.toLowerCase()))?[{id:'admin',name:'관리자',username:user.username,active:1}]:[]),...members.results.slice(0,60)],nextCursor:members.results.length>60?String(members.results[59].id):null});
}catch(e){return failure(e);}}
export async function PATCH(request:Request){try{
 const user=await administrator(request);requireSameOrigin(request);const {db}=storage();let data;
 try{data=z.object({folder:z.string().min(1).max(150),revision:z.number().int().positive(),ids:z.array(z.string().min(1).max(150)).max(100)}).strict().parse(JSON.parse(new TextDecoder().decode(await limitedBody(request,20000))));}catch{throw new ApiError('폴더와 지정할 조사 인원을 확인해 주세요.');}
 const folder=await findFolder(db,user.owner,data.folder);if(!folder)throw new ApiError('폴더를 찾을 수 없습니다.',404);
 const ids=[...new Set(data.ids)],members=await db.prepare('SELECT id,display_name AS name FROM site_members WHERE owner=? AND id IN (SELECT value FROM json_each(?))').bind(user.owner,JSON.stringify(ids)).all<{id:string;name:string}>();
 const choices=new Map<string,{id:string;name:string}>(JSON.parse(folder.assigned_participants||'[]').map((p:{id:string;name:string})=>[p.id,p]));for(const p of members.results)choices.set(p.id,p);choices.set('admin',{id:'admin',name:'관리자'});
 if(ids.some(id=>!choices.has(id)))throw new ApiError('이 팀에 등록된 조사 인원을 선택해 주세요.');
 const result=await db.prepare('UPDATE survey_folders SET assigned_participants=?,assigned_participants_by=?,participants_revision=participants_revision+1 WHERE owner=? AND id=? AND participants_revision=? AND deleting=0 RETURNING participants_revision AS revision').bind(JSON.stringify(ids.map(id=>choices.get(id))),attribution(user),user.owner,data.folder,data.revision).first();
 if(!result)throw new ApiError('다른 화면에서 조사 인원이 변경됐습니다. 목록을 새로 열어 주세요.',409);return json({saved:true,...result});
}catch(e){return failure(e);}}
