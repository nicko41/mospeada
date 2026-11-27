import test from 'node:test'
import assert from 'node:assert/strict'
import {MirroredRepeatWrapping,RepeatWrapping,ShaderLib,Texture} from 'three'
import {canyonEarthMaterial,canyonShoreMaterial,stage2GroundMaterial} from './forestCanyonMaterials.js'

test('canyon samplers keep source images independent and dispose only their own textures',()=>{
 const grass=new Texture(),dirt=new Texture();grass.wrapS=grass.wrapT=dirt.wrapS=dirt.wrapT=MirroredRepeatWrapping;grass.repeat.set(200,200)
 let sharedDisposals=0,ownedDisposals=0
 for(const source of[grass,dirt])source.addEventListener('dispose',()=>sharedDisposals++)
 const materials=[canyonEarthMaterial(dirt,{stratified:true}),canyonShoreMaterial(dirt,grass),stage2GroundMaterial(grass,dirt)]
 for(const material of materials){
  const shader={vertexShader:ShaderLib.lambert.vertexShader,fragmentShader:ShaderLib.lambert.fragmentShader,uniforms:{}};material.onBeforeCompile(shader)
  const textures=new Set([material.map,...Object.values(shader.uniforms).map(u=>u.value).filter(t=>t?.isTexture)])
  for(const texture of textures){assert.notEqual(texture,grass);assert.notEqual(texture,dirt);assert.equal(texture.wrapS,RepeatWrapping);assert.equal(texture.wrapT,RepeatWrapping);texture.addEventListener('dispose',()=>ownedDisposals++)}
  assert.ok(!shader.fragmentShader.includes('canyonTap'))
  assert.ok(!shader.fragmentShader.includes('groundImage'))
  material.dispose()
 }
 assert.equal(ownedDisposals,5);assert.equal(sharedDisposals,0)
 assert.equal(grass.wrapS,MirroredRepeatWrapping);assert.deepEqual(grass.repeat.toArray(),[200,200]);assert.equal(dirt.wrapT,MirroredRepeatWrapping)
})
