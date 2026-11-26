import test from 'node:test'
import assert from 'node:assert/strict'
import {Group,Matrix4,Vector3} from 'three'
import {DesertClimaxScenery,DESERT_STONES} from './DesertClimaxScenery.js'
import {desertRidgeGeometry} from './DesertRockFormations.js'
import {DESERT_CLIMAX as C,climaxPathX} from './forestClimaxConfig.js'

test('low clustered instanced stones leave the route open and deterministic recycled rows reuse their buffers',()=>{
  const world=new Group(),s=new DesertClimaxScenery(world),matrix=new Matrix4(),position=new Vector3()
  try{
    s.assignRow(0,5);const before=s.rocks.instanceMatrix.array.slice(),buffer=s.rocks.instanceMatrix
    const count=DESERT_STONES.clustersPerRow*DESERT_STONES.stonesPerCluster
    for(let i=0;i<count;i++){
      s.rocks.getMatrixAt(i,matrix);position.setFromMatrixPosition(matrix)
      assert.ok(Math.abs(position.x-climaxPathX(-position.z))>=DESERT_STONES.clearHalfWidth)
      assert.ok(Math.hypot(matrix.elements[4],matrix.elements[5],matrix.elements[6])<.55,'Low stones preserve target visibility')
    }
    s.assignRow(0,9);s.assignRow(0,5);assert.deepEqual(s.rocks.instanceMatrix.array,before);assert.equal(s.rocks.instanceMatrix,buffer)
    assert.ok(world.children.every(m=>!m.userData.rideSurface),'Decoration never changes vehicle support/collision')
    s.update(C.start+2000,C.start+2100);const ridges=s.formations.meshes.map(m=>m.instanceMatrix.array.slice())
    s.update(C.start+2001,C.start+2101);assert.deepEqual(s.formations.meshes.map(m=>m.instanceMatrix.array),ridges)
    assert.equal(s.formations.meshes.length,3)
  }finally{s.dispose();assert.equal(world.children.length,0)}
})
test('horizon formations have wide asymmetric broken crests and irregular large facets',()=>{
  const g=desertRidgeGeometry(13),p=g.attributes.position
  try{
    const peaks=new Map();for(let i=0;i<p.count;i++){const x=p.getX(i);peaks.set(x,Math.max(peaks.get(x)||0,p.getY(i)))}
    const crest=[...peaks].filter(([x])=>Math.abs(x)<.7).sort((a,b)=>a[0]-b[0])
    assert.ok(crest.length>12);assert.ok(new Set(crest.map(([,y])=>Math.round(y*10))).size>5)
    assert.ok(crest.some(([x,y])=>x<-.3&&y>.45)&&crest.some(([x,y])=>x>.3&&y>.45),'Several broad high regions, not a single central cone')
    assert.equal(g.index,null);assert.ok(p.count<1200)
  }finally{g.dispose()}
})
