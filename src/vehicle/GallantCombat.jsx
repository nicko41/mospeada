import {useLayoutEffect,useMemo,useRef} from 'react'
import {useFrame,useThree} from '@react-three/fiber'
import {Html,useGLTF} from '@react-three/drei'
import {Ray,Raycaster,Vector2,Vector3} from 'three'
import {MarsGallant,MARS_GALLANT_URL} from './MarsGallant.js'
import {ArmorGallantPose,armorWeaponAvailable} from './ArmorGallantPose.js'
import {GALLANT_FIRE,GallantHitscan} from './GallantShot.js'
import {damagePlayer,playerCombat} from '../player/playerCombat.js'

useGLTF.preload(MARS_GALLANT_URL)
// Crosshair, camera aim and shot selection share the exact screen centre.
const armorReticle=new Vector2(0,0)

export default function GallantCombat({runtime}){
  const source=useGLTF(MARS_GALLANT_URL),{camera,gl}=useThree(),anchor=useRef(),hud=useRef(),reticle=useRef(),feedback=useRef(),label=useRef()
  const combat=useMemo(()=>({weapon:new MarsGallant(source.scene),hitscan:new GallantHitscan(),raycaster:new Raycaster(),ray:new Ray(),aimPoint:new Vector3(),endpoint:new Vector3(),origin:new Vector3(),forward:new Vector3(),active:false,aiming:false,firing:false,time:0,bolts:[],cooldown:0,recoil:0,hurt:0,hit:0,hitVersion:playerCombat.hitVersion,shots:0,hits:0,refs:0}),[source.scene])
  useLayoutEffect(()=>{
    combat.refs++;runtime.gallant=combat;runtime.armorCombat=combat
    combat.receiveHit=(amount,source)=>{if(combat.active&&Number.isFinite(amount)&&amount>0)damagePlayer(amount,source)}
    const canvas=gl.domElement
    const enabled=()=>runtime.armorController?.active&&!runtime.stage3?.encounter.active&&!runtime.paused
    const release=()=>{combat.aiming=combat.firing=false}
    const down=e=>{if(!enabled()||![0,2].includes(e.button))return;if(e.button===2)combat.aiming=true;else combat.firing=true;e.preventDefault()}
    const up=e=>{if(e.button===2)combat.aiming=false;if(e.button===0)combat.firing=false}
    const menu=e=>{if(enabled())e.preventDefault()}
    // Mouse events report each button in a chord. Pointerdown only fires for
    // the first button, so RMB aim used to swallow the following LMB press.
    canvas.addEventListener('mousedown',down);canvas.addEventListener('contextmenu',menu);window.addEventListener('mouseup',up);window.addEventListener('pointercancel',release);window.addEventListener('blur',release)
    if(import.meta.env.DEV)window.__ARMOR_COMBAT__=combat
    return()=>{
      release();runtime.scottInstance?.armorGallantPose?.reset();combat.weapon.root.visible=false;combat.weapon.root.removeFromParent();combat.weapon.instance=null
      if(runtime.gallant===combat){delete runtime.gallant;delete runtime.armorCombat}
      if(import.meta.env.DEV)delete window.__ARMOR_COMBAT__
      canvas.removeEventListener('mousedown',down);canvas.removeEventListener('contextmenu',menu);window.removeEventListener('mouseup',up);window.removeEventListener('pointercancel',release);window.removeEventListener('blur',release)
      combat.refs--;setTimeout(()=>{if(!combat.refs)combat.weapon.dispose()},0)
    }
  },[combat,runtime,gl])
  // After native Armor gait/arm layers, before the gauntlet attachment pass.
  useFrame((_,delta)=>{
    const c=combat,instance=runtime.scottInstance,a=runtime.armorController,dt=runtime.paused?0:Math.min(delta,.1)
    const active=!!a?.active&&!runtime.stage3?.encounter.active
    if(active!==c.active){c.aiming=c.firing=false;c.cooldown=c.recoil=c.hurt=c.hit=0;c.hitVersion=playerCombat.hitVersion;if(!active)instance?.armorGallantPose?.reset()}
    c.active=active
    if(runtime.paused)c.aiming=c.firing=false
    if(playerCombat.hitVersion!==c.hitVersion){c.hitVersion=playerCombat.hitVersion;c.hurt=active||runtime.desertPatrol?.active?1:0}
    c.hurt=Math.max(0,c.hurt-dt*3.5)
    if(!active)return
    c.time+=dt;c.cooldown=Math.max(0,c.cooldown-dt);c.recoil=Math.max(0,c.recoil-dt/GALLANT_FIRE.recoilTime);c.hit=Math.max(0,c.hit-dt)
    c.raycaster.setFromCamera(armorReticle,camera);c.raycaster.ray.at(GALLANT_FIRE.range,c.aimPoint)
    if(instance?.mountedMotion){
      instance.armorGallantPose ||=new ArmorGallantPose(instance)
      const available=armorWeaponAvailable(a.state)
      instance.armorGallantPose.applyArmor(c.aimPoint,available&&(c.aiming||c.firing)&&!playerCombat.dead,a.state,dt,c.recoil,c.hurt)
    }
  },-.47)
  // Both contexts feed one weapon instance and the already pooled combat FX.
  useFrame((_,delta)=>{
    const c=combat,w=c.weapon,instance=runtime.scottInstance,p3=runtime.stage3?.encounter,dt=runtime.paused?0:Math.min(delta,.1),pose=instance?.armorGallantPose
    if(instance?.mountedMotion)w.attach(instance)
    if(c.active&&pose){
      // Armor's Gallant inherits the glove's bind frame in both rest and aim.
      // The arm pose owns aiming; the weapon never swivels inside the palm.
      w.present(instance,true,null)
      if(c.firing&&!runtime.paused&&!playerCombat.dead&&pose.aimBlend>.82&&c.cooldown<=0&&armorWeaponAvailable(runtime.armorController.state)){
        c.raycaster.setFromCamera(armorReticle,camera)
        c.endpoint.copy(c.hitscan.cast(c.raycaster.ray).point)
        // Camera establishes the crosshair; a second ray from the real muzzle
        // prevents shooting through cover beside Scott's shoulder or hand.
        w.getMuzzle(c.origin);c.forward.subVectors(c.endpoint,c.origin)
        const range=Math.min(GALLANT_FIRE.range,c.forward.length()+.025)
        c.ray.set(c.origin,c.forward.normalize())
        const result=c.hitscan.fire(c.ray,range)
        c.cooldown=GALLANT_FIRE.interval;c.recoil=1;c.shots++
        if(result.hit!==null){c.hit=.18;c.hits++}
        runtime.combatVFX?.shot(w,result,c)
      }
    }else if(!p3?.active)w.root.visible=false
    const patrol=runtime.desertPatrol
    runtime.combatVFX?.update(dt,p3?.active?p3:patrol?.active?patrol:c,w,camera)
    if(anchor.current){camera.getWorldDirection(c.forward);anchor.current.position.copy(camera.position).addScaledVector(c.forward,10);anchor.current.updateMatrixWorld(true)}
    if(hud.current)hud.current.style.display=c.active||patrol?.active&&(c.hurt>0||playerCombat.dead)?'block':'none'
    if(reticle.current){reticle.current.style.opacity=String(c.active?pose?.aimBlend||0:0);reticle.current.style.color=c.hit>0?'#fff6a0':'#e3efd6'}
    if(feedback.current)feedback.current.style.opacity=String(c.hurt*.4)
    if(label.current)label.current.textContent=playerCombat.dead&&patrol?.active?'Scott sin salud · Reintentando desde el risco…':c.active?`Gallant · clic derecho: apuntar · clic izquierdo: disparar${patrol?.active||c.hurt>0?' · Salud '+playerCombat.playerHealth:''}`:`Impacto · Salud ${playerCombat.playerHealth}`
  },.12)
  return <group ref={anchor}><Html fullscreen calculatePosition={(_,__,size)=>[size.width/2,size.height/2]} style={{pointerEvents:'none'}}><div ref={hud} style={{display:'none',position:'absolute',inset:0,pointerEvents:'none',fontFamily:'sans-serif'}}>
    <div ref={feedback} style={{position:'absolute',inset:0,boxShadow:'inset 0 0 80px 10px #ba4268',opacity:0}}/>
    <div ref={reticle} className="armor-reticle" style={{position:'absolute',left:`${(armorReticle.x+1)*50}%`,top:`${(1-armorReticle.y)*50}%`,width:18,height:18,transform:'translate(-50%,-50%)',border:'1px solid currentColor',borderRadius:'50%',opacity:0}}/>
    <div ref={label} style={{position:'absolute',bottom:65,left:'50%',transform:'translateX(-50%)',fontSize:12,color:'#e0ecda',background:'#10291dc0',padding:'5px 10px',whiteSpace:'nowrap'}}/>
  </div></Html></group>
}
