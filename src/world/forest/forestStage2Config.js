export const FOREST_STAGE2=Object.freeze({
  startZ:-400,endZ:-1120,halfWidth:256,detailHalfWidth:96,step:1,chunkLength:48,
  plateau:3.2,first:{startZ:-490,crestZ:-518,endZ:-550,height:3.2},
  canyon:{approachZ:-750,lipZ:-800,landingZ:-930,rise:7,landingHeight:9,depth:-48},
  checkpoint:{z:-655,yaw:Math.PI,label:'Nivel 01 · Plano 2 · Barranco'},
  checkpointTriggerZ:-625,fallY:-15,seed:19830925,
})
export const stage2Smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t)}
const oldPath=z=>Math.sin(z*.013)*20+Math.sin(z*.033)*3
export function stage2PathX(z){const t=stage2Smooth(0,80,-z-400);return oldPath(z)*(1-t)+oldPath(-480)*t}
export const inForestStage2=(x,z)=>z<=FOREST_STAGE2.startZ+.001&&z>=FOREST_STAGE2.endZ&&Math.abs(x)<=FOREST_STAGE2.halfWidth
export const stage2EdgeBend=(x,back=false)=>12*Math.sin((x-stage2PathX(-800))*(back?.019:.014))**2*stage2Smooth(9,30,Math.abs(x-stage2PathX(-800)))
export const stage2LipZ=(x,back=false)=>(back?FOREST_STAGE2.canyon.landingZ:FOREST_STAGE2.canyon.lipZ)+(back?-1:1)*stage2EdgeBend(x,back)
export const stage2Void=(x,z)=>inForestStage2(x,z)&&z<stage2LipZ(x)&&z>stage2LipZ(x,true)
export const stage2EarthWeight=(x,z)=>1-stage2Smooth(1.2,4.5,Math.abs(x-stage2PathX(z)))
export const stage2Checkpoint=()=>({...FOREST_STAGE2.checkpoint,x:stage2PathX(FOREST_STAGE2.checkpoint.z)})
