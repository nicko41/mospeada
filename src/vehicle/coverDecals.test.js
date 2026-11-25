import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {DataTexture,Matrix4,Vector3} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {createDrivingCyclone} from './createDrivingCyclone.js'
import {applyCoverDecals} from './coverDecals.js'
import {COVER_DECALS} from './coverDecalData.js'
import {CycloneSoilLayer} from './CycloneSoilLayer.js'

globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const data=JSON.parse(fs.readFileSync('public/transformations/cyclone-front-battloid.json'))
test('only the two existing cover undersides get insignia, with rango right and 21 left at the authored Armor endpoints',async()=>{
 const bytes=fs.readFileSync('public/models/mospeada/cyclone-vr052f.glb'),asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),''),rig=createDrivingCyclone(asset.scene),before=rig.surfaces.map(mesh=>({mesh,geometry:mesh.geometry,position:mesh.geometry.attributes.position.array.slice(),material:mesh.material})),textures=COVER_DECALS.map(()=>new DataTexture(new Uint8Array([255,255,255,255]),1,1)),decals=applyCoverDecals(rig,textures)
 assert.equal(decals.length,2)
 for(const decal of decals){
  const d=decal.definition,record=data.records.find(r=>r.key===d.key),toEditor=new Matrix4().fromArray(data.importMatrix).multiply(new Matrix4().fromArray(data.originalAssemblyMatrix)).invert(),final=new Matrix4().fromArray(data.referenceTransform).invert().multiply(new Matrix4().fromArray(record.delta)).multiply(toEditor),center=new Vector3().fromArray(d.center).applyMatrix4(final),up=new Vector3().fromArray(d.up).transformDirection(final)
  assert.ok(d.normal[1]<-.8,'Ink is projected onto the bottom face');assert.ok(up.y>.98,'Letters are upright when the covers reach Armor')
  if(d.name==='rango'){assert.equal(d.side,'Right');assert.ok(center.x<0)}else{assert.equal(d.name,'21');assert.equal(d.side,'Left');assert.ok(center.x>0)}
  const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <map_fragment>\n#include <color_fragment>'};decal.mesh.material.onBeforeCompile(shader)
  assert.equal(shader.uniforms.uCoverDecal.value,textures[COVER_DECALS.indexOf(d)]);assert.ok(shader.fragmentShader.includes('vCoverDecalFacing > .7'));assert.ok(shader.fragmentShader.indexOf('vec4 coverInk')<shader.fragmentShader.indexOf('#include <color_fragment>'),'Soil and ordinary surface shading still run after the print')
 }
 for(const r of before){assert.equal(r.mesh.geometry,r.geometry);assert.deepEqual(r.geometry.attributes.position.array,r.position);assert.equal(r.mesh.material,r.material,'No additional surface/material or draw is introduced')}
 const soil=new CycloneSoilLayer(rig);soil.install()
 for(const decal of decals){const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <map_fragment>\n#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>'};decal.mesh.material.onBeforeCompile(shader);assert.equal(shader.uniforms.uCoverDecal.value,decal.uniforms.uCoverDecal.value,'The insignia survives the weathering material wrapper')}
 soil.dispose();textures.forEach(t=>t.dispose())
})
