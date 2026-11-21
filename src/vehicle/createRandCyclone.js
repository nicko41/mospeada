import {createDrivingCyclone} from './createDrivingCyclone.js'

export const RAND_CYCLONE_URL='/models/mospeada/rand-cyclone.glb'
export function createRandCyclone(source){
  const rig=createDrivingCyclone(source)
  rig.root.name='Rand_Cyclone';rig.root.userData.owner='Rand';rig.root.userData.animeHero=true
  // The duplicate gets independent geometry too, allowing later bodywork edits
  // without changing Scott's bike, even when a caller shares the source GLTF.
  const privateGeometry=new Map(),lights=[]
  rig.root.traverse(o=>{
    if(o.isLight)lights.push(o)
    if(!o.isMesh)return
    if(!privateGeometry.has(o.geometry))privateGeometry.set(o.geometry,o.geometry.clone())
    o.geometry=privateGeometry.get(o.geometry);o.castShadow=false
  })
  // NPC lamps retain their emissive appearance; a second sun/headlight rig must
  // not change the approved scene lighting or add shadow passes.
  lights.forEach(l=>l.removeFromParent())
  rig.dispose=()=>{
    const materials=new Set();rig.root.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])materials.add(m)})
    privateGeometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())
  }
  return rig
}
