import {identity,storage,json,failure,ApiError} from '@/lib/storage';
import {listFolders} from '@/lib/folders';
import {dailyReport} from '@/lib/daily-report';
export async function GET(request:Request){try{
  const owner=await identity();const {db}=storage();const params=new URL(request.url).searchParams;
  const region=params.get('region'),date=params.get('date');if(!region||!date||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new ApiError('지역과 조사 날짜를 선택해 주세요.');
  const folders=(await listFolders(db,owner)).filter(f=>f.region===region&&f.date===date);if(!folders.length)throw new ApiError('해당 날짜의 일정이 없습니다.',404);
  return json({text:dailyReport(region,date,folders),count:folders.length,pending:folders.filter(f=>!f.surveyStatus||f.surveyStatus==='미완료').length});
}catch(e){return failure(e);}}
