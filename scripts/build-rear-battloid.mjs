// Read-only authoring import. Derived geometry contains the exported splits;
// the Motorcycle GLB and the Armor JSON remain byte-identical.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js'
import {frontGeometryKey,fitPieceTransform} from '../src/vehicle/frontTransformMath.js'
import {matchTranslatedReplacement} from './rear-piece-correspondence.mjs'

const lab='C:/IT-UP/3D-LAB',requireLab=createRequire(path.join(lab,'package.json')),ts=requireLab('typescript')
const engine=path.resolve('.local/rear-transform-engine');fs.mkdirSync(engine,{recursive:true})
const compiled=new Set()
function compile(name){
  if(compiled.has(name))return;compiled.add(name)
  let code=ts.transpileModule(fs.readFileSync(path.join(lab,'src/components/mospeada/rotoscopy',name+'.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
  if(name==='externalMeshes')code=code.replace('mesh.userData.sourcePiece = p.pieces.find(v => v.id === op.pieceId)?.name;','mesh.userData.sourcePieceIds=[op.pieceId];mesh.userData.sourcePiece = p.pieces.find(v => v.id === op.pieceId)?.name;').replace('mesh.userData.sourcePieces = op.faces.map','mesh.userData.sourcePieceIds=[...new Set(op.faces.map(f=>f.pieceId))];mesh.userData.sourcePieces = op.faces.map')
  code=code.replace(/from (['"])([^.'"][^'"]*)\1/g,(m,q,dep)=>dep==='three'||dep.startsWith('three/')?m:`from ${q}${pathToFileURL(requireLab.resolve(dep)).href}${q}`)
  code=code.replace(/(['"])\.\/([^'"\n]+)\1/g,(_,q,dep)=>{compile(dep);return`${q}./${dep}.mjs${q}`})
  fs.writeFileSync(path.join(engine,name+'.mjs'),code)
}
compile('externalMeshes')
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.()})}}
const sourceFiles=[]
function read(p){const b=fs.readFileSync(p);sourceFiles.push({path:p,sha256:crypto.createHash('sha256').update(b).digest('hex')});return b}
const assembly=JSON.parse(read(lab+'/assets/mospeada/assembly json/cyclone-material-assembly.json'))
const external=assembly.externals.find(e=>e.id==='4fc3e587-225c-42c4-8b72-14c7a40b3b02')
const source=JSON.parse(read(lab+'/'+external.path)),targetPath='assets/scott-cyclone/armor/rear_body · extremo lateral redondeado · armor.json',target=JSON.parse(read(targetPath))
const legs=target.pieces.filter(p=>p.name==='caballero-right');if(legs.length!==2)throw Error('Se necesitan las dos caballero-right por ID')
const chest={plateId:'4f8dcb27-ecfb-40f1-af7e-147dcc02e754',grilleId:'70581499-b1e5-4642-901e-a0727e391866'}
for(const id of Object.values(chest))if(!target.pieces.some(p=>p.id===id&&!p.hidden))throw Error(`Falta pieza del pecho ${id}`)
const hiddenFront=target.pieces.filter(p=>p.parentId==='4f52f3cb-b481-5cab-a3aa-3c75d3b435f8')
const hiddenCaps=target.pieces.filter(p=>p.hidden&&p.name==='Tank_Cap_Detail_Left (copia) 2')
if(hiddenCaps.length!==2)throw Error('Falta la visibilidad Armor de las dos tapas circulares del tanque')
const sources=new Map(source.pieces.map(p=>[p.id,p])),fits=new Map(),coord=v=>v.map(n=>Math.round(n*1e6)).join(',')
const targetIds=new Set(target.pieces.map(p=>p.id)),replacements=new Map()
for(const p of target.pieces.filter(p=>!sources.has(p.id)&&p.name==='Pieza 25')){
  const match=matchTranslatedReplacement(p,source.pieces.filter(o=>!targetIds.has(o.id)))
  if([...replacements.values()].some(r=>r.sourceId===match.sourceId))throw Error('Dos destinos sustituyen la misma Pieza 25')
  replacements.set(p.id,match)
}
const wheelDefinitions=[
  {wheel:'front',id:'bd1c2a87-3be9-4d6f-8bfc-9bd069b334c6',housingId:'9eebbb23-12ce-4f94-8a39-d0969b2adf77'},
  {wheel:'rear',id:'9e6503f6-65b4-48bd-83f2-07a0ed163e98',housingId:'a8fafb30-8582-4b97-b2c6-974d263e4c21'},
]
const referenceIds=new Set(wheelDefinitions.map(d=>d.id)),wheelBaseIds=new Set([...wheelDefinitions.map(d=>d.housingId),'c363b9c5-9f7c-4414-919c-e8743d8215af'])
const wheelCarriers=wheelDefinitions.map(def=>{
  const from=sources.get(def.id),to=target.pieces.find(p=>p.id===def.id)
  if(!from||!to||to.hidden)throw Error(`Falta referencia hidráulica ${def.id}`)
  const fit=fitPieceTransform(from,to)
  const axis=new T.Vector3(-1,0,0).applyEuler(new T.Euler(...from.objectPose.rotation.map(v=>v*Math.PI/180)))
  const tipProjection=Math.max(...from.vertices.map(v=>new T.Vector3(...v.point).dot(axis)))
  const ring=from.vertices.filter(v=>Math.abs(new T.Vector3(...v.point).dot(axis)-tipProjection)<1e-6)
  if(ring.length<3)throw Error(`No se identifica el extremo de ${def.id}`)
  const tip=ring.reduce((v,p)=>v.add(new T.Vector3(...p.point)),new T.Vector3()).divideScalar(ring.length)
  return{...def,name:from.name,delta:fit.matrix.toArray(),sourceTip:tip.toArray(),targetTip:tip.clone().applyMatrix4(fit.matrix).toArray(),maxFitError:fit.error}
})
const detailIds=new Set(['fa2c5512-32c5-4114-a443-db5f917301f1','9a55d575-5e41-4fc6-9b82-2d824e727487','dcfcf888-f004-4610-bf75-d1d44200d9b1','80089720-55b5-4db2-9a79-79cabff00299'])
// Visible but untouched brackets remain on the bike. Once the author gives
// them an Armor displacement, import it instead of permanently excluding IDs.
const identity=new T.Matrix4().elements
const stationary=p=>detailIds.has(p.id)&&sources.has(p.id)&&fitPieceTransform(sources.get(p.id),p).matrix.elements.every((v,i)=>Math.abs(v-identity[i])<1e-8)
const included=target.pieces.filter(p=>!referenceIds.has(p.id)&&(!p.hidden||legs.includes(p)||hiddenFront.includes(p))&&!stationary(p))
const sourceCoords=source.pieces.map(p=>({piece:p,coords:new Set(p.vertices.map(v=>coord(v.point)))}))
for(const p of included){
  if(sources.has(p.id)){const original=sources.get(p.id),fit=fitPieceTransform(original,p);fits.set(p.id,{sourceId:p.id,delta:fit.matrix,error:fit.error,common:fit.commonVertices,retract:false});continue}
  if(replacements.has(p.id)){
    const replacement=replacements.get(p.id),original=sources.get(replacement.sourceId),ids=new Map(replacement.vertexPairs.map(p=>[p.source,p.target]))
    const remapped={...original,vertices:original.vertices.map(v=>({...v,id:ids.get(v.id)}))},fit=fitPieceTransform(remapped,p)
    fits.set(p.id,{...replacement,delta:fit.matrix,error:fit.error,common:fit.commonVertices,retract:false});continue
  }
  if(!hiddenFront.includes(p))throw Error(`Falta procedencia para ${p.id}`)
  const scores=sourceCoords.map(o=>({...o,count:p.vertices.filter(v=>o.coords.has(coord(v.point))).length})).sort((a,b)=>b.count-a.count)
  if(scores[0].count<3||scores[0].count<=scores[1].count+2)throw Error(`Procedencia ambigua para el tramo ${p.id}`)
  fits.set(p.id,{sourceId:scores[0].piece.id,delta:new T.Matrix4(),common:scores[0].count,error:0,retract:true})
}
const editable=structuredClone(target),includeIds=new Set(included.map(p=>p.id))
for(const p of editable.pieces)if(includeIds.has(p.id))p.hidden=false
editable.groups.find(g=>g.id==='4f52f3cb-b481-5cab-a3aa-3c75d3b435f8').hidden=false
for(const op of editable.solidifies)if(op.faces.every(f=>hiddenFront.some(p=>p.id===f.pieceId)))op.hidden=false
const nativeFetch=globalThis.fetch
globalThis.fetch=async url=>{const u=new URL(url,'http://localhost');if(u.pathname!=='/api/3d-lab/projects')return nativeFetch(url);const p=u.searchParams.get('path');return new Response(p==='assets/__rear_target__.json'?JSON.stringify(editable):fs.readFileSync(path.join(lab,p)))}
const {buildExternalAssembly}=await import(pathToFileURL(path.join(engine,'externalMeshes.mjs')))
const bytes=read('public/models/mospeada/cyclone-vr052f.glb'),gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')
const runtime=[];gltf.scene.traverse(m=>{if(m.isMesh&&m.userData.assembly===external.name)runtime.push(m)})
const B=new T.Matrix4().makeRotationY(Math.PI/2).scale(new T.Vector3(1.3,1.3,1.3)),fingerprint=m=>frontGeometryKey(m).split('|').slice(-2).join('|')
const built=await buildExternalAssembly([external]),sourceRecords=[]
built.root.updateMatrixWorld(true)
function info(mesh){let n=mesh,ids,name,visible=true;while(n){ids??=n.userData.sourcePieceIds||(n.userData.id?[n.userData.id]:undefined);name??=n.userData.sourcePiece||n.userData.sourcePieces?.join(' + ');visible&&=n.visible;n=n.parent}return{ids,name,visible}}
built.root.traverse(m=>{
  if(!m.isMesh||!m.geometry.attributes.position?.count)return
  const {ids,visible}=info(m);if(!visible||!ids?.length)return
  const geometry=m.geometry.clone().applyMatrix4(B.clone().multiply(m.matrixWorld)),matches=runtime.filter(n=>fingerprint(n)===fingerprint({geometry,userData:{}}));geometry.dispose()
  if(matches.length>1)throw Error('Geometría de origen ambigua')
  if(matches.length===1)sourceRecords.push({key:frontGeometryKey(matches[0]),ids})
})
const sourceBindings=new Map()
for(const id of new Set([...fits.values()].map(f=>f.sourceId).concat(hiddenCaps.map(p=>p.id)))){
  const exact=sourceRecords.find(r=>r.ids.includes(id))
  if(exact){sourceBindings.set(id,exact.key);continue}
  // Older GLB combines both seat/body halves. Verify the correspondence by
  // authored vertex coordinates; legacy names and mesh ordering are irrelevant.
  const points=new Set(sources.get(id).vertices.map(v=>coord(new T.Vector3(...v.point).applyMatrix4(B).toArray())))
  const scores=runtime.map(mesh=>{const positions=mesh.geometry.attributes.position,coords=new Set();for(let i=0;i<positions.count;i++)coords.add(coord(new T.Vector3().fromBufferAttribute(positions,i).toArray()));return{mesh,count:[...points].filter(p=>coords.has(p)).length}}).sort((a,b)=>b.count-a.count)
  if(scores[0].count<10||scores[0].count<scores[1].count*3)throw Error(`Correspondencia ambigua con GLB: ${id}`)
  sourceBindings.set(id,frontGeometryKey(scores[0].mesh))
}
const targetBuilt=await buildExternalAssembly([{...external,path:'assets/__rear_target__.json'}]),root=new T.Group(),records=[]
targetBuilt.root.updateMatrixWorld(true)
const material=new T.MeshStandardMaterial({vertexColors:true})
targetBuilt.root.traverse(m=>{
  if(!m.isMesh||!m.geometry.attributes.position?.count)return
  const {ids,visible}=info(m);if(!visible||!ids?.length||!ids.every(id=>fits.has(id)))return
  const fit=fits.get(ids[0]);if(!ids.every(id=>fits.get(id).delta.elements.every((v,i)=>Math.abs(v-fit.delta.elements[i])<1e-5)))throw Error('Un modificador mezcla movimientos incompatibles')
  const geometry=m.geometry.clone().applyMatrix4(B.clone().multiply(fit.delta.clone().invert()).multiply(m.matrixWorld))
  const name=`rear_${records.length}`,mesh=new T.Mesh(geometry,material);mesh.name=name;root.add(mesh)
  const sourceId=fit.sourceId,original=sources.get(sourceId),targetPiece=target.pieces.find(p=>p.id===ids[0]),bounds=new T.Box3().setFromPoints(targetPiece.vertices.map(v=>new T.Vector3(...v.point)))
  const chestPart=ids.includes(chest.plateId)?'plate':ids.includes(chest.grilleId)?'grille':undefined
  const vertexPairs=fit.vertexPairs||original.vertices.filter(v=>targetPiece.vertices.some(w=>w.id===v.id)).map(v=>({source:v.id,target:v.id}))
  records.push({name,ids,sourceId,sourceKey:sourceBindings.get(sourceId),delta:fit.delta.toArray(),retract:fit.retract,retractLength:fit.retract?bounds.max.x-bounds.min.x:0,role:chestPart?'chest':wheelBaseIds.has(sourceId)?'wheel-base':detailIds.has(sourceId)?'detail':legs.some(p=>ids.includes(p.id))?'leg':'rear',chestPart,visible:!fit.retract,...(fit.vertexPairs?{replacement:{sourceId,vertexPairs:fit.vertexPairs}}:{}),checkpoints:vertexPairs.slice(0,fit.vertexPairs?vertexPairs.length:3).map(v=>({source:original.vertices.find(w=>w.id===v.source).point,target:targetPiece.vertices.find(w=>w.id===v.target).point,id:v.source,...(fit.vertexPairs?{targetId:v.target}:{})}))})
})
const reference=new T.Matrix4().compose(new T.Vector3(...target.referenceTransform.position),new T.Quaternion().setFromEuler(new T.Euler(...target.referenceTransform.rotation.map(v=>v*Math.PI/180))),new T.Vector3(...target.referenceTransform.scale))
const geometryBytes=await new GLTFExporter().parseAsync(root,{binary:true,onlyVisible:true})
fs.mkdirSync('public/transformations',{recursive:true});fs.mkdirSync('artifacts/rear-battloid',{recursive:true})
fs.writeFileSync('public/transformations/cyclone-rear-pieces.glb',Buffer.from(geometryBytes))
const hiddenInArmor=hiddenCaps.map(p=>({id:p.id,name:p.name,key:sourceBindings.get(p.id)}))
const data={version:1,assembly:external.name,assemblyId:external.id,importMatrix:B.toArray(),referenceTransform:reference.toArray(),referenceFrame:target.referenceFrame,chest,wheelCarriers,visibilityOverrides:legs.map(p=>p.id),hiddenInArmor,sourceKeys:[...new Set(records.map(r=>r.sourceKey).concat(hiddenInArmor.map(p=>p.key)))],records,sourceFiles,geometryUrl:'/transformations/cyclone-rear-pieces.glb'}
fs.writeFileSync('public/transformations/cyclone-rear-battloid.json',JSON.stringify(data)+'\n')
const report={parts:records.length,retracted:records.filter(r=>r.retract).length,legs:records.filter(r=>r.role==='leg').map(r=>r.ids),hiddenInArmor,sourceMeshes:data.sourceKeys.length,maxFitError:Math.max(...[...fits.values()].map(f=>f.error)),replacements:[...replacements].map(([targetId,r])=>({targetId,...r})),geometryBytes:geometryBytes.byteLength,sourceFiles}
fs.writeFileSync('artifacts/rear-battloid/import-report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
built.dispose();targetBuilt.dispose()
