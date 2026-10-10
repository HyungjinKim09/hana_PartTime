import {env} from 'cloudflare:workers';
import {ApiError,failure,identity,imageType,json,limitedBody,requireSameOrigin,storage} from '@/lib/storage';
import {clovaConfig,ocrMonth,parseClovaSchedule} from '@/lib/clova-schedule';

function config(){try{return clovaConfig(env);}catch{throw new ApiError('일정표 인식 설정을 확인해 주세요.',503);}}
export async function GET(request:Request){try{
 await identity(request);const settings=config();
 if(!settings)return json({available:false});
 const row=await storage().db.prepare('SELECT requests FROM schedule_ocr_usage WHERE month=?').bind(ocrMonth()).first<{requests:number}>();
 return json({available:true,limit:settings.limit,used:row?.requests||0,remaining:Math.max(0,settings.limit-(row?.requests||0))});
}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 await identity(request);requireSameOrigin(request);
 const settings=config();if(!settings)throw new ApiError('CLOVA OCR 연결이 아직 설정되지 않았습니다.',503);
 const bytes=await limitedBody(request,20*1024*1024),type=imageType(bytes);
 if(type!=='image/jpeg'&&type!=='image/png')throw new ApiError('일정표는 JPG 또는 PNG로 보내 주세요.',415);
 // Reserve globally before sending: parallel requests cannot exceed the cap.
 // Never refund timeouts/errors, since the provider may already have billed them.
 const reserved=await storage().db.prepare('INSERT INTO schedule_ocr_usage(month,requests) VALUES(?,1) ON CONFLICT(month) DO UPDATE SET requests=requests+1 WHERE requests<? RETURNING requests').bind(ocrMonth(),settings.limit).first<{requests:number}>();
 if(!reserved)throw new ApiError('이번 달 일정표 자동 인식 한도에 도달했습니다. 원본을 보며 직접 입력해 주세요.',429);
 const form=new FormData();form.set('file',new Blob([bytes as BlobPart],{type}),'schedule.'+(type==='image/png'?'png':'jpg'));
 form.set('message',JSON.stringify({version:'V2',requestId:crypto.randomUUID(),timestamp:Date.now(),lang:'ko',enableTableDetection:true,images:[{format:type==='image/png'?'png':'jpg',name:'schedule'}]}));
 let response:Response;
 try{response=await fetch(settings.url,{method:'POST',headers:{'X-OCR-SECRET':settings.secret},body:form,redirect:'manual',signal:AbortSignal.timeout(60000)});}catch{throw new ApiError('일정표 인식 서버 응답을 받지 못했습니다. 호출은 사용량에 포함됩니다. 원본을 보며 직접 입력할 수 있습니다.',503);}
 if(!response.ok)throw new ApiError('CLOVA 인식 요청이 실패했습니다. 연결과 표 추출 설정을 확인해 주세요. 호출은 사용량에 포함됩니다.',502);
 let draft;
 try{const data=await limitedBody(new Request('https://ocr-response.invalid',{method:'POST',body:response.body}),2*1024*1024);draft=parseClovaSchedule(JSON.parse(new TextDecoder().decode(data)));}
 catch(e){throw new ApiError(e instanceof Error&&!('issues' in e)?e.message:'일정표 인식 결과를 확인하지 못했습니다.',422);}
 return json({draft,remaining:settings.limit-reserved.requests,limit:settings.limit});
}catch(e){return failure(e);}}
