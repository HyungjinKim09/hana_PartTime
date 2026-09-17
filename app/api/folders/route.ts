import {z} from 'zod';
import {identity,storage,json,failure,limitedBody,ApiError} from '@/lib/storage';
import {findFolder} from '@/lib/folders';
const update=z.object({id:z.string().min(1).max(150),remarks:z.string().max(10000),buildingDetails:z.string().max(100),surveyStatus:z.enum(['미완료','완료','부분조사','미방문'])}).strict();
export async function PATCH(request:Request){try{
  const owner=await identity(request);const {db}=storage();
  let data;try{data=update.parse(JSON.parse(new TextDecoder().decode(await limitedBody(request,64000))));}catch{throw new ApiError('비고는 10,000자 이내로 입력하고 조사 상태를 확인해 주세요.');}
  if(!await findFolder(db,owner,data.id))throw new ApiError('폴더를 찾을 수 없습니다.',404);
  await db.prepare('UPDATE survey_folders SET remarks=?, building_details=?, survey_status=? WHERE owner=? AND id=?').bind(data.remarks,data.buildingDetails.trim(),data.surveyStatus,owner,data.id).run();
  return json({saved:true});
}catch(e){return failure(e);}}
