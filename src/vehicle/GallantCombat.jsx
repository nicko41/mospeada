import {useGLTF} from '../loading/resources.js'
import {useLayoutEffect,useMemo,useRef} from 'react'
import {useFrame,useThree} from '@react-three/fiber'
import {Html} from '@react-three/drei'
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
import {GallantAimLock,cuffMissileLockReady} from './GallantAimLock.js'
import {CuffMissiles} from './CuffMissiles.js'
import {ScottMissilePose} from './ScottMissilePose.js'
import {GallantAimInput} from './GallantAimInput.js'

// Crosshair, camera aim and shot selection share the exact screen centre.
const armorReticle=new Vector2(0,0)

export default function GallantCombat({runtime}){
  const source=useGLTF(MARS_GALLANT_URL),{camera,gl}=useThree(),anchor=useRef(),hud=useRef(),reticle=useRef(),feedback=useRef(),label=useRef()
  const combat=useMemo(()=>({weapon:new MarsGallant(source.scene),aimInput:new GallantAimInput(),aimLock:new GallantAimLock(),bikeCamera:new CycloneShooterCamera(camera,runtime),pointer:new Vector2(.12,.08),mounted:false,hitscan:new GallantHitscan(),raycaster:new Raycaster(),ray:new Ray(),aimPoint:new Vector3(),endpoint:new Vector3(),origin:new Vector3(),forward:new Vector3(),active:false,aiming:false,firing:false,time:0,bolts:[],cooldown:0,recoil:0,hurt:0,hit:0,hitVersion:playerCombat.hitVersion,shots:0,hits:0,refs:0}),[source.scene,camera,runtime])
  useLayoutEffect(()=>{
    combat.missiles ||=new CuffMissiles()
    combat.missileVelocity ||=new Vector3()
    combat.refs++;runtime.gallant=combat;runtime.armorCombat=combat
    combat.receiveHit=(amount,source)=>{if(combat.active&&Number.isFinite(amount)&&amount>0)damagePlayer(amount,source)}
    const canvas=gl.domElement,oldCursor=canvas.style.cursor
    const enabled=()=>(runtime.armorController?.active||bikeGallantAvailable(runtime))&&!runtime.paused&&!runtime.ending?.holding&&!playerCombat.dead
    const canHoldAim=()=>!!runtime.state&&(runtime.state.riderMode==='mounted'||runtime.armorController?.active)&&!runtime.opening?.active&&!runtime.paused&&!runtime.ending?.holding&&!playerCombat.dead
    const release=()=>{combat.aimInput.clear();combat.aiming=combat.firing=combat.missileQueued=false;combat.aimLock.clear()}
    const missileKey=e=>{if(e.code!=='KeyQ'||e.repeat||e.ctrlKey||e.metaKey||e.altKey||/INPUT|SELECT|TEXTAREA/.test(e.target?.tagName)||!enabled())return;e.preventDefault();if(cuffMissileLockReady(combat.aimLock,combat.aiming))combat.missileQueued=true}
    const move=e=>{if(e.type==='pointermove'&&canHoldAim()&&Number.isFinite(e.buttons)){if(e.buttons&2)combat.aimInput.press(runtime.state);else combat.aimInput.clear()}if(!enabled()||!bikeGallantAvailable(runtime))return;const rect=canvas.getBoundingClientRect();combat.pointer.set((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2)}
    const capture=e=>{if(e.button===2&&canHoldAim()){combat.aimInput.press(runtime.state);if(!runtime.armorController?.active){move(e);runtime.cameraController?.end();runtime.orbit.enabled=false;e.stopImmediatePropagation()}}}
    const down=e=>{if(e.button===2&&canHoldAim()){combat.aimInput.press(runtime.state);move(e);e.preventDefault();return}if(!enabled()||e.button!==0)return;move(e);combat.firing=true;e.preventDefault()}
    const up=e=>{if(e.button===2){combat.aimInput.clear();combat.aiming=false;combat.aimLock.clear()}if(e.button===0)combat.firing=false}
    const menu=e=>{if(canHoldAim())e.preventDefault()}
    // Mouse events report each button in a chord. Pointerdown only fires for
    // the first button, so RMB aim used to swallow the following LMB press.
    canvas.addEventListener('pointerdown',capture,true);canvas.addEventListener('pointermove',move);canvas.addEventListener('mousedown',down);canvas.addEventListener('contextmenu',menu);window.addEventListener('mouseup',up);window.addEventListener('pointercancel',release);window.addEventListener('blur',release)
    window.addEventListener('keydown',missileKey)
    if(import.meta.env.DEV)window.__ARMOR_COMBAT__=combat
    return()=>{
      release();if(runtime.state)combat.bikeCamera.finish(runtime.state);runtime.scottInstance?.armorGallantPose?.reset();runtime.scottInstance?.shooterPose?.restore();combat.weapon.root.visible=false;combat.weapon.root.removeFromParent();combat.weapon.instance=null
      runtime.scottInstance?.missilePose?.cancel();combat.missiles.dispose();window.removeEventListener('keydown',missileKey)
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
    if(c.missiles.sync(runtime.state,runtime.desertPatrol,runtime.guardTransformation)){c.missileQueued=false;instance?.missilePose?.cancel();runtime.missileVFX?.clear()}
    runtime.missileVFX?.bindLaunchers(c.missiles.launchers)
    const mounted=bikeGallantAvailable(runtime),active=!!a?.active||mounted
    if(active!==c.active||mounted!==c.mounted){c.aiming=c.firing=false;c.cooldown=c.recoil=c.hurt=c.hit=0;c.hitVersion=playerCombat.hitVersion;if(!active||mounted)instance?.armorGallantPose?.reset()}
    c.mounted=mounted
    c.active=active
    c.aiming=c.aimInput.sync(runtime.state,active,runtime.paused||playerCombat.dead||runtime.ending?.holding)&&!a?.state?.knockedDown
    if(!active||runtime.paused||playerCombat.dead)c.aimLock.clear()
    if(runtime.paused)c.aiming=c.firing=c.missileQueued=false
    if(playerCombat.hitVersion!==c.hitVersion){c.hitVersion=playerCombat.hitVersion;c.hurt=active||runtime.desertPatrol?.active?1:0}
    c.hurt=Math.max(0,c.hurt-dt*3.5)
    if(playerCombat.dead){c.aiming=c.firing=c.missileQueued=false;for(const missile of c.missiles.records)missile.active=false;gl.domElement.style.cursor='';return}
    gl.domElement.style.cursor=mounted&&c.aiming?'none':''
    if(!active)return
    c.time+=dt;c.cooldown=Math.max(0,c.cooldown-dt);c.recoil=Math.max(0,c.recoil-dt/GALLANT_FIRE.recoilTime);c.hit=Math.max(0,c.hit-dt)
    c.raycaster.setFromCamera(mounted?c.pointer:armorReticle,camera);c.raycaster.ray.at(GALLANT_FIRE.range,c.aimPoint)
    c.aimLock.update(c.aiming,camera,mounted?c.pointer:armorReticle,runtime.stage3?.encounter.active?runtime.stage3.encounter.drones:runtime.desertPatrol?.scouts||[],c.hitscan,runtime.state)
    if(c.aimLock.target)c.aimPoint.copy(c.aimLock.point)
    if(instance?.mountedMotion){instance.missilePose ||=new ScottMissilePose(instance);if(c.missileQueued){if(c.active&&cuffMissileLockReady(c.aimLock,c.aiming)&&c.missiles.remaining>0&&c.missiles.cooldown<=0)instance.missilePose.request(c.aimLock.target,c.missiles.launchers[4-c.missiles.remaining],mounted);c.missileQueued=false}}
    if(mounted){
      if(runtime.stage3?.encounter.active){runtime.stage3.encounter.pointer.copy(c.pointer);if(!c.aimLock.target){runtime.stage3.encounter.target(c.raycaster.ray);c.aimPoint.copy(runtime.stage3.encounter.aimPoint)}}
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
  useFrame((_,delta)=>{const c=combat,pose=runtime.scottInstance?.missilePose;pose?.apply(runtime.paused?0:Math.min(delta,.1),c.active&&!playerCombat.dead&&(c.mounted||armorWeaponAvailable(runtime.armorController.state)),runtime.cameraController?.sample)},-.46)
  // Both contexts feed one weapon instance and the already pooled combat FX.
  useFrame((_,delta)=>{
    const c=combat,w=c.weapon,instance=runtime.scottInstance,p3=runtime.stage3?.encounter,dt=runtime.paused?0:Math.min(delta,.1),pose=c.mounted?instance?.shooterPose:instance?.armorGallantPose,blend=c.mounted?pose?.blend:pose?.aimBlend
    // This is the only timed update: the earlier pose pass refreshes target
    // geometry with delta=0, so acquisition cannot advance twice per frame.
    c.aimLock.update(c.active&&c.aiming&&!runtime.paused&&!playerCombat.dead,camera,c.mounted?c.pointer:armorReticle,p3?.active?p3.drones:runtime.desertPatrol?.scouts||[],c.hitscan,runtime.state,dt)
    if(c.aimLock.target)c.aimPoint.copy(c.aimLock.point)
    const launchPose=instance?.missilePose
    if(launchPose?.active&&!launchPose.fired&&!cuffMissileLockReady(c.aimLock,c.aiming,launchPose.target))launchPose.cancel()
    if(launchPose?.ready&&!runtime.paused&&!playerCombat.dead){const a=runtime.armorController?.active?runtime.armorController.state:null,s=runtime.state,yaw=s.travelYaw??s.yaw;c.missileVelocity.set(a?a.vx:Math.sin(yaw)*s.speed,a?a.vy:s.verticalVelocity||0,a?a.vz:Math.cos(yaw)*s.speed);if(c.missiles.launch(launchPose.target,c.active&&cuffMissileLockReady(c.aimLock,c.aiming,launchPose.target),runtime.missileVFX,c.missileVelocity))launchPose.commit();else launchPose.cancel()}
    c.missiles.step(playerCombat.dead?0:dt,c.hitscan,runtime.missileVFX,target=>{c.hit=.24;c.hits++;runtime.combatVFX?.destroyTarget(target);if(c.aimLock.target===target)c.aimLock.clear()},(point,direction)=>runtime.combatVFX?.emit(point,true,direction,'invidExplosion',.25,{cameraShake:false}))
    c.missiles.present(c.active);runtime.missileVFX?.present(c.missiles.records,camera,dt)
    if(instance?.mountedMotion)w.attach(instance)
    if(c.active&&pose){
      // The approved Armor mount is rigidly local to the hand in every pose.
      w.present(instance,!c.mounted||blend>.04,c.mounted?c.aimPoint:null,c.mounted?blend:1,!c.mounted)
      if(c.firing&&!instance.missilePose?.active&&(!c.mounted||c.aiming)&&!runtime.paused&&!playerCombat.dead&&blend>.82&&c.cooldown<=0&&(c.mounted||armorWeaponAvailable(runtime.armorController.state))){
        c.raycaster.setFromCamera(c.mounted?c.pointer:armorReticle,camera)
        if(c.aimLock.target)c.endpoint.copy(c.aimLock.point)
        else if(p3?.active){p3.target(c.raycaster.ray);c.endpoint.copy(p3.aimPoint)}else c.endpoint.copy(c.hitscan.cast(c.raycaster.ray).point)
        // Camera establishes the crosshair; a second ray from the real muzzle
        // prevents shooting through cover beside Scott's shoulder or hand.
        w.getMuzzle(c.origin);c.forward.subVectors(c.endpoint,c.origin)
        const range=Math.min(GALLANT_FIRE.range,c.forward.length()+.025)
        c.ray.set(c.origin,c.forward.normalize())
        const result=p3?.active?p3.fire(c.ray,runtime.state):c.hitscan.fire(c.ray,range)
        if(!result)return
        c.cooldown=GALLANT_FIRE.interval;c.recoil=1;c.shots++
        if(result.hit!==null){c.hit=.18;c.hits++}
        if(c.aimLock.target?.dead)c.aimLock.clear()
        runtime.combatVFX?.shot(w,result,p3?.active?p3:c)
      }
    }else{
      if(instance?.mountedMotion&&armorGallantVisible(runtime.armorController,runtime.transformEntry))w.present(instance,true,null)
      else w.root.visible=false
    }
    const patrol=runtime.desertPatrol
    runtime.combatVFX?.update(dt,p3?.active?p3:patrol?.active?patrol:c,w,camera)
    if(anchor.current){camera.getWorldDirection(c.forward);anchor.current.position.copy(camera.position).addScaledVector(c.forward,10);anchor.current.updateMatrixWorld(true)}
    if(hud.current)hud.current.style.display=!runtime.ending?.holding&&(c.active||patrol?.active&&(c.hurt>0||playerCombat.dead))?'block':'none'
    if(label.current)label.current.style.display=runtime.paused?'block':'none'
    if(reticle.current){const locked=!!c.aimLock.target,ready=cuffMissileLockReady(c.aimLock,c.aiming),pointer=locked?c.aimLock.screen:c.mounted?c.pointer:armorReticle;reticle.current.style.opacity=String(c.active&&!playerCombat.dead?blend||0:0);reticle.current.style.left=`${(pointer.x+1)*50}%`;reticle.current.style.top=`${(1-pointer.y)*50}%`;reticle.current.style.color=ready?'#ff3b32':locked&&c.aimLock.target.receiveMissileHit?'#ffc65e':c.hit>0?'#fff6a0':locked?'#7fffea':'#e3efd6';reticle.current.style.borderRadius=locked?'4px':'50%';reticle.current.style.width=reticle.current.style.height=locked?'26px':'18px';reticle.current.dataset.locked=String(locked);reticle.current.dataset.lockReady=String(ready);reticle.current.dataset.lockProgress=String(c.aimLock.progress)}
    if(feedback.current)feedback.current.style.opacity=String(c.hurt*.4)
    if(label.current)label.current.textContent=playerCombat.dead?'Derrotado · Reintentar desde el checkpoint':c.active?`Gallant · clic derecho: apuntar · clic izquierdo: disparar${patrol?.active||c.hurt>0?' · Salud '+playerCombat.playerHealth:''}`:`Impacto · Salud ${playerCombat.playerHealth}`
  },.12)
  return <group ref={anchor}><Html fullscreen calculatePosition={(_,__,size)=>[size.width/2,size.height/2]} style={{pointerEvents:'none'}}><div ref={hud} style={{display:'none',position:'absolute',inset:0,pointerEvents:'none',fontFamily:'sans-serif'}}>
    <div ref={feedback} style={{position:'absolute',inset:0,boxShadow:'inset 0 0 80px 10px #ba4268',opacity:0}}/>
    <div ref={reticle} className="armor-reticle" style={{position:'absolute',left:`${(armorReticle.x+1)*50}%`,top:`${(1-armorReticle.y)*50}%`,width:18,height:18,transform:'translate(-50%,-50%)',border:'1px solid currentColor',borderRadius:'50%',opacity:0}}/>
    <div ref={label} style={{position:'absolute',bottom:65,left:'50%',transform:'translateX(-50%)',fontSize:12,color:'#e0ecda',background:'#10291dc0',padding:'5px 10px',whiteSpace:'nowrap'}}/>
  </div></Html></group>
}
