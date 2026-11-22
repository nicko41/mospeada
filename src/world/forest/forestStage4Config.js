import {stage3Height,stage3PathX,FOREST_STAGE3} from './forestStage3Config.js'
import {DESERT_CLIMAX,climaxPathX,climaxTerrainHeight} from './forestClimaxConfig.js'

export const FOREST_STAGE4=Object.freeze({seed:19831001,connector:96,forestLength:620,halfWidth:1024,desertHalfWidth:2400,desertEnd:2400,drop:28,
  jumps:Object.freeze([{start:145,crest:172,end:205,height:2.8},{start:285,crest:322,end:366,height:4},{start:431,crest:454,end:486,height:3.2}])})
export const smooth4=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t)}
function entryHeight(x,z){
  const x0=Math.floor(x/4)*4,z0=Math.ceil(z/2)*2,u=(x-x0)/4,v=(z0-z)/2,a=Math.fround(stage3Height(x0,z0)),b=Math.fround(stage3Height(x0+4,z0)),c=Math.fround(stage3Height(x0,z0-2)),d=Math.fround(stage3Height(x0+4,z0-2))
  return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v)
}
export function stage4Anchor(z){const index=Math.ceil((FOREST_STAGE3.startZ-z+160)/FOREST_STAGE3.chunkLength),at=FOREST_STAGE3.startZ-index*FOREST_STAGE3.chunkLength,x=Math.round(stage3PathX(at)/4)*4;return {x,y:entryHeight(x,at),z:at}}
export function stage4Path(z,anchor=null){const d=-z,t=smooth4(0,96,d),path=(12*Math.sin(d*.012)+5*Math.sin(d*.026))*(1-smooth4(490,600,d));if(d>=DESERT_CLIMAX.start)return climaxPathX(d);return anchor&&d<96?(stage3PathX(anchor.z+z)-anchor.x)*(1-t)+path*t:path}
export const stage4Edge=x=>620+(8*Math.sin(x*.018)+4*Math.sin(x*.051))*smooth4(4,40,Math.abs(x))
export function stage4ForestHeight(x,z,anchor=null){
  const d=-z,cross=x-stage4Path(z,anchor),off=smooth4(6,24,Math.abs(cross))
  let h=(.6*Math.sin(d*.019)**2+Math.sin(x*.022+d*.008)*.65)*smooth4(0,100,d)+off*(1.5*Math.sin(x*.037+z*.014)+4*smooth4(100,850,Math.abs(x)))
  for(const j of FOREST_STAGE4.jumps){if(d<=j.start||d>=j.end)continue;const t=d<j.crest?smooth4(j.start,j.crest,d):1-smooth4(j.crest,j.end,d);h+=j.height*t*(1-smooth4(5,17,Math.abs(cross)))*(1+.035*Math.sin(x*.5+d*.13))}
  // A short eroded landing shelf gives the middle jump its own profile.
  h-=1.25*smooth4(327,330,d)*(1-smooth4(353,376,d))*(1-smooth4(5,18,Math.abs(cross)))
  h+=1.7*smooth4(575,618,d)*(1-smooth4(9,35,Math.abs(cross)))
  const side=smooth4(800,1024,Math.abs(x));h=h*(1-side)+stage4DesertHeight(x,z)*side
  if(anchor&&d<96){const t=smooth4(0,96,d);h=(entryHeight(x+anchor.x,z+anchor.z)-anchor.y)*(1-t)+h*t}
  return h
}
export function stage4DesertHeight(x,z){
  const d=-z,landing=smooth4(790,1150,d),side=smooth4(350,650,Math.abs(x))
  let h=-FOREST_STAGE4.drop+landing*(1.2*Math.sin(x*.009+d*.013)+.65*Math.sin(d*.037-x*.021))
  h+=side*(2*Math.sin(x*.006+d*.007)+1.3*Math.cos(x*.013-d*.009))
  // Open one central pass between the existing mountains, continuing -Z.
  const pass=(1-smooth4(95,290,Math.abs(x)))*smooth4(1100,1450,d)
  const rim=Math.max(smooth4(750,1800,Math.abs(x)),smooth4(1400,2300,d)*(1-pass))
  const ridge=75+100*(.5+.5*Math.sin(x*.006+d*.002))**2+80*(.5+.5*Math.sin(x*.015-d*.004))**4
  const oldHeight=h+rim*ridge
  return d>DESERT_CLIMAX.start?climaxTerrainHeight(x,z,oldHeight):oldHeight
}
export const stage4EarthWeight=(x,z,anchor=null)=>Math.max(1-smooth4(1.3,4.5,Math.abs(x-stage4Path(z,anchor))),smooth4(520,620,-z+4*Math.sin(x*.13)),smooth4(800,1024,Math.abs(x)))

let current=null
export const stage4World={get:()=>current,set:world=>{current=world},clear:world=>{if(current===world)current=null}}
