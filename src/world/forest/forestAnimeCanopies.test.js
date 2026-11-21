import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import {Box3,Color,DataTexture,Matrix4,PerspectiveCamera,ShaderLib,Vector3} from 'three'
import {loadCanopyTestAssets} from '../../../scripts/canopy-test-asset.mjs'
import {createAnimeForestAssets} from './forestAnimeCanopies.js'
import {createTreeCanopyTest} from './treeCanopyTest.js'
import {forestCanopyVariant} from './forestCanopyVariants.js'
import {ForestBatch} from './ForestBatch.js'
import {forestTreeLevel,forestWoodLevel,forestCanopyDetailLevel,forestLodRange,canopyLodTest} from './forestLod.js'
import {patchCanopyTone,canopyInstanceTint} from './forestCanopyTone.js'
import {forestLayout,forestSurfaceHeight} from './forestLayout.js'
import {createCrashTree} from './forestCrashDressing.js'
import {CANOPY_SPRITES} from './canopySpriteCatalog.js'

test('all four species preserve existing wood, dimensions, placement and colliders while sharing two illustrated materials and five crown variants',()=>{
 const source=loadCanopyTestAssets(),atlas=[new DataTexture(),new DataTexture()],result=createAnimeForestAssets(source,atlas),layout=JSON.stringify(forestLayout),hash=(g)=>crypto.createHash('sha256').update(Buffer.from(g.attributes.position.array.buffer)).digest('hex')
 try{
  assert.equal(result.assets.length,4);assert.equal(result.materials.length,2);assert.equal(result.geometries.length,80)
  assert.equal(forestCanopyVariant({name:'CommonTree_3',x:-15,z:-17,yaw:.5}),0,'Keep the approved reference tree unchanged')
  for(const [i,asset]of result.assets.entries()){
   const wood=source[i].parts.filter(p=>!/Leaves/.test(p.material.name)),originalHash=wood.map(p=>hash(p.geometry))
   assert.equal(asset.bounds,source[i].bounds);assert.equal(asset.originalParts,source[i].parts)
   assert.equal(asset.parts.length,wood.length+2);wood.forEach((p,j)=>{assert.equal(asset.parts[j].geometry,p.geometry);assert.equal(asset.parts[j].material,p.material);assert.equal(asset.parts[j].transform,p.transform);assert.equal(asset.parts[j].canopyRole,'wood')})
   for(const [sheet,part]of asset.parts.slice(wood.length).entries()){
    assert.equal(part.material,result.materials[sheet]);assert.equal(part.variants.length,5);assert.ok(!part.material.transparent&&part.material.depthWrite&&part.material.alphaTest===.55)
    assert.equal(part.highVariants.length,5);for(let v=0;v<5;v++){assert.equal(part.highVariants[v].index.count,part.variants[v].index.count/2);assert.equal(part.highVariants[v].attributes.position.count/9,part.variants[v].attributes.position.count/15,'High detail keeps every packet')}
    assert.equal(new Set(part.variants.map(hash)).size,5,'Species has five genuinely different 3D packet distributions')
    for(const geometry of part.variants){assert.ok(geometry.index.count/3<=768);const uv=geometry.attributes.uv;for(let v=0;v<uv.count;v++)assert.ok(uv.getX(v)>=0&&uv.getX(v)<=1&&uv.getY(v)>=0&&uv.getY(v)<=1)}
   }
   const recipe=createTreeCanopyTest(source[i],{x:0,z:0,scale:1,yaw:0,tint:1},atlas,()=>0)
   try{for(let sheet=0;sheet<2;sheet++){
    const old=recipe.batches[sheet],p=old.geometry.attributes.position,matrix=new Matrix4(),expected=new Vector3();old.getMatrixAt(0,matrix);matrix.premultiply(recipe.canopy.matrix)
    for(let v=0;v<p.count;v++){expected.fromBufferAttribute(p,v).applyMatrix4(matrix);const actual=new Vector3().fromBufferAttribute(asset.parts[wood.length+sheet].geometry.attributes.position,v);assert.ok(actual.distanceTo(expected)<1e-5,'Variant zero exactly preserves the approved test geometry')}
   }}finally{recipe.dispose()}
   assert.deepEqual(wood.map(p=>hash(p.geometry)),originalHash)
  }
  assert.equal(JSON.stringify(forestLayout),layout)
  const crashA=createCrashTree(source[0]),crashB=createCrashTree(result.assets[0]);assert.deepEqual(crashB.colliders,crashA.colliders,'Fallen-tree collision remains byte-for-byte equivalent')
  for(const crash of [crashA,crashB]){crash.owned.forEach(g=>g.dispose());crash.material.dispose();crash.extraMaterials.forEach(m=>m.dispose())}
 }finally{result.dispose();atlas.forEach(t=>t.dispose())}
})

test('near crowns and distant cards select the same stable recipe and whole-tree LOD without overlapping silhouettes',()=>{
 const source=loadCanopyTestAssets().slice(0,1),atlas=[new DataTexture(),new DataTexture()],result=createAnimeForestAssets(source,atlas),asset=result.assets[0],placements=forestLayout[asset.name].slice(0,80),part=asset.parts.find(p=>p.variants),batch=new ForestBatch(part,placements,asset.bounds,'tree',forestLodRange('tree').max,0,forestSurfaceHeight),far=new ForestBatch(part,placements,asset.bounds,'tree',340,forestLodRange('tree',true).start,forestSurfaceHeight),camera=new PerspectiveCamera(),versions=[batch._matricesTexture.version,batch._colorsTexture.version]
 try{
  const variants=new Set(placements.map(p=>forestCanopyVariant(p)));assert.equal(variants.size,5)
  for(let i=0;i<placements.length;i++){const p=placements[i];assert.equal(batch.getGeometryIdAt(i),forestCanopyVariant(p));for(const distance of [30,65,75,85,120]){const near=forestTreeLevel(p,distance),far=forestTreeLevel(p,distance);assert.equal(near,far);assert.notEqual(near===0,far===1,'Only one representation is selected')}}
  for(let i=0;i<36;i++){camera.position.set(Math.sin(i*.3)*200,3,Math.cos(i*.3)*200);batch.updateDistance(camera);far.updateDistance(camera);for(let id=0;id<placements.length;id++){assert.ok(!(batch.getVisibleAt(id)&&far.getVisibleAt(id)),'Near and far never draw two ghost silhouettes for one tree');assert.equal(batch.getGeometryIdAt(id)%5,far.getGeometryIdAt(id)%5,'Both distances use the same crown recipe')}}
  assert.deepEqual([batch._matricesTexture.version,batch._colorsTexture.version],versions)
 }finally{batch.dispose();far.dispose();result.dispose();atlas.forEach(t=>t.dispose())}
})

test('crowns retain all packets through medium distance, with independent wood LOD and stable hysteresis at every threshold',()=>{
 const placements=Array.from({length:40},(_,i)=>({x:i*3.7,z:i*-2.1})),level=(p,d,previous)=>forestTreeLevel(p,d,previous)
 try{
  for(const p of placements){
   for(const d of [0,50,100,125]){assert.equal(forestCanopyDetailLevel(p,d),0);assert.equal(level(p,d),0)}
   for(const d of [151,180,220]){assert.equal(forestCanopyDetailLevel(p,d),1);assert.equal(level(p,d),0)}
   assert.equal(level(p,261),1)
   for(const choose of [level,forestCanopyDetailLevel,forestWoodLevel]){
    let threshold=0;while(!choose(p,threshold)&&threshold<300)threshold+=.01
    for(const initial of [0,1]){let previous=initial;for(let i=0;i<100;i++){previous=choose(p,threshold+Math.sin(i)*1.5,previous);assert.equal(previous,initial,'Small oscillations must never switch the representation')}}
   }
   for(let d=0;d<=340;d+=.5){
    const far=level(p,d),wood=forestWoodLevel(p,d)
    assert.equal(Number(!far)+Number(!!far),1,'Exactly one complete crown')
    assert.equal(Number(!wood)+Number(wood&&!far)+Number(!!far),1,'Exactly one wood representation')
   }
   canopyLodTest.mode='legacy';for(const d of [65,72,78,84])assert.equal(level(p,d),forestWoodLevel(p,d),'Wood keeps its original distance policy');canopyLodTest.mode='auto'
  }
 }finally{canopyLodTest.mode='auto'}
})

test('moss grading changes only leaf RGB and keeps subtle deterministic variation shared by close and distant crowns',()=>{
 const shader={uniforms:{},fragmentShader:ShaderLib.basic.fragmentShader};patchCanopyTone(shader)
 assert.match(shader.fragmentShader,/canopyNeutral\*canopyGain/);assert.doesNotMatch(shader.fragmentShader,/diffuseColor\.a\s*=/)
 assert.ok(shader.fragmentShader.includes('#include <alphatest_fragment>'))
 const tints=new Set();for(let i=0;i<20;i++){const p={x:i*13,z:i*-7,yaw:i*.3},a=canopyInstanceTint(new Color(),p),b=canopyInstanceTint(new Color(),p);assert.deepEqual(a.toArray(),b.toArray());for(const value of a.toArray())assert.ok(value>.97&&value<1.03);tints.add(a.toArray().join())}assert.ok(tints.size>10)
})

test('atlas metadata preserves both original PNG hashes and discards neon edge residue without recolouring the illustrations',()=>{
 for(const sheet of CANOPY_SPRITES.sheets){assert.equal(sheet.entries.length,16);assert.equal(sheet.edgeAudit.retainedNeon,0);assert.ok(sheet.edgeAudit.discardedNeon>0);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(sheet.source)).digest('hex'),sheet.sha256)}
})
