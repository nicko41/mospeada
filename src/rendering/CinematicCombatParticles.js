import {Color,DynamicDrawUsage,InstancedBufferAttribute,InstancedMesh,Object3D,PlaneGeometry,Quaternion,ShaderMaterial,UniformsLib,UniformsUtils,Vector3} from 'three'

const vertex=/* glsl */`
attribute vec4 cfxColor;
attribute float cfxKind;
varying vec2 cfxUv;varying vec4 cfxTint;varying float cfxShape;
#include <fog_pars_vertex>
void main(){
 cfxUv=uv;cfxTint=cfxColor;cfxShape=cfxKind;
 vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(position,1.0);
 gl_Position=projectionMatrix*mvPosition;
 #include <fog_vertex>
}`
const fragment=/* glsl */`
varying vec2 cfxUv;varying vec4 cfxTint;varying float cfxShape;
#include <fog_pars_fragment>
void main(){
 vec2 q=cfxUv*2.0-1.0;
 float radius=length(q);
 float shape=cfxShape<.5?exp(-radius*radius*4.5)*(1.0-smoothstep(.6,1.0,radius)):1.0-smoothstep(.48,.95,max(abs(q.x),abs(q.y)));
 if(cfxShape>1.5)shape=exp(-q.x*q.x*7.0)*pow(max(0.0,1.0-abs(q.y)),1.2);
 float grain=.82+.18*sin(q.x*12.0+sin(q.y*9.0));
 float alpha=shape*grain*cfxTint.a;if(alpha<.004)discard;
 gl_FragColor=vec4(cfxTint.rgb,alpha);
 #include <fog_fragment>
 #include <colorspace_fragment>
}`

// A single, permanently allocated world-space batch. No screen-attached
// confetti, collision queries, new texture assets, or simulation callbacks.
export class CinematicCombatParticles{
 constructor(scene){
  this.capacity=96;this.records=Array.from({length:96},()=>({active:false,origin:new Vector3(),velocity:new Vector3(),color:new Color(),age:0,life:0,size:0,opacity:0,kind:0,spin:0,floor:0}))
  this.geometry=new PlaneGeometry(1,1);this.colors=new InstancedBufferAttribute(new Float32Array(96*4),4);this.shapes=new InstancedBufferAttribute(new Float32Array(96),1)
  this.colors.setUsage(DynamicDrawUsage);this.shapes.setUsage(DynamicDrawUsage);this.geometry.setAttribute('cfxColor',this.colors);this.geometry.setAttribute('cfxKind',this.shapes)
  this.material=new ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,uniforms:UniformsUtils.merge([UniformsLib.fog]),transparent:true,depthWrite:false,depthTest:true,toneMapped:false,fog:true})
  this.material.name='Cinematic combat soft debris';this.mesh=new InstancedMesh(this.geometry,this.material,96);this.mesh.name='Cinematic_combat_world_particles';this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);this.mesh.frustumCulled=false;this.mesh.count=0;this.mesh.renderOrder=9;this.mesh.userData.prewarmVFX=true;scene.add(this.mesh)
  this.object=new Object3D();this.toward=new Vector3();this.cameraPoint=new Vector3();this.rotation=new Quaternion();this.seed=41831
 }
 random(){this.seed=(1664525*this.seed+1013904223)>>>0;return this.seed/4294967296}
 burst(event,family,camera,config,gain){
  let left=Math.min(family.particles,config.maxParticles-this.records.filter(p=>p.active).length)
  camera.getWorldPosition(this.cameraPoint);this.toward.subVectors(this.cameraPoint,event.point).normalize()
  for(const p of this.records){
   if(left<=0)break;if(p.active)continue;left--
   const explosion=event.family==='explosion',dust=event.style==='earth'||event.kind==='ground',roll=this.random(),kind=explosion?(roll<.55?2:roll<.85?1:0):(roll<.65?0:1)
   const life=explosion?Math.max(.06,family.particleDuration??.75):family.duration,size=explosion?(family.particleSize??.16):family.size,opacity=explosion?(family.particleOpacity??.75):family.opacity
   p.active=true;p.family=event.family;p.age=0;p.life=Math.min(.85,life*(explosion?(kind===2?.55:kind===1?.9:1):(.7+this.random()*.4)));p.size=size*(.6+this.random()*1.4);p.opacity=Math.min(explosion?.9:.5,opacity*gain*(.7+this.random()*.3));p.kind=kind;p.spin=this.random()*6.28;p.floor=event.kind==='ground'?event.point.y:-Infinity
   p.origin.copy(event.point);p.origin.x+=(this.random()-.5)*.3;p.origin.z+=(this.random()-.5)*.3;p.origin.y+=.1
   const speed=Math.min(22,this.cameraPoint.distanceTo(event.point)/Math.max(.2,p.life))*(.55+this.random()*.35)
   p.velocity.copy(this.toward).multiplyScalar(speed);p.velocity.x+=(this.random()-.5)*4;p.velocity.z+=(this.random()-.5)*4;p.velocity.y+=dust?2+this.random()*3:(this.random()-.3)*3
   p.color.set(dust?(kind?'#82715b':'#b2a18c'):(kind?'#e9ac71':'#97919c'))
   if(explosion){
    const elevation=this.random()*2-1,azimuth=this.random()*Math.PI*2,radial=Math.sqrt(1-elevation*elevation),scale=Math.sqrt(Math.max(.15,event.strength)),speed=(kind===2?7+this.random()*8:4+this.random()*6)*scale
    p.velocity.set(Math.cos(azimuth)*radial*speed,elevation*speed+2,Math.sin(azimuth)*radial*speed)
    p.size*=scale*(kind===0?2.8:1);p.color.set(kind===2?'#ffd371':kind===1?'#51434d':'#8a8084')
    if(kind===2)p.color.multiplyScalar(1.6);if(kind===0)p.opacity*=.35
   }
  }
 }
 advance(dt,config){let n=0;for(const p of this.records)if(p.active){p.age+=dt;if(p.age>=p.life||!config.families[p.family].enabled||n>=config.maxParticles)p.active=false;else n++}}
 paint(camera,focus){
  let n=0;camera.getWorldQuaternion(this.rotation)
  for(const p of this.records){
   if(!p.active)continue
   const t=p.age/p.life;this.object.position.copy(p.origin).addScaledVector(p.velocity,p.age);this.object.position.y-=2.5*p.age*p.age
   if(this.object.position.y<p.floor-.2){p.active=false;continue}
   // Keep the actual aiming point clear, even when a foreground fragment
   // happens to cross it. Other sprites stay depth-tested in world space.
   this.toward.copy(this.object.position).project(camera)
   const radius=Math.hypot((this.toward.x*.5+.5-focus.x)*camera.aspect,this.toward.y*.5+.5-focus.y)
   const guard=Math.min(1,Math.max(0,(radius-.065)/.055))
   let angle=p.spin+p.age*(p.kind?3:.2)
   if(p.kind===2){this.toward.set(p.velocity.x,p.velocity.y-5*p.age,p.velocity.z).transformDirection(camera.matrixWorldInverse);angle=Math.atan2(this.toward.y,this.toward.x)-Math.PI*.5}
   this.object.quaternion.copy(this.rotation);this.object.rotateZ(angle)
   const size=p.size*(p.kind?1:1+t*1.4);this.object.scale.set(size*(p.kind===2?.22:p.kind?.5:1.3),size*(p.kind===2?3:1),1);this.object.updateMatrix();this.mesh.setMatrixAt(n,this.object.matrix)
   const fade=Math.min(1,(p.age+.012)*35)*(1-t)**2*guard
   this.colors.setXYZW(n,p.color.r,p.color.g,p.color.b,p.opacity*fade);this.shapes.setX(n,p.kind);n++
  }
  this.mesh.count=n;if(n){this.mesh.instanceMatrix.needsUpdate=true;this.colors.needsUpdate=true;this.shapes.needsUpdate=true}
 }
 clear(){for(const p of this.records)p.active=false;this.mesh.count=0}
 dispose(){this.mesh.removeFromParent();this.geometry.dispose();this.material.dispose()}
}
