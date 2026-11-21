import { FOREST } from './forestConfig.js'
import { forestLayout,forestOpenness,forestPathDistance,forestRandom } from './forestLayout.js'
import { FOLIAGE_CATALOG } from './foliageCatalog.js'
import { FOLIAGE_PILOT,inFoliagePilot } from './forestFoliageConfig.js'
import { crashVegetationClearance } from './forestCrashConfig.js'
import { isCrashTree } from './forestCrashSite.js'

const cell=6,key=(x,z)=>`${Math.floor(x/cell)},${Math.floor(z/cell)}`
const anchors=Object.values(forestLayout).flat().filter(p=>p.kind==='tree'||p.kind==='rock'),grid=new Map()
for(const p of anchors){const k=key(p.x,p.z);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(p)}
function nearAnchor(x,z){const cx=Math.floor(x/cell),cz=Math.floor(z/cell);for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const p of grid.get(`${cx+dx},${cz+dz}`)||[]){if(Math.hypot(x-p.x,z-p.z)<(p.kind==='tree'?3.5:2.1))return true}return false}
const hash=(x,z)=>{const value=Math.sin(x*127.1+z*311.7)*43758.5453;return value-Math.floor(value)}

// Preserve seeded trees, rocks and collisions. Thin only visual understory;
// open short-grass areas are already fully illustrated by the ground maps.
export const forestRenderLayout=Object.fromEntries(Object.entries(forestLayout).map(([name,placements])=>[name,placements.filter(p=>{
  if(isCrashTree(p))return false
  if(p.kind==='tree'||p.kind==='rock'||p.kind==='pebble')return true
  if(inFoliagePilot(p.x,p.z,1.5))return false
  if(p.kind==='shrub')return true
  if(forestOpenness(p.x,p.z)>.22||forestPathDistance(p.x,p.z)<FOREST.pathHalfWidth+1.2||Math.hypot(p.x,p.z)<FOREST.clearingRadius+2)return false
  if(!nearAnchor(p.x,p.z)||Math.sin(p.x*.17+Math.sin(p.z*.13))+Math.cos(p.z*.19)<.08)return false
  return hash(p.x,p.z)<(p.kind==='grass'?.18:name==='Fern_1'?.32:name==='Plant_1'?.08:0)
})]))

export function createFoliagePilot(seed=FOLIAGE_PILOT.seed){
  const random=forestRandom(seed),between=(a,b)=>a+(b-a)*random(),result=[]
  const roots=anchors.filter(p=>inFoliagePilot(p.x,p.z,-2))
  const groups=roots.map(p=>({x:p.x,z:p.z,radius:between(1.5,3.2)}))
  const choices=FOLIAGE_CATALOG.entries.filter(e=>!e.id.startsWith('pasto-bajo'))
  for(let tries=0;result.length<FOLIAGE_PILOT.instances&&tries<3000;tries++){
    const group=groups[Math.floor(random()*groups.length)],angle=between(0,Math.PI*2),radius=between(.8,group.radius)
    const x=group.x+Math.cos(angle)*radius,z=group.z+Math.sin(angle)*radius
    if(!inFoliagePilot(x,z)||forestPathDistance(x,z)<FOREST.pathHalfWidth+1.7||forestOpenness(x,z)>.17||Math.hypot(x,z)<14||crashVegetationClearance(x,z,.5))continue
    if(anchors.some(p=>p.kind==='tree'&&Math.hypot(p.x-x,p.z-z)<p.trunkRadius+.35))continue
    if(result.some(p=>Math.hypot(p.x-x,p.z-z)<.68))continue
    const entry=choices[Math.floor(random()*choices.length)],height=between(...entry.heightRange)
    result.push({x,z,height,scale:height,yaw:between(0,Math.PI*2),mirror:random()<.5,tint:between(.93,1.03),sprite:entry.id,kind:'foliageCard',category:entry.category})
  }
  if(result.length!==FOLIAGE_PILOT.instances)throw Error('Insufficient space in foliage pilot')
  return result
}
export const foliagePilotPlacements=createFoliagePilot()
export const forestUnderstoryStats=Object.fromEntries(['tree','shrub','grass','plant','rock','pebble'].map(kind=>[kind,{before:Object.values(forestLayout).flat().filter(p=>p.kind===kind).length,after:Object.values(forestRenderLayout).flat().filter(p=>p.kind===kind).length}]))
export const forestWorldRenderLayout=Object.fromEntries(Object.entries(forestLayout).map(([name,p])=>[name,['tree','rock','pebble'].includes(p[0]?.kind)?p.filter(v=>!isCrashTree(v)):[]]))
