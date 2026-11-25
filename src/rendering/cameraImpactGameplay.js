import {playerCombat,subscribePlayerHealth} from '../player/playerCombat.js'

export function cameraImpactAllowed(runtime,ready=true,dead=playerCombat.dead){
 const phase=runtime?.transformEntry?.phase
 return !!(runtime?.state&&ready&&!runtime.paused&&!dead&&!runtime.defeat&&!runtime.canyonCrash&&!runtime.opening?.active&&!runtime.ending?.holding&&(!phase||['idle','complete'].includes(phase)))
}
export function sampleImpactPlayer(runtime,target){
 const instance=runtime.scottInstance,hip=instance?.modelComparison?.variant==='v3'?instance.modelComparison.v3?.retarget.bones.get('Hips'):instance?.bones.get('mixamorigHips')
 if(hip)return hip.getWorldPosition(target)
 const s=runtime.state,p=s.riderMode==='onFoot'?s.pedestrian:null
 return target.set(p?.x??s.x,(p?.ground??s.height)+.9,p?.z??s.z)
}
export function subscribeCameraImpactDamage(events,onReset){
 let hitSeen=playerCombat.hitVersion,resetSeen=playerCombat.resetVersion
 return subscribePlayerHealth(()=>{
  if(resetSeen!==playerCombat.resetVersion){resetSeen=playerCombat.resetVersion;hitSeen=playerCombat.hitVersion;events.clear();onReset();return}
  if(hitSeen!==playerCombat.hitVersion){hitSeen=playerCombat.hitVersion;events.emit('directHit',playerCombat.hasHitSource?playerCombat.hitSource:null)}
 })
}
export function sampleImpactFocus(runtime,target){
 const pointer=runtime.gallant?.mounted?runtime.gallant.pointer:null
 return target.set(pointer&&Number.isFinite(pointer.x)?Math.max(0,Math.min(1,.5+pointer.x*.5)):.5,pointer&&Number.isFinite(pointer.y)?Math.max(0,Math.min(1,.5+pointer.y*.5)):.5)
}
