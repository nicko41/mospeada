import {FOREST_ASSETS} from './forestConfig.js'
import {forestRandom} from './forestLayout.js'
import {FOREST_STAGE2 as S,stage2PathX,stage2Void} from './forestStage2Config.js'
import {stage2SurfaceHeight} from './forestStage2Terrain.js'
export function createStage2Layout(){
  const random=forestRandom(S.seed),between=(a,b)=>a+(b-a)*random(),layout=Object.fromEntries(FOREST_ASSETS.map(a=>[a.name,[]])),trees=[],grid=new Map(),cell=8,definitions=FOREST_ASSETS.filter(a=>a.kind==='tree'),rocks=FOREST_ASSETS.filter(a=>a.kind==='rock')
  const grove=Array.from({length:50},()=>({x:between(-83,83),z:between(S.endZ+12,S.startZ-8),radius:between(8,24)}))
  for(let n=0;n<14000&&trees.length<660;n++){
    const g=grove[Math.floor(random()*grove.length)],angle=between(0,Math.PI*2),r=Math.sqrt(random())*g.radius,x=g.x+Math.sin(angle)*r,z=g.z+Math.cos(angle)*r
    if(Math.abs(x)>90||z>S.startZ-4||z<S.endZ+4||stage2Void(x,z)||!Number.isFinite(stage2SurfaceHeight(x,z))||Math.abs(x-stage2PathX(z))<9.5||Math.min(Math.abs(z-S.canyon.lipZ),Math.abs(z-S.canyon.landingZ))<5)continue
    const cx=Math.floor(x/cell),cz=Math.floor(z/cell);let blocked=false
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const p of grid.get(`${cx+dx},${cz+dz}`)||[])if(Math.hypot(p.x-x,p.z-z)<3.8)blocked=true
    if(blocked)continue
    const asset=definitions[Math.floor(random()*definitions.length)],scale=between(2.1,3.1),p={x,z,scale,yaw:between(0,Math.PI*2),tint:between(.88,1.06),kind:'tree',name:asset.name,trunkRadius:asset.trunkRadius*scale}
    trees.push(p);layout[asset.name].push(p);const key=`${cx},${cz}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(p)
  }
  const outerGroves=Array.from({length:36},(_,i)=>({x:(i%2?1:-1)*between(116,238),z:between(S.endZ+12,S.startZ-12),radius:between(10,28)}))
  for(let n=0,added=0;n<18000&&added<520;n++){
    const g=outerGroves[Math.floor(random()*outerGroves.length)],angle=between(0,Math.PI*2),r=Math.sqrt(random())*g.radius,x=g.x+Math.sin(angle)*r,z=g.z+Math.cos(angle)*r
    if(Math.abs(x)<103||Math.abs(x)>248||z>S.startZ-4||z<S.endZ+4||stage2Void(x,z)||!Number.isFinite(stage2SurfaceHeight(x,z))||trees.some(p=>Math.hypot(p.x-x,p.z-z)<4.2))continue
    const asset=definitions[Math.floor(random()*definitions.length)],scale=between(2.3,3.3),p={x,z,scale,yaw:between(0,Math.PI*2),tint:between(.88,1.06),kind:'tree',name:asset.name,trunkRadius:asset.trunkRadius*scale}
    trees.push(p);layout[asset.name].push(p);added++
  }
  for(let n=0;n<60;n++){const x=between(-85,85),z=between(S.endZ+4,S.startZ-4);if(stage2Void(x,z)||Math.abs(x-stage2PathX(z))<9||!Number.isFinite(stage2SurfaceHeight(x,z)))continue;const a=rocks[Math.floor(random()*rocks.length)];layout[a.name].push({x,z,scale:between(.4,.9),yaw:between(0,Math.PI*2),tint:between(.9,1.05),kind:'rock',name:a.name})}
  return {layout,trees,grid,cell}
}
export const stage2Layout=createStage2Layout()
