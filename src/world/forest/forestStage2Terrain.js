import {createNaturalCanyon} from './forestCanyon.js'
import {BufferGeometry,Float32BufferAttribute} from 'three'
import {forestBaseSurfaceHeight} from './forestLayout.js'
import {FOREST_STAGE2 as S,stage2PathX,stage2Smooth,inForestStage2,stage2Void,stage2EdgeBend,stage2LipZ} from './forestStage2Config.js'

export function stage2Height(x,z){
  const q=-z-400
  const t=stage2Smooth(0,80,q),cross=x-stage2PathX(z)
  let h=S.plateau
  if(q<80){const edge=forestBaseSurfaceHeight(x,-400),slope=(forestBaseSurfaceHeight(x,-396)-edge)/4;h=edge*(1-t)+S.plateau*t-slope*q*(1-stage2Smooth(0,35,q))}
  h+=(Math.sin(x*.06+z*.013)*1.2+Math.sin(z*.042-x*.037)*.5)*t*stage2Smooth(5,38,Math.abs(cross))
  h+=8*stage2Smooth(75,220,Math.abs(cross))*t
  const f=S.first
  if(z<f.startZ&&z>f.endZ){const rise=z>f.crestZ?stage2Smooth(0,1,(f.startZ-z)/(f.startZ-f.crestZ)):1-stage2Smooth(0,1,(f.crestZ-z)/(f.crestZ-f.endZ));h+=f.height*rise*(1-stage2Smooth(5,20,Math.abs(cross)))*(1+.055*Math.sin(x*.5+z*.19))}
  const c=S.canyon
  if(z<c.approachZ&&z>=c.lipZ)h+=c.rise*Math.max(0,Math.min(1,(c.approachZ-z)/(c.approachZ-c.lipZ)))**1.5
  // Broad level run-out: a fast landing must not immediately launch again
  // down a receding slope. Future continuation can join at this same height.
  if(z<=c.landingZ)h+=c.landingHeight-S.plateau
  return h
}
// Same one-metre diagonal as the rendered top meshes. No collision support in
// the gap: -Infinity is intentional and handled explicitly by the vehicle.
export function stage2MappedZ(x,z){
  if(z>=S.canyon.lipZ&&z<S.canyon.lipZ+32)return z+stage2EdgeBend(x)*stage2Smooth(0,32,S.canyon.lipZ+32-z)
  if(z<=S.canyon.landingZ&&z>S.canyon.landingZ-32)return z-stage2EdgeBend(x,true)*(1-stage2Smooth(0,32,S.canyon.landingZ-z))
  return z
}
function baseZ(x,z){
  let lo,hi
  if(z<S.canyon.lipZ+32&&z>=stage2LipZ(x)){lo=S.canyon.lipZ;hi=lo+32}
  else if(z>S.canyon.landingZ-32&&z<=stage2LipZ(x,true)){hi=S.canyon.landingZ;lo=hi-32}
  else return z
  for(let i=0;i<10;i++){const mid=(lo+hi)/2;if(stage2MappedZ(x,mid)>z)hi=mid;else lo=mid}return (lo+hi)/2
}
function vertex(x,z){const mapped=stage2MappedZ(x,z);return [x,Math.fround(stage2Height(x,mapped)),Math.fround(mapped)]}
function triangleHeight(x,z,a,b,c){const den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]),u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den;return u>=-1e-6&&v>=-1e-6&&u+v<=1.000001?u*a[1]+v*b[1]+(1-u-v)*c[1]:null}
export function stage2SurfaceHeight(x,z){
  if(!inForestStage2(x,z)||stage2Void(x,z))return -Infinity
  const outer=x< -S.detailHalfWidth||x>=S.detailHalfWidth,sx=outer?4:1,sz=outer?2:1,x0=Math.min(S.halfWidth-sx,Math.floor(x/sx)*sx),row=Math.floor(baseZ(x,z)/sz)*sz
  if(z>S.canyon.lipZ+33||z<S.canyon.landingZ-33){
    const z0=Math.min(S.startZ-sz,Math.max(S.endZ,row)),u=(x-x0)/sx,v=(z-z0)/sz,a=stage2Height(x0,z0),b=stage2Height(x0,z0+sz),c=stage2Height(x0+sx,z0),d=stage2Height(x0+sx,z0+sz)
    return u+v<=1?a+(c-a)*u+(b-a)*v:d+(b-d)*(1-u)+(c-d)*(1-v)
  }
  for(let dz=-1;dz<=1;dz++){const z0=row+dz*sz;if(z0<S.endZ||z0+sz>S.startZ||z0<S.canyon.lipZ&&z0+sz>S.canyon.landingZ)continue;const a=vertex(x0,z0),b=vertex(x0,z0+sz),c=vertex(x0+sx,z0),d=vertex(x0+sx,z0+sz),h=triangleHeight(x,z,a,b,c)??triangleHeight(x,z,d,c,b);if(h!==null)return h}
  return -Infinity
}
function topChunk(minZ,maxZ,minX=-S.detailHalfWidth,maxX=S.detailHalfWidth,sx=1,sz=1){
  const vertices=[],uv=[],indices=[],columns=(maxX-minX)/sx+1,rows=(maxZ-minZ)/sz
  for(let row=0;row<=rows;row++)for(let col=0;col<columns;col++){const x=minX+col*sx,z=stage2MappedZ(x,minZ+row*sz);vertices.push(x,stage2Height(x,z),z);uv.push((x+400)/800,1-(z+400)/800)}
  for(let row=0;row<rows;row++)for(let col=0;col<columns-1;col++){const a=row*columns+col,b=a+columns,c=a+1,d=b+1;indices.push(a,b,c,c,b,d)}
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(vertices,3));g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g
}
export function createStage2Terrain(){
  const tops=[]
  for(const [min,max]of [[S.canyon.lipZ,S.startZ],[S.endZ,S.canyon.landingZ]])for(let z=min;z<max;z+=S.chunkLength){const end=Math.min(max,z+S.chunkLength);tops.push(topChunk(z,end),topChunk(z,end,-S.halfWidth,-S.detailHalfWidth,4,2),topChunk(z,end,S.detailHalfWidth,S.halfWidth,4,2))}
  return {tops,...createNaturalCanyon(stage2Height)}
}
