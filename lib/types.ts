export type Folder={id:string;region:string;date:string;lot:string;unit?:string;unitDisplay?:string;manualAdded?:boolean;group:number;time:string;name:string;phones:string[];address:string;notes:string;remarks?:string;buildingDetails?:string;surveyStatus?:string;warning?:boolean;count:number;bytes:number};
export type Photo={kind:'photo'|'drawing';id:string;folder:string;filename:string;content_type:string;size:number;created_at:string};
export type ScheduleDraft={region:string;date:string;folders:{lot:string;unit?:string;time:string;name:string;phones:string[];address:string;notes:string;group:number}[];warnings:string[]};
export const folderLabel=(f:{lot:string;unit?:string})=>[f.lot,f.unit].filter(Boolean).join(' · ');
