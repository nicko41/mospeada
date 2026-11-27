import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import {Matrix4,Vector3} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {MeshoptDecoder} from 'meshoptimizer/decoder'
import {readGlb} from '../../../scripts/glb-data.mjs'
import {DRONE_ASSET,DRONE_SCALE,InvidDroneSquad,droneLOD} from './InvidDroneSquad.js'
import {CycloneShooterEncounter} from './CycloneShooterEncounter.js'

globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const asset=(async()=>{const b=fs.readFileSync('public/delivery/invid-drone.glb');return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')})()
test('delivery preserves the source, authored material and colour image with bounded LOD geometry',async()=>{
 const source=readGlb('assets/invid/invid_drone.glb'),runtime=readGlb('public/delivery/invid-drone.glb'),manifest=JSON.parse(fs.readFileSync('public/delivery/invid-drone-manifest.json'))
 const hash=b=>crypto.createHash('sha256').update(b).digest('hex')
 assert.equal(hash(source.bytes),manifest.sourceSha256);assert.equal(hash(runtime.bytes),manifest.runtimeSha256)
 assert.ok(runtime.bytes.length<source.bytes.length*.05)
 assert.deepEqual(runtime.doc.materials,source.doc.materials)
 const image=g=>{const v=g.doc.bufferViews[g.doc.images[0].bufferView];return g.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength)}
 assert.deepEqual(image(runtime),image(source),'Original 2K colour texture is byte-for-byte identical')
 const a=await asset;assert.equal(a.scene.children.length,3)
 for(let i=0;i<3;i++){
  const mesh=a.scene.getObjectByName('Drone_LOD'+i),g=mesh.geometry
  assert.equal(g.index.count/3,manifest.lods[i].triangles);assert.ok(g.index.count/3<=[20000,5000,3500][i])
  assert.equal(g.attributes.normal.count,g.attributes.position.count);assert.equal(g.attributes.uv.count,g.attributes.position.count)
  g.computeBoundingBox()
  for(const [key,values]of [['min',DRONE_ASSET.min],['max',DRONE_ASSET.max]])for(let k=0;k<3;k++)assert.ok(Math.abs(g.boundingBox[key].getComponent(k)-values[k])<.025)
 }
})
test('eleven pooled drones share the decoded resources and never mutate encounter state',async()=>{
 const source=(await asset).scene,squad=new InvidDroneSquad(source,11),e=new CycloneShooterEncounter(),camera=new Vector3(0,3,8),player={x:0,z:8},matrix=new Matrix4(),center=new Vector3().fromArray(DRONE_ASSET.min).add(new Vector3().fromArray(DRONE_ASSET.max)).multiplyScalar(.5)
 e.phase='active';e.drones.forEach((d,i)=>{d.spawned=true;d.position.set(i-5,3,0)})
 const buffers=squad.batches.map(b=>b.instanceMatrix.array)
 try{
  for(let i=0;i<3;i++){const mesh=source.getObjectByName('Drone_LOD'+i),batch=squad.batches[i];assert.equal(batch.geometry,mesh.geometry);assert.equal(batch.material,squad.material);assert.notEqual(batch.material,mesh.material);for(const key of ['map','normalMap','roughnessMap','metalnessMap'])assert.equal(batch.material[key],mesh.material[key]);assert.equal(batch.instanceMatrix.count,11)}
  const before=JSON.stringify(e)
  for(let frame=0;frame<600;frame++)squad.update(e,player,camera)
  assert.equal(JSON.stringify(e),before);assert.equal(squad.batches.reduce((n,b)=>n+b.count,0),11)
  squad.batches.forEach((b,i)=>assert.equal(b.instanceMatrix.array,buffers[i]))
  const near=squad.batches[0];near.getMatrixAt(0,matrix)
  assert.ok(center.clone().applyMatrix4(matrix).distanceTo(e.drones[0].position)<1e-5,'Authored hull is centred on its existing logical target')
  assert.equal(matrix.getMaxScaleOnAxis().toFixed(5),DRONE_SCALE.toFixed(5))
  let disposed=0;near.geometry.addEventListener('dispose',()=>disposed++);source.getObjectByName('Drone_LOD0').material.addEventListener('dispose',()=>disposed++)
  squad.dispose();assert.equal(disposed,0,'Borrowed model resources remain cached for retries')
 }finally{if(squad.root.children.length)squad.dispose()}
})
test('hit feedback, destruction overlap, empty waves and retry reuse the fixed instance pools',async()=>{
 const squad=new InvidDroneSquad((await asset).scene,11),e=new CycloneShooterEncounter(),d=e.drones[0],player={x:0,z:8},camera=new Vector3(0,3,8)
 e.phase='active';d.spawned=true;d.position.set(0,3,0)
 try{
  squad.update(e,player,camera);assert.equal(squad.batches[0].count,1)
  d.flash=.18;squad.update(e,player,camera);assert.ok(squad.batches[0].instanceColor.getX(0)>1)
  d.dead=true;squad.update(e,player,camera,{scoutVisual:()=>({visible:true})});assert.equal(squad.batches[0].count,1)
  squad.update(e,player,camera,{scoutVisual:()=>({visible:false})});assert.ok(squad.batches.every(b=>!b.visible&&b.count===0))
  e.reset();squad.update(e,player,camera);assert.ok(squad.batches.every(b=>b.count===0))
  e.phase='active';d.spawned=true;squad.update(e,player,camera);assert.equal(squad.batches[0].count,1)
 }finally{squad.dispose()}
})
test('distance LOD hysteresis avoids toggling buffers near thresholds',()=>{
 assert.equal(droneLOD(19,0),0);assert.equal(droneLOD(21.9,0),0);assert.equal(droneLOD(22,0),1)
 assert.equal(droneLOD(19,1),1);assert.equal(droneLOD(17.9,1),0)
 assert.equal(droneLOD(57,1),1);assert.equal(droneLOD(58,1),2);assert.equal(droneLOD(51,2),2);assert.equal(droneLOD(49,2),1)
})
