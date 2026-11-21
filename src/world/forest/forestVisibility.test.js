import test from 'node:test'
import assert from 'node:assert/strict'
import { Box3, BoxGeometry, Color, Frustum, Matrix4, MeshLambertMaterial, PerspectiveCamera, Sphere, Vector3 } from 'three'
import { ForestBatch } from './ForestBatch.js'
import { forestSurfaceHeight } from './forestLayout.js'

function fixture() {
  const geometry = new BoxGeometry(2, 6, 2), material = new MeshLambertMaterial()
  const part = { geometry, material, transform: new Matrix4().makeTranslation(.25, 0, -.1) }
  const placements = []
  for (let i = 0; i < 48; i++) {
    const angle = i * Math.PI / 24
    placements.push({ x: Math.sin(angle)*30, z: Math.cos(angle)*30, scale: .7+i/80, yaw: angle, tint: .9 })
  }
  placements.push({ x: 200, z: 200, scale: 1, yaw: .2, tint: 1 })
  const bounds = new Box3(new Vector3(-1, -3, -1), new Vector3(1, 3, 1))
  const batch = new ForestBatch(part, placements, bounds, 'tree', 80)
  const camera = new PerspectiveCamera(65, 1.5, .1, 500)
  camera.position.set(0, 3, 0);camera.updateMatrixWorld(true)
  batch.updateMatrixWorld(true);batch.updateDistance(camera)
  return { batch, part, placements, camera, dispose() { batch.dispose();geometry.dispose();material.dispose() } }
}

test('all 360° transforms are prepared once, while frustum and distance culling remain enabled', () => {
  const f = fixture(), { batch, camera, placements } = f
  try {
    assert.equal(batch.instanceCount, placements.length)
    assert.equal(batch.perObjectFrustumCulled, true)
    assert.equal(batch.frustumCulled, true)
    assert.equal(batch.getVisibleAt(48),false)
    const matrix = new Matrix4()
    for(let i=0;i<48;i++) {
      batch.getMatrixAt(i,matrix)
      const p=placements[i],expectedX=p.x+(Math.cos(p.yaw)*.25-Math.sin(p.yaw)*.1)*p.scale
      assert.ok(Math.abs(matrix.elements[12]-expectedX)<1e-4)
    }
    // Both coarse bounds must cover objects behind the starting camera as well.
    for(let i=0;i<batch.instanceCount;i++) {
      const instance = batch.getBoundingSphereAt(0,new Sphere()).applyMatrix4(batch.getMatrixAt(i,new Matrix4()))
      assert.ok(batch.boundingSphere.center.distanceTo(instance.center)+instance.radius <= batch.boundingSphere.radius+1e-4)
      assert.ok(batch.boundingBox.containsBox(batch.getBoundingBoxAt(0,new Box3()).applyMatrix4(batch.getMatrixAt(i,new Matrix4()))))
    }
    camera.position.set(200, 3, 200);batch.updateDistance(camera)
    assert.equal(batch.getVisibleAt(48),true)
    assert.equal(batch.getVisibleAt(0),false)
  } finally { f.dispose() }
})

test('repeated immediate 360° turns both ways submit the current view with no matrix, geometry or material writes', () => {
  const f = fixture(), { batch, camera } = f
  try {
    const matrixVersion=batch._matricesTexture.version, colorVersion=batch._colorsTexture.version
    const matrices=batch._matricesTexture.image.data.slice(), colors=batch._colorsTexture.image.data.slice()
    const geometry=batch.geometry, position=geometry.attributes.position, material=batch.material
    const bounds=batch.boundingBox.clone(), sphere=batch.boundingSphere.clone()
    const frustum=new Frustum(),projection=new Matrix4(),actual=new Set()
    for(const direction of [-1,1])for(let frame=0;frame<144;frame++) {
      const yaw=direction*frame*Math.PI/12
      camera.lookAt(Math.sin(yaw)*30,3,Math.cos(yaw)*30);camera.updateMatrixWorld(true)
      batch.updateDistance(camera)
      batch.onBeforeRender({},null,camera,batch.geometry,batch.material)
      frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse))
      actual.clear()
      for(let i=0;i<batch._multiDrawCount;i++)actual.add(batch._indirectTexture.image.data[i])
      assert.ok(actual.size>0&&actual.size<24,'Only the visible part of the ring is submitted')
      for(let i=0;i<48;i++) {
        const s=batch.getBoundingSphereAt(0,new Sphere()).applyMatrix4(batch.getMatrixAt(i,new Matrix4()))
        assert.equal(actual.has(i),frustum.intersectsSphere(s),`Wrong current-frame visibility for ${direction}/${frame}/${i}`)
      }
    }
    assert.equal(batch._matricesTexture.version,matrixVersion);assert.equal(batch._colorsTexture.version,colorVersion)
    assert.deepEqual(batch._matricesTexture.image.data,matrices);assert.deepEqual(batch._colorsTexture.image.data,colors)
    assert.equal(batch.geometry,geometry);assert.equal(batch.geometry.attributes.position,position);assert.equal(batch.material,material)
    assert.deepEqual(batch.boundingBox,bounds);assert.deepEqual(batch.boundingSphere,sphere)
  } finally { f.dispose() }
})

test('shrubs intersect the ground and keep identical contact and varied tints at both LODs',()=>{
  const bounds=new Box3(new Vector3(-.92,-.235,-.97),new Vector3(.99,1.347,.99))
  const geometry=new BoxGeometry(1.91,1.582,1.96),material=new MeshLambertMaterial(),part={geometry,material,transform:new Matrix4()}
  const placements=Array.from({length:20},(_,i)=>({x:-30+i*3,z:-20+i*.6,scale:.65+i/20,yaw:i*.4,tint:.84+i/19*.24}))
  const detail=new ForestBatch(part,placements,bounds,'shrub',62),far=new ForestBatch(part,placements,bounds,'shrub',175,50)
  try{
    const a=new Matrix4(),b=new Matrix4(),ca=new Color(),cb=new Color(),brightness=[]
    for(let id=0;id<placements.length;id++){
      const p=placements[id];detail.getMatrixAt(id,a);far.getMatrixAt(id,b)
      assert.deepEqual(a.elements,b.elements,'LOD changes must not move an already grounded bush')
      assert.ok(Math.abs(a.elements[12]-p.x)<1e-5&&Math.abs(a.elements[14]-p.z)<1e-5)
      const bottom=a.elements[13]+bounds.min.y*p.scale,top=a.elements[13]+bounds.max.y*p.scale,floor=forestSurfaceHeight(p.x,p.z)
      assert.ok(bottom<floor-.15*p.scale&&top>floor+.9*p.scale,'A leafy lower skirt must enter the soil while most of the bush stays above it')
      detail.getColorAt(id,ca);far.getColorAt(id,cb);assert.deepEqual(ca.toArray(),cb.toArray())
      brightness.push(ca.g)
    }
    assert.ok(Math.max(...brightness)/Math.min(...brightness)>1.5,'Keep distinguishable light and dark specimens')
  }finally{detail.dispose();far.dispose();geometry.dispose();material.dispose()}
})
