import { forestSourceLayout,forestSurfaceHeight,forestRandom } from './forestLayout.js'
import { FOREST_CRASH,crashLocal } from './forestCrashConfig.js'
import { FOLIAGE_CATALOG } from './foliageCatalog.js'
import { FOLIAGE_WORLD } from './forestFoliageWorldConfig.js'
import { crashSiteSample } from './forestCrashSite.js'
import {forestRouteDistance} from './forestSurface.js'

const anchors=Object.values(forestSourceLayout).flat().filter(p=>p.kind==='tree'||p.kind==='rock'),anchorSize=8,grid=new Map()
for(const p of anchors){const key=`${Math.floor(p.x/anchorSize)},${Math.floor(p.z/anchorSize)}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(p)}
function environment(x,z){
  let root=100,rock=100,blocked=false
  const cx=Math.floor(x/anchorSize),cz=Math.floor(z/anchorSize)
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const p of grid.get(`${cx+dx},${cz+dz}`)||[]){const d=Math.hypot(x-p.x,z-p.z);if(p.kind==='tree'){root=Math.min(root,d);if(d<p.trunkRadius+.28)blocked=true}else{rock=Math.min(rock,d);if(d<.6*p.scale)blocked=true}}
  return {root,rock,blocked}
}
const clamp=v=>Math.max(0,Math.min(1,v))
export function foliageWorldDensity(x,z,env=environment(x,z)){
  const path=forestRouteDistance(x,z),radius=Math.hypot(x,z)
  const crash=crashLocal(x,z),ratio=FOREST_CRASH.length/10
  const impact=Math.hypot(crash.x/(3.8*ratio),crash.z/(6*ratio))
  if(env.blocked||path<1.4||impact<1.08||Math.abs(crash.x)<1.8*ratio&&crash.z>3&&crash.z<11*ratio)return 0
  const clump=.45+.55*clamp(.5+.25*Math.sin(x*.11+Math.sin(z*.08))+.25*Math.cos(z*.13+Math.sin(x*.07)))
  let density=env.root<3?.98:env.rock<2.4?.88:.73
  if(path<4.1)density*=.04+.16*clamp((path-1.4)/2.7)
  else if(path<7.5)density=Math.max(density,.82)
  if(radius<5)density*=.05;else if(radius<12)density*=.18;else if(radius<17)density*=.45
  return density*clump
}
const categories=Object.fromEntries(['pasto','hierbas','arbustos','helechos','vegetacion-con-rocas'].map(c=>[c,FOLIAGE_CATALOG.entries.map((e,i)=>({...e,index:i})).filter(e=>e.category===c)]))
function choose(random,env){const r=random(),category=r<.55?'pasto':r<.78?'hierbas':r<.9?'helechos':r<.98?'arbustos':env.rock<3?'vegetacion-con-rocas':'pasto';const pool=categories[category];return pool[Math.floor(random()*pool.length)]}

// Generated once in a worker, independently of camera direction. Positions and
// all rendering attributes are transferred as compact buffers, not JS objects.
export function generateFoliageSector(sx,sz,seed=FOLIAGE_WORLD.seed,region=null){
  const size=FOLIAGE_WORLD.sectorSize,half=FOLIAGE_WORLD.worldSize/2,x0=sx*size-half,z0=sz*size-half
  const random=forestRandom((seed^Math.imul(sx+1,73856093)^Math.imul(sz+1,19349663))>>>0),step=region?.step||FOLIAGE_WORLD.candidateStep,items=[]
  for(let gz=Math.ceil(z0/step);gz<(z0+size)/step;gz++)for(let gx=Math.ceil(x0/step);gx<(x0+size)/step;gx++){
    const x=(gx+.08+random()*.84)*step,z=(gz+.08+random()*.84)*step
    if(x>=x0+size||z>=z0+size||(region?!region.contains(x,z):x< -half+2||z< -half+2||x>half-2||z>half-2))continue
    const env=region?region.environment(x,z):environment(x,z);if(random()>(region?region.density(x,z,env):foliageWorldDensity(x,z,env)))continue
    let entry=choose(random,env),height=entry.heightRange[0]+random()*(entry.heightRange[1]-entry.heightRange[0])
    // Large crowns remain accents. Small tufts carry most density/overdraw.
    if(height>.8&&random()<.68){entry=categories.pasto[Math.floor(random()*4)];height=entry.heightRange[0]+random()*(entry.heightRange[1]-entry.heightRange[0])}
    const fadeStart=42+random()*15,fadeEnd=fadeStart+14+Math.pow(random(),3)*38
    const item={x,z,height,yaw:random()*Math.PI*2,mirror:random()<.5,entry,tint:.93+random()*.1,rank:random(),fadeStart,fadeEnd:Math.min(FOLIAGE_WORLD.maxDistance,fadeEnd)}
    // Consume the exact original random sequence before local damage filtering:
    // the rest of this sector and the wider forest must stay in place.
    const damage=region?null:crashSiteSample(x,z)
    if(!damage||!damage.destroyed&&item.rank<Math.pow(1-damage.damage,4))items.push(item)
  }
  const count=items.length,matrices=new Float32Array(count*16),colours=new Float32Array(count*3),rects=new Float32Array(count*4),forms=new Float32Array(count*4),fades=new Float32Array(count*4),contacts=[]
  const bounds=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity]
  for(let i=0;i<count;i++){
    const p=items[i],e=p.entry,ground=region?region.height(p.x,p.z):forestSurfaceHeight(p.x,p.z),c=Math.cos(p.yaw)*p.height,s=Math.sin(p.yaw)*p.height
    matrices.set([c,0,-s,0,0,p.height,0,0,s,0,c,0,p.x-x0,ground-.025,p.z-z0,1],i*16)
    colours.set([p.tint,p.tint,p.tint],i*3);rects.set(e.uv,i*4);forms.set([e.width/e.height,p.mirror?1-e.anchor[0]:e.anchor[0],e.anchor[1],p.mirror?1:0],i*4);fades.set([p.fadeStart,p.fadeEnd,p.rank,e.index],i*4)
    const r=p.height*e.width/e.height*Math.max(e.anchor[0],1-e.anchor[0])+ .05
    bounds[0]=Math.min(bounds[0],p.x-x0-r);bounds[2]=Math.min(bounds[2],p.z-z0-r);bounds[1]=Math.min(bounds[1],ground-.06)
    bounds[3]=Math.max(bounds[3],p.x-x0+r);bounds[5]=Math.max(bounds[5],p.z-z0+r);bounds[4]=Math.max(bounds[4],ground+p.height)
    if(!region?.skipContacts&&p.height>.65&&p.rank<.18)contacts.push({x:p.x,z:p.z,height:p.height,scale:p.height,sprite:e.id,kind:'foliageCard'})
  }
  return{id:`${sx},${sz}`,sx,sz,x:x0,z:z0,count,matrices,colours,rects,forms,fades,bounds,contacts}
}
export function generateFoliageWorld(progress=()=>{}){
  const sectors=[],n=FOLIAGE_WORLD.worldSize/FOLIAGE_WORLD.sectorSize;let total=0
  for(let z=0;z<n;z++)for(let x=0;x<n;x++){const sector=generateFoliageSector(x,z);if(sector.count){sectors.push(sector);total+=sector.count}if(x===n-1)progress((z+1)/n)}
  return{version:FOLIAGE_WORLD.version,seed:FOLIAGE_WORLD.seed,sectors,total}
}
