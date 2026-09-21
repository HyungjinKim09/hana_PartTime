import {normalizeRoadAddress} from './address.js';
export type MapProvider='kakao'|'naver';
export function mapAddresses(folder:{address:string;lot:string}){
 const road=normalizeRoadAddress(folder.address).match(/^(.*?(?:로|길)\s*\d+(?:-\d+)?)(?=\s|\(|$)/u)?.[1];
 const lot=folder.lot.normalize('NFKC').replace(/\s+/g,' ').trim().replace(/\s*\(.*$/, '');
 return [...new Set([road,lot].filter((s):s is string=>!!s))];
}
// Official app schemes: apis.map.kakao.com/ios_v2/docs/getting-started/urlscheme/
// and guide.ncloud-docs.com/docs/en/maps-url-scheme . No geocoding requests.
export function mapLinks(provider:MapProvider,address:string,platform:'android'|'ios'|'web',origin:string){
 const query=encodeURIComponent(address);
 const web=provider==='kakao'?'https://map.kakao.com/link/search/'+query:'https://map.naver.com/p/search/'+query;
 const action=provider==='kakao'?'search?q='+query:'search?query='+query+'&appname='+encodeURIComponent(origin);
 const scheme=provider==='kakao'?'kakaomap':'nmap';
 const app=platform==='android'?`intent://${action}#Intent;scheme=${scheme};package=${provider==='kakao'?'net.daum.android.map':'com.nhn.android.nmap'};S.browser_fallback_url=${encodeURIComponent(web)};end`:platform==='ios'?`${scheme}://${action}`:web;
 return {app,web};
}
