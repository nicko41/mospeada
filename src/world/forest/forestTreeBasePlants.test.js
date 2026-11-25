import test from 'node:test'
import assert from 'node:assert/strict'
import {createTreeBasePlants} from './forestTreeBasePlants.js'
import {forestLayout} from './forestLayout.js'
import {forestBoundaryLayout} from './forestBoundaries.js'
import {generateFoliageWorld} from './forestFoliageDistribution.js'
import {stage2Layout} from './forestStage2Layout.js'
import {generateStage2FoliageWorld} from './forestStage2Foliage.js'

test('every trunk gets varied overlapping foliage around all sides, with reproducible placement',()=>{
 const trees=Object.values(forestLayout).flat().filter(p=>p.kind==='tree'),plants=createTreeBasePlants(trees),groups=new Map()
 assert.deepEqual(plants,createTreeBasePlants(trees))
 for(const p of plants){const key=`${p.rootX},${p.rootZ}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);assert.equal(p.rank,-1)}
 assert.equal(groups.size,trees.length)
 for(const tree of trees){const group=groups.get(`${tree.x},${tree.z}`),angles=group.map(p=>Math.atan2(p.z-tree.z,p.x-tree.x)).sort((a,b)=>a-b);let gap=0
  for(let i=0;i<angles.length;i++)gap=Math.max(gap,(angles[(i+1)%angles.length]-angles[i]+Math.PI*2)%(Math.PI*2))
  assert.ok(group.length>=10&&group.length<=12);assert.ok(gap<1.2,'No bare side of the trunk');assert.ok(new Set(group.map(p=>p.sprite)).size>1)
 }
})

test('root dressing reaches every rendered opening and canyon-route tree, including outer groves and low density',()=>{
 for(const [world,trees]of [[generateFoliageWorld(),[...Object.values(forestLayout).flat(),...Object.values(forestBoundaryLayout.byName).flat()].filter(p=>p.kind==='tree')],[generateStage2FoliageWorld(),stage2Layout.trees]]){
  const roots=[];let all=0
  for(const s of world.sectors){all+=s.count;for(let i=0;i<s.count;i++)if(s.fades[i*4+2]<0)roots.push([s.x+s.matrices[i*16+12],s.z+s.matrices[i*16+14]])}
  assert.ok(roots.length>=trees.length*7);assert.ok(roots.length<=trees.length*12);assert.ok(roots.length/all<.2,'Root dressing stays below 20% of the existing instanced foliage')
  for(const t of trees)assert.ok(roots.some(([x,z])=>Math.hypot(x-t.x,z-t.z)<t.trunkRadius+1.5),`Missing root vegetation at ${t.x},${t.z}`)
 }
})
