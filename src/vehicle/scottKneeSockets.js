import {Raycaster,Triangle,Vector3} from 'three'

// Outer rim vertices of the TWO raised knee discs in the unchanged char1
// mesh. Identified on the GLB topology, not estimated world/screenshot points.
// Each disc is measured independently; Meshy's two sides are not identical.
const rims={
  Left:[10532,10550,10544,10564,10572,10546,10556,10560,10567,10569],
  Right:[11342,11352,12144,12124,12138,12128,12131,12120,12114,12112,12123],
}

function solve3(a,b){
  const m=a.map((r,i)=>[...r,b[i]])
  for(let i=0;i<3;i++){
    let p=i;for(let j=i+1;j<3;j++)if(Math.abs(m[j][i])>Math.abs(m[p][i]))p=j
    ;[m[i],m[p]]=[m[p],m[i]]
    if(Math.abs(m[i][i])<1e-12)throw Error('No se puede medir el disco lateral de rodilla')
    const d=m[i][i];for(let k=i;k<4;k++)m[i][k]/=d
    for(let j=0;j<3;j++)if(j!==i){const d=m[j][i];for(let k=i;k<4;k++)m[j][k]-=d*m[i][k]}
  }
  return m.map(r=>r[3])
}

export function readKneeSocket(source,side){
  source.updateWorldMatrix(true,true)
  const mesh=source.getObjectByName('char1'),ids=rims[side]
  if(!mesh?.isSkinnedMesh||mesh.geometry.attributes.position.count!==15429||!ids)throw Error('La geometría original de Scott cambió; hay que volver a identificar los discos de rodilla')
  const points=ids.map(i=>mesh.localToWorld(mesh.getVertexPosition(i,new Vector3())))
  // Least-squares circle on the actual lateral rim. Work about its centroid
  // for conditioning; these are measurements in the model's bind frame.
  const origin=points.reduce((p,v)=>p.add(v),new Vector3()).divideScalar(points.length)
  const a=[[0,0,0],[0,0,0],[0,0,0]],b=[0,0,0]
  for(const p of points){const y=p.y-origin.y,z=p.z-origin.z,row=[y,z,1],rhs=-(y*y+z*z);for(let i=0;i<3;i++){b[i]+=row[i]*rhs;for(let j=0;j<3;j++)a[i][j]+=row[i]*row[j]}}
  const [d,e,f]=solve3(a,b),center=origin.clone();center.y-=d/2;center.z-=e/2
  const radius=Math.sqrt((d*d+e*e)/4-f),sign=side==='Left'?1:-1
  if(!(radius>.02&&radius<.05))throw Error('El borde de rodilla no corresponde al disco circular esperado')
  // Intersect the actual raised cap, rather than ending at the rim's plane
  // or the approximate joint/bone origin. The hit's triangle is persistent.
  const start=center.clone();start.x=sign*(Math.max(...points.map(p=>sign*p.x))+radius*2)
  const hit=new Raycaster(start,new Vector3(-sign,0,0),0,radius*4).intersectObject(mesh,false)[0]
  if(!hit||Math.sign(hit.point.x)!==sign)throw Error('No se encontró la superficie del disco lateral de '+side)
  const triangle=[hit.face.a,hit.face.b,hit.face.c],vertices=triangle.map(i=>mesh.localToWorld(mesh.getVertexPosition(i,new Vector3())))
  const barycentric=Triangle.getBarycoord(hit.point,...vertices,new Vector3())
  return{side,bone:`mixamorig${side}Leg`,meshName:mesh.name,rim:ids,triangle,weights:barycentric.toArray(),radius,bindPoint:hit.point.toArray()}
}

export function kneeSocketPoint(mesh,socket,out=new Vector3()){
  out.set(0,0,0)
  const vertex=new Vector3()
  socket.triangle.forEach((id,i)=>out.addScaledVector(mesh.getVertexPosition(id,vertex),socket.weights[i]))
  return mesh.localToWorld(out)
}
