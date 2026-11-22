import test from 'node:test'
import assert from 'node:assert/strict'
import {DirectionalLight,Group,Matrix4,PerspectiveCamera,Scene,Vector3} from 'three'
import {ScoutGroundShadows,SCOUT_SHADOW_LIMITS} from './ScoutGroundShadows.js'

function fixture(count=1){
 const scene=new Scene(),camera=new PerspectiveCamera(),sun=new DirectionalLight(),height=(x,z)=>x*.08+z*.03,fx=new ScoutGroundShadows({sampleGround:height}),state={},scouts=Array.from({length:count},(_,i)=>({id:i,dead:false,position:new Vector3(i%6*7,2+height(i%6*7,Math.floor(i/6)*7),Math.floor(i/6)*7),height:5.2,yaw:i*.2,view:{root:new Group()}}))
 sun.name='Character_sun_shadow';sun.position.set(-25,35,20);scene.add(sun,sun.target,fx.root);camera.position.set(0,10,28);scene.updateMatrixWorld(true)
 const tick=dt=>fx.update(dt,{scouts},camera,1,state,scene)
 return{fx,scene,camera,sun,state,scouts,height,tick}
}
test('Scout shadows project away from the sun and follow real ground heights including slopes',()=>{
 const f=fixture(),{fx,scouts,height,sun,tick}=f
 try{
  tick(.016);assert.equal(fx.mesh.count,1);const r=fx.records.get(scouts[0]);assert.ok(r.x>scouts[0].position.x&&r.z<scouts[0].position.z)
  assert.equal(r.center,height(r.x,r.z));const c=Math.cos(r.yaw),s=Math.sin(r.yaw)
  for(let i=0;i<4;i++){const x=(i%2?.5:-.5)*r.width,z=(i<2?.5:-.5)*r.length;assert.ok(Math.abs(r.heights[i]-height(r.x+c*x+s*z,r.z-s*x+c*z))<1e-6)}
  sun.position.x=25;sun.updateMatrixWorld(true);tick(.1);tick(.1);assert.ok(fx.records.get(scouts[0]).x<scouts[0].position.x)
  assert.equal(fx.material.depthWrite,false);assert.equal(fx.material.depthTest,true);assert.equal(fx.mesh.renderOrder,2,'Ground shadow stays under dust')
 }finally{fx.dispose()}
})
test('height lightens and broadens flying shadows, while death, hidden Scouts and voids remove them',()=>{
 const f=fixture(),{fx,scouts,tick}=f,s=scouts[0]
 try{
  s.position.y=0;tick(.016);const grounded=fx.geometry.attributes.aScoutShadowCenter.getY(0),width=fx.records.get(s).width
  s.position.y=12;tick(.15);assert.ok(fx.geometry.attributes.aScoutShadowCenter.getY(0)<grounded);assert.ok(fx.records.get(s).width>width)
  s.dead=true;tick(.016);assert.equal(fx.mesh.count,0);s.dead=false;s.view.root.visible=false;tick(.016);assert.equal(fx.mesh.count,0)
  s.view.root.visible=true;fx.sampleGround=()=>-Infinity;tick(.15);assert.equal(fx.mesh.count,0)
 }finally{fx.dispose()}
})
test('thirty Scouts reuse one shadow draw with bounded terrain queries and reset cleanly',()=>{
 const f=fixture(30),{fx,tick}=f,geometry=fx.geometry,material=fx.material,buffer=fx.mesh.instanceMatrix
 try{
  for(let i=0;i<60;i++){tick(1/60);assert.ok(fx.stats.groundQueries<=SCOUT_SHADOW_LIMITS.queries);assert.ok(fx.stats.refreshed<=8);assert.ok(fx.mesh.count<=35)}
  assert.equal(fx.mesh.count,30);assert.equal(fx.mesh.instanceMatrix,buffer);assert.equal(fx.geometry,geometry);assert.equal(fx.material,material)
  const clock=fx.clock,position=fx.records.get(f.scouts[0]).x;tick(0);assert.equal(fx.clock,clock);assert.equal(fx.records.get(f.scouts[0]).x,position)
  fx.clear();assert.equal(fx.mesh.count,0);fx.update(.01,{scouts:[]},f.camera,1,{},f.scene);assert.equal(fx.mesh.count,0)
 }finally{fx.dispose()}
})
