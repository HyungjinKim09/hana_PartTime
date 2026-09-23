"use client";
import {useState,useSyncExternalStore} from 'react';
import {MapPin} from 'lucide-react';
import {mapAddresses,mapLinks,type MapProvider} from '@/lib/map-links';
const subscribe=()=>()=>{};
const deviceSnapshot=()=>[(/Android/i.test(navigator.userAgent)?'android':/iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)?'ios':'web'),window.location.origin].join('|');
export function MapDirections({folder}:{folder:{address:string;lot:string}}){
 const addresses=mapAddresses(folder);
 const [choice,setChoice]=useState('');
 const snapshot=useSyncExternalStore(subscribe,deviceSnapshot,()=> 'web|');
 const [platform,origin]=snapshot.split('|'),device={platform:platform as 'android'|'ios'|'web',origin};
 const address=addresses.includes(choice)?choice:addresses[0];
 if(!address)return null;
 return <section className="map-directions" aria-label="지도 길찾기"><div><strong><MapPin size={17}/>지도 길찾기</strong>{addresses.length>1?<label>목적지 주소<select aria-label="길찾기 목적지 주소" value={address} onChange={e=>setChoice(e.target.value)}>{addresses.map(a=><option key={a}>{a}</option>)}</select></label>:<p>{address}</p>}<p>주소 검색 후 지도에서 ‘길찾기’를 선택하세요.</p></div><div className="map-directions-actions">{(['kakao','naver'] as MapProvider[]).map(provider=>{const links=mapLinks(provider,address,device.platform,device.origin);const label=provider==='kakao'?'카카오맵':'네이버 지도';return <div key={provider}><a className="secondary-button" href={links.app} target={device.platform==='web'?'_blank':undefined} rel="noopener noreferrer">{label} 열기</a></div>;})}</div></section>;
}
