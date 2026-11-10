import type {Folder,Photo} from './types';
import type {SurveyParticipant} from './survey-participants';
export type LibrarySelection={region?:string;date?:string;folder?:string;view:'date'|'address';path?:string[]};
export type LibrarySummary={schedules:number;withPhotos:number;withFieldPhotos:number;photos:number;bytes:number;fieldPhotos:number;fieldBytes:number;completed:number;downloaded?:number;downloadedBy?:import('./attribution').Attribution;time?:string;status?:string;participants?:SurveyParticipant[]};
export type LibraryCard={key:string;label:string;leaf:boolean;target:LibrarySelection;summary:LibrarySummary;children:number;unitCount?:number;place?:Pick<Folder,'id'|'region'|'date'|'lot'|'unit'|'unitDisplay'|'address'>};
export type LibraryPage={folders:Folder[];photos:Photo[];nextCursor:string|null;cards:LibraryCard[];nextFoldersCursor:string|null;totalCards:number;summary:LibrarySummary;pathLabels:string[];canonicalAddressPath?:string[];place?:LibraryCard['place']};
export type LibraryNavigation={regions:string[];dates:{date:string;schedules:number}[]};
