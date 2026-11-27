import {useLayoutEffect,useMemo,useRef} from 'react'
import {useFrame,useThree} from '@react-three/fiber'
import {Html} from '@react-three/drei'
import {Vector3} from 'three'
import {CycloneShooterEncounter} from './CycloneShooterEncounter.js'
import {FOREST_STAGE3 as S} from './forestStage3Config.js'
import {damagePlayer,playerCombat} from '../../player/playerCombat.js'
import {gameAudio} from '../../audio/gameAudio.js'
import {DroneFlightSound} from '../../audio/DroneFlightSound.js'
import {playEnemyExplosion} from '../../audio/enemyAudio.js'
import {useGLTF} from '../../loading/resources.js'
import {INVID_DRONE_URL,InvidDroneSquad} from './InvidDroneSquad.js'

export default function ForestStage3Encounter({runtime}){
  const asset=useGLTF(INVID_DRONE_URL),{camera}=useThree(),hud=useRef(),label=useRef(),feedback=useRef(),hudAnchor=useRef()
  const resources=useMemo(()=>{
    const encounter=new CycloneShooterEncounter({onDestroyed:target=>playEnemyExplosion(gameAudio,'droneExplosion',target,camera.position)}),origin=new Vector3(),flightAudio=new DroneFlightSound(gameAudio)
    const squad=new InvidDroneSquad(asset.scene,encounter.drones.length)
    return {encounter,origin,flightAudio,squad,refs:0}
  },[asset,camera,runtime])
  useLayoutEffect(()=>{
    resources.refs++
    runtime.stage3=resources
    const e=resources.encounter
    e.onPlayerHit=b=>damagePlayer(playerCombat.playerMaxHealth*S.boltDamageFraction,b.source)
    if(import.meta.env.DEV)window.__FOREST_STAGE3__=resources
    return()=>{
      resources.flightAudio.dispose()
      resources.refs--;setTimeout(()=>{if(!resources.refs)resources.squad.dispose()},0)
      e.onPlayerHit=null;delete runtime.stage3
      runtime.combatVFX?.clear()
      if(import.meta.env.DEV)delete window.__FOREST_STAGE3__
    }
  },[resources,runtime])
  useFrame((_,delta)=>{
    const r=resources,e=r.encounter,s=runtime.state
    if(!s)return
    const active=e.active
    r.flightAudio.update({encounter:e,listener:camera.position,paused:runtime.paused,enabled:!playerCombat.dead&&!runtime.opening?.active&&!runtime.ending?.holding})
    if(hudAnchor.current){camera.getWorldDirection(r.origin);hudAnchor.current.position.copy(camera.position).addScaledVector(r.origin,10);hudAnchor.current.updateMatrixWorld(true)}
    if(hud.current)hud.current.style.display=active?'block':'none'
    if(label.current)label.current.style.display=runtime.paused?'block':'none'
    if(active&&!playerCombat.dead){
      if(label.current)label.current.textContent=`PLANO 3 · ${e.kills}/${e.drones.length} drones · Oleada ${Math.max(1,e.waveIndex+1)}/${S.waves.length} · ${e.phase==='exiting'?'Despejado':'WASD: manejar · clic derecho: POV y apuntar · clic izquierdo: disparar'}`
      if(feedback.current)feedback.current.style.opacity=String(e.playerHit/.35*.38)
    }
    r.squad.update(e,s,camera.position,runtime.combatVFX)
  },.1)
  return <>
    <primitive object={resources.squad.root} dispose={null}/>
    <group ref={hudAnchor}><Html fullscreen calculatePosition={(_,__,size)=>[size.width/2,size.height/2]} style={{pointerEvents:'none'}}><div ref={hud} style={{display:'none',position:'absolute',inset:0,pointerEvents:'none',fontFamily:'sans-serif'}}>
      <div ref={feedback} style={{position:'absolute',inset:0,opacity:0,boxShadow:'inset 0 0 100px 15px #cc3964'}}/>
      <div ref={label} style={{position:'absolute',top:105,left:'50%',transform:'translateX(-50%)',whiteSpace:'nowrap',padding:'9px 14px',background:'#10291dd9',color:'#e4eddf',fontSize:13}}/>
    </div></Html></group>
  </>
}
