import fs from 'node:fs'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {ridingFixture,writeRidingScene} from './scott-v2-riding-fixture.mjs'
import {loadPaletteSource,pixel} from './inspect-scott-palette.mjs'
import {readGlb,writeGlb} from './glb-data.mjs'
import {ScottV3Visual} from '../src/vehicle/ScottV3Visual.js'
import {scottV3PaletteRegion,scottV3PaletteMask,scottV3PaletteColor,paletteLinear,scottV3Palette} from '../src/vehicle/scottV3Palette.js'

// Offline inspection only: sample the same albedo remap into vertex colours.
// The game retains the full-resolution texture and executes the material shader.
const directory='artifacts/scott-v3/palette',report={palette:scottV3Palette,variants:{}}
fs.mkdirSync(directory,{recursive:true})
for(const [name,path,remap]of [['v1-reference','public/models/mospeada/scott-bernard-animated-original.glb',false],['v3-before','public/models/mospeada/scott-gear-v3-animated.glb',false],['v3-after','public/models/mospeada/scott-gear-v3-animated.glb',true]]){
 const f=await ridingFixture({modelPath:'public/models/mospeada/scott-bernard-animated-original.glb',fit:false}),source=await loadPaletteSource(path),g=source.g
 let visual
 if(name!=='v1-reference'){
  const asset=await new GLTFLoader().parseAsync(g.bytes.buffer.slice(g.bytes.byteOffset,g.bytes.byteOffset+g.bytes.length),'')
  visual=new ScottV3Visual(f.instance,asset.scene);f.scott={g,asset};f.skins=visual.skins
 }
 f.runtime.scottData=f.authored.data;Object.assign(f.s,{riderMode:'onFoot',dismountBlend:1,pedestrian:{x:0,z:0,ground:0,yaw:0,moving:false,runBlend:0,crouchBlend:0}});f.step(60);visual?.apply(f.runtime)
 f.rig.root.visible=false;f.wrapper.updateWorldMatrix(true,true)
 const mesh=f.skins[0].mesh,geometry=mesh.geometry,ids=[...new Set(geometry.index.array)],roles=mesh.skeleton.bones.map(b=>scottV3PaletteRegion(b.name)),colors=new Float32Array(ids.length*3),counts={chest:0,shoulders:0,legs:0,thighs:0,protected:0},j=geometry.attributes.skinIndex,w=geometry.attributes.skinWeight
 let changed=0,protectedChanges=0
 for(const [i,id]of ids.entries()){
  const indices=[0,1,2,3].map(k=>j.getComponent(id,k)),weights=[0,1,2,3].map(k=>w.getComponent(id,k)),mask=scottV3PaletteMask(indices,weights,roles),rgb=pixel(source.base,source.uv[id]),before=rgb.map(v=>paletteLinear(v/255)),after=remap?scottV3PaletteColor(rgb,mask):before
  colors.set(after,i*3)
  const difference=Math.max(...after.map((v,k)=>Math.abs(v-before[k]))),region=mask.indexOf(Math.max(...mask))
  if(difference>1e-9){changed++;counts[['chest','shoulders','legs','thighs'][region]]++}
  if(Math.max(...mask)<=.5){counts.protected++;if(difference>1e-9)protectedChanges++}
 }
 const file=directory+'/'+name+'-inspection.glb';writeRidingScene(f,file)
 const baked=readGlb(file),doc=baked.doc,offset=baked.bin.length,view=doc.bufferViews.length
 doc.bufferViews.push({buffer:0,byteOffset:offset,byteLength:colors.byteLength,target:34962})
 const attribute=doc.accessors.length;doc.accessors.push({bufferView:view,componentType:5126,type:'VEC3',count:ids.length})
 const primitive=doc.meshes[0].primitives[0];primitive.attributes.COLOR_0=attribute
 delete doc.materials[primitive.material].pbrMetallicRoughness.baseColorTexture
 doc.buffers[0].byteLength=offset+colors.byteLength
 writeGlb(file,doc,Buffer.concat([baked.bin,Buffer.from(colors.buffer)]))
 report.variants[name]={changedVertices:changed,protectedChanges,counts,vertices:ids.length,triangles:geometry.index.count/3}
 if(protectedChanges)throw Error('Palette leaked into unselected anatomy')
 visual?.dispose()
}
fs.writeFileSync(directory+'/preview-validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
