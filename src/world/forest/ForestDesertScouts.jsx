import {useLayoutEffect,useMemo} from 'react'
import {useFrame,useThree} from '@react-three/fiber'
import {useGLTF} from '@react-three/drei'
import {Group,Vector3} from 'three'
import {INVID_SCOUT_URL,createScoutView} from './invidScoutAsset.js'
import {DesertScoutPatrol,SCOUT_PATROL,SCOUT_ATTACK_DAMAGE} from './DesertScoutPatrol.js'
import {DesertClimaxSequence} from './DesertClimaxSequence.js'
import {DESERT_CLIMAX as C} from './forestClimaxConfig.js'
import {createScoutSquad,renderScoutSquad,disposeScoutSquad} from './scoutSquadRendering.js'
import {stage4World,stage4DesertHeight} from './forestStage4Config.js'
import {sampleRideHeight} from '../../vehicle/rideSurface.js'
import {registerMeleeTarget} from '../../player/meleeWorld.js'
import {damagePlayer,playerCombat} from '../../player/playerCombat.js'
import {rideUI} from '../../vehicle/rideUI.js'

useGLTF.preload(INVID_SCOUT_URL)
export default function ForestDesertScouts({runtime}){
  const asset=useGLTF(INVID_SCOUT_URL),{camera}=useThree()
  const resources=useMemo(()=>{
    const root=new Group();root.name='Desert_Invid_Scout_patrol';root.userData.prewarmVFX=true
    const views=Array.from({length:SCOUT_PATROL.count},(_,i)=>createScoutView(asset.scene,i,asset.animations)),opening=new DesertScoutPatrol(views,sampleRideHeight,Math.random,{rigTestId:0}),squad=createScoutSquad(root,views)
    squad.scouts=opening.scouts
    const sequence=new DesertClimaxSequence(opening,{onTransition:()=>window.dispatchEvent(new Event('level1-climax-transition')),onVictory:()=>window.dispatchEvent(new Event('level1-victory'))})
    return{root,opening,patrol:opening,views,batches:squad.batches,sequence,squads:[squad],climax:null,preparing:null,removeTargets:[],refs:0,actorState:null,recoveryAge:0,publishAge:0,actorPosition:new Vector3(),player:{x:0,z:0,height:0,speed:0}}
  },[asset.scene])
  function* prepareClimax(){
    const all=[]
    for(let group=0;group<C.count/C.squadSize;group++){
      const views=[]
      for(let i=0;i<C.squadSize;i++){const view=createScoutView(asset.scene,5+all.length,asset.animations);views.push(view);all.push(view);yield}
      resources.squads.push(createScoutSquad(resources.root,views));yield
    }
    const sample=(x,z)=>{
      const h=sampleRideHeight(x,z),world=stage4World.get()
      return Number.isFinite(h)||!world?.climaxPlain?h:world.position.y+stage4DesertHeight(x-world.position.x,z-world.position.z)
    }
    resources.climax=new DesertScoutPatrol(all,sample,Math.random,{climax:true,bolts:resources.opening.bolts})
    for(let group=0;group<6;group++)resources.squads[group+1].scouts=resources.climax.scouts.slice(group*5,group*5+5)
    resources.removeTargets.push(...resources.climax.scouts.map(registerMeleeTarget))
  }
  useLayoutEffect(()=>{
    resources.refs++;runtime.desertPatrol=resources.patrol;runtime.climaxSequence=resources.sequence
    resources.removeTargets=resources.opening.scouts.map(registerMeleeTarget)
    if(resources.climax)resources.removeTargets.push(...resources.climax.scouts.map(registerMeleeTarget))
    if(import.meta.env.DEV)window.__DESERT_SCOUTS__=resources
    return()=>{resources.removeTargets.forEach(fn=>fn());resources.opening.reset();resources.climax?.reset();if(runtime.desertPatrol===resources.patrol)delete runtime.desertPatrol;if(runtime.climaxSequence===resources.sequence)delete runtime.climaxSequence;if(import.meta.env.DEV)delete window.__DESERT_SCOUTS__;resources.refs--;setTimeout(()=>{if(!resources.refs)resources.squads.forEach(disposeScoutSquad)},0)}
  },[resources,runtime])
  useFrame((_,delta)=>{
    const s=runtime.state;if(!s)return
    if(resources.actorState!==s){
      resources.actorState=s;resources.recoveryAge=0;resources.opening.reset();resources.climax?.reset();resources.patrol=resources.opening
      resources.sequence.reset(!!runtime.resumeClimaxCheckpoint);runtime.resumeClimaxCheckpoint=false;rideUI.publish({climax:null})
    }
    const hip=runtime.scottInstance?.bones?.get('mixamorigHips'),player=resources.player
    if(hip)hip.getWorldPosition(resources.actorPosition)
    if(hip&&Math.hypot(resources.actorPosition.x-s.x,resources.actorPosition.z-s.z)<12){player.x=resources.actorPosition.x;player.z=resources.actorPosition.z;player.height=resources.actorPosition.y-.8}
    else{player.x=s.x;player.z=s.z;player.height=s.height}
    player.speed=s.speed
    player.dead=playerCombat.dead
    const dt=runtime.paused||playerCombat.dead?0:Math.min(delta,.1),world=stage4World.get(),sequence=resources.sequence
    if(playerCombat.dead&&!resources.playerWasDead)resources.patrol.stopCombat()
    resources.playerWasDead=playerCombat.dead
    if(sequence.active&&!resources.climax){
      resources.preparing ||=prepareClimax()
      const start=performance.now();if(dt>0)do{if(resources.preparing.next().done){resources.preparing=null;break}}while(performance.now()-start<3)
    }
    sequence.update(dt,player,world,runtime.randEscape,resources.climax)
    resources.patrol=sequence.phase==='battle'||sequence.phase==='victory'||sequence.phase==='failed'?resources.climax||resources.opening:resources.opening
    runtime.desertPatrol=resources.patrol
    resources.patrol.update(dt,player,camera,world,{
      allowAttack:!playerCombat.dead&&(sequence.phase==='opening'||sequence.phase==='battle'),randTarget:runtime.randEscape,
      onRandHit:b=>{runtime.randEscape?.receiveHit();runtime.combatVFX?.enemyImpact(b.position,b.velocity)},
      onPlayerHit:b=>{damagePlayer(SCOUT_ATTACK_DAMAGE,b.source);runtime.combatVFX?.enemyImpact(b.position,b.velocity)},
      onImpact:b=>runtime.combatVFX?.enemyWorldImpact(b.position,b.velocity),
    })
    if(!playerCombat.dead&&sequence.phase==='failed'&&world?.bound&&!sequence.completed){
      resources.recoveryAge+=dt
      if(resources.recoveryAge>=SCOUT_PATROL.retrySeconds){
        runtime.combatVFX?.clear()
        if(sequence.active){world.requestClimax();world.updateClimax(C.start+30,C.start+85);runtime.resetAt(world.startAt(C.start+30))}
        else runtime.resetAt(world.checkpoint||world.startAt(550))
        return
      }
    }else resources.recoveryAge=0
    resources.publishAge+=dt
    if(resources.publishAge>.15){resources.publishAge=0;rideUI.publish({climax:sequence.active?sequence.objective(runtime.randEscape):null})}
  },.05)
  // Gallant publishes hits at .12. Upload their per-instance flash/recoil in
  // this same rendered frame, after damage/FX but without moving the AI tick.
  useFrame(()=>{for(const squad of resources.squads)renderScoutSquad(squad,camera.position,runtime.combatVFX)},.13)
  return <primitive object={resources.root} dispose={null}/>
}
