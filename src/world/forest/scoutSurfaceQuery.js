import {BackSide,Box3,FrontSide,Matrix4,Ray,Triangle,Vector3} from 'three'

// Shared immutable topology. Bounds retain each contributing joint separately,
// so even the blended seams follow the current pose without reskinning a whole
// Scout or approximating its armour by gameplay boxes.
const prepared=new WeakMap()
function* build(geometry){
 const p=geometry.attributes.position,skin=geometry.attributes.skinIndex,w=geometry.attributes.skinWeight,index=geometry.index,count=(index?.count??p.count)/3
 const centers=new Float32Array(count*3),vertex=(face,k)=>index?index.getX(face*3+k):face*3+k,point=new Vector3()
 for(let face=0;face<count;face++){for(let k=0;k<3;k++){const id=vertex(face,k);for(let a=0;a<3;a++)centers[face*3+a]+=p.getComponent(id,a)/3}if(face%1024===0)yield}
 let leaves=0
 function* node(ids){
  const boxes=[]
  if(ids.length<=24){
   for(const face of ids)for(let k=0;k<3;k++){
    const id=vertex(face,k);point.fromBufferAttribute(p,id)
    for(let a=0;a<4;a++)if(w.getComponent(id,a)>0){const joint=skin.getComponent(id,a);(boxes[joint]||=new Box3()).expandByPoint(point)}
   }
   if(++leaves%64===0)yield
   return{boxes,ids}
  }
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity]
  for(let n=0;n<ids.length;n++){const id=ids[n];for(let a=0;a<3;a++){const v=centers[id*3+a];min[a]=Math.min(min[a],v);max[a]=Math.max(max[a],v)}if(n%1024===0)yield}
  let axis=0;for(let a=1;a<3;a++)if(max[a]-min[a]>max[axis]-min[axis])axis=a
  const middle=(min[axis]+max[axis])*.5;let a=[],b=[]
  for(let n=0;n<ids.length;n++){const id=ids[n];(centers[id*3+axis]<middle?a:b).push(id);if(n%1024===0)yield}
  if(!a.length||!b.length){a=ids.slice(0,ids.length>>1);b=ids.slice(ids.length>>1)}
  const left=yield* node(a),right=yield* node(b)
  for(let i=0;i<Math.max(left.boxes.length,right.boxes.length);i++){if(left.boxes[i])boxes[i]=left.boxes[i].clone();if(right.boxes[i]){if(boxes[i])boxes[i].union(right.boxes[i]);else boxes[i]=right.boxes[i].clone()}}
  return{boxes,left,right}
 }
 const root=yield* node(Array.from({length:count},(_,i)=>i))
 return{root,vertex,positions:new Float64Array(p.count*3),stamps:new Uint32Array(p.count),serial:0,transforms:[],inverse:new Matrix4(),ray:new Ray(),bounds:new Box3(),box:new Box3(),a:new Vector3(),b:new Vector3(),c:new Vector3(),point:new Vector3(),world:new Vector3(),triangles:0,nodes:0}
}
export function* prepareScoutSurfaceSteps(mesh){
 const g=mesh?.geometry
 if(!mesh?.isSkinnedMesh||g.morphAttributes.position?.length||Array.isArray(mesh.material))return null
 let q=prepared.get(g);if(!q){q=yield* build(g);prepared.set(g,q)}return q
}
export function prepareScoutSurface(mesh){const steps=prepareScoutSurfaceSteps(mesh);let step;do{step=steps.next()}while(!step.done);return step.value}
export function scoutSurfaceStats(mesh){const q=prepared.get(mesh.geometry);return q?{triangles:q.triangles,nodes:q.nodes}:null}
export function intersectScoutSurface(view,raycaster,hits){
 const mesh=view.levels[view.lod||0],q=prepared.get(mesh.geometry)
 if(!q||!mesh.isSkinnedMesh)return raycaster.intersectObject(mesh,false,hits)
 q.serial=(q.serial+1)>>>0;if(!q.serial){q.stamps.fill(0);q.serial=1}
 q.triangles=q.nodes=0;q.ray.copy(raycaster.ray).applyMatrix4(q.inverse.copy(mesh.matrixWorld).invert())
 for(let i=0;i<mesh.skeleton.bones.length;i++)(q.transforms[i]||=new Matrix4()).copy(mesh.bindMatrixInverse).multiply(mesh.skeleton.bones[i].matrixWorld).multiply(mesh.skeleton.boneInverses[i]).multiply(mesh.bindMatrix)
 const side=mesh.material.side;let closest=Infinity,hit=null
 const vertex=(id,out)=>{if(q.stamps[id]!==q.serial){mesh.getVertexPosition(id,out);out.toArray(q.positions,id*3);q.stamps[id]=q.serial}else out.fromArray(q.positions,id*3)}
 function visit(node){
  q.nodes++;q.bounds.makeEmpty()
  for(let i=0;i<node.boxes.length;i++)if(node.boxes[i])q.bounds.union(q.box.copy(node.boxes[i]).applyMatrix4(q.transforms[i]))
  q.bounds.expandByScalar(1e-5)
  if(!q.ray.intersectsBox(q.bounds))return
  if(!node.ids){visit(node.left);visit(node.right);return}
  for(const face of node.ids){
   q.triangles++;const a=q.vertex(face,0),b=q.vertex(face,1),c=q.vertex(face,2);vertex(a,q.a);vertex(b,q.b);vertex(c,q.c)
   const point=side===BackSide?q.ray.intersectTriangle(q.c,q.b,q.a,true,q.point):q.ray.intersectTriangle(q.a,q.b,q.c,side===FrontSide,q.point)
   if(!point)continue
   q.world.copy(point).applyMatrix4(mesh.matrixWorld);const distance=q.world.distanceTo(raycaster.ray.origin)
   if(distance<raycaster.near||distance>raycaster.far||distance>=closest)continue
   closest=distance;hit={distance,point:q.world.clone(),object:mesh,faceIndex:face,face:{a,b,c,normal:Triangle.getNormal(q.a,q.b,q.c,new Vector3()),materialIndex:0}}
  }
 }
 visit(q.root);if(hit)hits.push(hit);return hits
}
