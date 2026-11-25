import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {Color,ShaderLib} from 'three'
import {SCOTT_BOOT_PAINT} from './cyclonePaint.js'
import {scottV3Palette,scottV3PaletteRegion,scottV3PaletteColor,paletteLinear,SCOTT_V3_LOWER_LEG_PAINT_GAIN} from './scottV3Palette.js'
import {ScottV3Visual} from './ScottV3Visual.js'
import {ScottSoilLayer} from './ScottSoilLayer.js'
import {ridingFixture} from '../../scripts/scott-v2-riding-fixture.mjs'

test('V3 retains chest and thighs, matches lower legs to Cyclone and preserves protected colours',()=>{
 assert.deepEqual(scottV3Palette.chest.target,{green:[175,182,164],white:[196,196,193]})
 assert.deepEqual(scottV3Palette.shoulders.target,{green:[173,180,163],white:[190,192,180]})
 assert.deepEqual(scottV3Palette.thighs.target,{green:[169,194,186],white:[236,236,235]})
 for(const side of ['Left','Right']){
  assert.equal(scottV3PaletteRegion('mixamorig:'+side+'UpLeg'),4)
  for(const part of ['Leg','Foot','ToeBase'])assert.equal(scottV3PaletteRegion('mixamorig:'+side+part),3)
 }
 const paint=new Color(SCOTT_BOOT_PAINT).toArray(),legs=scottV3Palette.legs
 scottV3PaletteColor(legs.source.green,[0,0,1]).forEach((v,k)=>assert.ok(Math.abs(v-paint[k]*SCOTT_V3_LOWER_LEG_PAINT_GAIN)<1e-9,'Lower-leg paint lacks its live cel compensation'))
 assert.ok(Math.max(...legs.target.white)<180,'Lower leg panels must share the Cyclone pigment')
 for(const [i,p]of Object.values(scottV3Palette).entries())for(const kind of ['green','white']){
  const mask=[0,0,0,0];mask[i]=1
  const actual=scottV3PaletteColor(p.source[kind],mask),expected=p.target[kind].map(v=>Math.min(1,paletteLinear(v/255)*(i===2?SCOTT_V3_LOWER_LEG_PAINT_GAIN:1)))
  actual.forEach((v,k)=>assert.ok(Math.abs(v-expected[k])<1e-12))
 }
 for(const rgb of [[132,42,28],[25,29,30],[12,22,164]])for(const mask of [[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]])assert.deepEqual(scottV3PaletteColor(rgb,mask),rgb.map(v=>paletteLinear(v/255)))
 for(const rgb of [[196,204,208],[154,176,160],[211,161,133]])assert.deepEqual(scottV3PaletteColor(rgb,[0,0,0]),rgb.map(v=>paletteLinear(v/255)))
 for(const name of ['Hips','Head','Neck','LeftForeArm','RightHand','LeftHandMiddle4'])assert.equal(scottV3PaletteRegion('mixamorig:'+name),0,name)
})

test('V3 palette is material-only, preserves native attributes and PBR maps, and runs before capped soil shading',async()=>{
 const f=await ridingFixture(),bytes=fs.readFileSync('public/models/mospeada/scott-gear-v3-animated.glb'),asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'')
 let native;asset.scene.traverse(n=>{if(n.isSkinnedMesh)native=n})
 const attributes=Object.keys(native.geometry.attributes),positions=native.geometry.attributes.position.array.slice(),weights=native.geometry.attributes.skinWeight.array.slice(),sourceMaterial=native.material
 const v=new ScottV3Visual(f.instance,asset.scene),skin=v.skins[0];let soil
 try{
  assert.equal(skin.mesh.geometry,native.geometry)
  assert.deepEqual(Object.keys(native.geometry.attributes),attributes)
  assert.deepEqual(native.geometry.attributes.position.array,positions);assert.deepEqual(native.geometry.attributes.skinWeight.array,weights)
  for(const m of [skin.original,skin.clean]){
   assert.equal(m.map,sourceMaterial.map);assert.equal(m.normalMap,sourceMaterial.normalMap);assert.equal(m.roughnessMap,sourceMaterial.roughnessMap);assert.equal(m.metalnessMap,sourceMaterial.metalnessMap)
   assert.ok(m.customProgramCacheKey().includes('v1-chest-thighs-cyclone-lower-legs-palette-v4'))
  }
  assert.ok(!sourceMaterial.customProgramCacheKey().includes('v1-chest-thighs-cyclone-lower-legs-palette-v4'))
  f.instance.modelComparison={skins:v.skins};soil=new ScottSoilLayer(f.instance)
  const shader={vertexShader:ShaderLib.standard.vertexShader,fragmentShader:ShaderLib.standard.fragmentShader,uniforms:{}}
  soil.records[0].variants.get(skin.original).onBeforeCompile(shader)
  assert.ok(shader.fragmentShader.indexOf('v3Ratio')<shader.fragmentShader.indexOf('float soilCoverage'))
  assert.ok(shader.fragmentShader.includes('0.25'),'Scott soil cap changed')
  assert.equal(shader.uniforms.uV3LowerLegPaintGain.value,SCOTT_V3_LOWER_LEG_PAINT_GAIN)
  for(const [i,b]of native.skeleton.bones.entries())if(scottV3PaletteRegion(b.name)===0)assert.deepEqual(shader.uniforms.uV3PaletteRegions.value[i].toArray(),[0,0,0,0])
 }finally{soil?.dispose();v.dispose()}
})
