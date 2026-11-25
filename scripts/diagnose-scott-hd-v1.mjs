import fs from 'node:fs'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {AnimationMixer,Vector3} from 'three'
import {readGlb,accessorData} from './glb-data.mjs'
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const original=readGlb('public/models/mospeada/scott-bernard-animated-original.glb'),bad=readGlb('public/models/mospeada/scott-bernard-hd-hybrid-v1.glb'),donor=readGlb('assets/01-SCOTT/scott-hd-cabeza-torso-hombros-brazos.glb')
const asset=await new GLTFLoader().parseAsync(bad.bytes.buffer.slice(bad.bytes.byteOffset,bad.bytes.byteOffset+bad.bytes.length),'')
const parts=[]
asset.scene.updateMatrixWorld(true)
asset.scene.traverse(mesh=>{
 if(!mesh.isSkinnedMesh)return;mesh.skeleton.update()
 const g=mesh.geometry,p=g.attributes.position,n=g.attributes.normal,idx=g.index.array,points=[];let maxEdge=0,longEdges=0,badIndices=0,badNormals=0,badWeights=0
 for(let i=0;i<p.count;i++){
  points.push(mesh.getVertexPosition(i,new Vector3()).applyMatrix4(mesh.matrixWorld));const normal=new Vector3().fromBufferAttribute(n,i)
  if(!Number.isFinite(normal.length())||Math.abs(normal.length()-1)>.03)badNormals++
  const w=g.attributes.skinWeight;let sum=0;for(let k=0;k<4;k++)sum+=w.array[i*4+k];if(!Number.isFinite(sum)||Math.abs(sum-1)>1e-5)badWeights++
 }
 for(let i=0;i<idx.length;i+=3)for(let k=0;k<3;k++){
  const a=idx[i+k],b=idx[i+(k+1)%3];if(a>=p.count||b>=p.count){badIndices++;continue}
  const d=points[a].distanceTo(points[b]);maxEdge=Math.max(maxEdge,d);if(d>.10)longEdges++
 }
 parts.push({name:mesh.name,vertices:p.count,triangles:idx.length/3,badIndices,badNormals,badWeights,maxBindEdgeMeters:maxEdge,edgesLongerThan10cm:longEdges})
})
const sourceSkin=original.doc.skins[0],hybridSkin=bad.doc.skins[0]
const jointNodesPreserved=sourceSkin.joints.every(i=>JSON.stringify(original.doc.nodes[i])===JSON.stringify(bad.doc.nodes[i]))
const report={
 originalRigAndAnimationBinaryPrefixUnchanged:bad.bin.subarray(0,original.bin.length).equals(original.bin),
 jointNodesPreserved,inverseBindAccessorPreserved:JSON.stringify(sourceSkin)===JSON.stringify(hybridSkin),
 originalAnimationsPreserved:JSON.stringify(original.doc.animations)===JSON.stringify(bad.doc.animations),
 donorRoot:donor.doc.nodes[0],receiverRootScale:original.doc.nodes.find(n=>n.name==='Armature').scale,
 parts,
 causes:[
 'El donante es una sola superficie fusionada en A-pose. La división por centroides y regiones de distancia cortó placas y uniones anatómicas; no equivalía a extraer piezas independientes.',
 'La alineación de brazos interpoló regiones del torso con los segmentos de brazo. Eso estiró geometría de la axila y bordes de la pechera incluso en bind pose.',
 'La elección de dueño rígido según color de textura y umbrales espaciales asignó vértices vecinos de una misma cubierta a torso/brazo/antebrazo diferentes. En animación aparecieron picos y desgarros.',
 'Los índices no están fuera de rango; el rig, las matrices inversas y los canales originales se conservaron. Eso descarta corrupción de índices o sustitución del esqueleto como causa principal.',
 'El ensayo de render inicial limpiaba la acción importada sin restaurar las matrices de pose: no representaba reposo real. La V2 verificará bind pose explícita y muestras del runtime.'
 ],
 v2Constraints:['Reconstruir desde ambos originales','Sólo cabeza/casco y pechera','Sin decimación, soldadura, extensión de brazos ni transferencia automática','Piezas rígidas con dueño explícito Head y Spine2','Conservar brazos/manos/cuerpo inferior y animaciones originales','Original seleccionado por defecto']
}
fs.mkdirSync('artifacts/scott-hd-hybrid-v2',{recursive:true});fs.writeFileSync('artifacts/scott-hd-hybrid-v2/diagnosis.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
