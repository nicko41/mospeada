import {AdditiveBlending,BoxGeometry,CircleGeometry,Color,DataTexture,DoubleSide,DynamicDrawUsage,Group,InstancedMesh,LinearFilter,MeshBasicMaterial,Object3D,PlaneGeometry,Quaternion,Raycaster,SphereGeometry,Vector3} from 'three'
import {ApplyForce,ColorOverLife,ColorRange,ConeEmitter,ConstantValue,Gradient,IntervalValue,ParticleSystem,RenderMode,SphereEmitter,Vector3 as QVec3,Vector4 as QVec4} from 'three.quarks'
import {CombatBursts} from './CombatBursts.js'
import {COMBAT_VFX_LIMITS} from './combatVFXPresets.js'
import {SCOUT_PROJECTILE_CAPACITY} from '../vehicle/EnergyProjectiles.js'

const rgba=hex=>{const c=new Color(hex);return new QVec4(c.r,c.g,c.b,1)}
const MathUtilsSmooth=t=>{const x=Math.max(0,Math.min(1,t));return x*x*(3-2*x)}
const colors={yellow:new Color('#ffd523'),white:new Color('#fffbe1'),purple:new Color('#bd36ff'),violetCore:new Color('#f5d8ff'),magenta:new Color('#f469ef')}
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
  constructor({explosionAtlases={},sampleGround=null}={}){
    this.root=new Group();this.root.name='Plano3_combat_energy';this.root.visible=false
    this.star=energyTexture();this.blast=energyTexture(true);this.plane=new PlaneGeometry(1,1);this.box=new BoxGeometry(1,1,1)
    this.flashMaterial=new MeshBasicMaterial({map:this.star,transparent:true,depthWrite:false,toneMapped:false,blending:AdditiveBlending})
    this.shellMaterial=new MeshBasicMaterial({transparent:true,depthWrite:false,toneMapped:false,opacity:.65})
    this.coreMaterial=new MeshBasicMaterial({transparent:true,depthWrite:false,toneMapped:false})
    this.traces=Array.from({length:16},()=>({from:new Vector3(),to:new Vector3(),age:0,life:0}))
    this.flashMesh=this.mesh(this.plane,this.flashMaterial,COMBAT_VFX_LIMITS.bursts*2+2,'Combat_flashes')
    this.sampleGround=sampleGround
    this.impacts=new CombatBursts(this.blast,this.plane,explosionAtlases);this.root.add(this.impacts.root);this.presets=this.impacts.presets;this.lightingRoot=this.impacts.lightingRoot
    // Opt in only these small pooled meshes to an invisible preparation draw.
    this.root.userData.prewarmVFX=true
    this.blastMesh=this.impacts.fire
    this.clock=0;this.visuals=new WeakMap();this.contactQuery=new Raycaster();this.contactPoint=new Vector3();this.contactNormal=new Vector3();this.contactHits=[]
    this.shell=this.mesh(this.box,this.shellMaterial,40,'Combat_laser_glow')
    this.core=this.mesh(this.box,this.coreMaterial,40,'Combat_laser_cores')
    this.ovalGeometry=new SphereGeometry(1,12,8)
    this.ovalMaterial=new MeshBasicMaterial({color:'#bd36ff',transparent:true,opacity:.46,depthWrite:false,toneMapped:false,blending:AdditiveBlending})
    this.ovalCoreMaterial=new MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:1,depthWrite:false,toneMapped:false})
    this.ovals=this.mesh(this.ovalGeometry,this.ovalMaterial,SCOUT_PROJECTILE_CAPACITY,'Scout_energy_oval_halos')
    this.ovalCores=this.mesh(this.ovalGeometry,this.ovalCoreMaterial,SCOUT_PROJECTILE_CAPACITY,'Scout_energy_oval_cores')
    this.cannonGeometry=new CircleGeometry(1,20)
    this.cannonMaterial=new MeshBasicMaterial({color:'#ffffff',depthWrite:false,toneMapped:false,side:DoubleSide})
    this.cannonHaloMaterial=new MeshBasicMaterial({color:'#d7c4ff',transparent:true,opacity:.16,depthWrite:false,toneMapped:false,side:DoubleSide,blending:AdditiveBlending})
    this.cannonFlashes=this.mesh(this.cannonGeometry,this.cannonMaterial,10,'Scout_cannon_white_blinks')
    this.cannonHalos=this.mesh(this.cannonGeometry,this.cannonHaloMaterial,10,'Scout_cannon_lavender_halos')
    // Projectile and muzzle colours are pure authored energy colours, without
    // the warm per-instance tint used by the existing Gallant hit flashes.
    for(const mesh of [this.ovals,this.ovalCores,this.cannonFlashes,this.cannonHalos])for(let i=0;i<mesh.instanceMatrix.count;i++)mesh.setColorAt(i,new Color('#ffffff'))
    this.object=new Object3D();this.axis=new Vector3(0,0,1);this.direction=new Vector3();this.start=new Vector3();this.end=new Vector3();this.point=new Vector3();this.tint=new Color();this.cameraRotation=new Quaternion();this.muzzleLife=0;this.previousTime=0;this.hasEffects=false
    this.stats={shots:0,hits:0,explosions:0};this.systems=[]
    this.sparkMaterial=new MeshBasicMaterial({map:this.star,transparent:true,depthWrite:false,toneMapped:false})
    this.deathSparkMaterial=new MeshBasicMaterial({map:this.blast,transparent:true,depthWrite:false,toneMapped:false})
    for(const death of [false,true]){
      const ps=new ParticleSystem({duration:60,looping:true,prewarm:false,autoDestroy:false,worldSpace:true,
        shape:death?new SphereEmitter({radius:.2}):new ConeEmitter({radius:.025,angle:.9}),startLife:new IntervalValue(death?.3:.12,death?.7:.25),startSpeed:new IntervalValue(death?2.5:1.2,death?5:3),startSize:new IntervalValue(death?.09:.045,death?.2:.1),
        startRotation:new IntervalValue(-Math.PI,Math.PI),startColor:new ColorRange(rgba(death?'#fff0a0':'#fff7c2'),rgba(death?'#ff7d28':'#bc68ff')),
        emissionOverTime:new ConstantValue(0),emissionOverDistance:new ConstantValue(0),emissionBursts:[],material:death?this.deathSparkMaterial:this.sparkMaterial,instancingGeometry:this.plane,renderMode:RenderMode.StretchedBillBoard,
        rendererEmitterSettings:{speedFactor:.025,lengthFactor:.16},renderOrder:6,
        behaviors:[new ApplyForce(new QVec3(0,-1,0),new ConstantValue(3)),new ColorOverLife(new Gradient([[new QVec3(1,1,1),0],[new QVec3(1,.7,1),1]],[[1,0],[1,.18],[0,1]]))]})
      ps.emitter.name=death?'Quarks_drone_destruction':'Quarks_drone_hits'
      // Reserve Quarks' reusable particles while loading, not on first impact.
      ps.emissionState.waitEmiting=death?96:48;ps.emit(0,ps.emissionState,ps.emitter.matrixWorld);ps.restart();this.systems.push(ps)
    }
  }
  mesh(geometry,material,capacity,name){const m=new InstancedMesh(geometry,material,capacity);m.name=name;m.count=0;m.instanceMatrix.setUsage(DynamicDrawUsage);for(let i=0;i<capacity;i++)m.setColorAt(i,colors.white);m.frustumCulled=false;m.castShadow=false;m.renderOrder=5;this.root.add(m);return m}
  configureBatches(renderer){this.batches=new Set(this.systems.map(ps=>renderer.batches[renderer.systemToBatchIndex.get(ps)]))}
  emit(point,death,normal=null,name=death?'invidExplosion':'invidHit',scale=1,context={}){
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
    this.hasEffects=true;return this.impacts.spawn(name,point,normal,scale,context)
  }
  enemyImpact(point,velocity=null){this.contactNormal.copy(velocity||this.axis).normalize().negate();this.emit(point,false,this.contactNormal,'invidLaserImpact')}
  enemyWorldImpact(point,velocity=null){
    const ground=this.sampleGround?.(point.x,point.z)
    if(Number.isFinite(ground)&&Math.abs(point.y-ground)>.8){this.enemyImpact(point,velocity);return}
    this.contactNormal.set(0,1,0);this.hasEffects=true
    this.impacts.spawn('invidGroundImpact',point,this.contactNormal,1,{grounded:true,groundY:point.y})
  }
  visualFor(target){
    let v=this.visuals.get(target)
    if(!v){v={hitAt:-Infinity,hitSeen:target.hitVersion||0,deathAt:Infinity,dead:false,normal:new Vector3(0,0,1),recoil:new Vector3(),tint:new Color(),visible:true};this.visuals.set(target,v)}
    if(!target.dead&&v.dead){v.dead=false;v.deathAt=Infinity;v.hitAt=-Infinity;v.hitSeen=target.hitVersion||0}
    return v
  }
  destroyTarget(target){
    const v=this.visualFor(target);if(v.dead)return
    v.dead=true;v.deathAt=this.clock;this.stats.explosions++
    const preset=this.presets.invidExplosion,groundY=this.sampleGround?.(target.position.x,target.position.z)
    const grounded=Number.isFinite(groundY)?target.position.y-groundY<=preset.groundGap:target.mode==='ground'||target.grounded===true
    this.point.copy(target.position);if(target.height)this.point.y+=target.height*preset.bodyOffset
    this.emit(this.point,true,null,'invidExplosion',target.height?target.height/5.2:.45,{groundY,grounded})
  }
  scoutVisual(target){
    const v=this.visualFor(target)
    if((target.hitVersion||0)!==v.hitSeen){v.hitSeen=target.hitVersion;v.hitAt=this.clock;this.point.copy(target.position);this.point.y+=(target.height||0)*.5;this.emit(this.point,false,v.normal,'invidHit')}
    if(target.dead&&!v.dead)this.destroyTarget(target)
    const elapsed=this.clock-v.hitAt,flash=Math.max(0,1-elapsed/this.presets.invidHit.duration)
    v.visible=!v.dead||this.clock-v.deathAt<this.presets.invidExplosion.hideDelay
    v.tint.setRGB(1+flash*1.8,1+flash*1.2,1+flash*.35)
    v.emissive=0;v.opacity=1
    if(v.dead){
      const deathAge=Math.max(0,this.clock-v.deathAt),preset=this.presets.invidExplosion
      v.emissive=deathAge<.085?6*(1-deathAge/.085)**.65:0
      v.opacity=1-MathUtilsSmooth((deathAge-preset.overlap)/preset.bodyFade)
    }
    v.recoil.copy(v.normal).multiplyScalar(-Math.sin(Math.min(1,elapsed/this.presets.invidHit.duration)*Math.PI)*.13*flash)
    return v
  }
  surfaceContact(target,from,point){
    this.contactPoint.copy(point);this.contactNormal.subVectors(from,point).normalize()
    if(!target?.view)return
    // Visual ray only: preserve generous gameplay bounds, damage and cadence.
    // Resolve the visible Scout skin so sparks leave its armour surface.
    const view=target.view,mesh=view.levels[view.lod||0];view.root.updateWorldMatrix(true,true)
    this.contactQuery.ray.set(from,this.direction.subVectors(point,from).normalize());this.contactQuery.near=0;this.contactQuery.far=from.distanceTo(point)+target.height+target.radius
    this.contactHits.length=0;this.contactQuery.intersectObject(mesh,false,this.contactHits)
    const contact=this.contactHits[0]
    if(contact){this.contactPoint.copy(contact.point);this.contactNormal.copy(contact.face.normal).transformDirection(mesh.matrixWorld);if(this.contactNormal.dot(this.contactQuery.ray.direction)>0)this.contactNormal.negate()}
  }
  shot(weapon,result,encounter){
    this.muzzleLife=.095;this.stats.shots++;this.hasEffects=true
    const trace=this.traces.find(t=>t.life<=0)||this.traces[0];weapon.getMuzzle(trace.from);trace.to.copy(result.point);trace.age=0;trace.life=.085
    if(result.hit!=null){
      this.stats.hits++;const target=typeof result.hit==='object'?result.hit:encounter.drones?.[result.hit]
      this.surfaceContact(target,trace.from,result.point);trace.to.copy(this.contactPoint)
      this.emit(this.contactPoint,false,this.contactNormal,'invidHit')
      if(target){const v=this.visualFor(target);v.hitAt=this.clock;v.hitSeen=target.hitVersion||0;v.normal.copy(this.contactNormal);if(result.destroyed)this.destroyTarget(target)}
      else if(result.destroyed){this.stats.explosions++;this.emit(result.point,true,null,'invidExplosion')}
    }else if(result.solid){this.surfaceContact(null,trace.from,result.point);this.emit(this.contactPoint,false,this.contactNormal,'gallantImpact')}
  }
  clear(resetStats=false){
    this.muzzleLife=0;this.impacts.clear();this.visuals=new WeakMap();this.traces.forEach(t=>t.life=0);this.systems.forEach(ps=>ps.restart());this.root.visible=false;this.hasEffects=false
    for(const mesh of [this.flashMesh,this.blastMesh,this.shell,this.core,this.ovals,this.ovalCores,this.cannonFlashes,this.cannonHalos])mesh.count=0
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
    if(encounter.time<this.previousTime)this.clear(true);this.previousTime=encounter.time
    if(!encounter.active){if(this.hasEffects||this.root.visible)this.clear();return}
    this.clock+=Math.max(0,dt);this.impacts.update(dt,camera)
    this.root.visible=true;camera.getWorldQuaternion(this.cameraRotation)
    let flashes=0,beams=0,ovals=0,cannons=0
    for(const scout of encounter.scouts||[]){
      if(scout.dead||!scout.view.root.visible||!scout.charging||scout.chargeLeft<=0)continue
      for(const muzzle of scout.view.muzzles){
        muzzle.getWorldPosition(this.point);this.direction.copy(this.axis).transformDirection(muzzle.matrixWorld)
        this.object.position.copy(this.point).addScaledVector(this.direction,.055);this.object.quaternion.setFromUnitVectors(this.axis,this.direction)
        this.object.scale.setScalar(.17);this.object.updateMatrix();this.cannonFlashes.setMatrixAt(cannons,this.object.matrix)
        this.object.scale.setScalar(.235);this.object.updateMatrix();this.cannonHalos.setMatrixAt(cannons++,this.object.matrix)
      }
    }
    if(this.muzzleLife>0&&weapon.root.visible){
      weapon.getMuzzle(this.point);const size=.29*(.75+.25*this.muzzleLife/.095)
      this.card(this.flashMesh,flashes++,this.point,size,colors.yellow);this.card(this.flashMesh,flashes++,this.point,size*.28,colors.white)
    }
    this.muzzleLife=Math.max(0,this.muzzleLife-dt)
    for(const r of this.impacts.records){
      if(r.name==='invidExplosion'||r.name==='invidGroundImpact')continue
      const flashTime=Math.min(.095,r.life*.3);if(r.age>=flashTime)continue
      const fade=1-r.age/flashTime,size=r.size*1.1*(1-r.age/flashTime*.4)
      this.point.copy(r.position).addScaledVector(r.normal,.1+r.size*.08)
      this.card(this.flashMesh,flashes++,this.point,size,r.color,fade*r.intensity)
      this.card(this.flashMesh,flashes++,this.point,size*.34,r.core,fade*r.intensity)
    }
    for(const t of this.traces){if(t.life<=0)continue
      const end=Math.min(1,(t.age+.035)/.085),start=Math.max(0,end-.4);this.start.lerpVectors(t.from,t.to,start);this.end.lerpVectors(t.from,t.to,end);if(this.beam(beams,this.start,this.end,false))beams++
      t.age+=dt;t.life=Math.max(0,t.life-dt)
    }
    for(const b of encounter.bolts)if(b.active){
      if(b.style==='scoutOval'){
        const scale=b.visualScale||1
        this.object.position.copy(b.position);this.direction.copy(b.velocity).normalize();this.object.quaternion.setFromUnitVectors(this.axis,this.direction)
        this.object.scale.set(.28*scale,.28*scale,.60*scale);this.object.updateMatrix();this.ovals.setMatrixAt(ovals,this.object.matrix)
        this.object.scale.set(.14*scale,.14*scale,.39*scale);this.object.updateMatrix();this.ovalCores.setMatrixAt(ovals,this.object.matrix);ovals++
      }else{this.start.copy(b.position).addScaledVector(b.velocity,-.055);if(this.beam(beams,this.start,b.position,true))beams++}
    }
    this.flashMesh.count=flashes;this.shell.count=this.core.count=beams
    this.ovals.count=this.ovalCores.count=ovals
    this.cannonFlashes.count=this.cannonHalos.count=cannons
    for(const mesh of [this.flashMesh,this.blastMesh,this.shell,this.core,this.ovals,this.ovalCores,this.cannonFlashes,this.cannonHalos])if(mesh.count){mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true}
  }
  dispose(){this.root.removeFromParent();this.impacts.dispose();for(const mesh of [this.flashMesh,this.shell,this.core,this.ovals,this.ovalCores,this.cannonFlashes,this.cannonHalos])mesh.dispose();for(const resource of [this.plane,this.box,this.star,this.blast,this.flashMaterial,this.shellMaterial,this.coreMaterial,this.sparkMaterial,this.deathSparkMaterial,this.ovalGeometry,this.ovalMaterial,this.ovalCoreMaterial,this.cannonGeometry,this.cannonMaterial,this.cannonHaloMaterial])resource.dispose()}
}
