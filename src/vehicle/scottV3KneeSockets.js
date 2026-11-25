import {Mesh,Raycaster,Triangle,Vector3} from 'three'

// Probe the native bind-space surface. The anatomical knee head is inside the
// model and ahead of the raised lateral cap, so it is not an attachment point.
// Keep the hit triangle and barycentric coordinates to follow the actual skin.
export function readV3KneeSocket(mesh,side,kneeBind,probeOffset){
 const sign=side==='Left'?1:-1,probe=kneeBind.clone().add(new Vector3(...probeOffset))
 const bindMesh=new Mesh(mesh.geometry,mesh.material);bindMesh.updateMatrixWorld(true)
 probe.x=sign*.6
 const hit=new Raycaster(probe,new Vector3(-sign,0,0),0,1.2).intersectObject(bindMesh,false)[0]
 if(!hit||hit.point.x*sign<=0||hit.face.normal.x*sign<.75)throw Error('Scott V3: no se identifica la tapa lateral de rodilla '+side)
 const triangle=[hit.face.a,hit.face.b,hit.face.c],vertices=triangle.map(i=>new Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i))
 const weights=Triangle.getBarycoord(hit.point,...vertices,new Vector3()).toArray()
 return{side,triangle,weights,bindPoint:hit.point.toArray(),bindNormal:hit.face.normal.toArray()}
}
