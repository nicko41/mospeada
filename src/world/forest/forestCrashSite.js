import { crashLocal } from './forestCrashConfig.js'
import {CRASH_REFERENCE as reference,CRASH_RELOCATION as shift} from './crashRelocation.js'

// Local replacement grid, aligned with the existing 4 m terrain cells. Only
// this rectangle is tessellated more finely; its perimeter stays unchanged.
export const CRASH_MATERIAL_BOUNDS=Object.freeze({minX:reference.minX+shift.x,maxX:reference.maxX+shift.x,minZ:reference.minZ+shift.z,maxZ:reference.maxZ+shift.z})
export const CRASH_PATCH=Object.freeze({minX:Math.floor((CRASH_MATERIAL_BOUNDS.minX-4)/4)*4,maxX:Math.ceil((CRASH_MATERIAL_BOUNDS.maxX+4)/4)*4,minZ:Math.floor((CRASH_MATERIAL_BOUNDS.minZ-4)/4)*4,maxZ:Math.ceil((CRASH_MATERIAL_BOUNDS.maxZ+4)/4)*4,step:.5})
export const CRASH_TREE=Object.freeze({name:'CommonTree_4',assetName:'CommonTree_3',x:reference.treeX+shift.x,z:reference.treeZ+shift.z,scale:3.4,yaw:4.2,stumpHeight:1.05,fallenScale:1.8,fallOffset:[-.45,-.2],fallDirection:[-.93,.02,-.37]})
// Persistent identities from the fixed placement seed at the destination.
// Exclusions at the previous location are intentionally restored.
export const CRASH_TREE_EXCLUSIONS=Object.freeze([
  Object.freeze({id:'crash-original-hero',...CRASH_TREE}),
  Object.freeze({id:'crash-resting-footprint',name:'CommonTree_2',x:-24,z:4,scale:4.1,stumpHeight:.34}),
])
// Keep the approved broken wood dressing separate from living-tree exclusions.
export const CRASH_BROKEN_BASES=Object.freeze([
  {x:19.633842076922026+shift.x,z:6.388792854953769+shift.z,stumpHeight:.34},
  {x:25.844176514291874+shift.x,z:15.997984927399049+shift.z,stumpHeight:.42},
])
export const isCrashTree=p=>CRASH_TREE_EXCLUSIONS.some(t=>p.name===t.name&&Math.abs(p.x-t.x)<.001&&Math.abs(p.z-t.z)<.001)
export const inCrashPatch=(x,z)=>x>=CRASH_PATCH.minX&&x<=CRASH_PATCH.maxX&&z>=CRASH_PATCH.minZ&&z<=CRASH_PATCH.maxZ
const clamp=v=>Math.max(0,Math.min(1,v))
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t)}
const bell=(v,w)=>Math.exp(-((v/w)**2))
const treeLocal=crashLocal(CRASH_TREE.x,CRASH_TREE.z)
// The old positive bend missed the stump by more than three metres. Anchor
// the curve to the actual strike point, not to an approximate parallel stripe.
export const crashTrackCenter=z=>treeLocal.x*(Math.max(0,z)/treeLocal.z)**2
export const crashTrackWidth=z=>2.8+.32*Math.sin(z*.58)+.22*Math.sin(z*1.63)

// Shared physical relief, texture selection and vegetation damage footprint.
// The path follows the supplied reference: behind the tail, through the hero
// tree, then a gentle left turn into the aircraft's EXISTING resting pose.
export function crashSiteSample(x,z){
  const b=CRASH_MATERIAL_BOUNDS
  if(x<b.minX||x>b.maxX||z<b.minZ||z>b.maxZ)return{height:0,earth:0,dark:0,damage:0,destroyed:false}
  const p=crashLocal(x,z),cross=p.x-crashTrackCenter(p.z)
  const width=crashTrackWidth(p.z)
  const along=smooth(1.5,4,p.z)*(1-smooth(30.5,34,p.z))
  const interior=1-smooth(width*.72,width+.35,Math.abs(cross))
  const shoulder=bell(cross-width,.5)*(.6+.4*Math.sin(p.z*.8)**2)+bell(cross+width,.4)*.32
  const churn=.65+.2*Math.sin(p.z*1.7+cross*2.4)+.15*Math.cos(p.z*3.1-cross*1.5)
  const ruts=bell(cross-.95-.12*Math.sin(p.z),.42)+.7*bell(cross+.8,.37)+.35*bell(cross,.65)
  const braking=1+.38*(1-smooth(6,24,p.z))
  const dragHeight=along*(-.32*interior-.24*ruts+.39*shoulder*churn)*braking
  const bentX=p.x-.22*Math.sin(p.z*.73)-.14*Math.cos(p.z*1.5)
  const radius=Math.hypot(bentX/(bentX>0?4.9:3.45),(p.z+.65)/(p.z<0?8.9:7.9))
    +.075*Math.sin(p.z*1.14+p.x*.8)+.05*Math.cos(p.x*2.2-p.z*.6)
  const bed=1-smooth(.60,1.08,radius)
  const rim=bell(radius-.94,.14)*(.14+.65*smooth(-.4,2.2,p.x))*(.25+.75*Math.sin(p.z*.69+p.x*1.2)**2)
  // Inertia piles earth on the aircraft's RIGHT (+local X). Three unequal
  // overlapping lobes replace the previous mirrored pair of neat earth walls.
  const rightHeap=.72*bell(p.x-2.25,1.0)*bell(p.z+.5,3.2)
    +.43*bell(p.x-3.35,1.15)*bell(p.z-2.35,2.1)
    +.32*bell(p.x-1.65,.7)*bell(p.z+4.5,1.45)
  const leftRemnants=.10*bell(p.x+1.45,.65)*bell(p.z+1.5,2.1)
  const bedHeight=-.20*bed*(.85+.15*Math.sin(p.z*1.2+p.x))+.23*rim+rightHeap+leftRemnants
  const root=Math.hypot(x-CRASH_TREE.x,z-CRASH_TREE.z),rootHole=bell(root,1.15)
  const rootRim=bell(root-1.45,.48)*(.5+.5*Math.sin(p.z*2+p.x)**2)
  const height=dragHeight*(1-bed*.75)+bedHeight-.23*rootHole+.16*rootRim
  const earth=clamp(Math.max(bed,rightHeap*2.5,along*interior,along*shoulder*.8,rootHole+rootRim*.7))
  const moisture=.5+.28*Math.sin(p.z*.77+cross*1.8)+.22*Math.cos(p.z*1.6-cross*.6)
  const dark=clamp(bed*(.35+.35*moisture)+along*interior*(.28+.55*moisture)+rootHole*.4+rightHeap*.2)
  const border=smooth(0,2,Math.min(x-b.minX,b.maxX-x,z-b.minZ,b.maxZ-z))
  const destroyed=border>0&&(bed>.4||along>.12&&Math.abs(cross)<width*.83||root<1.25||rightHeap>.1)
  return{height:height*border,earth:earth*border,dark:dark*border,damage:clamp(Math.max(bed,rightHeap*2,along*interior,rootHole))*border,destroyed}
}

// Transport the approved ground beneath the dressing. Only the outside feather
// adapts to the destination terrain; visible ruts/banks keep their exact shape.
export function crashFoundationWeight(x,z,sample=crashSiteSample(x,z)){
  if(!inCrashPatch(x,z))return 0
  const ax=reference.treeX-.45+shift.x,az=reference.treeZ-.2+shift.z,bx=ax-.9289786848613703*17,bz=az-.3695936703211903*17,dx=bx-ax,dz=bz-az,t=clamp(((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)),distance=Math.hypot(x-ax-dx*t,z-az-dz*t)
  const tree=1-smooth(4.5,7.5,distance),soil=smooth(.002,.05,sample.earth),border=smooth(0,4,Math.min(x-CRASH_PATCH.minX,CRASH_PATCH.maxX-x,z-CRASH_PATCH.minZ,CRASH_PATCH.maxZ-z))
  return Math.max(tree,soil)*border
}
