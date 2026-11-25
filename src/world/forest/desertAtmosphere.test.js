import test from 'node:test'
import assert from 'node:assert/strict'
import {Color,FogExp2,MathUtils,Scene} from 'three'
import {DesertClimaxAtmosphere,DESERT_HAZE} from './DesertClimaxAtmosphere.js'
import {DESERT_CLIMAX as C} from './forestClimaxConfig.js'

const sky=new Color('#9bcfec')
function fixture(){const scene=new Scene();scene.fog=new FogExp2('#d6b9a0',.0006);return{scene,original:scene.fog,haze:new DesertClimaxAtmosphere(),world:{bound:true,climaxPlain:{}}}}
const amount=(fog,distance)=>MathUtils.smoothstep(distance,fog.near,fog.far)

test('final desert leaves combat untouched and blends only the distant background smoothly',()=>{
 const {scene,haze,world}=fixture();haze.update(scene,world,C.start+400,1,sky)
 assert.ok(scene.fog.isFogExp2);assert.equal(scene.fog.near,DESERT_HAZE.start)
 for(const d of [0,55,100,190,500,850])assert.equal(amount(scene.fog,d),0,'Scott, Rand and the active combat keep full contrast')
 assert.ok(amount(scene.fog,1200)<.05,'Little intervention at middle distance')
 assert.ok(amount(scene.fog,2000)>.3&&amount(scene.fog,2000)<.5)
 assert.equal(amount(scene.fog,3500),1,'Background finishes blending before the 4000 m camera clip')
 assert.ok(scene.fog.color.r>scene.fog.color.b,'Warm sand rather than white fog')
 assert.ok(scene.fog.color.r<1&&scene.fog.color.g<1&&scene.fog.color.b<1)
 assert.ok(haze.horizon.strength>0&&haze.horizon.strength<1);assert.ok(haze.horizon.color.equals(scene.fog.color))
})

test('entering and leaving the haze preserves the warmed fog shader signature',()=>{
 const {scene,original,haze,world}=fixture(),signature=fog=>[!!fog,!!fog?.isFogExp2]
 for(const depth of [2399,2400,2401,2500,2800,2399,3000]){
  haze.restore(scene);haze.update(scene,world,depth,1,sky)
  assert.deepEqual(signature(scene.fog),signature(original),'Three must reuse FOG_EXP2 programs across the boundary')
 }
})

test('other scenes, exit, retry and disabled haze restore the exact previous fog',()=>{
 const {scene,original,haze,world}=fixture()
 for(const w of [null,{bound:false,climaxPlain:{}},{bound:true,climaxPlain:null}]){haze.update(scene,w,3000,1,sky);assert.equal(scene.fog,original)}
 haze.update(scene,world,C.start-1,1,sky);assert.equal(scene.fog,original)
 for(let i=0;i<3;i++){
  haze.update(scene,world,C.start+400,1,sky);assert.notEqual(scene.fog,original)
  haze.restore(scene);assert.equal(scene.fog,original);assert.equal(haze.horizon.strength,0)
 }
 assert.equal(original.density,.0006);assert.equal(original.color.getHexString(),'d6b9a0')
 haze.settings.enabled=false;haze.update(scene,world,3000,1,sky);assert.equal(scene.fog,original)
 haze.settings.enabled=true;haze.settings.density=0;haze.update(scene,world,3000,1,sky);assert.equal(scene.fog,original)
})

test('distance, falloff, density and color remain configurable; the descent eases into the new atmosphere',()=>{
 const {scene,haze,world}=fixture();haze.settings.start=1000;haze.settings.falloff=2000;haze.settings.density=2;haze.settings.color='#c9b38c';haze.settings.skyBlend=0
 let previousNear=-1,previousFar=Infinity
 for(let d=C.start;d<=C.start+340;d+=10){
  haze.restore(scene);haze.update(scene,world,d,1,sky)
  assert.ok(scene.fog.near>=previousNear);assert.ok(scene.fog.far<=previousFar)
  previousNear=scene.fog.near;previousFar=scene.fog.far
 }
 assert.equal(scene.fog.near,1000);assert.equal(scene.fog.far,2000);assert.equal(scene.fog.color.getHexString(),'c9b38c')
 haze.restore(scene);haze.update(scene,world,3000,0,sky);assert.ok(scene.fog.color.equals(new Color('#d6b9a0')),'Day fog does not brighten the night')
})
