import type {Folder} from './types';
import {surveyStatus} from './daily-report';
import {normalizeRoadAddress} from './address.js';
export type FolderRow={id:string;owner:string;revision:number;region:string;survey_date:string;lot:string;unit:string;unit_display:string;manual_added:number;time:string;name:string;phones:string;address:string;notes:string;remarks:string;building_details:string;survey_status:string;group_index:number;sort_index:number;warning:number;count?:number;bytes?:number;photo_count?:number;photo_bytes?:number;drawing_count?:number};
export function folderView(row:FolderRow):Folder{return {id:row.id,revision:row.revision,region:row.region,date:row.survey_date,lot:row.lot,unit:row.unit,unitDisplay:row.unit_display,manualAdded:!!row.manual_added,time:row.time,name:row.name,phones:JSON.parse(row.phones),address:normalizeRoadAddress(row.address),notes:row.notes,remarks:row.remarks,buildingDetails:row.building_details,surveyStatus:surveyStatus(row.survey_status),group:row.group_index,warning:!!row.warning,count:row.count??0,bytes:row.bytes??0,photoCount:row.photo_count??0,photoBytes:row.photo_bytes??0,drawingCount:row.drawing_count??0};}
export async function ensureLegacyFolders(db:D1Database,owner:string){
  if(await db.prepare('SELECT owner FROM folder_seed_state WHERE owner=?').bind(owner).first())return;
  // Existing database folders stay intact. New accounts start with an empty library.
  await db.prepare('INSERT INTO folder_seed_state (owner) VALUES (?) ON CONFLICT DO NOTHING').bind(owner).run();
}
export async function listFolders(db:D1Database,owner:string){
  await ensureLegacyFolders(db,owner);
  const result=await db.prepare('SELECT f.*,COALESCE(p.count,0) AS count,COALESCE(p.bytes,0) AS bytes,COALESCE(p.photo_count,0) AS photo_count,COALESCE(p.photo_bytes,0) AS photo_bytes,COALESCE(p.drawing_count,0) AS drawing_count FROM survey_folders f LEFT JOIN folder_stats p ON p.owner=f.owner AND p.folder=f.id WHERE f.owner=? ORDER BY f.region,f.survey_date DESC,f.group_index,f.sort_index,f.lot').bind(owner).all<FolderRow>();
  return result.results.map(folderView);
}
export async function findFolder(db:D1Database,owner:string,id:string){await ensureLegacyFolders(db,owner);return db.prepare('SELECT * FROM survey_folders WHERE owner=? AND id=? AND deleting=0').bind(owner,id).first<FolderRow>();}
