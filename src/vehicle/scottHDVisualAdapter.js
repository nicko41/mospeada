import {SkinnedMesh} from 'three'

// The gameplay instance, bones, hand morphs and original vertex IDs stay alive.
// Only the private geometry's draw index changes. HD meshes share the live skin.
export function attachScottHDVisual(instance,hybridScene){
 const base=instance.skins[0].mesh,parts=[];let lower
 hybridScene.traverse(n=>{if(n.isSkinnedMesh){if(['HD2_HeadHelmet','HD2_ChestPlate'].includes(n.name))parts.push(n);else if(n.name===base.name)lower=n}})
 if(!lower||parts.length!==2)throw new Error('Scott HD V2: asset incompleto')
 if(lower.geometry.attributes.position.count!==base.geometry.attributes.position.count)throw new Error('Scott HD: receptor incompatible')
 const hand=instance.hands?.find(h=>h.geometry===base.geometry||h.source===base.geometry)
 const previousGeometry=base.geometry,geometry=hand?.geometry||base.geometry.clone(),originalIndex=geometry.index
 geometry.setIndex(lower.geometry.index);base.geometry=geometry
 const meshes=parts.map(source=>{
  const mesh=new SkinnedMesh(source.geometry,source.material);mesh.name=source.name
  mesh.position.copy(base.position);mesh.quaternion.copy(base.quaternion);mesh.scale.copy(base.scale)
  base.parent.add(mesh);mesh.bind(base.skeleton,base.bindMatrix);mesh.bindMode=base.bindMode
  mesh.castShadow=base.castShadow;mesh.receiveShadow=base.receiveShadow;mesh.frustumCulled=false
  return mesh
 })
 let disposed=false
 return {meshes,geometry,dispose(){
  if(disposed)return;disposed=true
  meshes.forEach(m=>m.removeFromParent());geometry.setIndex(originalIndex)
  if(!hand){if(base.geometry===geometry)base.geometry=previousGeometry;geometry.dispose()}
 }}
}
