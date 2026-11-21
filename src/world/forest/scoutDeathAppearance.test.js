import test from 'node:test'
import assert from 'node:assert/strict'
import {BoxGeometry,DataTexture,MeshStandardMaterial,ShaderLib} from 'three'
import {createScoutDeathGeometry,createScoutDeathMaterial} from './scoutDeathAppearance.js'

test('Scout death state is per instance and leaves the source geometry, material and original textures intact',()=>{
 const originalGeometry=new BoxGeometry(),map=new DataTexture(),originalMaterial=new MeshStandardMaterial({map}),geometry=createScoutDeathGeometry(originalGeometry,5),material=createScoutDeathMaterial(originalMaterial)
 try{
  assert.notEqual(geometry,originalGeometry);assert.notEqual(material,originalMaterial);assert.equal(material.map,map)
  assert.equal(originalGeometry.getAttribute('aScoutDeath'),undefined)
  const state=geometry.getAttribute('aScoutDeath');state.setXY(2,6,.4)
  assert.equal(state.getX(0),0);assert.equal(state.getY(0),1);assert.equal(state.getX(2),6);assert.ok(Math.abs(state.getY(2)-.4)<1e-6)
  assert.equal(originalMaterial.emissive.getHex(),0);assert.equal(originalMaterial.opacity,1)
  const shader={vertexShader:ShaderLib.standard.vertexShader,fragmentShader:ShaderLib.standard.fragmentShader}
  material.onBeforeCompile(shader)
  assert.ok(shader.vertexShader.includes('vScoutSurface=position'))
  assert.ok(shader.fragmentShader.includes('totalEmissiveRadiance+='));assert.ok(shader.fragmentShader.includes('if(breakup>vScoutDeath.y)discard'))
  assert.ok(shader.fragmentShader.includes('if(vScoutDeath.y<.999)'),'Living Scouts bypass the dissolve/darkening branch')
 }finally{geometry.dispose();material.dispose();originalGeometry.dispose();originalMaterial.dispose();map.dispose()}
})
