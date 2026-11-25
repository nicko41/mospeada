import {DESERT_CLIMAX as C} from './forestClimaxConfig.js'

// A short gameplay handoff, not a cinematic/input controller. Scott's state,
// camera, transform clock and controls are never written here.
export class DesertClimaxSequence{
  constructor(opening,{onTransition=()=>{},onVictory=()=>{}}={}){this.opening=opening;this.onTransition=onTransition;this.onVictory=onVictory;this.reset()}
  reset(resume=false){this.phase=resume?'resume':'opening';this.age=0;this.retryAge=0;this.completed=false;this.transitionSent=false;this.climax=null;this.revealed=false}
  get active(){return this.phase!=='opening'}
  update(dt,scott,world,rand,climax){
    if(dt<=0||!world?.bound||!rand)return
    this.age+=dt;this.climax=climax
    if(this.phase==='resume'){
      this.opening.phase='complete';this.opening.defeated=true;this.opening.stopCombat();this.opening.scouts.forEach(r=>{r.dead=true;r.meleeEnabled=false;r.view.root.visible=false})
      world.requestClimax();world.updateClimax(world.distance(scott.z),world.distance(scott.z)+55)
      if(!rand.resumeClimax(scott,world))return
      this.phase='pursuit'
    }
    if(this.phase==='opening'&&this.opening.defeated){
      this.phase='departure';this.age=0;this.opening.stopCombat();world.requestClimax();rand.beginClimax(scott,world)
      this.transitionSent=true;this.onTransition()
    }
    if(!this.active)return
    world.updateClimax(world.distance(scott.z),rand.active?world.distance(rand.z):world.distance(scott.z))
    // Place the actual squads as soon as the preceding fight is complete and
    // their terrain is ready, well before the ridge reveals the lower plain.
    // Crossing the battle trigger never creates or relocates these Scouts.
    if(!this.revealed&&climax&&world.climaxPlain?.ready){climax.startClimax(world);this.revealed=true}
    if(this.revealed&&(this.phase==='departure'||this.phase==='pursuit'))climax.updatePreview(dt)
    if(this.phase==='departure'&&rand.climaxPhase==='escaping'){this.phase='pursuit';this.age=0}
    if(this.phase==='pursuit'&&climax&&world.climaxPlain?.ready&&world.distance(scott.z)>=C.start-220&&Math.max(world.distance(scott.z),world.distance(rand.z))>=C.revealDistance){
      climax.previousPlayer.set(scott.x,scott.height,scott.z);climax.beginAmbush();rand.threats=climax.scouts;this.phase='battle';this.age=0
    }
    if((this.phase==='battle'||this.phase==='pursuit')&&rand.dead){this.phase='failed';this.retryAge=0;climax?.stopCombat()}
    if(this.phase==='battle'&&climax?.defeated&&!scott.dead){this.phase='victory';this.completed=true;rand.protected=true;climax.stopCombat();this.onVictory()}
    if(this.phase==='failed')this.retryAge+=dt
  }
  objective(rand){
    return{phase:this.phase,kills:this.climax?.kills||0,total:C.count,randHealth:rand?.health??100,victory:this.completed,text:this.phase==='victory'?'Nivel 1 completado · Rand protegido':this.phase==='failed'?'Rand abatido · Reintentando la persecución':this.phase==='departure'?'Rand no confía en Scott · Seguilo':this.phase==='battle'?`Seguí y protegé a Rand · Eliminá a los ${C.count} Invid`:'Seguí a Rand por el camino central'}
  }
}
