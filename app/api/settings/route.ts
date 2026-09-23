import {z} from 'zod';
import {ApiError,failure,identity,json,limitedBody,requireSameOrigin,storage} from '@/lib/storage';
import {allowLogin,validAdminKey} from '@/lib/site-auth';
import {budgetUsage} from '@/lib/r2-budget';
export async function GET(){try{await identity();return json(await budgetUsage(storage().db));}catch(e){return failure(e);}}
export async function PUT(request:Request){try{
 requireSameOrigin(request);await identity(request);
 if(!await allowLogin(request,'settings'))throw new ApiError('설정 시도가 많습니다. 잠시 후 다시 시도해 주세요.',429);
 if(!await validAdminKey(request.headers.get('x-admin-key')||''))throw new ApiError('관리 키를 확인해 주세요.',403);
 const parsed=z.object({storageGB:z.number().finite().min(1).max(1000),acknowledgeCost:z.boolean()}).strict().safeParse(JSON.parse(new TextDecoder().decode(await limitedBody(request,2000))));
 if(!parsed.success)throw new ApiError('1~1000GB 사이의 용량을 입력해 주세요.');
 const {db}=storage(),current=await budgetUsage(db),bytes=Math.round(parsed.data.storageGB*1e9);
 if(bytes>current.storageLimit&&!parsed.data.acknowledgeCost)throw new ApiError('한도 증가 시 사용량에 따라 비용이 발생할 수 있음을 확인해 주세요.');
 if(bytes<current.storageBytes)throw new ApiError('현재 저장된 자료보다 낮은 한도는 설정할 수 없습니다.');
 await db.prepare('UPDATE app_settings SET storage_limit=? WHERE id=1').bind(bytes).run();return json(await budgetUsage(db));
}catch(e){return failure(e);}}
