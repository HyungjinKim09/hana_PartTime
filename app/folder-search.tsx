"use client";
import {useMemo} from 'react';
import {Search,FolderOpen,Image as ImageIcon,ChevronRight,X} from 'lucide-react';
import type {Folder} from '@/lib/types';
import {searchFolders} from '@/lib/folder-search';
export function FolderSearch({folders,query,onQuery,view,onOpen}:{folders:Folder[];query:string;onQuery:(value:string)=>void;view:'date'|'address';onOpen:(folder:Folder,path:string[])=>void}){
 const results=useMemo(()=>searchFolders(folders,query,view),[folders,query,view]);
 return <section className="folder-search" aria-label="폴더 검색">
  <label htmlFor="folder-search-input">현재 위치에서 폴더 검색</label>
  <div className="folder-search-input"><Search size={19} aria-hidden="true"/><input id="folder-search-input" type="search" value={query} onChange={e=>onQuery(e.target.value)} placeholder="주소, 건물명, 동·호수, 날짜, 이름" autoComplete="off"/>{query&&<button type="button" aria-label="검색어 지우기" onClick={()=>onQuery('')}><X size={18}/></button>}</div>
  <p className="export-help">현재 위치의 하위 폴더까지 검색합니다. 전체 검색은 ‘전체 지역’에서 이용하세요.</p>
  {query.trim()&&<><p role="status" aria-live="polite">검색 결과 {results.length}개 폴더</p><div className="folder-grid">{results.map(result=><button className="folder-card" key={JSON.stringify([result.folder.region,view==='date'?result.folder.date:'',result.path])} onClick={()=>onOpen(result.folder,result.path)}><div className="folder-card-top"><FolderOpen size={34}/><ChevronRight size={18}/></div><h3>{result.label}</h3><p>{result.folder.region}{view==='date'?' · '+result.folder.date:''}</p><p>{result.folder.address}</p><div className="folder-card-bottom"><span><ImageIcon size={15}/>{result.count}장의 사진</span><span>폴더 열기</span></div></button>)}</div>{!results.length&&<div className="empty-photos"><Search size={30}/><h3>검색 결과가 없어요</h3><p>주소나 건물명의 일부로 검색하거나 상위 폴더에서 다시 검색해 주세요.</p></div>}</>}
 </section>;
}
