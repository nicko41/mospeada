import test from 'node:test'
import assert from 'node:assert/strict'
import {Color,PerspectiveCamera,ShaderLib,Vector3} from 'three'
import {combatFlashUniforms,setCombatFlashLights,releaseCombatFlashLights,syncCombatFlashLighting,patchCombatFlashLighting} from './combatFlashLighting.js'

test('local combat illumination follows the camera through fixed uniform slots and clears on release',()=>{
  const camera=new PerspectiveCamera(),lights=[{position:new Vector3(2,3,-4),color:new Color('#ffe44b'),distance:3,intensity:6}]
  camera.position.set(1,2,5);camera.lookAt(0,1,0);camera.updateMatrixWorld()
  try{
    setCombatFlashLights(lights);syncCombatFlashLighting(camera)
    const expected=lights[0].position.clone().applyMatrix4(camera.matrixWorldInverse),p=combatFlashUniforms.uCombatFlashPositionRange.value[0],color=combatFlashUniforms.uCombatFlashColorPower.value[0]
    assert.ok(expected.distanceTo(new Vector3(p.x,p.y,p.z))<1e-8);assert.equal(p.w,3);assert.equal(color.w,6)
    assert.equal(combatFlashUniforms.uCombatFlashColorPower.value[1].w,0)
    releaseCombatFlashLights([]);syncCombatFlashLighting(camera);assert.equal(color.w,6,'Disposing an old effect cannot clear the current owner')
    releaseCombatFlashLights(lights);syncCombatFlashLighting(camera);assert.equal(color.w,0)
  }finally{releaseCombatFlashLights(lights)}
})

test('local flashes patch only lit materials and do not add light-count defines or vertex variants',()=>{
  assert.equal(patchCombatFlashLighting(ShaderLib.basic.fragmentShader),ShaderLib.basic.fragmentShader)
  for(const name of ['standard','lambert','phong']){
    const patched=patchCombatFlashLighting(ShaderLib[name].fragmentShader)
    assert.ok(patched.includes('uCombatFlashPositionRange[2]'))
    assert.ok(patched.indexOf('float flashPower=')<patched.indexOf('#include <opaque_fragment>'))
    assert.equal(patched.split('{').length,patched.split('}').length)
    assert.ok(!patched.includes('NUM_POINT_LIGHTS'))
  }
})
