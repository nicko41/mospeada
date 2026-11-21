import fs from 'node:fs'
import {Box3,BufferAttribute,BufferGeometry,Group,Matrix4,Mesh,MeshStandardMaterial} from 'three'
import {FOREST_ASSETS} from '../src/world/forest/forestConfig.js'
import {prepareForestGeometry} from '../src/world/forest/forestGeometry.js'

// Small CPU-only fixture: actual source geometry, without a browser or image
// decoders. The render validation separately loads the original GLTF textures.
export function loadCanopyTestAssets(materialFor=(m)=>new MeshStandardMaterial({name:m.name,alphaTest:m.alphaCutoff||0})){
 return FOREST_ASSETS.filter(a=>a.kind==='tree').map(definition=>{
  const doc=JSON.parse(fs.readFileSync(`public/models/glTF/${definition.name}.gltf`)),bin=fs.readFileSync(`public/models/glTF/${doc.buffers[0].uri}`),scene=new Group(),types={5126:Float32Array,5125:Uint32Array,5123:Uint16Array,5121:Uint8Array},sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}
  function attribute(id){const a=doc.accessors[id],view=doc.bufferViews[a.bufferView],Type=types[a.componentType],size=sizes[a.type],values=new Type(a.count*size),dv=new DataView(bin.buffer,bin.byteOffset,bin.byteLength),get={5126:'getFloat32',5125:'getUint32',5123:'getUint16',5121:'getUint8'}[a.componentType];for(let i=0;i<a.count;i++)for(let j=0;j<size;j++)values[i*size+j]=dv[get]((view.byteOffset||0)+(a.byteOffset||0)+i*(view.byteStride||size*Type.BYTES_PER_ELEMENT)+j*Type.BYTES_PER_ELEMENT,true);return new BufferAttribute(values,size,!!a.normalized)}
  for(const primitive of doc.meshes[0].primitives){const geometry=new BufferGeometry();for(const [name,id]of Object.entries(primitive.attributes))geometry.setAttribute({POSITION:'position',NORMAL:'normal',TEXCOORD_0:'uv',COLOR_0:'color'}[name],attribute(id));geometry.setIndex(attribute(primitive.indices));scene.add(new Mesh(geometry,materialFor(doc.materials[primitive.material])))}
  scene.updateMatrixWorld(true);const originalBounds=new Box3().setFromObject(scene),bounds=new Box3(),parts=[]
  for(const mesh of scene.children){const geometry=prepareForestGeometry(mesh.geometry,mesh.matrixWorld,'tree',mesh.material.name,originalBounds,definition.name);bounds.union(geometry.boundingBox);parts.push({geometry,material:mesh.material,transform:new Matrix4()})}
  return {...definition,bounds,parts}
 })
}
