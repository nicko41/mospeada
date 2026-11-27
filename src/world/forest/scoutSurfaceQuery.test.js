import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {BoxGeometry,Mesh,MeshBasicMaterial,Raycaster,Vector3} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {createScoutView} from './invidScoutAsset.js'
import {intersectScoutSurface,prepareScoutSurfaceSteps,scoutSurfaceStats} from './scoutSurfaceQuery.js'

globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const asset=(async()=>{const b=fs.readFileSync('public/models/mospeada/invid-scout-rigged.glb');return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')})()

test('Scout query preparation yields during loading and preserves every geometry/skin buffer',async()=>{
 const source=(await asset).scene,meshes=[];source.traverse(m=>{if(m.isSkinnedMesh)meshes.push(m)})
 for(const mesh of meshes){
  const attributes=Object.values(mesh.geometry.attributes),before=attributes.map(a=>a.array.slice()),steps=prepareScoutSurfaceSteps(mesh);let count=0,next
  do{next=steps.next();count++}while(!next.done)
  assert.ok(count>100,'Large builds must yield to the loading work queue')
  attributes.forEach((a,i)=>assert.deepEqual(a.array,before[i]))
 }
})

test('accelerated Scout skin contacts match exhaustive Three raycasts through animations and all LODs',async()=>{
 const data=await asset,view=createScoutView(data.scene,0,data.animations),other=createScoutView(data.scene,1,data.animations),ray=new Raycaster(),native=[],fast=[];let contacts=0
 try{
  for(const [pose,time]of[['Hover',.37],['Claw_R',.4]])for(let lod=0;lod<view.levels.length;lod++){
   view.lod=lod;view.root.position.set(7,3,-14);view.root.rotation.set(.12,.63,-.07);view.root.scale.setScalar(1.15)
   view.motion.mixer.stopAllAction();const clip=data.animations.find(c=>c.name===pose);assert.ok(clip);view.motion.mixer.clipAction(clip).play();view.motion.mixer.setTime(time);view.motion.sync()
   const mesh=view.levels[lod];mesh.computeBoundingBox();mesh.computeBoundingSphere()
   const from=view.root.localToWorld(new Vector3(8,3,12))
   for(let i=0;i<12;i++){
    const target=view.root.localToWorld(new Vector3(Math.sin(i*1.7)*2.1,.3+(i*1.13)%4.7,0));ray.ray.set(from,target.sub(from).normalize());ray.near=.01;ray.far=80
    native.length=fast.length=0;ray.intersectObject(mesh,false,native);intersectScoutSurface(view,ray,fast)
    assert.equal(!!fast[0],!!native[0],`${pose} LOD${lod} ray${i}`)
    if(fast[0]){contacts++;assert.ok(fast[0].point.distanceTo(native[0].point)<1e-6);assert.ok(fast[0].face.normal.distanceTo(native[0].face.normal)<1e-5);assert.equal(fast[0].faceIndex,native[0].faceIndex);assert.equal(fast[0].face.a,native[0].face.a)}
    assert.ok(scoutSurfaceStats(mesh).triangles<mesh.geometry.index.count/3*.15,'A query must reject most original triangles')
    // Another independently posed instance shares topology, never pose state.
    other.root.position.set(-30,7,19);other.motion.sync();intersectScoutSurface(other,ray,[])
    const again=[];intersectScoutSurface(view,ray,again);assert.equal(!!again[0],!!fast[0]);if(fast[0])assert.ok(again[0].point.distanceTo(fast[0].point)<1e-8)
    if(fast[0]){const far=ray.far;ray.far=fast[0].distance-.01;assert.equal(intersectScoutSurface(view,ray,[]).length,0);ray.far=far}
   }
  }
  assert.ok(contacts>12)
 }finally{view.motion.dispose();other.motion.dispose()}
})

test('other visuals retain their ordinary Three query',()=>{
 const mesh=new Mesh(new BoxGeometry(),new MeshBasicMaterial()),view={levels:[mesh],lod:0},ray=new Raycaster(new Vector3(0,0,3),new Vector3(0,0,-1))
 try{const fast=intersectScoutSurface(view,ray,[]),native=ray.intersectObject(mesh,false);assert.equal(fast[0].distance,native[0].distance)}finally{mesh.geometry.dispose();mesh.material.dispose()}
})
