import fs from 'node:fs'
import {Box3,Vector3,Quaternion,Raycaster} from 'three'
import {ridingFixture,measureRiding,writeRidingScene} from './scott-v2-riding-fixture.mjs'
const dir='artifacts/scott-v2-riding/pelvis-support',phase=process.argv[2]||'before';fs.mkdirSync(dir,{recursive:true})
const f=await ridingFixture({ridingVariant:'air-squat-seated'});Object.assign(f.s,{speed:18,idleBlend:0,parked:false});f.step(60)
const body=f.rig.body,mesh=f.skins[0].mesh,hip=body.worldToLocal(f.bones.get('mixamorigHips').getWorldPosition(new Vector3())),seats=[]
for(const m of f.rig.surfaces){const name=m.userData.sourcePiece||m.name,points=[];for(let i=0;i<m.geometry.attributes.position.count;i++)points.push(body.worldToLocal(m.localToWorld(new Vector3().fromBufferAttribute(m.geometry.attributes.position,i))));const b=new Box3().setFromPoints(points);if(/seat|asiento|saddle/i.test(name)||(b.min.x<.12&&b.max.x>-.12&&b.min.z<hip.z&&b.max.z>hip.z&&b.max.y>.75&&b.max.y<1.04))seats.push({name,min:b.min.toArray(),max:b.max.toArray(),m})}
const j=mesh.geometry.attributes.skinIndex,w=mesh.geometry.attributes.skinWeight,points=[]
for(const id of new Set(mesh.geometry.index.array)){
 let weight=0;for(let k=0;k<4;k++)if(j.getComponent(id,k)===0)weight+=w.getComponent(id,k)
 if(weight<.65)continue
 const p=body.worldToLocal(mesh.localToWorld(mesh.getVertexPosition(id,new Vector3())))
 if(Math.abs(p.x)<.13&&p.z>hip.z-.12&&p.z<hip.z+.04&&p.y<hip.y-.05)points.push({id,p:p.toArray()})
}
points.sort((a,b)=>a.p[1]-b.p[1]);const contacts={}
for(const side of['Left','Right']){
 const hand=f.bones.get('mixamorig'+side+'Hand'),foot=f.bones.get('mixamorig'+side+'Foot'),bodyQ=body.getWorldQuaternion(new Quaternion()).invert(),shape=f.instance.v2RidingPose.shapes[side],average=ids=>{const p=new Vector3();ids.forEach(id=>p.add(mesh.localToWorld(mesh.getVertexPosition(id,new Vector3()))));return body.worldToLocal(p.divideScalar(ids.length)).toArray()}
 contacts[side]={hand:{position:body.worldToLocal(hand.getWorldPosition(new Vector3())).toArray(),orientation:bodyQ.clone().multiply(hand.getWorldQuaternion(new Quaternion())).toArray(),palm:average(shape.palmIds)},foot:{position:body.worldToLocal(foot.getWorldPosition(new Vector3())).toArray(),orientation:bodyQ.clone().multiply(foot.getWorldQuaternion(new Quaternion())).toArray(),sole:average(shape.soleIds)}}
}
const seatRays=[];for(const z of[-.72,-.65,-.60,-.55,-.50,-.45]){const start=body.localToWorld(new Vector3(0,2,z)),down=new Vector3(0,-1,0).applyQuaternion(body.getWorldQuaternion(new Quaternion())),hits=new Raycaster(start,down).intersectObjects(f.rig.surfaces,false).slice(0,3);seatRays.push({z,hits:hits.map(h=>({name:h.object.userData.sourcePiece||h.object.name,point:body.worldToLocal(h.point).toArray()}))})}
const seatMeshes=f.rig.surfaces.filter(m=>/rear_sit/.test(m.userData.sourcePiece||m.name)),clearances=[]
for(const sample of points){const p=new Vector3(...sample.p),start=body.localToWorld(new Vector3(p.x,2,p.z)),down=new Vector3(0,-1,0).applyQuaternion(body.getWorldQuaternion(new Quaternion())),hit=new Raycaster(start,down).intersectObjects(seatMeshes,false)[0];if(hit)clearances.push({id:sample.id,clearance:p.y-body.worldToLocal(hit.point).y,position:sample.p})}
clearances.sort((a,b)=>a.clearance-b.clearance)
const report={measurements:measureRiding(f),contacts,seats:seats.map(({m,...s})=>s),seatRays,buttCandidates:points.length,buttLowest:points.slice(0,15),buttPercentiles:[0,.05,.1,.25,.5].map(t=>points[Math.floor((points.length-1)*t)]),seatClearance:{tested:clearances.length,minimum:clearances[0],p05:clearances[Math.floor(clearances.length*.05)],median:clearances[Math.floor(clearances.length*.5)]}}
fs.writeFileSync(`${dir}/${phase}.json`,JSON.stringify(report,null,2)+'\n');writeRidingScene(f,`${dir}/${phase}.glb`);console.log(JSON.stringify({phase,contacts,seatClearance:report.seatClearance,joints:report.measurements.joints,fit:report.measurements.fit},null,2))
