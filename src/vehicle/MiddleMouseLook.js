import {MathUtils,Spherical,Vector3} from 'three'

// Momentary rear view. Dragging the same held button turns it into free look;
// releasing it restores the prior view, without changing Scott's steering yaw.
export class MiddleMouseLook{
 constructor(camera,orbit,runtime){
  Object.assign(this,{camera,orbit,runtime});this.gesture=null;this.offset=new Vector3();this.spherical=new Spherical()
  const canvas=orbit.domElement;this.host=canvas.ownerDocument?.defaultView||canvas
  this.down=e=>{
   if(e.button!==1)return
   e.preventDefault();e.stopImmediatePropagation?.()
   const entry=runtime.transformEntry
   if(runtime.canyonCrash||runtime.canyonCameraActive||runtime.scottInstance?.defeatMotion?.active||runtime.opening?.holding||entry?.cameraProgress!=null&&entry.cameraProgress<1)return
   this.cancel()
   const enabled=orbit.enabled,damping=orbit.enableDamping
   orbit.enableDamping=false;orbit.update();orbit.enabled=false
   const s=runtime.armorController?.active?runtime.armorController.state:runtime.state
   const yaw=runtime.armorController?.active?s?.yaw:s?.travelYaw??s?.yaw
   this.spherical.setFromVector3(this.offset.copy(camera.position).sub(orbit.target))
   this.gesture={pointerId:e.pointerId,x:e.clientX,y:e.clientY,dx:0,dy:0,dragged:false,yaw:yaw??0,phi:this.spherical.phi,offset:this.offset.clone(),enabled,damping}
   canvas.setPointerCapture?.(e.pointerId)
  }
  this.move=e=>{
   const g=this.gesture;if(!g||e.pointerId!==g.pointerId)return
   e.preventDefault();e.stopImmediatePropagation?.()
   g.dx+=e.movementX||e.clientX-g.x||0;g.dy+=e.movementY||e.clientY-g.y||0;g.x=e.clientX;g.y=e.clientY
   if(Math.hypot(g.dx,g.dy)>4)g.dragged=true
  }
  this.up=e=>{if(this.gesture&&(e.pointerId===this.gesture.pointerId||e.type==='blur'))this.cancel()}
  this.prevent=e=>{if(e.button===1)e.preventDefault()}
  canvas.addEventListener('pointerdown',this.down,true);canvas.addEventListener('pointermove',this.move,true)
  canvas.addEventListener('mousedown',this.prevent,true);canvas.addEventListener('auxclick',this.prevent)
  this.host.addEventListener('pointerup',this.up,true);this.host.addEventListener('pointercancel',this.up,true);this.host.addEventListener('blur',this.up)
  canvas.addEventListener('lostpointercapture',this.up)
 }
 get active(){return !!this.gesture}
 theta(yaw){const g=this.gesture;return g.dragged?g.yaw-g.dx*.004:yaw}
 get phi(){const g=this.gesture;return MathUtils.clamp(g.phi-(g.dragged?g.dy*.004:0),.2,Math.PI*.49)}
 cancel(){
  const g=this.gesture;if(!g)return
  this.gesture=null;this.camera.position.copy(this.orbit.target).add(g.offset);this.camera.lookAt(this.orbit.target)
  this.orbit.enabled=g.enabled;this.orbit.enableDamping=g.damping
  if(this.orbit.domElement.hasPointerCapture?.(g.pointerId))this.orbit.domElement.releasePointerCapture(g.pointerId)
 }
 dispose(){
  this.cancel();const c=this.orbit.domElement;c.removeEventListener('pointerdown',this.down,true);c.removeEventListener('pointermove',this.move,true);c.removeEventListener('mousedown',this.prevent,true);c.removeEventListener('auxclick',this.prevent);c.removeEventListener('lostpointercapture',this.up)
  this.host.removeEventListener('pointerup',this.up,true);this.host.removeEventListener('pointercancel',this.up,true);this.host.removeEventListener('blur',this.up)
 }
}
