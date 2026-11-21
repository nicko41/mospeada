import {useLayoutEffect,useMemo} from 'react'
import {useFrame,useThree} from '@react-three/fiber'
import {useGLTF} from '@react-three/drei'
import {Color,DynamicDrawUsage,Group,InstancedMesh,Matrix4,Vector3} from 'three'
import {INVID_SCOUT_URL,createScoutView,updateScoutLOD} from './invidScoutAsset.js'
import {DesertScoutPatrol,SCOUT_PATROL} from './DesertScoutPatrol.js'
import {stage4World} from './forestStage4Config.js'
import {sampleRideHeight} from '../../vehicle/rideSurface.js'
import {registerMeleeTarget} from '../../player/meleeWorld.js'
import {damagePlayer,playerCombat} from '../../player/playerCombat.js'
import {ENTITY_ATTACK_DAMAGE} from '../../player/meleeConfig.js'
import {createScoutDeathGeometry,createScoutDeathMaterial} from './scoutDeathAppearance.js'

useGLTF.preload(INVID_SCOUT_URL)
export default function ForestDesertScouts({runtime}){
  const asset=useGLTF(INVID_SCOUT_URL),{camera}=useThree()
  const resources=useMemo(()=>{
    const root=new Group();root.name='Desert_Invid_Scout_patrol';root.userData.prewarmVFX=true
    const views=Array.from({length:SCOUT_PATROL.count},(_,i)=>createScoutView(asset.scene,i))
    const deathMaterial=createScoutDeathMaterial(views[0].levels[0].material)
    // Five transform/anchor frames, but a single instanced draw per LOD.
    // The simulation views stay outside the rendered scene to avoid duplicates.
    const batches=views[0].levels.map((level,i)=>{
      const batch=new InstancedMesh(createScoutDeathGeometry(level.geometry,SCOUT_PATROL.count),deathMaterial,SCOUT_PATROL.count);batch.name='Invid_Scout_LOD_'+i
      batch.count=0;batch.castShadow=false;batch.receiveShadow=true;batch.instanceMatrix.setUsage(DynamicDrawUsage);for(let n=0;n<SCOUT_PATROL.count;n++)batch.setColorAt(n,new Color());root.add(batch);return batch
    })
    const patrol=new DesertScoutPatrol(views,sampleRideHeight)
    return {root,views,batches,deathMaterial,patrol,refs:0,actorState:null,recoveryAge:0,actorPosition:new Vector3(),visualMatrix:new Matrix4(),white:new Color(),player:{x:0,z:0,height:0,speed:0}}
  },[asset.scene])
  useLayoutEffect(()=>{
    resources.refs++;runtime.desertPatrol=resources.patrol
    const remove=resources.patrol.scouts.map(registerMeleeTarget)
    if(import.meta.env.DEV)window.__DESERT_SCOUTS__=resources
    return()=>{remove.forEach(fn=>fn());resources.patrol.reset();if(runtime.desertPatrol===resources.patrol)delete runtime.desertPatrol;if(import.meta.env.DEV)delete window.__DESERT_SCOUTS__;resources.refs--;setTimeout(()=>{if(!resources.refs){resources.batches.forEach(b=>{b.dispose();b.geometry.dispose()});resources.deathMaterial.dispose()}},0)}
  },[resources,runtime])
  useFrame((_,delta)=>{
    const s=runtime.state;if(!s)return
    if(resources.actorState!==s){resources.actorState=s;resources.recoveryAge=0;resources.patrol.reset()}
    // Follow the existing visible actor anchor as well as the vehicle state;
    // Scott can be offset from the bike during transformation/jumps.
    const hip=runtime.scottInstance?.bones?.get('mixamorigHips'),player=resources.player
    if(hip)hip.getWorldPosition(resources.actorPosition)
    // A checkpoint can leave Scott's visual handoff interpolating from the old
    // pose briefly. That interpolation is not travel across the entire level.
    if(hip&&Math.hypot(resources.actorPosition.x-s.x,resources.actorPosition.z-s.z)<12){player.x=resources.actorPosition.x;player.z=resources.actorPosition.z;player.height=resources.actorPosition.y-.8}
    else{player.x=s.x;player.z=s.z;player.height=s.height}
    player.speed=s.speed
    const dt=runtime.paused?0:Math.min(delta,.1),world=stage4World.get()
    resources.patrol.update(dt,player,camera,world,{
      allowAttack:!playerCombat.dead,
      randTarget:runtime.randEscape,
      onRandHit:b=>{runtime.randEscape?.receiveHit();runtime.combatVFX?.enemyImpact(b.position,b.velocity)},
      onPlayerHit:b=>{damagePlayer(ENTITY_ATTACK_DAMAGE,b.source);runtime.combatVFX?.enemyImpact(b.position,b.velocity)},
      onImpact:b=>runtime.combatVFX?.enemyWorldImpact(b.position,b.velocity),
    })
    if(playerCombat.dead&&resources.patrol.active&&world?.bound){
      resources.recoveryAge+=dt
      if(resources.recoveryAge>=SCOUT_PATROL.retrySeconds){
        resources.patrol.reset();resources.batches.forEach(b=>b.count=0);runtime.combatVFX?.clear()
        runtime.resetAt(world.checkpoint||world.startAt(550));return
      }
    }else resources.recoveryAge=0
    resources.batches.forEach(b=>b.count=0)
    for(const scout of resources.patrol.scouts){
      const view=scout.view;if(!view.root.visible)continue
      if(scout.dead&&!resources.patrol.active)continue
      const visual=runtime.combatVFX?.scoutVisual(scout)
      if(visual&&!visual.visible)continue
      updateScoutLOD(view,camera.position)
      const batch=resources.batches[view.lod],matrix=resources.visualMatrix.copy(view.levels[view.lod].matrixWorld)
      // Presentation only: neither launcher transforms nor logical movement,
      // fall physics, rigging or health are affected by flash/recoil/dissolve.
      if(visual){matrix.elements[12]+=visual.recoil.x;matrix.elements[13]+=visual.recoil.y;matrix.elements[14]+=visual.recoil.z}
      batch.geometry.attributes.aScoutDeath.setXY(batch.count,visual?.emissive||0,visual?.opacity??1)
      batch.setMatrixAt(batch.count,matrix);batch.setColorAt(batch.count++,visual?.tint||resources.white)
    }
    for(const batch of resources.batches){batch.instanceMatrix.needsUpdate=true;batch.instanceColor.needsUpdate=true;batch.geometry.attributes.aScoutDeath.needsUpdate=true;batch.computeBoundingBox();batch.computeBoundingSphere()}
  },.05)
  return <primitive object={resources.root} dispose={null}/>
}
