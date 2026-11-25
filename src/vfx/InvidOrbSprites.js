import {AdditiveBlending,Color,DynamicDrawUsage,InstancedBufferAttribute,InstancedMesh,MeshBasicMaterial,Object3D,PlaneGeometry} from 'three'
import {SCOUT_PROJECTILE_CAPACITY} from '../vehicle/EnergyProjectiles.js'

// Visual tuning only. Projectile lifetime, movement and collision stay in
// EnergyProjectiles; the sprites never write to those pooled records.
export const INVID_ORB_SPRITE=Object.freeze({
 columns:5,rows:4,textureWidth:1774,textureHeight:887,
 firstFrame:5,lastFrame:11,fps:18,
 width:1.45,height:.90625,opacity:1,intensity:1.05,glowGain:2.2,alphaTest:.015,
})
export function invidOrbFrame(age,slot=0){
 const c=INVID_ORB_SPRITE,span=c.lastFrame-c.firstFrame,step=(Math.floor(Math.max(0,age)*c.fps)+slot*2)%(span*2)
 return c.firstFrame+(step<=span?step:span*2-step)
}
export function invidOrbFrameRect(frame,out,offset=0){
 const c=INVID_ORB_SPRITE,column=frame%c.columns,row=Math.floor(frame/c.columns),px=1/c.textureWidth,py=1/c.textureHeight
 out[offset]=column/c.columns+px;out[offset+1]=1-(row+1)/c.rows+py
 out[offset+2]=1/c.columns-2*px;out[offset+3]=1/c.rows-2*py
 return out
}
export class InvidOrbSprites{
 constructor({map,atlas=true}={}){
  this.atlas=atlas;this.geometry=new PlaneGeometry(1,1)
  this.frames=new InstancedBufferAttribute(new Float32Array(SCOUT_PROJECTILE_CAPACITY*4),4).setUsage(DynamicDrawUsage)
  this.geometry.setAttribute('aInvidOrbFrame',this.frames)
  const c=INVID_ORB_SPRITE
  this.material=new MeshBasicMaterial({name:'Invid animated white oval / violet glow',map,color:new Color().setRGB(c.intensity,c.intensity,c.intensity),transparent:true,opacity:c.opacity,blending:AdditiveBlending,depthTest:true,depthWrite:false,toneMapped:false,fog:false,alphaTest:c.alphaTest})
  this.material.onBeforeCompile=shader=>{
   if(!map)return
   shader.vertexShader='attribute vec4 aInvidOrbFrame;\n'+shader.vertexShader
   shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvMapUv=aInvidOrbFrame.xy+vMapUv*aInvidOrbFrame.zw;')
   shader.uniforms.uInvidOrbGlowGain={value:c.glowGain}
   shader.fragmentShader='uniform float uInvidOrbGlowGain;\n'+shader.fragmentShader
   shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat invidViolet=clamp((diffuseColor.r+diffuseColor.b-2.0*diffuseColor.g)*8.0,0.0,1.0);\ndiffuseColor.rgb*=1.0+(uInvidOrbGlowGain-1.0)*invidViolet;')
  }
  this.material.customProgramCacheKey=()=> 'invid-orb-instanced-sheet-v2-violet'
  this.mesh=new InstancedMesh(this.geometry,this.material,SCOUT_PROJECTILE_CAPACITY)
  this.mesh.name='Invid_animated_orbs';this.mesh.count=0;this.mesh.frustumCulled=false;this.mesh.castShadow=false;this.mesh.renderOrder=5;this.mesh.userData.prewarmVFX=true
  this.mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  this.object=new Object3D();this.serial=0;this.pool=null
  this.slots=Array.from({length:SCOUT_PROJECTILE_CAPACITY},()=>({bolt:null,age:0,life:0,seen:0}))
 }
 begin(pool){if(this.pool!==pool){this.clear();this.pool=pool}this.serial++;this.mesh.count=0}
 put(bolt,slot,dt,cameraRotation){
  if(slot>=this.slots.length||this.mesh.count>=SCOUT_PROJECTILE_CAPACITY)return
  const r=this.slots[slot],life=bolt.life??0,continuing=r.bolt===bolt&&r.seen===this.serial-1&&life<=r.life+.00001
  r.age=continuing?r.age+Math.max(0,dt):0;r.bolt=bolt;r.life=life;r.seen=this.serial
  const i=this.mesh.count++,scale=bolt.visualScale||1,c=INVID_ORB_SPRITE
  this.object.position.copy(bolt.position);this.object.quaternion.copy(cameraRotation);this.object.scale.set(c.width*scale,c.height*scale,1);this.object.updateMatrix();this.mesh.setMatrixAt(i,this.object.matrix)
  if(this.atlas)invidOrbFrameRect(invidOrbFrame(r.age,slot),this.frames.array,i*4)
  else this.frames.setXYZW(i,0,0,1,1)
 }
 finish(){if(this.mesh.count){this.mesh.instanceMatrix.needsUpdate=true;this.frames.needsUpdate=true}}
 clear(){this.mesh.count=0;this.pool=null;this.serial=0;for(const r of this.slots){r.bolt=null;r.age=r.life=r.seen=0}}
 dispose(){this.mesh.removeFromParent();this.mesh.dispose();this.geometry.dispose();this.material.dispose()}
}
