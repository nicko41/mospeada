import test from 'node:test'
import assert from 'node:assert/strict'
import {DataTexture,Group,Matrix4,PerspectiveCamera,Quaternion,Vector3} from 'three'
import {readRgbaPng} from '../../scripts/foliage-png.mjs'
import {CUFF_SMOKE_SHEET as S,CuffLaunchSprites,cuffSmokeFrameRect} from './CuffLaunchSprites.js'

test('the supplied smoke sheet uses all 16 authored frames in reading order with padded UVs',()=>{
 const png=readRgbaPng('assets/texturas/humo-misil-cuff.png'),uv=new Float32Array(4)
 assert.equal(png.width,S.width);assert.equal(png.height,S.height)
 assert.equal(S.columns*S.rows,S.frames)
 for(let i=0;i<S.frames;i++){
  cuffSmokeFrameRect(i,uv)
  assert.ok(uv[0]>i%4/4&&uv[0]+uv[2]<(i%4+1)/4)
  assert.ok(uv[1]>1-(Math.floor(i/4)+1)/4&&uv[1]+uv[3]<1-Math.floor(i/4)/4)
 }
 cuffSmokeFrameRect(0,uv);assert.ok(uv[1]>.75);cuffSmokeFrameRect(15,uv);assert.ok(uv[1]<.01)
})

test('independent launches play once, freeze with gameplay and retain the birth frame at low FPS',()=>{
 const map=new DataTexture(),fx=new CuffLaunchSprites(map),camera=new PerspectiveCamera(),cuff=new Group(),launcher={mesh:cuff,local:new Vector3(.1,.2,.3)}
 try{
  cuff.position.set(2,3,4);cuff.updateMatrixWorld(true);const anchor=cuff.localToWorld(launcher.local.clone())
  fx.start(0,launcher,anchor);fx.present(camera,.1)
  assert.equal(fx.slots[0].frame,0);assert.equal(fx.slots[0].age,0);assert.equal(fx.mesh.count,1);assert.ok(fx.slots[0].position.distanceTo(anchor)<1e-8)
  cuff.position.x+=1;fx.present(camera,.1);assert.equal(fx.slots[0].frame,2);assert.ok(Math.abs(fx.slots[0].position.x-anchor.x-1)<1e-8)
  fx.start(1,launcher,anchor);fx.present(camera,.05);assert.equal(fx.slots[0].frame,3);assert.equal(fx.slots[1].frame,0);assert.equal(fx.mesh.count,2)
  const age=fx.slots[0].age,uv=fx.frames.array.slice(),p=fx.slots[0].position.clone()
  for(let i=0;i<100;i++)fx.present(camera,0)
  assert.equal(fx.slots[0].age,age);assert.deepEqual(fx.frames.array,uv);assert.deepEqual(fx.slots[0].position,p)
  camera.rotation.set(.2,.6,.1);fx.present(camera,0)
  const matrix=new Matrix4(),q=new Quaternion();fx.mesh.getMatrixAt(0,matrix);matrix.decompose(new Vector3(),q,new Vector3());assert.ok(q.angleTo(camera.getWorldQuaternion(new Quaternion()))<.001)
  const buffer=fx.mesh.instanceMatrix,frames=fx.frames,records=fx.slots.slice(),leftBehind=fx.slots[0].position.clone()
  cuff.position.x+=100;for(let i=0;i<90;i++)fx.present(camera,1/60)
  assert.ok(Math.abs(fx.slots[0].position.x-leftBehind.x)<1e-8,'The detached cloud stays behind in world space')
  assert.equal(fx.mesh.count,0);assert.ok(fx.slots.every(r=>!r.active))
  for(let slot=0;slot<4;slot++)fx.start(slot,launcher,anchor)
  fx.present(camera,0);assert.equal(fx.mesh.count,4);assert.equal(fx.mesh.instanceMatrix,buffer);assert.equal(fx.frames,frames);assert.ok(fx.slots.every((r,i)=>r===records[i]))
  fx.clear();assert.equal(fx.mesh.count,0);assert.ok(fx.slots.every(r=>!r.active))
  let disposed=false;map.addEventListener('dispose',()=>disposed=true);fx.dispose();assert.equal(disposed,false,'The shared loading cache keeps ownership of the sheet')
 }finally{map.dispose()}
})
