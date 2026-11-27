import {Color,DynamicDrawUsage,Group,InstancedMesh,Matrix4,Object3D,Vector3} from 'three'
import {cloneRenderMaterial} from '../../loading/cloneMaterial.js'

export const INVID_DRONE_URL='/delivery/invid-drone.glb'
// Supplied GLB: +Y up, nose +Z. Centre the hull on the existing drone target;
// its authored proportions and all logical encounter bounds stay unchanged.
export const DRONE_ASSET=Object.freeze({min:[-.5963439941,-.4539459944,-.9512850046],max:[.5952299833,.4569430053,.9504979849],lengthMetres:2.4})
export const DRONE_SCALE=DRONE_ASSET.lengthMetres/(DRONE_ASSET.max[2]-DRONE_ASSET.min[2])

function violetDroneMaterial(source){
 const material=cloneRenderMaterial(source)
 material.name='Invid drone / violet carapace'
 material.metalness=.16;material.roughness=.8
 // Lift only the painted purple areas. Neutral trim, dark apertures, authored
 // texture variation and normal-map relief retain their original detail.
 material.onBeforeCompile=shader=>{
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
   float invidPaint = smoothstep(.005, .035, min(diffuseColor.r, diffuseColor.b) - diffuseColor.g)
     * smoothstep(.008, .035, max(diffuseColor.r, diffuseColor.b));
   float invidVariation = clamp(sqrt(dot(diffuseColor.rgb, vec3(.2126, .7152, .0722))) * 4., .2, 1.35);
   diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.3, .105, .47) * invidVariation, invidPaint);
  `)
 }
 material.customProgramCacheKey=()=> 'invid-drone-violet-v1'
 return material
}

export function droneLOD(distance,previous=0){
 if(previous===0&&distance<22||previous===1&&distance>18&&distance<58||previous===2&&distance>50)return previous
 return distance<20?0:distance<54?1:2
}

// One fixed pool per LOD; all drones share the decoded geometry, material and
// texture maps. Spawning, hits and retry never clone or upload a new model.
export class InvidDroneSquad{
 constructor(source,capacity){
  this.root=new Group();this.root.name='Invid_drone_preparation';this.root.userData.prewarmVFX=true
  const levels=[];source.updateMatrixWorld(true);source.traverse(m=>{if(m.isMesh)levels.push(m)})
  levels.sort((a,b)=>a.name.localeCompare(b.name))
  if(levels.length!==3)throw Error('Expected three prepared Invid drone LODs')
  this.material=violetDroneMaterial(levels[0].material)
  this.levels=new Uint8Array(capacity);this.object=new Object3D();this.tint=new Color();this.matrix=new Matrix4()
  const center=new Vector3().fromArray(DRONE_ASSET.min).add(new Vector3().fromArray(DRONE_ASSET.max)).multiplyScalar(-.5*DRONE_SCALE)
  this.transforms=levels.map(m=>new Matrix4().makeScale(DRONE_SCALE,DRONE_SCALE,DRONE_SCALE).setPosition(center).multiply(m.matrixWorld))
  this.batches=levels.map((level,i)=>{
   level.geometry.computeBoundingBox();level.geometry.computeBoundingSphere()
   const batch=new InstancedMesh(level.geometry,this.material,capacity)
   batch.name='Invid_Drone_LOD_'+i;batch.count=0;batch.castShadow=false;batch.receiveShadow=true
   batch.instanceMatrix.setUsage(DynamicDrawUsage)
   for(let n=0;n<capacity;n++)batch.setColorAt(n,this.tint)
   batch.instanceColor.setUsage(DynamicDrawUsage);this.root.add(batch);return batch
  })
 }
 update(encounter,player,cameraPosition,vfx){
  for(const batch of this.batches)batch.count=0
  if(encounter.active)for(const d of encounter.drones){
   if(!d.spawned)continue
   const visual=vfx?.scoutVisual(d)
   if(visual?!visual.visible:d.dead)continue
   const lod=this.levels[d.id]=droneLOD(d.position.distanceTo(cameraPosition),this.levels[d.id]),batch=this.batches[lod],o=this.object
   o.position.copy(d.position)
   // Keep the existing hover path. Only orient the visual hull toward its
   // target instead of inheriting the placeholder cube's endless spin.
   o.rotation.set(Math.sin(encounter.time*.7+d.id)*.06,Math.atan2(player.x-d.position.x,player.z-d.position.z),Math.sin(encounter.time*.9+d.id)*.07)
   if(d.flash>0){o.position.x+=Math.sin(d.flash*85)*.1;o.rotation.z+=Math.sin(d.flash*65)*.15}
   o.updateMatrix();this.matrix.multiplyMatrices(o.matrix,this.transforms[lod])
   this.tint.setRGB(1,1,1).multiplyScalar(1+Math.max(0,d.flash)/.18*1.5+(d.attack<.65?.12:0))
   batch.setMatrixAt(batch.count,this.matrix);batch.setColorAt(batch.count++,this.tint)
  }
  for(const batch of this.batches){
   batch.visible=batch.count>0;if(!batch.count)continue
   batch.instanceMatrix.needsUpdate=true;batch.instanceColor.needsUpdate=true
   batch.computeBoundingBox();batch.computeBoundingSphere()
  }
 }
 dispose(){
  // The resource cache owns source geometry/material/maps, including retries.
  for(const batch of this.batches){batch.removeFromParent();batch.dispose()}
  this.material.dispose()
 }
}
