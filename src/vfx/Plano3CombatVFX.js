import {AdditiveBlending,BoxGeometry,CircleGeometry,Color,DataTexture,DoubleSide,DynamicDrawUsage,Group,InstancedMesh,LinearFilter,Matrix4,MeshBasicMaterial,Object3D,PlaneGeometry,Quaternion,Raycaster,SphereGeometry,Vector3} from 'three'
import {ApplyForce,Bezier,ColorOverLife,ColorRange,ConeEmitter,ConstantValue,Gradient,IntervalValue,ParticleSystem,PiecewiseBezier,RenderMode,SizeOverLife,SphereEmitter,Vector3 as QVec3,Vector4 as QVec4} from 'three.quarks'
import {CombatBursts} from './CombatBursts.js'
import {COMBAT_VFX_LIMITS,GALLANT_MUZZLE,SCOUT_CANNON} from './combatVFXPresets.js'
import {combatEnergyTexture} from './combatEnergyTextures.js'
import {SCOUT_SCORCH_SLOTS} from '../world/forest/scoutHitAppearance.js'
import {SurfaceImpactMarks} from './SurfaceImpactMarks.js'
import {SCOUT_ASSET} from '../world/forest/invidScoutAsset.js'
import {intersectScoutSurface} from '../world/forest/scoutSurfaceQuery.js'
import {InvidImpactDust} from './InvidImpactDust.js'
import {cameraImpactEvents} from '../rendering/cameraImpactEvents.js'
import {cinematicCombatEvents} from '../rendering/cinematicCombatEvents.js'
import {InvidOrbSprites} from './InvidOrbSprites.js'
import {InvidExplosionDebris} from './InvidExplosionDebris.js'

const rgba=hex=>{const c=new Color(hex);return new QVec4(c.r,c.g,c.b,1)}
const MathUtilsSmooth=t=>{const x=Math.max(0,Math.min(1,t));return x*x*(3-2*x)}
const colors={yellow:new Color('#ffd523'),white:new Color('#fffbe1'),purple:new Color('#bd36ff'),violetCore:new Color('#f5d8ff'),magenta:new Color('#f469ef')}
const bloodTarget=target=>!!target?.view?.motion&&!!target.view.levels?.[0]?.isSkinnedMesh
function energyTexture(blast=false){
  const size=64,data=new Uint8Array(size*size*4)
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=(x+.5)/size*2-1,v=(y+.5)/size*2-1,r=Math.hypot(u,v),angle=Math.atan2(v,u)
    const edge=blast?.72+.055*Math.sin(angle*7+.4)+.035*Math.cos(angle*11-.7):.35+.5*Math.pow(Math.abs(Math.cos(angle*4)),10)
    const a=Math.max(0,Math.min(1,(edge-r)*(blast?16:24)))
    const at=(y*size+x)*4;data[at]=data[at+1]=data[at+2]=255;data[at+3]=Math.round(a*255)
  }
  const texture=new DataTexture(data,size,size);texture.minFilter=texture.magFilter=LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;texture.name=blast?'Anime irregular energy blast':'Anime energy star';return texture
}

// Contact flashes and laser geometry are pooled; sparks use the game's shared
// Quarks registry, particle integration and renderer. No postprocessing/bloom.
export class Plano3CombatVFX{
  constructor({explosionAtlases={},invidOrbAtlas=null,sampleGround=null,impactScene=null,bloodRandom=Math.random,sharedDust=null}={}){
    this.root=new Group();this.root.name='Plano3_combat_energy';this.root.visible=false
    this.star=energyTexture();this.blast=energyTexture(true);this.plane=new PlaneGeometry(1,1);this.box=new BoxGeometry(1,1,1)
    this.muzzleTexture=combatEnergyTexture(true);this.fireballTexture=combatEnergyTexture()
    this.flashMaterial=new MeshBasicMaterial({map:this.muzzleTexture,transparent:true,depthWrite:false,toneMapped:false,blending:AdditiveBlending,fog:false})
    this.shellMaterial=new MeshBasicMaterial({transparent:true,depthWrite:false,toneMapped:false,opacity:.65})
    this.coreMaterial=new MeshBasicMaterial({transparent:true,depthWrite:false,toneMapped:false})
    this.traces=Array.from({length:16},()=>({from:new Vector3(),to:new Vector3(),age:0,life:0}))
    this.flashMesh=this.mesh(this.plane,this.flashMaterial,COMBAT_VFX_LIMITS.bursts*2+2,'Combat_flashes')
    // Contact overlays have their own depth rule. Keep the weapon's muzzle
    // material unchanged; an opaque Scout must not swallow its own hit flash.
    this.hitFlashMaterial=this.flashMaterial.clone();this.hitFlashMaterial.map=this.star;this.hitFlashMaterial.fog=true;this.hitFlashMaterial.depthTest=false
    this.contactFlashes=this.mesh(this.plane,this.hitFlashMaterial,COMBAT_VFX_LIMITS.bursts*2,'Scout_contact_flashes');this.contactFlashes.renderOrder=8
    this.sampleGround=sampleGround
    this.impacts=new CombatBursts(this.blast,this.plane,explosionAtlases,bloodRandom);this.root.add(this.impacts.root);this.presets=this.impacts.presets;this.lightingRoot=this.impacts.lightingRoot
    this.secondaryExplosion=new InvidExplosionDebris({sparkMap:this.impacts.haloTexture});this.root.add(this.secondaryExplosion.root)
    this.impactScene=impactScene;this.surfaceMarks=new SurfaceImpactMarks();this.lightingRoot.add(this.surfaceMarks.mesh);this.lightingRoot.userData.prewarmVFX=true
    this.muzzleHaloMaterial=new MeshBasicMaterial({map:this.impacts.haloTexture,transparent:true,depthWrite:false,toneMapped:false,blending:AdditiveBlending,fog:false})
    this.muzzleHalos=this.mesh(this.plane,this.muzzleHaloMaterial,1,'Gallant_muzzle_warm_flare');this.muzzleHalos.renderOrder=9;this.flashMesh.renderOrder=10
    // Opt in only these small pooled meshes to an invisible preparation draw.
    this.root.userData.prewarmVFX=true
    this.blastMesh=this.impacts.fire
    this.clock=0;this.visuals=new WeakMap();this.contactQuery=new Raycaster();this.contactPoint=new Vector3();this.contactNormal=new Vector3();this.contactHits=[]
    this.contactBindPoint=new Vector3();this.contactBindNormal=new Vector3();this.contactJoint=0;this.contactExact=false;this.contactMatrix=new Matrix4();this.contactScale=new Vector3()
    this.shell=this.mesh(this.box,this.shellMaterial,40,'Combat_laser_glow')
    this.core=this.mesh(this.box,this.coreMaterial,40,'Combat_laser_cores')
    this.orbSprites=new InvidOrbSprites({map:invidOrbAtlas||this.impacts.haloTexture,atlas:!!invidOrbAtlas});this.root.add(this.orbSprites.mesh)
    this.cannonGeometry=new CircleGeometry(1,20)
    this.cannonMaterial=new MeshBasicMaterial({color:'#ffffff',transparent:true,blending:AdditiveBlending,depthWrite:false,toneMapped:false,side:DoubleSide,fog:false})
    this.cannonHaloMaterial=new MeshBasicMaterial({map:this.impacts.haloTexture,transparent:true,depthWrite:false,toneMapped:false,blending:AdditiveBlending,fog:false})
    this.cannonFlashes=this.mesh(this.cannonGeometry,this.cannonMaterial,SCOUT_CANNON.capacity,'Scout_cannon_white_blinks')
    this.cannonHalos=this.mesh(this.plane,this.cannonHaloMaterial,SCOUT_CANNON.capacity,'Scout_cannon_lavender_halos');this.cannonFlashes.renderOrder=10;this.cannonHalos.renderOrder=9
    // Projectile and muzzle colours are pure authored energy colours, without
    // the warm per-instance tint used by the existing Gallant hit flashes.
    for(const mesh of [this.cannonFlashes,this.cannonHalos])for(let i=0;i<mesh.instanceMatrix.count;i++)mesh.setColorAt(i,new Color('#ffffff'))
    this.object=new Object3D();this.axis=new Vector3(0,0,1);this.direction=new Vector3();this.start=new Vector3();this.end=new Vector3();this.point=new Vector3();this.tint=new Color();this.cameraRotation=new Quaternion();this.muzzleLife=0;this.previousTime=0;this.hasEffects=false
    this.stats={shots:0,hits:0,explosions:0};this.systems=[]
    this.sparkMaterial=new MeshBasicMaterial({map:this.star,transparent:true,depthTest:false,depthWrite:false,toneMapped:false})
    // World-space destruction layers respect opaque characters, armour and
    // terrain. Additive blending must not paint through Scott's silhouette.
    this.deathSparkMaterial=new MeshBasicMaterial({map:this.blast,transparent:true,depthTest:true,depthWrite:false,toneMapped:false,blending:AdditiveBlending,fog:false})
    for(const death of [false,true]){
      const ps=new ParticleSystem({duration:60,looping:true,prewarm:false,autoDestroy:false,worldSpace:true,
        shape:death?new SphereEmitter({radius:.2}):new ConeEmitter({radius:.025,angle:.9}),startLife:new IntervalValue(death?.3:.12,death?.7:.25),startSpeed:new IntervalValue(death?2.5:1.2,death?5:3),startSize:new IntervalValue(death?.09:.045,death?.2:.1),
        startRotation:new IntervalValue(-Math.PI,Math.PI),startColor:new ColorRange(rgba(death?'#fff0a0':'#fff7c2'),rgba(death?'#ff7d28':'#bc68ff')),
        emissionOverTime:new ConstantValue(0),emissionOverDistance:new ConstantValue(0),emissionBursts:[],material:death?this.deathSparkMaterial:this.sparkMaterial,instancingGeometry:this.plane,renderMode:RenderMode.StretchedBillBoard,
        rendererEmitterSettings:{speedFactor:death?.55:.025,lengthFactor:death?1.5:.16},renderOrder:death?10:6,
        behaviors:[new ApplyForce(new QVec3(0,-1,0),new ConstantValue(3)),new ColorOverLife(new Gradient(death?[[new QVec3(1,1,.9),0],[new QVec3(1,.85,.3),.7],[new QVec3(1,.25,.03),1]]:[[new QVec3(1,1,1),0],[new QVec3(1,.7,1),1]],death?[[1,0],[1,.7],[0,1]]:[[1,0],[1,.18],[0,1]]))]})
      ps.emitter.name=death?'Quarks_drone_destruction':'Quarks_drone_hits'
      // Reserve Quarks' reusable particles while loading, not on first impact.
      ps.emissionState.waitEmiting=death?COMBAT_VFX_LIMITS.sparksPerExplosion:COMBAT_VFX_LIMITS.sparksPerHit;ps.emit(0,ps.emissionState,ps.emitter.matrixWorld);ps.restart();this.systems.push(ps)
    }
    // These layers reuse the existing soft halo/smoke textures, plane and
    // Quarks renderer. Fixed pools are prepared now, never on an enemy's death.
    this.deathFlashMaterial=new MeshBasicMaterial({map:this.impacts.haloTexture,transparent:true,depthTest:true,depthWrite:false,toneMapped:false,blending:AdditiveBlending,fog:false})
    this.deathSmokeMaterial=new MeshBasicMaterial({map:this.impacts.smokeBallTexture,transparent:true,depthWrite:false,toneMapped:false,fog:false})
    for(const smoke of [false,true]){
      const ps=new ParticleSystem({duration:60,looping:true,prewarm:false,autoDestroy:false,worldSpace:true,
        shape:new SphereEmitter({radius:smoke?1.15:.12}),startLife:new IntervalValue(smoke?1.35:.32,smoke?1.9:.5),startSpeed:new IntervalValue(smoke?1.4:0,smoke?2.8:.3),startSize:new IntervalValue(smoke?2.1:8,smoke?3:10),
        startRotation:new IntervalValue(-Math.PI,Math.PI),startColor:new ColorRange(rgba(smoke?'#39343b':'#fff5cd'),rgba(smoke?'#25262e':'#ff842b')),
        emissionOverTime:new ConstantValue(0),emissionOverDistance:new ConstantValue(0),emissionBursts:[],material:smoke?this.deathSmokeMaterial:this.deathFlashMaterial,instancingGeometry:this.plane,renderMode:RenderMode.BillBoard,renderOrder:smoke?7:8,
        behaviors:[new SizeOverLife(new PiecewiseBezier([[new Bezier(smoke?.65:.8,smoke?1.3:1.15,smoke?1.8:1.3,smoke?2.2:1.4),0]])),
          new ColorOverLife(new Gradient(smoke?[[new QVec3(1,1,1),0],[new QVec3(.5,.48,.52),1]]:[[new QVec3(1,1,1),0],[new QVec3(1,.3,.05),1]],smoke?[[0,0],[0,.06],[.65,.25],[.7,.55],[0,1]]:[[1,0],[.85,.4],[0,1]])),
          new ApplyForce(new QVec3(0,smoke?1:0,0),new ConstantValue(smoke?.85:0))]})
      ps.emitter.name=smoke?'Quarks_Invid_black_smoke':'Quarks_Invid_hot_halo'
      ps.emissionState.waitEmiting=smoke?COMBAT_VFX_LIMITS.deathSmoke:COMBAT_VFX_LIMITS.deathFlashes;ps.emit(0,ps.emissionState,ps.emitter.matrixWorld);ps.restart();this.systems.push(ps)
    }
    this.fireballMaterial=new MeshBasicMaterial({map:this.fireballTexture,transparent:true,depthTest:true,depthWrite:false,toneMapped:false,blending:AdditiveBlending,fog:false})
    this.muzzleSparkMaterial=new MeshBasicMaterial({map:this.impacts.haloTexture,transparent:true,depthWrite:false,toneMapped:false,blending:AdditiveBlending,fog:false})
    for(const muzzle of [false,true]){
      const ps=new ParticleSystem({duration:60,looping:true,prewarm:false,autoDestroy:false,worldSpace:true,
        shape:muzzle?new ConeEmitter({radius:.008,angle:.3}):new SphereEmitter({radius:.24}),
        startLife:new IntervalValue(muzzle?.045:.42,muzzle?.095:.62),startSpeed:new IntervalValue(muzzle?2.5:2.5,muzzle?4:5),startSize:new IntervalValue(muzzle?.025:3.8,muzzle?.045:4.8),startRotation:new IntervalValue(-Math.PI,Math.PI),
        startColor:new ColorRange(rgba('#fff8d4'),rgba('#fff0aa')),emissionOverTime:new ConstantValue(0),emissionOverDistance:new ConstantValue(0),emissionBursts:[],material:muzzle?this.muzzleSparkMaterial:this.fireballMaterial,instancingGeometry:this.plane,renderMode:muzzle?RenderMode.StretchedBillBoard:RenderMode.BillBoard,renderOrder:muzzle?10:9,
        rendererEmitterSettings:{speedFactor:muzzle?.4:.025,lengthFactor:muzzle?1.2:.04},
        behaviors:[new SizeOverLife(new PiecewiseBezier([[new Bezier(.6,1.2,1.45,muzzle?.2:.8),0]])),new ColorOverLife(new Gradient([[new QVec3(1,1,1),0],[new QVec3(1,1,.85),.4],[new QVec3(1,.6,.2),.7],[new QVec3(.8,.12,.015),1]],[[1,0],[1,.25],[.75,.6],[0,1]]))]})
      ps.emitter.name=muzzle?'Quarks_Gallant_muzzle_sparks':'Quarks_Invid_fireball'
      ps.emissionState.waitEmiting=muzzle?COMBAT_VFX_LIMITS.muzzleSparks:COMBAT_VFX_LIMITS.deathFireballs;ps.emit(0,ps.emissionState,ps.emitter.matrixWorld);ps.restart();this.systems.push(ps)
    }
    // Real mesh particles supply a three-dimensional hot mass. Textured flame
    // lobes, smoke and the original anime sheet wrap this expanding core.
    this.volumeGeometry=new SphereGeometry(1,12,8)
    this.volumeMaterial=new MeshBasicMaterial({transparent:true,depthWrite:false,toneMapped:false,blending:AdditiveBlending,fog:false})
    const volume=new ParticleSystem({duration:60,looping:true,prewarm:false,autoDestroy:false,worldSpace:true,shape:new SphereEmitter({radius:.9}),
      startLife:new IntervalValue(.32,.48),startSpeed:new IntervalValue(2.2,4),startSize:new IntervalValue(1.4,1.8),startRotation:new IntervalValue(-Math.PI,Math.PI),startColor:new ColorRange(rgba('#fff5c8'),rgba('#ffb539')),
      emissionOverTime:new ConstantValue(0),emissionOverDistance:new ConstantValue(0),emissionBursts:[],material:this.volumeMaterial,instancingGeometry:this.volumeGeometry,renderMode:RenderMode.Mesh,renderOrder:5,
      behaviors:[new SizeOverLife(new PiecewiseBezier([[new Bezier(.6,1.5,1.8,.4),0]])),new ColorOverLife(new Gradient([[new QVec3(1,1,1),0],[new QVec3(1,.7,.25),.5],[new QVec3(1,.08,.01),1]],[[.7,0],[.65,.4],[0,1]]))]})
    volume.emitter.name='Quarks_Invid_expanding_fire_volume';volume.emissionState.waitEmiting=COMBAT_VFX_LIMITS.deathVolumes;volume.emit(0,volume.emissionState,volume.emitter.matrixWorld);volume.restart();this.systems.push(volume)
    this.impactDust=new InvidImpactDust(sharedDust,sampleGround);this.systems.push(...this.impactDust.systems)
  }
  mesh(geometry,material,capacity,name){const m=new InstancedMesh(geometry,material,capacity);m.name=name;m.count=0;m.instanceMatrix.setUsage(DynamicDrawUsage);for(let i=0;i<capacity;i++)m.setColorAt(i,colors.white);m.frustumCulled=false;m.castShadow=false;m.renderOrder=5;this.root.add(m);return m}
  configureBatches(renderer){
    this.impactDust.configureBatches(renderer)
    this.systemBatches=this.systems.map(ps=>renderer.batches[renderer.systemToBatchIndex.get(ps)]);this.batches=new Set(this.systemBatches)
    for(const batch of this.batches)if(batch!==this.impactDust.dust.batch)batch.material.toneMapped=false
  }
  uploadBirths(...indices){for(const i of indices)this.systemBatches?.[i]?.update()}
  emitParticles(system,point,count,capacity){
    system.emitter.position.copy(point);system.emitter.updateWorldMatrix(true,false)
    const first=system.particleNum
    system.emissionState.waitEmiting=Math.min(count,Math.max(0,capacity-first));system.emit(0,system.emissionState,system.emitter.matrixWorld)
    // Evaluate birth colour/size without integrating time. In particular the
    // delayed black smoke must not draw opaque on the ignition frame.
    for(let i=first;i<system.particleNum;i++)for(const behavior of system.behaviors)behavior.update(system.particles[i],0)
  }
  emit(point,death,normal=null,name=death?'invidExplosion':'invidHit',scale=1,context={}){
    if(death&&context.cameraShake!==false)cinematicCombatEvents.emit('explosion',point,{strength:scale,style:'biomechanical'})
    if(death)cameraImpactEvents.emit(context.cameraShake===false?'environmentExplosion':'explosion',point,scale,context.cameraShakeScale)
    if(death){this.emitDeathEnergy(point,scale);this.hasEffects=true;return this.impacts.spawn(name,point,normal,scale,context)}
    if(name==='invidHit'||name==='gallantImpact'){this.hasEffects=true;return this.impacts.spawn(name,point,normal,scale,context)}
    const preset=this.presets[name],ps=this.systems[death?1:0],limit=death?COMBAT_VFX_LIMITS.sparksPerExplosion:COMBAT_VFX_LIMITS.sparksPerHit
    const count=Math.min(Math.max(0,Math.floor(preset.particles*preset.sparks)),Math.max(0,limit-ps.particleNum))
    const factor=scale*preset.size/(death?2.7:.75),intensity=Math.max(0,Math.min(3,preset.intensity))
    this.tint.set(preset.core);ps.startColor.a.set(this.tint.r*intensity,this.tint.g*intensity,this.tint.b*intensity,1)
    this.tint.set(death?preset.edge:preset.residual);ps.startColor.b.set(this.tint.r*intensity,this.tint.g*intensity,this.tint.b*intensity,1)
    ps.startSize.a=(death?.035:.045)*factor;ps.startSize.b=(death?.07:.1)*factor
    ps.startSpeed.a=(death?2.5:1.2)*Math.sqrt(factor);ps.startSpeed.b=(death?5:3)*Math.sqrt(factor)
    ps.startLife.a=preset.duration*(death?.26:.5);ps.startLife.b=preset.duration*(death?.61:1)
    ps.emitter.position.copy(point);if(normal&&normal.lengthSq()>.01)ps.emitter.quaternion.setFromUnitVectors(this.axis,this.direction.copy(normal).normalize())
    ps.emitter.updateWorldMatrix(true,false);ps.emissionState.waitEmiting=count;ps.emit(0,ps.emissionState,ps.emitter.matrixWorld)
    this.uploadBirths(0);this.hasEffects=true;return this.impacts.spawn(name,point,normal,scale,context)
  }
  emitDeathEnergy(point,scale){
    const preset=this.presets.invidExplosion,factor=Math.max(.15,Math.min(1.6,scale*preset.size/2.7)),power=Math.max(0,Math.min(3,preset.intensity)),ps=this.systems[1]
    this.secondaryExplosion.burst(point,factor,preset)
    this.tint.set(preset.core).multiplyScalar(power);ps.startColor.a.set(this.tint.r,this.tint.g,this.tint.b,1)
    this.tint.set(preset.edge).multiplyScalar(power);ps.startColor.b.set(this.tint.r,this.tint.g,this.tint.b,1)
    // Outward hot ejecta and fast, short-lived fragments share one fixed pool.
    ps.emitterShape.radius=.25*factor;ps.startSize.a=.18*factor;ps.startSize.b=.32*factor
    ps.startSpeed.a=7*Math.sqrt(factor);ps.startSpeed.b=12*Math.sqrt(factor);ps.startLife.a=.18;ps.startLife.b=.3
    this.emitParticles(ps,point,COMBAT_VFX_LIMITS.energyPerExplosion,COMBAT_VFX_LIMITS.sparksPerExplosion)
    this.tint.set('#fff6bb').multiplyScalar(power*2);ps.startColor.a.set(this.tint.r,this.tint.g,this.tint.b,1)
    this.tint.set('#ffca4a').multiplyScalar(power*2);ps.startColor.b.set(this.tint.r,this.tint.g,this.tint.b,1)
    ps.startSize.a=.09*factor;ps.startSize.b=.16*factor;ps.startSpeed.a=5;ps.startSpeed.b=10;ps.startLife.a=.4;ps.startLife.b=.65
    this.emitParticles(ps,point,Math.max(0,Math.floor(preset.particles*preset.sparks)),COMBAT_VFX_LIMITS.sparksPerExplosion)
    const flash=this.systems[2],smoke=this.systems[3],fireball=this.systems[4]
    flash.startSize.a=8*factor;flash.startSize.b=10*factor;flash.startLife.a=.32;flash.startLife.b=.48
    this.tint.set('#fff8dc');flash.startColor.a.set(this.tint.r,this.tint.g,this.tint.b,.38*power)
    this.tint.set('#ffb94f');flash.startColor.b.set(this.tint.r,this.tint.g,this.tint.b,.45*power)
    this.emitParticles(flash,point,2,COMBAT_VFX_LIMITS.deathFlashes)
    // Broad hot spill encloses the entire Scout rather than only its centre.
    flash.startSize.a=11*factor;flash.startSize.b=13*factor;flash.startLife.a=.42;flash.startLife.b=.58
    this.tint.set('#ff9b45');flash.startColor.a.set(this.tint.r,this.tint.g,this.tint.b,.65*power)
    this.tint.set('#f26824');flash.startColor.b.set(this.tint.r,this.tint.g,this.tint.b,.4*power)
    this.emitParticles(flash,point,1,COMBAT_VFX_LIMITS.deathFlashes)
    fireball.startSize.a=3.8*factor;fireball.startSize.b=4.8*factor;fireball.emitterShape.radius=.8*factor
    fireball.startColor.a.set(1.6*power,1.6*power,1.4*power,1);fireball.startColor.b.set(1.3*power,1.1*power,.8*power,1)
    this.emitParticles(fireball,point,2,COMBAT_VFX_LIMITS.deathFireballs)
    // A white-hot centre surrounded by orange/red flame lobes, rather than
    // nine overlapping white particles washing away the anime silhouettes.
    this.tint.set('#ff8422').multiplyScalar(power*1.2);fireball.startColor.a.set(this.tint.r,this.tint.g,this.tint.b,1)
    this.tint.set('#f3390b').multiplyScalar(power*1.3);fireball.startColor.b.set(this.tint.r,this.tint.g,this.tint.b,1)
    this.emitParticles(fireball,point,7,COMBAT_VFX_LIMITS.deathFireballs)
    const volume=this.systems[6];volume.startSize.a=1.4*factor;volume.startSize.b=1.8*factor;volume.emitterShape.radius=.9*factor
    this.emitParticles(volume,point,4,COMBAT_VFX_LIMITS.deathVolumes)
    smoke.startSize.a=2.1*factor;smoke.startSize.b=3*factor;smoke.emitterShape.radius=1.15*factor
    smoke.startColor.a.w=smoke.startColor.b.w=power
    this.emitParticles(smoke,point,16,COMBAT_VFX_LIMITS.deathSmoke)
    // Gallant shots are emitted after the shared simulation tick. Upload the
    // newborn particles now without advancing time: they must draw this frame.
    this.uploadBirths(1,2,3,4,6)
  }
  enemyImpact(point,velocity=null){cinematicCombatEvents.emit('blast',point,{direction:velocity,style:'energy'});this.contactNormal.copy(velocity||this.axis).normalize().negate();this.emit(point,false,this.contactNormal,'invidLaserImpact')}
  clawGroundImpact(point){
    cinematicCombatEvents.emit('ground',point,{strength:.7,style:'earth'})
    this.contactNormal.set(0,1,0);this.hasEffects=true
    this.impacts.spawn('invidClawImpact',point,this.contactNormal,1,{grounded:true,groundY:point.y})
    this.impactDust.burst(point)
  }
  enemyWorldImpact(point,velocity=null){
    const ground=this.sampleGround?.(point.x,point.z)
    if(Number.isFinite(ground)&&Math.abs(point.y-ground)>.8){this.enemyImpact(point,velocity);return}
    cinematicCombatEvents.emit('ground',point,{direction:velocity,style:'earth'})
    this.contactNormal.set(0,1,0);this.hasEffects=true
    this.impacts.spawn('invidGroundImpact',point,this.contactNormal,1,{grounded:true,groundY:point.y})
    this.impactDust.burst(point)
  }
  visualFor(target){
    let v=this.visuals.get(target)
    if(!v){v={hitAt:-Infinity,hitSeen:target.hitVersion||0,deathAt:Infinity,dead:false,normal:new Vector3(0,0,1),recoil:new Vector3(),tint:new Color(),visible:true,scorchCursor:0,scorches:Array.from({length:SCOUT_SCORCH_SLOTS},()=>({position:new Vector3(),normal:new Vector3(0,0,1),radius:0,heat:0,at:-Infinity,record:null,seed:0}))};this.visuals.set(target,v)}
    if(!target.dead&&(v.dead||(target.hitVersion||0)<v.hitSeen)){v.dead=false;v.deathAt=Infinity;v.hitAt=-Infinity;v.hitSeen=target.hitVersion||0;v.scorchCursor=0;for(const mark of v.scorches)mark.radius=mark.heat=0}
    return v
  }
  destroyTarget(target){
    const v=this.visualFor(target);if(v.dead)return
    v.dead=true;v.deathAt=this.clock;v.hitSeen=target.hitVersion||0;this.stats.explosions++
    target.view?.motion?.hitReaction.reset();target.view?.motion?.sync()
    const preset=this.presets.invidExplosion,groundY=this.sampleGround?.(target.position.x,target.position.z)
    const grounded=Number.isFinite(groundY)?target.position.y-groundY<=preset.groundGap:target.mode==='ground'||target.grounded===true
    this.point.copy(target.position);if(target.height)this.point.y+=target.height*preset.bodyOffset
    v.deathRecord=this.emit(this.point,true,null,'invidExplosion',target.height?target.height/5.2:.45,{groundY,grounded,...(target.cameraShakeScale!=null?{cameraShakeScale:target.cameraShakeScale}:{})});v.deathSeed=v.deathRecord?.seed
    if(bloodTarget(target)){
      const view=target.view,mesh=view.levels[0];this.direction.set(0,0,1)
      mesh.updateWorldMatrix(true,false);this.point.fromArray(SCOUT_ASSET.head)
      this.point.applyMatrix4(view.motion.matrices[0]);this.direction.transformDirection(view.motion.matrices[0])
      this.point.applyMatrix4(mesh.matrixWorld);this.direction.transformDirection(mesh.matrixWorld)
      mesh.getWorldScale(this.contactScale)
      this.impacts.spawnBlood(this.point,this.direction,target.height/5.2,true,null,SCOUT_ASSET.headWidth*Math.abs(this.contactScale.x))
    }
  }
  scoutVisual(target){
    const v=this.visualFor(target)
    if((target.hitVersion||0)!==v.hitSeen){v.hitSeen=target.hitVersion;v.hitAt=this.clock;this.point.copy(target.position);this.point.y+=(target.height||0)*.5;v.hitRecord=this.emit(this.point,false,v.normal,'invidHit');v.hitSeed=v.hitRecord?.seed;if(!target.dead&&bloodTarget(target))this.impacts.spawnBlood(this.point,v.normal,target.height/5.2)}
    if(target.dead&&!v.dead)this.destroyTarget(target)
    const elapsed=v.hitRecord&&v.hitRecord.seed===v.hitSeed?v.hitRecord.age:this.clock-v.hitAt,flash=Math.max(0,1-elapsed/this.presets.invidHit.duration)
    const deathAge=v.deathRecord&&v.deathRecord.seed===v.deathSeed?v.deathRecord.age:Math.max(0,this.clock-v.deathAt)
    v.visible=!v.dead||deathAge<this.presets.invidExplosion.hideDelay
    v.tint.setRGB(1,1,1)
    v.emissive=0;v.opacity=1
    for(const mark of v.scorches){const age=mark.record?.seed===mark.seed?mark.record.age:this.clock-mark.at;mark.heat=Math.max(0,1-age/.24)}
    if(v.dead){
      const preset=this.presets.invidExplosion
      v.emissive=deathAge<.12?6*(1-deathAge/.12)**.65:0
      v.opacity=1-MathUtilsSmooth((deathAge-preset.overlap)/preset.bodyFade)
    }
    if(target.view?.motion?.hitReaction)v.recoil.set(0,0,0)
    else v.recoil.copy(v.normal).multiplyScalar(-Math.sin(Math.min(1,elapsed/this.presets.invidHit.duration)*Math.PI)*.13*flash)
    return v
  }
  surfaceContact(target,from,point){
    this.contactPoint.copy(point);this.contactNormal.subVectors(from,point).normalize()
    this.contactExact=false;this.contactJoint=0
    if(!target?.view)return
    // Visual ray only: preserve generous gameplay bounds, damage and cadence.
    // Resolve the visible Scout skin so sparks leave its armour surface.
    const view=target.view,mesh=view.levels[view.lod||0];view.root.updateWorldMatrix(true,true)
    this.contactQuery.ray.set(from,this.direction.subVectors(point,from).normalize());this.contactQuery.near=0;this.contactQuery.far=from.distanceTo(point)+target.height+target.radius
    this.contactHits.length=0;intersectScoutSurface(view,this.contactQuery,this.contactHits)
    const contact=this.contactHits[0]
    if(contact){
      this.contactExact=true;this.contactPoint.copy(contact.point);this.contactNormal.copy(contact.face.normal).transformDirection(mesh.matrixWorld);if(this.contactNormal.dot(this.contactQuery.ray.direction)>0)this.contactNormal.negate()
      this.contactJoint=mesh.geometry.attributes.skinIndex?.getX(contact.face.a)||0
      this.contactMatrix.copy(mesh.matrixWorld).invert();this.contactBindPoint.copy(this.contactPoint).applyMatrix4(this.contactMatrix);this.contactBindNormal.copy(this.contactNormal).transformDirection(this.contactMatrix)
      if(view.motion){this.contactMatrix.copy(view.motion.matrices[this.contactJoint]).invert();this.contactBindPoint.applyMatrix4(this.contactMatrix);this.contactBindNormal.transformDirection(this.contactMatrix)}
      mesh.getWorldScale(this.contactScale)
    }
  }
  shot(weapon,result,encounter){
    this.muzzleLife=GALLANT_MUZZLE.duration;this.stats.shots++;this.hasEffects=true
    const trace=this.traces.find(t=>t.life<=0)||this.traces[0];weapon.getMuzzle(trace.from);trace.to.copy(result.point);trace.age=0;trace.life=.085
    const sparks=this.systems[5]
    this.direction.subVectors(result.point,trace.from).normalize();sparks.emitter.quaternion.setFromUnitVectors(this.axis,this.direction)
    this.emitParticles(sparks,trace.from,GALLANT_MUZZLE.sparks,COMBAT_VFX_LIMITS.muzzleSparks);this.uploadBirths(5)
    if(result.hit!=null){
      this.stats.hits++;const target=typeof result.hit==='object'?result.hit:encounter.drones?.[result.hit]
      this.surfaceContact(target,trace.from,result.point);trace.to.copy(this.contactPoint)
      const hitRecord=this.emit(this.contactPoint,false,this.contactNormal,'invidHit')
      if(!result.destroyed&&bloodTarget(target))this.impacts.spawnBlood(this.contactPoint,this.contactNormal,target.height/5.2,false,this.contactExact?{view:target.view,joint:this.contactJoint,point:this.contactBindPoint,normal:this.contactBindNormal}:null)
      if(target){
        const v=this.visualFor(target);v.hitAt=this.clock;v.hitRecord=hitRecord;v.hitSeed=hitRecord?.seed;v.hitSeen=target.hitVersion||0;v.normal.copy(this.contactNormal)
        if(this.contactExact){
          this.impacts.attachHit(hitRecord,target.view,this.contactJoint,this.contactBindPoint,this.contactBindNormal)
          const mark=v.scorches[v.scorchCursor++%SCOUT_SCORCH_SLOTS];mark.position.copy(this.contactBindPoint);mark.normal.copy(this.contactBindNormal);mark.radius=.19/Math.max(.001,this.contactScale.x);mark.at=this.clock;mark.record=hitRecord;mark.seed=hitRecord?.seed;mark.heat=1
          if(!result.destroyed)target.view?.motion?.hitReaction.hit(this.contactJoint,this.contactBindNormal,this.contactBindPoint)
        }
        if(result.destroyed)this.destroyTarget(target)
      }
      else if(result.destroyed){this.stats.explosions++;this.emit(result.point,true,null,'invidExplosion')}
    }else if(result.solid){
      const contact=this.surfaceMarks.resolve(trace.from,result,this.impactScene);trace.to.copy(contact.point)
      this.emit(contact.point,false,contact.normal,'gallantImpact');this.surfaceMarks.spawn(contact);this.surfaceMarks.update(0)
    }
  }
  clear(resetStats=false,keepClock=false,keepMarks=false){
    if(!keepMarks)this.surfaceMarks.clear()
    this.muzzleLife=0;this.impacts.clear();this.visuals=new WeakMap();this.traces.forEach(t=>t.life=0);this.systems.forEach(ps=>ps.restart());this.root.visible=false;this.hasEffects=false
    if(!keepClock){this.encounter=null;this.previousTime=0}
    this.orbSprites.clear()
    this.secondaryExplosion.clear(resetStats)
    for(const mesh of [this.flashMesh,this.muzzleHalos,this.contactFlashes,this.blastMesh,this.shell,this.core,this.cannonFlashes,this.cannonHalos])mesh.count=0
    this.batches?.forEach(batch=>batch.update())
    if(resetStats)Object.assign(this.stats,{shots:0,hits:0,explosions:0})
  }
  card(mesh,index,position,size,color,fade=1){this.object.position.copy(position);this.object.quaternion.copy(this.cameraRotation);this.object.scale.setScalar(size);this.object.updateMatrix();mesh.setMatrixAt(index,this.object.matrix);mesh.setColorAt(index,this.tint.copy(color).multiplyScalar(fade))}
  beam(index,from,to,enemy){
    this.direction.subVectors(to,from);const length=this.direction.length();if(length<.001)return false
    this.object.position.copy(from).add(to).multiplyScalar(.5);this.object.quaternion.setFromUnitVectors(this.axis,this.direction.divideScalar(length))
    this.object.scale.set(enemy?.105:.065,enemy?.105:.065,length);this.object.updateMatrix();this.shell.setMatrixAt(index,this.object.matrix);this.shell.setColorAt(index,enemy?colors.purple:colors.yellow)
    this.object.scale.x=this.object.scale.y=enemy?.028:.021;this.object.updateMatrix();this.core.setMatrixAt(index,this.object.matrix);this.core.setColorAt(index,enemy?colors.violetCore:colors.white);return true
  }
  update(dt,encounter,weapon,camera){
    this.impactDust.ensureVisible()
    this.surfaceMarks.update(dt)
    if(this.encounter===encounter&&encounter.time<this.previousTime)this.clear(true);this.encounter=encounter;this.previousTime=encounter.time
    if(!encounter.active){if(this.hasEffects||this.root.visible)this.clear(false,true,true);return}
    this.clock+=Math.max(0,dt);this.impacts.update(dt,camera);this.secondaryExplosion.update(dt,camera)
    this.root.visible=true;camera.getWorldQuaternion(this.cameraRotation)
    let flashes=0,contacts=0,beams=0,cannons=0
    this.orbSprites.begin(encounter.bolts)
    for(const scout of encounter.scouts||[]){
      if(scout.dead||!scout.view.root.visible)continue
      for(let side=0;side<scout.view.muzzles.length;side++){
        const afterglow=(scout.cannonFlash?.[side]||0)/SCOUT_CANNON.duration,prefire=scout.charging&&scout.chargeLeft>0&&side===scout.side,power=afterglow>0?.25+.75*Math.min(1,afterglow):prefire?.48:0
        if(power<=0)continue
        if(cannons>=this.cannonFlashes.instanceMatrix.count)break
        const muzzle=scout.view.muzzles[side]
        muzzle.getWorldPosition(this.point);this.direction.copy(this.axis).transformDirection(muzzle.matrixWorld)
        this.object.position.copy(this.point).addScaledVector(this.direction,.055);this.object.quaternion.setFromUnitVectors(this.axis,this.direction)
        this.object.scale.setScalar(SCOUT_CANNON.coreRadius*(.7+.3*power));this.object.updateMatrix();this.cannonFlashes.setMatrixAt(cannons,this.object.matrix);this.cannonFlashes.setColorAt(cannons,this.tint.copy(colors.violetCore).multiplyScalar(1+power*2))
        this.point.addScaledVector(this.direction,.08);this.card(this.cannonHalos,cannons++,this.point,SCOUT_CANNON.haloSize*(.75+.25*power),colors.magenta,power*SCOUT_CANNON.glowPower)
        // Reuse unused combat-light uniforms; impacts and explosions retain
        // priority, and firing never introduces another Three scene light.
        if(camera.position.distanceToSquared(this.point)<85**2){const light=this.impacts.lights.find(l=>l.intensity<=0);if(light){light.position.copy(this.point);light.color.copy(colors.violetCore);light.intensity=SCOUT_CANNON.lightPower*power;light.distance=SCOUT_CANNON.lightRadius}}
      }
    }
    if(this.muzzleLife>0&&weapon.root.visible){
      weapon.getMuzzle(this.point);const power=this.muzzleLife/GALLANT_MUZZLE.duration,size=GALLANT_MUZZLE.size*(.65+.35*power)
      this.card(this.flashMesh,flashes++,this.point,size,colors.white,1.7*power);this.card(this.flashMesh,flashes++,this.point,size*.3,colors.white,2.4*power)
      this.card(this.muzzleHalos,0,this.point,GALLANT_MUZZLE.haloSize,colors.yellow,power*.8)
    }
    this.muzzleHalos.count=flashes?1:0
    this.muzzleLife=Math.max(0,this.muzzleLife-dt)
    for(const r of this.impacts.records){
      if(r.name==='invidExplosion'||r.name==='invidGroundImpact'||r.name==='invidHit'||r.name==='gallantImpact')continue
      const flashTime=Math.min(.095,r.life*.3);if(r.age>=flashTime)continue
      const fade=1-r.age/flashTime,size=r.size*1.1*(1-r.age/flashTime*.4)
      this.point.copy(r.position).addScaledVector(r.normal,.1+r.size*.08)
      this.card(this.contactFlashes,contacts++,this.point,size,r.color,fade*r.intensity)
      this.card(this.contactFlashes,contacts++,this.point,size*.34,r.core,fade*r.intensity)
    }
    for(const t of this.traces){if(t.life<=0)continue
      const end=Math.min(1,(t.age+.035)/.085),start=Math.max(0,end-.4);this.start.lerpVectors(t.from,t.to,start);this.end.lerpVectors(t.from,t.to,end);if(this.beam(beams,this.start,this.end,false))beams++
      t.age+=dt;t.life=Math.max(0,t.life-dt)
    }
    for(let slot=0;slot<encounter.bolts.length;slot++){const b=encounter.bolts[slot];if(!b.active)continue
      cinematicCombatEvents.observeProjectile(b)
      if(b.style==='scoutOval'){
        this.orbSprites.put(b,slot,dt,this.cameraRotation)
      }else{this.start.copy(b.position).addScaledVector(b.velocity,-.055);if(this.beam(beams,this.start,b.position,true))beams++}
    }
    this.flashMesh.count=flashes;this.contactFlashes.count=contacts;this.shell.count=this.core.count=beams
    this.orbSprites.finish()
    this.cannonFlashes.count=this.cannonHalos.count=cannons
    for(const mesh of [this.flashMesh,this.muzzleHalos,this.contactFlashes,this.blastMesh,this.shell,this.core,this.cannonFlashes,this.cannonHalos])if(mesh.count){mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true}
  }
  dispose(){this.root.removeFromParent();this.orbSprites.dispose();this.secondaryExplosion.dispose();this.impactDust.dispose();this.surfaceMarks.dispose();this.impacts.dispose();for(const mesh of [this.flashMesh,this.muzzleHalos,this.contactFlashes,this.shell,this.core,this.cannonFlashes,this.cannonHalos])mesh.dispose();for(const resource of [this.volumeGeometry,this.volumeMaterial,this.plane,this.box,this.star,this.blast,this.muzzleTexture,this.fireballTexture,this.flashMaterial,this.muzzleHaloMaterial,this.fireballMaterial,this.muzzleSparkMaterial,this.hitFlashMaterial,this.shellMaterial,this.coreMaterial,this.sparkMaterial,this.deathSparkMaterial,this.deathFlashMaterial,this.deathSmokeMaterial,this.cannonGeometry,this.cannonMaterial,this.cannonHaloMaterial])resource.dispose()}
}
