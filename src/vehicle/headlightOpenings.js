import patches from './headlightOpeningsData.js'
import { frontGeometryKey } from './frontTransformMath.js'

export function applyHeadlightOpenings(surfaces){
  const byKey=new Map(patches.map(p=>[p.key,p])),applied=[]
  for(const mesh of surfaces){
    const patch=byKey.get(frontGeometryKey(mesh))
    if(!patch)continue
    const original=mesh.geometry
    if(original.attributes.position.count!==patch.vertexCount||original.index)throw Error('La geometría de la tapa cambió; regenerá la corrección por ID')
    const removed=new Set(patch.removeTriangleStarts),indices=[]
    for(let i=0;i<patch.vertexCount;i+=3)if(!removed.has(i))indices.push(i,i+1,i+2)
    mesh.geometry=original.clone();mesh.geometry.setIndex(indices)
    mesh.geometry.userData.openHeadlightFaces=[...patch.faceIds]
    applied.push({pieceId:patch.pieceId,removedTriangles:removed.size})
  }
  if(applied.length!==patches.length)throw Error('No se encontraron las dos tapas de Headlight_Housing')
  return applied
}
