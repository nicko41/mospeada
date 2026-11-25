import test from 'node:test'
import assert from 'node:assert/strict'
import {Group,Vector3} from 'three'
import {createHydraulicLink} from './hydraulicLink.js'
import {v3ArmorFixture} from '../../scripts/scott-v3-armor-fixture.mjs'
import {ForestEndingShot} from '../world/forest/ForestEndingShot.js'
import {createBikeState} from './bikePhysics.js'
import {bikeConfig} from './bikeConfig.js'
import {restoreVehiclePresentation} from './restoreVehiclePresentation.js'

const flat=()=>0
function assertContacts(h){
 assert.equal(h.root.matrixAutoUpdate,true,'Hydraulic root remains frozen in an Armor matrix')
 assert.equal(h.endPin.matrixAutoUpdate,true,'Hydraulic connector remains frozen in an Armor matrix')
 for(const key of ['baseError','targetError','connectorStartError','connectorEndError'])assert.ok(h.state[key]<1e-8,key+' '+h.state[key])
 assert.ok(h.root.position.distanceTo(h.base)<1e-12)
}

test('normal hydraulic update recovers both procedural frames from frozen presentation matrices',()=>{
 const body=new Group(),target=new Group();body.position.set(70,4,-160);body.rotation.y=.8;body.add(target);target.position.set(.4,.3,.9)
 const h=createHydraulicLink(body,target,new Vector3(0,.5,0),new Vector3())
 h.root.matrix.makeTranslation(3,8,2);h.root.matrixAutoUpdate=false
 h.endPin.matrix.makeTranslation(-4,7,0);h.endPin.matrixAutoUpdate=false
 body.updateWorldMatrix(true,true);h.update();assertContacts(h)
 target.position.set(.2,.45,.6);body.position.set(-25,2,310);h.update();assertContacts(h)
})

test('V3 Armor victory restores native hydraulics before the closing ride and subsequent restarts',async()=>{
 const f=await v3ArmorFixture(),r=f.runtime,geometry=f.rig.hydraulics.map(h=>[h.sleeve.geometry,h.rod.geometry,h.endPin.geometry])
 const initial={...r.state}
 r.transformEntry.reset=function(){Object.assign(this,{phase:'idle',poseBlend:0,assemblyProgress:0,returnFlight:false});this.actorOffset.set(0,0,0)}
 r.randEscape={metrics:f.rig.metrics,state:createBikeState({x:0,z:0,yaw:0},f.rig.metrics,flat),position:new Vector3(),forward:new Vector3()}
 const world={bound:true,position:new Vector3(),distance:z=>-z,updateClimax(){}}
 const shot=r.ending=new ForestEndingShot(r,flat)
 assert.ok(f.rig.hydraulics.every(h=>h.root.matrixAutoUpdate===false),'Fixture must include the late V3 attachment override')
 assert.equal(shot.compose(world),true)
 assert.equal(f.visual.attachments.length,0,'The cut must unwind V3 before Armor')
 assert.ok(f.rig.hydraulics.every(h=>h.root.matrixAutoUpdate&&h.endPin.matrixAutoUpdate))
 // Actual frame order: ending at -2.2, V3/Armor restores at -2.15, mechanical
 // assembly restores at -2.1, then the native bike update at -2.
 const frame=()=>{
  f.visual.restoreAttachments();f.articulation.restore();f.suspension.restore();f.wheels.restore();f.guards.restore();f.rear.restore();f.front.restore()
  f.rig.update(r.state,flat,bikeConfig)
  f.front.apply(0);f.rear.apply(0);f.guards.apply(0);f.wheels.apply(0);f.suspension.apply(0)
 }
 try{
  for(let i=0;i<5;i++){frame();f.rig.hydraulics.forEach(assertContacts)}
  for(const start of [{x:0,z:0,yaw:0},{x:95,z:-320,yaw:1.1}]){
   shot.reset();restoreVehiclePresentation(r);r.armorController.reset();r.transformEntry.reset();Object.assign(r.state,createBikeState(start,f.rig.metrics,flat))
   for(let i=0;i<10;i++){Object.assign(r.state,{speed:18,steer:.08,lean:.15,wheelieAngle:i*.035});frame();f.rig.hydraulics.forEach(assertContacts)}
   // Return to a complete Armor assembly after each restart, then cut back
   // to the closing ride again. No accumulated matrices may survive the cycle.
   restoreVehiclePresentation(r);Object.assign(r.state,initial)
   Object.assign(f.entry,{phase:'complete',poseBlend:1,assemblyProgress:1})
   f.tick();f.controller.activate();f.tick()
   for(const h of f.rig.hydraulics){
    for(const key of ['baseError','targetError','connectorStartError','connectorEndError'])assert.ok(h.state[key]<1e-8,key)
    assert.ok(f.rig.body.worldToLocal(h.root.getWorldPosition(new Vector3())).length()<2,'Armor hydraulic must remain near the backpack')
    assert.equal(h.root.matrixAutoUpdate,false,'Late Armor/V3 presentation still applies')
   }
   assert.equal(shot.compose(world),true);frame();f.rig.hydraulics.forEach(assertContacts)
  }
  for(const [i,h]of f.rig.hydraulics.entries())assert.deepEqual([h.sleeve.geometry,h.rod.geometry,h.endPin.geometry],geometry[i])
 }finally{f.visual.dispose()}
})
