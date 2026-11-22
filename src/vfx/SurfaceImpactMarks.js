import {Box3,DataTexture,DoubleSide,DynamicDrawUsage,InstancedBufferAttribute,InstancedMesh,LinearFilter,Matrix3,Matrix4,Mesh,MeshBasicMaterial,Object3D,PlaneGeometry,Raycaster,Vector3} from 'three'

export const SURFACE_MARK_LIMIT=48
const axis=new Vector3(0,0,1),clamp=n=>Math.max(0,Math.min(1,n))
function scorchTexture(){
 const size=64,data=new Uint8Array(size*size*4)
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=(x+.5)/size*2-1,v=(y+.5)/size*2-1,angle=Math.atan2(v,u),edge=.83+.07*Math.sin(angle*7)+.04*Math.cos(angle*11),r=Math.hypot(u,v)/edge,i=(y*size+x)*4
  data[i]=data[i+1]=data[i+2]=0;data[i+3]=Math.round(clamp((1-r)*3)**1.35*230)
 }
 const map=new DataTexture(data,size,size);map.minFilter=map.magFilter=LinearFilter;map.generateMipmaps=false;map.needsUpdate=true;return map
}

// Small, surface-aligned scorch patches share one draw and fixed records.
// Visual contact refinement never changes the hitscan/damage result.
export class SurfaceImpactMarks{
 constructor(){
  this.map=scorchTexture();this.geometry=new PlaneGeometry(1,1);this.geometry.setAttribute('aScorchOpacity',new InstancedBufferAttribute(new Float32Array(SURFACE_MARK_LIMIT),1).setUsage(DynamicDrawUsage))
  this.material=new MeshBasicMaterial({map:this.map,transparent:true,depthTest:true,depthWrite:false,side:DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,toneMapped:false,fog:true})
  this.material.onBeforeCompile=shader=>{
   shader.vertexShader='attribute float aScorchOpacity;varying float vScorchOpacity;\n'+shader.vertexShader
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvScorchOpacity=aScorchOpacity;')
   shader.fragmentShader='varying float vScorchOpacity;\n'+shader.fragmentShader
   shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>','diffuseColor.a*=vScorchOpacity;\n#include <alphatest_fragment>')
  }
  this.material.customProgramCacheKey=()=> 'gallant-surface-scorch-v1'
  this.mesh=new InstancedMesh(this.geometry,this.material,SURFACE_MARK_LIMIT);this.mesh.name='Gallant_pooled_surface_burn_marks';this.mesh.frustumCulled=false;this.mesh.count=0;this.mesh.renderOrder=4;this.mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  this.records=Array.from({length:SURFACE_MARK_LIMIT},()=>({age:Infinity,position:new Vector3(),normal:new Vector3(),anchor:null,instanceId:null,size:0,spin:0}))
  this.cursor=0;this.object=new Object3D();this.matrix=new Matrix4();this.inverse=new Matrix4();this.normalMatrix=new Matrix3();this.position=new Vector3();this.normal=new Vector3();this.point=new Vector3();this.bounds=new Box3();this.query=new Raycaster();this.hits=[];this.proxy=new Mesh();this.proxy.geometry.dispose();this.proxy.material.dispose()
  this.contact={point:new Vector3(),normal:new Vector3(),object:null,instanceId:null}
 }
 worldMatrix(object,instanceId){
  object.updateWorldMatrix(true,false);this.matrix.copy(object.matrixWorld)
  if((object.isInstancedMesh||object.isBatchedMesh)&&instanceId!=null){object.getMatrixAt(instanceId,this.inverse);this.matrix.multiply(this.inverse)}
  return this.matrix
 }
 resolve(from,result,scene){
  const out=this.contact;out.point.copy(result.point);out.normal.copy(result.normal||this.normal.subVectors(from,result.point).normalize());out.object=result.object||null;out.instanceId=null
  if(result.object?.userData.rideSurface||!scene)return out
  const distance=from.distanceTo(result.point);this.query.ray.set(from,this.normal.subVectors(result.point,from).normalize());this.query.near=Math.max(.001,distance-2);this.query.far=distance+2
  let nearest=Infinity
  const intersect=(mesh,instanceId=null)=>{
   const matrix=this.worldMatrix(mesh,instanceId),g=mesh.geometry
   if(!g.boundingBox)g.computeBoundingBox()
   this.bounds.copy(g.boundingBox).applyMatrix4(matrix)
   if(this.bounds.distanceToPoint(result.point)>2||!this.query.ray.intersectsBox(this.bounds))return
   this.proxy.geometry=g;this.proxy.material=mesh.material;this.proxy.matrixWorld.copy(matrix);this.hits.length=0;this.query.intersectObject(this.proxy,false,this.hits)
   for(const hit of this.hits)if(hit.distance<nearest){nearest=hit.distance;out.point.copy(hit.point);out.normal.copy(hit.face.normal).applyNormalMatrix(this.normalMatrix.getNormalMatrix(matrix));if(out.normal.dot(this.query.ray.direction)>0)out.normal.negate();out.object=mesh;out.instanceId=instanceId}
  }
  const visit=node=>{
   if(!node.visible||node.userData.prewarmVFX||node.isSkinnedMesh||node===this.mesh||/(?:^|[_ ])(?:Scott|Cyclone|Gallant|Invid|Rand)(?:[_ ]|$)/i.test(node.name))return
   if(node.isMesh&&!node.userData.rideSurface){
    const materials=Array.isArray(node.material)?node.material:[node.material]
    if(materials.some(m=>m&&!m.transparent&&m.alphaTest<=.25)){
     if(node.isBatchedMesh){
      if(!node.boundingBox)node.computeBoundingBox()
      this.bounds.copy(node.boundingBox).applyMatrix4(node.matrixWorld)
      if(this.bounds.distanceToPoint(result.point)<=2){
       this.hits.length=0;this.query.intersectObject(node,false,this.hits)
       for(const hit of this.hits)if(hit.distance<nearest){nearest=hit.distance;const matrix=this.worldMatrix(node,hit.batchId);out.point.copy(hit.point);out.normal.copy(hit.face.normal).applyNormalMatrix(this.normalMatrix.getNormalMatrix(matrix));if(out.normal.dot(this.query.ray.direction)>0)out.normal.negate();out.object=node;out.instanceId=hit.batchId}
      }
     }else if(node.isInstancedMesh){
      if(!node.boundingBox)node.computeBoundingBox()
      this.bounds.copy(node.boundingBox).applyMatrix4(node.matrixWorld)
      if(this.bounds.distanceToPoint(result.point)<=2)for(let i=0;i<node.count;i++)intersect(node,i)
     }else intersect(node)
    }
   }
   for(const child of node.children)visit(child)
  }
  visit(scene);return out
 }
 spawn(contact){
  const r=this.records[this.cursor++%SURFACE_MARK_LIMIT];r.age=0;r.position.copy(contact.point);r.normal.copy(contact.normal).normalize();r.anchor=contact.object;r.instanceId=contact.instanceId;r.size=.25+(this.cursor%5)*.022;r.spin=this.cursor*2.39996
  if(r.anchor){this.inverse.copy(this.worldMatrix(r.anchor,r.instanceId)).invert();r.position.applyMatrix4(this.inverse);r.normal.applyNormalMatrix(this.normalMatrix.getNormalMatrix(this.inverse))}
  return r
 }
 update(dt){
  this.mesh.count=0
  for(const r of this.records){
   r.age+=Math.max(0,dt);if(r.age>=60)continue
   this.position.copy(r.position);this.normal.copy(r.normal)
   if(r.anchor){if(!r.anchor.parent){r.age=Infinity;continue}if(!r.anchor.visible||r.anchor.isBatchedMesh&&!r.anchor.getVisibleAt(r.instanceId))continue;const m=this.worldMatrix(r.anchor,r.instanceId);this.position.applyMatrix4(m);this.normal.applyNormalMatrix(this.normalMatrix.getNormalMatrix(m))}
   const i=this.mesh.count++;this.object.position.copy(this.position).addScaledVector(this.normal,.007);this.object.quaternion.setFromUnitVectors(axis,this.normal);this.object.rotateZ(r.spin);this.object.scale.set(r.size,r.size*.85,1);this.object.updateMatrix();this.mesh.setMatrixAt(i,this.object.matrix);this.geometry.attributes.aScorchOpacity.setX(i,clamp((60-r.age)/5))
  }
  if(this.mesh.count){this.mesh.instanceMatrix.needsUpdate=true;this.geometry.attributes.aScorchOpacity.needsUpdate=true}
 }
 clear(){for(const r of this.records){r.age=Infinity;r.anchor=null}this.mesh.count=0;this.cursor=0}
 dispose(){this.mesh.removeFromParent();this.mesh.dispose();this.geometry.dispose();this.material.dispose();this.map.dispose()}
}
