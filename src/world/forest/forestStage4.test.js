import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import {Box3,BoxGeometry,Matrix4,MeshLambertMaterial,Vector3} from 'three'
import {stage2PhysicsFixture} from '../../../scripts/forest-stage2-physics.mjs'
import {ForestStage3World,stage3World} from './forestStage3World.js'
import {ForestStage4World} from './forestStage4World.js'
import {stage4Anchor,stage4Path,stage4Edge,FOREST_STAGE4 as S} from './forestStage4Config.js'
import {sampleRideHeight} from '../../vehicle/rideSurface.js'
import {createBikeState,advanceBike} from '../../vehicle/bikePhysics.js'
import {bikeConfig} from '../../vehicle/bikeConfig.js'

test('Plano 4 joins a variable encounter exit, offers distinct natural jumps and lands on the lower textured desert with native physics',async()=>{
  const f=await stage2PhysicsFixture(),material=new MeshLambertMaterial(),geometry=new BoxGeometry(2,6,2),asset={name:'tree',kind:'tree',bounds:new Box3(new Vector3(-1,0,-1),new Vector3(1,6,1)),parts:[{geometry,material,transform:new Matrix4()}]},distant=new Map([['tree',{parts:asset.parts}]]),materials={origin:new Vector3(),ground:material,desert:material,cliff:material,foliage:{near:material,far:material},rocks:new Map()},previous=new ForestStage3World([asset],material,materials.foliage,distant),world=new ForestStage4World([asset],materials,distant)
  const removePrevious=previous.register(),remove=world.register(),removePreviousSurfaces=(await import('../../vehicle/rideSurface.js')).registerRideSurfaces(previous);stage3World.set(previous)
  const report={jumps:[],drops:[]},config={...bikeConfig,airBoostEnabled:true}
  const simulate=(startD,speed,boost=false)=>{
    const s=createBikeState(world.startAt(startD),f.rig.metrics,sampleRideHeight);s.speed=speed;let flight=null,land=null,settled=0,used=false,rebound=0
    for(let i=0;i<120*12;i++){
      const ahead=12+Math.abs(s.speed)*.3,desired=Math.atan2(world.position.x+stage4Path(s.z-world.position.z-ahead,world.anchor)-s.x,-ahead),error=Math.atan2(Math.sin(desired-s.yaw),Math.cos(desired-s.yaw))
      const pulse=boost&&s.airborne&&!used;if(pulse)used=true
      advanceBike(s,{throttle:Math.max(0,Math.min(1,(speed-s.speed)*.2+.08)),brake:pulse?0:Math.max(0,Math.min(1,(s.speed-speed-.4)*.1)),steer:Math.max(-1,Math.min(1,error*5)),boost:pulse},1/120,f.rig.metrics,sampleRideHeight,()=>true,config)
      assert.ok([s.x,s.z,s.height,s.pitch].every(Number.isFinite));assert.equal(world.needsRecovery(s),false)
      if(s.airborne&&!flight)flight={t:i/120,d:world.distance(s.z),height:s.height}
      if(flight&&s.frontGrounded&&s.rearGrounded&&!land)land={t:i/120,d:world.distance(s.z),height:s.height,impact:s.landingImpact}
      if(land){if(s.airborne)rebound++;settled+=1/120;if(settled>1.3)break}
    }
    return {flight,land,rebound,airBoostCount:s.airBoostCount,final:{d:world.distance(s.z),height:s.height,vy:s.verticalVelocity,grounded:s.frontGrounded&&s.rearGrounded,frontLoad:s.frontLandingLoad,rearLoad:s.rearLandingLoad,pitch:s.pitch},duration:land&&flight?land.t-flight.t:0}
  }
  try{
    assert.equal(sampleRideHeight(0,-200),-Infinity,'Inactive future geometry never supports the old level')
    const anchor=stage4Anchor(-1320);previous.ensureAround(anchor.z+30);previous.updateMatrixWorld(true)
    const seam=Array.from({length:41},(_,i)=>{const x=anchor.x-80+i*4;return {x,y:sampleRideHeight(x,anchor.z)}})
    let frames=0;while(!world.bound&&frames++<100)world.prepare({phase:'exiting'},{z:-1320});assert.ok(world.bound&&frames<100)
    for(const p of seam)assert.ok(Math.abs(sampleRideHeight(p.x,anchor.z)-p.y)<3e-6,'The triangle heights are continuous at the connection')
    for(const tile of previous.tiles)if(tile.group.position.z<=anchor.z)assert.equal(tile.mesh.userData.rideSurfaceActive,false)
    for(const j of S.jumps){const result=simulate(j.start-15,30);assert.ok(result.flight&&result.land);assert.ok(result.duration>.2&&result.duration<2);assert.ok(result.final.grounded);report.jumps.push({crest:j.crest,...result})}
    for(const speed of [15,30,60,80]){const result=simulate(590,speed);assert.ok(result.flight&&result.land);assert.ok(result.flight.height-result.land.height>26);assert.ok(result.duration>1.5&&result.duration<3.5);assert.ok(result.final.grounded,JSON.stringify({speed,...result}));assert.ok(Math.abs(result.final.vy)<.5);report.drops.push({speed,...result})}
    const boosted=simulate(590,45,true);assert.equal(boosted.airBoostCount,1);assert.ok(boosted.land&&boosted.final.grounded);report.boosted=boosted
    for(let x=-700;x<=700;x+=37.1){const edge=stage4Edge(x),upper=sampleRideHeight(anchor.x+x,anchor.z-edge+2),lower=sampleRideHeight(anchor.x+x,anchor.z-edge-20);assert.ok(Number.isFinite(upper)&&Number.isFinite(lower));assert.ok(upper-lower>18)}
    assert.ok(world.colliderData.filter(p=>p.forest).every(p=>-p.z<stage4Edge(p.x)-35),'No forest trees scatter into the desert')
    assert.equal(world.needsRecovery({height:anchor.y-28}),false,'Lower desert must not trigger the Plano 2 fall reset')
    report.preparationFrames=frames;report.preparationPeakMs=world.preparationPeakMs;report.anchor=anchor
    world.reset();assert.equal(world.bound,false);assert.ok(previous.tiles.every(t=>t.mesh.userData.rideSurfaceActive))
    world.bind(stage4Anchor(-2400));assert.ok(Number.isFinite(sampleRideHeight(world.position.x,world.position.z-40)))
    assert.equal(world.tiles.length,7,'Finite forest section, not another endless level')
    const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');assert.equal(hash('assets/texturas/desierto-floor.png'),hash('public/textures/desert/desierto-floor.png'))
    fs.mkdirSync('artifacts/forest-stage4',{recursive:true});fs.writeFileSync('artifacts/forest-stage4/physics.json',JSON.stringify(report,null,2)+'\n')
  }finally{remove();removePrevious();removePreviousSurfaces();stage3World.clear(previous);world.dispose();previous.dispose();f.dispose();geometry.dispose();material.dispose()}
})
