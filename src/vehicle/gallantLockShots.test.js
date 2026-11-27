import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {Box3,Ray,Vector3} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {GallantLockShots} from './GallantLockShots.js'
import {GallantHitscan} from './GallantShot.js'
import {registerMeleeTarget} from '../player/meleeWorld.js'
import {registerColliders,boxCollider} from '../player/collisionWorld.js'
import {createScoutView} from '../world/forest/invidScoutAsset.js'
import {Plano3CombatVFX} from '../vfx/Plano3CombatVFX.js'
import {VFXRuntime} from '../vfx/VFXRuntime.js'

test('locked shots vary body regions while retaining real cover collisions and sixteen-hit damage',()=>{
  const shots=new GallantLockShots(()=>.5),query=new GallantHitscan(),from=new Vector3(0,2,0),point=new Vector3(),ray=new Ray(),target={position:new Vector3(0,0,-20),radius:2.3,height:5.2,health:16,receiveHit(){this.health--;return true}}
  const remove=registerMeleeTarget(target),wall=registerColliders([boxCollider(new Box3(new Vector3(-5,0,-6),new Vector3(5,8,-4)))])
  try{
    for(let i=0;i<16;i++){shots.point(target,from,point);ray.set(from,point.clone().sub(from).normalize());assert.equal(query.fire(ray).hit,null)}
    assert.equal(target.health,16)
    wall();const points=[]
    for(let i=0;i<16;i++){
      shots.point(target,from,point);ray.set(from,point.clone().sub(from).normalize());const result=query.fire(ray)
      assert.equal(result.hit,target);assert.equal(target.health,15-i);points.push(result.point.toArray())
      assert.ok(Math.abs(point.x)<target.radius&&point.y>0&&point.y<target.height)
    }
    assert.ok(new Set(points.map(p=>p.map(n=>n.toFixed(2)).join(','))).size>=8)
    assert.ok(Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]))>2)
    assert.deepEqual(target.position.toArray(),[0,0,-20])
  }finally{wall();remove()}
})

test('real Scout skin contacts spread hit effects and reactions over multiple body joints',async()=>{
  globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
  const bytes=fs.readFileSync('public/models/mospeada/invid-scout-rigged.glb'),asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'')
  const view=createScoutView(asset.scene,0,asset.animations),target={view,position:new Vector3(0,0,-20),velocity:new Vector3(),radius:2.3,height:5.2,health:16,hitVersion:0,mode:'flight',clawAge:Infinity,receiveHit(){this.health--;this.hitVersion++;return true}}
  view.root.visible=true;view.root.position.copy(target.position);view.motion.update(target,1/60,()=>0);view.motion.sync()
  const shots=new GallantLockShots(()=>.5),query=new GallantHitscan(),from=new Vector3(0,2.6,0),point=new Vector3(),ray=new Ray(),remove=registerMeleeTarget(target),runtime=new VFXRuntime(),fx=runtime.register('test',new Plano3CombatVFX()),joints=new Set(),contacts=[]
  try{
    for(let i=0;i<15;i++){
      shots.point(target,from,point);ray.set(from,point.clone().sub(from).normalize());const result=query.fire(ray)
      assert.equal(result.hit,target)
      fx.shot({getMuzzle:p=>p.copy(from)},result,{time:1})
      assert.ok(fx.contactExact,`Shot ${i} must meet the rendered skin`)
      joints.add(fx.contactJoint);contacts.push(fx.contactPoint.clone())
      assert.ok(fx.impacts.records.some(r=>r.name==='invidHit'))
    }
    assert.ok(joints.size>=3,`Expected multiple struck joints, got ${[...joints]}`)
    assert.ok(Math.max(...contacts.map(p=>p.y))-Math.min(...contacts.map(p=>p.y))>1)
    assert.equal(target.health,1);assert.equal(fx.stats.hits,15)
  }finally{remove();runtime.dispose();view.motion.dispose()}
})

test('prototype drones retain their original centre and missing visual geometry falls back safely',()=>{
 const shots=new GallantLockShots(()=>.5),point=new Vector3(),from=new Vector3(0,2,10),drone={position:new Vector3(3,4,0)}
 assert.equal(shots.point(drone,from,point),point);assert.deepEqual(point.toArray(),drone.position.toArray())
})
