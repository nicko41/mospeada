import test from 'node:test'
import assert from 'node:assert/strict'
import {Group,Ray,Vector3} from 'three'
import {queryColliders} from '../player/collisionWorld.js'
import {registerMeleeTarget} from '../player/meleeWorld.js'
import {GallantHitscan} from './GallantShot.js'
import {registerInvidBody,invidMovementBlocker,separateInvidBodies,signalInvidContact} from './invidBodyCollision.js'

function scout(){return{position:new Vector3(0,0,0),height:5.2,radius:2.2,health:16,dead:false,meleeEnabled:true,view:{root:new Group()},receiveHit(){this.health--;return true}}}
test('live Invid block walking, Armor and high-speed bike sweeps, but not movement below flying bodies',()=>{
  const s=scout(),remove=registerInvidBody(s)
  try{
    for(const radius of [.23,.34,1.15])assert.equal(invidMovementBlocker({x:0,z:10},0,-10,0,radius,1.9),s,'Even a boost step across the whole body is stopped')
    assert.equal(invidMovementBlocker({x:5,z:10},5,-10,0,.34,1.9),null)
    s.position.y=4;assert.equal(invidMovementBlocker({x:0,z:10},0,-10,0,.34,1.9),null)
    assert.equal(invidMovementBlocker({x:0,z:10},0,-10,4,.34,1.9),s)
    s.position.set(12,0,3);assert.equal(invidMovementBlocker({x:12,z:10},12,-10,0,.34,1.9),s)
    for(const disable of [()=>s.dead=true,()=>{s.dead=false;s.view.root.visible=false},()=>{s.view.root.visible=true;s.meleeEnabled=false},()=>{s.meleeEnabled=true;s.health=0}]){
      disable();assert.equal(invidMovementBlocker({x:12,z:10},12,-10,0,.34,1.9),null)
    }
  }finally{remove()}
  const found=[];queryColliders(-100,-100,100,100,found,true);assert.ok(!found.some(c=>c.invid===s))
})
test('an approaching Invid cannot stay inside stationary Scott; separation still lets Scott retreat',()=>{
  const s=scout(),remove=registerInvidBody(s),actor={x:0,z:0,yaw:0};let contacts=0
  try{
    separateInvidBodies(actor,0,.34,1.9,()=>contacts++)
    assert.ok(Math.hypot(actor.x,actor.z)>s.height*.29+.34);assert.equal(contacts,1)
    assert.equal(invidMovementBlocker({x:0,z:-1},0,-4,0,.34,1.9),null)
    const runtime={};signalInvidContact(runtime,s);signalInvidContact(runtime,s)
    assert.equal(runtime.invidContact.version,1,'Simultaneous contacts produce one recoverable fall')
  }finally{remove()}
})
test('movement primitives do not occlude Gallant targeting or world/projectile and camera rays',()=>{
  const s=scout(),body=registerInvidBody(s),target=registerMeleeTarget(s),query=new GallantHitscan(),ray=new Ray(new Vector3(0,2,10),new Vector3(0,0,-1)),found=[]
  try{
    queryColliders(-4,-4,4,12,found);assert.ok(!found.some(c=>c.invid))
    assert.equal(query.castWorld(ray,20).solid,false)
    assert.equal(query.cast(ray,20).target,s)
    query.fire(ray);assert.equal(s.health,15)
  }finally{body();target()}
})
