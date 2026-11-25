import {generateFoliageSector} from './forestFoliageDistribution.js'
import {stage2Layout} from './forestStage2Layout.js'
import {FOREST_STAGE2 as S,stage2PathX,stage2Smooth,stage2Void} from './forestStage2Config.js'
import {stage2SurfaceHeight} from './forestStage2Terrain.js'
import {createTreeBasePlants,treeBaseSectorIndex} from './forestTreeBasePlants.js'
export const STAGE2_FOLIAGE_KEY='forest-stage2-foliage-v3-roots'
const region={step:.9,height:stage2SurfaceHeight,skipContacts:true,
  rootSectors:treeBaseSectorIndex(createTreeBasePlants(stage2Layout.trees,{seed:S.seed,allowed:(x,z)=>!stage2Void(x,z)&&Number.isFinite(stage2SurfaceHeight(x,z))})),
  contains:(x,z)=>z<-400&&z>S.endZ+2&&Math.abs(x)<S.detailHalfWidth-2&&!stage2Void(x,z)&&Number.isFinite(stage2SurfaceHeight(x,z))&&Math.min(Math.abs(z-S.canyon.lipZ),Math.abs(z-S.canyon.landingZ))>1.2,
  environment(x,z){const {cell,grid}=stage2Layout,cx=Math.floor(x/cell),cz=Math.floor(z/cell);let root=100,blocked=false;for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const p of grid.get(`${cx+dx},${cz+dz}`)||[]){const d=Math.hypot(x-p.x,z-p.z);root=Math.min(root,d);if(d<p.trunkRadius+.3)blocked=true}return {root,rock:100,blocked}},
  density(x,z,env){const d=Math.abs(x-stage2PathX(z));if(env.blocked||d<1.4)return 0;const clump=.55+.45*(.5+.5*Math.sin(x*.12+Math.sin(z*.09))*Math.cos(z*.11));return (env.root<3?.98:.7)*clump*(d<6?stage2Smooth(1.4,6,d)*.3:1)},
}
export function generateStage2FoliageWorld(progress=()=>{}){
  const sectors=[];let total=0
  const first=Math.floor((S.endZ+400)/32),last=-1,minX=Math.floor((400-S.halfWidth)/32),maxX=Math.floor((400+S.halfWidth)/32)
  for(let z=first;z<=last;z++){for(let x=minX;x<=maxX;x++){const s=generateFoliageSector(x,z,S.seed,region);if(s.count){sectors.push(s);total+=s.count}}progress((z-first+1)/(last-first+1))}
  return {version:STAGE2_FOLIAGE_KEY,seed:S.seed,sectors,total}
}
