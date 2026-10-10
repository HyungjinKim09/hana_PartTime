// Legacy storage assertions collect data through bounded public reads; production has no all-data route.
export async function librarySnapshot(request,options={}){
 const nav=await request('/api/library?navigation=1',options);if(!nav.ok)return nav;
 const tree=await nav.json(),folders=[];
 for(const region of tree.regions){const dates=await(await request('/api/library?'+new URLSearchParams({navigation:'1',region}),options)).json();for(const {date}of dates.dates){let cursor='';do{const params=new URLSearchParams({region,date,limit:'100'});if(cursor)params.set('foldersCursor',cursor);const response=await request('/api/library?'+params,options);if(!response.ok)return response;const page=await response.json();for(const card of page.cards){const detail=await request('/api/library?folder='+encodeURIComponent(card.target.folder),options);if(!detail.ok)return detail;folders.push(...(await detail.json()).folders);}cursor=page.nextFoldersCursor||'';}while(cursor);}}
 const usage=await request('/api/library?usageOnly=1',options);if(!usage.ok)return usage;return Response.json({folders,...await usage.json()});
}
