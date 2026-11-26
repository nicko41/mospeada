import {Sphere,Vector3} from 'three'
// Same ordered expansion as SkinnedMesh.computeBoundingSphere. Snapshot the
// evaluated pose so yielding never samples several different animation frames.
export function* skinnedBoundsSteps(mesh){
 if(!mesh.isSkinnedMesh||mesh.boundingSphere!==null)return
 mesh.updateWorldMatrix(true,false)
 const snapshot=mesh.clone(false),sphere=new Sphere().makeEmpty(),point=new Vector3()
 snapshot.skeleton=mesh.skeleton.clone()
 snapshot.skeleton.bones=mesh.skeleton.bones.map(b=>({matrixWorld:b.matrixWorld.clone()}))
 for(let i=0;i<mesh.geometry.attributes.position.count;i++){
  snapshot.getVertexPosition(i,point);sphere.expandByPoint(point)
  if(i%512===511)yield
 }
 mesh.boundingSphere=sphere
}
