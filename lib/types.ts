export type Folder={id:string;region:string;date:string;lot:string;group:number;time:string;name:string;phones:string[];address:string;notes:string;warning?:boolean;count:number;bytes:number};
export type Photo={id:string;folder:string;filename:string;content_type:string;size:number;created_at:string};
export type ScheduleDraft={region:string;date:string;folders:{lot:string;time:string;name:string;phones:string[];address:string;notes:string;group:number}[];warnings:string[]};
