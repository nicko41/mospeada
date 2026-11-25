import fs from 'node:fs'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {readGlb,accessorData,writeGlb} from './glb-data.mjs'
const dir='artifacts/scott-rigid-chest',source='public/models/mospeada/scott-bernard-gear-v2-animated.glb',output='public/models/mospeada/scott-bernard-gear-v2-animated-rigid-chest.glb',g=readGlb(source),doc=structuredClone(g.doc),bin=Buffer.from(g.bin),primitive=doc.meshes[0].primitives[0],selection=JSON.parse(fs.readFileSync(dir+'/selection.json')),j=accessorData(g,primitive.attributes.JOINTS_0),w=accessorData(g,primitive.attributes.WEIGHTS_0),r=accessorData(g,primitive.attributes._RIGID_OWNER),modified=[],influences={}
for(let n=0;n<selection.vertexIds.length;n++){
 const id=selection.vertexIds[n],owner=selection.owners[n];assert.ok(id>=15429)
 for(let k=0;k<4;k++)if(w.values[id][k]>.001){const bone=doc.nodes[doc.skins[0].joints[j.values[id][k]]].name;influences[bone]=(influences[bone]||0)+1}
 if(j.values[id][0]!==owner||w.values[id][0]!==1||w.values[id].slice(1).some(x=>x!==0))modified.push(id)
 for(let k=0;k<4;k++){bin.writeUInt8(k===0?owner:0,j.offset+id*j.stride+k*j.size);bin.writeFloatLE(k===0?1:0,w.offset+id*w.stride+k*w.size)}
 bin.writeUInt8(owner,r.offset+id*r.stride)
}
doc.extras={...doc.extras,rigidChestPatch:{source,selected:selection.vertexIds.length,modified:modified.length,scope:'Front chest hard shell only; shoulder pads, back, neck and red cloth excluded'}}
writeGlb(output,doc,bin)
// Selection-only preview: same geometry and pose, with explicit region colors.
const mask=structuredClone(g.doc),colors=new Float32Array(j.values.length*3);for(let i=0;i<j.values.length;i++)colors.set([.16,.16,.16],i*3)
selection.vertexIds.forEach((id,n)=>colors.set(selection.owners[n]===3?[.05,.8,1]:selection.owners[n]===9?[1,.6,.05]:[1,.2,.05],id*3))
const colorBytes=Buffer.from(colors.buffer),pad=Buffer.alloc((-g.bin.length)&3),offset=g.bin.length+pad.length,view=mask.bufferViews.length;mask.bufferViews.push({buffer:0,byteOffset:offset,byteLength:colorBytes.length,target:34962});const a=mask.accessors.length;mask.accessors.push({bufferView:view,componentType:5126,count:j.values.length,type:'VEC3'});mask.meshes[0].primitives[0].attributes.COLOR_0=a;mask.meshes[0].primitives[0].material=mask.materials.length;mask.materials.push({pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:.75},doubleSided:true});mask.buffers[0].byteLength=offset+colorBytes.length;writeGlb(dir+'/selection-mask.glb',mask,Buffer.concat([g.bin,pad,colorBytes]))
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),report={source,output,sourceSha256:sha(source),outputSha256:sha(output),selectedVertices:selection.vertexIds.length,changedWeights:modified.length,regions:selection.regions,priorInfluences:influences,rigBones:doc.skins[0].joints.length,animations:doc.animations.length,indicesUnchanged:true,positionsNormalsUVsMaterialsUnchanged:true,redClothSelected:selection.redClothSelected,modifiedVertexIds:modified}
fs.writeFileSync(dir+'/patch.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,modifiedVertexIds:undefined},null,2))
