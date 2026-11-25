// Local, reversible rear-surface edit. No rig/weights/poses/topology are rebuilt.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {createRequire} from 'node:module'
import {Matrix3,Vector3} from 'three'
import {readGlb,accessorData,writeGlb} from './glb-data.mjs'
import {loadPaletteSource,pixel,colorClass} from './inspect-scott-palette.mjs'
const sharp=createRequire('C:/IT-UP/3D-LAB/package.json')('sharp')
const dir='artifacts/scott-rear-refinement',input='public/models/mospeada/scott-bernard-gear-v2-classic-palette.glb',output=process.argv[2]||'public/models/mospeada/scott-bernard-gear-v2-rear-refined.glb'
fs.mkdirSync(dir,{recursive:true})
const parameters={pelvisDrop:.016,headCenter:[.004,1.585,.012],headRadii:[.105,.115,.116],headBlend:.72,flatCenterY:1.027,flatHalfWidth:.077,flatFadeWidth:.089,flatBottom:.994,flatTop:1.056}
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)},lerp=(a,b,t)=>a+(b-a)*t
const source=await loadPaletteSource(input),g=source.g,doc=structuredClone(g.doc),binary=Buffer.from(g.bin),pData=accessorData(g,source.p.attributes.POSITION),nData=accessorData(g,source.p.attributes.NORMAL),positions=pData.values,normals=nData.values,uv=source.uv
const protectedVisor=new Uint8Array(positions.length)
for(let f=0;f<source.indices.length;f+=3){const ids=source.indices.slice(f,f+3),center=[0,1,2].map(k=>ids.reduce((sum,id)=>sum+positions[id][k],0)/3);if(center[1]<1.415||Math.abs(center[0])>.14)continue;const tex=[0,1].map(k=>ids.reduce((sum,id)=>sum+uv[id][k],0)/3);if(colorClass(pixel(source.base,tex))==='blue')for(const id of ids)protectedVisor[id]=1}
for(let id=15429;id<positions.length;id++)if(positions[id][1]>1.415&&colorClass(pixel(source.base,uv[id]))==='blue')protectedVisor[id]=1
const pointKey=p=>p.map(v=>Math.round(v*1e6)).join(','),protectedPoints=new Set();for(let id=15429;id<positions.length;id++)if(protectedVisor[id])protectedPoints.add(pointKey(positions[id]));for(let id=15429;id<positions.length;id++)if(protectedPoints.has(pointKey(positions[id])))protectedVisor[id]=1

// Fit the existing rear panel's plane from its undisturbed outer strips.
const rows=[],colors=[],matrix=new Matrix3().set(0,0,0,0,0,0,0,0,0),rhs=new Vector3(),sum=new Float64Array(9)
for(let id=15429;id<positions.length;id++){const[x,y,z]=positions[id];if(Math.abs(x)<.083||Math.abs(x)>.105||y<1.002||y>1.059||z>-.09||normals[id][2]>-.7)continue;const rgb=pixel(source.base,uv[id]);if(colorClass(rgb)!=='green'||Math.min(...rgb)<95)continue;const q=[x,y-parameters.flatCenterY,1];rows.push([x,y,z]);colors.push(rgb);for(let i=0;i<3;i++)for(let j=0;j<3;j++)sum[i*3+j]+=q[i]*q[j];rhs.addScaledVector(new Vector3(...q),z)}
assert.ok(rows.length>12,'Rear panel must be identified before editing')
// The side wings curve away from the center. Fit depth from the central top
// and bottom strips instead, so flattening does not recess the whole panel.
rows.length=0;sum.fill(0);rhs.set(0,0,0)
for(let id=15429;id<positions.length;id++){const[x,y,z]=positions[id];if(Math.abs(x)>.05||y<.980||y>1.068||y>.997&&y<1.056||z>-.103||normals[id][2]>-.7)continue;const q=[x,y-parameters.flatCenterY,1];rows.push([x,y,z]);for(let i=0;i<3;i++)for(let j=0;j<3;j++)sum[i*3+j]+=q[i]*q[j];rhs.addScaledVector(new Vector3(...q),z)}
assert.ok(rows.length>12,'Central rear panel boundary must be identified')
matrix.set(...sum);assert.ok(Math.abs(matrix.determinant())>1e-12);const plane=rhs.applyMatrix3(matrix.invert()).toArray(),fill=[0,1,2].map(k=>colors.map(c=>c[k]).sort((a,b)=>a-b)[Math.floor(colors.length/2)])
function cleanupWeight([x,y,z]){return(1-smooth(parameters.flatHalfWidth,parameters.flatFadeWidth,Math.abs(x)))*smooth(.983,parameters.flatBottom,y)*(1-smooth(parameters.flatTop,1.069,y))*(1-smooth(-.101,-.086,z))}
function pelvisWeight([x,y,z]){return smooth(.900,.924,y)*(1-smooth(1.080,1.112,y))*(1-smooth(.12,.16,Math.abs(x)))*(1-smooth(-.075,-.015,z))}
function deform(point,allowHead=true){
 const[x,y,z]=point,out=point.slice(),drop=pelvisWeight(point);out[1]-=parameters.pelvisDrop*drop
 const flat=cleanupWeight(point),targetZ=plane[0]*x+plane[1]*(y-parameters.flatCenterY)+plane[2]
 // Retain 0.5% of the submillimetric relief to avoid collapsing near-vertical
 // micro-triangles; the visible panel is planar within a few micrometres.
 out[2]=lerp(z,targetZ,flat*.995)
 if(allowHead&&y>1.52&&z<-.008&&Math.abs(x-parameters.headCenter[0])<.118){
  const q=point.map((v,k)=>v-parameters.headCenter[k]),radius=Math.hypot(...q.map((v,k)=>v/parameters.headRadii[k])),weight=parameters.headBlend*smooth(1.52,1.565,y)*(1-smooth(-.040,-.008,z))*(1-smooth(.090,.118,Math.abs(q[0])))
  if(radius>1)for(let k=0;k<3;k++)out[k]=lerp(out[k],parameters.headCenter[k]+q[k]/radius,weight)
 }
 return out
}
const view=new DataView(binary.buffer,binary.byteOffset,binary.byteLength),changed=[],newPositions=positions.map(p=>p.slice()),newNormals=normals.map(n=>n.slice()),counts={pelvis:0,flatPanel:0,helmet:0},extent={pelvis:0,helmet:0},epsilon=1e-5
for(let id=15429;id<positions.length;id++){
 const point=positions[id],allowHead=!protectedVisor[id],next=deform(point,allowHead),distance=Math.hypot(...next.map((v,k)=>v-point[k]));if(distance<1e-10)continue
 const derivatives=[0,1,2].map(axis=>{const a=point.slice(),b=point.slice();a[axis]+=epsilon;b[axis]-=epsilon;return deform(a,allowHead).map((v,k)=>(v-deform(b,allowHead)[k])/(2*epsilon))}),jac=new Matrix3().set(derivatives[0][0],derivatives[1][0],derivatives[2][0],derivatives[0][1],derivatives[1][1],derivatives[2][1],derivatives[0][2],derivatives[1][2],derivatives[2][2])
 assert.ok(Math.abs(jac.determinant())>1e-7,'Local edit must remain invertible')
 const normal=new Vector3(...normals[id]).applyMatrix3(jac.invert().transpose()).normalize().toArray();assert.ok(normal.every(Number.isFinite))
 for(let k=0;k<3;k++){view.setFloat32(pData.offset+id*pData.stride+k*4,next[k],true);view.setFloat32(nData.offset+id*nData.stride+k*4,normal[k],true)}
 newPositions[id]=next;newNormals[id]=normal;changed.push(id)
 if(pelvisWeight(point)>0){counts.pelvis++;extent.pelvis=Math.max(extent.pelvis,Math.abs(next[1]-point[1]))}if(cleanupWeight(point)>0)counts.flatPanel++;if(point[1]>1.415){counts.helmet++;extent.helmet=Math.max(extent.helmet,distance)}
}
assert.ok(counts.helmet>100&&counts.pelvis>100&&counts.flatPanel>10)
assert.ok(extent.pelvis<=.016001&&extent.helmet<.025)
// Anchor-reference prefix and the approved front/limbs are immutable.
for(let id=0;id<positions.length;id++)if(id<15429||positions[id][2]>=.012||positions[id][1]>1.13&&positions[id][1]<1.415||Math.abs(positions[id][0])>.20||positions[id][1]<.90||protectedVisor[id])assert.deepEqual(newPositions[id],positions[id],'Protected vertex '+id)
let newlyCollapsed=0;const area=(a,b,c)=>new Vector3(...b).sub(new Vector3(...a)).cross(new Vector3(...c).sub(new Vector3(...a))).length()
for(let i=0;i<source.indices.length;i+=3){const ids=source.indices.slice(i,i+3),before=area(...ids.map(id=>positions[id])),after=area(...ids.map(id=>newPositions[id]));if(before>1e-10&&after<1e-12)newlyCollapsed++}
assert.equal(newlyCollapsed,0,'No new degenerate triangles')

// Clear only the rear inset's existing UV texels, including its fake cavity,
// bevel and normal-map imprint. Other textures/UV islands remain unchanged.
const{width,height}=source.base.info,paint=new Float32Array(width*height),occupied=new Uint8Array(width*height),protectedUv=new Uint8Array(width*height)
// Closely packed UV islands can share filtering pixels. Keep a guard around
// every unedited surface's UV vertices, so padding cannot recolor a boot/visor.
for(let id=15429;id<positions.length;id++)if(cleanupWeight(positions[id])===0){const x=Math.floor(uv[id][0]*width),y=Math.floor(uv[id][1]*height);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(x+dx>=0&&x+dx<width&&y+dy>=0&&y+dy<height)protectedUv[(y+dy)*width+x+dx]=1}
for(let f=0;f<source.indices.length;f+=3){
 const ids=source.indices.slice(f,f+3),affected=ids.some(id=>cleanupWeight(positions[id])>0)
 const q=ids.map(id=>[uv[id][0]*width,uv[id][1]*height]),[a,b,c]=q,den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-8)continue
 const minX=Math.max(0,Math.floor(Math.min(...q.map(p=>p[0])))),maxX=Math.min(width-1,Math.ceil(Math.max(...q.map(p=>p[0])))),minY=Math.max(0,Math.floor(Math.min(...q.map(p=>p[1])))),maxY=Math.min(height-1,Math.ceil(Math.max(...q.map(p=>p[1]))))
 for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){const u=((b[1]-c[1])*(x+.5-c[0])+(c[0]-b[0])*(y+.5-c[1]))/den,v=((c[1]-a[1])*(x+.5-c[0])+(a[0]-c[0])*(y+.5-c[1]))/den;if(u<0||v<0||u+v>1)continue;const i=y*width+x;occupied[i]=1;if(!affected)continue;const p=[0,1,2].map(k=>positions[ids[0]][k]*u+positions[ids[1]][k]*v+positions[ids[2]][k]*(1-u-v)),w=cleanupWeight(p);paint[i]=Math.max(paint[i],w)}
}
// Extend only into unused UV padding. Linear/mip filtering otherwise samples
// the old dark inset along UV seams even though the mapped faces are clean.
for(let i=0;i<paint.length;i++)if(protectedUv[i])paint[i]=0
for(let step=0;step<4;step++){const previous=paint.slice();for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){const i=y*width+x;if(occupied[i]||protectedUv[i])continue;paint[i]=Math.max(previous[i],previous[i-1],previous[i+1],previous[i-width],previous[i+width])}}
const material=doc.materials[source.p.material],normalImage=doc.textures[material.normalTexture.index].source,normalInfo=doc.images[normalImage],normalView=doc.bufferViews[normalInfo.bufferView],normalSource=await sharp(g.bin.subarray(normalView.byteOffset,normalView.byteOffset+normalView.byteLength)).ensureAlpha().raw().toBuffer({resolveWithObject:true})
assert.equal(normalSource.info.width,width);assert.equal(normalSource.info.height,height)
const base=Buffer.from(source.base.data),mr=Buffer.from(source.mr.data),normal=Buffer.from(normalSource.data)
const materialSamples=rows.map(p=>{let best=0,d=Infinity;for(let id=15429;id<positions.length;id++){const q=positions[id],distance=Math.abs(q[0]-p[0])+Math.abs(q[1]-p[1])+Math.abs(q[2]-p[2]);if(distance<d){d=distance;best=id}}return pixel(source.mr,uv[best])}),mrFill=[0,1,2].map(k=>materialSamples.map(c=>c[k]).sort((a,b)=>a-b)[Math.floor(materialSamples.length/2)])
let painted=0;for(let i=0;i<paint.length;i++){const w=paint[i];if(!w)continue;painted++;for(let k=0;k<3;k++){base[i*4+k]=Math.round(lerp(base[i*4+k],fill[k],w));normal[i*4+k]=Math.round(lerp(normal[i*4+k],[128,128,255][k],w));mr[i*4+k]=Math.round(lerp(mr[i*4+k],mrFill[k],w))}}
const images=[{index:doc.textures[material.pbrMetallicRoughness.baseColorTexture.index].source,data:base,name:'Scott V2 clean rear panel color'},{index:normalImage,data:normal,name:'Scott V2 clean rear panel normal'},{index:doc.textures[material.pbrMetallicRoughness.metallicRoughnessTexture.index].source,data:mr,name:'Scott V2 clean rear panel PBR'}],extra=[];let length=binary.length
for(const im of images){const bytes=await sharp(im.data,{raw:{width,height,channels:4}}).png().toBuffer(),old=doc.images[im.index],oldView=doc.bufferViews[old.bufferView];let index=old.bufferView
 if(bytes.length<=oldView.byteLength){binary.fill(0,oldView.byteOffset,oldView.byteOffset+oldView.byteLength);bytes.copy(binary,oldView.byteOffset);oldView.byteLength=bytes.length}
 else{while(length%4){extra.push(Buffer.alloc(1));length++}index=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:length,byteLength:bytes.length});extra.push(bytes);length+=bytes.length}
 doc.images[im.index]={bufferView:index,mimeType:'image/png',name:im.name}
}
const posAccessor=doc.accessors[source.p.attributes.POSITION];posAccessor.min=[Infinity,Infinity,Infinity];posAccessor.max=[-Infinity,-Infinity,-Infinity];for(const p of newPositions)for(let k=0;k<3;k++){posAccessor.min[k]=Math.min(posAccessor.min[k],p[k]);posAccessor.max[k]=Math.max(posAccessor.max[k],p[k])}doc.buffers[0].byteLength=length
writeGlb(output,doc,Buffer.concat([binary,...extra]))
const result=readGlb(output);for(const key of['nodes','skins','animations','meshes'])assert.deepEqual(result.doc[key],g.doc[key],key+' unchanged')
const readRaw=(glb,index)=>{const a=glb.doc.accessors[index],v=glb.doc.bufferViews[a.bufferView];return glb.bin.subarray((v.byteOffset||0)+(a.byteOffset||0),(v.byteOffset||0)+(a.byteOffset||0)+a.count*({SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type])*({5121:1,5123:2,5125:4,5126:4}[a.componentType]))}
for(const name of['TEXCOORD_0','JOINTS_0','WEIGHTS_0','_RIGID_OWNER'])assert.ok(readRaw(result,source.p.attributes[name]).equals(readRaw(g,source.p.attributes[name])),name+' bytes unchanged')
assert.ok(readRaw(result,source.p.indices).equals(readRaw(g,source.p.indices)))
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'),report={input,output,inputSha256:hash(input),outputSha256:hash(output),parameters,plane,fill,mrFill,counts,maximumDisplacement:extent,changedVertices:changed.length,paintedTexels:painted,newlyCollapsedTriangles:newlyCollapsed,frontAndVisorUnchanged:true,referenceAnchorsUnchanged:true,weightsUVTopologyRigAnimationsUnchanged:true,originalsOverwritten:false}
fs.writeFileSync(dir+'/refinement.json',JSON.stringify(report,null,2));fs.writeFileSync(dir+'/changed-vertices.json',JSON.stringify(changed));console.log(JSON.stringify(report,null,2))
