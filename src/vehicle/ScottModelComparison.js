import {SkinnedMesh} from 'three'
import {createRelaxedScottHands} from './relaxedScottHands.js'
import {ScottV3Visual} from './ScottV3Visual.js'

// Preserve the legacy controller/mixer as an animation source. V1/V2 share that
// skeleton; V3 receives its poses through an independent native skeleton.
export class ScottModelComparison{
 constructor(instance,sources,baseVariant,maps=[]){
  this.instance=instance;this.base=instance.skins[0];this.variant=baseVariant
  this.skins=[];this.alternates=[];this.baseVisibility=this.base.mesh.visible
  for(const variant of ['v1','v2']){
   let skin
   if(variant===baseVariant)skin=this.base
   else{
    let source;sources[variant].traverse(node=>{if(node.isSkinnedMesh&&!source)source=node})
    if(!source)throw Error('Falta Scott '+variant)
    const bones=this.base.mesh.skeleton.bones
    if(source.skeleton.bones.length!==bones.length||source.skeleton.bones.some((bone,i)=>bone.name!==bones[i].name))throw Error('Scott '+variant+' requiere el mismo rig original')
    const original=source.material.clone(),clean=original.clone(),mesh=new SkinnedMesh(source.geometry,original)
    mesh.name='Scott_'+variant.toUpperCase()+'_visual_comparison'
    mesh.position.copy(this.base.mesh.position);mesh.quaternion.copy(this.base.mesh.quaternion);mesh.scale.copy(this.base.mesh.scale)
    mesh.castShadow=this.base.mesh.castShadow;mesh.receiveShadow=this.base.mesh.receiveShadow;mesh.frustumCulled=false
    mesh.userData.prewarmVFX=true
    this.base.mesh.parent.add(mesh);mesh.bind(this.base.mesh.skeleton,this.base.mesh.bindMatrix);mesh.bindMode=this.base.mesh.bindMode
    skin={mesh,original,clean,hand:createRelaxedScottHands(mesh)};this.alternates.push(skin)
   }
   if(variant==='v1'&&maps.length){skin.clean.map=maps[0];skin.clean.normalMap=maps[1];skin.clean.roughnessMap=maps[2];skin.clean.metalnessMap=maps[2]}
   skin.variant=variant;this.skins.push(skin)
  }
  if(sources.v3){this.v3=new ScottV3Visual(instance,sources.v3);this.skins.push(...this.v3.skins)}
  this.select(baseVariant)
 }
 select(variant){
  if(!this.skins.some(s=>s.variant===variant))return
  this.variant=variant
  for(const skin of this.skins)skin.mesh.visible=skin.variant===variant
  if(this.v3)this.v3.model.visible=variant==='v3'
 }
 syncHands(){
  // Copy the already evaluated relaxed/grip/aim morph amounts, after combat
  // poses. Both meshes use their own original hand geometry and UVs.
  const influences=this.base.mesh.morphTargetInfluences
  if(!influences)return
  for(const skin of this.alternates)if(skin.mesh.morphTargetInfluences)for(let i=0;i<Math.min(influences.length,skin.mesh.morphTargetInfluences.length);i++)skin.mesh.morphTargetInfluences[i]=influences[i]
 }
 dispose(){
  this.v3?.dispose()
  this.base.mesh.visible=this.baseVisibility
  for(const skin of this.alternates){skin.mesh.removeFromParent();skin.hand?.dispose();skin.original.dispose();skin.clean.dispose()}
  this.alternates=[]
 }
}
