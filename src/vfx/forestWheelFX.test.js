import test from 'node:test'
import assert from 'node:assert/strict'
import {DataTexture,Scene,Vector3,Mesh,MeshLambertMaterial} from 'three'
import {readRgbaPng} from '../../scripts/foliage-png.mjs'
import {ForestWheelFX,FOREST_WHEEL_FX_DEFAULTS} from '../world/forest/forestWheelFX.js'
import {forestEarthWeight,forestPathX} from '../world/forest/forestSurface.js'
import {createForestTerrain} from '../world/forest/forestTerrainGeometry.js'
import {registerRideSurfaces,sampleRideHeight} from '../vehicle/rideSurface.js'
import {vfxState} from './vfxState.js'
import {VFXRuntime} from './VFXRuntime.js'
import {DustTrail} from './DustTrail.js'
import {WheelEjecta} from './WheelEjecta.js'
import {dustResponse} from './dustResponse.js'

const wheel=(earth=1)=>({position:new Vector3(0,0,0),normal:new Vector3(0,1,0),forward:new Vector3(0,0,1),radius:.4,surface:'dirt',biome:'forest',earthWeight:earth,grounded:true})
const motion={speed:18,frontAngularSpeed:45,rearAngularSpeed:45,acceleration:8,yaw:0,slip:.3,rearLateralVelocity:3,handbrake:.5}
function fixture(){const png=readRgbaPng('public/foliage/forest/wheel-fragments.png'),atlas=new DataTexture(png.pixels,png.width,png.height),vfx=new VFXRuntime(),dust=vfx.register('dust',new DustTrail()),ejecta=vfx.register('ejecta',new WheelEjecta({grassAtlas:atlas}));new Scene().add(vfx.root);return{vfx,dust,ejecta,atlas,controller:new ForestWheelFX(),contacts:{front:wheel(),rear:wheel()}}}
function tick(f,state=motion,enabled=true){const s=f.controller.update(1/60,f.contacts,vfxState.defaults,enabled);if(s.clearRequested){f.dust.clear();f.ejecta.clear()}f.ejecta.prepare(1/60,s.wheels,state,vfxState.defaults,0,5,1,1/60,s.configs);f.dust.update(1/60,s.wheels.rear,state,s.configs.rear,5,1,1/60,f.vfx)}

test('Forest contacts share actual rendered path/crash masks without changing the physical surface tag',()=>{
  const scene=new Scene(),mesh=new Mesh(createForestTerrain(),new MeshLambertMaterial());mesh.userData={rideSurface:true,rideSurfaceType:'dirt',rideSurfaceBiome:'forest',rideSurfaceEarthWeight:forestEarthWeight};scene.add(mesh);const remove=registerRideSurfaces(scene)
  try{const road={},grass={};sampleRideHeight(forestPathX(-40),-40,road);sampleRideHeight(forestPathX(-40)+8,-40,grass);assert.equal(road.surface,'dirt');assert.equal(grass.surface,'dirt');assert.equal(road.biome,'forest');assert.equal(road.earthWeight,1);assert.equal(grass.earthWeight,0);let prior=1;for(let dx=1.2;dx<=4.5;dx+=.1){const next=forestEarthWeight(forestPathX(-40)+dx,-40);assert.ok(next<=prior);prior=next}}finally{remove();mesh.geometry.dispose();mesh.material.dispose()}
})
test('approved dirt values are exact, per-wheel presets interpolate smoothly and grass suppresses dust',()=>{
  const c=new ForestWheelFX(),contacts={front:wheel(1),rear:wheel(0)},s=c.update(1/60,contacts,vfxState.defaults),front=s.configs.front,rear=s.configs.rear
  assert.equal(front.humidity,.30);assert.equal(front.emission,1.70);assert.equal(front.size,1.25);assert.equal(rear.emission,.35);assert.equal(rear.size,.65)
  assert.ok(dustResponse(contacts.rear,motion,rear,5).rate<dustResponse(contacts.front,motion,front,5).rate*.25)
  contacts.front.earthWeight=0;let previous=front.emission;c.update(1/60,contacts,vfxState.defaults);assert.ok(previous-front.emission<.2)
  for(let i=0;i<120;i++){c.update(1/60,contacts,vfxState.defaults);assert.ok(front.emission<=previous);previous=front.emission}
  assert.ok(Math.abs(front.emission-.35)<.001);contacts.front.earthWeight=1;for(let i=0;i<120;i++)c.update(1/60,contacts,vfxState.defaults);assert.ok(Math.abs(front.emission-1.7)<.001);assert.equal(c.configs.front,front);assert.equal(contacts.front.surface,'dirt')
  assert.equal(FOREST_WHEEL_FX_DEFAULTS.dirt.humidity,.3)
})
test('grass/mud reuse Quarks pools and fixed batches, respond to skids/boost, and stop at rest or wheel lift',()=>{
  const f=fixture(),buffers=f.vfx.renderer.batches.map(b=>b.instanceBuffer)
  try{
    f.contacts.front.earthWeight=f.contacts.rear.earthWeight=0
    for(let i=0;i<300;i++){f.contacts.front.position.z+=.3;f.contacts.rear.position.z+=.3;tick(f);for(const r of f.ejecta.records)assert.ok(r.system.particleNum<=r.response.quota)}
    assert.equal(f.vfx.renderer.systemToBatchIndex.size,9);assert.equal(f.vfx.renderer.batches.length,4);assert.ok(f.ejecta.emitted.grass>50&&f.ejecta.emitted.mud>20)
    const grass=f.ejecta.records.find(r=>r.type==='grass'&&r.side==='rear'),mud=f.ejecta.records.find(r=>r.type==='mud'&&r.side==='rear');assert.ok(mud.size.a>.026);assert.ok(grass.system.particles[0].velocity.z<0);assert.ok(grass.system.particles[0].life<=.45)
    const settled={...f.ejecta.emitted},dust=f.dust.emitted
    for(let i=0;i<240;i++)tick(f,{...motion,speed:0,boostTime:.5});assert.deepEqual(f.ejecta.emitted,settled);assert.equal(f.dust.emitted,dust);assert.equal(f.ejecta.systems.reduce((n,s)=>n+s.particleNum,0),0);assert.equal(f.dust.system.particleNum,0)
    f.contacts.front.grounded=f.contacts.rear.grounded=false;for(let i=0;i<60;i++)tick(f,{...motion,speed:60,boostTime:.5,acceleration:25});assert.deepEqual(f.ejecta.emitted,settled)
    f.vfx.renderer.batches.forEach((b,i)=>assert.equal(b.instanceBuffer,buffers[i]))
  }finally{f.vfx.dispose();f.atlas.dispose()}
})
test('transformation clears wheel contact FX immediately; highway systems retain their original configuration',()=>{
  const f=fixture()
  try{f.contacts.front.earthWeight=f.contacts.rear.earthWeight=0;for(let i=0;i<50;i++)tick(f);assert.ok(f.ejecta.systems.some(s=>s.particleNum));tick(f,motion,false);const count={...f.ejecta.emitted};assert.equal(f.ejecta.systems.reduce((n,s)=>n+s.particleNum,0),0);assert.equal(f.dust.system.particleNum,0);for(let i=0;i<60;i++)tick(f,motion,false);assert.deepEqual(f.ejecta.emitted,count)}finally{f.vfx.dispose();f.atlas.dispose()}
  const c=new ForestWheelFX(),contacts={front:wheel(),rear:wheel()};contacts.front.biome=contacts.rear.biome=null;const s=c.update(1/60,contacts,vfxState.defaults);assert.equal(s.configs.rear.humidity,vfxState.defaults.humidity);assert.equal(s.configs.rear.emission,vfxState.defaults.emission);assert.equal(s.configs.rear.grassEnabled,false)
})
