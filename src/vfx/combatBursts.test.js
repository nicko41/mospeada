import test from 'node:test'
import assert from 'node:assert/strict'
import {DataTexture,Group,Matrix4,Mesh,MeshBasicMaterial,PerspectiveCamera,Scene,SphereGeometry,Vector3} from 'three'
import {VFXRuntime} from './VFXRuntime.js'
import {Plano3CombatVFX} from './Plano3CombatVFX.js'
import {COMBAT_VFX_LIMITS,COMBAT_VFX_PRESETS} from './combatVFXPresets.js'
import {INVID_GROUND_ATLAS,explosionFrame,explosionFrameRect} from './explosionAtlas.js'

function fixture(options={}){
  const runtime=new VFXRuntime(),fx=runtime.register('combat',new Plano3CombatVFX(options)),camera=new PerspectiveCamera(),muzzle=new Vector3(0,2.6,10)
  new Scene().add(runtime.root)
  const e={active:true,time:1,bolts:[]},weapon={root:{visible:true},getMuzzle:p=>p.copy(muzzle)}
  const tick=(seconds)=>{for(let t=0;t<seconds;t+=1/120){e.time+=1/120;runtime.update(1/120);fx.update(1/120,e,weapon,camera)}}
  return {runtime,fx,camera,e,weapon,muzzle,tick}
}

test('terrain contact animates the supplied twelve-frame dust sheet, without fire/rings/hit sparks, then recycles',()=>{
 const texture=new DataTexture(new Uint8Array([255,255,255,255]),1,1),{runtime,fx,camera,e,weapon}=fixture({explosionAtlases:{terrain:texture},sampleGround:()=>0}),point=new Vector3(3,0,-10)
 try{
  const buffer=fx.impacts.terrainSprites.instanceMatrix,frames=new Set()
  fx.enemyWorldImpact(point,new Vector3(0,-42,0));const r=fx.impacts.records.find(r=>r.name==='invidGroundImpact')
  for(let i=0;i<12;i++){
   fx.update(i===0?0:.035,e,weapon,camera);frames.add(r.frame)
   assert.equal(fx.impacts.terrainSprites.count,1);assert.equal(fx.flashMesh.count,0);assert.equal(fx.impacts.rings.count,0);assert.equal(fx.impacts.fire.count,0)
   assert.equal(fx.systems[0].particleNum,0);assert.equal(fx.impacts.airSprites.count+fx.impacts.groundSprites.count,0)
   assert.deepEqual(r.position,point,'Sprite stays anchored at the actual terrain contact')
  }
  assert.equal(frames.size,12);assert.equal(INVID_GROUND_ATLAS.width/4,INVID_GROUND_ATLAS.height/3)
  fx.update(.1,e,weapon,camera);assert.equal(fx.impacts.terrainSprites.count,0)
  for(let i=0;i<100;i++)fx.enemyWorldImpact(point)
  fx.update(.05,e,weapon,camera);assert.equal(fx.impacts.terrainSprites.count,16);assert.equal(fx.impacts.terrainSprites.instanceMatrix,buffer)
  fx.clear();assert.equal(fx.impacts.stats.terrainSprites,0)
 }finally{runtime.dispose();texture.dispose()}
})

test('Gallant impacts resolve the Scout skin, emit outward and leave gameplay/muzzle transforms untouched',()=>{
  const {runtime,fx,camera,e,weapon,muzzle,tick}=fixture(),root=new Group(),mesh=new Mesh(new SphereGeometry(2,16,12),new MeshBasicMaterial())
  mesh.position.y=2.6;root.add(mesh);root.updateMatrixWorld(true)
  const target={position:new Vector3(),height:5.2,radius:2.3,dead:false,health:9,hitVersion:1,view:{root,levels:[mesh],lod:0}},logical=new Vector3(0,2.6,2.5),before=root.matrixWorld.clone()
  try{
    fx.shot(weapon,{hit:target,point:logical,destroyed:false},e);fx.update(0,e,weapon,camera)
    const hit=fx.impacts.records.find(r=>r.name==='invidHit'&&r.age<r.life)
    assert.ok(Math.abs(hit.position.z-2)<.01,'Visual contact is on the mesh skin, not the logical bounding box or model centre')
    assert.ok(hit.normal.z>.94)
    for(let i=0;i<fx.systems[0].particleNum;i++)assert.ok(fx.systems[0].particles[i].velocity.z>0,'Sparks leave the outward-facing surface cone')
    assert.equal(logical.z,2.5);assert.deepEqual(root.matrixWorld,before);assert.equal(target.health,9)
    assert.ok(fx.traces[0].from.distanceTo(muzzle)<1e-8)
    assert.ok(fx.scoutVisual(target).tint.r>1)
    tick(.06);assert.ok(fx.scoutVisual(target).recoil.length()>.01)
    const anchored=hit.position.clone();muzzle.set(30,20,40);target.position.x=20;tick(.05)
    assert.deepEqual(hit.position,anchored,'Movement/boost cannot drag a world-space impact')
    tick(.3);assert.equal(fx.impacts.stats.active,0);assert.equal(fx.systems[0].particleNum,0)
  }finally{runtime.dispose();mesh.geometry.dispose();mesh.material.dispose()}
})

test('airborne and grounded Scouts explode once at body height, disappear on cue and leave no pooled remnants',()=>{
  for(const ground of [0,9]){
    const {runtime,fx,camera,e,weapon,tick}=fixture({sampleGround:()=>0}),target={position:new Vector3(2,ground,-6),height:5.2,radius:2.3,dead:true,health:0,hitVersion:10}
    try{
      fx.shot(weapon,{hit:target,point:new Vector3(2,ground+2,-4),destroyed:true},e);fx.update(0,e,weapon,camera)
      const death=fx.impacts.records.find(r=>r.name==='invidExplosion'&&r.age<r.life)
      assert.equal(death.position.y,ground+5.2*.48);assert.equal(fx.stats.explosions,1)
      assert.equal(fx.scoutVisual(target).visible,true)
      tick(.1);assert.equal(fx.scoutVisual(target).visible,true);assert.equal(fx.scoutVisual(target).opacity,1,'Body overlaps the first explosion frames')
      tick(.06);assert.ok(fx.scoutVisual(target).opacity>0&&fx.scoutVisual(target).opacity<1,'Body darkens/dissolves instead of disappearing at once')
      tick(.07);assert.equal(fx.scoutVisual(target).visible,false);assert.ok(fx.impacts.fragments.count>0)
      assert.equal(death.grounded,ground===0);assert.ok(ground===0?fx.impacts.smoke.count>0:fx.impacts.smoke.count===0)
      for(let i=0;i<20;i++)fx.scoutVisual(target)
      assert.equal(fx.stats.explosions,1,'Observing a defeated target cannot replay its explosion')
      assert.ok(death.size<target.height,'Explosion size is proportional to the Scout')
      tick(1.2)
      assert.equal(fx.impacts.stats.active,0);assert.equal(fx.systems.reduce((n,p)=>n+p.particleNum,0),0)
      for(const mesh of fx.impacts.meshes)assert.equal(mesh.count,0)
      assert.ok(fx.impacts.lights.every(l=>l.intensity===0))
      assert.equal(target.dead,true);assert.equal(target.health,0);assert.equal(target.position.y,ground)
    }finally{runtime.dispose()}
  }
})

test('consecutive hits, five Scout explosions and saturated pools reuse bounded buffers and pause cleanly',()=>{
  const {runtime,fx,camera,e,weapon,tick}=fixture(),buffers=[fx.impacts.fire.instanceMatrix,fx.impacts.smoke.instanceMatrix,fx.impacts.fragments.instanceMatrix],geometries=fx.root.children.filter(m=>m.isMesh).map(m=>m.geometry)
  try{
    for(let i=0;i<5;i++){
      const target={position:new Vector3(i*3,4,-8),height:5.2,radius:2.3,dead:true,health:0}
      fx.shot(weapon,{hit:target,point:target.position.clone(),destroyed:true},e);tick(.035)
    }
    assert.equal(fx.stats.explosions,5)
    for(let i=0;i<60;i++)fx.enemyImpact(new Vector3(i*.1,0,-5),new Vector3(0,-1,-2))
    fx.update(0,e,weapon,camera)
    assert.ok(fx.impacts.stats.recycled>0);assert.ok(fx.impacts.stats.active<=COMBAT_VFX_LIMITS.bursts)
    assert.equal(fx.impacts.records.filter(r=>r.name==='invidExplosion'&&r.age<r.life).length,5,'Impact saturation cannot evict any of five simultaneous Scout explosions')
    for(const mesh of [fx.impacts.fire,fx.impacts.rings,fx.impacts.smoke,fx.impacts.fragments])assert.ok(mesh.count<=mesh.instanceMatrix.count)
    assert.ok(fx.systems[0].particleNum<=48&&fx.systems[1].particleNum<=96)
    const ages=fx.impacts.records.map(r=>r.age),matrix=fx.impacts.fire.instanceMatrix.array.slice()
    fx.update(0,e,weapon,camera);assert.deepEqual(fx.impacts.records.map(r=>r.age),ages);assert.deepEqual(fx.impacts.fire.instanceMatrix.array,matrix)
    assert.deepEqual([fx.impacts.fire.instanceMatrix,fx.impacts.smoke.instanceMatrix,fx.impacts.fragments.instanceMatrix],buffers)
    assert.deepEqual(fx.root.children.filter(m=>m.isMesh).map(m=>m.geometry),geometries)
    tick(1.4);assert.equal(fx.impacts.stats.active,0);assert.equal(fx.systems.reduce((n,p)=>n+p.particleNum,0),0)
    fx.clear();assert.ok(fx.impacts.lights.every(l=>l.intensity===0))
  }finally{runtime.dispose()}
})

test('editable presets keep violet actor contact separate from earth impacts',()=>{
  const {runtime,fx,camera,e,weapon}=fixture()
  try{
    assert.deepEqual(Object.keys(fx.presets),['gallantImpact','invidHit','invidExplosion','invidLaserImpact','invidGroundImpact'])
    fx.presets.invidLaserImpact.size=1.2;fx.presets.invidLaserImpact.duration=.3
    fx.enemyImpact(new Vector3(3,0,7),new Vector3(0,-4,2));fx.update(0,e,weapon,camera)
    const r=fx.impacts.records.find(r=>r.age<r.life)
    assert.equal(r.size,1.2);assert.equal(r.life,.3);assert.deepEqual(r.position.toArray(),[3,0,7]);assert.ok(r.color.b>r.color.g*2)
    assert.equal(COMBAT_VFX_PRESETS.invidLaserImpact.size,.8,'Presets are isolated per runtime')
    assert.ok(fx.impacts.fire.material.map.image.data instanceof Uint8Array,'Default atlas is procedural')
  }finally{runtime.dispose()}
})

test('real explosion lights keep a fixed scene topology through combat, idle, pause and reset',()=>{
  const {runtime,fx,camera,e,weapon,tick}=fixture(),scene=runtime.root.parent
  const count=()=>{let n=0;scene.traverseVisible(o=>{if(o.isPointLight)n++});return n}
  assert.equal(fx.root.visible,false);assert.equal(count(),2);assert.equal(fx.impacts.lights.length,COMBAT_VFX_LIMITS.lights)
  const lights=fx.impacts.deathLights.slice();assert.ok(lights.every(l=>l.isPointLight&&l.visible&&!l.castShadow&&l.intensity===0))
  assert.ok(fx.impacts.lights.every(l=>l.intensity===0))
  fx.update(0,e,weapon,camera);assert.equal(fx.root.visible,true);assert.equal(count(),2)
  fx.enemyImpact(new Vector3(0,1,0));tick(.02);assert.ok(fx.impacts.lights.some(l=>l.intensity>0))
  fx.destroyTarget({position:new Vector3(2,0,-6),height:5.2,dead:true});fx.update(0,e,weapon,camera)
  const peak=lights[0].intensity;assert.ok(peak>0);assert.equal(count(),2)
  tick(.15);assert.ok(lights[0].intensity>0&&lights[0].intensity<peak)
  const paused=lights[0].intensity;fx.update(0,e,weapon,camera);assert.equal(lights[0].intensity,paused)
  tick(.08);assert.ok(lights.every(l=>l.intensity===0));assert.equal(count(),2)
  e.active=false;fx.update(.01,e,weapon,camera)
  assert.equal(fx.root.visible,false);assert.equal(count(),2)
  assert.ok(lights.every(l=>l.intensity===0&&l.visible));assert.deepEqual(fx.impacts.deathLights,lights)
  assert.ok(fx.impacts.lights.every(l=>l.intensity===0))
  runtime.dispose();assert.equal(count(),0)
})

test('the approved Invid hit keeps its timing, palette, sparks, flash and pulse',()=>{
  const {runtime,fx,camera,e,weapon}=fixture(),target={position:new Vector3(0,0,-6),height:5.2,radius:2.3,dead:false,health:9,hitVersion:1}
  try{
    assert.deepEqual([fx.presets.invidHit.size,fx.presets.invidHit.duration,fx.presets.invidHit.particles,fx.presets.invidHit.lightIntensity],[1,.26,11,6])
    assert.deepEqual([fx.presets.invidHit.core,fx.presets.invidHit.color,fx.presets.invidHit.residual],['#fffce5','#ffe44b','#bd54ff'])
    fx.shot(weapon,{hit:target,point:new Vector3(0,2.6,-4),destroyed:false},e);fx.update(0,e,weapon,camera)
    assert.equal(fx.impacts.fire.count,5);assert.equal(fx.impacts.rings.count,1);assert.equal(fx.flashMesh.count,4)
    assert.equal(fx.systems[0].particleNum,11);assert.equal(fx.sparkMaterial.map,fx.star)
    assert.equal(fx.impacts.groundSprites.count+fx.impacts.airSprites.count,0);assert.equal(fx.stats.explosions,0)
  }finally{runtime.dispose()}
})

test('ground and airborne deaths animate independent sheet frames without death stars/rings or new resources',()=>{
  const groundTexture=new DataTexture(new Uint8Array([255,255,255,255]),1,1),airTexture=groundTexture.clone()
  for(const grounded of [true,false]){
    const {runtime,fx,camera,e,weapon,tick}=fixture({explosionAtlases:{ground:groundTexture,air:airTexture},sampleGround:()=>0})
    const target={position:new Vector3(0,grounded?0:4,-8),height:5.2,radius:2.3,dead:true,health:0}
    try{
      fx.destroyTarget(target);fx.update(0,e,weapon,camera)
      const r=fx.impacts.records.find(r=>r.name==='invidExplosion'),sprite=grounded?fx.impacts.groundSprites:fx.impacts.airSprites,buffer=sprite.instanceMatrix,material=sprite.material
      assert.equal(sprite.count,0,'The internal emissive ignition precedes the main sheet');assert.equal(r.grounded,grounded);assert.equal(r.frame,0)
      assert.equal(fx.impacts.hotCore.count,3);assert.equal(fx.impacts.halos.count,1)
      tick(.05);assert.equal(sprite.count,1)
      assert.equal(sprite.material.map,grounded?groundTexture:airTexture)
      assert.ok(r.fireLife>=.35&&r.fireLife<=.7);assert.ok(r.life>r.fireLife+.4);assert.equal(fx.flashMesh.count,0);assert.equal(fx.impacts.rings.count,0)
      assert.notEqual(fx.deathSparkMaterial.map,fx.star)
      const before=sprite.geometry.attributes.aCombatFrame.array.slice(0,4)
      tick(.19);assert.ok(r.frame>=3);assert.notDeepEqual(sprite.geometry.attributes.aCombatFrame.array.slice(0,4),before)
      assert.equal(sprite.instanceMatrix,buffer);assert.equal(sprite.material,material);assert.equal(fx.impacts.rings.count,0)
      if(grounded){
        const matrix=new Matrix4();sprite.getMatrixAt(0,matrix);const scale=new Vector3().setFromMatrixScale(matrix)
        assert.ok(Math.abs(matrix.elements[13]-scale.y*.5-.035)<1e-6,'Ground animation base stays on the sampled floor')
        assert.ok(fx.impacts.smoke.count>0)
      }else assert.equal(fx.impacts.smoke.count,0,'Air animation does not create a floating floor-dust sheet')
      tick(.6);assert.equal(sprite.count,0);assert.ok(fx.impacts.residualSmoke.count>0,'Residual smoke outlives the fire sheet')
      tick(.4);assert.equal(fx.impacts.stats.active,0);assert.equal(fx.impacts.residualSmoke.count,0)
    }finally{runtime.dispose()}
  }
  groundTexture.dispose();airTexture.dispose()
})

test('atlas UVs cover all twelve authored frames with padding and independent mirroring',()=>{
  assert.equal(explosionFrame(0),0);assert.equal(explosionFrame(.5),6);assert.equal(explosionFrame(1),11)
  for(let i=0;i<12;i++){
    const [u,v,w,h]=explosionFrameRect(i),mirrored=explosionFrameRect(i,true)
    assert.ok(u>=(i%4)/4&&u+w<=(i%4+1)/4);assert.ok(v>=0&&v+h<=1)
    assert.ok(Math.abs(mirrored[0]+mirrored[2]-u)<1e-8);assert.equal(mirrored[1],v);assert.equal(mirrored[3],h)
  }
})
