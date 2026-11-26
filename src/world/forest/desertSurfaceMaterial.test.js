import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {MirroredRepeatWrapping,ShaderLib,Texture,Vector3} from 'three'
import {stage4DesertMaterial,stage4DesertSurfaceMaterial,stage4CliffMaterial} from './forestStage4Materials.js'
import {desertMountainMaterial} from './desertMountainMaterial.js'

const compile=material=>{const shader={vertexShader:ShaderLib.lambert.vertexShader,fragmentShader:ShaderLib.lambert.fragmentShader,uniforms:{}};material.onBeforeCompile(shader);return shader}
test('the approved desert floor compiles byte-identically after adding the upright surface mapper',()=>{
  const a=new Texture(),b=new Texture(),material=stage4DesertMaterial(a,b),shader=compile(material)
  try{assert.equal(createHash('sha256').update(shader.vertexShader+shader.fragmentShader).digest('hex'),'56021687022bd434b32941f544e034cf3deb73baab005e61b52a966eb6633567')}finally{material.dispose();a.dispose();b.dispose()}
})
test('recycled terrain keeps the original floor samplers and ground details while steep faces use independent surface maps',()=>{
  const detail=new Texture(),sand=new Texture(),surfaceDetail=new Texture(),surfaceSand=new Texture()
  const material=stage4DesertSurfaceMaterial(surfaceDetail,surfaceSand,new Vector3(),{}, {detail,sand})
  try{
    const shader=compile(material),u=shader.uniforms
    assert.equal(material.map,detail);assert.equal(u.canyonDirt.value,detail);assert.equal(u.uDesertSand.value,sand)
    assert.equal(u.uSurfaceDetail.value,surfaceDetail);assert.equal(u.uSurfaceSand.value,surfaceSand)
    assert.ok(shader.fragmentShader.includes('desertPaint.rgb*=mix(1.0,.84,routeMark)'))
    assert.ok(shader.fragmentShader.includes('desertPaint.rgb=mix(desertPaint.rgb,gravel'))
    assert.ok(shader.fragmentShader.includes('if(surfaceNormal.y<.9&&surfaceWeights.y>0.0)'),'Level ground skips extra texture samples')
  }finally{material.dispose();for(const t of [detail,sand,surfaceDetail,surfaceSand])t.dispose()}
})
test('cliff and mountains reuse floor paint and metric scale, without rotated cells or extra wall distortion',()=>{
  const a=new Texture(),b=new Texture(),origin=new Vector3(32,4,-2400)
  a.wrapS=a.wrapT=b.wrapS=b.wrapT=MirroredRepeatWrapping
  const materials=[stage4CliffMaterial(a,b,origin),desertMountainMaterial(a,origin,{},b)]
  try{
    for(const material of materials){
      const shader=compile(material),u=shader.uniforms
      assert.equal(u.uDesertDetailMetres.value,12);assert.equal(u.uDesertSandMetres.value,8.8);assert.equal(u.uDesertSandShare.value,.6)
      assert.equal(u.canyonDirt.value,a);assert.equal(u.uDesertSand.value,b);assert.equal(u.uDesertOrigin.value,origin)
      assert.equal((shader.fragmentShader.match(/vec4 desertSurfacePaint\(/g)||[]).length,1)
      assert.ok(!shader.fragmentShader.match(/vec4 surfaceCanyonTap[^\n]+/)[0].includes('floor(h.z*4.0)')); assert.ok(!shader.fragmentShader.includes('cliffWarp'))
      assert.ok(shader.vertexShader.includes('surfacePoint=instanceMatrix*surfacePoint'))
      assert.equal(a.wrapS,MirroredRepeatWrapping,'Material creation does not mutate cached floor samplers')
    }
  }finally{materials.forEach(m=>m.dispose());a.dispose();b.dispose()}
})
