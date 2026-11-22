import {Color,DynamicDrawUsage,InstancedMesh,Matrix4} from 'three'
import {updateScoutLOD} from './invidScoutAsset.js'
import {createScoutDeathGeometry,createScoutDeathMaterial} from './scoutDeathAppearance.js'
import {scoutRigUniforms,scoutRigGeometry,patchScoutRigMaterial} from './ScoutMechanicalMotion.js'
import {SCOUT_SCORCH_SLOTS,scoutHitUniforms,scoutHitGeometry,patchScoutHitMaterial} from './scoutHitAppearance.js'

// Five Scouts per draw keeps joint uniforms within modest WebGL limits.
// Squads share immutable vertex buffers, texture maps and the shader key.
export function createScoutSquad(root,views){
  const capacity=5,uniforms={...scoutRigUniforms(capacity),...scoutHitUniforms(capacity)},material=patchScoutHitMaterial(patchScoutRigMaterial(createScoutDeathMaterial(views[0].levels[0].material),uniforms,capacity),uniforms,capacity)
  const batches=views[0].levels.map((level,i)=>{
    const geometry=scoutHitGeometry(scoutRigGeometry(createScoutDeathGeometry(level.geometry,capacity),capacity),capacity),batch=new InstancedMesh(geometry,material,capacity)
    batch.name='Invid_Scout_squad_LOD_'+i;batch.count=0;batch.castShadow=false;batch.receiveShadow=true;batch.instanceMatrix.setUsage(DynamicDrawUsage)
    for(let n=0;n<capacity;n++)batch.setColorAt(n,new Color());root.add(batch);return batch
  })
  return{views,scouts:[],batches,uniforms,material,matrix:new Matrix4(),white:new Color()}
}
export function renderScoutSquad(squad,cameraPosition,vfx){
  for(const batch of squad.batches)batch.count=0
  for(let localId=0;localId<squad.scouts.length;localId++){
    const scout=squad.scouts[localId],view=scout.view;if(!view.root.visible)continue
    const visual=vfx?.scoutVisual(scout);if(visual&&!visual.visible)continue
    updateScoutLOD(view,cameraPosition)
    const batch=squad.batches[view.lod],matrix=squad.matrix.copy(view.levels[view.lod].matrixWorld)
    if(visual){matrix.elements[12]+=visual.recoil.x;matrix.elements[13]+=visual.recoil.y;matrix.elements[14]+=visual.recoil.z}
    batch.geometry.attributes.aScoutDeath.setXY(batch.count,visual?.emissive||0,visual?.opacity??1)
    batch.geometry.attributes.aScoutRigId.setX(batch.count,localId)
    batch.geometry.attributes.aScoutHitId.setX(batch.count,localId)
    for(let i=0;i<SCOUT_SCORCH_SLOTS;i++){
      const mark=visual?.scorches?.[i],slot=localId*SCOUT_SCORCH_SLOTS+i,p=squad.uniforms.uScoutHitPoint.value[slot],n=squad.uniforms.uScoutHitNormal.value[slot]
      if(mark?.radius>0){p.set(mark.position.x,mark.position.y,mark.position.z,mark.radius);n.set(mark.normal.x,mark.normal.y,mark.normal.z,mark.heat)}else{p.set(0,0,0,0);n.set(0,0,1,0)}
    }
    for(let joint=0;joint<5;joint++)if(view.motion)squad.uniforms.uScoutRig.value[localId*5+joint].copy(view.motion.matrices[joint])
    batch.setMatrixAt(batch.count,matrix);batch.setColorAt(batch.count++,visual?.tint||squad.white)
  }
  for(const batch of squad.batches){batch.visible=batch.count>0;if(!batch.count)continue;batch.instanceMatrix.needsUpdate=true;batch.instanceColor.needsUpdate=true;batch.geometry.attributes.aScoutDeath.needsUpdate=true;batch.geometry.attributes.aScoutRigId.needsUpdate=true;batch.geometry.attributes.aScoutHitId.needsUpdate=true;batch.computeBoundingBox();batch.computeBoundingSphere()}
}
export function disposeScoutSquad(squad){squad.batches.forEach(b=>{b.removeFromParent();b.dispose();b.geometry.dispose()});squad.material.dispose();squad.views.forEach(v=>v.motion?.dispose())}
