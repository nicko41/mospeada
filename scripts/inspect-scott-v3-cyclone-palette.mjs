import fs from 'node:fs'
import {Float32BufferAttribute} from 'three'
import {v3ArmorFixture} from './scott-v3-armor-fixture.mjs'
import {writeRidingScene} from './scott-v2-riding-fixture.mjs'
import {loadPaletteSource,pixel} from './inspect-scott-palette.mjs'
import {readGlb,writeGlb} from './glb-data.mjs'
import {scottV3Palette,scottV3PaletteRegion,scottV3PaletteMask,scottV3PaletteColor} from '../src/vehicle/scottV3Palette.js'
import {SCOTT_BOOT_PAINT} from '../src/vehicle/cyclonePaint.js'

// Offline QA only. Bake both live shader tints into private inspection vertex
// colours, so Cyclone and Scott are compared in the same light. No game asset
// or native geometry is overwritten.
const directory='artifacts/scott-v3/palette/cyclone-match'
fs.mkdirSync(directory,{recursive:true})
const f=await v3ArmorFixture(),source=await loadPaletteSource('public/models/mospeada/scott-gear-v3-animated.glb')
f.scott=f.native;f.skins=f.visual.skins
let changedLegVertices=0,protectedChanges=0
for(const {mesh}of f.skins){
 const geometry=mesh.geometry.clone(),roles=mesh.skeleton.bones.map(b=>scottV3PaletteRegion(b.name)),j=geometry.attributes.skinIndex,w=geometry.attributes.skinWeight
 const colors=new Float32Array(geometry.attributes.position.count*3)
 for(let id=0;id<geometry.attributes.position.count;id++){
  const mask=scottV3PaletteMask([0,1,2,3].map(k=>j.getComponent(id,k)),[0,1,2,3].map(k=>w.getComponent(id,k)),roles)
  const rgb=pixel(source.base,source.uv[id]),after=scottV3PaletteColor(rgb,mask),before=scottV3PaletteColor(rgb,[0,0,0])
  colors.set(after,id*3)
  const changed=after.some((v,k)=>Math.abs(v-before[k])>1e-9)
  if(changed&&mask[2]>.8)changedLegVertices++
  if(changed&&Math.max(...mask)<.5)protectedChanges++
 }
 geometry.setAttribute('color',new Float32BufferAttribute(colors,3));mesh.geometry=geometry
}
const bikeMeshes=[]
f.rig.root.traverse(mesh=>{
 if(!mesh.isMesh)return
 for(let p=mesh;p;p=p.parent)if(!p.visible)return
 bikeMeshes.push(mesh)
 const m=Array.isArray(mesh.material)?mesh.material[0]:mesh.material,shader={uniforms:{},vertexShader:'',fragmentShader:'#include <color_fragment>'}
 m.onBeforeCompile(shader)
 const tint=shader.uniforms.uCyclonePaintTint?.value,a=mesh.geometry.attributes.color
 if(!tint||!a)return
 const geometry=mesh.geometry.clone(),colors=a.clone()
 for(let i=0;i<a.count;i++){
  const r=a.getX(i),g=a.getY(i),b=a.getZ(i)
  if(g-r>=Math.max(.015,g*.12)&&b>=r*1.02+.001)colors.setXYZ(i,r*tint.r,g*tint.g,b*tint.b)
 }
 geometry.setAttribute('color',colors);mesh.geometry=geometry
})
const file=directory+'/armor-inspection.glb'
writeRidingScene(f,file)
const baked=readGlb(file)
for(let i=0;i<f.skins.length;i++)delete baked.doc.materials[baked.doc.meshes[i].primitives[0].material].pbrMetallicRoughness.baseColorTexture
for(const [i,mesh]of bikeMeshes.entries()){
 const m=Array.isArray(mesh.material)?mesh.material[0]:mesh.material,p=baked.doc.meshes[f.skins.length+i].primitives[0]
 baked.doc.materials[p.material].pbrMetallicRoughness.baseColorFactor=[...m.color.toArray(),m.opacity]
}
writeGlb(file,baked.doc,baked.bin)
if(protectedChanges)throw Error('Palette leaked into protected anatomy')
const report={cyclonePaint:SCOTT_BOOT_PAINT,palette:scottV3Palette,changedLegVertices,protectedChanges,inspectionOnly:true}
fs.writeFileSync(directory+'/validation.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2))
f.visual.dispose()
