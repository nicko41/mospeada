// Read-only import: vertices already include 3D LAB's object/group edits.
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {fitPieceTransform,frontGeometryKey} from '../src/vehicle/frontTransformMath.js'

const lab='C:/IT-UP/3D-LAB',directory=lab+'/assets/mospeada/assembly json/',sources=[]
const requireLab=createRequire(lab+'/package.json'),ts=requireLab('typescript'),engine=path.resolve('.local/wheel-transform-engine'),compiled=new Set()
fs.mkdirSync(engine,{recursive:true})
function compile(name){
  if(compiled.has(name))return;compiled.add(name)
  let code=ts.transpileModule(fs.readFileSync(`${lab}/src/components/mospeada/rotoscopy/${name}.ts`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
  code=code.replace(/from (['"])([^.'"][^'"]*)\1/g,(m,q,dep)=>dep==='three'||dep.startsWith('three/')?m:`from ${q}${pathToFileURL(requireLab.resolve(dep)).href}${q}`)
  code=code.replace(/(['"])\.\/([^'"\n]+)\1/g,(_,q,dep)=>{compile(dep);return`${q}./${dep}.mjs${q}`})
  fs.writeFileSync(path.join(engine,name+'.mjs'),code)
}
compile('externalMeshes')
const read=p=>{const bytes=fs.readFileSync(p);sources.push({path:p,sha256:createHash('sha256').update(bytes).digest('hex')});return bytes}
const assembly=JSON.parse(read(directory+'cyclone-material-assembly.json'))
const rear=JSON.parse(read('public/transformations/cyclone-rear-battloid.json'))
const B=new T.Matrix4().fromArray(rear.importMatrix)
// All four documents contain coordinates in the original assembly space.
// Their reference names describe visual guides, not an extra object transform.
// Reuse the already established assembly -> Scott alignment of the rear.
const editorToModel=new T.Matrix4().fromArray(rear.referenceTransform).invert()
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const nativeFetch=globalThis.fetch
globalThis.fetch=async url=>{const u=new URL(url,'http://localhost');return u.pathname==='/api/3d-lab/projects'?new Response(fs.readFileSync(path.join(lab,u.searchParams.get('path')))):nativeFetch(url)}
const {buildExternalAssembly}=await import(pathToFileURL(path.join(engine,'externalMeshes.mjs')))
const bytes=read('public/models/mospeada/cyclone-vr052f.glb')
const bike=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),'')
const meshes=[];bike.scene.traverse(m=>{if(m.isMesh)meshes.push(m)})
const wheels=[],copies=[]
for(const [wheel,id]of[['front','8a2daed9-0ace-4be0-acf0-d15cde6aef88'],['rear','ba7036bf-ae0a-4847-81b1-aa395e49cfa2']]){
  const external=assembly.externals.find(e=>e.id===id)
  if(!external||external.parentId)throw Error('No se identifica el assembly original de '+wheel)
  const original=JSON.parse(read(lab+'/'+external.path))
  const E=new T.Matrix4().compose(new T.Vector3(...external.position),new T.Quaternion().setFromEuler(new T.Euler(...external.rotation.map(n=>n*Math.PI/180))),new T.Vector3(...external.scale)).multiply(new T.Matrix4().makeTranslation(...external.pivot.map(n=>-n)))
  const baked=B.clone().multiply(E),inverse=baked.clone().invert(),parts=[]
  const built=await buildExternalAssembly([external]),sourceKeys=new Set()
  built.root.updateMatrixWorld(true)
  built.root.traverse(m=>{
    if(!m.isMesh||!m.geometry.attributes.position?.count)return
    let n=m,visible=true,name
    while(n){visible&&=n.visible;name??=n.userData.sourcePiece;n=n.parent}
    if(!visible)return
    const geometry=m.geometry.clone().applyMatrix4(B.clone().multiply(m.matrixWorld))
    sourceKeys.add(frontGeometryKey({geometry,userData:{assembly:external.name,sourcePiece:name||m.name}}));geometry.dispose()
  })
  for(const piece of original.pieces.filter(p=>!p.hidden)){
    const matches=meshes.filter(m=>m.userData.assembly===external.name&&m.userData.sourcePiece===piece.name)
    if(matches.length!==1)throw Error('Correspondencia ambigua: '+piece.id)
    const mesh=matches[0],key=frontGeometryKey(mesh)
    if(!sourceKeys.has(key))throw Error('La geometría real no coincide con el ID '+piece.id)
    parts.push({id:piece.id,key,name:piece.name,geometryVerified:true})
  }
  if(parts.length!==4)throw Error('Rueda incompleta: '+wheel)
  const poses={}
  for(const [state,suffix]of[['intermediate','intermedio'],['final','final-armor']]){
    const filename=`cyclone-rueda-${wheel}-${suffix}.json`,buffer=read(directory+'ARMOR MODE/'+filename),target=JSON.parse(buffer)
    const fits=parts.map(p=>{
      const from=original.pieces.find(o=>o.id===p.id),to=target.pieces.find(o=>o.id===p.id)
      if(!to||to.hidden)throw Error('Falta pieza visible '+p.id+' en '+filename)
      return{...fitPieceTransform(from,to),from,to}
    }),delta=fits[0].matrix
    if(fits.some(f=>f.matrix.elements.some((v,i)=>Math.abs(v-delta.elements[i])>1e-8)))throw Error('La rueda no comparte un movimiento rígido: '+filename)
    const q=new T.Quaternion(),s=new T.Vector3();delta.decompose(new T.Vector3(),q,s)
    if(s.distanceTo(new T.Vector3(1,1,1))>1e-7)throw Error('La pose cambia el tamaño de la rueda: '+filename)
    poses[state]={file:filename,targetInModel:editorToModel.clone().multiply(delta).multiply(inverse).toArray(),delta:delta.toArray(),maxFitError:Math.max(...fits.map(f=>f.error)),checkpoints:fits.flatMap(f=>f.from.vertices.filter(v=>f.to.vertices.some(w=>w.id===v.id)).filter((_,i)=>i%31===0).map(v=>({pieceId:f.from.id,vertexId:v.id,source:new T.Vector3(...v.point).applyMatrix4(baked).toArray(),target:new T.Vector3(...f.to.vertices.find(w=>w.id===v.id).point).applyMatrix4(editorToModel).toArray()})))}
    copies.push({filename,buffer})
  }
  wheels.push({wheel,assemblyId:id,parts,poses})
  built.dispose()
}
const data={version:2,segment:[.62,1],intermediateProgress:.81,referenceTransform:rear.referenceTransform,importMatrix:B.toArray(),wheels,sourceFiles:sources,notes:['Vertex.point is final: do not apply group.matrix or objectPose again.','Assembly coordinates use the existing rear Scott alignment; reference filenames are visual guides.','Wheel/hydraulic poses do not modify the driving geometry, hierarchy or suspension.']}
fs.mkdirSync('assets/scott-cyclone/armor/wheels',{recursive:true});fs.mkdirSync('artifacts/wheel-battloid',{recursive:true})
for(const c of copies)fs.writeFileSync(path.join('assets/scott-cyclone/armor/wheels',c.filename),c.buffer)
fs.writeFileSync('public/transformations/cyclone-wheel-battloid.json',JSON.stringify(data)+'\n')
fs.writeFileSync('artifacts/wheel-battloid/pose-import-report.json',JSON.stringify({wheels:wheels.map(w=>({wheel:w.wheel,parts:w.parts,poses:Object.fromEntries(Object.entries(w.poses).map(([k,v])=>[k,{file:v.file,maxFitError:v.maxFitError,checkpoints:v.checkpoints.length}]))})),sourceFiles:sources},null,2)+'\n')
console.log(JSON.stringify(wheels.map(w=>({wheel:w.wheel,parts:w.parts.length,errors:Object.values(w.poses).map(p=>p.maxFitError)}))))
