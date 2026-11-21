import {useLayoutEffect,useMemo,useRef} from 'react'
import {useFrame,useThree} from '@react-three/fiber'
import {Html} from '@react-three/drei'
import {Raycaster,Vector3} from 'three'
import {CycloneShooterEncounter} from './CycloneShooterEncounter.js'
import {CycloneShooterCamera} from '../../vehicle/CycloneShooterCamera.js'
import {CycloneShooterPose} from '../../vehicle/CycloneShooterPose.js'
import {FOREST_STAGE3 as S} from './forestStage3Config.js'

export default function ForestStage3Encounter({runtime}){
  const {camera,gl}=useThree(),meshes=useRef([]),hud=useRef(),label=useRef(),reticle=useRef(),feedback=useRef(),hudAnchor=useRef()
  const resources=useMemo(()=>{
    const encounter=new CycloneShooterEncounter(),view=new CycloneShooterCamera(camera,runtime),raycaster=new Raycaster(),origin=new Vector3()
    return {encounter,camera:view,raycaster,origin,get weapon(){return runtime.gallant?.weapon}}
  },[camera,runtime])
  useLayoutEffect(()=>{
    runtime.stage3=resources
    const canvas=gl.domElement,e=resources.encounter,oldCursor=canvas.style.cursor
    const move=event=>{if(!e.active||runtime.paused)return;const r=canvas.getBoundingClientRect();e.pointer.set((event.clientX-r.left)/r.width*2-1,1-(event.clientY-r.top)/r.height*2)}
    const down=event=>{if(!e.active||runtime.paused||event.button!==0)return;move(event);e.firing=true;event.preventDefault()}
    const up=()=>{e.firing=false}
    const keys=event=>{
      if(!e.active||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName))return
      if(['KeyW','KeyA','KeyS','KeyD','KeyF','KeyT','KeyC','KeyG','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight','ControlLeft','ControlRight'].includes(event.code)){event.preventDefault();event.stopImmediatePropagation()}
    }
    canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerdown',down);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);window.addEventListener('blur',up);window.addEventListener('keydown',keys,true)
    if(import.meta.env.DEV)window.__FOREST_STAGE3__=resources
    return()=>{
      if(runtime.state)resources.camera.finish(runtime.state)
      runtime.scottInstance?.shooterPose?.restore();delete runtime.stage3
      runtime.combatVFX?.clear()
      canvas.style.cursor=oldCursor;canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerdown',down);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);window.removeEventListener('blur',up);window.removeEventListener('keydown',keys,true)
      if(import.meta.env.DEV)delete window.__FOREST_STAGE3__
    }
  },[resources,runtime,gl])
  useFrame((_,delta)=>{
    const r=resources,e=r.encounter,s=runtime.state,dt=runtime.paused?0:Math.min(delta,.1),instance=runtime.scottInstance
    if(!s||!r.weapon)return
    const active=e.active
    // Attach while the initial scene is warming, so the gun's shader and
    // textures are already available when the encounter raises Scott's arm.
    if(instance?.mountedMotion&&!runtime.armorController?.active)r.weapon.update(instance,e,s)
    if(hudAnchor.current){camera.getWorldDirection(r.origin);hudAnchor.current.position.copy(camera.position).addScaledVector(r.origin,10);hudAnchor.current.updateMatrixWorld(true)}
    gl.domElement.style.cursor=active?'none':''
    if(hud.current)hud.current.style.display=active?'block':'none'
    if(active){
      r.raycaster.setFromCamera(e.pointer,camera);e.target(r.raycaster.ray)
      if(instance){instance.shooterPose ||=new CycloneShooterPose(instance);instance.shooterPose.apply(e.aimPoint,e.canShoot,dt,true);r.weapon.update(instance,e,s)}
      if(e.firing&&!runtime.paused){
        const result=e.fire(r.raycaster.ray,s)
        if(result){
          runtime.combatVFX?.shot(r.weapon,result,e)
        }
      }
      if(label.current)label.current.textContent=`PLANO 3 · ${e.kills}/${e.drones.length} drones · Oleada ${Math.max(1,e.waveIndex+1)}/${S.waves.length} · ${e.phase==='exiting'?'Despejado':e.canShoot?'Mouse: apuntar · clic: disparar':e.reason&&e.maneuver>0?`${e.reason} · ambas manos al manubrio`:'Preparando disparo'}`
      if(reticle.current){reticle.current.style.left=`${(e.pointer.x+1)*50}%`;reticle.current.style.top=`${(1-e.pointer.y)*50}%`;reticle.current.style.color=e.canShoot?'#d0f5dc':'#e1af68'}
      if(feedback.current)feedback.current.style.opacity=String(e.playerHit/.35*.38)
    }else{if(!runtime.armorController?.active)r.weapon.root.visible=false;if(instance?.shooterPose)instance.shooterPose.blend=0}
    for(const d of e.drones){
      const mesh=meshes.current[d.id];if(!mesh)continue
      const visual=d.spawned&&active?runtime.combatVFX?.scoutVisual(d):null
      mesh.visible=d.spawned&&active&&(visual?visual.visible:!d.dead)
      mesh.position.copy(d.position);mesh.rotation.set(Math.sin(e.time*.7+d.id)*.13,e.time*.35+d.id,Math.sin(e.time*.9+d.id)*.1)
      if(d.flash>0){mesh.position.x+=Math.sin(d.flash*85)*.1;mesh.rotation.z+=Math.sin(d.flash*65)*.15}
      mesh.material.color.set(d.flash>0?'#fff5d7':'#a44ee0');mesh.material.emissive.set(d.flash>0?'#dfb8a0':d.attack<.65?'#792947':'#30123e')
    }
  },.1)
  return <>
    {resources.encounter.drones.map(({id})=><mesh key={id} ref={mesh=>meshes.current[id]=mesh} name={'Invid_prototype_'+id} visible={false} castShadow={false}>
      <boxGeometry args={[.9,.9,.9]}/><meshLambertMaterial color="#a44ee0" emissive="#30123e" transparent opacity={1} depthWrite/>
    </mesh>)}
    <group ref={hudAnchor}><Html fullscreen calculatePosition={(_,__,size)=>[size.width/2,size.height/2]} style={{pointerEvents:'none'}}><div ref={hud} style={{display:'none',position:'absolute',inset:0,pointerEvents:'none',fontFamily:'sans-serif'}}>
      <div ref={feedback} style={{position:'absolute',inset:0,opacity:0,boxShadow:'inset 0 0 100px 15px #cc3964'}}/>
      <div ref={label} style={{position:'absolute',top:105,left:'50%',transform:'translateX(-50%)',whiteSpace:'nowrap',padding:'9px 14px',background:'#10291dd9',color:'#e4eddf',fontSize:13}}/>
      <div ref={reticle} style={{position:'absolute',width:22,height:22,transform:'translate(-50%,-50%)',border:'1px solid currentColor',borderRadius:'50%',boxShadow:'0 0 2px #102019'}}> <span style={{position:'absolute',left:9,top:9,width:2,height:2,background:'currentColor'}}/></div>
    </div></Html></group>
  </>
}
