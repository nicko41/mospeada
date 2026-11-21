import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {Box3,BufferGeometry,Float32BufferAttribute,Group,Matrix4,Mesh,MeshLambertMaterial,Vector3} from 'three'
import {CRASH_PATCH,CRASH_TREE,CRASH_TREE_EXCLUSIONS,crashSiteSample,crashTrackCenter,isCrashTree} from './forestCrashSite.js'
import {crashWorld,createCrashTree} from './forestCrashDressing.js'
import {forestBaseSurfaceHeight,forestSurfaceHeight,forestPathX,forestLayout,forestSourceLayout,createForestLayout} from './forestLayout.js'
import {forestWorldRenderLayout} from './forestUnderstory.js'
import {createForestTerrain} from './forestTerrainGeometry.js'
import {alphaCrashPlacement} from './forestAlpha.js'
import {registerRideSurfaces,sampleRideHeight} from '../../vehicle/rideSurface.js'
import {overlapsFootprint} from '../../player/collisionWorld.js'
import {crashLocal,FOREST_CRASH} from './forestCrashConfig.js'
import {CRASH_RELOCATION} from './crashRelocation.js'

test('Alpha keeps its horizontal anchor, yaw and scale while sinking the rear around a grounded nose pivot',()=>{
  const before=JSON.parse(fs.readFileSync('artifacts/forest-crash-refinement/before.json')),b=fs.readFileSync('public/models/mospeada/alpha-fighter-down.glb'),n=b.readUInt32LE(12),j=JSON.parse(b.toString('utf8',20,20+n)),a=j.accessors[j.meshes[0].primitives[0].attributes.POSITION],v=j.bufferViews[a.bufferView],values=new Float32Array(b.buffer,b.byteOffset+28+n+(v.byteOffset||0)+(a.byteOffset||0),a.count*3),model=new Group()
  model.add(new Mesh(new BufferGeometry().setAttribute('position',new Float32BufferAttribute(values,3)),new MeshLambertMaterial()))
  const p=alphaCrashPlacement(model),expected=new Matrix4().fromArray(before.matrix).premultiply(new Matrix4().makeTranslation(CRASH_RELOCATION.x,CRASH_RELOCATION.y,CRASH_RELOCATION.z))
  p.referenceMatrix.toArray().forEach((v,i)=>assert.ok(Math.abs(v-expected.elements[i])<1e-9));assert.deepEqual(p.sourceOrientationMatrix.toArray(),before.sourceMatrix)
  assert.equal(p.matrix.elements[12],FOREST_CRASH.x);assert.equal(p.matrix.elements[14],FOREST_CRASH.z);assert.equal(p.yaw,.65);assert.equal(p.scale,before.sourceMatrix[5])
  assert.ok(p.nosePivotLocal.clone().applyMatrix4(p.poseMatrix).distanceTo(p.nosePivotWorld)<1e-9)
  assert.ok(Math.abs(p.nosePivotWorld.y-forestSurfaceHeight(p.nosePivotWorld.x,p.nosePivotWorld.z)-.025)<1e-9)
  const tail=new Vector3(0,0,5.5),rearDrop=tail.clone().applyMatrix4(p.poseMatrix).y-tail.clone().applyMatrix4(p.referenceMatrix).y,noseDrop=p.nosePivotWorld.y-p.nosePivotLocal.clone().applyMatrix4(p.referenceMatrix).y
  assert.ok(rearDrop< -1&&rearDrop<noseDrop-.9,'Rear sinks progressively; this is not a uniform downward translation')
})

test('drag ruts are physical and wheels/feet sample the same refined terrain triangles',()=>{
  const geometry=createForestTerrain(),scene=new Group(),mesh=new Mesh(geometry,new MeshLambertMaterial());mesh.userData.rideSurface=true;scene.add(mesh);scene.updateMatrixWorld(true)
  const remove=registerRideSurfaces(scene);let low=0,high=0
  try{
    for(let along=-6;along<34;along+=.41)for(let cross=-4;cross<=4;cross+=.57){const p=crashWorld(crashTrackCenter(along)+cross,along),h=forestSurfaceHeight(p.x,p.z),delta=crashSiteSample(p.x,p.z).height;low=Math.min(low,delta);high=Math.max(high,delta);assert.ok(Math.abs(sampleRideHeight(p.x,p.z)-h)<2e-6)}
    assert.ok(low<-.5&&high>.2);assert.ok(low> -1.1&&high<.8)
    for(const x of [CRASH_PATCH.minX,CRASH_PATCH.maxX])for(let z=CRASH_PATCH.minZ;z<=CRASH_PATCH.maxZ;z+=.5)assert.ok(Math.abs(crashSiteSample(x,z).height)<1e-12)
    for(const p of [[-50,20],[0,100],[100,100],[10,-10]])assert.ok(Math.abs(forestSurfaceHeight(...p)-forestBaseSurfaceHeight(...p))<1e-9)
  }finally{remove();geometry.dispose();mesh.material.dispose()}
})

test('only the impacted tree leaves the standing batches; its trunk falls left and preserves the initial Alpha approach',()=>{
  const original=Object.values(forestSourceLayout).flat().filter(p=>p.kind==='tree'),rendered=Object.values(forestWorldRenderLayout).flat().filter(p=>p.kind==='tree')
  assert.equal(original.length-rendered.length,CRASH_TREE_EXCLUSIONS.length);assert.equal(rendered.some(isCrashTree),false)
  assert.deepEqual(createForestLayout(),forestLayout)
  for(const target of CRASH_TREE_EXCLUSIONS){assert.equal(original.filter(p=>p.name===target.name&&Math.hypot(p.x-target.x,p.z-target.z)<.001).length,1);assert.equal(rendered.some(p=>Math.hypot(p.x-target.x,p.z-target.z)<.001),false)}
  const g=new BufferGeometry().setAttribute('position',new Float32BufferAttribute([0,0,0,.4,0,0,0,9,0],3));g.setIndex([0,1,2]);g.computeBoundingBox()
  const asset={bounds:new Box3(new Vector3(-2,-.24,-2),new Vector3(2,9.18,2)),parts:[{geometry:g,material:new MeshLambertMaterial(),transform:new Matrix4()}]}
  const tree=createCrashTree(asset)
  assert.ok(Math.cos(.65)*tree.direction.x-Math.sin(.65)*tree.direction.z<-.4);assert.equal(tree.colliders.length,15)
  for(let z=-40;z<=50;z+=.25)assert.ok(!tree.colliders.some(c=>overlapsFootprint(c,forestPathX(z),z,1.1)))
  assert.ok(Math.abs(crashSiteSample(CRASH_TREE.x,CRASH_TREE.z).height)>.1)
  const middle=tree.start.clone().addScaledVector(tree.direction,tree.fallenLength*.5),along=crashLocal(middle.x,middle.z).z
  assert.ok(along>13&&along<20,'Fallen section occupies the middle of the 34 m scrape')
  tree.owned.forEach(g=>g.dispose());tree.material.dispose();tree.extraMaterials.forEach(m=>m.dispose())
})

test('the scrape crosses the struck tree continuously and heaped earth loads the right side of the hull',()=>{
  const root=crashLocal(CRASH_TREE.x,CRASH_TREE.z)
  assert.ok(Math.abs(root.x-crashTrackCenter(root.z))<1e-9)
  for(let z=5;z<=31;z+=.4){const p=crashWorld(crashTrackCenter(z),z),s=crashSiteSample(p.x,p.z);assert.ok(s.earth>.8&&s.damage>.8,'Continuous scraped ground from before the tree into the resting bed')}
  let right=0,left=0
  for(let z=-4;z<4;z+=.5){const r=crashWorld(2.3,z),l=crashWorld(-2.3,z);right+=crashSiteSample(r.x,r.z).height;left+=crashSiteSample(l.x,l.z).height}
  assert.ok((right-left)/16>.3,'A visible right-hand heap replaces mirrored decorative banks')
})
