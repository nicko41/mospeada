import fs from 'node:fs'
import crypto from 'node:crypto'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {Matrix3,Matrix4,Vector3} from 'three'

const source='assets/rand-cyclone/rand-casual-rigged.glb',output='assets/rand-cyclone/rand-casual-rigged-adjusted.glb',factor=1.18,radial=.94
const bytes=fs.readFileSync(source),jl=bytes.readUInt32LE(12),doc=JSON.parse(bytes.toString('utf8',20,20+jl)),binary=bytes.subarray(28+jl)
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'');asset.scene.updateMatrixWorld(true)
const mesh=asset.scene.getObjectByProperty('isSkinnedMesh',true),bones=mesh.skeleton.bones,transforms=new Map(),changes=[]
const pos=b=>b.getWorldPosition(new Vector3()),bone=name=>bones.find(b=>b.name.endsWith(name))
function stretch(origin,nextOrigin,axis){
 const a=axis.clone().normalize(),m=new Matrix4(),e=m.elements,d=factor-radial
 for(let r=0;r<3;r++)for(let c=0;c<3;c++)e[c*4+r]=(r===c?radial:0)+d*a.getComponent(r)*a.getComponent(c)
 m.setPosition(nextOrigin.clone().sub(origin.clone().applyMatrix4(m)));return m
}
for(const side of ['Left','Right']){
 const upper=bone(side+'Arm'),lower=bone(side+'ForeArm'),hand=bone(side+'Hand'),s=pos(upper),e=pos(lower),w=pos(hand),en=s.clone().lerp(e,factor),wn=en.clone().add(w.clone().sub(e).multiplyScalar(factor))
 transforms.set(bones.indexOf(upper),stretch(s,s,e.clone().sub(s)));transforms.set(bones.indexOf(lower),stretch(e,en,w.clone().sub(e)));transforms.set(bones.indexOf(hand),new Matrix4().makeTranslation(...wn.sub(w).toArray()))
 for(const b of [lower,hand]){changes.push({name:b.name,oldLength:b.position.length(),newLength:b.position.length()*factor});b.position.multiplyScalar(factor);const node=doc.nodes.find(n=>n.name?.replace(/:/g,'')===b.name);node.translation=b.position.toArray()}
}
const normalTransforms=new Map([...transforms].map(([i,m])=>[i,new Matrix3().getNormalMatrix(m)]))
const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal,tangent=mesh.geometry.attributes.tangent,j=mesh.geometry.attributes.skinIndex,w=mesh.geometry.attributes.skinWeight
const positions=new Float32Array(p.array),normals=new Float32Array(n.array),tangents=tangent?new Float32Array(tangent.array):null,v=new Vector3(),vn=new Vector3(),vt=new Vector3(),tmp=new Vector3(),sum=new Vector3(),sumN=new Vector3(),sumT=new Vector3()
let affected=0,untouched=0
for(let i=0;i<p.count;i++){
 v.fromBufferAttribute(p,i);vn.fromBufferAttribute(n,i);if(tangent)vt.fromBufferAttribute(tangent,i);sum.set(0,0,0);sumN.set(0,0,0);sumT.set(0,0,0);let changed=false
 for(let k=0;k<4;k++){const weight=w.getComponent(i,k);if(!weight)continue;const id=j.getComponent(i,k),m=transforms.get(id);changed||=!!m
  sum.addScaledVector(m?tmp.copy(v).applyMatrix4(m):v,weight);sumN.addScaledVector(m?tmp.copy(vn).applyMatrix3(normalTransforms.get(id)):vn,weight);if(tangent)sumT.addScaledVector(m?tmp.copy(vt).transformDirection(m):vt,weight)
 }
 if(!changed){untouched++;continue}affected++;sum.toArray(positions,i*3);sumN.normalize().toArray(normals,i*3);if(tangent){sumT.addScaledVector(sumN,-sumT.dot(sumN)).normalize();sumT.toArray(tangents,i*4)}
}
asset.scene.updateMatrixWorld(true)
let length=binary.length;const chunks=[binary],append=data=>{const padding=(4-length%4)%4;if(padding){chunks.push(Buffer.alloc(padding));length+=padding}const view=doc.bufferViews.length,b=Buffer.from(data.buffer,data.byteOffset,data.byteLength);doc.bufferViews.push({buffer:0,byteOffset:length,byteLength:b.length});chunks.push(b);length+=b.length;return view}
function replaceAccessor(id,array){doc.accessors[id]={...doc.accessors[id],bufferView:append(array),byteOffset:0};delete doc.accessors[id].min;delete doc.accessors[id].max;if(id===doc.meshes[0].primitives[0].attributes.POSITION){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<array.length;i++) {const k=i%3;min[k]=Math.min(min[k],array[i]);max[k]=Math.max(max[k],array[i])}doc.accessors[id].min=min;doc.accessors[id].max=max}}
const primitive=doc.meshes[0].primitives[0];replaceAccessor(primitive.attributes.POSITION,positions);replaceAccessor(primitive.attributes.NORMAL,normals);if(tangents)replaceAccessor(primitive.attributes.TANGENT,tangents)
const inverse=new Float32Array(bones.length*16);bones.forEach((b,i)=>new Matrix4().copy(b.matrixWorld).invert().toArray(inverse,i*16));replaceAccessor(doc.skins[0].inverseBindMatrices,inverse)
// Existing walking clips keep the corrected segment lengths as well.
const changedNodes=new Set(changes.map(c=>doc.nodes.findIndex(n=>n.name?.replace(/:/g,'')===c.name))),changedAccessors=new Set()
for(const clip of doc.animations||[])for(const channel of clip.channels)if(channel.target.path==='translation'&&changedNodes.has(channel.target.node)){
 const id=clip.samplers[channel.sampler].output;if(changedAccessors.has(id))continue;changedAccessors.add(id);const a=doc.accessors[id],view=doc.bufferViews[a.bufferView],values=new Float32Array(a.count*3),data=new DataView(binary.buffer,binary.byteOffset,binary.byteLength)
 for(let i=0;i<values.length;i++)values[i]=data.getFloat32((view.byteOffset||0)+(a.byteOffset||0)+i*4,true)*factor;replaceAccessor(id,values)
}
doc.asset.extras={...doc.asset.extras,armCorrection:{lengthFactor:factor,radialFactor:radial,sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex')}};doc.buffers=[{byteLength:length}]
const json=Buffer.from(JSON.stringify(doc)),jc=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(jc);let bin=Buffer.concat(chunks);if(bin.length%4)bin=Buffer.concat([bin,Buffer.alloc(4-bin.length%4)]);const header=Buffer.alloc(20),bh=Buffer.alloc(8);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jc.length+bin.length,8);header.writeUInt32LE(jc.length,12);header.writeUInt32LE(0x4e4f534a,16);bh.writeUInt32LE(bin.length,0);bh.writeUInt32LE(0x004e4942,4);fs.writeFileSync(output,Buffer.concat([header,jc,bh,bin]))
const report={source,output,lengthFactor:factor,radialFactor:radial,changes,affected,untouched,weightsPreserved:true,materialsAndImagesPreserved:true,sourceSha256:doc.asset.extras.armCorrection.sourceSha256};fs.mkdirSync('artifacts/rand',{recursive:true});fs.writeFileSync('artifacts/rand/arm-correction.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
