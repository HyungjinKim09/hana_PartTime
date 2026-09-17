import {schedule} from './schedule';
import type {Folder} from './types';
import {surveyStatus} from './daily-report';
import {normalizeRoadAddress} from './address.js';
export type FolderRow={id:string;owner:string;region:string;survey_date:string;lot:string;unit:string;unit_display:string;manual_added:number;time:string;name:string;phones:string;address:string;notes:string;remarks:string;building_details:string;survey_status:string;group_index:number;sort_index:number;warning:number;count?:number;bytes?:number};
export function folderView(row:FolderRow):Folder{return {id:row.id,region:row.region,date:row.survey_date,lot:row.lot,unit:row.unit,unitDisplay:row.unit_display,manualAdded:!!row.manual_added,time:row.time,name:row.name,phones:JSON.parse(row.phones),address:normalizeRoadAddress(row.address),notes:row.notes,remarks:row.remarks,buildingDetails:row.building_details,surveyStatus:surveyStatus(row.survey_status),group:row.group_index,warning:!!row.warning,count:row.count??0,bytes:row.bytes??0};}
export async function ensureLegacyFolders(db:D1Database,owner:string){
  if(await db.prepare('SELECT owner FROM folder_seed_state WHERE owner=?').bind(owner).first())return;
  await db.batch([
    ...schedule.map((f,index)=>db.prepare('INSERT INTO survey_folders (owner,id,region,survey_date,lot,time,name,phones,address,notes,group_index,sort_index,warning) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM folder_seed_state WHERE owner=?) ON CONFLICT DO NOTHING').bind(owner,f.id,'사직4구역','2026-09-17','사직동 '+f.id,f.time,f.name,JSON.stringify(f.phones),f.address,f.notes,f.group,index,f.warning?1:0,owner)),
    db.prepare('INSERT INTO folder_seed_state (owner) VALUES (?) ON CONFLICT DO NOTHING').bind(owner),
  ]);
}
export async function listFolders(db:D1Database,owner:string){
  await ensureLegacyFolders(db,owner);
  const result=await db.prepare('SELECT f.*, COALESCE(p.count,0) AS count, COALESCE(p.bytes,0) AS bytes FROM survey_folders f LEFT JOIN (SELECT folder,COUNT(*) AS count,SUM(size) AS bytes FROM photos WHERE owner=? AND deleted=0 GROUP BY folder) p ON p.folder=f.id WHERE f.owner=? ORDER BY f.region,f.survey_date DESC,f.group_index,f.sort_index,f.lot').bind(owner,owner).all<FolderRow>();
  return result.results.map(folderView);
}
export async function findFolder(db:D1Database,owner:string,id:string){await ensureLegacyFolders(db,owner);return db.prepare('SELECT * FROM survey_folders WHERE owner=? AND id=? AND deleting=0').bind(owner,id).first<FolderRow>();}
