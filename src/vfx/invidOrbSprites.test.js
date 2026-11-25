import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {AdditiveBlending,DataTexture,Group,Matrix4,PerspectiveCamera,Quaternion,Vector3} from 'three'
import {InvidOrbSprites,INVID_ORB_SPRITE as C,invidOrbFrame,invidOrbFrameRect} from './InvidOrbSprites.js'
import {createEnergyProjectiles,launchEnergyProjectile,SCOUT_PROJECTILE_CAPACITY} from '../vehicle/EnergyProjectiles.js'

test('authored sprite is a five by four atlas; the flight loop stays in the bright central frames',()=>{
 const png=fs.readFileSync('assets/invid/invid-orbes.png');assert.equal(png.readUInt32BE(16),C.textureWidth);assert.equal(png.readUInt32BE(20),C.textureHeight)
 const rect=new Float32Array(4),frames=new Set()
 for(let i=0;i<120;i++){const f=invidOrbFrame(i/60,2);frames.add(f);assert.ok(f>=C.firstFrame&&f<=C.lastFrame)}
 assert.equal(frames.size,7)
 for(let i=0;i<20;i++){invidOrbFrameRect(i,rect);assert.ok(rect[0]>=0&&rect[1]>=0&&rect[0]+rect[2]<=1&&rect[1]+rect[3]<=1);assert.ok(rect[0]>i%5/5&&rect[1]>1-(Math.floor(i/5)+1)/4,'Gutters stay inside each authored frame')}
})

test('orb billboard follows the world camera without moving the projectile or changing its velocity/lifetime',()=>{
 const map=new DataTexture(),fx=new InvidOrbSprites({map}),camera=new PerspectiveCamera(),parent=new Group(),pool=createEnergyProjectiles(2,'scoutOval'),origin=new Vector3(2,3,-5)
 parent.rotation.set(.1,.6,0);parent.add(camera);camera.rotation.set(-.2,-.4,.1);parent.updateMatrixWorld(true)
 launchEnergyProjectile(pool,origin,new Vector3(5,1,4),50,3.5);pool[0].visualScale=1.06
 const before=structuredClone(pool),q=camera.getWorldQuaternion(new Quaternion())
 try{
  fx.begin(pool);fx.put(pool[0],0,1/60,q);fx.finish()
  const m=new Matrix4(),p=new Vector3(),r=new Quaternion(),s=new Vector3();fx.mesh.getMatrixAt(0,m);m.decompose(p,r,s)
  assert.ok(p.distanceTo(origin)<1e-6);assert.ok(r.normalize().angleTo(q.normalize())<1e-6);assert.ok(Math.abs(s.x-C.width*1.06)<1e-6);assert.ok(Math.abs(s.y-C.height*1.06)<1e-6)
  assert.deepEqual(structuredClone(pool),before);assert.equal(fx.mesh.material.blending,AdditiveBlending);assert.equal(fx.mesh.material.depthTest,true);assert.equal(fx.mesh.material.depthWrite,false)
  let disposed=false;map.addEventListener('dispose',()=>disposed=true);fx.dispose();assert.equal(disposed,false,'Borrowed cached atlas remains owned by the loader')
 }finally{map.dispose()}
})

test('64 animated orbs reuse one draw, buffers and records; pause, slot recycling and clear do not leave ghosts',()=>{
 const map=new DataTexture(),fx=new InvidOrbSprites({map}),pool=createEnergyProjectiles(SCOUT_PROJECTILE_CAPACITY,'scoutOval'),q=new Quaternion()
 for(let i=0;i<pool.length;i++)launchEnergyProjectile(pool,new Vector3(i,1,0),new Vector3(i,1,-20),50,3.5)
 const matrix=fx.mesh.instanceMatrix,frames=fx.frames,material=fx.material,geometry=fx.geometry,records=fx.slots.slice()
 const draw=dt=>{fx.begin(pool);for(let i=0;i<pool.length;i++)if(pool[i].active)fx.put(pool[i],i,dt,q);fx.finish()}
 try{
  draw(0);assert.equal(fx.mesh.count,64);assert.notDeepEqual([...frames.array.slice(0,4)],[...frames.array.slice(4,8)],'Volley phases are staggered')
  const first=frames.array.slice();for(let i=0;i<20;i++){pool.forEach(b=>b.life-=1/60);draw(1/60)}assert.notDeepEqual(frames.array,first)
  const paused=frames.array.slice(),positions=matrix.array.slice();draw(0);assert.deepEqual(frames.array,paused);assert.deepEqual(matrix.array,positions)
  pool[0].active=false;draw(1/60);assert.equal(fx.mesh.count,63);launchEnergyProjectile(pool,new Vector3(),new Vector3(0,0,-20),50,3.5);draw(0);assert.equal(fx.slots[0].age,0);assert.equal(fx.mesh.count,64)
  assert.equal(fx.mesh.instanceMatrix,matrix);assert.equal(fx.frames,frames);assert.equal(fx.material,material);assert.equal(fx.geometry,geometry);assert.deepEqual(fx.slots,records)
  fx.clear();assert.equal(fx.mesh.count,0);assert.ok(fx.slots.every(r=>r.bolt===null));draw(0);assert.equal(fx.mesh.count,64)
 }finally{fx.dispose();map.dispose()}
})
