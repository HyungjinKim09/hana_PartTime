"use client";
import {Search,X} from 'lucide-react';
export function FolderSearch({query,onQuery,scope,onAllTeams}:{query:string;onQuery:(value:string)=>void;scope:{place:string;currentTeam?:string;allTeams:boolean};onAllTeams:(all:boolean)=>void}){
 return <section className="folder-search" aria-label="폴더 검색">
  <label htmlFor="folder-search-input">현재 위치에서 폴더 검색</label>
  <div className="folder-search-input"><Search size={19} aria-hidden="true"/><input id="folder-search-input" type="search" value={query} onChange={e=>onQuery(e.target.value)} placeholder="주소, 건물명, 동·호수, 날짜, 이름" aria-describedby="folder-search-help" autoComplete="off"/>{query&&<button type="button" aria-label="검색어 지우기" onClick={()=>onQuery('')}><X size={18}/></button>}</div>
  <p id="folder-search-help" className={query.trim()?'scope-note search-range':'sr-only'}>검색 위치 {scope.place}{!scope.currentTeam&&' · 전체 팀'}</p>
  {scope.currentTeam&&query.trim()&&<label className="team-range-control">검색 팀 범위 <select value={scope.allTeams?'all':'team'} onChange={e=>onAllTeams(e.target.value==='all')}><option value="all">전체 팀 · 팀 미지정 포함</option><option value="team">{scope.currentTeam}</option></select></label>}
 </section>;
}
