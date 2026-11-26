import {MathUtils,Matrix4,Raycaster,Vector3} from 'three'
import {GallantHitscan} from '../../vehicle/GallantShot.js'
import {SCOUT_PROJECTILE_CAPACITY,createEnergyProjectiles,launchEnergyProjectile,advanceEnergyProjectiles,energyInterceptTime} from '../../vehicle/EnergyProjectiles.js'
import {SCOUT_ASSET,SCOUT_WIDTH,SCOUT_DEPTH} from './invidScoutAsset.js'
import {FOREST_STAGE4} from './forestStage4Config.js'
import {SCOUT_MOTION} from './scoutMechanicalConfig.js'
import {ENTITY_ATTACK_RANGE,ENTITY_ATTACK_COOLDOWN} from '../../player/meleeConfig.js'
import {DESERT_CLIMAX as C,climaxPathX} from './forestClimaxConfig.js'
import {SCOUT_CANNON} from '../../vfx/combatVFXPresets.js'

// Scott sees the distant pursuit from the overlook. The same five world-space
// models approach after he crosses the cliff; Rand is not represented yet.
export const SCOUT_PATROL=Object.freeze({count:5,randPursuerId:4,hitsToDown:16,fallGravity:18,toppleSeconds:.9,triggerDistance:FOREST_STAGE4.forestLength-80,desertDistance:FOREST_STAGE4.forestLength,sightingDistance:220,sightingHeight:22,entrySeconds:3.2,flightClearance:2,altitudeSpread:.22,projectiles:SCOUT_PROJECTILE_CAPACITY,projectileSpeed:70,aimLead:.72,burstSpread:.95,playerHitCooldown:.45,projectileLife:3.5,burstShots:8,shotSpacing:.13,burstStagger:.6,attackInterval:2.6,muzzleBlink:.06,retrySeconds:1.25})
export const SCOUT_ATTACK_DAMAGE=8
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),clamp=MathUtils.clamp
const burstSweep=[-2.4,-1.7,-.55,-.12,.12,.55,1.7,2.4]
const formationFront=[1,-1,1,1,-1]
export class DesertScoutPatrol{
  constructor(views,sample,random=Math.random,{rigTestId=-1,climax=false,bolts=null}={}){
    this.rigTestId=rigTestId
    this.climax=climax
    this.views=views;this.sample=sample;this.random=random;this.worldQuery=new GallantHitscan();this.bolts=bolts||createEnergyProjectiles(SCOUT_PATROL.projectiles,'scoutOval');this.supportCorner=new Vector3()
    this.origin=new Vector3();this.sightingOrigin=new Vector3();this.forward=new Vector3();this.right=new Vector3();this.target=new Vector3();this.aim=new Vector3();this.muzzle=new Vector3();this.delta=new Vector3();this.rotation=new Matrix4();this.playerVelocity=new Vector3();this.huntVelocity=new Vector3();this.huntForward=new Vector3();this.previousPlayer=new Vector3();this.ray=new Raycaster()
    this.scouts=views.map((view,id)=>{
      const r={id,view,position:new Vector3(),velocity:new Vector3(),evadeDirection:new Vector3(),clawGround:new Vector3(),cannonFlash:new Float32Array(2),clawContact:{kind:'claw',source:new Vector3(),position:new Vector3(),velocity:new Vector3()},radius:SCOUT_WIDTH*.5,height:SCOUT_ASSET.heightMetres,syncPosition(){}}
      r.receiveHit=(_damage,direction)=>this.receiveHit(r,direction);r.receiveMissileHit=direction=>this.receiveHit(r,direction,true);return r
    })
    this.reset()
  }
  get active(){return this.phase!=='idle'&&this.phase!=='complete'}
  reset(){
    this.phase='idle';this.time=0;this.approachTime=0;this.combatTime=0;this.leaveTime=0;this.shotGate=0;this.shots=0;this.hitsTaken=0;this.playerHurtCooldown=0;this.rigTestStarted=false;this.defeated=false;this.kills=0
    this.battleStarted=false;this.evadeGate=0;this.patrols=Array.from({length:Math.ceil(this.scouts.length/C.squadSize)},()=>({activated:false,kills:0}))
    this.bolts.forEach(b=>b.active=false)
    this.scouts.forEach(r=>{r.charging=false;r.chargeLeft=0;r.burstRemaining=0;r.bursts=0;r.burstSpread=1;r.burstDirection=1;r.cannonFlash.fill(0);r.evading=false;r.evadeAge=0;r.evadeCooldown=2+r.id*.43;r.lockAge=0;r.clawImpactPending=false})
    for(const r of this.scouts){Object.assign(r,{state:'IDLE',dead:false,health:SCOUT_PATROL.hitsToDown,meleeEnabled:false,hits:0,hitVersion:0,hitFlash:0,mode:'flight',modeTime:0,landings:0,takeoffs:0,shots:0,focus:this.climax?null:'scott',cooldown:2.6+r.id*.67,nextLanding:6+r.id*1.8,side:r.id%2,yaw:0,pitch:0,bank:0,fallTime:0,fallVelocity:0,fallFace:null,clawAge:Infinity,clawCooldown:0,clawSide:r.id%2,clawHit:false,rigTest:false,rigTestStruck:false,engaged:false,patrolAge:0,patrolIndex:Math.floor(r.id/C.squadSize),activated:false});r.velocity.set(0,0,0);r.view.root.visible=false;r.view.motion?.reset()}
  }
  receiveHit(r,direction,lethal=false){
    if(r.dead||!r.meleeEnabled)return false
    r.hits++;r.health=lethal?0:SCOUT_PATROL.hitsToDown-r.hits;r.hitVersion++;r.hitFlash=.18
    if(r.health===0){
      r.evading=false
      r.dead=true;r.state='DEAD';r.meleeEnabled=false;r.mode='falling';r.fallTime=0;r.fallVelocity=0;r.charging=false;r.chargeLeft=0;r.burstRemaining=0;r.cannonFlash.fill(0)
      r.fallFace=this.random()<.5?'up':'down';r.fallStartPitch=r.pitch;r.fallStartBank=r.bank
      r.fallTargetPitch=r.fallFace==='up'?-Math.PI/2:Math.PI/2;r.fallTargetBank=(this.random()-.5)*.18
      if(direction)r.velocity.addScaledVector(direction,2)
      r.velocity.y=0;if(r.velocity.length()>5)r.velocity.setLength(5)
      this.kills++
      if(this.climax){const patrol=this.patrols[r.patrolIndex];patrol.kills++;if(r.patrolIndex===0&&patrol.kills===C.squadSize)this.activatePatrol(2)}
      if(this.kills===this.scouts.length){this.defeated=true;this.stopCombat()}
    }
    return true
  }
  stopCombat(){this.bolts.forEach(b=>b.active=false);for(const r of this.scouts){r.charging=false;r.chargeLeft=0;r.burstRemaining=0;r.evading=false;r.clawImpactPending=false;r.cannonFlash.fill(0)}}
  updateEvade(r,dt,target,lockedTarget,enabled){
    r.evadeCooldown=Math.max(0,r.evadeCooldown-dt)
    if(!enabled||r.mode!=='flight'){r.evading=false;r.lockAge=0;return}
    if(r.evading){r.evadeAge+=dt;if(r.evadeAge>=SCOUT_MOTION.evadeDuration){r.evading=false;r.velocity.multiplyScalar(.45)}return}
    r.lockAge=lockedTarget===r?r.lockAge+dt:0
    if(r.lockAge<SCOUT_MOTION.evadeLockDelay||r.evadeCooldown>0||this.evadeGate>0||r.charging||r.burstRemaining>0)return
    r.evadeCooldown=SCOUT_MOTION.evadeCooldown+this.random()*SCOUT_MOTION.evadeCooldownSpread;r.lockAge=0
    if(this.random()>SCOUT_MOTION.evadeChance)return
    const dx=target.x-r.position.x,dz=target.z-r.position.z,n=Math.hypot(dx,dz)
    if(n<8||n>90)return
    r.evadeDirection.set(dz/n,0,-dx/n).multiplyScalar(this.random()<.5?-1:1)
    r.evading=true;r.evadeAge=0;this.evadeGate=SCOUT_MOTION.evadeSpacing
    r.charging=false;r.burstRemaining=0;r.cooldown=Math.max(r.cooldown,SCOUT_MOTION.evadeDuration+.3)
  }
  startClimax(world,firstDepth=C.firstPatrol){
    this.reset();this.phase='active';this.forward.set(0,0,-1);this.right.set(1,0,0)
    for(const r of this.scouts){
      const depth=firstDepth+C.patrolDistances[r.patrolIndex]+(this.random()-.5)*70
      const x=world.position.x+climaxPathX(depth)+[-64,-28,9,42,78][r.id%5]+(this.random()-.5)*16,z=world.position.z-depth
      const floor=this.sample(x,z),height=Number.isFinite(floor)?floor:world.position.y-FOREST_STAGE4.drop-C.drop
      r.position.set(x,height+.025+(r.id%3===0?0:2.8+(r.id%4)*.9),z);r.home=r.position.clone();r.mode=r.id%3===0?'ground':'flight';r.yaw=Math.PI+(this.random()-.5)*1.8
      r.cooldown=.8+(r.id%7)*.31;r.view.root.visible=true;this.applyView(r);r.view.motion?.update(r,.016,this.sample)
    }
  }
  beginAmbush(){
    if(!this.climax||this.battleStarted)return
    this.battleStarted=true;this.activatePatrol(0);this.activatePatrol(1)
  }
  activatePatrol(index){
    const patrol=this.patrols[index];if(!patrol||patrol.activated)return
    patrol.activated=true
    for(const r of this.scouts)if(r.patrolIndex===index&&!r.dead){r.activated=true;r.meleeEnabled=true;r.focus=r.id%8===0?'rand':'scott';r.velocity.set(0,0,0)}
  }
  updateWaiting(r,dt,s,randTarget){
    if(!r.activated){this.updateDistantPatrol(r,dt);return true}
    const nearest=Math.min(Math.hypot(r.position.x-s.x,r.position.z-s.z),randTarget?.active?Math.hypot(r.position.x-randTarget.x,r.position.z-randTarget.z):Infinity)
    if(nearest<C.engageRange){r.engaged=true;r.modeTime=0;return false}
    // Activated reinforcements fly continuously toward the current encounter.
    // Only arrival hands them to the unchanged individual combat controller.
    const target=randTarget?.active&&!randTarget.dead&&r.focus==='rand'?randTarget:s
    this.delta.set(target.x-r.position.x,0,target.z-r.position.z)
    const distance=this.delta.length(),speed=Math.min(C.approachSpeeds[r.patrolIndex],distance/dt)
    this.delta.setLength(speed);r.velocity.lerp(this.delta,1-Math.exp(-dt*2.8))
    r.position.addScaledVector(r.velocity,dt);r.mode='flight'
    const floor=this.floorAt(r,false)
    r.position.y=MathUtils.damp(r.position.y,floor+SCOUT_PATROL.flightClearance+r.id*SCOUT_PATROL.altitudeSpread,2,dt)
    r.yaw+=wrap(Math.atan2(r.velocity.x,r.velocity.z)-r.yaw)*(1-Math.exp(-dt*5))
    this.applyView(r);r.position.y=Math.max(r.position.y,this.floorAt(r));this.applyView(r);r.view.motion?.update(r,dt,this.sample)
    return true
  }
  updatePreview(dt){
    if(!this.climax||!this.active||dt<=0)return
    dt=Math.min(dt,.1);this.time+=dt
    for(const r of this.scouts)if(!r.dead)this.updateDistantPatrol(r,dt)
  }
  updateDistantPatrol(r,dt){
    // Distant squads remain visible and move as loose patrols, without doing
    // shooting raycasts/foot IK at the full combat frequency.
    r.patrolAge+=dt;if(r.patrolAge<.18)return
    const step=r.patrolAge;r.patrolAge=0
    r.position.x=r.home.x+(Math.sin(this.time*.22+r.id)-Math.sin(r.id))*5;r.position.z=r.home.z+(Math.sin(this.time*.16+r.id*1.7)-Math.sin(r.id*1.7))*7
    const floor=this.sample(r.position.x,r.position.z)
    if(Number.isFinite(floor))r.position.y=floor+.025+(r.mode==='ground'?0:2.8+(r.id%4)*.9+Math.sin(this.time+r.id)*.3)
    r.velocity.set(Math.cos(this.time*.22+r.id)*1.1,0,Math.cos(this.time*.16+r.id*1.7)*1.12)
    r.yaw=Math.atan2(r.velocity.x,r.velocity.z);this.applyView(r);r.view.motion?.update(r,step,this.sample)
  }
  fallenSupport(r){
    // The rotated, normalized model bounds follow the same shared GLB as the
    // visible instance. Eight terrain samples only while a body is falling.
    this.rotation.makeRotationFromEuler(r.view.root.rotation)
    let support=-Infinity
    for(const x of [-SCOUT_WIDTH*.5,SCOUT_WIDTH*.5])for(const y of [0,SCOUT_ASSET.heightMetres])for(const z of [-SCOUT_DEPTH*.5,SCOUT_DEPTH*.5]){
      this.supportCorner.set(x,y,z).applyMatrix4(this.rotation)
      const floor=this.sample(r.position.x+this.supportCorner.x,r.position.z+this.supportCorner.z)
      if(Number.isFinite(floor))support=Math.max(support,floor-this.supportCorner.y)
    }
    return support+.025
  }
  updateFallen(r,dt){
    if(r.mode==='downed')return
    r.fallTime+=dt;r.hitFlash=Math.max(0,r.hitFlash-dt)
    const t=MathUtils.smoothstep(r.fallTime,0,SCOUT_PATROL.toppleSeconds)
    r.pitch=MathUtils.lerp(r.fallStartPitch,r.fallTargetPitch,t);r.bank=MathUtils.lerp(r.fallStartBank,r.fallTargetBank,t)
    r.fallVelocity-=SCOUT_PATROL.fallGravity*dt;r.position.addScaledVector(r.velocity,dt);r.position.y+=r.fallVelocity*dt;r.velocity.multiplyScalar(Math.exp(-dt*2.8))
    this.applyView(r);const floor=this.fallenSupport(r)
    if(r.position.y<=floor){r.position.y=floor;r.fallVelocity=0;if(t===1){r.mode='downed';r.velocity.set(0,0,0)}}
    this.applyView(r)
  }
  start(s,camera,world){
    this.phase=world.distance(s.z)<SCOUT_PATROL.desertDistance?'sighting':'entering';this.origin.set(s.x,s.height,s.z);this.previousPlayer.copy(this.origin)
    // The desert continues along world -Z. Camera orbit must never relocate
    // the pursuit or turn its arrival into a camera-relative spawn beside Scott.
    this.forward.set(0,0,-1);this.right.set(1,0,0)
    this.sightingOrigin.set(clamp(s.x,world.position.x-FOREST_STAGE4.desertHalfWidth+320,world.position.x+FOREST_STAGE4.desertHalfWidth-320),0,this.phase==='sighting'?world.position.z-SCOUT_PATROL.desertDistance-SCOUT_PATROL.sightingDistance:s.z-SCOUT_PATROL.sightingDistance)
    for(const r of this.scouts){
      r.position.copy(this.sightingOrigin).addScaledVector(this.right,220+r.id*11).addScaledVector(this.forward,r.id*8)
      const floor=this.sample(r.position.x,r.position.z)
      r.position.y=(Number.isFinite(floor)?floor:world.position.y-FOREST_STAGE4.drop)+SCOUT_PATROL.sightingHeight+r.id*.7
      r.yaw=-Math.PI/2;r.velocity.copy(this.right).multiplyScalar(-12)
      r.meleeEnabled=true;r.view.root.visible=true;this.applyView(r)
    }
  }
  applyView(r){
    r.view.root.position.copy(r.position)
    // The reversible joint layer owns hit recoil; keep the AI/world frame steady.
    r.view.root.rotation.set(r.pitch,r.yaw,r.bank,'YXZ');r.view.root.updateMatrixWorld(true)
  }
  beginRigTest(s){
    const r=this.scouts[this.rigTestId]
    if(!r||r.dead||this.rigTestStarted)return
    // Explicit, localized gameplay test: reuse one of the five existing
    // Scouts in front of Scott, rather than landing offscreen 150 m away.
    const x=s.x+2.5,z=s.z-6.5,floor=this.sample(x,z)
    if(!Number.isFinite(floor))return
    this.rigTestStarted=true;r.rigTest=true;r.mode='descending';r.modeTime=0
    r.position.set(x,floor+3,z);r.velocity.set(0,0,0);r.yaw=Math.atan2(s.x-x,s.z-z);r.pitch=r.bank=0
    r.charging=false;r.burstRemaining=0;r.cooldown=4;this.applyView(r)
  }
  floorAt(r,tilted=true){
    let floor=this.sample(r.position.x,r.position.z)
    if(!Number.isFinite(floor))return r.position.y-8
    if(r.position.y-floor<SCOUT_ASSET.heightMetres*.5||r.mode==='ground'||r.mode==='descending'){
      const width=SCOUT_WIDTH*.32,depth=SCOUT_DEPTH*.32
      for(const [x,z]of [[-width,-depth],[width,-depth],[-width,depth],[width,depth]]){
        const px=r.position.x+Math.cos(r.yaw)*x+Math.sin(r.yaw)*z,pz=r.position.z-Math.sin(r.yaw)*x+Math.cos(r.yaw)*z,h=this.sample(px,pz)
        if(Number.isFinite(h))floor=Math.max(floor,h)
      }
    }
    if(tilted){
      this.rotation.makeRotationFromEuler(r.view.root.rotation);const e=this.rotation.elements,h=SCOUT_ASSET.heightMetres*.5
      const bottom=h*e[5]-Math.abs(e[1])*SCOUT_WIDTH*.5-Math.abs(e[5])*h-Math.abs(e[9])*SCOUT_DEPTH*.5
      floor-=Math.min(0,bottom)
    }
    return floor+.025
  }
  update(dt,s,camera,world,{allowAttack=true,onPlayerHit=()=>{},onImpact=()=>{},onClawImpact=()=>{},lockedTarget=null,randTarget=null,onRandHit=()=>{}}={}){
    if(!world?.bound)return
    const distance=world.distance(s.z)
    if(this.phase==='idle'){
      if(this.climax)return
      if(distance<SCOUT_PATROL.triggerDistance||!world.contains(s.x,s.z))return
      this.start(s,camera,world)
    }
    if(!this.active||dt<=0)return
    dt=Math.min(dt,.1);this.time+=dt;this.evadeGate=Math.max(0,this.evadeGate-dt);this.shotGate=Math.max(0,this.shotGate-dt);this.playerHurtCooldown=Math.max(0,this.playerHurtCooldown-dt)
    // Overlapping bursts share one brief damage window for Scott. Projectiles
    // still collide and expire normally; pause freezes the cooldown as well.
    const hitPlayer=b=>{if(this.playerHurtCooldown>0)return;this.playerHurtCooldown=SCOUT_PATROL.playerHitCooldown;this.hitsTaken++;onPlayerHit(b)}
    this.playerVelocity.set(s.x-this.previousPlayer.x,s.height-this.previousPlayer.y,s.z-this.previousPlayer.z).divideScalar(dt)
    if(this.playerVelocity.length()>85)this.playerVelocity.setLength(85)
    this.previousPlayer.set(s.x,s.height,s.z)
    if(this.phase==='sighting'&&distance>=SCOUT_PATROL.desertDistance){this.phase='entering';this.approachTime=0}
    if(this.phase==='entering'){
      this.approachTime+=dt
      const floor=this.sample(s.x,s.z)
      if(this.approachTime>=SCOUT_PATROL.entrySeconds&&Number.isFinite(floor)&&s.height-floor<8)this.phase='active'
    }
    if(this.phase==='active'){this.combatTime+=dt;this.beginRigTest(s)}
    // No artificial leash or dune boundary ends a live desert encounter.
    if(this.phase!=='leaving'&&!world.contains(s.x,s.z)){this.phase='leaving';this.leaveTime=0}
    else if(this.phase==='leaving'&&world.contains(s.x,s.z)){this.phase='active';this.leaveTime=0}
    if(this.phase==='leaving')this.leaveTime+=dt
    const speed=Math.hypot(this.playerVelocity.x,this.playerVelocity.z)
    for(const r of this.scouts){
      for(let side=0;side<2;side++)r.cannonFlash[side]=Math.max(0,r.cannonFlash[side]-dt)
      if(r.dead){this.updateFallen(r,dt);continue}
      if(this.climax&&!r.engaged&&this.updateWaiting(r,dt,s,randTarget))continue
      if(!allowAttack||this.phase==='leaving'){r.charging=false;r.chargeLeft=0;r.burstRemaining=0}
      if(r.charging)r.chargeLeft=Math.max(0,r.chargeLeft-dt)
      const followsRand=(this.climax?r.id%8===0:r.id===SCOUT_PATROL.randPursuerId)&&randTarget?.active&&!randTarget.dead,hunted=followsRand?randTarget:s
      r.focus=followsRand?'rand':'scott';this.huntVelocity.copy(this.playerVelocity)
      if(followsRand){this.huntVelocity.set(randTarget.vx||0,randTarget.vy||0,randTarget.vz||0);this.huntForward.copy(randTarget.forward||this.forward);r.mode='flight'}else if(Number.isFinite(s.yaw))this.huntForward.set(Math.sin(s.yaw),0,Math.cos(s.yaw));else this.huntForward.copy(this.forward)
      r.modeTime+=dt;if(this.phase==='active'||followsRand)r.cooldown-=dt;r.hitFlash=Math.max(0,r.hitFlash-dt)
      this.updateEvade(r,dt,hunted,lockedTarget,allowAttack&&this.phase==='active'&&!followsRand&&!r.rigTest)
      if(this.phase==='leaving'){
        this.target.copy(this.right).multiplyScalar(35).addScaledVector(this.forward,15);this.target.y=20;r.velocity.lerp(this.target,1-Math.exp(-dt*2));r.position.addScaledVector(r.velocity,dt)
      }else if(this.phase==='sighting'&&!followsRand){
        // A distant right-to-left pursuit, independent of Scott's movement.
        this.target.copy(this.sightingOrigin).addScaledVector(this.right,150-Math.min(this.time*9,280)+[-13,15,-6,8,1][r.id]).addScaledVector(this.forward,r.id*8+Math.sin(this.time*.4+r.id)*5)
        this.delta.subVectors(this.target,r.position);this.delta.y=0;if(this.delta.length()>18)this.delta.setLength(18)
        r.velocity.lerp(this.delta,1-Math.exp(-dt*2));r.position.addScaledVector(r.velocity,dt)
        const floor=this.floorAt(r,false);r.position.y=MathUtils.damp(r.position.y,floor+SCOUT_PATROL.sightingHeight+Math.sin(this.time*1.2+r.id)*.6,2,dt)
      }else{
        if(!followsRand&&!r.evading&&this.phase==='active'&&r.mode==='flight'&&r.id%2===0&&this.combatTime>=r.nextLanding&&Math.hypot(r.position.x-s.x,r.position.z-s.z)<65){r.mode='descending';r.modeTime=0}
        const settling=r.mode==='descending'||r.mode==='ground'
        if(r.mode==='descending')r.velocity.multiplyScalar(Math.exp(-dt*3.5))
        else{
          // Stable front/rear roles: changing facing only changes a destination.
          // Existing acceleration and speed limits fly the Scout there.
          const ahead=(34+[0,5,-3,9,3][r.id%5]+Math.sin(this.time*.45+r.id)*4+(this.climax?Math.floor(r.id/5)*5:0))*formationFront[r.id%5],side=[-18,20,-9,12,2][r.id%5]+Math.sin(this.time*.6+r.id*2)*3+(this.climax?(Math.floor(r.id/5)-2)*5:0)
          this.target.set(hunted.x,hunted.height,hunted.z).addScaledVector(this.huntForward,followsRand?this.climax&&r.id%16===0?12:-25:ahead)
          if(followsRand)this.target.addScaledVector(this.right,9)
          else{this.target.x+=-this.huntForward.z*side;this.target.z+=this.huntForward.x*side}
          if(r.mode==='ground')this.target.set(hunted.x+this.huntVelocity.x*.3,hunted.height,hunted.z+this.huntVelocity.z*.3)
          this.delta.subVectors(this.target,r.position);this.delta.y=0;this.delta.multiplyScalar(1.1).addScaledVector(this.huntVelocity,.9);this.delta.y=0
          if(r.mode==='ground'&&(r.clawAge<SCOUT_MOTION.clawDuration||r.rigTest&&Math.hypot(hunted.x-r.position.x,hunted.z-r.position.z)<2.5))this.delta.set(0,0,0)
          // Same existing formation target; grounded Scouts approach it with
          // deliberate mechanical steps instead of sliding at flight speed.
          const max=r.mode==='ground'?SCOUT_MOTION.groundSpeed:Math.min(SCOUT_MOTION.flightMaxSpeed,SCOUT_MOTION.flightMinSpeed+(followsRand?randTarget.speed:speed)*.25);if(this.delta.length()>max)this.delta.setLength(max)
          if(r.evading)this.delta.copy(r.evadeDirection).multiplyScalar(SCOUT_MOTION.evadeSpeed)
          r.velocity.lerp(this.delta,1-Math.exp(-dt*(r.evading?8:2.8)))
        }
        r.position.x+=r.velocity.x*dt;r.position.z+=r.velocity.z*dt
        const ground=this.floorAt(r,false),flightHeight=SCOUT_PATROL.flightClearance+r.id*SCOUT_PATROL.altitudeSpread+Math.sin(this.time*1.6+r.id*1.8)*.35
        const y=settling?ground:ground+flightHeight
        r.position.y=MathUtils.damp(r.position.y,y,r.mode==='ground'?12:settling?2.3:1.9,dt)
        if(r.mode==='descending'&&r.position.y-ground<.07&&Math.hypot(r.velocity.x,r.velocity.z)<.35){r.mode='ground';r.modeTime=0;r.landings++;r.position.y=ground}
        if(r.mode==='ground'&&r.clawAge>=SCOUT_MOTION.clawDuration&&(r.rigTest?r.rigTestStruck&&r.modeTime>5:r.modeTime>(this.climax?SCOUT_MOTION.groundPatrolSeconds+r.id%5:SCOUT_MOTION.groundOpeningSeconds+r.id*.4))){r.mode='rising';r.modeTime=0;r.takeoffs++;r.rigTest=false}
        if(r.mode==='rising'&&r.modeTime>2){r.mode='flight';r.modeTime=0;r.nextLanding=this.combatTime+18+r.id*2}
      }
      const face=Math.atan2(hunted.x-r.position.x,hunted.z-r.position.z),moving=Math.hypot(r.velocity.x,r.velocity.z)>.6,attack=r.cooldown<.9||r.mode==='ground'
      const desired=(this.phase!=='sighting'||followsRand)&&(attack||r.evading||!moving)?face:Math.atan2(r.velocity.x,r.velocity.z)
      r.yaw+=wrap(desired-r.yaw)*(1-Math.exp(-dt*5))
      const grounded=r.mode==='ground'||r.mode==='descending'
      const aimPitch=attack?clamp(Math.atan2(r.position.y+4.4-hunted.height-.8,Math.hypot(hunted.x-r.position.x,hunted.z-r.position.z)),0,.35):clamp(-speed*.0015,-.07,.04)
      r.pitch=MathUtils.damp(r.pitch,grounded?0:aimPitch,5,dt)
      r.bank=MathUtils.damp(r.bank,grounded?0:clamp(wrap(desired-r.yaw)*-.1,-.08,.08),5,dt)
      this.applyView(r);r.position.y=Math.max(r.position.y,this.floorAt(r));this.applyView(r)
      this.updateClaw(r,dt,hunted,allowAttack&&this.phase==='active',followsRand?onRandHit:hitPlayer)
      r.view.motion?.update(r,dt,this.sample)
      if(r.clawImpactPending){
        r.clawImpactPending=false
        if(r.view.motion?.clawContactPoint)r.view.motion.clawContactPoint(r.clawSide,r.clawGround)
        else r.clawGround.copy(r.position).addScaledVector(this.delta.set(Math.sin(r.yaw),0,Math.cos(r.yaw)),1.4)
        const floor=this.sample(r.clawGround.x,r.clawGround.z)
        if(Number.isFinite(floor)){r.clawGround.y=floor+.025;onClawImpact(r.clawGround)}
      }
      if(r.rigTest){r.charging=false;r.burstRemaining=0;continue}
      if(r.charging&&Math.abs(wrap(face-r.yaw))>=.35){r.charging=false;r.chargeLeft=0;r.burstRemaining=0;r.cooldown=.4}
      if(!r.evading&&(this.phase==='active'||this.phase==='sighting'&&followsRand)&&allowAttack&&r.cooldown<=0&&(r.burstRemaining>0||this.shotGate<=0)&&Math.abs(wrap(face-r.yaw))<.35){
        r.view.muzzles[r.side].getWorldPosition(this.muzzle)
        this.aim.set(hunted.x,hunted.height+.8,hunted.z)
        const flight=energyInterceptTime(this.muzzle,this.aim,this.huntVelocity,SCOUT_PATROL.projectileSpeed,followsRand?SCOUT_PATROL.projectileLife-.1:1.6)
        this.aim.addScaledVector(this.huntVelocity,flight*(followsRand?1:SCOUT_PATROL.aimLead))
        const range=this.muzzle.distanceTo(this.aim)
        if(range<100){
          this.ray.ray.set(this.muzzle,this.delta.subVectors(this.aim,this.muzzle).normalize());const block=this.worldQuery.castWorld(this.ray.ray,Math.max(0,range-.8))
          // Stagger burst STARTS only. The eight alternating rounds then run
          // at machine-gun cadence independently of the other Scouts.
          if(!block.solid&&!r.charging){
            if(!r.burstRemaining){r.burstRemaining=SCOUT_PATROL.burstShots;r.bursts++;r.burstSpread=SCOUT_PATROL.burstSpread*(.9+this.random()*.2);r.burstDirection=this.random()<.5?-1:1;this.shotGate=SCOUT_PATROL.burstStagger}
            r.charging=true;r.chargeLeft=SCOUT_PATROL.muzzleBlink;continue
          }
          if(!block.solid&&r.chargeLeft>0)continue
          const round=SCOUT_PATROL.burstShots-r.burstRemaining
          // Sweep the ground alongside the low riders, keeping four central
          // rounds on their bodies. All rounds retain real swept collisions.
          if(!block.solid){
            const dx=this.aim.x-this.muzzle.x,dz=this.aim.z-this.muzzle.z,horizontal=Math.max(.01,Math.hypot(dx,dz)),offset=burstSweep[round]*r.burstSpread*r.burstDirection
            this.aim.x+=dz/horizontal*offset;this.aim.z-=dx/horizontal*offset
            if(round<2||round>5){const floor=this.sample(this.aim.x,this.aim.z);this.aim.y=(Number.isFinite(floor)?floor:hunted.height)+.04}
          }
          const projectile=!block.solid?launchEnergyProjectile(this.bolts,this.muzzle,this.aim,SCOUT_PATROL.projectileSpeed,SCOUT_PATROL.projectileLife):null
          r.charging=false;r.chargeLeft=0
          if(projectile){
            r.cannonFlash[r.side]=SCOUT_CANNON.duration
            projectile.scoutId=r.id;projectile.launcher=r.side;projectile.targetId=r.focus;projectile.visualScale=.94+this.random()*.12;projectile.burstId=r.bursts;projectile.burstRound=round
            r.burstRemaining--;r.side=1-r.side;r.shots++;this.shots++
            r.cooldown=r.burstRemaining>0?SCOUT_PATROL.shotSpacing-SCOUT_PATROL.muzzleBlink:SCOUT_PATROL.attackInterval+(this.random()-.5)*.4
          }else{r.cooldown=.4;r.burstRemaining=0}
        }else{r.cooldown=.4;r.charging=false;r.chargeLeft=0;r.burstRemaining=0}
      }
    }
    advanceEnergyProjectiles(this.bolts,s,dt,{worldQuery:this.worldQuery,onPlayerHit:hitPlayer,onWorldHit:onImpact,secondaryTarget:randTarget,onSecondaryHit:onRandHit})
    if(this.phase==='leaving'&&this.leaveTime>6){this.phase='complete';this.scouts.forEach(r=>{if(!r.dead)r.view.root.visible=false;r.meleeEnabled=false});this.bolts.forEach(b=>b.active=false)}
  }
  updateClaw(r,dt,target,enabled,onHit){
    r.clawCooldown=Math.max(0,r.clawCooldown-dt)
    if(!enabled){r.clawAge=Infinity;r.state='IDLE';return}
    const range=ENTITY_ATTACK_RANGE+SCOUT_WIDTH*.22,distance=Math.hypot(target.x-r.position.x,target.z-r.position.z),face=Math.atan2(target.x-r.position.x,target.z-r.position.z)
    const close=distance<range&&Math.abs(target.height+.8-(r.position.y+r.height*.35))<2&&Math.abs(wrap(face-r.yaw))<.65
    // Normally walk into real melee reach. If Scott keeps retreating, show
    // one swipe after ten seconds; the contact check still forbids remote damage.
    const demonstrate=r.rigTest&&!r.rigTestStruck&&r.modeTime>=10
    if(r.mode==='ground'&&(close||demonstrate)&&r.clawCooldown<=0&&r.clawAge>=SCOUT_MOTION.clawDuration){r.clawAge=0;r.clawSide=1-r.clawSide;r.clawHit=false;r.clawCooldown=ENTITY_ATTACK_COOLDOWN;r.state='ATTACK';if(r.rigTest)r.rigTestStruck=true}
    if(r.clawAge<SCOUT_MOTION.clawDuration){
      r.clawAge+=dt
      if(!r.clawHit&&r.clawAge>=SCOUT_MOTION.clawImpact){
        r.clawHit=true;r.clawImpactPending=true
        if(close){const contact=r.clawContact;contact.source.copy(r.position);contact.source.y+=r.height*.35;contact.position.set(target.x,target.height+.8,target.z);contact.velocity.subVectors(contact.position,contact.source).normalize();this.ray.ray.set(contact.source,contact.velocity);if(!this.worldQuery.castWorld(this.ray.ray,contact.source.distanceTo(contact.position)).solid)onHit(contact)}
      }
      if(r.clawAge>=SCOUT_MOTION.clawDuration)r.state='IDLE'
    }
  }
}
