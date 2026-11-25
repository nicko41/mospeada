import fs from 'node:fs'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {clone} from 'three/addons/utils/SkeletonUtils.js'
import {createDrivingCyclone} from '../src/vehicle/createDrivingCyclone.js'
import {createBikeState} from '../src/vehicle/bikePhysics.js'
import {bikeConfig} from '../src/vehicle/bikeConfig.js'
import {createRelaxedScottHands} from '../src/vehicle/relaxedScottHands.js'
import {parseCycloneScottActions} from '../src/vehicle/cycloneScottActions.js'
import {updateScottGameplay} from '../src/vehicle/scottGameplay.js'
import {readGlb,writeGlb} from './glb-data.mjs'
import {createScottRidingPose} from '../src/vehicle/ScottAirSquatRidingPose.js'
import {registerRideSurfaces} from '../src/vehicle/rideSurface.js'
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const floor=new T.Mesh(new T.PlaneGeometry(40,40).rotateX(-Math.PI/2),new T.MeshBasicMaterial());floor.userData.rideSurface=true;floor.updateMatrixWorld(true);registerRideSurfaces(floor)
async function load(path){const g=readGlb(path),asset=await new GLTFLoader().parseAsync(g.bytes.buffer.slice(g.bytes.byteOffset,g.bytes.byteOffset+g.bytes.length),'');return{g,asset}}
export async function ridingFixture({modelPath='public/models/mospeada/scott-bernard-gear-v2-animated.glb',fit=true,ridingVariant}={}){
 const[scott,reference,bike]=await Promise.all([load(modelPath),load('public/models/mospeada/scott-bernard-animated-original.glb'),load('public/models/mospeada/cyclone-vr052f.glb')]),model=clone(scott.asset.scene),wrapper=new T.Group(),bones=new Map(),skins=[],hands=[],rig=createDrivingCyclone(clone(bike.asset.scene));wrapper.add(model)
 model.traverse(n=>{if(n.isBone)bones.set(n.name,n);if(n.isSkinnedMesh){skins.push({mesh:n});const h=createRelaxedScottHands(n);if(h)hands.push(h)}})
 const authored={data:JSON.parse(fs.readFileSync('public/animations/scott-cyclone-actions.json'))};authored.clips=parseCycloneScottActions(authored.data)
 const instance={model,sourceScene:reference.asset.scene,sourceClips:reference.asset.animations,bones,skins,hands,mixer:new T.AnimationMixer(model),clip:null},s=createBikeState({x:0,z:0,yaw:0},rig.metrics,()=>0),runtime={state:s,vehicleRig:rig,scottBikeBody:rig.body,scottInstance:instance,paused:false,keys:{}}
 if(fit)instance.v2RidingPose=createScottRidingPose(instance,authored.data,ridingVariant)
 const clips=[...scott.asset.animations,...authored.clips]
 const step=(count=1)=>{for(let i=0;i<count;i++){rig.update(s,()=>0,bikeConfig);updateScottGameplay(instance,authored,clips,runtime,wrapper,1/60);wrapper.updateMatrixWorld(true);skins.forEach(({mesh})=>mesh.skeleton.update())}}
 return{scott,reference,bike,instance,wrapper,bones,skins,hands,rig,s,runtime,authored,clips,step,fit}
}
export function measureRiding(f){
 const body=f.rig.body,local=bone=>body.worldToLocal(bone.getWorldPosition(new T.Vector3())).toArray(),ref=f.reference.asset.scene;ref.updateMatrixWorld(true)
 const direction=name=>{const q=f.bones.get('mixamorig'+name).getWorldQuaternion(new T.Quaternion()).multiply(ref.getObjectByName('mixamorig'+name).getWorldQuaternion(new T.Quaternion()).invert());return new T.Vector3(0,0,1).applyQuaternion(q).applyQuaternion(body.getWorldQuaternion(new T.Quaternion()).invert()).toArray()}
 return{diagnostics:f.instance.mountedMotion.diagnostics,fit:f.instance.v2RidingPose?.diagnostics,hips:local(f.bones.get('mixamorigHips')),headForward:direction('Head'),chestForward:direction('Spine2'),joints:Object.fromEntries(['Left','Right'].map(side=>[side,Object.fromEntries(['Shoulder','Arm','ForeArm','Hand','UpLeg','Leg','Foot'].map(n=>[n,local(f.bones.get('mixamorig'+side+n))]))])),seat:f.authored.data.measuredTargets.seat,grips:f.authored.data.measuredTargets.grips}
}
// Bake the exact native pose (including the existing glove morphs and current
// bike articulation) for offline visual QA. Images/materials are copied intact.
export function writeRidingScene(f,file){
 const doc={asset:{version:'2.0',generator:'MOSPEADA native riding-pose inspection'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[],textures:[],images:[],samplers:[],accessors:[],bufferViews:[],buffers:[]},chunks=[];let length=0
 function bytes(data){const pad=(-length)&3;if(pad){chunks.push(Buffer.alloc(pad));length+=pad}const off=length;chunks.push(data);length+=data.length;return off}
 function view(data,target){const i=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:bytes(data),byteLength:data.length,...(target?{target}:{})});return i}
 function attr(array,type,componentType,target){const dim={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[type],i=doc.accessors.length,a={bufferView:view(Buffer.from(array.buffer,array.byteOffset,array.byteLength),target),componentType,count:array.length/dim,type};if(type==='VEC3'){a.min=[Infinity,Infinity,Infinity];a.max=[-Infinity,-Infinity,-Infinity];for(let j=0;j<array.length;j++){a.min[j%3]=Math.min(a.min[j%3],array[j]);a.max[j%3]=Math.max(a.max[j%3],array[j])}}doc.accessors.push(a);return i}
 const materials=new Map(),textures=new Map(),images=new Map()
 function copyImage(source,i){const key=source.g.bytes.length+':'+i;if(images.has(key))return images.get(key);const image=source.g.doc.images[i],v=source.g.doc.bufferViews[image.bufferView],result=doc.images.length;doc.images.push({...image,bufferView:view(source.g.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength))});images.set(key,result);return result}
 function copyTexture(source,i){const key=source.g.bytes.length+':'+i;if(textures.has(key))return textures.get(key);const texture=source.g.doc.textures[i],out={...texture,source:copyImage(source,texture.source)};if(texture.sampler!==undefined){out.sampler=doc.samplers.length;doc.samplers.push(structuredClone(source.g.doc.samplers[texture.sampler]))}const result=doc.textures.length;doc.textures.push(out);textures.set(key,result);return result}
 function copyMaterial(source,material,index){const key=source.g.bytes.length+':'+(index??material.uuid);if(materials.has(key))return materials.get(key);let out=index===undefined?{name:material.name||'Native material',pbrMetallicRoughness:{baseColorFactor:[material.color?.r??.5,material.color?.g??.5,material.color?.b??.5,1],roughnessFactor:material.roughness??.7,metallicFactor:material.metalness??0},doubleSided:material.side===T.DoubleSide}:structuredClone(source.g.doc.materials[index]);function remap(v){for(const[k,x]of Object.entries(v||{})){if(k.endsWith('Texture')&&x?.index!==undefined)x.index=copyTexture(source,x.index);else if(x&&typeof x==='object')remap(x)}}remap(out);const result=doc.materials.length;doc.materials.push(out);materials.set(key,result);return result}
 function add(mesh,source,materialIndex){
  mesh.updateWorldMatrix(true,false);mesh.skeleton?.update();const g=mesh.geometry,indices=g.index?Array.from(g.index.array):Array.from({length:g.attributes.position.count},(_,i)=>i),ids=[...new Set(indices)],map=new Map(ids.map((id,i)=>[id,i])),positions=new Float32Array(ids.length*3),normals=new Float32Array(ids.length*3),uv=new Float32Array(ids.length*2),p=new T.Vector3(),n=new T.Vector3(),worldNormal=new T.Matrix3().getNormalMatrix(mesh.matrixWorld),jointMatrices=mesh.skeleton?.boneInverses.map((_,i)=>new T.Matrix4().fromArray(mesh.skeleton.boneMatrices,i*16).multiply(mesh.bindMatrix).premultiply(mesh.bindMatrixInverse))
  for(let i=0;i<ids.length;i++){const id=ids[i];mesh.getVertexPosition(id,p).applyMatrix4(mesh.matrixWorld).toArray(positions,i*3);n.fromBufferAttribute(g.attributes.normal,id)
   for(let k=0;k<(mesh.morphTargetInfluences?.length||0);k++)if(mesh.morphTargetInfluences[k]&&g.morphAttributes.normal?.[k])n.addScaledVector(new T.Vector3().fromBufferAttribute(g.morphAttributes.normal[k],id),mesh.morphTargetInfluences[k])
   if(jointMatrices){const result=new T.Vector3();for(let k=0;k<4;k++){const weight=g.attributes.skinWeight.getComponent(id,k);if(!weight)continue;const m=jointMatrices[g.attributes.skinIndex.getComponent(id,k)].elements;result.x+=weight*(m[0]*n.x+m[4]*n.y+m[8]*n.z);result.y+=weight*(m[1]*n.x+m[5]*n.y+m[9]*n.z);result.z+=weight*(m[2]*n.x+m[6]*n.y+m[10]*n.z)}n.copy(result)}
   n.applyMatrix3(worldNormal).normalize().toArray(normals,i*3);if(g.attributes.uv){uv[i*2]=g.attributes.uv.getX(id);uv[i*2+1]=g.attributes.uv.getY(id)}
  }
  const material=Array.isArray(mesh.material)?mesh.material[0]:mesh.material,index=materialIndex??source.asset.parser.associations.get(material)?.materials??source.g.doc.materials.findIndex(m=>m.name===material.name),primitive={attributes:{POSITION:attr(positions,'VEC3',5126,34962),NORMAL:attr(normals,'VEC3',5126,34962),TEXCOORD_0:attr(uv,'VEC2',5126,34962)},indices:attr(new Uint32Array(indices.map(i=>map.get(i))),'SCALAR',5125,34963),material:copyMaterial(source,material,index<0?undefined:index),mode:4};if(g.attributes.color){const a=g.attributes.color,c=new Float32Array(ids.length*a.itemSize);ids.forEach((id,i)=>{for(let k=0;k<a.itemSize;k++)c[i*a.itemSize+k]=a.getComponent(id,k)});primitive.attributes.COLOR_0=attr(c,a.itemSize===4?'VEC4':'VEC3',5126,34962)}const mi=doc.meshes.length;doc.meshes.push({name:mesh.name,primitives:[primitive]});doc.scenes[0].nodes.push(doc.nodes.length);doc.nodes.push({name:mesh.name,mesh:mi})
 }
 f.skins.forEach(({mesh})=>add(mesh,f.scott,f.scott.g.doc.meshes[0].primitives[0].material));for(const mesh of f.extraMeshes||[])if(mesh.visible)add(mesh,f.scott,f.scott.g.doc.meshes[0].primitives[0].material);f.rig.root.traverse(n=>{if(!n.isMesh)return;let p=n;while(p){if(!p.visible)return;p=p.parent}add(n,f.bike)})
 doc.buffers=[{byteLength:length}];writeGlb(file,doc,Buffer.concat(chunks))
}
