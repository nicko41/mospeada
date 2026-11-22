import {stage2PathX,FOREST_STAGE2} from './forestStage2Config.js'
import {stage2SurfaceHeight} from './forestStage2Terrain.js'
import {GALLANT_FIRE} from '../../vehicle/GallantShot.js'

export const FOREST_STAGE3=Object.freeze({startZ:FOREST_STAGE2.endZ,triggerZ:FOREST_STAGE2.endZ+38,chunkLength:96,chunks:8,halfWidth:256,speed:14,entryTime:1.5,exitTime:1.1,fireInterval:GALLANT_FIRE.interval,droneHealth:3,
  waves:Object.freeze([2,3,3,2,1]),waveBreak:.8,spawnStagger:.18,
  firstAttack:.65,attackInterval:1.55,burstShots:3,burstInterval:.16,boltSpeed:52,boltLifetime:1.5,maxEnemyBolts:24,boltDamageFraction:.01,
  seed:19830930})
const period=FOREST_STAGE3.chunkLength*FOREST_STAGE3.chunks,baseX=stage2PathX(FOREST_STAGE3.startZ),k=Math.PI*2/period
export const stage3Phase=z=>((FOREST_STAGE3.startZ-z)%period+period)%period
export function stage3PathX(z){const t=k*(FOREST_STAGE3.startZ-z);return baseX+12*(1-Math.cos(t))-7*(1-Math.cos(t*2))}
export function stage3PathSlope(z){const t=k*(FOREST_STAGE3.startZ-z);return -12*k*Math.sin(t)+14*k*Math.sin(t*2)}
export const stage3Yaw=z=>Math.atan2(-stage3PathSlope(z),-1)
export const stage3EarthWeight=(x,z)=>1-smooth(1.2,4.5,Math.abs(x-stage3PathX(z)))
function smooth(a,b,v){const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t)}
export function stage3Roughness(z){const d=stage3Phase(z);let bump=0;for(const c of [112,368,624]){const q=Math.min(Math.abs(d-c),period-Math.abs(d-c));bump+=.65*Math.exp(-((q/10)**2))}return bump}
const edge=new Map()
export function stage3Height(x,z){
  const station=Math.floor(Math.max(-256,Math.min(255,x))),fraction=Math.max(0,Math.min(1,x-station))
  for(const at of [station,station+1])if(!edge.has(at))edge.set(at,stage2SurfaceHeight(at,FOREST_STAGE3.startZ))
  const t=k*(FOREST_STAGE3.startZ-z)
  return edge.get(station)*(1-fraction)+edge.get(station+1)*fraction+.65*Math.sin(t)**2+.25*Math.sin(t*3)**2+stage3Roughness(z)
}
export const stage3PathGLSL=`float stage3Earth(vec2 p){float t=${k.toFixed(12)}*(${FOREST_STAGE3.startZ.toFixed(1)}-p.y);float pathX=${baseX.toFixed(9)}+12.0*(1.0-cos(t))-7.0*(1.0-cos(t*2.0));return 1.0-smoothstep(1.2,4.5,abs(p.x-pathX));}`
