// Refresh authored destinations using the existing GLB/ID manifest. This does
// not re-import Motorcycle geometry or undo its approved headlight openings.
import fs from 'node:fs'
import crypto from 'node:crypto'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {fitPieceTransform,frontGeometryKey} from '../src/vehicle/frontTransformMath.js'
import {attachFrontMotionGroups} from './front-motion-groups.mjs'

const output='public/transformations/cyclone-front-battloid.json',data=JSON.parse(fs.readFileSync(output)),before=structuredClone(data)
const sourcePath=data.motionHierarchySources[0].path,targetPath='assets/scott-cyclone/armor/vr052-cyclone-1rst-attempt · test-soldar -armor.json'
const sourceBytes=fs.readFileSync(sourcePath),targetBytes=fs.readFileSync(targetPath),source=JSON.parse(sourceBytes),target=JSON.parse(targetBytes)
const originals=new Map(source.pieces.map(p=>[p.id,p])),destinations=new Map(target.pieces.map(p=>[p.id,p])),issues=[]
const hidden=piece=>{while(piece){if(piece.hidden)return true;piece=target.groups.find(g=>g.id===piece.parentId)}return false}
data.pieces=before.pieces.map(previous=>{
  const from=originals.get(previous.id),to=destinations.get(previous.id)
  if(!from)throw Error(`Falta ID original ${previous.id}`)
  if(!to)return{id:previous.id,name:from.name,absent:true}
  const cutIds=(source.cuts||[]).filter(c=>c.receiverId===from.id).map(c=>c.id+':')
  const authored=p=>({...p,vertices:p.vertices.filter(v=>!cutIds.some(prefix=>v.id.startsWith(prefix)))})
  const fit=fitPieceTransform(authored(from),authored(to))
  const common=from.vertices.filter(v=>to.vertices.some(w=>w.id===v.id))
  const detailError=Math.max(0,...common.map(v=>new T.Vector3(...v.point).applyMatrix4(fit.matrix).distanceTo(new T.Vector3(...to.vertices.find(w=>w.id===v.id).point))))
  if(detailError>1e-5)issues.push({kind:'reevaluated-cut-detail',id:from.id,name:from.name,maxDetailDifference:detailError,reason:'El corte interno cambió en el JSON final; se conserva la geometría original y se mueve por los vértices de contorno.'})
  const checkpoints=authored(from).vertices.filter(v=>to.vertices.some(w=>w.id===v.id)).slice(0,3).map(v=>({id:v.id,source:v.point,target:to.vertices.find(w=>w.id===v.id).point}))
  return{id:from.id,name:from.name,matrix:fit.matrix.toArray(),error:fit.error,detailError,vertices:fit.commonVertices,hidden:hidden(to),checkpoints}
})
const pieces=new Map(data.pieces.map(p=>[p.id,p]))
data.records=before.records.map(r=>{
  const members=r.pieceIds.map(id=>pieces.get(id))
  if(members.some(p=>!p))throw Error('Falta correspondencia de superficie '+r.key)
  const record={...r};delete record.absent;delete record.delta;delete record.motionGroupId;delete record.sequenceRole
  if(members.every(p=>p.absent))return{...record,absent:true,visible:false}
  if(members.some(p=>p.absent))throw Error('La superficie mezcla piezas ausentes y presentes: '+r.key)
  if(members.some(p=>p.matrix.some((v,i)=>Math.abs(v-members[0].matrix[i])>1e-5)))throw Error('La superficie mezcla destinos incompatibles: '+r.key)
  return{...record,delta:members[0].matrix,visible:!members.every(p=>p.hidden)}
})
const pose=target.referenceTransform
if(!pose||!target.referenceFrame)throw Error('Falta la referencia de Scott')
data.referenceTransform=new T.Matrix4().compose(new T.Vector3(...pose.position),new T.Quaternion().setFromEuler(new T.Euler(...pose.rotation.map(v=>v*Math.PI/180))),new T.Vector3(...pose.scale)).toArray()
data.referenceFrame=target.referenceFrame;data.issues=issues
const stamp=(path,bytes)=>({path,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')})
data.sourceFiles=data.sourceFiles.map(s=>s.path===targetPath?stamp(targetPath,targetBytes):s)
data.motionHierarchySources=[stamp(sourcePath,sourceBytes),stamp(targetPath,targetBytes)]
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const bytes=fs.readFileSync('public/models/mospeada/cyclone-vr052f.glb'),gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'')
const meshes=new Map();gltf.scene.traverse(n=>{if(n.isMesh)meshes.set(frontGeometryKey(n),n)})
attachFrontMotionGroups(data,source,target,meshes)
for(const r of data.records)if(!meshes.has(r.key))throw Error('Falta superficie original: '+r.key)
const changed=data.pieces.filter(p=>{const old=before.pieces.find(o=>o.id===p.id);return p.hidden!==old.hidden||p.absent!==old.absent||p.matrix?.some((v,i)=>Math.abs(v-old.matrix?.[i])>1e-7)})
const report={surfaces:data.records.length,changed:changed.map(p=>({id:p.id,name:p.name,hidden:p.hidden,absent:p.absent})),visible:data.records.filter(r=>r.visible).length,issues,sourceFiles:data.motionHierarchySources,glbSHA256:crypto.createHash('sha256').update(bytes).digest('hex')}
fs.mkdirSync('artifacts/front-battloid',{recursive:true})
fs.writeFileSync(output,JSON.stringify(data)+'\n');fs.writeFileSync('artifacts/front-battloid/latest-update.json',JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report,null,2))
