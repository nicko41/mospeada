import fs from 'node:fs'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {readGlb,accessorData,writeGlb} from './glb-data.mjs'
import {loadPaletteSource,pixel} from './inspect-scott-palette.mjs'

// This pass reads the approved repair. It never reconstructs its surfaces.
const source='assets/01-SCOTT/scott-gear-v3-helmet-approved.glb'
const output='assets/01-SCOTT/scott-gear-v3-helmet-boundary.glb'
const publicOutput='public/models/mospeada/scott-gear-v3-helmet-boundary.glb'
const sharp=createRequire('C:/IT-UP/3D-LAB/package.json')('sharp')
const current=await loadPaletteSource(source),native=await loadPaletteSource('public/models/mospeada/scott-gear-v3-animated.glb')
const {g,positions,indices}=current,doc=structuredClone(g.doc),primitive=doc.meshes[0].primitives[0]
const uv=current.uv.map(v=>[...v]),nativeCount=native.positions.length,W=current.base.info.width,H=current.base.info.height
const occupied=new Uint8Array(W*H)
const blue=c=>c[2]>c[0]*1.12&&c[2]>c[1]*1.08
// Front is +Z. A depth contour through the upper plastics gives a near-vertical
// profile boundary. The small quadratic bend follows the crown symmetrically.
const boundary=y=>-.088+.008*Math.max(0,Math.min(1,(1.68-y)/.065))**2
const distance=p=>p[2]-boundary(p[1])
// Follow the existing arch above the ear rather than leave a rectangular step.
const lowerEdge=z=>1.595-3.3*(z+.085)**2
function raster(points,visit,padding=0){
 const [a,b,c]=points.map(v=>[v[0]*W,v[1]*H]),den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
 if(Math.abs(den)<1e-8)return
 const x0=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))-padding),x1=Math.min(W-1,Math.ceil(Math.max(a[0],b[0],c[0]))+padding)
 const y0=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))-padding),y1=Math.min(H-1,Math.ceil(Math.max(a[1],b[1],c[1]))+padding)
 const tolerance=padding?padding/Math.max(1,Math.min(Math.hypot(a[0]-b[0],a[1]-b[1]),Math.hypot(a[0]-c[0],a[1]-c[1]),Math.hypot(b[0]-c[0],b[1]-c[1]))):0
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
  const px=x+.5,py=y+.5,u=((b[1]-c[1])*(px-c[0])+(c[0]-b[0])*(py-c[1]))/den,v=((c[1]-a[1])*(px-c[0])+(a[0]-c[0])*(py-c[1]))/den,w=1-u-v
  if(u>=-tolerance&&v>=-tolerance&&w>=-tolerance)visit(y*W+x,[u,v,w],x,y)
 }
}
for(let f=0;f<indices.length;f+=3){
 const ids=indices.slice(f,f+3),coords=ids.map(i=>uv[i])
 raster(coords,i=>occupied[i]=1,2)
}
// Find unused atlas space for the already repaired faces, whose former UVs
// sampled single color texels. Only those local UVs need a spatial mapping.
const integral=new Uint32Array((W+1)*(H+1))
for(let y=0;y<H;y++){let row=0;for(let x=0;x<W;x++){row+=occupied[y*W+x];integral[(y+1)*(W+1)+x+1]=integral[y*(W+1)+x+1]+row}}
let tile=null
for(const size of [128,96,64,48,32]){
 for(let y=4;y<H-size-4&&!tile;y+=2)for(let x=4;x<W-size-4;x+=2){const sum=integral[(y+size)*(W+1)+x+size]-integral[y*(W+1)+x+size]-integral[(y+size)*(W+1)+x]+integral[y*(W+1)+x];if(sum===0){tile={x,y,size};break}}
 if(tile)break
}
assert.ok(tile,'No unused atlas tile for a local texture correction')
const base=Buffer.from(current.base.data),mr=Buffer.from(current.mr.data)
async function image(textureIndex){const v=doc.bufferViews[doc.images[doc.textures[textureIndex].source].bufferView];return sharp(g.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength)).ensureAlpha().raw().toBuffer({resolveWithObject:true})}
const normal=await image(doc.materials[0].normalTexture.index),normalData=Buffer.from(normal.data)
const samples=JSON.parse(fs.readFileSync('artifacts/scott-v3/helmet/validation.json')).atlasReferences
const white=samples.white.rgb,whiteMR=pixel(current.mr,samples.white.uv),blueColor=samples.blue.rgb,blueMR=pixel(native.mr,samples.blue.uv)
const changed=new Set()
const nearestFace=new Float32Array(W*H);nearestFace.fill(Infinity)
const localIndices=[],bodyIndices=[]
for(let f=0;f<indices.length;f+=3){const ids=indices.slice(f,f+3),local=ids.some(i=>i>=nativeCount)||ids.every(i=>positions[i][1]>1.54&&positions[i][2]<.05)&&ids.some(i=>positions[i][1]>1.565);(local?localIndices:bodyIndices).push(...ids)}
for(let f=0;f<indices.length;f+=3){
 const ids=indices.slice(f,f+3)
 if(ids.some(i=>i>=nativeCount)||ids.some(i=>positions[i][1]<1.565)||ids.every(i=>positions[i][1]<1.58)||ids.every(i=>positions[i][2]>.015))continue
 raster(ids.map(i=>uv[i]),(i,weights)=>{
  const error=weights.reduce((sum,w)=>sum+Math.max(0,-w),0)
  if(error>=nearestFace[i])return
  nearestFace[i]=error
  const k=i*4,original=[...native.base.data.subarray(k,k+3)],approved=[...current.base.data.subarray(k,k+3)]
  current.base.data.copy(base,k,k,k+4);current.mr.data.copy(mr,k,k,k+4)
  // Paint the existing visor atlas only. White plastics, the ear shells and
  // their molded details are left exactly as approved.
  const p=[0,1,2].map(c=>ids.reduce((sum,id,j)=>sum+positions[id][c]*weights[j],0))
  const upperPlastic=Math.abs(p[0])>.025&&Math.abs(p[0])<.075&&p[1]>1.653&&p[2]>-.115&&p[2]<-.04&&!blue(original)
  if(upperPlastic)return
  const d=distance(p),width=.0005,coverage=Math.max(0,Math.min(1,.5+d/width))
  const allowBlue=blue(approved)||p[1]>lowerEdge(p[2])
  if(!blue(original)&&!blue(approved)&&!(d>-.001&&allowBlue))return
  const t=allowBlue?coverage:0,shade=Math.max(.96,Math.min(1.04,.96+original[2]/255*.08))
  // The removed plastic left pale blue highlights baked into the native atlas.
  // Clear that local imprint rather than restoring it as part of the visor.
  const clamp=v=>Math.max(0,Math.min(1,v)),repair=clamp((Math.abs(p[0])-.07)/.015)*clamp((p[1]-1.57)/.02)*clamp((1.68-p[1])/.02)*clamp((p[2]+.125)/.015)*clamp((-.015-p[2])/.015)
  for(let c=0;c<3;c++){const paint=blue(original)?original[c]*(1-repair)+blueColor[c]*repair:blueColor[c],paintMR=blue(original)?native.mr.data[k+c]*(1-repair)+blueMR[c]*repair:blueMR[c];base[k+c]=Math.round(white[c]*shade*(1-t)+paint*t);mr[k+c]=Math.round(whiteMR[c]*(1-t)+paintMR*t)}
  changed.add(i)
 },2)
}
const localIds=[...new Set(indices.filter(i=>i>=nativeCount))],limits={y:[Infinity,-Infinity],z:[Infinity,-Infinity]}
for(const i of localIds){limits.y[0]=Math.min(limits.y[0],positions[i][1]);limits.y[1]=Math.max(limits.y[1],positions[i][1]);limits.z[0]=Math.min(limits.z[0],positions[i][2]);limits.z[1]=Math.max(limits.z[1],positions[i][2])}
const margin=4,span=tile.size-2*margin
for(const i of localIds)uv[i]=[(tile.x+margin+(positions[i][2]-limits.z[0])/(limits.z[1]-limits.z[0])*span)/W,(tile.y+margin+(positions[i][1]-limits.y[0])/(limits.y[1]-limits.y[0])*span)/H]
for(let y=tile.y;y<tile.y+tile.size;y++)for(let x=tile.x;x<tile.x+tile.size;x++){
 const p=[0,limits.y[0]+(y+.5-tile.y-margin)/span*(limits.y[1]-limits.y[0]),limits.z[0]+(x+.5-tile.x-margin)/span*(limits.z[1]-limits.z[0])]
 const t=Math.max(0,Math.min(1,.5+distance(p)/.0005))*Math.max(0,Math.min(1,.5+(p[1]-lowerEdge(p[2]))/.0006)),k=(y*W+x)*4
 for(let c=0;c<3;c++){base[k+c]=Math.round(white[c]*(1-t)+blueColor[c]*t);mr[k+c]=Math.round(whiteMR[c]*(1-t)+blueMR[c]*t);normalData[k+c]=[128,128,255][c]}
 base[k+3]=mr[k+3]=normalData[k+3]=255
}
let length=g.bin.length;const chunks=[g.bin]
function append(bytes){const pad=(-length)&3;if(pad){chunks.push(Buffer.alloc(pad));length+=pad}const view=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:length,byteLength:bytes.length});chunks.push(bytes);length+=bytes.length;return view}
const uvBytes=Buffer.from(new Float32Array(uv.flat()).buffer),uvAccessor=doc.accessors.length
doc.accessors.push({bufferView:append(uvBytes),componentType:5126,count:uv.length,type:'VEC2'})
const localPrimitive=structuredClone(primitive),localMaterial=structuredClone(doc.materials[primitive.material])
localMaterial.name='Scott V3 local visor boundary';localPrimitive.attributes.TEXCOORD_0=uvAccessor
// A separate local material prevents the native atlas's shared/filtering
// gutters from changing any body or face texel. No surface is added or moved.
for(const [slot,raw]of [[localMaterial.pbrMetallicRoughness.baseColorTexture,base],[localMaterial.pbrMetallicRoughness.metallicRoughnessTexture,mr],[localMaterial.normalTexture,normalData]]){
 const png=await sharp(raw,{raw:{width:W,height:H,channels:4}}).png().toBuffer(),oldTexture=doc.textures[slot.index],oldImage=doc.images[oldTexture.source],newImage=doc.images.length
 doc.images.push({...oldImage,bufferView:append(png)});slot.index=doc.textures.length;doc.textures.push({...oldTexture,source:newImage})
}
localPrimitive.material=doc.materials.length;doc.materials.push(localMaterial)
for(const [part,values]of [[primitive,bodyIndices],[localPrimitive,localIndices]]){part.indices=doc.accessors.length;doc.accessors.push({bufferView:append(Buffer.from(new Uint32Array(values).buffer)),componentType:5125,count:values.length,type:'SCALAR'})}
doc.meshes[0].primitives.push(localPrimitive)
doc.buffers[0].byteLength=length
doc.extras.helmetBoundary={source,scope:'local color/texture boundary only; approved geometry unchanged',depthAtCrown:-.088,curvature:.008}
async function fileWrite(action){for(let n=0;;n++){try{return action()}catch(error){if(n===7)throw error;await new Promise(resolve=>setTimeout(resolve,150*(n+1)))}}}
await fileWrite(()=>writeGlb(output,doc,Buffer.concat(chunks)))
await fileWrite(()=>fs.copyFileSync(output,publicOutput))
const result=readGlb(output),outPrimitive=result.doc.meshes[0].primitives[0]
for(const part of result.doc.meshes[0].primitives)for(const [name,id]of Object.entries(current.p.attributes))if(name!=='TEXCOORD_0')assert.deepEqual(accessorData(result,part.attributes[name]).values,accessorData(g,id).values,name)
assert.equal(bodyIndices.length+localIndices.length,indices.length)
const triangleSet=list=>new Set(Array.from({length:list.length/3},(_,f)=>list.slice(f*3,f*3+3).join(',')))
assert.deepEqual(triangleSet([...bodyIndices,...localIndices]),triangleSet(indices),'Every approved triangle is retained')
for(const key of ['nodes','skins','animations','samplers'])assert.deepEqual(result.doc[key],g.doc[key],key)
for(const key of ['materials','textures','images'])assert.deepEqual(result.doc[key].slice(0,g.doc[key].length),g.doc[key],key)
for(let i=0;i<nativeCount;i++)assert.deepEqual(uv[i],current.uv[i],'Nonrepair UV '+i)
assert.deepEqual(result.doc.meshes[0].primitives[0].attributes,current.p.attributes,'Original body attributes and UVs')
assert.ok(result.bin.subarray(0,g.bin.length).equals(g.bin),'All original texture payloads remain byte-exact')
const sha=b=>createHash('sha256').update(b).digest('hex')
const report={source,output,sourceSha256:sha(g.bytes),outputSha256:sha(result.bytes),texturePixels:changed.size,tile,localUVVertices:localIds.length,localMaterialTriangles:localIndices.length/3,bodyTriangles:bodyIndices.length/3,preserved:['all positions and normals bit-exact','every approved triangle unchanged, separated into material groups','all skin weights and joints bit-exact','rig, bind pose and animations','native UVs outside the already repaired faces','original body/face material and all original texture bytes','two upper plastics','approved lateral removals']}
fs.writeFileSync('artifacts/scott-v3/helmet/boundary-validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
