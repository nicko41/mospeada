// Import only the requested display/visor and two suspension assemblies.
// Original documents and GLBs are read-only; baked vertex edits are applied once.
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {fitPieceTransform,frontGeometryKey} from '../src/vehicle/frontTransformMath.js'

const name='vr052-cyclone-1rst-attempt · test-soldar -armor · suspension-hide.json'
const input='C:/IT-UP/3D-LAB/assets/mospeada/assembly json/ARMOR MODE/'+name
const copy='assets/scott-cyclone/armor/'+name,bytes=fs.readFileSync(input),target=JSON.parse(bytes)
const frontPath='public/transformations/cyclone-front-battloid.json',front=JSON.parse(fs.readFileSync(frontPath)),before=structuredClone(front)
const source=JSON.parse(fs.readFileSync(front.motionHierarchySources[0].path))
const parents=new Map(target.groups.map(g=>[g.id,g.parentId]))
const members=id=>target.pieces.filter(p=>{let g=p.parentId;while(g){if(g===id)return true;g=parents.get(g)}return false})
const sourcePieces=new Map(source.pieces.map(p=>[p.id,p]))
const pose=target.referenceTransform
if(!pose||!target.referenceFrame)throw Error('Falta la alineación de Scott')
const reference=new T.Matrix4().compose(new T.Vector3(...pose.position),new T.Quaternion().setFromEuler(new T.Euler(...pose.rotation.map(v=>v*Math.PI/180))),new T.Vector3(...pose.scale))
const modelFromEditor=reference.clone().invert(),B=new T.Matrix4().fromArray(front.importMatrix)
const intoExistingReference=new T.Matrix4().fromArray(front.referenceTransform).multiply(modelFromEditor)
const glassGroup=target.groups.find(g=>g.name==='vidrio orange-display')
if(!glassGroup)throw Error('Falta el grupo persistente vidrio orange-display')
const display=target.pieces.find(p=>p.id==='340e885e-c8ea-4f4f-9b92-2eef7a23add9')
const selected=[...members(glassGroup.id),display]
if(selected.some(p=>!p))throw Error('Falta el display')
const ids=new Set(selected.map(p=>p.id)),tank=front.motionGroups.find(g=>g.role==='tank')
if(!tank)throw Error('Falta el conjunto del tanque')
for(const to of selected){
  const from=sourcePieces.get(to.id),previous=front.pieces.find(p=>p.id===to.id)
  if(!from||!previous)throw Error('Falta correspondencia del visor/display '+to.id)
  const fit=fitPieceTransform(from,to),delta=intoExistingReference.clone().multiply(fit.matrix)
  Object.assign(previous,{matrix:delta.toArray(),hidden:false,error:fit.error,motionGroupId:tank.id,sourcePivot:from.objectPose?.position||from.vertices[0].point,checkpoints:from.vertices.filter(v=>to.vertices.some(w=>w.id===v.id)).slice(0,3).map(v=>({id:v.id,source:v.point,target:new T.Vector3(...to.vertices.find(w=>w.id===v.id).point).applyMatrix4(intoExistingReference).toArray()}))})
}
for(const record of front.records){
  if(!record.pieceIds.some(id=>ids.has(id)))continue
  if(!record.pieceIds.every(id=>ids.has(id)))throw Error('Una malla mezcla el visor y otra pieza')
  const p=front.pieces.find(p=>p.id===record.pieceIds[0])
  record.delta=p.matrix;record.visible=true;record.motionGroupId=tank.id
}
tank.pieceIds=[...new Set([...tank.pieceIds,...ids])]

// Authored nonuniform reduction can be an affine map (shear relative to the
// original fork axes). Preserve that exact map instead of discarding it by
// decomposing into TRS, and check EVERY persistent vertex.
function affine(from,to){
  const lookup=new Map(to.vertices.map(v=>[v.id,new T.Vector3(...v.point)]))
  const pairs=from.vertices.filter(v=>lookup.has(v.id)).map(v=>[new T.Vector3(...v.point),lookup.get(v.id)])
  if(pairs.length<4)throw Error('Faltan vértices de la suspensión')
  const o=pairs[0],best=f=>pairs.reduce((a,b)=>f(a)>f(b)?a:b)
  const x=best(v=>v[0].distanceToSquared(o[0])),axis=x[0].clone().sub(o[0])
  const y=best(v=>new T.Vector3().crossVectors(axis,v[0].clone().sub(o[0])).lengthSq())
  const normal=new T.Vector3().crossVectors(axis,y[0].clone().sub(o[0]))
  const z=best(v=>Math.abs(v[0].clone().sub(o[0]).dot(normal)))
  const basis=i=>new T.Matrix4().makeBasis(x[i].clone().sub(o[i]),y[i].clone().sub(o[i]),z[i].clone().sub(o[i])).setPosition(o[i])
  if(Math.abs(basis(0).determinant())<1e-12)throw Error('Suspensión sin volumen identificable')
  const matrix=basis(1).multiply(basis(0).invert())
  const error=Math.max(...pairs.map(([a,b])=>a.clone().applyMatrix4(matrix).distanceTo(b)))
  if(error>1e-6)throw Error('La geometría de la suspensión cambió de forma no afín: '+error)
  return{matrix,error}
}
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const glb=fs.readFileSync('public/models/mospeada/cyclone-vr052f.glb'),bike=await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset,glb.byteOffset+glb.length),'')
const meshes=[];bike.scene.traverse(m=>{if(m.isMesh)meshes.push(m)})
const groups=[]
for(const side of['Left','Right']){
  const group=target.groups.find(g=>g.name==='Suspension_'+side)
  if(!group)throw Error('Falta Suspension_'+side)
  const records=members(group.id).map(to=>{
    const from=sourcePieces.get(to.id),matches=meshes.filter(m=>m.userData.sourcePiece===from?.name&&m.userData.assembly==='Suspensión '+side)
    if(matches.length!==1)throw Error('Correspondencia ambigua de suspensión '+to.id)
    const {matrix,error}=affine(from,to)
    const checkpoints=from.vertices.filter(v=>to.vertices.some(w=>w.id===v.id)).filter((_,i)=>i%17===0).map(v=>({id:v.id,source:new T.Vector3(...v.point).applyMatrix4(B).toArray(),target:new T.Vector3(...to.vertices.find(w=>w.id===v.id).point).applyMatrix4(modelFromEditor).toArray()}))
    return{id:to.id,name:to.name,key:frontGeometryKey(matches[0]),targetInModel:modelFromEditor.clone().multiply(matrix).multiply(B.clone().invert()).toArray(),error,checkpoints}
  })
  if(records.length!==13)throw Error('Suspensión incompleta')
  const sourceGroup=source.groups.find(g=>g.id===group.id)
  const rootOf=id=>{let g=source.groups.find(g=>g.id===id);while(g?.parentId)g=source.groups.find(p=>p.id===g.parentId);return g?.id}
  const carriers=source.groups.filter(g=>g.name==='CHEST-left'&&rootOf(g.id)===rootOf(sourceGroup.id))
  if(carriers.length!==1)throw Error('No se identifica CHEST de '+side)
  groups.push({id:group.id,side,bone:'mixamorig'+side+'ForeArm',carrierId:carriers[0].id,records})
}
const stamp={path:copy,sha256:createHash('sha256').update(bytes).digest('hex')}
const data={version:1,referenceTransform:reference.toArray(),groups,timing:{start:.22,stowStart:.42,shrinkStart:.46,end:.48},sourceFile:stamp}
front.tankAccessoryUpdate={...stamp,pieceIds:[...ids]}
// Refuse accidental edits to any unrelated front record.
for(const record of front.records.filter(r=>!r.pieceIds.some(id=>ids.has(id)))){
  if(JSON.stringify(record)!==JSON.stringify(before.records.find(r=>r.key===record.key)))throw Error('Cambió una pieza fuera del alcance')
}
fs.writeFileSync(copy,bytes)
fs.writeFileSync(frontPath,JSON.stringify(front)+'\n')
fs.writeFileSync('public/transformations/cyclone-suspension-hide.json',JSON.stringify(data)+'\n')
fs.mkdirSync('artifacts/suspension-hide',{recursive:true})
const report={sourceFile:stamp,tankAccessoryPieces:ids.size,suspensions:groups.map(g=>({side:g.side,pieces:g.records.length,maxVertexError:Math.max(...g.records.map(r=>r.error))})),unrelatedFrontRecordsUnchanged:true,glbSHA256:createHash('sha256').update(glb).digest('hex')}
fs.writeFileSync('artifacts/suspension-hide/import-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
