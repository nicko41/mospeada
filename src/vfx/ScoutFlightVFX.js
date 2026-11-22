import {AdditiveBlending,Color,DataTexture,DynamicDrawUsage,Group,InstancedMesh,LinearFilter,MeshBasicMaterial,Object3D,PlaneGeometry,Vector3} from 'three'
import {DustTrail} from './DustTrail.js'
import {DESERT_WHEEL_FX} from '../world/forest/forestWheelFX.js'
import {SCOUT_ASSET} from '../world/forest/invidScoutAsset.js'

export const SCOUT_FLIGHT_FX=Object.freeze({particles:192,emitters:8,glows:35,maxHeight:6.5,maxDistance:110,sizeScale:3,haloSize:4.6,coreSize:2.08})
const axis=new Vector3(0,0,1),back=new Vector3(0,0,-1),clamp=n=>Math.max(0,Math.min(1,n))
const engine=new Vector3().fromArray(SCOUT_ASSET.thruster)
function glowTexture(){
 const size=64,data=new Uint8Array(size*size*4)
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const r=Math.hypot((x+.5)/size*2-1,(y+.5)/size*2-1),i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.round(clamp(1-r)**2*255)}
 const map=new DataTexture(data,size,size);map.minFilter=map.magFilter=LinearFilter;map.generateMipmaps=false;map.needsUpdate=true;return map
}
export class ScoutFlightVFX{
 constructor({shared,sampleGround=()=>-Infinity}={}){
  this.root=new Group();this.root.name='Scout_flight_ignition';this.root.userData.prewarmVFX=true;this.sampleGround=sampleGround
  this.dust=new DustTrail({shared});this.systems=this.dust.systems;this.dust.system.emitter.name='Quarks_Scout_low_flight_ground_dust'
  this.floorY=0
  const contact=this.dust.system.behaviors.shift(),initialize=contact.initialize,update=contact.update
  contact.initialize=p=>{initialize.call(contact,p);p.dustFloor=this.floorY+.06;p.position.y=Math.max(p.position.y,p.dustFloor)}
  contact.update=(p,dt)=>{if(dt>0)update.call(contact,p,dt)}
  // Clamp after the size envelope, so pausing cannot lift a grown puff by a
  // deferred frame of ground correction.
  this.dust.system.behaviors.push(contact)
  this.dust.system.emissionState.waitEmiting=SCOUT_FLIGHT_FX.particles;this.dust.system.emitter.updateMatrixWorld(true);this.dust.system.emit(0,this.dust.system.emissionState,this.dust.system.emitter.matrixWorld);this.dust.system.restart();this.dust.stopEmission()
  this.map=glowTexture();this.geometry=new PlaneGeometry();this.haloMaterial=new MeshBasicMaterial({map:this.map,transparent:true,blending:AdditiveBlending,depthTest:true,depthWrite:false,toneMapped:false,fog:false});this.coreMaterial=this.haloMaterial.clone()
  this.halos=this.mesh(this.haloMaterial,'Scout_pink_rear_ignition_halos');this.cores=this.mesh(this.coreMaterial,'Scout_white_rear_ignition_cores')
  this.object=new Object3D();this.point=new Vector3();this.normal=new Vector3();this.toCamera=new Vector3();this.tint=new Color();this.pink=new Color('#ff4e8b');this.white=new Color('#fff4ea')
  this.palettes={desert:[new Color(DESERT_WHEEL_FX.dustPalette.low),new Color(DESERT_WHEEL_FX.dustPalette.high)],forest:[new Color('#8f8062'),new Color('#b4a080')]};this.contact={}
  this.candidates=Array.from({length:SCOUT_FLIGHT_FX.emitters},()=>({scout:null,rank:Infinity}));this.credits=new WeakMap();this.clock=0;this.frame=0;this.state=null
  this.stats={particles:0,emitters:0,ignitions:0,groundQueries:0,sizeScale:SCOUT_FLIGHT_FX.sizeScale}
 }
 mesh(material,name){const m=new InstancedMesh(this.geometry,material,SCOUT_FLIGHT_FX.glows);m.count=0;m.name=name;m.frustumCulled=false;m.renderOrder=6;m.instanceMatrix.setUsage(DynamicDrawUsage);for(let i=0;i<SCOUT_FLIGHT_FX.glows;i++)m.setColorAt(i,new Color());this.root.add(m);return m}
 configureBatches(renderer){this.dust.configureBatches(renderer)}
 flying(scout){return !scout.dead&&scout.view?.root.visible&&scout.view.motion&&['flight','rising','descending'].includes(scout.mode)}
 prepare(dt,patrol,camera,config,day,state){
  if(this.state!==state){this.clear();this.state=state}
  this.stats.emitters=this.stats.groundQueries=0;this.dust.day.value=day;this.enabled=config.enabled&&config.earthEnabled!==false;dt=Math.max(0,Math.min(.1,dt));this.clock+=dt
  if(!dt||!config.enabled||config.earthEnabled===false){this.stats.particles=this.dust.system.particleNum;return}
  for(const r of this.candidates){r.scout=null;r.rank=Infinity}
  for(const scout of patrol?.scouts||[]){
   if(!this.flying(scout))continue
   const distance=camera.position.distanceToSquared(scout.position);if(distance>SCOUT_FLIGHT_FX.maxDistance**2)continue
   const rank=distance*(scout.focus==='rand'?.65:1)
   for(let i=0;i<this.candidates.length;i++)if(rank<this.candidates[i].rank){for(let j=this.candidates.length-1;j>i;j--){this.candidates[j].scout=this.candidates[j-1].scout;this.candidates[j].rank=this.candidates[j-1].rank}this.candidates[i].scout=scout;this.candidates[i].rank=rank;break}
  }
  const start=this.frame++%this.candidates.length,ps=this.dust.system
  for(let n=0;n<this.candidates.length;n++){
   const scout=this.candidates[(start+n)%this.candidates.length].scout;if(!scout)continue
   const speed=Math.hypot(scout.velocity.x,scout.velocity.z),trail=Math.min(1.6,speed*.06),vx=speed>1?scout.velocity.x/speed:Math.sin(scout.yaw),vz=speed>1?scout.velocity.z/speed:Math.cos(scout.yaw),x=scout.position.x-vx*trail,z=scout.position.z-vz*trail
   const floor=this.sampleGround(x,z,this.contact);this.stats.groundQueries++
   const height=scout.position.y-floor;if(!Number.isFinite(floor)||height<-.2||height>=SCOUT_FLIGHT_FX.maxHeight)continue
   const strength=clamp((SCOUT_FLIGHT_FX.maxHeight-height)/3.5)*clamp((SCOUT_FLIGHT_FX.maxDistance-Math.sqrt(camera.position.distanceToSquared(scout.position)))/35)
   if(strength<.02)continue
   this.stats.emitters++;const desert=this.contact.biome==='desert'
   let credit=this.credits.get(scout)||0;credit=Math.min(3,credit+dt*(12+Math.min(speed,35)*.22)*strength*(desert?1.3:1));const count=Math.min(Math.floor(credit),Math.max(0,SCOUT_FLIGHT_FX.particles-ps.particleNum));this.credits.set(scout,credit-count);if(!count)continue
   const hx=this.sampleGround(x+.7,z),hz=this.sampleGround(x,z+.7);this.stats.groundQueries+=2
   this.dust.normal.set(Number.isFinite(hx)?floor-hx:0,.7,Number.isFinite(hz)?floor-hz:0).normalize();this.dust.inertia.set(scout.velocity.x*.06,0,scout.velocity.z*.06)
   this.dust.direction.set(-vx*.35,1,-vz*.35).normalize();ps.emitter.position.set(x,floor+.06,z);ps.emitter.quaternion.setFromUnitVectors(axis,this.dust.direction);ps.emitter.updateWorldMatrix(true,false)
   const size=(desert?DESERT_WHEEL_FX.size:1.25)*SCOUT_FLIGHT_FX.sizeScale,palette=this.palettes[desert?'desert':'forest'],persistence=1+Math.min(speed,40)*.012,life=desert?DESERT_WHEEL_FX.life:1.05
   this.dust.size.a=.4*size;this.dust.size.b=.9*size;this.dust.life.a=1.5*life*persistence;this.dust.life.b=2.5*life*persistence
   this.dust.gravity.magnitude.value=desert?DESERT_WHEEL_FX.gravity:.65;this.dust.drag.dampen=(desert?DESERT_WHEEL_FX.drag:1.35)/20;this.dust.wind.magnitude.value=(desert?DESERT_WHEEL_FX.wind:.35)*.35
   const turbulence=desert?DESERT_WHEEL_FX.turbulence:.55;this.dust.turbulence.velocityMultiplier.set(turbulence,turbulence*.28,turbulence)
   this.dust.speed.a=1.3;this.dust.speed.b=2.5;this.dust.shape.radius=.45;this.dust.shape.angle=.8
   this.dust.colors.a.set(palette[0].r,palette[0].g,palette[0].b,(desert?DESERT_WHEEL_FX.dustPalette.lowOpacity:.30)*strength);this.dust.colors.b.set(palette[1].r,palette[1].g,palette[1].b,(desert?DESERT_WHEEL_FX.dustPalette.highOpacity:.48)*strength)
   this.floorY=floor;ps.emissionState.waitEmiting=count;ps.emit(0,ps.emissionState,ps.emitter.matrixWorld)
  }
  this.stats.particles=ps.particleNum
 }
 updateGlow(camera,patrol){
  this.halos.count=this.cores.count=0
  for(const scout of patrol?.scouts||[]){
   if(!this.flying(scout)||this.halos.count>=SCOUT_FLIGHT_FX.glows)continue
   const view=scout.view,mesh=view.levels[0],joint=view.motion.matrices[0];mesh.updateWorldMatrix(true,false)
   this.point.copy(engine).applyMatrix4(joint).applyMatrix4(mesh.matrixWorld);this.normal.copy(back).transformDirection(joint).transformDirection(mesh.matrixWorld);this.toCamera.subVectors(camera.position,this.point)
   const distance=this.toCamera.length();this.toCamera.divideScalar(Math.max(.001,distance));const facing=clamp((this.toCamera.dot(this.normal)+.05)/.6),fade=facing*clamp((175-distance)/45);if(fade<.01)continue
   const i=this.halos.count++,pulse=.93+.07*Math.sin(this.clock*26+scout.id*2.1),power=fade*pulse,sizePulse=1+.03*Math.sin(this.clock*9+scout.id*2.1)+.015*Math.sin(this.clock*14+scout.id)
   this.cores.count++;this.object.position.copy(this.point).addScaledVector(this.normal,.08);camera.getWorldQuaternion(this.object.quaternion);this.object.scale.setScalar(SCOUT_FLIGHT_FX.haloSize*sizePulse);this.object.updateMatrix();this.halos.setMatrixAt(i,this.object.matrix);this.halos.setColorAt(i,this.tint.copy(this.pink).multiplyScalar(power*1.5))
   this.object.position.addScaledVector(this.normal,.01);this.object.scale.setScalar(SCOUT_FLIGHT_FX.coreSize*sizePulse);this.object.updateMatrix();this.cores.setMatrixAt(i,this.object.matrix);this.cores.setColorAt(i,this.tint.copy(this.white).multiplyScalar(power*2.5))
  }
  for(const m of[this.halos,this.cores])if(m.count){m.instanceMatrix.needsUpdate=true;m.instanceColor.needsUpdate=true}
  this.stats.ignitions=this.halos.count;this.stats.particles=this.dust.system.particleNum
  // The bike controller hides its shared draw when both wheels are idle.
  // A live Scout wake must keep that same draw visible after the bike tick.
  if(this.enabled&&this.dust.system.particleNum>0&&this.dust.batch)this.dust.batch.visible=true
 }
 clear(){this.dust.clear();this.credits=new WeakMap();this.halos.count=this.cores.count=0;this.stats.particles=this.stats.emitters=this.stats.ignitions=0}
 dispose(){this.root.removeFromParent();this.dust.dispose();this.halos.dispose();this.cores.dispose();this.geometry.dispose();this.haloMaterial.dispose();this.coreMaterial.dispose();this.map.dispose()}
}
