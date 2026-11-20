// Read-only 3D LAB import. Produces independent transform data, never a GLB.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { fitPieceTransform, frontGeometryKey } from '../src/vehicle/frontTransformMath.js'
import { attachFrontMotionGroups } from './front-motion-groups.mjs'

const lab = path.resolve(process.argv[2] || 'C:/IT-UP/3D-LAB'), requireLab = createRequire(path.join(lab, 'package.json'))
const ts = requireLab('typescript'), sharp = requireLab('sharp'), engine = path.resolve('.local/front-transform-engine')
fs.mkdirSync(engine, { recursive:true })
const compiled = new Set()
function compile(name) {
  if (compiled.has(name)) return
  compiled.add(name)
  let code = ts.transpileModule(fs.readFileSync(path.join(lab,'src/components/mospeada/rotoscopy',name+'.ts'),'utf8'), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
  if (name === 'externalMeshes') code = code
    .replace('mesh.userData.sourcePiece = p.pieces.find(v => v.id === op.pieceId)?.name;', 'mesh.userData.sourcePieceIds=[op.pieceId];mesh.userData.sourceOperationId=op.id;mesh.userData.sourcePiece = p.pieces.find(v => v.id === op.pieceId)?.name;')
    .replace('mesh.userData.sourcePieces = op.faces.map', 'mesh.userData.sourcePieceIds=[...new Set(op.faces.map(f=>f.pieceId))];mesh.userData.sourceOperationId=op.id;mesh.userData.sourcePieces = op.faces.map')
  code = code.replace(/from (['"])([^.'"][^'"]*)\1/g, (match,q,dep) => dep==='three'||dep.startsWith('three/') ? match : `from ${q}${pathToFileURL(requireLab.resolve(dep)).href}${q}`)
  code = code.replace(/(['"])\.\/([^'"\n]+)\1/g, (_,q,dep) => {compile(dep);return `${q}./${dep}.mjs${q}`})
  fs.writeFileSync(path.join(engine,name+'.mjs'),code)
}
compile('externalMeshes')
globalThis.self = globalThis
globalThis.createImageBitmap = async () => ({ width:1, height:1, close(){} })
T.TextureLoader.prototype.loadAsync = async url => {
  const {data,info} = await sharp(Buffer.from(url.split(',')[1],'base64')).ensureAlpha().raw().toBuffer({resolveWithObject:true})
  return new T.DataTexture(new Uint8Array(data),info.width,info.height)
}
const sources = new Map()
function read(p) {
  const bytes = fs.readFileSync(p)
  sources.set(p,{path:p,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')})
  return bytes
}
const assemblyPath = path.join(lab,'assets/mospeada/assembly json/cyclone-material-assembly.json')
const assembly = JSON.parse(read(assemblyPath)), front = assembly.externals.find(e=>e.id==='5a7e5d82-5b2c-470d-aeb7-5c0155ab98dd')
if (!front) throw Error('Falta el ID original del conjunto front')
const original = JSON.parse(read(path.join(lab,front.path)))
const targetPath = 'assets/scott-cyclone/armor/vr052-cyclone-1rst-attempt · test-soldar -armor.json', target = JSON.parse(read(targetPath))
const glbPath='public/models/mospeada/cyclone-vr052f.glb', bytes=read(glbPath)
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
const actual = new Map()
gltf.scene.traverse(mesh=>{if(mesh.isMesh&&mesh.userData.assembly===front.name){const key=frontGeometryKey(mesh);if(actual.has(key))throw Error('Identidad de malla ambigua: '+key);actual.set(key,mesh)}})
const realFetch = globalThis.fetch
globalThis.fetch = async url => {
  const u=new URL(url,'http://localhost')
  if(u.pathname==='/api/3d-lab/projects')return new Response(read(path.join(lab,u.searchParams.get('path'))))
  return realFetch(url)
}
const {buildExternalAssembly}=await import(pathToFileURL(path.join(engine,'externalMeshes.mjs')))
const {externalMatrix}=await import(pathToFileURL(path.join(engine,'assemblySchema.mjs')))
const built=await buildExternalAssembly([front]), importMatrix=new T.Matrix4().makeRotationY(Math.PI/2).scale(new T.Vector3(1.3,1.3,1.3))
const targets=new Map(target.pieces.map(p=>[p.id,p])), originals=new Map(original.pieces.map(p=>[p.id,p])), motions=new Map(), issues=[]
const hidden = p => {let g=p;while(g){if(g.hidden)return true;g=target.groups?.find(x=>x.id===g.parentId)}return false}
const sourceRecords=[]
built.root.updateMatrixWorld(true)
built.root.traverse(n=>{
  if(!n.isMesh||!n.geometry.attributes.position?.count)return
  let ancestor=n,ids=n.userData.sourcePieceIds,sourcePiece,visible=true
  while(ancestor){visible&&=ancestor.visible;sourcePiece??=ancestor.userData.sourcePiece||ancestor.userData.sourcePieces?.join(' + ');ids??=originals.has(ancestor.userData.piece)?[ancestor.userData.piece]:originals.has(ancestor.userData.id)?[ancestor.userData.id]:undefined;ancestor=ancestor.parent}
  if(!visible)return
  const geometry=n.geometry.clone().applyMatrix4(importMatrix.clone().multiply(n.matrixWorld))
  const key=frontGeometryKey({geometry,userData:{assembly:front.name,sourcePiece:sourcePiece||n.name}});geometry.dispose()
  if(!actual.has(key)){issues.push({kind:'unmatched-source-mesh',key,ids});return}
  if(!ids?.length){issues.push({kind:'missing-source-id',key});return}
  sourceRecords.push({key,pieceIds:ids,operationId:n.userData.sourceOperationId})
})
for(const record of sourceRecords)for(const id of record.pieceIds){
  if(motions.has(id))continue
  const from=originals.get(id),to=targets.get(id)
  if(!to){motions.set(id,{id,name:from?.name,absent:true});continue}
  try{
    // Cut intersection nodes are rebuilt by 3D LAB, rather than moved as part
    // of the plate. Use authored corners for its motion and report the detail.
    const cutIds=(original.cuts||[]).filter(c=>c.receiverId===id).map(c=>c.id+':')
    const authored=p=>({...p,vertices:p.vertices.filter(v=>!cutIds.some(prefix=>v.id.startsWith(prefix)))})
    const fit=fitPieceTransform(authored(from),authored(to))
    const allErrors=from.vertices.filter(v=>to.vertices.some(w=>w.id===v.id)).map(v=>new T.Vector3(...v.point).applyMatrix4(fit.matrix).distanceTo(new T.Vector3(...to.vertices.find(w=>w.id===v.id).point)))
    const detailError=Math.max(0,...allErrors)
    if(detailError>1e-5)issues.push({kind:'reevaluated-cut-detail',id,name:from.name,maxDetailDifference:detailError,reason:'El corte interno cambió en el JSON final; se conserva la geometría original y se mueve por los vértices de contorno.'})
    const checkpoints=authored(from).vertices.filter(v=>to.vertices.some(w=>w.id===v.id)).slice(0,3).map(v=>({id:v.id,source:v.point,target:to.vertices.find(w=>w.id===v.id).point}))
    motions.set(id,{id,name:from.name,matrix:fit.matrix.toArray(),error:fit.error,detailError,vertices:fit.commonVertices,hidden:hidden(to),checkpoints})
  }
  catch(e){motions.set(id,{id,name:from?.name,error:e.message,unsupported:true});issues.push({kind:'unsupported-piece',id,name:from?.name,reason:e.message})}
}
const records=[]
for(const source of sourceRecords){
  const pieces=source.pieceIds.map(id=>motions.get(id))
  if(pieces.some(p=>p.unsupported))continue
  if(pieces.every(p=>p.absent)){records.push({...source,absent:true,visible:false});continue}
  if(pieces.some(p=>p.absent)){issues.push({kind:'mixed-absence',...source});continue}
  const first=pieces[0],same=pieces.every(p=>p.matrix.every((v,i)=>Math.abs(v-first.matrix[i])<1e-5))
  if(!same){issues.push({kind:'modifier-spans-different-motions',...source});continue}
  records.push({...source,delta:first.matrix,visible:!pieces.every(p=>p.hidden)})
}
function glbDocument(p){const b=read(p);return JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)))}
function bindFrame(doc,name){
  const i=doc.nodes.findIndex(n=>n.name===name);if(i<0)throw Error('Falta hueso de referencia '+name)
  const world=id=>{const n=doc.nodes[id],local=n.matrix?new T.Matrix4().fromArray(n.matrix):new T.Matrix4().compose(new T.Vector3(...n.translation||[0,0,0]),new T.Quaternion(...n.rotation||[0,0,0,1]),new T.Vector3(...n.scale||[1,1,1]));const parent=doc.nodes.findIndex(p=>p.children?.includes(id));return parent<0?local:world(parent).multiply(local)}
  return world(i)
}
const referencePath='assets/scott-bernard-animated-corrected.glb', reference=glbDocument(referencePath), originalScott=glbDocument('public/models/mospeada/scott-bernard-animated-original.glb')
const referenceBind=bindFrame(reference,'mixamorig:Spine2'), runtimeBind=bindFrame(originalScott,'mixamorig:Spine2')
const bindDifference=Math.max(...referenceBind.elements.map((v,i)=>Math.abs(v-runtimeBind.elements[i])))
if(bindDifference>1e-5)throw Error('El torso del Scott de referencia no coincide con el original: '+bindDifference)
const pose=target.referenceTransform
if(!pose||!target.referenceFrame)throw Error('Falta referenceTransform/referenceFrame del Scott de 3D LAB')
const refMatrix=new T.Matrix4().compose(new T.Vector3(...pose.position),new T.Quaternion().setFromEuler(new T.Euler(...pose.rotation.map(v=>v*Math.PI/180))),new T.Vector3(...pose.scale))
const data={version:1,assemblyId:front.id,assembly:front.name,duration:2,anchorBone:'mixamorigSpine2',originalAssemblyMatrix:externalMatrix(front).toArray(),importMatrix:importMatrix.toArray(),referenceTransform:refMatrix.toArray(),referenceBind:referenceBind.toArray(),referenceFrame:target.referenceFrame,bindDifference,records,pieces:[...motions.values()],issues,sourceFiles:[...sources.values()],notes:['Vertex.point already contains group/object edits; group matrices must not be applied again.','The common editor referenceFrame cancels between Scott and armor.','Only meshes from the front external instance participate. Forks/wheels/rear remain unchanged.']}
const matchedKeys=new Set(sourceRecords.map(r=>r.key)),unmatchedRuntime=[...actual.keys()].filter(k=>!matchedKeys.has(k))
attachFrontMotionGroups(data,original,target,actual)
if(unmatchedRuntime.length)issues.push(...unmatchedRuntime.map(key=>({kind:'unmatched-runtime-mesh',key})))
fs.mkdirSync('public/transformations',{recursive:true});fs.mkdirSync('artifacts/front-battloid',{recursive:true})
fs.writeFileSync('public/transformations/cyclone-front-battloid.json',JSON.stringify(data)+'\n')
fs.writeFileSync('artifacts/front-battloid/import-report.json',JSON.stringify({...data,records:records.map(r=>({...r,delta:undefined}))},null,2)+'\n')
console.log(JSON.stringify({runtimeMeshes:actual.size,identified:sourceRecords.length,records:records.length,pieces:motions.size,maxError:Math.max(...[...motions.values()].map(p=>typeof p.error==='number'?p.error:0)),bindDifference,issues,absent:[...motions.values()].filter(p=>p.absent)},null,2))
built.dispose()
