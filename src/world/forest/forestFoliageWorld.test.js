import test from 'node:test'
import assert from 'node:assert/strict'
import { MeshLambertMaterial, PerspectiveCamera, Texture, Vector3 } from 'three'
import { generateFoliageSector,generateFoliageWorld,foliageWorldDensity } from './forestFoliageDistribution.js'
import { forestPathX,forestSurfaceHeight } from './forestLayout.js'
import {forestRouteDistance} from './forestSurface.js'
import { FOLIAGE_WORLD } from './forestFoliageWorldConfig.js'
import { worldFoliageMaterial,worldFoliageSector } from './forestFoliageWorldRendering.js'
import { ForestFoliageWorldManager,sectorDistance } from './forestFoliageWorldManager.js'
import { forestWorldRenderLayout } from './forestUnderstory.js'
import {crashSiteSample} from './forestCrashSite.js'

const world=generateFoliageWorld()
const materials=()=>({density:{value:.65},near:new MeshLambertMaterial(),far:new MeshLambertMaterial(),contact:new MeshLambertMaterial()})

test('world foliage is reproducible, covers the existing forest and leaves paths and impact ground exposed',()=>{
  const a=generateFoliageSector(12,12),b=generateFoliageSector(12,12),c=generateFoliageSector(12,12,123)
  assert.deepEqual(a.matrices,b.matrices);assert.notDeepEqual(a.matrices,c.matrices)
  assert.equal(world.sectors.length,625);assert.ok(world.total>600000&&world.total<750000)
  const species=new Set()
  for(const s of world.sectors)for(let i=0;i<s.count;i++){
    const x=s.x+s.matrices[i*16+12],z=s.z+s.matrices[i*16+14],y=s.matrices[i*16+13]
    assert.ok(Number.isFinite(y));assert.ok(forestRouteDistance(x,z)>1.3999)
    assert.ok(Math.abs(y-forestSurfaceHeight(x,z)+.025)<.00001)
    if(s.fades[i*4+2]>=0)assert.ok(foliageWorldDensity(x,z)>0);species.add(s.fades[i*4+3])
    assert.equal(crashSiteSample(x,z).destroyed,false,'No intact sprite may regrow in the destroyed channel')
  }
  assert.equal(species.size,24)
  for(const placements of Object.values(forestWorldRenderLayout))assert.ok(placements.every(p=>!['grass','plant','shrub'].includes(p.kind)))
})

test('sector LODs share immutable buffers, atlas material and conservative bounds for every billboard angle',()=>{
  const data=generateFoliageSector(13,12),m=materials(),s=worldFoliageSector(data,m)
  assert.equal(s.near.instanceMatrix,s.far.instanceMatrix);assert.equal(s.near.instanceColor,s.far.instanceColor)
  for(const key of ['aFoliageRect','aFoliageForm','aFoliageFade'])assert.equal(s.near.geometry.attributes[key],s.far.geometry.attributes[key])
  assert.equal(s.near.geometry.attributes.position.count,12);assert.equal(s.far.geometry.attributes.position.count,4)
  for(let i=0;i<data.count;i++){
    const h=data.matrices[i*16+5],x=data.matrices[i*16+12],y=data.matrices[i*16+13],z=data.matrices[i*16+14]
    const radius=h*data.forms[i*4]*Math.max(data.forms[i*4+1],1-data.forms[i*4+1])
    for(let a=0;a<Math.PI*2;a+=Math.PI/4)assert.ok(s.near.boundingBox.containsPoint(new Vector3(x+Math.cos(a)*radius,y+h*.5,z+Math.sin(a)*radius)))
  }
  const density={value:.65},atlas=new Texture(),near=worldFoliageMaterial(atlas,'near',density),far=worldFoliageMaterial(atlas,'far',density)
  assert.equal(near.map,far.map);assert.equal(near.transparent,false);assert.ok(near.alphaTest>=.4);assert.equal(near.depthWrite,true)
  near.dispose();far.dispose();atlas.dispose()
})

test('preload follows translation, keeps full 360 degree coverage at boost speed and evicts distant sectors',()=>{
  const manager=new ForestFoliageWorldManager(world,materials(),null,null),camera=new PerspectiveCamera(70,16/9,.1,300),actor=new Vector3()
  // CPU residency audit; native WebGL preparation is checked by the browser test.
  manager.warm=()=>{}
  const step=()=>{camera.position.copy(actor).add(new Vector3(0,2,4.5));camera.updateMatrixWorld();manager.update(actor,camera,1/60)}
  for(let i=0;i<100;i++)step()
  const prepared=manager.prepared,versions=new Map([...manager.resident].map(([id,s])=>[id,s.near.instanceMatrix.version]))
  for(let i=0;i<288;i++){camera.rotation.y=i*Math.PI/12;step()}
  assert.equal(manager.prepared,prepared);assert.equal(manager.generations,1)
  for(const [id,s]of manager.resident)assert.equal(s.near.instanceMatrix.version,versions.get(id))
  let peak=manager.resident.size
  for(let i=0;i<260;i++){
    actor.z=-i*80/60;actor.x=forestPathX(actor.z);step();peak=Math.max(peak,manager.resident.size)
    for(const s of world.sectors)if(sectorDistance(s,camera.position.x,camera.position.z)<FOLIAGE_WORLD.maxDistance+2)assert.ok(manager.resident.has(s.id),`Prepare ${s.id} before it can enter any camera direction`)
  }
  assert.equal(manager.latePrepares,0);assert.ok(manager.evicted>0);assert.ok(peak<350)
  assert.ok(manager.gpuMemoryBytes()<128*1048576)
  actor.set(250,0,250);step()
  for(const s of world.sectors)if(sectorDistance(s,camera.position.x,camera.position.z)<FOLIAGE_WORLD.maxDistance)assert.ok(manager.resident.has(s.id))
  manager.dispose()
})
