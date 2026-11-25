import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import {Matrix4,PerspectiveCamera,Vector3} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {createScoutView} from './invidScoutAsset.js'
import {DesertScoutPatrol,SCOUT_PATROL} from './DesertScoutPatrol.js'
import {SCOUT_JOINTS,SCOUT_MOTION} from './scoutMechanicalConfig.js'
import {readRgbaPng} from '../../../scripts/foliage-png.mjs'

globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
async function load(path){const b=fs.readFileSync(path);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')}
const assets=Promise.all([load('public/models/mospeada/invid-scout.glb'),load('public/models/mospeada/invid-scout-rigged.glb')])
function glb(path){const bytes=fs.readFileSync(path),length=bytes.readUInt32LE(12);return {doc:JSON.parse(bytes.toString('utf8',20,20+length)),binary:bytes.subarray(28+length)}}
const fixture=async()=>{const [,a]=await assets;return {asset:a,views:Array.from({length:5},(_,i)=>createScoutView(a.scene,i,a.animations))}}

test('working rig preserves the optimized original, all triangles, UVs, normals and three original embedded maps',async()=>{
 const [original,rigged]=await assets,manifest=JSON.parse(fs.readFileSync('public/models/mospeada/invid-scout-manifest.json'))
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync('public/models/mospeada/invid-scout.glb')).digest('hex'),manifest.runtimeSha256)
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync('assets/invid/scout/invid-scout.glb')).digest('hex'),manifest.sourceSha256)
 const a=glb('public/models/mospeada/invid-scout.glb'),b=glb('public/models/mospeada/invid-scout-rigged.glb');assert.deepEqual(b.doc.materials,a.doc.materials);assert.equal(b.doc.images.length,3)
 for(let i=0;i<3;i++){const av=a.doc.bufferViews[a.doc.images[i].bufferView],bv=b.doc.bufferViews[b.doc.images[i].bufferView];assert.deepEqual(b.binary.subarray(bv.byteOffset||0,(bv.byteOffset||0)+bv.byteLength),a.binary.subarray(av.byteOffset||0,(av.byteOffset||0)+av.byteLength))}
 for(let level=0;level<3;level++){
  const a=original.scene.getObjectByName('Scout_LOD'+level),b=rigged.scene.getObjectByName('Scout_LOD'+level)
  assert.deepEqual(b.geometry.index.array,a.geometry.index.array)
  for(const name of ['position','normal','uv'])assert.deepEqual(b.geometry.attributes[name].array,a.geometry.attributes[name].array)
  assert.ok(b.isSkinnedMesh);assert.equal(b.skeleton.bones.length,5)
  assert.deepEqual(b.skeleton.bones.map(b=>b.name),SCOUT_JOINTS.map(j=>j.name))
  assert.equal(b.geometry.index.count/3,manifest.lods[level].triangles)
  const weights=b.geometry.attributes.skinWeight;for(let i=0;i<weights.count;i++)assert.ok(Math.abs(weights.getX(i)+weights.getY(i)-1)<1e-6)
 }
 assert.deepEqual(rigged.animations.map(c=>c.name),['Hover','Idle','Landing','Takeoff','Walk','Claw_L','Claw_R'])
})

test('four complete limbs rotate independently; body and other rigid regions do not stretch or follow the wrong joint',async()=>{
 const {views}=await fixture(),v=views[0],motion=v.motion,g=v.levels[0].geometry,p=g.attributes.position,idx=g.attributes.skinIndex,w=g.attributes.skinWeight,point=new Vector3(),before=new Vector3(),identity=new Matrix4()
 assert.ok(motion.matrices.every(m=>m.elements.every((n,i)=>Math.abs(n-identity.elements[i])<1e-6)))
 for(let i=0;i<p.count;i++)if(p.getY(i)>.52||Math.abs(p.getX(i))<.24&&p.getZ(i)>.30&&p.getY(i)>.01){assert.equal(idx.getX(i),0,'Head and launchers must stay on the rigid body');assert.equal(w.getX(i),1)}
 for(let joint=1;joint<5;joint++){
  motion.reset();motion.joints[joint].rotation.x=.25;motion.sync();let changed=0,stationary=0
  for(let i=0;i<p.count;i+=3){if(w.getX(i)<.999)continue;before.fromBufferAttribute(p,i);v.levels[0].getVertexPosition(i,point);if(idx.getX(i)===joint){if(point.distanceTo(before)>.01)changed++}else{assert.ok(point.distanceTo(before)<1e-6,'Unrelated rigid region moved');stationary++}}
  assert.ok(changed>300&&stationary>3000)
  for(const bone of motion.joints)assert.deepEqual(bone.scale.toArray(),[1,1,1])
 }
 motion.reset()
 for(const other of views.slice(1)){for(let l=0;l<3;l++){assert.equal(v.levels[l].geometry,other.levels[l].geometry);assert.equal(v.levels[l].material,other.levels[l].material)}for(let j=0;j<5;j++)assert.notEqual(motion.joints[j],other.motion.joints[j])}
 for(const v of views)v.motion.dispose()
})

test('walk alternates hips, retains every rigid limb length and has a small stable body transfer; claws act on one arm',async()=>{
 const {views}=await fixture(),m=views[0].motion,poses=[]
 for(const time of [0,.35,.7,1.05]){m.reset();const a=m.select('Walk',true);a.time=time;m.mixer.update(0);m.sync();poses.push(m.joints.map(j=>j.rotation.x));assert.ok(Math.abs(m.body.position.y)<.01);for(let j=1;j<5;j++)assert.deepEqual(m.joints[j].position.toArray(),SCOUT_JOINTS[j].pivot)}
 assert.ok(poses[0][3]>.18&&poses[0][4]<-.18);assert.ok(poses[2][3]<-.18&&poses[2][4]>.18)
 for(const [name,joint,other]of [['Claw_L',1,2],['Claw_R',2,1]]){m.reset();const a=m.select(name,true);a.time=SCOUT_MOTION.clawImpact;m.mixer.update(0);m.sync();assert.ok(m.joints[joint].rotation.x<-.6);assert.ok(Math.abs(m.joints[other].rotation.x)<.001)}
 for(const v of views)v.motion.dispose()
})

test('right shin has no body-pinned vertex or stretched triangle while flying, landing, walking or striking',async()=>{
 const {views}=await fixture(),v=views[0],mesh=v.levels[0],g=mesh.geometry,p=g.attributes.position,j=g.attributes.skinIndex,w=g.attributes.skinWeight,point=new Vector3(),a=new Vector3(),b=new Vector3(),restA=new Vector3(),restB=new Vector3()
 let repaired=-1
 for(let i=0;i<p.count;i++)if(Math.hypot(p.getX(i)+.365916,p.getY(i)+.371422,p.getZ(i)-.384958)<.00001)repaired=i
 assert.ok(repaired>=0);assert.equal(j.getX(repaired),4);assert.equal(w.getX(repaired),1)
 const edges=[]
 for(let t=0;t<g.index.count;t+=3){const ids=[0,1,2].map(n=>g.index.getX(t+n));if(ids.includes(repaired))for(let n=0;n<3;n++)edges.push([ids[n],ids[(n+1)%3]])}
 assert.equal(edges.length,27,'The nine incident faces stay in the original mesh')
 for(const clip of ['Hover','Landing','Takeoff','Walk','Claw_L','Claw_R'])for(const fraction of [0,.25,.5,.75,1]){
  v.motion.reset();const action=v.motion.select(clip,true);action.time=action.getClip().duration*fraction;v.motion.mixer.update(0);v.motion.sync()
  for(const [ia,ib]of edges){mesh.getVertexPosition(ia,a);mesh.getVertexPosition(ib,b);restA.fromBufferAttribute(p,ia);restB.fromBufferAttribute(p,ib);assert.ok(Math.abs(a.distanceTo(b)-restA.distanceTo(restB))<.000001,`${clip}: right leg face stretched`)}
  mesh.getVertexPosition(repaired,point);assert.ok(point.toArray().every(Number.isFinite))
 }
 for(const other of views)other.motion.dispose()
})

test('cyan claw tips and inner hooks follow their arm rigidly and never get pulled by either leg, at all three LODs',async()=>{
 const {views}=await fixture(),v=views[0],source=glb('public/models/mospeada/invid-scout.glb'),image=source.doc.images[source.doc.textures[source.doc.materials[0].pbrMetallicRoughness.baseColorTexture.index].source],bv=source.doc.bufferViews[image.bufferView],paint=readRgbaPng(source.binary.subarray(bv.byteOffset||0,(bv.byteOffset||0)+bv.byteLength)),point=new Vector3(),expected=new Vector3()
 for(const mesh of v.levels){
  const p=mesh.geometry.attributes.position,uv=mesh.geometry.attributes.uv,j=mesh.geometry.attributes.skinIndex,w=mesh.geometry.attributes.skinWeight,claws=[]
  for(let i=0;i<p.count;i++){
   if(p.getY(i)<-.505||p.getY(i)>.03||p.getZ(i)<.31||Math.abs(p.getX(i))<.30)continue
   const x=Math.min(paint.width-1,Math.max(0,Math.floor(uv.getX(i)*paint.width))),y=Math.min(paint.height-1,Math.max(0,Math.floor(uv.getY(i)*paint.height))),at=(y*paint.width+x)*4,r=paint.pixels[at],g=paint.pixels[at+1],b=paint.pixels[at+2]
   if(g>r*1.15&&b>r*1.3&&b>50&&g>35&&b<g*1.7&&g<b*1.7){const arm=p.getX(i)>0?1:2;assert.equal(j.getX(i),arm,'Claw vertex must not be attached to the adjacent shin');assert.equal(w.getX(i),1);claws.push([i,arm])}
  }
  assert.ok(claws.length>250)
  v.motion.reset();v.motion.joints[3].rotation.x=.4;v.motion.joints[4].rotation.x=-.4;v.motion.sync()
  for(const [i]of claws){mesh.getVertexPosition(i,point);expected.fromBufferAttribute(p,i);assert.ok(point.distanceTo(expected)<1e-6,'A walking leg cannot drag a claw')}
  v.motion.reset();v.motion.joints[1].rotation.x=-.64;v.motion.joints[2].rotation.x=.26;v.motion.sync()
  for(const [i,arm]of claws){mesh.getVertexPosition(i,point);expected.fromBufferAttribute(p,i).applyMatrix4(v.motion.matrices[arm]);assert.ok(point.distanceTo(expected)<1e-6,'The entire pincer retains one rigid arm transform')}
 }
 for(const other of views)other.motion.dispose()
})

test('the five Scouts independently hover, land, walk and take off while the eight-round violet bursts remain live',async()=>{
 const {views}=await fixture(),patrol=new DesertScoutPatrol(views,()=>0,()=>.5),player={x:0,z:-650,height:0,speed:0},camera=new PerspectiveCamera(),world={bound:true,position:new Vector3(),distance:z=>-z,contains:(x,z)=>Math.abs(x)<2400&&z<0&&z>-2400},names=new Set()
 for(let frame=0;frame<1000;frame++){patrol.update(.05,player,camera,world,{onPlayerHit:()=>{}});for(const r of patrol.scouts){names.add(r.view.motion.name);assert.ok(r.position.toArray().every(Number.isFinite));assert.ok(r.view.motion.matrices.every(m=>m.elements.every(Number.isFinite)))}}
 for(const state of ['Hover','Landing','Walk','Takeoff'])assert.ok(names.has(state),'Missing '+state)
 assert.ok(patrol.shots>40);assert.ok(patrol.scouts.some(r=>r.landings>0&&r.takeoffs>0));assert.ok(patrol.scouts.some(r=>r.landings===0));assert.ok(patrol.bolts.filter(b=>b.active).length<=SCOUT_PATROL.projectiles)
 const geometry=views[0].levels[0].geometry;assert.equal(geometry.index.count/3,79986)
 // Isolate the claw contact from other Scouts' projectile hits sharing Scott's
 // hurt cooldown; the full sustained-fire scenario above remains exercised.
 patrol.stopCombat();patrol.playerHurtCooldown=0;for(const scout of patrol.scouts)scout.cooldown=Infinity
 const r=patrol.scouts[0];r.mode='ground';r.modeTime=0;r.position.set(0,.025,player.z-2);r.velocity.set(0,0,0);r.yaw=0;r.clawCooldown=0;r.clawAge=Infinity;let hits=0
 for(let i=0;i<15;i++)patrol.update(.05,player,camera,world,{onPlayerHit:b=>{if(b===r.clawContact)hits++}})
 assert.equal(hits,1,'One contact per committed claw strike');assert.ok(r.clawCooldown>0);assert.ok(r.clawHit)
 const frozen=views.map(v=>v.motion.joints.map(j=>j.quaternion.toArray()));patrol.update(0,player,camera,world);assert.deepEqual(views.map(v=>v.motion.joints.map(j=>j.quaternion.toArray())),frozen)
 for(const v of views)v.motion.dispose()
})

test('flight tucks both hips backward, gathers the arms inward and actually changes limb matrices over time',async()=>{
 const {views}=await fixture(),m=views[0].motion
 m.select('Hover',true).time=0;m.mixer.update(0);m.sync()
 assert.ok(m.joints[3].rotation.x>.65&&m.joints[4].rotation.x>.65)
 assert.ok(m.joints[1].rotation.x<-.35&&m.joints[2].rotation.x<-.35)
 assert.ok(m.joints[1].rotation.z<-.2&&m.joints[2].rotation.z>.2)
 const before=m.matrices.map(mat=>mat.clone())
 m.current.time=.7;m.mixer.update(0);m.sync()
 for(let joint=1;joint<5;joint++)assert.ok(m.matrices[joint].elements.some((v,i)=>Math.abs(v-before[joint].elements[i])>.005),'Flight limb must not be static')
 for(const v of views)v.motion.dispose()
})

test('gameplay rig test reuses one Scout, lands within sight, walks into real claw reach, then takes off',async()=>{
 const {views}=await fixture(),patrol=new DesertScoutPatrol(views,()=>0,()=>.5,{rigTestId:0}),player={x:0,z:-650,height:0,speed:0},world={bound:true,position:new Vector3(),distance:z=>-z,contains:()=>true},names=new Set();let walked=0,remoteHits=0,previous
 for(let frame=0;frame<300;frame++){
  patrol.update(.05,player,new PerspectiveCamera(),world,{onPlayerHit:b=>{if(b===patrol.scouts[0].clawContact){assert.ok(Math.hypot(b.position.x-b.source.x,b.position.z-b.source.z)<3);remoteHits++}}})
  const r=patrol.scouts[0]
  if(r.rigTest){names.add(r.view.motion.name);assert.ok(Math.hypot(r.position.x-player.x,r.position.z-player.z)<9);if(r.mode==='ground'&&previous)walked+=r.position.distanceTo(previous)}
  previous=r.position.clone()
 }
 for(const name of ['Landing','Walk','Claw_R'])assert.ok(names.has(name),'Missing visible test state '+name)
 assert.ok(walked>3);assert.equal(remoteHits,1,'Exactly one actual contact, within reach')
 assert.equal(patrol.scouts.length,5);assert.equal(patrol.scouts[0].takeoffs,1);assert.ok(patrol.scouts.slice(1).some(r=>r.shots>0))
 for(const v of views)v.motion.dispose()
})
