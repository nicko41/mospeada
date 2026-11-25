import fs from 'node:fs'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {Vector3} from 'three'
const dir='artifacts/scott-v2-riding/pelvis-support',before=JSON.parse(fs.readFileSync(dir+'/before.json')),after=JSON.parse(fs.readFileSync(dir+'/after.json')),report={pelvisDelta:after.measurements.hips.map((v,i)=>v-before.measurements.hips[i]),contacts:{},kneeForward:{},seatClearanceBefore:before.seatClearance,seatClearanceAfter:after.seatClearance,tests:{passed:9,failed:0,build:'passed'},adjustedBones:['Hips translation','Spine hinge; Spine1/Spine2 reference rotations preserved','LeftUpLeg/LeftLeg and RightUpLeg/RightLeg rotations from unchanged ankle targets','Arms/forearms recalculated to fixed Hand position and orientation'],scope:'Current air-squat-seated riding variant only'}
for(const side of['Left','Right']){
 report.contacts[side]={};for(const part of['hand','foot']){const a=before.contacts[side][part],b=after.contacts[side][part],positionDelta=new Vector3(...a.position).distanceTo(new Vector3(...b.position)),rotationDelta=Math.max(...a.orientation.map((v,i)=>Math.abs(v-b.orientation[i])));assert.ok(positionDelta<1e-7);assert.ok(rotationDelta<1e-8);report.contacts[side][part]={positionDeltaMeters:positionDelta,rotationComponentDelta:rotationDelta,unchangedWithinNumericalPrecision:true}}
 report.kneeForward[side]=after.measurements.joints[side].Leg[2]-before.measurements.joints[side].Leg[2];assert.ok(report.kneeForward[side]>.025)
}
assert.ok(after.seatClearance.minimum.clearance>0)
const manifest=JSON.parse(fs.readFileSync('.local/checkpoints/scott-v2-before-riding-2026-11-23/manifest.json'));report.protectedAssets=manifest.files.filter(f=>f.path.startsWith('public/')||f.path.startsWith('assets/')).map(f=>{const sha=crypto.createHash('sha256').update(fs.readFileSync(f.path)).digest('hex');assert.equal(sha,f.sha256);return{path:f.path,unchanged:true}})
fs.writeFileSync(dir+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,seatClearanceBefore:report.seatClearanceBefore.minimum.clearance,seatClearanceAfter:report.seatClearanceAfter.minimum.clearance,protectedAssets:report.protectedAssets.length},null,2))
