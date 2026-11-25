import test from 'node:test'
import assert from 'node:assert/strict'
import {Box3,BoxGeometry,Matrix4,MeshLambertMaterial,PerspectiveCamera,Vector3} from 'three'
import {createOpeningSideLayout,createForestSideLayout,createSideBoundaryColliders,createSideBoundaryLibrary,ForestSideBoundaryBand,forestSideWidth} from './forestSideBoundaries.js'
import {createBoundaryColliders} from './forestBoundaries.js'
import {forestPathX,forestSurfaceHeight} from './forestLayout.js'
import {stage2PathX,stage2Void,stage2LipZ} from './forestStage2Config.js'
import {stage2SurfaceHeight} from './forestStage2Terrain.js'
import {overlapsFootprint} from '../../player/collisionWorld.js'
import {forestRouteDistance} from './forestSurface.js'

function crossings(colliders,pathAt,minZ,maxZ){
 for(let z=minZ;z<=maxZ;z+=.75){
  const near=colliders.filter(c=>c.minZ<z+.3&&c.maxZ>z-.3),x=pathAt(z)
  assert.equal(near.some(c=>overlapsFootprint(c,x,z,1.3)),false,'The whole bike remains clear on the road')
  for(const sign of[-1,1])assert.ok(near.some(c=>overlapsFootprint(c,c.x,z,.3)&&Math.sign(c.x-x)===sign),`No missing lateral barrier at z=${z}, side=${sign}`)
 }
}
test('rounded perimeter is deterministic, stays far from the road and closes lateral exits near the terrain edge',()=>{
 const layout=createOpeningSideLayout(),colliders=[...createBoundaryColliders(),...createSideBoundaryColliders(layout)]
 assert.deepEqual(layout,createOpeningSideLayout());crossings(colliders,forestPathX,-390,-88)
 assert.ok(layout.thickets.length<2000);assert.ok(layout.trunks.length<3000);assert.ok(layout.sprites.filter(p=>!p.treeBase).length<8000);assert.ok(layout.sprites.filter(p=>p.treeBase).length<=layout.trunks.length*12)
 for(const p of[...layout.thickets,...layout.trunks])assert.ok(forestRouteDistance(p.x,p.z)>140,'No new hedge or trunk corridor alongside the road')
 for(const side of[-1,1]){const positions=layout.thickets.filter(p=>p.side===side&&p.layer===0).map(p=>Math.abs(p.x-forestPathX(p.z)));assert.ok(Math.max(...positions)-Math.min(...positions)>12,'Each side advances and recedes, instead of a straight hedge');assert.ok(new Set(layout.trunks.filter(p=>p.side===side).map(p=>p.layer)).size===5)}
 for(const c of colliders.filter(c=>c.source==='forest-side-thicket'))assert.equal(c.walkable,false)
})
test('lateral thickets leave the canyon empty, preserve both jump approaches and continue on the far bank',()=>{
 const layout=createForestSideLayout({minZ:-1120,maxZ:-400,pathAt:stage2PathX,heightAt:stage2SurfaceHeight,widthAt:(z,side)=>forestSideWidth(z,side)-side*stage2PathX(z),allowed:(x,z,r)=>!stage2Void(x,z)&&Math.min(Math.abs(z-stage2LipZ(x)),Math.abs(z-stage2LipZ(x,true)))>4+r})
 for(const p of[...layout.sprites,...layout.thickets,...layout.trunks]){assert.ok(Number.isFinite(p.ground));assert.equal(stage2Void(p.x,p.z),false);assert.ok(Math.abs(p.x-stage2PathX(p.z))>10)}
 crossings(createSideBoundaryColliders(layout),stage2PathX,-710,-425);crossings(createSideBoundaryColliders(layout),stage2PathX,-1090,-970)
 for(const z of[-800,-801,-930,-931])assert.equal(layout.thickets.some(p=>Math.abs(p.x-stage2PathX(z))<12&&Math.abs(p.z-z)<8),false)
 for(const side of[-1,1])for(let z=-1888;z<=-1120;z+=3)assert.ok(Math.abs(forestSideWidth(z,side)-forestSideWidth(z-768,side))<1e-12,'Recycled route widths match the previous tile cycle')
})
test('native bark and shrub batches reuse their buffers and recover exactly after a partially prepared connector is cancelled',()=>{
 const geometry=new BoxGeometry(1,9,1),material=new MeshLambertMaterial(),asset={name:'tree',kind:'tree',trunkRadius:.25,bounds:new Box3(new Vector3(-.5,0,-.5),new Vector3(.5,9,.5)),parts:[{geometry,material,transform:new Matrix4()}]},library=createSideBoundaryLibrary([asset],null),pathAt=z=>Math.sin(z*.02)*8,heightAt=(x,z)=>x*.01+z*.002,layout=createForestSideLayout({minZ:-96,maxZ:0,pathAt,heightAt,trees:library.trees}),band=new ForestSideBoundaryBand(layout,library,heightAt),camera=new PerspectiveCamera(),before=[band.plants,...band.batches].map(b=>b._matricesTexture.image.data.slice()),buffers=[band.plants,...band.batches].map(b=>b._matricesTexture)
 try{
  const steps=band.repositionSteps(z=>pathAt(z)+6,(x,z)=>heightAt(x,z)+7);steps.next();steps.return();for(const step of band.repositionSteps(pathAt,heightAt))void step
  for(let i=0;i<before.length;i++)assert.deepEqual([band.plants,...band.batches][i]._matricesTexture.image.data,before[i])
  band.position.set(15,3,-1200);camera.position.set(15,8,-1248);band.update(camera);for(let i=0;i<buffers.length;i++)assert.equal([band.plants,...band.batches][i]._matricesTexture,buffers[i]);assert.equal(asset.parts[0].material,material);assert.equal(asset.parts[0].geometry,geometry)
 }finally{band.dispose();library.dispose();geometry.dispose();material.dispose()}
})
