import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {MirroredRepeatWrapping,RepeatWrapping,ShaderLib,Texture} from 'three'
import {canyonEarthMaterial,canyonShoreMaterial,stage2GroundMaterial} from './forestCanyonMaterials.js'
import {createForestGroundMaterial} from './forestGroundMaterial.js'

test('canyon samplers keep source images independent and dispose only their own textures',()=>{
 const grass=new Texture(),dirt=new Texture();grass.wrapS=grass.wrapT=dirt.wrapS=dirt.wrapT=MirroredRepeatWrapping;grass.repeat.set(200,200)
 let sharedDisposals=0,ownedDisposals=0
 for(const source of[grass,dirt])source.addEventListener('dispose',()=>sharedDisposals++)
 const materials=[canyonEarthMaterial(dirt,{stratified:true}),canyonShoreMaterial(dirt,grass),stage2GroundMaterial(grass,dirt)]
 for(const material of materials){
  const shader={vertexShader:ShaderLib.lambert.vertexShader,fragmentShader:ShaderLib.lambert.fragmentShader,uniforms:{}};material.onBeforeCompile(shader)
  const textures=new Set([material.map,...Object.values(shader.uniforms).map(u=>u.value).filter(t=>t?.isTexture)])
  for(const texture of textures){const wrapping=texture===shader.uniforms.stage2Dirt?.value?MirroredRepeatWrapping:RepeatWrapping;assert.notEqual(texture,grass);assert.notEqual(texture,dirt);assert.equal(texture.wrapS,wrapping);assert.equal(texture.wrapT,wrapping);texture.addEventListener('dispose',()=>ownedDisposals++)}
  assert.ok(!shader.fragmentShader.includes('canyonTap'))
  assert.equal(shader.fragmentShader.includes('groundImage'),!!shader.uniforms.stage2Dirt)
  material.dispose()
 }
 assert.equal(ownedDisposals,5);assert.equal(sharedDisposals,0)
 assert.equal(grass.wrapS,MirroredRepeatWrapping);assert.deepEqual(grass.repeat.toArray(),[200,200]);assert.equal(dirt.wrapT,MirroredRepeatWrapping)
})

test('sharing the opening sampler leaves the approved opening, cliff and valley-floor shaders byte-identical',()=>{
 const grass=new Texture(),dirt=new Texture(),materials=[
  [createForestGroundMaterial(grass,dirt,8),'cc3ad32bbef6194d596d4e16f4eeed8207366e8ea9c21764120b141ac5f6c3da'],
  [canyonEarthMaterial(dirt,{stratified:true}),'e574cfbdfe1921f7756b74586d6466d8033aa7c5fdc56134872f8260e3587fdf'],
  [canyonShoreMaterial(dirt,grass),'1dfa1e9d4ade471f6224b67ddf0428bba9b744827aa9e80bdec49ddc54c9446c'],
 ]
 try{for(const [material,expected]of materials){const shader={vertexShader:ShaderLib.lambert.vertexShader,fragmentShader:ShaderLib.lambert.fragmentShader,uniforms:{}};material.onBeforeCompile(shader);assert.equal(createHash('sha256').update(shader.vertexShader+shader.fragmentShader).digest('hex'),expected)}}finally{materials.forEach(([m])=>m.dispose());grass.dispose();dirt.dispose()}
})
