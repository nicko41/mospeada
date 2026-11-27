import {DynamicDrawUsage,InstancedBufferAttribute,InstancedMesh,MeshBasicMaterial,Object3D,PlaneGeometry,Quaternion,Vector3} from 'three'

export const CUFF_SMOKE_SHEET=Object.freeze({columns:4,rows:4,frames:16,width:1254,height:1254,inset:2,fps:20,size:2.4,opacity:.9,followSeconds:.14})
export function cuffSmokeFrameRect(frame,out,offset=0){
 const c=CUFF_SMOKE_SHEET,f=Math.max(0,Math.min(c.frames-1,frame)),u=c.inset/c.width,v=c.inset/c.height
 out[offset]=f%c.columns/c.columns+u;out[offset+1]=1-(Math.floor(f/c.columns)+1)/c.rows+v
 out[offset+2]=1/c.columns-2*u;out[offset+3]=1/c.rows-2*v
 return out
}

// Four independent, one-shot sheets supplement the original Quarks smoke.
// The borrowed texture and all missile records remain untouched.
export class CuffLaunchSprites{
 constructor(map){
  this.geometry=new PlaneGeometry(1,1)
  this.frames=new InstancedBufferAttribute(new Float32Array(4*4),4).setUsage(DynamicDrawUsage)
  this.opacity=new InstancedBufferAttribute(new Float32Array(4),1).setUsage(DynamicDrawUsage)
  this.geometry.setAttribute('aCuffSmokeFrame',this.frames);this.geometry.setAttribute('aCuffSmokeOpacity',this.opacity)
  this.material=new MeshBasicMaterial({name:'Cuff authored animated smoke ball',map,transparent:true,depthTest:true,depthWrite:false,toneMapped:false,fog:true,alphaTest:.04})
  this.material.onBeforeCompile=shader=>{
   shader.vertexShader='attribute vec4 aCuffSmokeFrame;attribute float aCuffSmokeOpacity;varying float vCuffSmokeOpacity;\n'+shader.vertexShader
   shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvMapUv=aCuffSmokeFrame.xy+vMapUv*aCuffSmokeFrame.zw;vCuffSmokeOpacity=aCuffSmokeOpacity;')
   shader.fragmentShader='varying float vCuffSmokeOpacity;\n'+shader.fragmentShader
   shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>','diffuseColor.a*=vCuffSmokeOpacity;\n#include <alphatest_fragment>')
  }
  this.material.customProgramCacheKey=()=> 'cuff-smoke-one-shot-sheet-v1'
  this.mesh=new InstancedMesh(this.geometry,this.material,4);this.mesh.name='Cuff_animated_smoke_ball';this.mesh.count=0;this.mesh.frustumCulled=false;this.mesh.renderOrder=8;this.mesh.userData.prewarmVFX=true;this.mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  this.slots=Array.from({length:4},()=>({active:false,fresh:false,age:0,frame:0,launcher:null,position:new Vector3()}))
  this.object=new Object3D();this.cameraRotation=new Quaternion()
 }
 start(slot,launcher,point){
  const r=this.slots[slot];if(!r)return
  r.active=r.fresh=true;r.age=r.frame=0;r.launcher=launcher;r.position.copy(point)
 }
 present(camera,dt){
  const c=CUFF_SMOKE_SHEET,step=Math.max(0,Math.min(.25,dt)),life=c.frames/c.fps
  camera.getWorldQuaternion(this.cameraRotation);this.mesh.count=0
  for(const r of this.slots)if(r.active){
   if(r.fresh)r.fresh=false;else r.age+=step
   if(r.age>=life){r.active=false;continue}
   r.frame=Math.min(c.frames-1,Math.floor(r.age*c.fps))
   if(r.age<c.followSeconds&&r.launcher){const l=r.launcher;l.mesh.updateWorldMatrix(true,false);r.position.copy(l.local).applyMatrix4(l.mesh.matrixWorld)}
   else r.position.y+=step*.14
   const i=this.mesh.count++;cuffSmokeFrameRect(r.frame,this.frames.array,i*4)
   this.opacity.setX(i,c.opacity*Math.min(1,(life-r.age)/.18))
   this.object.position.copy(r.position);this.object.quaternion.copy(this.cameraRotation);this.object.scale.set(c.size,c.size,1);this.object.updateMatrix();this.mesh.setMatrixAt(i,this.object.matrix)
  }
  if(this.mesh.count){this.mesh.instanceMatrix.needsUpdate=true;this.frames.needsUpdate=true;this.opacity.needsUpdate=true}
 }
 clear(){this.mesh.count=0;for(const r of this.slots){r.active=r.fresh=false;r.age=r.frame=0;r.launcher=null}}
 dispose(){this.mesh.removeFromParent();this.mesh.dispose();this.geometry.dispose();this.material.dispose()}
}
