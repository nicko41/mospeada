import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {MeshStandardMaterial,PerspectiveCamera,ShaderLib,Vector3} from 'three'
import {createHorizonCarrier,HORIZON_CARRIER as C} from './horizonCarrier.js'

globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1024,height:1024,close(){}})
const bytes=fs.readFileSync('public/models/mospeada/horizon-t-desert-landmark.glb'),asset=new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
test('monumental static carrier stays outside the combat strip, with fixed bounded LOD geometry and borrowed maps',async()=>{
 const g=await asset,source=g.scene.getObjectByName('HorizonT_LOD0'),sourceMaterial=source.material,original=source.geometry.attributes.position.array.slice(),sand=new MeshStandardMaterial(),carrier=createHorizonCarrier(g.scene,sand),camera=new PerspectiveCamera()
 try{
  assert.ok(carrier.placement.bounds.min.x>300);assert.ok(carrier.placement.size.z>900);assert.ok(carrier.placement.size.y>150)
  assert.ok(Math.abs(carrier.placement.bounds.min.y-carrier.placement.ground+C.burial)<1e-6)
  carrier.root.visible=true;carrier.root.updateMatrixWorld(true);camera.position.copy(carrier.lod.getWorldPosition(new Vector3())).add(new Vector3(0,0,700));camera.updateMatrixWorld(true);carrier.lod.update(camera);assert.equal(carrier.lod.getCurrentLevel(),0)
  camera.position.z+=2300;camera.updateMatrixWorld(true);carrier.lod.update(camera);assert.equal(carrier.lod.getCurrentLevel(),1)
  assert.deepEqual(carrier.lod.levels.map(l=>l.object.geometry.index.count/3),[70000,15000]);assert.equal(carrier.root.children.length,4)
  for(const l of carrier.lod.levels){assert.equal(l.object.castShadow,false);assert.equal(l.object.matrixAutoUpdate,false);assert.ok(!l.object.userData.rideSurface&&!l.object.isSkinnedMesh)}
  assert.equal(carrier.material.map,sourceMaterial.map);assert.deepEqual(source.geometry.attributes.position.array,original);assert.equal(source.material,sourceMaterial)
 }finally{carrier.dispose();sand.dispose()}
})
test('desert weathering keeps native paint maps and uses one shared static ground-height uniform',async()=>{
 const g=await asset,sand=new MeshStandardMaterial(),carrier=createHorizonCarrier(g.scene,sand)
 try{
  const shader={vertexShader:ShaderLib.standard.vertexShader,fragmentShader:ShaderLib.standard.fragmentShader,uniforms:{}}
  carrier.material.onBeforeCompile(shader);assert.equal(shader.uniforms.uCarrierGround,carrier.ground);assert.ok(shader.fragmentShader.includes('carrierSandColor'));assert.ok(shader.fragmentShader.includes('carrierErosion'));assert.ok(shader.fragmentShader.includes('roughnessFactor=max'))
  assert.ok(carrier.material.roughness>=.92&&carrier.material.metalness<=.16);assert.equal(carrier.lod.levels[0].object.material,carrier.lod.levels[1].object.material)
 }finally{carrier.dispose();sand.dispose()}
})
