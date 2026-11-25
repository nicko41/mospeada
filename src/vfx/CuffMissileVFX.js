import {AdditiveBlending,DynamicDrawUsage,Group,InstancedMesh,Matrix4,Mesh,MeshBasicMaterial,Object3D,PlaneGeometry,Quaternion,Vector3} from 'three'
import {Bezier,ColorOverLife,ColorRange,ConstantValue,Gradient,IntervalValue,ParticleSystem,PiecewiseBezier,RenderMode,SizeOverLife,SphereEmitter,Vector3 as QVec3,Vector4 as QVec4} from 'three.quarks'
import {createSmokeAtlas} from './smokeAtlas.js'

export const MISSILE_SMOKE_LIMIT=384
export class CuffMissileVFX{
 constructor(){
  this.root=new Group();this.root.name='Scott_four_guided_cuff_missiles';this.root.userData.prewarmVFX=true;this.geometry=new PlaneGeometry();this.atlas=createSmokeAtlas(64);this.material=new MeshBasicMaterial({map:this.atlas,transparent:true,depthTest:true,depthWrite:false,toneMapped:false,fog:true})
  this.life=new IntervalValue(.9,1.5);this.size=new IntervalValue(.2,.35);this.speed=new IntervalValue(.12,.4);this.shape=new SphereEmitter({radius:.025})
  const ps=this.system=new ParticleSystem({duration:60,looping:true,prewarm:false,autoDestroy:false,worldSpace:true,shape:this.shape,startLife:this.life,startSpeed:this.speed,startSize:this.size,startRotation:new IntervalValue(-Math.PI,Math.PI),startTileIndex:new IntervalValue(0,4),startColor:new ColorRange(new QVec4(1,1,1,.95),new QVec4(1,1,1,1)),emissionOverTime:new ConstantValue(0),emissionOverDistance:new ConstantValue(0),emissionBursts:[],material:this.material,instancingGeometry:this.geometry,renderMode:RenderMode.BillBoard,uTileCount:2,vTileCount:2,renderOrder:7,behaviors:[new SizeOverLife(new PiecewiseBezier([[new Bezier(.9,1.7,2.8,3.8),0]])),new ColorOverLife(new Gradient([[new QVec3(1,1,1),0],[new QVec3(.9,.92,.96),1]],[[.9,0],[1,.08],[.65,.5],[0,1]]))]})
  ps.emitter.name='Quarks_white_cuff_launch_and_missile_wake';this.systems=[ps];ps.emissionState.waitEmiting=MISSILE_SMOKE_LIMIT;ps.emitter.updateMatrixWorld(true);ps.emit(0,ps.emissionState,ps.emitter.matrixWorld);ps.restart()
  this.glowMaterial=new MeshBasicMaterial({map:this.atlas,transparent:true,blending:AdditiveBlending,depthTest:true,depthWrite:false,color:'#ffe9a9',toneMapped:false})
  this.caps=[];this.launchers=null;this.clouds=Array.from({length:4},()=>({age:Infinity,launcher:null,credit:0}));this.cloudPoint=new Vector3();this.cloudDirection=new Vector3();this.glows=this.mesh(this.geometry,this.glowMaterial,'Cuff_missile_hot_exhaust');this.object=new Object3D();this.direction=new Vector3();this.rotation=new Quaternion();this.matrix=new Matrix4();this.emitted=0
 }
 bindLaunchers(launchers){
  if(this.launchers===launchers)return
  for(const cap of this.caps)cap.removeFromParent()
  this.launchers=launchers;this.caps=launchers.map((launcher,slot)=>{const cap=new Mesh(launcher.mesh.geometry,launcher.mesh.material);cap.name=`Detached_original_cuff_cap_${slot}`;cap.visible=false;cap.frustumCulled=false;cap.matrixAutoUpdate=false;cap.userData.animeHero=true;this.root.add(cap);return cap})
 }
 mesh(geometry,material,name){const mesh=new InstancedMesh(geometry,material,4);mesh.name=name;mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(DynamicDrawUsage);this.root.add(mesh);return mesh}
 configureBatches(renderer){this.batch=renderer.batches[renderer.systemToBatchIndex.get(this.system)]}
 startLaunch(slot,launcher,point,direction){const cloud=this.clouds[slot];cloud.age=0;cloud.launcher=launcher;cloud.credit=0;this.puff(point,direction,true)}
 puff(point,direction,launch=false,requested=null){
  const ps=this.system,count=Math.min(requested??(launch?34:1),MISSILE_SMOKE_LIMIT-ps.particleNum);if(count<=0)return
  this.life.a=launch?.75:.85;this.life.b=launch?1.25:1.45;this.size.a=launch?.5:.2;this.size.b=launch?.8:.32;this.speed.a=launch?.6:.12;this.speed.b=launch?1.6:.35;this.shape.radius=launch?.2:.015
  ps.emitter.position.copy(point);ps.emitter.updateMatrixWorld(true);const first=ps.particleNum;ps.emissionState.waitEmiting=count;ps.emit(0,ps.emissionState,ps.emitter.matrixWorld)
  for(let i=first;i<ps.particleNum;i++){const p=ps.particles[i];if(launch)p.velocity.addScaledVector(direction,-.6);p.velocity.y+=.16;for(const behavior of ps.behaviors)behavior.update(p,0)}this.emitted+=count
 }
 present(records,camera,dt=0){
  for(const cloud of this.clouds)if(cloud.age<.14&&dt>0){const step=Math.min(.14-cloud.age,dt);cloud.age+=step;cloud.credit+=step*65;const count=Math.floor(cloud.credit);cloud.credit-=count;if(count){const l=cloud.launcher;l.mesh.updateWorldMatrix(true,false);this.cloudPoint.copy(l.local).applyMatrix4(l.mesh.matrixWorld);this.cloudDirection.copy(l.normal).transformDirection(l.mesh.matrixWorld);this.puff(this.cloudPoint,this.cloudDirection,true,count)}}
  let count=0
  for(const cap of this.caps)cap.visible=false
  for(const r of records)if(r.active){this.direction.subVectors(r.position,r.previous);if(this.direction.lengthSq()<1e-6)this.direction.copy(r.heading);this.direction.normalize();const cap=this.caps[r.slot];if(cap){this.rotation.setFromUnitVectors(r.launchDirection,this.direction);cap.matrix.copy(r.launchMatrix).premultiply(this.matrix.makeTranslation(-r.launchOrigin.x,-r.launchOrigin.y,-r.launchOrigin.z)).premultiply(this.matrix.makeRotationFromQuaternion(this.rotation)).premultiply(this.matrix.makeTranslation(r.position.x,r.position.y,r.position.z));cap.matrixWorldNeedsUpdate=true;cap.visible=true}this.object.position.copy(r.position).addScaledVector(this.direction,-.05);camera.getWorldQuaternion(this.object.quaternion);this.object.scale.setScalar(.2);this.object.updateMatrix();this.glows.setMatrixAt(count++,this.object.matrix)}
  this.glows.count=count;if(count)this.glows.instanceMatrix.needsUpdate=true;this.batch?.update()
 }
 clear(){this.system.restart();for(const cloud of this.clouds){cloud.age=Infinity;cloud.launcher=null}for(const cap of this.caps)cap.visible=false;this.glows.count=0;this.batch?.update()}
 dispose(){this.root.removeFromParent();this.glows.dispose();for(const cap of this.caps)cap.removeFromParent();for(const resource of[this.geometry,this.atlas,this.material,this.glowMaterial])resource.dispose()}
}
