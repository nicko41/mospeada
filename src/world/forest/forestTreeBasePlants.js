import {forestRandom} from './forestLayout.js'
import {FOREST_ASSETS} from './forestConfig.js'
import {FOLIAGE_CATALOG} from './foliageCatalog.js'

const entries=FOLIAGE_CATALOG.entries.map((entry,index)=>({...entry,index}))
const inner=entries.filter(e=>e.category==='arbustos'&&!e.id.includes('flores')||e.id.startsWith('hojas-anchas')||e.id.startsWith('helecho'))
const outer=entries.filter(e=>e.category==='helechos'||e.id.startsWith('pasto-alto')||e.id.startsWith('roseta'))
const radii=new Map(FOREST_ASSETS.filter(a=>a.kind==='tree').map(a=>[a.name,a.trunkRadius]))

// Each living trunk gets its own seeded clump, independently of the sparse
// ground-cover lottery. Crossed cards overlap the root seam from every side.
export function createTreeBasePlants(trees,{seed=19831130,allowed=()=>true}={}){
 const plants=[]
 for(const tree of trees){
  const hash=(seed^Math.imul(Math.round(tree.x*100),73856093)^Math.imul(Math.round(tree.z*100),19349663))>>>0,random=forestRandom(hash),between=(a,b)=>a+(b-a)*random()
  const radius=tree.trunkRadius??(radii.get(tree.name)||.26)*tree.scale,phase=random()*Math.PI*2,count=7+Math.floor(random()*3)
  for(let i=0;i<count+3;i++){
   const edge=i>=count,angle=phase+(edge?(i-count)*Math.PI*2/3:i*Math.PI*2/count)+between(-.15,.15),r=radius+between(edge?.55:.08,edge?1.15:.3),x=tree.x+Math.cos(angle)*r,z=tree.z+Math.sin(angle)*r
   if(!allowed(x,z))continue
   const pool=edge?outer:inner,e=pool[Math.floor(random()*pool.length)],height=between(edge?.48:.72,edge?.85:1.13)*Math.max(.9,Math.min(1.25,radius/.7))
   plants.push({x,z,height,scale:height,yaw:between(0,Math.PI*2),mirror:random()<.5,tint:between(.91,1.02),sprite:e.id,entry:e,kind:'foliageCard',treeBase:true,rootX:tree.x,rootZ:tree.z,side:tree.side,rank:-1,fadeStart:90+random()*6,fadeEnd:112})
  }
 }
 return plants
}

export function treeBaseSectorIndex(plants,size=32,half=400){
 const sectors=new Map()
 for(const p of plants){const key=`${Math.floor((p.x+half)/size)},${Math.floor((p.z+half)/size)}`;if(!sectors.has(key))sectors.set(key,[]);sectors.get(key).push(p)}
 return sectors
}
