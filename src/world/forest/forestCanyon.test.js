import test from 'node:test'
import assert from 'node:assert/strict'
import {Vector3} from 'three'
import {createNaturalCanyon,createRiverGeometry,riverSection,canyonFloor} from './forestCanyon.js'
import {stage2Height} from './forestStage2Terrain.js'
import {stage2LipZ,FOREST_STAGE2 as S} from './forestStage2Config.js'
import {stage2PhysicsFixture,simulateStage2} from '../../../scripts/forest-stage2-physics.mjs'

test('eroded walls join the unchanged rims and valley floor, with metre-scaled UVs',()=>{
  const {cliffs,bed}=createNaturalCanyon(stage2Height),p=cliffs.attributes.position,uv=cliffs.attributes.uv,columns=p.count/62,a=new Vector3(),b=new Vector3(),floor=bed.attributes.position
  try{
    for(let side=0;side<2;side++)for(let col=0;col<columns;col++){
      const i=side*31*columns+col,x=p.getX(i);assert.ok(Math.abs(p.getZ(i)-stage2LipZ(x,!!side))<.0001);assert.ok(Math.abs(p.getY(i)-stage2Height(x,p.getZ(i)))<.0001)
      const foot=side*31*columns+30*columns+col,bedId=(side?48*columns:0)+col
      a.fromBufferAttribute(p,foot);b.fromBufferAttribute(floor,bedId);assert.ok(a.distanceTo(b)<.0001)
      for(let row=1;row<=30;row++){const j=i+row*columns;a.fromBufferAttribute(p,j);b.fromBufferAttribute(p,j-columns);assert.ok(Math.abs((uv.getY(j)-uv.getY(j-columns))*4-a.distanceTo(b))<.0001)}
    }
    assert.ok(cliffs.index.count/3<40000);assert.ok(bed.boundingBox.max.y<S.fallY-8)
  }finally{cliffs.dispose();bed.dispose()}
})
test('river is a bounded 3D ribbon with depth, changing width and a submerged channel',()=>{
  const g=createRiverGeometry();try{assert.ok(g.index.count/3<10000);assert.ok(g.boundingBox.max.y<S.fallY-15);let min=Infinity,max=-Infinity;for(let x=-240;x<240;x+=5){const r=riverSection(x);min=Math.min(min,r.halfWidth);max=Math.max(max,r.halfWidth);assert.ok(canyonFloor(x,r.z)<r.y-2)}assert.ok(max-min>4);assert.ok(g.attributes.aRiverDepth.array.some(v=>v<0))}finally{g.dispose()}
})
test('canyon refinements preserve failed ground-only attempts, aerial boost crossing and checkpoint fall threshold',async()=>{
  const f=await stage2PhysicsFixture();try{for(const opts of [{},{startZ:-730,speed:60,groundPulseZ:-790}]){const r=simulateStage2(f,opts);assert.equal(r.landed,false);assert.ok(r.final.y<S.fallY)}const r=simulateStage2(f,{airDelay:.2});assert.ok(r.landed&&r.final.front&&r.final.rear);assert.equal(r.airBoostCount,1)}finally{f.dispose()}
})
