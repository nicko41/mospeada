// Scout-specific paint/topology mask. Cyan hand pincers and cyan foot spikes
// overlap in height in the rest pose; height cuts alone cannot separate them.
export function scoutClawRegions({p,uv,ix,ids,points,edges,paint}){
 const count=p.length/3,cyan=new Uint8Array(points.length),parent=Uint32Array.from({length:points.length},(_,i)=>i)
 const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i]}return i}
 for(let i=0;i<count;i++){
  const x=Math.max(0,Math.min(paint.width-1,Math.floor(uv[i*2]*paint.width))),y=Math.max(0,Math.min(paint.height-1,Math.floor(uv[i*2+1]*paint.height))),at=(y*paint.width+x)*4,r=paint.pixels[at],g=paint.pixels[at+1],b=paint.pixels[at+2]
  if(g>r*1.15&&b>r*1.3&&b>50&&g>35&&b<g*1.7&&g<b*1.7)cyan[ids[i]]=1
 }
 for(let a=0;a<points.length;a++)if(cyan[a])for(const b of edges[a])if(cyan[b])parent[find(a)]=find(b)
 const groups=new Map()
 for(let i=0;i<points.length;i++)if(cyan[i]){const id=find(i);if(!groups.has(id))groups.set(id,{vertices:[],min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]});const g=groups.get(id);g.vertices.push(i);for(let c=0;c<3;c++){g.min[c]=Math.min(g.min[c],points[i][c]);g.max[c]=Math.max(g.max[c],points[i][c])}}
 const mask=new Uint8Array(points.length),feet=new Uint8Array(points.length),distance=new Float64Array(points.length).fill(Infinity),queue=[];let handComponents=0
 for(const g of groups.values()){
  if(g.min[1]>-.515&&g.max[1]>-.33&&g.max[1]<.09&&g.min[2]>.22&&Math.min(Math.abs(g.min[0]),Math.abs(g.max[0]))>.25){
   handComponents++;for(const i of g.vertices){mask[i]=points[i][0]>0?1:2;distance[i]=0;queue.push(i)}
  }else if(g.min[1]<-.55)for(const i of g.vertices)feet[i]=1
 }
 // Include the dark undersides and pale edge highlights, staying on connected
 // hand surfaces and stopping at the foot's independently painted components.
 for(let cursor=0;cursor<queue.length;cursor++){
  const a=queue[cursor],pa=points[a]
  for(const b of edges[a]){
   const pb=points[b];if(feet[b]||pb[1]<-.515||pb[1]>.15||pb[2]<.22||pa[0]*pb[0]<=0)continue
   const next=distance[a]+Math.hypot(pa[0]-pb[0],pa[1]-pb[1],pa[2]-pb[2]);if(next<=.028&&next<distance[b]){distance[b]=next;mask[b]=mask[a];queue.push(b)}
  }
 }
 // Preserve complete UV charts of each claw instead of leaving a few shaded
 // vertices pinned to a leg. Welded UV-seam duplicates receive identical tags.
 const chartParent=Uint32Array.from({length:count},(_,i)=>i),chartFind=i=>{while(chartParent[i]!==i){chartParent[i]=chartParent[chartParent[i]];i=chartParent[i]}return i}
 for(let i=0;i<ix.length;i+=3){chartParent[chartFind(ix[i])]=chartFind(ix[i+1]);chartParent[chartFind(ix[i+1])]=chartFind(ix[i+2])}
 const charts=new Map()
 for(let i=0;i<count;i++){const id=chartFind(i);if(!charts.has(id))charts.set(id,{vertices:[],arm:0,foot:false,minY:Infinity,maxY:-Infinity,minZ:Infinity});const c=charts.get(id);c.vertices.push(i);c.arm=c.arm||mask[ids[i]];c.foot=c.foot||!!feet[ids[i]];c.minY=Math.min(c.minY,p[i*3+1]);c.maxY=Math.max(c.maxY,p[i*3+1]);c.minZ=Math.min(c.minZ,p[i*3+2])}
 for(const c of charts.values())if(c.arm&&!c.foot&&c.minY>-.53&&c.maxY<.15&&c.minZ>.20)for(const i of c.vertices)mask[ids[i]]=c.arm
 return {mask,feet,cyan,handComponents}
}
