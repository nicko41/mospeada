import {BufferGeometry,Color,DataTexture,DoubleSide,DynamicDrawUsage,Float32BufferAttribute,Group,InstancedBufferAttribute,InstancedMesh,LinearFilter,MeshBasicMaterial,Object3D,PlaneGeometry,Quaternion,Vector3} from 'three'
import {FOREST_STAGE2,stage2LipZ,stage2Void} from '../world/forest/forestStage2Config.js'
import {stage4Edge} from '../world/forest/forestStage4Config.js'
import {INVID_GROUND_ATLAS,explosionFrameRect} from './explosionAtlas.js'

export const AMBIENT_LIMITS=Object.freeze({motes:128,leaves:20,gusts:6,birds:24,radius:36})
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n)),hash=n=>{const v=Math.sin(n*127.1+31.7)*43758.5453;return v-Math.floor(v)}
const up=new Vector3(0,1,0),forward=new Vector3(0,0,1)
export function ambientBiome(state,contactBiome,world){
 if(world?.bound&&world.contains(state.x,state.z))return world.distance(state.z)>stage4Edge(state.x-world.position.x)?'desert':'forest'
 return contactBiome==='desert'?'desert':'forest'
}
function texture(leaf=false){
 const size=32,data=new Uint8Array(size*size*4)
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=(x+.5)/size*2-1,v=(y+.5)/size*2-1,r=leaf?Math.abs(u)*1.4+v*v:Math.hypot(u*1.2,v)
  const i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.round(255*clamp((1-r)*(leaf?8:1.8))**(leaf?1:1.7))
 }
 const map=new DataTexture(data,size,size);map.minFilter=map.magFilter=LinearFilter;map.generateMipmaps=false;map.needsUpdate=true;return map
}
function birdGeometry(){
 const g=new BufferGeometry()
 g.setAttribute('position',new Float32BufferAttribute([0,0,.22,-.85,0,-.2,-.23,0,-.27, 0,0,.22,.23,0,-.27,.85,0,-.2, -.065,0,-.35,.065,0,-.35,0,.035,.35],3));g.computeVertexNormals();return g
}
const record=i=>({id:i,position:new Vector3(),velocity:new Vector3(),age:Infinity,life:0,size:0,phase:hash(i+9)*Math.PI*2,biome:'forest'})

// Four fixed instance buffers and at most four ground probes when recycling.
// No entities, lights or changes to the shared combat particle budgets.
export class AmbientAtmosphere{
 constructor({sampleGround=()=>0,leafAtlas=null}={}){
  this.sampleGround=sampleGround;this.root=new Group();this.root.name='Biome_ambient_atmosphere';this.root.userData.prewarmVFX=true;this.systems=[]
  this.softTexture=texture();this.leafTexture=texture(true);this.plane=new PlaneGeometry(1,1);this.birdGeometry=birdGeometry()
  this.leafAtlas=leafAtlas
  this.timeUniform={value:0};this.motes=this.mesh(this.plane,this.softTexture,AMBIENT_LIMITS.motes,'Ambient_pollen_and_sand');this.leaves=this.mesh(this.plane,leafAtlas||this.leafTexture,AMBIENT_LIMITS.leaves,'Ambient_varied_floating_leaves',false,!!leafAtlas);this.gusts=this.mesh(this.plane,this.softTexture,AMBIENT_LIMITS.gusts,'Ambient_horizontal_gusts');this.birds=this.mesh(this.birdGeometry,null,AMBIENT_LIMITS.birds,'Ambient_bird_flocks',true)
  this.meshes=[this.motes,this.leaves,this.gusts,this.birds];this.motePool=Array.from({length:AMBIENT_LIMITS.motes},(_,i)=>record(i));this.leafPool=Array.from({length:AMBIENT_LIMITS.leaves},(_,i)=>record(i+100));this.gustPool=Array.from({length:AMBIENT_LIMITS.gusts},(_,i)=>record(i+200))
  this.flocks=Array.from({length:2},()=>({age:Infinity,life:0,position:new Vector3(),velocity:new Vector3(),count:0,special:false}))
  this.object=new Object3D();this.cameraQ=new Quaternion();this.spinQ=new Quaternion();this.actor=new Vector3();this.lastActor=new Vector3(Infinity,0,0);this.focus=new Vector3();this.view=new Vector3();this.point=new Vector3();this.wind=new Vector3(1,0,.22).normalize();this.right=new Vector3();this.cameraUp=new Vector3()
  this.pollenColor=new Color('#f9ffe9');this.sandColor=new Color('#ffe2ad');this.leafColor=new Color('#e1eabc');this.petalColor=new Color('#ffe8cf');this.birdColor=new Color('#263642')
  this.sequence=0;this.age=0;this.state=null;this.biome=null;this.frameTime=1/60;this.qualityScale=1;this.canyonTriggered=false;this.skyNext=12
  this.stats={motes:0,leaves:0,gusts:0,birds:0,active:0,biome:'forest',quality:1,canyonEvents:0,skyEvents:0}
 }
 mesh(geometry,map,count,name,bird=false,atlas=false){
  const g=geometry.clone();g.setAttribute('aAmbientOpacity',new InstancedBufferAttribute(new Float32Array(count),1).setUsage(DynamicDrawUsage));g.setAttribute('aAmbientPhase',new InstancedBufferAttribute(new Float32Array(count),1))
  if(atlas)g.setAttribute('aAmbientFrame',new InstancedBufferAttribute(new Float32Array(count*4),4).setUsage(DynamicDrawUsage))
  const material=new MeshBasicMaterial({map,transparent:true,depthWrite:false,toneMapped:false,fog:true,side:DoubleSide})
  material.onBeforeCompile=shader=>{
   shader.uniforms.uAmbientTime=this.timeUniform
   shader.vertexShader='attribute float aAmbientOpacity;attribute float aAmbientPhase;varying float vAmbientOpacity;uniform float uAmbientTime;\n'+shader.vertexShader
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvAmbientOpacity=aAmbientOpacity;'+(bird?'\ntransformed.y+=abs(position.x)*sin(uAmbientTime*8.5+aAmbientPhase)*.55;':''))
   if(atlas){shader.vertexShader='attribute vec4 aAmbientFrame;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nvMapUv=aAmbientFrame.xy+vMapUv*aAmbientFrame.zw;')}
   shader.fragmentShader='varying float vAmbientOpacity;\n'+shader.fragmentShader
   shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>','diffuseColor.a*=vAmbientOpacity;\n#include <alphatest_fragment>')
  }
  material.customProgramCacheKey=()=>`biome-ambient-v2/${bird}/${atlas}`
  const mesh=new InstancedMesh(g,material,count);mesh.name=name;mesh.frustumCulled=false;mesh.count=0;mesh.renderOrder=2;mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  for(let i=0;i<count;i++)mesh.setColorAt(i,new Color())
  this.root.add(mesh);return mesh
 }
 put(mesh,p,sx,sy,color,alpha,rotation=this.cameraQ,phase=0,frame=0,mirror=false){
  if(alpha<.005)return
  const i=mesh.count++;this.object.position.copy(p);this.object.quaternion.copy(rotation);this.object.scale.set(sx,sy,sx);this.object.updateMatrix();mesh.setMatrixAt(i,this.object.matrix);mesh.setColorAt(i,color);mesh.geometry.attributes.aAmbientOpacity.setX(i,alpha);mesh.geometry.attributes.aAmbientPhase.setX(i,phase)
  if(mesh.geometry.attributes.aAmbientFrame)mesh.geometry.attributes.aAmbientFrame.setXYZW(i,...explosionFrameRect(frame,mirror,INVID_GROUND_ATLAS))
 }
 reset(){
  for(const pool of [this.motePool,this.leafPool,this.gustPool])for(const p of pool)p.age=Infinity
  for(const f of this.flocks)f.age=Infinity
  this.canyonTriggered=false;this.age=0;this.skyNext=12
 }
 spawn(p,kind,biome,camera,initial=false){
  const seed=++this.sequence*23+p.id*7,depth=4+hash(seed+1)*23
  // Seed the visible air column, rather than a large disk mostly behind the
  // camera. Near and middle distance particles remain readable while riding.
  p.position.copy(camera.position).addScaledVector(this.view,depth).addScaledVector(this.right,(hash(seed)-.5)*depth*1.15)
  p.position.y+=camera.getWorldDirection(this.point).y*depth+(hash(seed+2)-.5)*depth*.48
  if(kind==='gust'){
   p.position.copy(this.actor).addScaledVector(this.view,14+hash(seed+1)*12).addScaledVector(this.right,(hash(seed+2)-.5)*24)
   p.position.y=camera.position.y-.4+hash(seed+4)*.8
  }
  const ground=this.groundQueries++<4?this.sampleGround(p.position.x,p.position.z):this.actor.y-.4
  if(Number.isFinite(ground))p.position.y=Math.max(ground+.35,p.position.y)
  p.biome=biome;p.life=kind==='gust'?3+hash(seed+3)*3:kind==='leaf'?10+hash(seed+3)*6:12+hash(seed+3)*12;p.age=initial?p.life*(.2+hash(seed+4)*.5):0
  p.size=kind==='leaf'?(this.leafAtlas?.5:.16)+hash(seed+5)*(this.leafAtlas?.65:.18):kind==='gust'?3+hash(seed+5)*4:biome==='desert'?.035+hash(seed+5)*.045:.025+hash(seed+5)*.04
  p.velocity.set(biome==='desert'?1.8+hash(seed+6)*1.8:.12+hash(seed+6)*.24,kind==='leaf'?-.14:biome==='desert'?0:.02+hash(seed+7)*.05,biome==='desert'?.3:.08)
  if(kind==='leaf'){p.velocity.copy(this.right).multiplyScalar(.65+hash(seed+6)*1.1);p.velocity.y=-.06-hash(seed+7)*.1}
  p.frameOffset=Math.floor(hash(seed+8)*12);p.frameRate=5+hash(seed+9)*5;p.mirror=hash(seed+10)>.5
 }
 outside(p,camera){return p.position.distanceToSquared(this.focus)>AMBIENT_LIMITS.radius**2||this.point.subVectors(p.position,camera.position).dot(this.view)<2}
 startFlock(special,s){
  const f=this.flocks[special?1:0];f.special=special;f.age=0;f.life=special?5:14;f.count=Math.max(3,Math.round((special?12:6)*this.qualityScale))
  if(special){f.position.set(s.x-12,s.height-10,Math.max(stage2LipZ(s.x,true)+20,s.z-64));f.velocity.set(24,0,-1.5);this.canyonTriggered=true;this.stats.canyonEvents++}
  else{f.position.set(this.actor.x-42,this.actor.y+56,this.actor.z-145);f.velocity.set(11,.12,2);this.stats.skyEvents++}
 }
 update(delta,camera,runtime,config,world=null){
  const s=runtime.state;if(!s)return
  const a=runtime.armorController?.active?runtime.armorController.state:null,p=s.dismountBlend>.8?s.pedestrian:null
  this.actor.set(a?.x??p?.x??s.x,a?.y??p?.ground??s.height,a?.z??p?.z??s.z)
  if(this.state!==s||this.actor.distanceToSquared(this.lastActor)>10000){this.reset();this.state=s}
  this.lastActor.copy(this.actor)
  const dt=runtime.paused?0:clamp(delta,0,.1);this.age+=dt;this.timeUniform.value=this.age
  this.groundQueries=0
  if(dt>0)this.frameTime+=(dt-this.frameTime)*(1-Math.exp(-dt*.8))
  const quality=config.quality==='low'?.35:config.quality==='medium'?.65:config.quality==='high'?1:this.frameTime>.055?.4:this.frameTime>.03?.65:1
  this.qualityScale+=(quality-this.qualityScale)*(1-Math.exp(-dt*2));if(config.quality!=='auto')this.qualityScale=quality
  const biome=ambientBiome(this.actor,runtime.weathering?.contacts?.wheels?.rear?.biome,world)
  const enabled=config.enabled&&(biome==='forest'?config.forestEnabled:config.desertEnabled),distance=clamp(1-this.actor.distanceTo(camera.position)/100),density=(biome==='forest'?config.forestDensity:config.desertDensity)*this.qualityScale*distance
  camera.getWorldQuaternion(this.cameraQ);camera.getWorldDirection(this.view);this.view.y=0;this.view.normalize();this.focus.copy(this.actor).addScaledVector(this.view,10)
  this.right.set(1,0,0).applyQuaternion(this.cameraQ);this.cameraUp.set(0,1,0).applyQuaternion(this.cameraQ);const windAngle=Math.atan2(this.wind.dot(this.cameraUp),this.wind.dot(this.right))
  for(const mesh of this.meshes)mesh.count=0
  const count=enabled&&(biome==='forest'?config.pollenEnabled:config.sandEnabled)?Math.min(AMBIENT_LIMITS.motes,Math.round(84*density)):0
  for(let i=0;i<count;i++){
   const r=this.motePool[i],initial=!Number.isFinite(r.age)
   if(initial||r.age>=r.life||r.biome!==biome||this.outside(r,camera))this.spawn(r,'mote',biome,camera,initial||r.biome!==biome)
   r.age+=dt;r.position.addScaledVector(r.velocity,dt)
   if(biome==='forest'){r.position.x+=Math.sin(this.age*.5+r.phase)*dt*.12;r.position.y+=Math.sin(this.age*.75+r.phase)*dt*.09;r.position.z+=Math.cos(this.age*.35+r.phase)*dt*.1}
   const fade=clamp(r.age/.9)*clamp((r.life-r.age)/1.5)*clamp((32-r.position.distanceTo(camera.position))/12)*clamp((r.position.distanceTo(camera.position)-1)/2)
   this.put(this.motes,r.position,r.size*(biome==='desert'?2.7:1),biome==='forest'?r.size:r.size*.3,biome==='forest'?this.pollenColor:this.sandColor,fade*(biome==='forest'?.5:.65))
  }
  for(const [pool,mesh,leaf]of [[this.leafPool,this.leaves,true],[this.gustPool,this.gusts,false]])for(let i=0;i<pool.length;i++){
   const r=pool[i],budget=Math.min(pool.length,Math.round((leaf?14:4)*density))
   if(!enabled||i>=budget||(leaf?biome!=='forest'||!config.leavesEnabled:biome!=='desert'||!config.gustsEnabled)){r.age=Infinity;continue}
   if(r.age>=r.life||r.biome!==biome||this.outside(r,camera))this.spawn(r,leaf?'leaf':'gust',biome,camera,true)
   r.age+=dt
   r.position.addScaledVector(r.velocity,dt*(leaf?1:2.5));if(leaf)r.position.x+=Math.sin(this.age*1.4+r.phase)*dt*.35
   this.spinQ.setFromAxisAngle(forward,leaf?r.phase+this.age*.6:windAngle).premultiply(this.cameraQ)
   const fade=Math.sin(Math.PI*clamp(r.age/r.life))*clamp((34-r.position.distanceTo(camera.position))/14)*distance
   const frame=(r.frameOffset+Math.floor(r.age*r.frameRate))%12
   this.put(mesh,r.position,r.size,leaf?r.size*(.72+.18*Math.sin(this.age*2+r.phase)):.18,leaf?(r.id%4?this.leafColor:this.petalColor):this.sandColor,fade*(leaf?.9:.32),this.spinQ,r.phase,frame,r.mirror)
  }
  if(dt>0&&enabled&&biome==='forest'&&config.skyBirdsEnabled&&this.age>=this.skyNext){this.startFlock(false,s);this.skyNext=this.age+24+hash(this.sequence++)*18}
  if(dt>0&&enabled&&biome==='forest'&&config.canyonBirdsEnabled&&!this.canyonTriggered&&s.airborne&&!a&&s.height>0&&stage2Void(s.x,s.z)&&s.z<FOREST_STAGE2.canyon.lipZ-1)this.startFlock(true,s)
  for(const f of this.flocks){
   if(f.age>=f.life)continue;f.age+=dt
   if(!enabled||biome!=='forest'||(f.special?!config.canyonBirdsEnabled:!config.skyBirdsEnabled)){f.age=Infinity;continue}
   const yaw=Math.atan2(f.velocity.x,f.velocity.z);this.spinQ.setFromAxisAngle(up,yaw)
   for(let i=0;i<f.count;i++){
    const rank=Math.ceil(i/2),side=i%2?1:-1
    this.point.copy(f.position).addScaledVector(f.velocity,f.age);this.point.x-=rank*1.3;this.point.z+=side*rank*1.65;this.point.y+=Math.sin(f.age*1.3+i)*.35+hash(i)*.6
    const far=this.point.distanceTo(camera.position),fade=clamp(f.age/.4)*clamp((f.life-f.age)/.8)*clamp((180-far)/35)
    this.put(this.birds,this.point,f.special?1.2:1.5,f.special?1.2:1.5,this.birdColor,fade,this.spinQ,i*2.37)
   }
  }
  this.root.visible=enabled
  for(const mesh of this.meshes)if(mesh.count){mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;mesh.geometry.attributes.aAmbientOpacity.needsUpdate=true;mesh.geometry.attributes.aAmbientPhase.needsUpdate=true;if(mesh.geometry.attributes.aAmbientFrame)mesh.geometry.attributes.aAmbientFrame.needsUpdate=true}
  Object.assign(this.stats,{motes:this.motes.count,leaves:this.leaves.count,gusts:this.gusts.count,birds:this.birds.count,active:this.motes.count+this.leaves.count+this.gusts.count+this.birds.count,biome,quality:this.qualityScale})
 }
 dispose(){this.root.removeFromParent();for(const mesh of this.meshes){mesh.dispose();mesh.geometry.dispose();mesh.material.dispose()}this.softTexture.dispose();this.leafTexture.dispose();this.plane.dispose();this.birdGeometry.dispose()}
}
