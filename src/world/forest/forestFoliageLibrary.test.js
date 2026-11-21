import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { Box3, Frustum, Matrix4, MeshLambertMaterial, PerspectiveCamera, Sphere, Vector3 } from 'three'
import { readRgbaPng } from '../../../scripts/foliage-png.mjs'
import { FOLIAGE_CATALOG } from './foliageCatalog.js'
import { forestLayout,forestOpenness,forestPathDistance,forestSurfaceHeight } from './forestLayout.js'
import { forestRenderLayout,forestUnderstoryStats,createFoliagePilot,foliagePilotPlacements } from './forestUnderstory.js'
import { inFoliagePilot } from './forestFoliageConfig.js'
import { isCrashTree } from './forestCrashSite.js'
import { ForestSpriteBatch,foliageContactShadows } from './forestFoliageLibrary.js'

test('all 24 extracted RGBA sprites retain their opaque illustration and transparent margins',()=>{
  const source=readRgbaPng(FOLIAGE_CATALOG.source),covered=new Uint8Array(source.width*source.height)
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(FOLIAGE_CATALOG.source)).digest('hex'),FOLIAGE_CATALOG.sourceSha256)
  assert.equal(FOLIAGE_CATALOG.entries.length,24);assert.equal(new Set(FOLIAGE_CATALOG.entries.map(e=>e.category)).size,5)
  for(const entry of FOLIAGE_CATALOG.entries){
    const sprite=readRgbaPng('public'+entry.url),[sx,sy]=entry.sourceCrop;let opaque=0,transparent=0
    assert.equal(sprite.width,entry.width);assert.equal(sprite.height,entry.height)
    for(let y=0;y<sprite.height;y++)for(let x=0;x<sprite.width;x++){
      const i=(y*sprite.width+x)*4,a=sprite.pixels[i+3]
      if(x<2||y<2||x>=sprite.width-2||y>=sprite.height-2)assert.equal(a,0)
      if(!a){transparent++;continue}
      assert.ok(!(sprite.pixels[i+1]>180&&sprite.pixels[i+1]-Math.max(sprite.pixels[i],sprite.pixels[i+2])>100),'Remove chroma-green residue')
      if(a>=224){opaque++;const j=((sy+y-2)*source.width+sx+x-2)*4;assert.deepEqual(sprite.pixels.subarray(i,i+4),source.pixels.subarray(j,j+4));covered[j/4]++}
    }
    assert.ok(opaque>100&&transparent>sprite.width*sprite.height*.1)
  }
  let missed=0,duplicates=0;for(let i=0;i<covered.length;i++){if(source.pixels[i*4+3]>=224&&!covered[i])missed++;if(covered[i]>1)duplicates++}
  assert.ok(missed<100,`Only tiny isolated residues may be removed, not plant parts (${missed})`);assert.equal(duplicates,0,'No sprite contains a neighbouring plant')
})

test('understory reduction keeps trees/rocks intact and reserves only a small sprite pilot',()=>{
  for(const [name,placements]of Object.entries(forestLayout)){
    if(['tree','rock','pebble'].includes(placements[0]?.kind))assert.deepEqual(forestRenderLayout[name],placements.filter(p=>!isCrashTree(p)))
    for(const p of forestRenderLayout[name])if(p.kind==='grass'||p.kind==='plant'){assert.ok(forestOpenness(p.x,p.z)<=.22);assert.ok(forestPathDistance(p.x,p.z)>5.8);assert.equal(inFoliagePilot(p.x,p.z,1.5),false)}
  }
  assert.ok(forestUnderstoryStats.grass.after<forestUnderstoryStats.grass.before*.1)
  assert.ok(forestUnderstoryStats.plant.after<forestUnderstoryStats.plant.before*.1)
  assert.ok(forestUnderstoryStats.shrub.before-forestUnderstoryStats.shrub.after<50)
  assert.deepEqual(createFoliagePilot(),foliagePilotPlacements)
  assert.equal(foliagePilotPlacements.length,66)
  for(const p of foliagePilotPlacements){assert.ok(inFoliagePilot(p.x,p.z));assert.ok(forestPathDistance(p.x,p.z)>6.3);assert.ok(p.height>=.25&&p.height<=1.3)}
})

test('mixed sprite geometries stay grounded, bounded and stable during 360 degree turns',()=>{
  const material=new MeshLambertMaterial(),batch=new ForestSpriteBatch(foliagePilotPlacements,material),camera=new PerspectiveCamera(65,1.5,.1,150),frustum=new Frustum(),matrix=new Matrix4()
  camera.position.set(-14,2,-14);batch.updateMatrixWorld(true)
  try{
    assert.equal(batch.instanceCount,66);assert.ok(batch.perObjectFrustumCulled&&batch.frustumCulled)
    for(let id=0;id<66;id++){
      const p=foliagePilotPlacements[id],m=batch.getMatrixAt(id,new Matrix4()),geometryId=batch.getGeometryIdAt(id)
      assert.ok(Math.abs(m.elements[13]-(forestSurfaceHeight(p.x,p.z)-.025))<1e-5)
      const s=batch.getBoundingSphereAt(geometryId,new Sphere()).applyMatrix4(m),b=batch.getBoundingBoxAt(geometryId,new Box3()).applyMatrix4(m)
      assert.ok(batch.boundingSphere.center.distanceTo(s.center)+s.radius<=batch.boundingSphere.radius+1e-4);assert.ok(batch.boundingBox.containsBox(b))
    }
    const version=batch._matricesTexture.version,colours=batch._colorsTexture.version
    for(let frame=0;frame<144;frame++){
      const yaw=frame*Math.PI/12;camera.lookAt(camera.position.x+Math.sin(yaw)*30,2,camera.position.z+Math.cos(yaw)*30);camera.updateMatrixWorld(true);batch.updateDistance(camera);batch.onBeforeRender({},null,camera,batch.geometry,material)
      frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse))
      const actual=new Set(batch._indirectTexture.image.data.subarray(0,batch._multiDrawCount))
      for(let id=0;id<66;id++){const s=batch.getBoundingSphereAt(batch.getGeometryIdAt(id),new Sphere()).applyMatrix4(batch.getMatrixAt(id,new Matrix4()));assert.equal(actual.has(id),frustum.intersectsSphere(s))}
    }
    assert.equal(batch._matricesTexture.version,version);assert.equal(batch._colorsTexture.version,colours)
    camera.position.set(200,2,200);batch.updateDistance(camera);assert.ok(foliagePilotPlacements.every((_,i)=>!batch.getVisibleAt(i)))
  }finally{batch.dispose();material.dispose()}
})

test('contact shadows conform to the unchanged terrain instead of floating above slopes',()=>{
  const shadow=foliageContactShadows(foliagePilotPlacements)
  try{
    const geometry=shadow.geometry,p=geometry.attributes.position,index=geometry.index,v=new Vector3(),m=new Matrix4()
    for(let id=0;id<shadow.instanceCount;id++){shadow.getMatrixAt(id,m);const range=shadow.getGeometryRangeAt(shadow.getGeometryIdAt(id));for(let i=range.start;i<range.start+range.count;i++){v.fromBufferAttribute(p,index.getX(i)).applyMatrix4(m);assert.ok(Math.abs(v.y-forestSurfaceHeight(v.x,v.z)-.012)<2e-5)}}
    assert.ok(shadow.material.opacity<=.15&&!shadow.material.depthWrite)
  }finally{shadow.dispose();shadow.material.dispose()}
})
