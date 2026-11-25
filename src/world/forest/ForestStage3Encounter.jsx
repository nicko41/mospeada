import {useLayoutEffect,useMemo,useRef} from 'react'
import {useFrame,useThree} from '@react-three/fiber'
import {Html} from '@react-three/drei'
import {Vector3} from 'three'
import {CycloneShooterEncounter} from './CycloneShooterEncounter.js'
import {FOREST_STAGE3 as S} from './forestStage3Config.js'
import {damagePlayer,playerCombat} from '../../player/playerCombat.js'

export default function ForestStage3Encounter({runtime}){
  const {camera}=useThree(),meshes=useRef([]),hud=useRef(),label=useRef(),feedback=useRef(),hudAnchor=useRef()
  const resources=useMemo(()=>{
    const encounter=new CycloneShooterEncounter(),origin=new Vector3()
    return {encounter,origin}
  },[camera,runtime])
  useLayoutEffect(()=>{
    runtime.stage3=resources
    const e=resources.encounter
    e.onPlayerHit=b=>damagePlayer(playerCombat.playerMaxHealth*S.boltDamageFraction,b.source)
    if(import.meta.env.DEV)window.__FOREST_STAGE3__=resources
    return()=>{
      e.onPlayerHit=null;delete runtime.stage3
      runtime.combatVFX?.clear()
      if(import.meta.env.DEV)delete window.__FOREST_STAGE3__
    }
  },[resources,runtime])
  useFrame((_,delta)=>{
    const r=resources,e=r.encounter,s=runtime.state
    if(!s)return
    const active=e.active
    if(hudAnchor.current){camera.getWorldDirection(r.origin);hudAnchor.current.position.copy(camera.position).addScaledVector(r.origin,10);hudAnchor.current.updateMatrixWorld(true)}
    if(hud.current)hud.current.style.display=active?'block':'none'
    if(label.current)label.current.style.display=runtime.paused?'block':'none'
    if(active&&!playerCombat.dead){
      if(label.current)label.current.textContent=`PLANO 3 · ${e.kills}/${e.drones.length} drones · Oleada ${Math.max(1,e.waveIndex+1)}/${S.waves.length} · ${e.phase==='exiting'?'Despejado':'WASD: manejar · clic derecho: POV y apuntar · clic izquierdo: disparar'}`
      if(feedback.current)feedback.current.style.opacity=String(e.playerHit/.35*.38)
    }
    for(const d of e.drones){
      const mesh=meshes.current[d.id];if(!mesh)continue
      const visual=d.spawned&&active?runtime.combatVFX?.scoutVisual(d):null
      mesh.visible=d.spawned&&active&&(visual?visual.visible:!d.dead)
      mesh.position.copy(d.position);mesh.rotation.set(Math.sin(e.time*.7+d.id)*.13,e.time*.35+d.id,Math.sin(e.time*.9+d.id)*.1)
      if(d.flash>0){mesh.position.x+=Math.sin(d.flash*85)*.1;mesh.rotation.z+=Math.sin(d.flash*65)*.15}
      mesh.material.color.set('#a44ee0');mesh.material.emissive.set(d.attack<.65?'#792947':'#30123e')
    }
  },.1)
  return <>
    <group name="Invid_drone_preparation" userData={{prewarmVFX:true}}>{resources.encounter.drones.map(({id})=><mesh key={id} ref={mesh=>meshes.current[id]=mesh} name={'Invid_prototype_'+id} visible={false} castShadow={false}>
      <boxGeometry args={[.9,.9,.9]}/><meshLambertMaterial color="#a44ee0" emissive="#30123e" transparent opacity={1} depthWrite/>
    </mesh>)}</group>
    <group ref={hudAnchor}><Html fullscreen calculatePosition={(_,__,size)=>[size.width/2,size.height/2]} style={{pointerEvents:'none'}}><div ref={hud} style={{display:'none',position:'absolute',inset:0,pointerEvents:'none',fontFamily:'sans-serif'}}>
      <div ref={feedback} style={{position:'absolute',inset:0,opacity:0,boxShadow:'inset 0 0 100px 15px #cc3964'}}/>
      <div ref={label} style={{position:'absolute',top:105,left:'50%',transform:'translateX(-50%)',whiteSpace:'nowrap',padding:'9px 14px',background:'#10291dd9',color:'#e4eddf',fontSize:13}}/>
    </div></Html></group>
  </>
}
