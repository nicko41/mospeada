import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import { alphaCrashColliders, alphaCrashPlacement } from './forestAlpha.js'
import { FOREST_CRASH, crashVegetationClearance } from './forestCrashConfig.js'
import { forestLayout, forestPathX, forestSurfaceHeight } from './forestLayout.js'
import { overlapsFootprint, queryColliders, registerColliders } from '../../player/collisionWorld.js'
import { ForestBatch } from './ForestBatch.js'
import { forestLodCoverage, forestLodRange } from './forestLod.js'
import { Matrix4, PerspectiveCamera, Box3, BoxGeometry } from 'three'

const readGlb=path=>{const bytes=fs.readFileSync(path),length=bytes.readUInt32LE(12);return{bytes,document:JSON.parse(bytes.toString('utf8',20,20+length)),binary:bytes.subarray(28+length)}}
const source=readGlb('assets/alpha-fighter/alpha-fighter-down.glb'),runtime=readGlb('public/models/mospeada/alpha-fighter-down.glb')
const manifest=JSON.parse(fs.readFileSync('public/models/mospeada/alpha-fighter-manifest.json'))
function positionArray(asset){const a=asset.document.accessors[asset.document.meshes[0].primitives[0].attributes.POSITION],v=asset.document.bufferViews[a.bufferView];return new Float32Array(asset.binary.buffer,asset.binary.byteOffset+(v.byteOffset||0)+(a.byteOffset||0),a.count*3)}
const geometry=new BufferGeometry().setAttribute('position',new Float32BufferAttribute(positionArray(runtime),3)),model=new Group();model.add(new Mesh(geometry,new MeshStandardMaterial()))

test('Alpha derivative preserves source, material maps, hierarchy and authored vertex positions',()=>{
  assert.equal(crypto.createHash('sha256').update(source.bytes).digest('hex'),manifest.sourceSha256)
  assert.deepEqual(runtime.document.materials,source.document.materials)
  assert.deepEqual(runtime.document.nodes,source.document.nodes)
  assert.equal(runtime.document.images.length,3)
  assert.ok(manifest.parts[0].runtimeTriangles<110000&&manifest.parts[0].metresErrorAt10m<.01)
  const original=positionArray(source),positions=new Set()
  for(let i=0;i<original.length;i+=3)positions.add(`${original[i]},${original[i+1]},${original[i+2]}`)
  const derived=positionArray(runtime)
  for(let i=0;i<derived.length;i+=3)assert.ok(positions.has(`${derived[i]},${derived[i+1]},${derived[i+2]}`),'Simplification must not dent or move original parts')
  assert.ok(runtime.bytes.length<7e6)
})

test('Alpha enlarged by 1.6 retains proportions and fits the terrain with a buried belly',()=>{
  const p=alphaCrashPlacement(model)
  assert.ok(Math.abs(p.scale*manifest.size[0]-16)<1e-6)
  assert.equal(FOREST_CRASH.length/FOREST_CRASH.previousLength,1.6)
  assert.ok(FOREST_CRASH.roll<-.1&&Math.abs(FOREST_CRASH.pitch)>.02)
  const matrix=new Matrix4().multiplyMatrices(p.matrix,p.sourceMatrix),v=new Vector3(),pos=geometry.attributes.position
  let minGap=Infinity,buried=0,above=0
  for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i).applyMatrix4(matrix);const gap=v.y-forestSurfaceHeight(v.x,v.z);minGap=Math.min(minGap,gap);if(gap<0)buried++;else above++}
  assert.ok(minGap<-.6&&minGap> -3);assert.ok(buried>pos.count*.08&&above>pos.count*.45)
  assert.ok(p.samples>1000)
  assert.equal(FOREST_CRASH.sourceLength,manifest.size[0])
})

test('primitive wreck colliders block the fuselage and leave the main route accessible',()=>{
  const p=alphaCrashPlacement(model),colliders=alphaCrashColliders(p),remove=registerColliders(colliders),near=[]
  try{
    assert.equal(colliders.length,13);assert.ok(colliders.every(c=>c.type==='box'&&!c.walkable))
    const center=new Vector3(0,0,0).applyMatrix4(p.matrix)
    queryColliders(center.x-1,center.z-1,center.x+1,center.z+1,near)
    assert.ok(near.some(c=>overlapsFootprint(c,center.x,center.z,.23)))
    for(let z=-40;z<=12;z+=.25)assert.ok(!colliders.some(c=>overlapsFootprint(c,forestPathX(z),z,1.1)),`Main route blocked at ${z}`)
    for(const placements of Object.values(forestLayout))for(const tree of placements)assert.equal(crashVegetationClearance(tree.x,tree.z,tree.kind==='tree'?tree.trunkRadius:0),false)
  }finally{remove()}
})

test('understory LOD overlap is complementary and cell culling never cuts a nonzero fade',()=>{
  for(const kind of ['shrub']){
    const detail=forestLodRange(kind),far=forestLodRange(kind,true)
    for(let distance=far.start;distance<=detail.max;distance+=.02)assert.ok(Math.abs(forestLodCoverage(distance,detail)+forestLodCoverage(distance,far)-1)<1e-10)
    const g=new BoxGeometry(1,4,1),m=new MeshStandardMaterial(),bounds=new Box3(new Vector3(-.5,0,-.5),new Vector3(.5,4,.5))
    const placements=[{x:0,z:0,scale:1,yaw:0,tint:1}],a=new ForestBatch({geometry:g,material:m,transform:new Matrix4()},placements,bounds,kind,detail.max),b=new ForestBatch({geometry:g,material:m,transform:new Matrix4()},placements,bounds,kind,far.max,far.start),camera=new PerspectiveCamera()
    try{
      for(let distance=far.start-5;distance<far.max+5;distance+=.31){camera.position.set(Math.sin(.7)*distance,2,Math.cos(.7)*distance);a.updateDistance(camera);b.updateDistance(camera);if(forestLodCoverage(distance,detail)>0)assert.ok(a.getVisibleAt(0));if(forestLodCoverage(distance,far)>0)assert.ok(b.getVisibleAt(0))}
    }finally{a.dispose();b.dispose();g.dispose();m.dispose()}
  }
})
