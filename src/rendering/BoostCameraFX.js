import {Vector2} from 'three'
import {cameraImpactAllowed} from './cameraImpactGameplay.js'

const clamp=x=>Math.max(0,Math.min(1,x))
const damp=(current,target,rate,dt)=>current+(target-current)*(1-Math.exp(-rate*dt))
export function cycloneBoostAllowed(runtime,ready=true,dead){
 return cameraImpactAllowed(runtime?.paused?{...runtime,paused:false}:runtime,ready,dead)&&runtime.state.riderMode==='mounted'&&!runtime.armorController?.active
}

// Read-only boost telemetry. It never starts a boost or changes its physics.
export class BoostCameraFX{
 constructor(source=null){
  this.camera=source?source.clone(false):null;this.focus=new Vector2(.5,.5)
  this.presentation={camera:source,blurDirection:new Vector2(0,1),blurFocus:this.focus,blurPixels:0,blurBlend:0,boostBlurStrength:0,boostBlurPixels:0,boostClearRadius:.5}
  this.reset()
 }
 reset(state=null){this.actor=state;this.count=state?.boostCount??0;this.episode=false;this.blurLevel=0;this.fovOffset=0;this.started=false;this.target=0}
 sample(delta,runtime,config,bike,ready=true,dead){
  const s=runtime?.state;this.started=false
  if(!cycloneBoostAllowed(runtime,ready,dead)){this.reset(s);return}
  if(this.actor!==s)this.reset(s)
  const count=s.boostCount??0,active=s.boostTime>0,speed=Math.max(0,s.speed||0)
  if(runtime.paused){this.count=count;return}
  this.started=count>this.count&&active&&speed>0&&config.shakeEnabled
  this.count=count
  if(active)this.episode=true
  const normal=Math.max(1,bike.maxSpeed),maximum=Math.max(normal+1,s.boostMode==='air'?bike.airBoostMaxSpeed:bike.boostMaxSpeed)
  const excess=clamp((speed-normal)/(maximum-normal))
  this.target=this.episode?Math.max(active?clamp(speed/normal):0,excess):0
  const dt=Number.isFinite(delta)?Math.max(0,delta):0,blurTarget=config.blurEnabled?this.target:0,fovTarget=config.fovEnabled?this.target*config.maxFov:0
  this.blurLevel=damp(this.blurLevel,blurTarget,blurTarget>this.blurLevel?config.enterRate:config.exitRate,dt)
  this.fovOffset=damp(this.fovOffset,fovTarget,fovTarget>this.fovOffset?config.enterRate:config.exitRate,dt)
  if(this.blurLevel<1e-5)this.blurLevel=0
  if(this.fovOffset<1e-5)this.fovOffset=0
  if(!active&&excess===0&&this.blurLevel===0&&this.fovOffset===0)this.episode=false
 }
 compose(logical,impact,config,focus){
  const result=this.presentation,base=impact?.camera||logical
  result.camera=base;result.blurDirection=impact?.blurDirection||result.blurDirection;result.blurFocus=impact?.blurFocus||this.focus.copy(focus)
  result.blurPixels=impact?.blurPixels||0;result.blurBlend=impact?.blurBlend||0
  result.boostBlurStrength=this.blurLevel*config.blurIntensity*config.peripheralIntensity
  result.boostBlurPixels=config.blurPixels;result.boostClearRadius=config.clearRadius
  if(this.fovOffset>0&&base.isPerspectiveCamera){
   if(!this.camera||this.camera.type!==base.type)this.camera=base.clone(false)
   const view=this.camera;view.copy(base,false);view.parent=null;view.matrixAutoUpdate=false;view.matrixWorldAutoUpdate=true
   base.updateWorldMatrix(true,false);base.matrixWorld.decompose(view.position,view.quaternion,view.scale)
   view.fov=Math.min(120,base.fov+this.fovOffset);view.updateProjectionMatrix()
   const a=base.projectionMatrix.elements,b=view.projectionMatrix.elements,kx=b[0]/a[0],ky=b[5]/a[5]
   // Lens expansion about the actual aiming ray, including a noncentral
   // mounted cursor. The logical ray and its on-screen point stay identical.
   b[8]=kx*a[8]+(kx-1)*(focus.x*2-1);b[9]=ky*a[9]+(ky-1)*(focus.y*2-1)
   view.projectionMatrixInverse.copy(view.projectionMatrix).invert();view.matrix.copy(base.matrixWorld);view.updateMatrixWorld(true);result.camera=view
  }
  return result
 }
}
