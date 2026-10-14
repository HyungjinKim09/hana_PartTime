import {identityUser,json,failure} from '@/lib/storage';
export async function GET(request:Request){try{const user=await identityUser(request);return json({scope:user.memberId?user.owner+'/'+user.memberId:user.owner});}catch(e){return failure(e);}}
