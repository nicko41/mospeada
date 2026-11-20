// Read-only 3D LAB import. The target is already baked into Vertex.point.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {fitPieceTransform,frontGeometryKey} from '../src/vehicle/frontTransformMath.js'

const lab='C:/IT-UP/3D-LAB',requireLab=createRequire(path.join(lab,'package.json')),ts=requireLab('typescript')
const engine=path.resolve('.local/guard-transform-engine'),compiled=new Set(),sourceFiles=[]
fs.mkdirSync(engine,{recursive:true})
function compile(name){
  if(compiled.has(name))return;compiled.add(name)
  let code=ts.transpileModule(fs.readFileSync(path.join(lab,'src/components/mospeada/rotoscopy',name+'.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
  code=code.replace(/from (['"])([^.'"][^'"]*)\1/g,(m,q,dep)=>dep==='three'||dep.startsWith('three/')?m:`from ${q}${pathToFileURL(requireLab.resolve(dep)).href}${q}`)
  code=code.replace(/(['"])\.\/([^'"\n]+)\1/g,(_,q,dep)=>{compile(dep);return`${q}./${dep}.mjs${q}`})
  fs.writeFileSync(path.join(engine,name+'.mjs'),code)
}
compile('externalMeshes')
const read=p=>{const b=fs.readFileSync(p);sourceFiles.push({path:p,sha256:crypto.createHash('sha256').update(b).digest('hex')});return b}
const assembly=JSON.parse(read(lab+'/assets/mospeada/assembly json/cyclone-material-assembly.json'))
const left=assembly.externals.find(e=>e.id==='a1b02f8a-ccf7-40f7-a613-b649702b4aa8'),right=assembly.externals.find(e=>e.id==='b966c731-f9e4-4a6f-8db6-22d4a5b1cdca')
if(!left||!right||left.parentId!==right.parentId)throw Error('Faltan las instancias originales de los guards')
const original=JSON.parse(read(lab+'/'+left.path)),target=JSON.parse(read('assets/scott-cyclone/armor/arm-guard-cuff.json'))
const pose=target.referenceTransform
if(!pose||!target.referenceFrame)throw Error('Falta el marco de Scott del JSON')
const fits=target.pieces.filter(p=>!p.hidden).map(p=>{const source=original.pieces.find(o=>o.id===p.id);if(!source)throw Error('Falta ID de origen '+p.id);return{piece:p,source,...fitPieceTransform(source,p)}})
if(fits.length!==15)throw Error('Se esperan las quince piezas del guard completo')
const delta=fits[0].matrix
if(fits.some(f=>f.matrix.elements.some((v,i)=>Math.abs(v-delta.elements[i])>1e-8)))throw Error('Las piezas del guard no comparten un movimiento rígido')
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const nativeFetch=globalThis.fetch
globalThis.fetch=async url=>{const u=new URL(url,'http://localhost');return u.pathname==='/api/3d-lab/projects'?new Response(fs.readFileSync(path.join(lab,u.searchParams.get('path')))):nativeFetch(url)}
const {buildExternalAssembly}=await import(pathToFileURL(path.join(engine,'externalMeshes.mjs')))
const {externalMatrix,externalParentFrame}=await import(pathToFileURL(path.join(engine,'assemblySchema.mjs')))
const load=async p=>{const b=read(p);return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')}
const bike=await load('public/models/mospeada/cyclone-vr052f.glb'),scott=await load('public/models/mospeada/scott-bernard-animated-original.glb')
scott.scene.updateMatrixWorld(true)
const hip=scott.scene.getObjectByName('mixamorigHips').getWorldPosition(new T.Vector3()),mirror=new T.Matrix4().makeScale(-1,1,1).setPosition(2*hip.x,0,0)
const reference=new T.Matrix4().compose(new T.Vector3(...pose.position),new T.Quaternion().setFromEuler(new T.Euler(...pose.rotation.map(v=>v*Math.PI/180))),new T.Vector3(...pose.scale))
const refInverse=reference.clone().invert(),B=new T.Matrix4().makeRotationY(Math.PI/2).scale(new T.Vector3(1.3,1.3,1.3))
const sourceGroup=original.groups.find(g=>g.id==='dbaefb0d-7fcf-4dab-80f0-c2ed6140c945')
if(!sourceGroup)throw Error('Falta el pivote del conjunto guard cuff')
const sourceCenter=new T.Vector3().setFromMatrixPosition(new T.Matrix4().fromArray(sourceGroup.matrix))
const parent=assembly.externals.find(e=>e.id===left.parentId),built=await buildExternalAssembly([parent,left,right]),records=[],groups=[]
const runtime=[];bike.scene.traverse(m=>{if(m.isMesh)runtime.push(m)})
const fingerprint=m=>frontGeometryKey(m).split('|').slice(-2).join('|')
built.root.updateMatrixWorld(true)
for(const [external,bone,mirrored]of[[left,'mixamorigLeftForeArm',false],[right,'mixamorigRightForeArm',true]]){
  // Children are attached to each ancestor's pivot frame, outside its
  // geometry's -pivot wrapper. Using externalMatrix(parent) subtracts the
  // wheel pivot a second time and displaces the guard off Scott's forearm.
  const baked=B.clone().multiply(externalParentFrame(assembly.externals,external.id)).multiply(externalMatrix(external)),inverse=baked.clone().invert()
  const group={id:external.id,bone,mirrored,sourcePivot:sourceCenter.clone().applyMatrix4(baked).toArray(),bind:scott.scene.getObjectByName(bone).matrixWorld.toArray(),records:[]}
  built.root.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.geometry.attributes.position?.count)return
    let node=mesh,id,owner,visible=true
    while(node){if(original.pieces.some(p=>p.id===node.userData.id))id??=node.userData.id;if(node.userData.externalInstance)owner??=node.userData.externalInstance;visible&&=node.visible;node=node.parent}
    if(owner!==external.id||!visible)return
    const fit=fits.find(f=>f.piece.id===id);if(!fit)throw Error('Falta identificación persistente del guard')
    const geometry=mesh.geometry.clone().applyMatrix4(B.clone().multiply(mesh.matrixWorld))
    // Legacy GLB labels nested externals with the wheel assembly. Match the
    // persistent source piece through its baked geometry, never mesh ordering.
    const matches=runtime.filter(m=>m.userData.assembly===parent.name&&fingerprint(m)===fingerprint({geometry,userData:{}}))
    if(matches.length!==1){
      const candidates=runtime.filter(m=>m.userData.assembly===parent.name&&m.userData.sourcePiece===fit.source.name)
      throw Error(`Superficie de guard ambigua: ${id}/${external.id}; expected ${geometry.attributes.position.count}/${fingerprint({geometry,userData:{}})}; actual ${candidates.map(m=>fingerprint(m)).join(',')}`)
    }
    geometry.dispose()
    const targetInModel=(mirrored?mirror.clone():new T.Matrix4()).multiply(refInverse).multiply(fit.matrix).multiply(inverse)
    const record={id,groupId:external.id,key:frontGeometryKey(matches[0]),targetInModel:targetInModel.toArray(),checkpoints:fit.source.vertices.filter(v=>fit.piece.vertices.some(w=>w.id===v.id)).slice(0,3).map(v=>({id:v.id,source:new T.Vector3(...v.point).applyMatrix4(baked).toArray(),target:new T.Vector3(...fit.piece.vertices.find(w=>w.id===v.id).point).applyMatrix4(refInverse).applyMatrix4(mirrored?mirror:new T.Matrix4()).toArray()}))}
    records.push(record);group.records.push(record.key)
  })
  if(group.records.length!==15)throw Error(`Guard incompleto: ${external.name}`)
  groups.push(group)
}
const data={version:1,referenceTransform:reference.toArray(),referenceFrame:target.referenceFrame,mirrorInModel:mirror.toArray(),groups,records,sourceFiles}
fs.mkdirSync('public/transformations',{recursive:true});fs.mkdirSync('artifacts/guard-battloid',{recursive:true})
fs.writeFileSync('public/transformations/cyclone-guard-battloid.json',JSON.stringify(data)+'\n')
fs.writeFileSync('artifacts/guard-battloid/import-report.json',JSON.stringify({surfaces:records.length,groups:groups.map(g=>({id:g.id,bone:g.bone,mirrored:g.mirrored})),maxFitError:Math.max(...fits.map(f=>f.error)),sourceFiles},null,2)+'\n')
built.dispose();console.log(JSON.stringify({surfaces:records.length,maxFitError:Math.max(...fits.map(f=>f.error))}))
