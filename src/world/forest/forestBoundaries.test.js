import test from 'node:test'
import assert from 'node:assert/strict'
import {forestEarthWeight,forestPathX,forestBranchZ} from './forestSurface.js'
import {createForestBoundaryLayout,forestBoundaryLayout,createBoundaryColliders,FOREST_BOUNDARY_LOGS} from './forestBoundaries.js'
import {CRASH_PATCH} from './forestCrashSite.js'
import {FOREST_SPAWN} from './forestCrashConfig.js'
import {foliageWorldDensity} from './forestFoliageDistribution.js'
import {overlapsFootprint} from '../../player/collisionWorld.js'

test('Plano 1 paints one forward trail; former cross branches and rear continuation are grass',()=>{
  for(let z=-390;z<=10;z+=2)assert.equal(forestEarthWeight(forestPathX(z),z),1)
  for(const x of [-80,-40,10,40,80])assert.equal(forestEarthWeight(x,forestBranchZ(x)),0)
  for(let z=20;z<=100;z+=2)assert.ok(forestEarthWeight(forestPathX(z),z)<1e-8)
  assert.ok(foliageWorldDensity(25,forestBranchZ(25),{root:2,rock:10,blocked:false})>.3,'Old sideways trail now accepts forest understory')
})
test('natural edge dressing repeats deterministically and leaves the main route and spawn exit free',()=>{
  assert.deepEqual(createForestBoundaryLayout(),forestBoundaryLayout)
  const colliders=createBoundaryColliders(),blocked=(x,z,r=1.1)=>colliders.some(c=>overlapsFootprint(c,x,z,r))
  for(let z=-390;z<=10;z+=.5)assert.equal(blocked(forestPathX(z),z),false,`Main route at ${z}`)
  for(let d=0;d<=18;d+=.25)assert.equal(blocked(FOREST_SPAWN.x+Math.sin(FOREST_SPAWN.yaw)*d,FOREST_SPAWN.z+Math.cos(FOREST_SPAWN.yaw)*d),false)
  for(const sign of [-1,1])assert.ok(Array.from({length:100},(_,i)=>forestPathX(-65)+sign*i*.5).some(x=>blocked(x,-65,.6)),'Each former lateral exit meets visible thickets/trunks')
  assert.ok(Array.from({length:120},(_,i)=>i*.5).some(z=>blocked(5,z,.6)),'Rear exit closes in the forest')
})
test('new obstacles stay outside the crash patch and use a bounded set of shared assets',()=>{
  for(const c of createBoundaryColliders())assert.ok(c.maxX<=CRASH_PATCH.minX||c.minX>=CRASH_PATCH.maxX||c.maxZ<=CRASH_PATCH.minZ||c.minZ>=CRASH_PATCH.maxZ,'No new obstacle in the crash patch')
  const additions=Object.values(forestBoundaryLayout.byName).flat()
  assert.ok(additions.filter(p=>p.kind==='tree').length<100)
  assert.ok(additions.filter(p=>p.kind==='rock').length<20)
  assert.ok(forestBoundaryLayout.sprites.length<1200)
  assert.equal(FOREST_BOUNDARY_LOGS.length,2)
  assert.ok(additions.every(p=>!/^Pine/.test(p.name)))
})
