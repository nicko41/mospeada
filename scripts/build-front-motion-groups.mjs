// Add choreography frames to the shipped transform without re-exporting a GLB
// or silently replacing any authored destination or source geometry.
import fs from 'node:fs'
import crypto from 'node:crypto'
import { attachFrontMotionGroups } from './front-motion-groups.mjs'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { frontGeometryKey } from '../src/vehicle/frontTransformMath.js'

const path='public/transformations/cyclone-front-battloid.json',data=JSON.parse(fs.readFileSync(path))
const sourcePath='C:/IT-UP/3D-LAB/assets/mospeada/assembly json/material-studio/vr052-cyclone-1rst-attempt · test-soldar.json'
const targetPath=data.sourceFiles.find(s=>s.path.includes('armor')&&s.path.endsWith('.json')).path
const source=fs.readFileSync(sourcePath),target=fs.readFileSync(targetPath)
const before=JSON.stringify(data.records.map(r=>({key:r.key,delta:r.delta,visible:r.visible})))
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const bytes=fs.readFileSync('public/models/mospeada/cyclone-vr052f.glb')
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
const meshes=new Map();gltf.scene.traverse(n=>{if(n.isMesh)meshes.set(frontGeometryKey(n),n)})
attachFrontMotionGroups(data,JSON.parse(source),JSON.parse(target),meshes)
if(JSON.stringify(data.records.map(r=>({key:r.key,delta:r.delta,visible:r.visible})))!==before)throw Error('Cambió un extremo de la transformación')
data.motionHierarchySources=[{path:sourcePath,sha256:crypto.createHash('sha256').update(source).digest('hex')},{path:targetPath,sha256:crypto.createHash('sha256').update(target).digest('hex')}]
fs.writeFileSync(path,JSON.stringify(data)+'\n')
console.log(JSON.stringify({groups:data.motionGroups.map(g=>({id:g.id,name:g.name,members:g.pieceIds.length})),groupedSurfaces:data.records.filter(r=>r.motionGroupId).length,endpointsPreserved:true},null,2))
