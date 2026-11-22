import {useLayoutEffect,useMemo,useRef} from 'react'
import {useFrame,useThree} from '@react-three/fiber'
import {Html,useGLTF} from '@react-three/drei'
import {Ray,Raycaster,Vector2,Vector3} from 'three'
import {MarsGallant,MARS_GALLANT_URL} from './MarsGallant.js'
import {ArmorGallantPose,armorWeaponAvailable} from './ArmorGallantPose.js'
import {ArmorHandPose} from './ArmorHandPose.js'
import {GALLANT_FIRE,GallantHitscan} from './GallantShot.js'
import {damagePlayer,playerCombat} from '../player/playerCombat.js'
import {armorGallantVisible} from './armorHandoff.js'
import {MountedGallantPose} from './MountedGallantPose.js'
import {CycloneShooterCamera} from './CycloneShooterCamera.js'
import {bikeGallantAvailable} from './bikeGallant.js'

useGLTF.preload(MARS_GALLANT_URL)
// Crosshair, camera aim and shot selection share the exact screen centre.
const armorReticle=new Vector2(0,0)

export default function GallantCombat({runtime}){
  const source=useGLTF(MARS_GALLANT_URL),{camera,gl}=useThree(),anchor=useRef(),hud=useRef(),reticle=useRef(),feedback=useRef(),label=useRef()
  const combat=useMemo(()=>({weapon:new MarsGallant(source.scene),bikeCamera:new CycloneShooterCamera(camera,runtime),pointer:new Vector2(.12,.08),mounted:false,hitscan:new GallantHitscan(),raycaster:new Raycaster(),ray:new Ray(),aimPoint:new Vector3(),endpoint:new Vector3(),origin:new Vector3(),forward:new Vector3(),active:false,aiming:false,firing:false,time:0,bolts:[],cooldown:0,recoil:0,hurt:0,hit:0,hitVersion:playerCombat.hitVersion,shots:0,hits:0,refs:0}),[source.scene,camera,runtime])
  useLayoutEffect(()=>{
    combat.refs++;runtime.gallant=combat;runtime.armorCombat=combat
    combat.receiveHit=(amount,source)=>{if(combat.active&&Number.isFinite(amount)&&amount>0)damagePlayer(amount,source)}
    const canvas=gl.domElement,oldCursor=canvas.style.cursor
    const enabled=()=>(runtime.armorController?.active||bikeGallantAvailable(runtime))&&!runtime.paused&&!playerCombat.dead
    const release=()=>{combat.aiming=combat.firing=false}
    const move=e=>{if(!enabled()||!bikeGallantAvailable(runtime))return;const rect=canvas.getBoundingClientRect();combat.pointer.set((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2)}
    const capture=e=>{if(e.button===2&&enabled()&&bikeGallantAvailable(runtime)){move(e);combat.aiming=true;runtime.cameraController?.end();runtime.orbit.enabled=false;e.stopImmediatePropagation()}}
    const down=e=>{if(!enabled()||![0,2].includes(e.button))return;move(e);if(e.button===2)combat.aiming=true;else combat.firing=true;e.preventDefault()}
    const up=e=>{if(e.button===2)combat.aiming=false;if(e.button===0)combat.firing=false}
    const menu=e=>{if(enabled())e.preventDefault()}
    // Mouse events report each button in a chord. Pointerdown only fires for
    // the first button, so RMB aim used to swallow the following LMB press.
    canvas.addEventListener('pointerdown',capture,true);canvas.addEventListener('pointermove',move);canvas.addEventListener('mousedown',down);canvas.addEventListener('contextmenu',menu);window.addEventListener('mouseup',up);window.addEventListener('pointercancel',release);window.addEventListener('blur',release)
    if(import.meta.env.DEV)window.__ARMOR_COMBAT__=combat
    return()=>{
      release();if(runtime.state)combat.bikeCamera.finish(runtime.state);runtime.scottInstance?.armorGallantPose?.reset();runtime.scottInstance?.shooterPose?.restore();combat.weapon.root.visible=false;combat.weapon.root.removeFromParent();combat.weapon.instance=null
      if(runtime.gallant===combat){delete runtime.gallant;delete runtime.armorCombat}
      if(import.meta.env.DEV)delete window.__ARMOR_COMBAT__
      canvas.removeEventListener('pointerdown',capture,true);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('mousedown',down);canvas.removeEventListener('contextmenu',menu);window.removeEventListener('mouseup',up);window.removeEventListener('pointercancel',release);window.removeEventListener('blur',release)
      combat.refs--;setTimeout(()=>{if(!combat.refs)combat.weapon.dispose()},0)
      canvas.style.cursor=oldCursor
    }
  },[combat,runtime,gl])
  // After native Armor gait/arm layers, before the gauntlet attachment pass.
  useFrame((_,delta)=>{
    const c=combat,instance=runtime.scottInstance,a=runtime.armorController,dt=runtime.paused?0:Math.min(delta,.1)
    const mounted=bikeGallantAvailable(runtime),active=!!a?.active||mounted
    if(active!==c.active||mounted!==c.mounted){c.aiming=c.firing=false;c.cooldown=c.recoil=c.hurt=c.hit=0;c.hitVersion=playerCombat.hitVersion;if(!active||mounted)instance?.armorGallantPose?.reset()}
    c.mounted=mounted
    c.active=active
    if(runtime.paused)c.aiming=c.firing=false
    if(playerCombat.hitVersion!==c.hitVersion){c.hitVersion=playerCombat.hitVersion;c.hurt=active||runtime.desertPatrol?.active?1:0}
    c.hurt=Math.max(0,c.hurt-dt*3.5)
    if(playerCombat.dead){c.aiming=c.firing=false;gl.domElement.style.cursor='';return}
    gl.domElement.style.cursor=mounted&&c.aiming?'none':''
    if(!active)return
    c.time+=dt;c.cooldown=Math.max(0,c.cooldown-dt);c.recoil=Math.max(0,c.recoil-dt/GALLANT_FIRE.recoilTime);c.hit=Math.max(0,c.hit-dt)
    c.raycaster.setFromCamera(mounted?c.pointer:armorReticle,camera);c.raycaster.ray.at(GALLANT_FIRE.range,c.aimPoint)
    if(mounted){
      if(runtime.stage3?.encounter.active){runtime.stage3.encounter.pointer.copy(c.pointer);runtime.stage3.encounter.target(c.raycaster.ray);c.aimPoint.copy(runtime.stage3.encounter.aimPoint)}
      if(instance?.mountedMotion){if(!(instance.shooterPose instanceof MountedGallantPose)){instance.shooterPose?.restore();instance.shooterPose=new MountedGallantPose(instance)}instance.shooterPose.applyMounted(c.aimPoint,c.aiming,dt,c.weapon)}
      return
    }
    if(instance?.mountedMotion){
      instance.armorGallantPose ||=new ArmorGallantPose(instance)
      const available=armorWeaponAvailable(a.state)
      instance.armorGallantPose.applyArmor(c.aimPoint,available&&(c.aiming||c.firing)&&!playerCombat.dead,a.state,dt,c.recoil,c.hurt)
      instance.armorHands ||=new ArmorHandPose(instance)
      if(available)instance.armorHands.apply(instance.armorGallantPose.aimBlend)
    }
  },-.47)
  // Both contexts feed one weapon instance and the already pooled combat FX.
  useFrame((_,delta)=>{
    const c=combat,w=c.weapon,instance=runtime.scottInstance,p3=runtime.stage3?.encounter,dt=runtime.paused?0:Math.min(delta,.1),pose=c.mounted?instance?.shooterPose:instance?.armorGallantPose,blend=c.mounted?pose?.blend:pose?.aimBlend
    if(instance?.mountedMotion)w.attach(instance)
    if(c.active&&pose){
      // The approved Armor mount is rigidly local to the hand in every pose.
      w.present(instance,!c.mounted||blend>.04,c.mounted?c.aimPoint:null,c.mounted?blend:1,!c.mounted)
      if(c.firing&&(!c.mounted||c.aiming)&&!runtime.paused&&!playerCombat.dead&&blend>.82&&c.cooldown<=0&&(c.mounted||armorWeaponAvailable(runtime.armorController.state))){
        c.raycaster.setFromCamera(c.mounted?c.pointer:armorReticle,camera)
        if(p3?.active){p3.target(c.raycaster.ray);c.endpoint.copy(p3.aimPoint)}else c.endpoint.copy(c.hitscan.cast(c.raycaster.ray).point)
        // Camera establishes the crosshair; a second ray from the real muzzle
        // prevents shooting through cover beside Scott's shoulder or hand.
        w.getMuzzle(c.origin);c.forward.subVectors(c.endpoint,c.origin)
        const range=Math.min(GALLANT_FIRE.range,c.forward.length()+.025)
        c.ray.set(c.origin,c.forward.normalize())
        const result=p3?.active?p3.fire(c.ray,runtime.state):c.hitscan.fire(c.ray,range)
        if(!result)return
        c.cooldown=GALLANT_FIRE.interval;c.recoil=1;c.shots++
        if(result.hit!==null){c.hit=.18;c.hits++}
        runtime.combatVFX?.shot(w,result,p3?.active?p3:c)
      }
    }else{
      if(instance?.mountedMotion&&armorGallantVisible(runtime.armorController,runtime.transformEntry))w.present(instance,true,null)
      else w.root.visible=false
    }
    const patrol=runtime.desertPatrol
    runtime.combatVFX?.update(dt,p3?.active?p3:patrol?.active?patrol:c,w,camera)
    if(anchor.current){camera.getWorldDirection(c.forward);anchor.current.position.copy(camera.position).addScaledVector(c.forward,10);anchor.current.updateMatrixWorld(true)}
    if(hud.current)hud.current.style.display=c.active||patrol?.active&&(c.hurt>0||playerCombat.dead)?'block':'none'
    if(label.current)label.current.style.display=runtime.paused?'block':'none'
    if(reticle.current){reticle.current.style.opacity=String(c.active&&!playerCombat.dead?blend||0:0);reticle.current.style.left=`${((c.mounted?c.pointer.x:0)+1)*50}%`;reticle.current.style.top=`${(1-(c.mounted?c.pointer.y:0))*50}%`;reticle.current.style.color=c.hit>0?'#fff6a0':'#e3efd6'}
    if(feedback.current)feedback.current.style.opacity=String(c.hurt*.4)
    if(label.current)label.current.textContent=playerCombat.dead?'Scott derrotado · Reintentar desde el checkpoint':c.active?`Gallant · clic derecho: apuntar · clic izquierdo: disparar${patrol?.active||c.hurt>0?' · Salud '+playerCombat.playerHealth:''}`:`Impacto · Salud ${playerCombat.playerHealth}`
  },.12)
  return <group ref={anchor}><Html fullscreen calculatePosition={(_,__,size)=>[size.width/2,size.height/2]} style={{pointerEvents:'none'}}><div ref={hud} style={{display:'none',position:'absolute',inset:0,pointerEvents:'none',fontFamily:'sans-serif'}}>
    <div ref={feedback} style={{position:'absolute',inset:0,boxShadow:'inset 0 0 80px 10px #ba4268',opacity:0}}/>
    <div ref={reticle} className="armor-reticle" style={{position:'absolute',left:`${(armorReticle.x+1)*50}%`,top:`${(1-armorReticle.y)*50}%`,width:18,height:18,transform:'translate(-50%,-50%)',border:'1px solid currentColor',borderRadius:'50%',opacity:0}}/>
    <div ref={label} style={{position:'absolute',bottom:65,left:'50%',transform:'translateX(-50%)',fontSize:12,color:'#e0ecda',background:'#10291dc0',padding:'5px 10px',whiteSpace:'nowrap'}}/>
  </div></Html></group>
}
