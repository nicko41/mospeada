import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {clone} from 'three/addons/utils/SkeletonUtils.js'
import {ScottModelComparison} from './ScottModelComparison.js'
import {createRelaxedScottHands} from './relaxedScottHands.js'
import {ScottSoilLayer} from './ScottSoilLayer.js'
import {scottModelSelection} from './scottModelSelection.js'
import {SCOTT_V2_MODEL} from './scottModelConfig.js'

globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const load=async path=>{const b=fs.readFileSync(path);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')}
const assets=Promise.all(['public/models/mospeada/scott-bernard-animated-original.glb','public'+SCOTT_V2_MODEL].map(load))
async function fixture({lazy=false}={}){
 const [v1,v2]=await assets,model=clone(v2.scene);let mesh;model.traverse(n=>{if(n.isSkinnedMesh)mesh=n})
 const hand=createRelaxedScottHands(mesh),instance={model,skins:[{mesh,original:mesh.material,clean:mesh.material.clone()}],hands:[hand],bones:new Map(mesh.skeleton.bones.map(b=>[b.name,b])),mixer:new T.AnimationMixer(model)}
 const comparison=new ScottModelComparison(instance,lazy?{v2:v2.scene}:{v1:v1.scene,v2:v2.scene},'v2');instance.modelComparison=comparison
 return{instance,comparison,mesh,v1,v2,hand,dispose(){comparison.dispose();hand.dispose();instance.skins[0].clean.dispose()}}
}
test('V1/V2 comparison preserves live skeleton, mechanics and every original geometry attribute',async()=>{
 const f=await fixture()
 try{
  const geometry=f.mesh.geometry,skeleton=f.mesh.skeleton,mixer=f.instance.mixer,before=skeleton.bones.map(b=>({position:b.position.toArray(),quaternion:b.quaternion.toArray(),scale:b.scale.toArray()})),positions=geometry.attributes.position.array.slice(),indices=geometry.index.array.slice()
  assert.equal(f.instance.skins.length,1,'The comparison skin must not enter mechanical body/floor probes')
  for(let i=0;i<12;i++){
   const variant=i%2?'v2':'v1';f.comparison.select(variant)
   assert.equal(f.comparison.skins.filter(s=>s.mesh.visible).length,1)
   assert.equal(f.comparison.skins.find(s=>s.mesh.visible).variant,variant)
   for(const skin of f.comparison.skins)assert.equal(skin.mesh.skeleton,skeleton)
   assert.equal(f.mesh.geometry,geometry);assert.equal(f.instance.mixer,mixer)
  }
  assert.deepEqual(geometry.attributes.position.array,positions);assert.deepEqual(geometry.index.array,indices)
  assert.deepEqual(skeleton.bones.map(b=>({position:b.position.toArray(),quaternion:b.quaternion.toArray(),scale:b.scale.toArray()})),before)
  assert.equal(f.comparison.skins.find(s=>s.variant==='v1').mesh.geometry.index.count/3,10334)
  assert.equal(f.comparison.skins.find(s=>s.variant==='v2').mesh.geometry.index.count/3,240489)
 }finally{f.dispose()}
})
test('alternate skin follows grip/aim morphs and shares the existing dirt load without changing source materials',async()=>{
 const f=await fixture();let soil
 try{
  const alternate=f.comparison.skins.find(s=>s.variant==='v1'),sourceMaterial=f.v1.scene.getObjectByName('char1').material
  f.mesh.morphTargetInfluences.splice(0,3,.4,.8,.2);f.comparison.syncHands();assert.deepEqual(alternate.mesh.morphTargetInfluences,[.4,.8,.2]);assert.notEqual(alternate.original,sourceMaterial)
  soil=new ScottSoilLayer(f.instance);assert.equal(soil.records.length,2);soil.install()
  for(const skin of f.comparison.skins)assert.notEqual(skin.mesh.material,skin.original)
  f.comparison.select('v1');soil.uniforms.uScottMud.value.set(.1,.2,.3,.4);assert.equal(soil.records[0].uniforms.uScottMud,soil.records[1].uniforms.uScottMud)
  const root=alternate.mesh;soil.dispose();soil=null;f.comparison.dispose();assert.equal(root.parent,null);assert.equal(f.mesh.visible,true)
 }finally{soil?.dispose();f.dispose()}
})
test('selection is reversible, ignores invalid requests and stays disabled until Scott is ready',()=>{
 const state=scottModelSelection,initial=state.snapshot().variant;state.ready(false);state.toggle();assert.equal(state.snapshot().variant,initial)
 let updates=0;const unsubscribe=state.subscribe(()=>updates++)
 state.ready(true);state.select('hybrid');assert.equal(state.snapshot().variant,initial);state.toggle();assert.notEqual(state.snapshot().variant,initial);state.toggle();assert.notEqual(state.snapshot().variant,initial);state.toggle();assert.equal(state.snapshot().variant,initial)
 assert.equal(updates,4);unsubscribe();state.ready(false)
})

test('a lazy V1 uses the active shoulder setting and inherits existing soil without recreating V2 materials',async()=>{
 const f=await fixture({lazy:true}),soil=new ScottSoilLayer(f.instance),maps=[new T.Texture(),new T.Texture(),new T.Texture()]
 try{
  f.instance.clean=true;soil.install();const first=soil.records[0],material=first.mesh.material;soil.uniforms.uScottMud.value.set(.1,.2,.3,.4)
  f.comparison.addVariant('v1',f.v1.scene,maps);const skin=f.comparison.skins.find(s=>s.variant==='v1');assert.equal(skin.mesh.material,skin.clean);assert.equal(skin.clean.map,maps[0]);assert.equal(skin.clean.normalMap,maps[1])
  soil.addSkins([skin]);soil.install();assert.equal(soil.records.length,2);assert.equal(soil.records[0],first);assert.equal(first.mesh.material,material);assert.equal(soil.records[1].uniforms.uScottMud,soil.uniforms.uScottMud);assert.deepEqual(soil.records[1].uniforms.uScottMud.value.toArray(),[.1,.2,.3,.4]);assert.equal(skin.mesh.material,soil.records[1].variants.get(skin.clean));soil.addSkins([skin]);assert.equal(soil.records.length,2)
 }finally{soil.dispose();f.dispose();maps.forEach(m=>m.dispose())}
})
