"use client";
import {Search,X} from 'lucide-react';
export function FolderSearch({query,onQuery}:{query:string;onQuery:(value:string)=>void}){
 return <section className="folder-search" aria-label="폴더 검색">
  <label htmlFor="folder-search-input">현재 위치에서 폴더 검색</label>
  <div className="folder-search-input"><Search size={19} aria-hidden="true"/><input id="folder-search-input" type="search" value={query} onChange={e=>onQuery(e.target.value)} placeholder="주소, 건물명, 동·호수, 날짜, 이름" autoComplete="off"/>{query&&<button type="button" aria-label="검색어 지우기" onClick={()=>onQuery('')}><X size={18}/></button>}</div>
  <p className="export-help">현재 위치의 하위 폴더까지 검색합니다. 전체 검색은 ‘전체 지역’에서 이용하세요.</p>
 </section>;
}
