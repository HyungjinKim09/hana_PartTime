import type {TraceLine} from './drawing-trace';

// Snap within 15 degrees of an axis, measured in the source image rather than
// its stretched 0..1000 coordinates. Explicit diagonals remain fixed anchors.
export function orthogonalize(lines:TraceLine[],width=1000,height=1000):TraceLine[]{
  const points=lines.flatMap(l=>[l.a,l.b]);
  const scale=Math.max(width,height),sx=width/scale,sy=height/scale;
  const axes=lines.map(l=>{const dx=Math.abs(l.b.x-l.a.x)*sx,dy=Math.abs(l.b.y-l.a.y)*sy;
    if(Math.hypot(dx,dy)<.1)return null;
    return dy<=dx*Math.tan(Math.PI/12)?'y':dx<=dy*Math.tan(Math.PI/12)?'x':null;});
  const output=points.map(p=>({...p}));
  for(const axis of ['x','y'] as const){
    const parent=points.map((_,i)=>i),anchors=points.map((p,i)=>axes[Math.floor(i/2)]===null?p[axis]:null);
    const root=(i:number):number=>parent[i]===i?i:(parent[i]=root(parent[i]));
    const join=(a:number,b:number)=>{a=root(a);b=root(b);if(a===b)return;
      if(anchors[a]!==null&&anchors[b]!==null&&Math.abs(anchors[a]!-anchors[b]!)>1e-8)return;
      parent[b]=a;anchors[a]=anchors[a]??anchors[b];};
    axes.forEach((a,i)=>{if(a===axis)join(i*2,i*2+1);});
    // Preserve shared corners, including a diagonal attached to an axis line.
    for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)
      if(Math.hypot((points[i].x-points[j].x)*sx,(points[i].y-points[j].y)*sy)<2)join(i,j);
    // A division ending in the middle of a wall must follow that wall's new axis.
    points.forEach((p,i)=>lines.forEach((l,j)=>{if(Math.floor(i/2)===j||axes[j]!==axis)return;
      const dx=(l.b.x-l.a.x)*sx,dy=(l.b.y-l.a.y)*sy,length=dx*dx+dy*dy;
      const t=((p.x-l.a.x)*sx*dx+(p.y-l.a.y)*sy*dy)/length;
      if(t<0||t>1)return;
      if(Math.hypot((p.x-l.a.x)*sx-t*dx,(p.y-l.a.y)*sy-t*dy)<2)join(i,j*2);
    }));
    const groups=new Map<number,number[]>();points.forEach((_,i)=>{const r=root(i);groups.set(r,[...(groups.get(r)||[]),i]);});
    for(const [r,indices] of groups){const value=anchors[r]??indices.reduce((s,i)=>s+points[i][axis],0)/indices.length;for(const i of indices)output[i][axis]=value;}
  }
  // Never collapse a short segment as a side effect of joining nearby corners.
  if(lines.some((_,i)=>Math.hypot(output[i*2].x-output[i*2+1].x,output[i*2].y-output[i*2+1].y)<.1))return lines.map(l=>({...l,a:{...l.a},b:{...l.b}}));
  return trimOvershoots(lines.map((l,i)=>({...l,a:output[i*2],b:output[i*2+1]})),sx,sy);
}

// Only shorten a free end to an observed perpendicular intersection. Do not
// erase connected steps, move diagonals, or infer missing walls across a gap.
function trimOvershoots(lines:TraceLine[],sx:number,sy:number):TraceLine[]{
  const axis=(l:TraceLine)=>Math.abs(l.a.y-l.b.y)<1e-8?'x':Math.abs(l.a.x-l.b.x)<1e-8?'y':null;
  return lines.map((line,i)=>{
    const along=axis(line);if(!along)return line;
    const across=along==='x'?'y':'x',scale=along==='x'?sx:sy;
    const length=Math.abs(line.b[along]-line.a[along])*scale;
    const limit=Math.min(12,length*.08);
    const next={...line,a:{...line.a},b:{...line.b}};
    for(const end of ['a','b'] as const){
      const p=line[end],other=line[end==='a'?'b':'a'];
      // An end already joined to any stroke is intentional topology.
      if(lines.some((l,j)=>j!==i&&[l.a,l.b].some(q=>Math.hypot((p.x-q.x)*sx,(p.y-q.y)*sy)<.01)))continue;
      let best=Infinity,target=p[along];
      for(const [j,cross] of lines.entries()){
        if(j===i||axis(cross)!==across)continue;
        if(p[across]<Math.min(cross.a[across],cross.b[across])-1e-8||p[across]>Math.max(cross.a[across],cross.b[across])+1e-8)continue;
        const value=cross.a[along],distance=Math.abs(value-p[along])*scale;
        if((value-p[along])*(other[along]-p[along])<=0||distance>=length*.5||distance>limit||distance>=best)continue;
        best=distance;target=value;
      }
      next[end][along]=target;
    }
    return next;
  });
}
