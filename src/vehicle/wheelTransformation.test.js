import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {clone} from 'three/addons/utils/SkeletonUtils.js'
import {createDrivingCyclone} from './createDrivingCyclone.js'
import {FrontBattloidTransform} from './FrontBattloidTransform.js'
import {RearBattloidTransform} from './RearBattloidTransform.js'
import {WheelBattloidTransform} from './WheelBattloidTransform.js'
import {wheelStartProgress,wheelIntermediateProgress,wheelBehindProgress,wheelEndProgress} from './wheelMotion.js'
import {wheelArmorState} from './wheelArmorState.js'

globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const wheelData=JSON.parse(fs.readFileSync('public/transformations/cyclone-wheel-battloid.json')),data=JSON.parse(fs.readFileSync('public/transformations/cyclone-rear-battloid.json')),frontData=JSON.parse(fs.readFileSync('public/transformations/cyclone-front-battloid.json'))
async function load(path){const b=fs.readFileSync(path);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')}
const assets=Promise.all([load('public/models/mospeada/cyclone-vr052f.glb'),load('public/models/mospeada/scott-bernard-animated-original.glb'),load('public/transformations/cyclone-rear-pieces.glb')])
async function fixture(){
  const [bike,scott,parts]=await assets,rig=createDrivingCyclone(bike.scene),model=clone(scott.scene),wrapper=new T.Group(),bones=new Map()
  model.traverse(n=>{if(n.isBone)bones.set(n.name,n)});wrapper.add(model);wrapper.scale.setScalar(1.2607598654);wrapper.position.set(.8,.2,-.3);wrapper.updateMatrixWorld(true)
  const front=new FrontBattloidTransform(rig,{model,bones},frontData),rear=new RearBattloidTransform(rig,front,data,parts.scene),wheels=new WheelBattloidTransform(rig,front,rear,wheelData)
  return{rig,wrapper,bones,front,rear,wheels,apply(p,settings){wheels.restore();rear.restore();front.restore();front.apply(p,{turn:1,separate:1});rear.apply(p);wheels.apply(p,settings)}}
}


test('exported intermediate poses stay exact; final front height aligns with rear without editing JSON poses',async()=>{
  const f=await fixture()
  for(const [x,y,z,yaw]of[[0,0,0,0],[82,4,-38,1.4]]){
    f.wheels.restore();f.rear.restore();f.front.restore();f.rig.root.position.set(x,y,z);f.rig.root.rotation.y=yaw;f.rig.root.updateMatrixWorld(true)
    f.wrapper.position.set(x+.8,y+.2,z-.3);f.wrapper.rotation.y=yaw;f.wrapper.updateMatrixWorld(true)
    for(const p of[0,.1,wheelStartProgress]){f.apply(p);assert.equal(f.wheels.applied,false)}
    f.apply(.23);assert.equal(f.wheels.applied,true,'Wheels depart with the tank, immediately after CHEST')
    for(const [progress,state]of[[wheelIntermediateProgress,'intermediate'],[wheelEndProgress,'final'],[1,'final']]){
      f.apply(progress)
      const common=f.front.anchorWorld.clone().multiply(f.front.referenceBind.clone().invert())
      for(const g of f.wheels.groups){
        const pose=g.record.poses[state],expected=common.clone().multiply(new T.Matrix4().fromArray(pose.targetInModel))
        const alignment=state==='final'?g.alignmentWorld:new T.Vector3()
        expected.elements[12]+=alignment.x;expected.elements[13]+=alignment.y;expected.elements[14]+=alignment.z
        for(const part of g.parts){
          const points=part.mesh.geometry.attributes.position
          for(const i of[0,Math.floor(points.count/2),points.count-1]){
            const v=new T.Vector3().fromBufferAttribute(points,i),actual=v.clone().applyMatrix4(part.mesh.matrixWorld)
            assert.ok(actual.distanceTo(v.applyMatrix4(expected))<1e-6,'Authored geometry and orientation survive the explicit height correction')
          }
        }
        for(const c of pose.checkpoints){
          const source=new T.Vector3(...c.source).applyMatrix4(g.world),target=new T.Vector3(...c.target).applyMatrix4(common).add(alignment)
          assert.ok(source.distanceTo(target)<1e-6,'Persistent vertices reach authored coordinates without double transforms')
        }
      }
    }
    const before=f.wheels.groups[0].end.clone(),departure=new T.Vector3(6,2,-1)
    f.wrapper.position.add(departure);f.wrapper.updateMatrixWorld(true);f.apply(1)
    assert.ok(f.wheels.groups[0].end.clone().sub(before).distanceTo(departure)<1e-6)
  }
  f.wheels.dispose();f.rear.dispose()
})

test('front sweeps left around its real socket; rear uses independent articulated arcs',async()=>{
  const f=await fixture(),inverse=new T.Matrix4(),rows=[]
  for(let i=1;i<=38;i++){
    const progress=wheelStartProgress+(wheelEndProgress-wheelStartProgress)*i/38;f.apply(progress)
    const result=[]
    for(const g of f.wheels.groups){
      assert.equal(g.housing.source.mesh,f.rig.hydraulicSeats[g.record.wheel==='front'?0:1].housing)
      const actual=g.center.clone().applyMatrix4(g.world).addScaledVector(g.alignmentWorld,-g.motion.fit).applyMatrix4(inverse.copy(g.frame).invert())
      const k=g.motion.segment,t=g.motion.blend,a=g.center.clone().applyMatrix4(g.keys[k]),b=g.center.clone().applyMatrix4(g.keys[k+1])
      if(g.record.wheel==='rear'||g.motion.segment===0)assert.ok(Math.abs(actual.length()-(a.length()+(b.length()-a.length())*t))<1e-6,'Radial extension around the pivot, never a position chord')
      if(g.record.wheel==='front'&&g.motion.segment===1)assert.ok(Math.abs(Math.hypot(actual.x,actual.z)-Math.hypot(a.x,a.z))<1e-6,'Continue a horizontal circle, without taking a diagonal chord')
      assert.ok(f.wheels.baseAt(g,progress,new T.Vector3()).distanceTo(g.base)<1e-6,'Read existing socket choreography')
      if(g.record.wheel==='front'){
        assert.ok(actual.z>0||actual.x>0,'Front avoids rear-right quadrant')
        if((g.motion.segment===0&&g.motion.blend>.5)||(g.motion.segment===1&&g.motion.blend<.7))assert.ok(actual.x>.2,'Front passes Scott on his left')
        if(g.motion.segment===0)assert.ok(actual.y>-.45,'No sweep under Scott')
      }
      result.push({actual:actual.toArray(),angle:g.motion.angle,length:g.hydraulic.state.length,case:g.hydraulic.sleeve.scale.y})
    }
    rows.push({progress,wheels:result})
  }
  const angles=rows.filter(r=>r.progress<=wheelBehindProgress).map(r=>r.wheels[0].angle)
  assert.ok(angles.every((a,i)=>!i||a>=angles[i-1]-1e-7),'Front travels forward -> left -> rear')
  assert.ok(angles.at(-1)-angles[0]>2.5,'Approximately semicircular sweep')
  assert.ok(rows.some(r=>r.wheels[0].actual[0]>.45&&Math.hypot(r.wheels[0].actual[0]-r.wheels[1].actual[0],r.wheels[0].actual[2]-r.wheels[1].actual[2])>.2),'Rear does not reuse front sweep')
  fs.writeFileSync('artifacts/wheel-battloid/mechanism-measurements.json',JSON.stringify(rows,null,2)+'\n')
  f.wheels.dispose();f.rear.dispose()
})

test('front finishes its horizontal sweep behind the bike before rising; both wheels finish early at equal height',async()=>{
  const f=await fixture(),front=f.wheels.groups[0],rear=f.wheels.groups[1],position=g=>g.center.clone().applyMatrix4(g.world)
  f.apply(wheelIntermediateProgress);const startHeight=position(front).y
  for(const p of[wheelIntermediateProgress,.46,.5,.54,wheelBehindProgress]){
    f.apply(p)
    assert.ok(Math.abs(position(front).y-startHeight)<1e-6,'Moving housing must not pull the horizontal wheel diagonally upward')
    assert.equal(front.motion.fit,0,'Do not lift before the rearward sweep completes')
  }
  const relative=position(front).applyMatrix4(front.frame.clone().invert())
  assert.ok(relative.z<-.4&&Math.abs(relative.x)<1e-6,'Wheel is behind its articulation')
  const axle=new T.Vector3(1,0,0).transformDirection(front.world),bikeAxle=new T.Vector3(1,0,0).applyQuaternion(f.front.model.getWorldQuaternion(new T.Quaternion()))
  assert.ok(Math.abs(axle.dot(bikeAxle))>.999999,'Wheel plane parallel to Motorcycle')
  f.apply(.63);assert.ok(position(front).y>startHeight+.05,'Rise begins only after the horizontal sweep')
  f.apply(wheelEndProgress)
  assert.ok(Math.abs(position(front).y-position(rear).y)<1e-6,'Final wheel centers share the rear wheel height')
  assert.ok(front.alignmentModel.y<0,'Front is lowered rather than raising rear')
  const final=f.wheels.groups.map(g=>g.world.clone())
  for(const p of[.8,1]){f.apply(p);f.wheels.groups.forEach((g,i)=>assert.ok(g.world.elements.every((v,j)=>Math.abs(v-final[i].elements[j])<1e-7),'No lingering wheel motion after 70 percent'))}
  f.wheels.dispose();f.rear.dispose()
})

test('Armor composition controls are neutral by default and adjust each wheel without changing JSON targets or wheel shape',async()=>{
  const f=await fixture(),settings=structuredClone(wheelArmorState.defaults),front=f.wheels.groups[0],rear=f.wheels.groups[1]
  assert.ok(Object.values(settings).every(w=>Object.values(w).every(n=>n===0)))
  f.apply(1);const original=front.world.clone(),rearOriginal=rear.world.clone(),end=front.end.clone(),radius=front.end.distanceTo(front.base),caseLength=front.hydraulic.sleeve.scale.y
  settings.front.height=-.2;settings.front.lateral=.1;settings.front.depth=-.15;f.apply(1,settings)
  assert.ok(front.end.clone().sub(end).distanceTo(new T.Vector3(.1,-.2,-.15))<1e-6)
  assert.ok(rear.world.elements.every((v,i)=>Math.abs(v-rearOriginal.elements[i])<1e-8),'Rear has independent settings')
  settings.front.height=settings.front.lateral=settings.front.depth=0;settings.front.shortening=.25;f.apply(1,settings)
  assert.ok(Math.abs(front.end.distanceTo(front.base)-(radius-.25))<1e-6)
  assert.ok(front.hydraulic.sleeve.scale.y<caseLength,'Explicit shortening also retracts the visible casing')
  const scale=new T.Vector3(),p=new T.Vector3(),q=new T.Quaternion(),beforeScale=new T.Vector3()
  original.decompose(p,q,beforeScale);front.world.decompose(p,q,scale);assert.ok(scale.distanceTo(beforeScale)<1e-7,'Tires are never scaled to lower them')
  f.apply(1);assert.ok(front.world.elements.every((v,i)=>Math.abs(v-original.elements[i])<1e-8));assert.ok(Math.abs(front.hydraulic.sleeve.scale.y-caseLength)<1e-8)
  const other=[...f.front.parts,...f.rear.parts].map(p=>({m:p.mesh,matrix:p.mesh.matrix.toArray()}))
  f.wheels.restore();f.wheels.apply(1,settings)
  for(const o of other)assert.deepEqual(o.m.matrix.toArray(),o.matrix,'Do not alter front/rear choreography')
  f.wheels.dispose();f.rear.dispose()
})

test('custom hydraulic endpoints stay connected to their housing and wheel while every wheel stays rigid',async()=>{
  const f=await fixture(),resources=f.rig.hydraulics.map(h=>({h,meshes:[h.sleeve,h.rod,h.baseJoint,h.endJoint,h.endPin].map(m=>({m,geometry:m.geometry,material:m.material}))}))
  for(const p of[.22,.23,.3,.43,.61,.64,.8,1,.85,.7,0]){
    f.apply(p)
    for(const g of f.wheels.groups){
      const h=g.hydraulic
      if(p>wheelStartProgress){
        assert.ok(h.baseJoint.getWorldPosition(new T.Vector3()).distanceTo(g.housing.mesh.localToWorld(g.baseInHousing.clone()))<1e-6)
        assert.ok(h.endJoint.getWorldPosition(new T.Vector3()).distanceTo(g.end)<1e-6)
        assert.ok(h.endPin.localToWorld(new T.Vector3(0,.5,0)).distanceTo(g.mount)<1e-6)
        const matrix=g.parts[0].mesh.matrixWorld
        for(const r of g.parts){
          assert.ok(r.mesh.matrixWorld.elements.every((v,i)=>Math.abs(v-matrix.elements[i])<1e-8))
          const scale=r.mesh.getWorldScale(new T.Vector3());assert.ok(Math.abs(scale.x-scale.y)+Math.abs(scale.y-scale.z)<1e-7,'No wheel squashing')
        }
      }
      assert.ok(h.state.baseError+h.state.targetError+h.state.connectorStartError+h.state.connectorEndError<1e-5)
    }
    for(const r of resources)for(const m of r.meshes){assert.equal(m.m.geometry,m.geometry);assert.equal(m.m.material,m.material)}
    assert.ok(f.rig.surfaces.filter(m=>/brazo tubular/.test(m.userData.sourcePiece)).every(m=>!m.visible),'Do not resurrect authored tubes')
  }
  f.wheels.dispose();f.rear.dispose()
})

test('reversal restores the wheels and approved hydraulic mechanics without changing parents, geometry, bones or physics',async()=>{
  const f=await fixture(),original=f.wheels.parts.map(p=>({p,matrix:p.mesh.matrix.toArray(),geometry:p.mesh.geometry,material:p.mesh.material,parent:p.mesh.parent,auto:p.mesh.matrixAutoUpdate}))
  const hydraulic=f.rig.hydraulics.map(h=>({h,base:h.base.toArray(),target:h.target.toArray(),position:h.root.position.toArray(),length:h.state.length})),bones=[...f.bones.values()].map(b=>({b,p:b.position.toArray(),q:b.quaternion.toArray(),s:b.scale.toArray()}))
  for(let repeat=0;repeat<3;repeat++)for(const p of[0,.5,.7,1,.9,.7,0])f.apply(p)
  for(const r of original){assert.deepEqual(r.p.mesh.matrix.toArray(),r.matrix);assert.equal(r.p.mesh.geometry,r.geometry);assert.equal(r.p.mesh.material,r.material);assert.equal(r.p.mesh.parent,r.parent);assert.equal(r.p.mesh.matrixAutoUpdate,r.auto)}
  for(const r of hydraulic){assert.deepEqual(r.h.base.toArray(),r.base);assert.deepEqual(r.h.target.toArray(),r.target);assert.deepEqual(r.h.root.position.toArray(),r.position);assert.ok(Math.abs(r.h.state.length-r.length)<1e-8)}
  for(const r of bones){assert.deepEqual(r.b.position.toArray(),r.p);assert.deepEqual(r.b.quaternion.toArray(),r.q);assert.deepEqual(r.b.scale.toArray(),r.s)}
  f.wheels.dispose();f.rear.dispose()
})
