import test from 'node:test'
import assert from 'node:assert/strict'
import {PerspectiveCamera,Vector3} from 'three'
import {ForestEndingShot,FOREST_ENDING as E} from './ForestEndingShot.js'
import {RandDesertEscape} from './RandDesertEscape.js'
import {createBikeState} from '../../vehicle/bikePhysics.js'
import {ArmorController} from '../../vehicle/ArmorController.js'
import {createArmorState} from '../../vehicle/armorPhysics.js'
import {sampleVictoryBanner} from './victoryBanner.js'

const metrics={frontZ:1,rearZ:-1,frontY:.4,rearY:.4,frontRadius:.4,rearRadius:.4,wheelbase:2}
const flat=(x,z,out)=>{if(out)out.surface='dirt';return 0}
function fixture(){
 const world={bound:true,position:new Vector3(),distance:z=>-z,updateClimax(){}}
 const runtime={state:createBikeState({x:0,z:-3000,yaw:Math.PI},metrics,flat),paused:false,keys:{KeyW:true},vehicleRig:{metrics},climaxSequence:{phase:'battle',completed:false},orbit:{enabled:true,enableDamping:true},armorController:{active:true,reset(){this.active=false}},transformEntry:{phase:'complete',reset(){this.phase='idle'}}}
 runtime.randEscape=new RandDesertEscape(flat,metrics);runtime.randEscape.resumeClimax(runtime.state,world);runtime.randEscape.health=4
 let ends=0;const phases=[],shot=new ForestEndingShot(runtime,flat,{onPhase:p=>phases.push(p),onComplete:()=>ends++}),camera=new PerspectiveCamera(70,16/9,.1,4000)
 const tick=(dt=1/60)=>{shot.update(dt,world);if(shot.holding)shot.presentCamera(camera)}
 tick();return{runtime,world,shot,camera,tick,phases,ends:()=>ends}
}

test('only real level victory starts the closing shot and composition changes happen behind black',()=>{
 const f=fixture(),s=f.runtime.state,previous=s.z
 for(let i=0;i<30;i++)f.tick();assert.equal(f.shot.phase,'idle');assert.equal(s.z,previous)
 f.runtime.climaxSequence={phase:'failed',completed:false};f.tick();assert.equal(f.shot.phase,'idle')
 f.runtime.climaxSequence={phase:'victory',completed:true};f.tick();assert.equal(f.shot.phase,'victory');assert.equal(f.runtime.orbit.enabled,false);assert.deepEqual(f.runtime.keys,{})
 while(!f.shot.composed)f.tick()
 assert.equal(f.shot.opacity,1);assert.equal(f.runtime.state,s,'Keep actor state identity so victory is not reset')
 assert.equal(f.runtime.armorController.active,false);assert.equal(f.runtime.transformEntry.phase,'idle');assert.equal(s.riderMode,'mounted')
 assert.equal(f.runtime.randEscape.health,4,'Victory does not heal or replay the rescue')
 assert.ok(f.runtime.randEscape.state.x<s.x);assert.ok(f.runtime.randEscape.state.z<s.z)
})

test('victory music stays full through the image fade; completion waits for audio to fade out on black',()=>{
 const f=fixture();let starts=0,finishes=0,gain=0
 f.runtime.opening={music:{startVictory(){starts++;gain=1},setVictoryGain(value){gain=value},finishVictory(){finishes++},cancelVictory(){}}}
 f.runtime.climaxSequence={phase:'victory',completed:true};f.tick()
 assert.equal(f.shot.phase,'victory');assert.equal(starts,1);assert.equal(gain,1)
 for(let i=0;i<100;i++)f.tick();assert.equal(f.shot.phase,'victory');assert.equal(f.shot.opacity,0)
 while(f.shot.phase!=='black-hold'){
  f.tick();assert.equal(gain,1,'No music fade during the victory banner, ride or visual fade to black')
 }
 assert.equal(f.shot.opacity,1);assert.equal(f.ends(),0);assert.equal(f.runtime.paused,false)
 for(let i=0;i<Math.floor(E.blackHold*60)-2;i++){f.tick();assert.equal(gain,1);assert.equal(f.shot.phase,'black-hold');assert.equal(f.ends(),0)}
 while(f.shot.phase!=='audio-out')f.tick()
 for(let i=0;i<60;i++)f.tick();assert.ok(gain>0&&gain<1);assert.equal(f.shot.opacity,1);assert.equal(f.ends(),0)
 while(f.shot.phase!=='done')f.tick()
 assert.equal(gain,0);assert.equal(finishes,1);assert.equal(f.ends(),1);assert.equal(starts,1)
})

test('profile pullback keeps its direction, uses the native wheelie and both riders leave screen right before black',()=>{
 const f=fixture();f.runtime.climaxSequence={phase:'victory',completed:true}
 while(f.shot.phase!=='ride')f.tick()
 const direction=f.camera.getWorldDirection(new Vector3()),near=f.camera.position.x-f.runtime.state.x,q=f.camera.quaternion.clone()
 let wheelie=0,wide=0,exited=false,fullBikeFrame=false
 for(let i=0;i<Math.ceil((E.duration+E.blackHold+E.audioFade+1)*60)&&f.shot.phase!=='done';i++){
  f.tick();const s=f.runtime.state,rand=f.runtime.randEscape.state
  wheelie=Math.max(wheelie,s.wheelieAngle);wide=Math.max(wide,f.camera.position.x-s.x)
  assert.ok(f.camera.quaternion.angleTo(q)<1e-7,'Dolly without panning or changing the optical axis')
  const a=new Vector3(s.x,s.height+1,s.z).project(f.camera),b=new Vector3(rand.x,rand.height+1,rand.z).project(f.camera)
  if(f.shot.age>E.pullback*.7&&f.shot.age<E.pullback&&Math.abs(a.x)<.8&&Math.abs(b.x)<.8)fullBikeFrame=true
  if(f.shot.phase==='ride'&&f.shot.age<E.fadeStart&&a.x>1.2&&b.x>1.2)exited=true
 }
 assert.ok(direction.x<-.999&&Math.abs(direction.z)<1e-8);assert.ok(wide>near+8);assert.ok(fullBikeFrame)
 assert.ok(wheelie>.7,'Native Ctrl wheelie visibly raises Scott');assert.ok(exited,'Both bikes clear the right edge before the final fade')
 assert.equal(f.shot.phase,'done');assert.equal(f.shot.opacity,1);assert.equal(f.runtime.paused,true);assert.equal(f.ends(),1)
 for(let i=0;i<30;i++)f.tick();assert.equal(f.ends(),1)
})

test('victory advances an airborne motorcycle and orbits it while the banner clock runs',()=>{
 const f=fixture(),s=f.runtime.state,clock=[];f.runtime.armorController.active=false
 s.height=s.frontSpring=s.rearSpring=8;s.frontGrounded=s.rearGrounded=false;s.airborne=true;s.speed=12
 f.shot.onVictoryFrame=t=>clock.push(t);f.camera.position.set(0,10,s.z+8);f.camera.lookAt(0,9,s.z)
 f.runtime.climaxSequence={phase:'victory',completed:true};f.tick();const z=s.z,y=s.height,cam=f.camera.position.clone()
 for(let i=0;i<120;i++)f.tick()
 assert.equal(f.shot.phase,'victory');assert.ok(s.z<z-1);assert.ok(s.height<y-3);assert.ok(f.camera.position.distanceTo(cam)>3);assert.ok(clock.at(-1)>1.9)
 assert.equal(s.airborne,false,'Native wheel supports actually land instead of freezing midair')
})

test('an Armor victory uses the existing landing controller and waits for ground before cutting to Rand',()=>{
 const f=fixture(),r=f.runtime;r.scottInstance={bones:new Map()}
 const armor=r.armorController=new ArmorController(r,{root:{}},flat,()=>true)
 armor.active=true;armor.state=createArmorState({...r.state,height:70},0);armor.state.ground=0;armor.frontOffset=armor.rearOffset=0
 r.climaxSequence={phase:'victory',completed:true};f.tick();assert.ok(armor.state.groundLanding)
 for(let i=0;i<260;i++)f.tick()
 assert.equal(f.shot.phase,'victory','The card can finish animating while a high landing still completes');assert.ok(armor.state.y<50&&armor.state.y>0)
 while(f.shot.phase==='victory')f.tick()
 assert.equal(f.shot.phase,'cut');assert.equal(armor.state.grounded,true);assert.ok(armor.state.y<.1)
})

test('victory bands enter, the black panel pops and typed letters grow without changing the full layout',()=>{
 const start=sampleVictoryBanner(0),middle=sampleVictoryBanner(.55),word=sampleVictoryBanner(1.8)
 assert.equal(start.bands,0);assert.ok(start.panel<1e-10);assert.equal(start.letters,0)
 assert.equal(middle.bands,1);assert.ok(middle.panel>1,'Black panel has a restrained pop overshoot')
 assert.equal(sampleVictoryBanner(1.15).letters,3);assert.equal(word.letters,8);assert.equal(word.panel,1)
 let previous=0;for(let t=0;t<5;t+=.01){const count=sampleVictoryBanner(t).letters;assert.ok(count>=previous&&count<=8);previous=count}
})

test('pause freezes the shot, and restart restores camera and controls without retriggering the ending',()=>{
 const f=fixture();f.runtime.climaxSequence={phase:'victory',completed:true};while(f.shot.phase!=='ride')f.tick()
 for(let i=0;i<60;i++)f.tick()
 const age=f.shot.age,z=f.runtime.state.z,randZ=f.runtime.randEscape.z;f.runtime.paused=true
 for(let i=0;i<60;i++)f.tick()
 assert.equal(f.shot.age,age);assert.equal(f.runtime.state.z,z);assert.equal(f.runtime.randEscape.z,randZ)
 f.runtime.state=createBikeState({x:0,z:-1000,yaw:Math.PI},metrics,flat);f.runtime.climaxSequence={phase:'opening',completed:false};f.tick()
 assert.equal(f.shot.phase,'idle');assert.equal(f.shot.opacity,0);assert.equal(f.camera.fov,70);assert.equal(f.runtime.orbit.enabled,true)
 f.tick();assert.equal(f.shot.phase,'idle')
})
