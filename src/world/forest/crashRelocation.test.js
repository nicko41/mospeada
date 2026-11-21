import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {BufferGeometry,Float32BufferAttribute,Group,Matrix4,Mesh,MeshLambertMaterial} from 'three'
import {CRASH_RELOCATION as d} from './crashRelocation.js'
import {FOREST_CRASH,FOREST_SPAWN,crashLocal} from './forestCrashConfig.js'
import {crashSiteSample,crashTrackCenter,crashTrackWidth} from './forestCrashSite.js'
import {forestBaseSurfaceHeight,forestSurfaceHeight,forestLayout,forestSourceLayout} from './forestLayout.js'
import {alphaCrashPlacement} from './forestAlpha.js'
import {TEST_STARTS} from '../../vehicle/bikeConfig.js'

const before=JSON.parse(fs.readFileSync('artifacts/forest-crash-relocation/before.json')),pose=JSON.parse(fs.readFileSync('artifacts/forest-crash-relocation/pose-before.json'))
test('approved ground profiles translate exactly and original damaged ground returns to its base height',()=>{
  for(const p of before.points){const now=crashSiteSample(p.x+d.x,p.z+d.z);for(const key of ['height','earth','dark','damage'])assert.equal(now[key],p[key]);assert.ok(Math.abs(forestSurfaceHeight(p.x+d.x,p.z+d.z)-p.y-d.y)<1e-8);assert.ok(Math.abs(forestSurfaceHeight(p.x,p.z)-forestBaseSurfaceHeight(p.x,p.z))<1e-8)}
  assert.deepEqual(Object.values(forestSourceLayout).flat().filter(p=>p.kind==='tree'),before.treeLedger)
})
test('the aircraft receives only the same rigid translation as the approved crash dressing',()=>{
  const b=fs.readFileSync('public/models/mospeada/alpha-fighter-down.glb'),n=b.readUInt32LE(12),j=JSON.parse(b.toString('utf8',20,20+n)),a=j.accessors[j.meshes[0].primitives[0].attributes.POSITION],v=j.bufferViews[a.bufferView],values=new Float32Array(b.buffer,b.byteOffset+28+n+(v.byteOffset||0)+(a.byteOffset||0),a.count*3),model=new Group();model.add(new Mesh(new BufferGeometry().setAttribute('position',new Float32BufferAttribute(values,3)),new MeshLambertMaterial()))
  const current=alphaCrashPlacement(model),expected=new Matrix4().fromArray(pose.matrix).premultiply(new Matrix4().makeTranslation(d.x,d.y,d.z))
  current.matrix.toArray().forEach((v,i)=>assert.ok(Math.abs(v-expected.elements[i])<1e-8));current.sourceMatrix.toArray().forEach((v,i)=>assert.ok(Math.abs(v-pose.sourceMatrix[i])<1e-8))
})
test('the entry and damaged strip have no intact trunks; spawn faces the aircraft from its left side',()=>{
  for(const p of Object.values(forestLayout).flat().filter(p=>p.kind==='tree')){
    const q=crashLocal(p.x,p.z),r=p.trunkRadius+.8
    assert.ok(!(q.z>=31&&q.z<47&&Math.abs(q.x-crashTrackCenter(Math.min(q.z,34)))<5+r),'Arrival begins in open ground')
    assert.ok(!(q.z>=4&&q.z<34&&Math.abs(q.x-crashTrackCenter(q.z))<crashTrackWidth(q.z)+r),'No intact trunk crosses the translated scar')
    assert.ok(!(Math.abs(q.x)<5.4+r&&q.z> -9-r&&q.z<8+r),'Aircraft footprint stays clear')
  }
  assert.equal(TEST_STARTS.forest,FOREST_SPAWN);const local=crashLocal(FOREST_SPAWN.x,FOREST_SPAWN.z);assert.ok(local.x< -5&&local.z< -8.3)
  const noseX=FOREST_CRASH.x-Math.sin(FOREST_CRASH.yaw)*8,noseZ=FOREST_CRASH.z-Math.cos(FOREST_CRASH.yaw)*8,heading=Math.atan2(noseX-FOREST_SPAWN.x,noseZ-FOREST_SPAWN.z);assert.ok(Math.abs(heading-FOREST_SPAWN.yaw)<.4)
})
