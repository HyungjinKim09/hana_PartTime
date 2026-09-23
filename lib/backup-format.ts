import {z} from 'zod';
import {drawingSchema} from './drawing.ts';
const id=z.string().min(1).max(150),text=(max:number)=>z.string().max(max);
const mime=z.enum(['image/jpeg','image/png','image/webp','image/gif','image/heic']);
export const backupFolderSchema=z.object({id,region:text(500),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),lot:text(300),unit:text(300).default(''),unitDisplay:text(300).default(''),manualAdded:z.boolean().default(false),time:text(100),name:text(300),phones:z.array(text(100)).max(50),address:text(2000),notes:text(10000),remarks:text(10000).default(''),buildingDetails:text(100).default(''),surveyStatus:z.enum(['미완료','완료','취소','연기']).default('미완료'),group:z.number().int().nonnegative(),revision:z.number().int().positive().default(1),sort:z.number().int().nonnegative().default(0),warning:z.boolean().default(false)});
export const backupPhotoSchema=z.object({id,folder:id,kind:z.enum(['photo','drawing']),filename:text(200),content_type:mime,size:z.number().int().min(1).max(20*1024*1024),created_at:text(40)});
export const backupSourceSchema=z.object({id,filename:text(200),content_type:mime,size:z.number().int().min(1).max(20*1024*1024),draft:text(1024*1024),region:text(500),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),created_at:text(40)});
export const backupDrawingSchema=z.object({id,draft:drawingSchema,revision:z.number().int().positive(),updated_at:text(40)});
export const backupFileSchema=z.object({kind:z.enum(['photo','schedule']),id,path:text(1500),size:z.number().int().min(1).max(20*1024*1024),sha256:z.string().regex(/^[a-f0-9]{64}$/)});
export const backupCatalogSchema=z.object({format:z.literal('hana-backup'),version:z.literal(1),backupId:z.string().uuid(),createdAt:text(40),folders:z.array(backupFolderSchema).max(10000),photos:z.array(backupPhotoSchema).max(100000),sources:z.array(backupSourceSchema).max(10000),drawings:z.array(backupDrawingSchema).max(10000)});
export type BackupCatalog=z.infer<typeof backupCatalogSchema>;
export type BackupFile=z.infer<typeof backupFileSchema>;
export type BackupManifest=BackupCatalog&{files:BackupFile[]};
export function backupPath(kind:'photo'|'schedule',id:string,type:string){const ext:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/heic':'heic'};return `originals/${kind}/${encodeURIComponent(id).replace(/\./g,'%2E')}.${ext[type]||'bin'}`;}
export async function sha256(data:ArrayBuffer|Uint8Array){const bytes=new Uint8Array(data instanceof Uint8Array?data:new Uint8Array(data));return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
export function validateBackup(value:unknown):BackupManifest{
 const manifest=backupCatalogSchema.extend({files:z.array(backupFileSchema).max(110000)}).parse(value);
 const unique=(rows:{id:string}[])=>new Set(rows.map(r=>r.id)).size===rows.length;
 if(!unique(manifest.folders)||!unique(manifest.photos)||!unique(manifest.sources)||!unique(manifest.drawings))throw Error('백업에 중복된 자료 번호가 있습니다.');
 const folders=new Set(manifest.folders.map(f=>f.id)),photos=new Map(manifest.photos.map(p=>[p.id,p]));
 if(manifest.photos.some(p=>!folders.has(p.folder))||manifest.drawings.some(d=>photos.get(d.id)?.kind!=='drawing'))throw Error('백업 자료의 폴더 연결이 맞지 않습니다.');
 const objects=new Map<string,{content_type:string;size:number}>([...manifest.photos.map(p=>['photo:'+p.id,{...p,kind:'photo' as const}] as const),...manifest.sources.map(p=>['schedule:'+p.id,{...p,kind:'schedule' as const}] as const)]);
 const keys=new Set<string>();for(const file of manifest.files){const key=file.kind+':'+file.id,object=objects.get(key);if(keys.has(key)||!object||file.size!==object.size||file.path!==backupPath(file.kind,file.id,object.content_type))throw Error('백업 파일 목록이 맞지 않습니다.');keys.add(key);}
 if(keys.size!==objects.size)throw Error('백업 원본 파일이 빠져 있습니다.');return manifest;
}
