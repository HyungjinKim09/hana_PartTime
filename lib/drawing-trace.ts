// Extract observed pencil strokes, not inferred room rectangles. All coordinates
// remain in the input image frame so the user can compare an exact overlay.
export type TraceLine={id:string;a:{x:number;y:number};b:{x:number;y:number};dashed:boolean};
type Candidate={axis:number;slope:number;intercept:number;start:number;end:number;support:number};
export function traceDrawing(rgba:ArrayLike<number>,width:number,height:number,boxes:number[][]=[]):TraceLine[]{
  if(width<30||height<30||width>1600||height>1600||rgba.length!==width*height*4)throw new Error('도면 이미지 크기를 확인해 주세요.');
  const gray=new Uint8Array(width*height),integral=new Float64Array((width+1)*(height+1)),mask=new Uint8Array(width*height),weak=new Uint8Array(width*height),stride=width+1;
  for(let y=0;y<height;y++){let sum=0;for(let x=0;x<width;x++){const i=y*width+x;gray[i]=Math.round((rgba[i*4]+rgba[i*4+1]+rgba[i*4+2])/3);sum+=gray[i];integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+sum;}}
  const dark:{x:number;y:number}[]=[];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const x0=Math.max(0,x-8),x1=Math.min(width,x+9),y0=Math.max(0,y-8),y1=Math.min(height,y+9);
    const mean=(integral[y1*stride+x1]-integral[y0*stride+x1]-integral[y1*stride+x0]+integral[y0*stride+x0])/((x1-x0)*(y1-y0));
    if(mean-gray[y*width+x]>Math.max(10,mean*0.08))weak[y*width+x]=1;
    if(mean-gray[y*width+x]>Math.max(16,mean*0.11)){mask[y*width+x]=1;dark.push({x,y});}
  }
  // OCR boxes are approximate. Never erase pixels with them: a box near a
  // balcony label can cover a real dashed wall. Filter candidates below instead.
  const minLength=Math.max(35,Math.max(width,height)*0.043),gap=Math.max(12,Math.max(width,height)*0.022);
  const candidates:Candidate[]=[];
  function hit(axis:number,u:number,v:number){for(let d=-1;d<=1;d++){const x=axis?v+d:u,y=axis?u:v+d;if(x>=0&&x<width&&y>=0&&y<height&&mask[y*width+x])return 1;}return 0;}
  for(const axis of [0,1]){
    const length=axis?height:width,across=axis?width:height,pad=Math.ceil(length*.05)+2;
    const peaks:{slope:number;intercept:number;votes:number}[]=[];
    for(let step=-20;step<=20;step++){
      const slope=step*.002,acc=new Uint16Array(across+2*pad);
      for(const p of dark){const u=axis?p.y:p.x,v=axis?p.x:p.y;acc[Math.round(v-slope*u)+pad]++;}
      for(let i=2;i<acc.length-2;i++)if(acc[i]>=Math.max(12,minLength*.28)&&acc[i]>=acc[i-1]&&acc[i]>acc[i+1]&&acc[i]>=acc[i-2]&&acc[i]>=acc[i+2])peaks.push({slope,intercept:i-pad,votes:acc[i]});
    }
    peaks.sort((a,b)=>b.votes-a.votes);
    for(const p of peaks.slice(0,1500)){
      let start=-1,last=-1,support=0;
      const add=()=>{if(last-start<14||support/(last-start+1)<.30)return;
        const middle=(start+last)/2;
        if(candidates.some(c=>c.axis===axis&&Math.abs((c.slope-p.slope)*middle+c.intercept-p.intercept)<4&&Math.min(c.end,last)-Math.max(c.start,start)>Math.min(c.end-c.start,last-start)*.45))return;
        candidates.push({axis,...p,start,end:last,support});};
      for(let u=0;u<length;u++){
        if(hit(axis,u,Math.round(p.slope*u+p.intercept))){if(start<0)start=u;last=u;support++;}
        else if(start>=0&&u-last>gap){add();start=-1;support=0;}
      }
      if(start>=0)add();
    }
  }
  function intersection(a:Candidate,b:Candidate){
    if(a.axis===b.axis)return null;const h=a.axis===0?a:b,v=a.axis===1?a:b;
    const x=(v.slope*h.intercept+v.intercept)/(1-v.slope*h.slope);return {x,y:h.slope*x+h.intercept};
  }
  // Evaluate short connected sides together; a small enclosure may have two
  // short sides, neither of which should be deleted before checking the other.
  for(let i=candidates.length-1;i>=0;i--){const c=candidates[i];if(c.end-c.start>=minLength)continue;
    const touches=(end:number)=>candidates.some(other=>{if(other===c)return false;const p=intersection(c,other);if(!p)return false;const u=c.axis?p.y:p.x,v=other.axis?p.y:p.x;return Math.abs(u-end)<8&&v>=other.start-8&&v<=other.end+8;});
    if(!touches(c.start)||!touches(c.end))candidates.splice(i,1);
  }
  // A short line through the centre of a read word is usually a letter stroke.
  // A line beside (not through) text can survive the OCR padding when both
  // ends have pixel support and connect to observed enclosure sides.
  for(let i=candidates.length-1;i>=0;i--){const c=candidates[i];
    const attached=(end:number,minimum=Math.max(width,height)*.18)=>{let near=0;for(let k=0;k<18;k++){const u=Math.round(end===c.start?end+k:end-k);near+=hit(c.axis,u,Math.round(c.slope*u+c.intercept));}if(near<4)return false;return candidates.some(other=>{if(other===c||other.end-other.start<minimum)return false;const p=intersection(c,other);if(!p)return false;const u=c.axis?p.y:p.x,v=other.axis?p.y:p.x;return Math.abs(u-end)<5&&v>=other.start-5&&v<=other.end+5;});};
    if(c.end-c.start<Math.min(width,height)*.22&&!(attached(c.start)&&attached(c.end))&&boxes.some(b=>b.length===4&&b[2]>b[0]&&b[3]>b[1]&&b[2]-b[0]<120&&b[3]-b[1]<180&&[c.start,(c.start+c.end)/2,c.end].some(u=>{const v=c.slope*u+c.intercept,px=(c.axis?v:u)/width*1000,py=(c.axis?u:v)/height*1000;const middle=(c.start+c.end)/2,mv=c.slope*middle+c.intercept,mx=(c.axis?mv:middle)/width*1000,my=(c.axis?middle:mv)/height*1000;const throughText=mx>b[0]&&mx<b[2]&&my>b[1]&&my<b[3];const enclosure=attached(c.start,minLength*.5)&&attached(c.end,minLength*.5);return px>b[0]-12&&px<b[2]+12&&py>b[1]-12&&py<b[3]+12&&(throughText||!enclosure);})))candidates.splice(i,1);
  }
  // Recover faint continuation only along an observed line, up to a real
  // perpendicular edge. Every part of the extension needs pixel evidence.
  function supported(c:Candidate,from:number,to:number){let hits=0,total=0,blank=0,maxBlank=0;
    for(let u=Math.ceil(Math.min(from,to));u<=Math.floor(Math.max(from,to));u++){const v=Math.round(c.slope*u+c.intercept);let yes=false;
      for(let d=-1;d<=1;d++){const x=c.axis?v+d:u,y=c.axis?u:v+d;if(x>=0&&x<width&&y>=0&&y<height&&weak[y*width+x])yes=true;}
      total++;if(yes){hits++;blank=0;}else{blank++;maxBlank=Math.max(maxBlank,blank);}
    }return total>0&&hits/total>=.32&&maxBlank<=Math.max(14,Math.max(width,height)*.025);
  }
  for(const c of candidates){
    const targets=candidates.flatMap(other=>{const p=intersection(c,other);if(!p)return [];const u=c.axis?p.y:p.x,v=other.axis?p.y:p.x;return v>=other.start-6&&v<=other.end+6?[u]:[];});
    for(const u of targets.sort((a,b)=>Math.min(Math.abs(a-c.start),Math.abs(a-c.end))-Math.min(Math.abs(b-c.start),Math.abs(b-c.end)))){
      const end=u<c.start?c.start:u>c.end?c.end:null;if(end===null||Math.abs(u-end)>Math.max(width,height)*.22)continue;
      if(supported(c,end,u)){c.start=Math.min(c.start,u);c.end=Math.max(c.end,u);}
    }
  }
  for(let i=0;i<candidates.length;i++)for(let j=candidates.length-1;j>i;j--){const a=candidates[i],b=candidates[j];
    if(a.axis!==b.axis||Math.min(a.end,b.end)<Math.max(a.start,b.start)-Math.max(10,Math.max(width,height)*.05))continue;
    const separated=Math.min(a.end,b.end)<Math.max(a.start,b.start);
    if([Math.max(a.start,b.start),Math.min(a.end,b.end)].every(u=>Math.abs((a.slope-b.slope)*u+a.intercept-b.intercept)<(separated?6:3))){
      const start=Math.min(a.start,b.start),end=Math.max(a.end,b.end),left=a.start<=b.start?a:b,right=a.end>=b.end?a:b;
      const v0=left.slope*start+left.intercept,v1=right.slope*end+right.intercept,slope=(v1-v0)/(end-start);
      Object.assign(a,{start,end,slope,intercept:v0-slope*start});candidates.splice(j,1);
    }
  }
  const cornerTolerance=Math.min(30,Math.max(8,Math.max(width,height)*.03));
  function crossing(a:Candidate,b:Candidate){
    const h=a.axis===0?a:b,v=a.axis===1?a:b;if(a.axis===b.axis)return null;
    const x=(v.slope*h.intercept+v.intercept)/(1-v.slope*h.slope),y=h.slope*x+h.intercept;
    return x>=h.start-cornerTolerance&&x<=h.end+cornerTolerance&&y>=v.start-cornerTolerance&&y<=v.end+cornerTolerance?{x,y}:null;
  }
  // Paper frames and isolated text strokes do not belong to the connected plan.
  const groups:number[][]=[],seen=new Set<number>();
  for(let i=0;i<candidates.length;i++)if(!seen.has(i)){
    const group=[i];seen.add(i);for(let k=0;k<group.length;k++)for(let j=0;j<candidates.length;j++)if(!seen.has(j)&&crossing(candidates[group[k]],candidates[j])){seen.add(j);group.push(j);}groups.push(group);
  }
  groups.sort((a,b)=>b.length-a.length);
  const plan=(groups[0]||[]).map(i=>candidates[i]);if(plan.length<4)return [];
  const endpoints=plan.flatMap(c=>[c.start,c.end].map(u=>({x:c.axis?c.slope*u+c.intercept:u,y:c.axis?u:c.slope*u+c.intercept})));
  const minX=Math.min(...endpoints.map(p=>p.x)),maxX=Math.max(...endpoints.map(p=>p.x)),minY=Math.min(...endpoints.map(p=>p.y)),maxY=Math.max(...endpoints.map(p=>p.y));
  for(const c of candidates){if(plan.includes(c)||c.end-c.start<Math.max(width,height)*.12)continue;const u=(c.start+c.end)/2,x=c.axis?c.slope*u+c.intercept:u,y=c.axis?u:c.slope*u+c.intercept;
    if(x>Math.max(5,minX-(maxX-minX)*.18)&&x<Math.min(width-5,maxX+(maxX-minX)*.18)&&y>Math.max(5,minY-(maxY-minY)*.18)&&y<Math.min(height-5,maxY+(maxY-minY)*.18))plan.push(c);
  }
  for(let i=plan.length-1;i>=0;i--){const c=plan[i];if(c.end-c.start>=minLength)continue;
    const connected=(end:number)=>plan.some(other=>{const p=crossing(c,other);return p&&Math.abs((c.axis?p.y:p.x)-end)<8;});
    if(!connected(c.start)||!connected(c.end))plan.splice(i,1);
  }
  // Expanded OCR tolerance is safe only for short dangling strokes. Small
  // enclosure sides have two real junctions, even when both sides are short.
  for(let i=plan.length-1;i>=0;i--){const c=plan[i];if(c.end-c.start>minLength*2)continue;
    const joined=(end:number)=>plan.some(other=>{const p=crossing(c,other);return p&&Math.abs((c.axis?p.y:p.x)-end)<8;});
    if(joined(c.start)&&joined(c.end))continue;
    if(boxes.some(b=>[c.start,(c.start+c.end)/2,c.end].some(u=>{const v=c.slope*u+c.intercept,x=(c.axis?v:u)/width*1000,y=(c.axis?u:v)/height*1000;return x>b[0]-12&&x<b[2]+12&&y>b[1]-12&&y<b[3]+12;})))plan.splice(i,1);
  }
  // Extension/merging can turn a letter fragment into a connected stroke.
  // Recheck its centre against text after those operations, then prune orphaned
  // short fragments whose only neighbour was a rejected letter.
  for(let i=plan.length-1;i>=0;i--){const c=plan[i],u=(c.start+c.end)/2,v=c.slope*u+c.intercept;
    const x=(c.axis?v:u)/width*1000,y=(c.axis?u:v)/height*1000;
    if(c.end-c.start<Math.min(width,height)*.22&&boxes.some(b=>x>b[0]&&x<b[2]&&y>b[1]&&y<b[3]))plan.splice(i,1);
  }
  let pruned=true;while(pruned){pruned=false;for(let i=plan.length-1;i>=0;i--){const c=plan[i];if(c.end-c.start>=minLength)continue;
    const joined=(end:number)=>plan.some(other=>{const p=crossing(c,other);return p&&Math.abs((c.axis?p.y:p.x)-end)<8;});
    if(!joined(c.start)||!joined(c.end)){plan.splice(i,1);pruned=true;}
  }}
  const result:TraceLine[]=[];
  for(const c of plan){
    let start=c.start,end=c.end,startDistance=cornerTolerance,endDistance=cornerTolerance;
    for(const other of plan){const p=crossing(c,other);if(!p)continue;const u=c.axis?p.y:p.x;
      if(Math.abs(u-c.start)<startDistance){start=u;startDistance=Math.abs(u-c.start);}
      if(Math.abs(u-c.end)<endDistance){end=u;endDistance=Math.abs(u-c.end);}
    }
    // Classify a whole segment between junctions, not arbitrary 24px windows.
    // This keeps one outer wall from alternating solid/dashed due to pencil pressure.
    const cuts=[start,end];for(const other of plan){const p=crossing(c,other);if(!p)continue;const u=c.axis?p.y:p.x;if(u>start+4&&u<end-4)cuts.push(u);}
    cuts.sort((a,b)=>a-b);const unique=cuts.filter((u,i)=>!i||u-cuts[i-1]>4);
    const coverage=(candidate:Candidate,from:number,to:number)=>{let hits=0,total=0;for(let u=Math.ceil(from);u<=Math.floor(to);u++){const v=Math.round(candidate.slope*u+candidate.intercept);let found=false;for(let d=-2;d<=2;d++){const x=candidate.axis?v+d:u,y=candidate.axis?u:v+d;if(x>=0&&x<width&&y>=0&&y<height&&mask[y*width+x])found=true;}if(found)hits++;total++;}return total?hits/total:0;};
    const innerShort=end-start<minLength*1.5&&[start,end].every(u=>plan.some(other=>{const p=crossing(c,other);return p&&Math.abs((c.axis?p.y:p.x)-u)<5&&coverage(other,other.start,other.end)<.8;}));
    const merged:{start:number;end:number;solid:boolean}[]=[];
    for(let i=1;i<unique.length;i++){const from=unique[i-1],to=unique[i];const solid=!innerShort&&coverage(c,from,to)>.8;const prev=merged[merged.length-1];if(prev?.solid===solid)prev.end=to;else merged.push({start:from,end:to,solid});}
    for(const part of merged){
      if(part.end-part.start<0.2)continue;
      const point=(u:number)=>{const v=c.slope*u+c.intercept;return {x:Math.max(0,Math.min(1000,(c.axis?v:u)/width*1000)),y:Math.max(0,Math.min(1000,(c.axis?u:v)/height*1000))};};
      result.push({id:'trace-'+result.length,a:point(part.start),b:point(part.end),dashed:!part.solid});
    }
  }
  return result.slice(0,200);
}
