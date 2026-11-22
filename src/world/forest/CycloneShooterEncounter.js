import {Vector2,Vector3,MathUtils} from 'three'
import {FOREST_STAGE3 as S,stage3PathX,stage3Height,stage3Yaw} from './forestStage3Config.js'
import {GallantTargeting} from '../../vehicle/GallantShot.js'
import {createEnergyProjectiles,advanceEnergyProjectiles} from '../../vehicle/EnergyProjectiles.js'
const droneBounds=(d,box)=>{box.min.copy(d.position).addScalar(-.65);box.max.copy(d.position).addScalar(.65)}
const droneEligible=d=>d.spawned&&!d.dead
export class CycloneShooterEncounter{
  constructor(){
    this.pointer=new Vector2(.12,.08);this.aimPoint=new Vector3();this.targeting=new GallantTargeting();this.scratch=new Vector3()
    this.drones=S.waves.flatMap((count,wave)=>Array.from({length:count},(_,slot)=>({wave,slot,position:new Vector3()}))).map((d,id)=>({...d,id}))
    this.bolts=createEnergyProjectiles(S.maxEnemyBolts)
    this.reset()
  }
  get active(){return ['entering','active','exiting'].includes(this.phase)}
  get canShoot(){return this.active}
  get remaining(){return this.drones.length-this.kills}
  reset(){
    this.phase='idle';this.time=0;this.phaseTime=0;this.kills=0;this.maneuver=0;this.maneuverCooldown=0;this.reason='';this.fireCooldown=0;this.firing=false;this.hitsTaken=0;this.playerHit=0;this.airborne=false;this.exitAnchor=null;this.shots=0;this.maneuvers=0
    this.waveIndex=-1;this.waveStartedAt=0;this.nextWaveAt=null;this.enemyShots=0
    for(const d of this.drones)Object.assign(d,{spawned:false,initialized:false,dead:false,hp:S.droneHealth,flash:0,death:0,attack:S.firstAttack+d.slot*.12,burstLeft:S.burstShots})
    this.bolts.forEach(b=>{b.active=false})
  }
  observe(s,eligible=true){
    if(this.phase==='idle'&&eligible&&s.z<=S.triggerZ&&s.riderMode==='mounted'&&!s.airborne&&s.frontGrounded&&s.rearGrounded){this.phase='entering';this.phaseTime=0;return true}return false
  }
  startWave(index){this.waveIndex=index;this.waveStartedAt=this.time;this.nextWaveAt=null}
  drive(s,dt){
    if(!this.active)return null
    this.time+=dt;this.phaseTime+=dt;this.fireCooldown=Math.max(0,this.fireCooldown-dt);this.playerHit=Math.max(0,this.playerHit-dt)
    if(this.phase==='entering'&&this.phaseTime>=S.entryTime){this.phase='active';this.phaseTime=0}
    if(this.phase==='exiting'&&this.phaseTime>=S.exitTime){this.phase='complete';return null}
    // Only advance the encounter clock. The player's driving inputs always win.
    return null
  }
  move(s,dt){
    if(!this.active)return
    this.airborne=s.airborne
    const fx=Math.sin(s.travelYaw??s.yaw),fz=Math.cos(s.travelYaw??s.yaw),rx=-fz,rz=fx
    if(this.phase==='active'){
      if(this.waveIndex<0&&this.time>=S.entryTime+.1)this.startWave(0)
      else if(this.nextWaveAt!==null&&this.time>=this.nextWaveAt)this.startWave(this.waveIndex+1)
    }
    for(const d of this.drones){
      d.flash=Math.max(0,d.flash-dt);d.death=Math.max(0,d.death-dt)
      if(d.dead)continue
      const spawnAt=this.waveStartedAt+d.slot*S.spawnStagger
      if(!d.spawned&&d.wave===this.waveIndex&&this.time>=spawnAt)d.spawned=true
      if(!d.spawned)continue
      const approach=1-MathUtils.smoothstep(d.attack,.15,.8),ahead=16+d.slot*1.5-approach*6,side=[4,-4,0][d.slot]+Math.sin(this.time*1.8+d.id*2)*1.5
      const x=s.x+fx*ahead+rx*side,z=s.z+fz*ahead+rz*side,y=Math.max(s.height+2.2,stage3Height(x,z)+2.2)+d.slot*.55+Math.sin(this.time*2.2+d.id)*.55
      if(!d.initialized||this.time-spawnAt<dt*2){d.position.set(x,y,z);d.initialized=true}else d.position.lerp(this.scratch.set(x,y,z),1-Math.exp(-dt*8))
      d.attack-=dt
      if(d.attack<=0){
        const bolt=this.bolts.find(b=>!b.active)
        if(bolt){bolt.active=true;bolt.life=S.boltLifetime;bolt.position.copy(d.position);let flight=d.position.distanceTo(this.scratch.set(s.x,s.height+1,s.z))/S.boltSpeed
          for(let n=0;n<3;n++){this.scratch.set(s.x+fx*s.speed*flight,s.height+1,s.z+fz*s.speed*flight);flight=d.position.distanceTo(this.scratch)/S.boltSpeed}
          bolt.velocity.copy(this.scratch).sub(d.position).normalize().multiplyScalar(S.boltSpeed);bolt.previous.copy(bolt.position);this.enemyShots++
        }
        d.burstLeft--
        if(d.burstLeft>0)d.attack=S.burstInterval
        else{d.burstLeft=S.burstShots;d.attack=S.attackInterval+d.slot*.12}
      }
    }
    advanceEnergyProjectiles(this.bolts,s,dt,{onPlayerHit:b=>{this.playerHit=.35;this.hitsTaken++;this.onPlayerHit?.(b)}})
  }
  target(ray){
    return this.targeting.target(ray,this.drones,this.aimPoint,droneBounds,droneEligible)
  }
  fire(ray,s){
    if(!this.canShoot||this.fireCooldown>0)return null
    this.fireCooldown=S.fireInterval;this.shots++;const hit=this.target(ray)
    if(hit){hit.hp--;hit.flash=.18;if(hit.hp===0){hit.dead=true;hit.death=.3;this.kills++
      if(this.remaining===0){this.phase='exiting';this.phaseTime=0;this.firing=false;this.exitAnchor={x:stage3PathX(s.z-35),z:s.z-35,yaw:stage3Yaw(s.z-35),label:'Salida Plano 3'}}
      else if(this.drones.filter(d=>d.wave===this.waveIndex).every(d=>d.dead))this.nextWaveAt=this.time+S.waveBreak
    }}
    return {hit:hit?.id??null,point:this.aimPoint,destroyed:hit?.dead??false,hp:hit?.hp??null}
  }
}
