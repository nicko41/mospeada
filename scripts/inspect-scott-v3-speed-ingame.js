// Run from the local game's DevTools: await import('/scripts/inspect-scott-v3-speed-ingame.js')
// Samples the live React frame loop; never invokes the pose solver manually.
import {Quaternion,Vector3} from 'three'

const deadline=performance.now()+120000
while(!window.__SCOTT_ORIGINAL__?.instance.modelComparison?.v3||document.getElementById('entry-preloader')){
 if(performance.now()>deadline)throw Error('Timed out waiting for the development game')
 await new Promise(resolve=>setTimeout(resolve,100))
}
const d=window.__MOSPEADA__,a=window.__SCOTT_ORIGINAL__
if(!d||!a)throw Error('Open the running development game first')
const r=d.runtime,v=a.instance.modelComparison.v3
if(a.instance.modelComparison.variant!=='v3')throw Error('Select Scott V3 first')
const origin={x:r.state.x,z:r.state.z},samples=[]
r.keys={};r.opening?.finish();r.paused=false
for(const speed of [3,12,24]){
 for(let frame=0;frame<90;frame++){
  Object.assign(r.state,{...origin,speed,idleBlend:0,parked:false,riderStand:0,airborne:false,boostBlend:0,brakeBlend:0,wheelieAngle:0})
  await new Promise(requestAnimationFrame)
 }
 const bone=v.retarget.bones.get('Spine2'),forward=new Vector3(0,0,1).applyQuaternion(bone.getWorldQuaternion(new Quaternion()).multiply(v.retarget.targetBind.get('Spine2').rotation.clone().invert()).premultiply(d.rig.body.getWorldQuaternion(new Quaternion()).invert()))
 samples.push({speed:r.state.speed,clip:a.instance.clip,response:{...v.diagnostics.speedPose},chestPitch:Math.atan2(-forward.y,forward.z),palms:Object.fromEntries(['Left','Right'].map(side=>{const p=new Vector3(),mesh=v.skins[0].mesh,ids=v.shapes[side].palmIds;ids.forEach(id=>p.add(d.rig.body.worldToLocal(mesh.localToWorld(mesh.getVertexPosition(id,new Vector3())))));return[side,p.divideScalar(ids.length).toArray()]}))})
}
r.paused=true;r.keys={}
if(!samples.every(s=>s.clip==='Cyclone_RidingPose'))throw Error('Riding layer was not active')
if(!(samples[1].response.torsoLean>1.5*Math.PI/180&&samples[2].response.torsoLean>3.8*Math.PI/180&&samples[2].chestPitch>samples[0].chestPitch+3*Math.PI/180))throw Error('Live torso did not follow speed')
d.setCameraMode(3)
r.cameraController.update=()=>{} // Inspection camera, reset by reloading.
const target=d.rig.body.localToWorld(new Vector3(0,1,0))
r.orbit.enableDamping=false;r.orbit.target.copy(target)
d.camera.position.copy(d.rig.body.localToWorld(new Vector3(4.6,1.2,0)));d.camera.fov=36;d.camera.updateProjectionMatrix();r.orbit.update()
window.__SCOTT_V3_RIDE_QA__={passed:true,samples}
console.log('SCOTT_V3_LIVE_SPEED '+JSON.stringify(window.__SCOTT_V3_RIDE_QA__))
export {samples}
