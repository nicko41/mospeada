import test from 'node:test'
import assert from 'node:assert/strict'
import {DataTexture,Matrix4,PerspectiveCamera,PlaneGeometry,Vector3} from 'three'
import {CombatBursts} from './CombatBursts.js'
import {Plano3CombatVFX} from './Plano3CombatVFX.js'
import {VFXRuntime} from './VFXRuntime.js'
import {INVID_BLOOD} from './invidBloodConfig.js'
import {INVID_BLOOD_ATLAS,explosionFrameRect} from './explosionAtlas.js'

function fixture(){
 const textures=[0,1].map(()=>new DataTexture(new Uint8Array([40,58,51,255]),1,1)),plane=new PlaneGeometry(),camera=new PerspectiveCamera(),fx=new CombatBursts(textures[0],plane,{blood:textures}),point=new Vector3(0,3,-8),normal=new Vector3(0,0,1)
 return{textures,plane,camera,fx,point,normal,dispose(){fx.dispose();plane.dispose();textures.forEach(t=>t.dispose())}}
}
test('each blood event can choose either authored sheet or no liquid; choices remain fixed through pause and animation',()=>{
 const f=fixture(),{fx,point,normal,camera,textures}=f,sequence=[.9,.1,.1,.1,.9];fx.bloodRandom=()=>sequence.shift()??.9
 try{
  assert.equal(fx.spawnBlood(point,normal),null)
  const one=fx.spawnBlood(point,normal),two=fx.spawnBlood(point,normal);assert.equal(one.variant,0);assert.equal(two.variant,1)
  fx.update(0,camera);assert.equal(fx.stats.blood,2);for(let i=0;i<2;i++)assert.equal(fx.bloodSprites[i].material.map,textures[i])
  const poses=fx.bloodSprites.map(m=>m.instanceMatrix.array.slice()),frames=fx.bloodSprites.map(m=>m.geometry.attributes.aCombatFrame.array.slice());fx.update(0,camera)
  assert.deepEqual(fx.bloodSprites.map(m=>m.instanceMatrix.array),poses);assert.deepEqual(fx.bloodSprites.map(m=>m.geometry.attributes.aCombatFrame.array),frames);assert.equal(sequence.length,0)
  fx.update(.16,camera);assert.ok(one.frame>=3&&two.frame>=3);assert.equal(one.variant,0);assert.equal(two.variant,1)
  const actual=Array.from(fx.bloodSprites[0].geometry.attributes.aCombatFrame.array.slice(0,4)),expected=explosionFrameRect(one.frame,one.mirror,INVID_BLOOD_ATLAS);for(let i=0;i<4;i++)assert.ok(Math.abs(actual[i]-expected[i])<1e-7)
  fx.update(.5,camera);assert.equal(fx.stats.blood,0)
 }finally{f.dispose()}
})
test('heavy short blood ejection respects character depth, falls slightly and uses separate bounded hit/death pools',()=>{
 const f=fixture(),{fx,point,normal,camera}=f;fx.bloodRandom=()=>0
 try{
  const small=fx.spawnBlood(point,normal),big=fx.spawnBlood(point,normal,1,true),matrix=new Matrix4(),resources=fx.bloodSprites.map(m=>[m.geometry,m.material,m.instanceMatrix]),pool=fx.bloodRecords.slice()
  assert.ok(big.size>small.size*1.5);fx.update(0,camera);fx.update(.2,camera)
  fx.bloodSprites[0].getMatrixAt(0,matrix);assert.ok(matrix.elements[14]>point.z+.1);assert.ok(matrix.elements[13]<point.y)
  for(let i=0;i<80;i++)fx.spawnBlood(point,normal)
  assert.equal(fx.bloodRecords.filter(r=>r.age<r.life&&!r.deathSlot).length,INVID_BLOOD.hitSlots);assert.ok(big.age<big.life,'Hits cannot overwrite the death splash')
  for(let i=0;i<30;i++)fx.spawnBlood(point,normal,1,true)
  fx.update(0,camera);assert.equal(fx.stats.blood,INVID_BLOOD.hitSlots+INVID_BLOOD.deathSlots)
  assert.deepEqual(fx.bloodRecords,pool);assert.deepEqual(fx.bloodSprites.map(m=>[m.geometry,m.material,m.instanceMatrix]),resources)
  for(const mesh of fx.bloodSprites){assert.equal(mesh.material.depthTest,true);assert.equal(mesh.material.depthWrite,false);assert.ok(mesh.count<=mesh.instanceMatrix.count)}
  fx.clear();assert.equal(fx.stats.blood,0);assert.ok(fx.bloodRecords.every(r=>r.age===Infinity&&!r.anchor));assert.ok(fx.bloodSprites.every(m=>m.count===0))
 }finally{f.dispose()}
})
test('purple cube drones never emit liquid on hit, fallback hurt feedback or destruction, even with blood assets loaded',()=>{
 const f=fixture(),runtime=new VFXRuntime(),fx=runtime.register('test',new Plano3CombatVFX({explosionAtlases:{blood:f.textures},bloodRandom:()=>0})),target={position:new Vector3(0,2,-8),height:1.4,health:3,hitVersion:0,dead:false},weapon={root:{visible:false},getMuzzle:p=>p.set(0,2,0)},e={active:true,time:1,bolts:[]}
 try{
  fx.shot(weapon,{hit:target,point:target.position,destroyed:false},e);target.hitVersion++;fx.scoutVisual(target);target.dead=true;fx.destroyTarget(target);fx.update(0,e,weapon,f.camera)
  assert.equal(fx.impacts.stats.bloodSpawned,0);assert.equal(fx.impacts.stats.blood,0)
 }finally{runtime.dispose();f.dispose()}
})
