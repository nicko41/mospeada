import {Group,Object3D} from 'three'
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js'
import {ScoutMechanicalMotion} from './ScoutMechanicalMotion.js'

export const INVID_SCOUT_URL='/delivery/invid-scout.glb?rig=flight-v4-leg-seam'
// Measured from the supplied GLB (+Y up, face +Z). Each asymmetric barrel
// aperture was inspected/raycast in source coordinates, not guessed at runtime.
export const SCOUT_ASSET=Object.freeze({
  min:Object.freeze([-.8345590234,-.9539020061,-.5982149839]),
  max:Object.freeze([.8375530243,.9495679736,.6133720279]),
  launchers:Object.freeze([Object.freeze([-.625,.760,.545]),Object.freeze([.564,.924,.414])]),
  head:Object.freeze([0,.30,.53]),
  headWidth:.373,
  // Rear carapace ends at Y=-.106; the turbine outlet sits below that lip.
  thruster:Object.freeze([0,-.19,-.535]),
  // Gameplay proportion: Scott in Armor stands just below half a Scout.
  heightMetres:5.2,
})
export const SCOUT_SCALE=SCOUT_ASSET.heightMetres/(SCOUT_ASSET.max[1]-SCOUT_ASSET.min[1])
export const SCOUT_WIDTH=(SCOUT_ASSET.max[0]-SCOUT_ASSET.min[0])*SCOUT_SCALE
export const SCOUT_DEPTH=(SCOUT_ASSET.max[2]-SCOUT_ASSET.min[2])*SCOUT_SCALE

export function createScoutView(source,id,clips=[]){
  const root=new Group();root.name='Invid_Scout_'+id;root.visible=false
  // Object clones share the one GLTF's geometry, materials and original maps.
  const model=cloneSkeleton(source);model.name='Scout_original_model';model.scale.setScalar(SCOUT_SCALE)
  model.position.set(-(SCOUT_ASSET.min[0]+SCOUT_ASSET.max[0])*.5*SCOUT_SCALE,-SCOUT_ASSET.min[1]*SCOUT_SCALE,-(SCOUT_ASSET.min[2]+SCOUT_ASSET.max[2])*.5*SCOUT_SCALE)
  const levels=[]
  model.traverse(m=>{if(m.isMesh){m.castShadow=false;m.receiveShadow=true;levels.push(m)}});root.add(model)
  levels.sort((a,b)=>a.name.localeCompare(b.name));levels.forEach((m,i)=>m.visible=i===0)
  const body=model.getObjectByName('body_root')||model
  const muzzles=SCOUT_ASSET.launchers.map((p,i)=>{const anchor=new Object3D();anchor.name=i?'Scout_right_launcher_aperture':'Scout_left_launcher_aperture';anchor.position.fromArray(p);body.add(anchor);return anchor})
  const view={id,root,model,muzzles,levels,lod:0}
  if(levels[0]?.isSkinnedMesh&&model.getObjectByName('arm_L'))view.motion=new ScoutMechanicalMotion(view,clips)
  return view
}

// Geometry/materials are prepared once. Distance only toggles existing LOD
// meshes; hysteresis prevents camera motion from flipping detail every frame.
export function updateScoutLOD(view,cameraPosition){
  if(view.levels.length<3)return
  const d=view.root.position.distanceTo(cameraPosition)/(SCOUT_ASSET.heightMetres/3.2),old=view.lod
  if(old===0&&d<14||old===1&&d>10&&d<39||old===2&&d>31)return
  const level=d<12?0:d<35?1:2
  if(level!==old){view.levels[old].visible=false;view.levels[level].visible=true;view.lod=level}
}
