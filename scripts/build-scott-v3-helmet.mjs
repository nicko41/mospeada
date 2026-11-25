import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {ShapeUtils,Vector2,Vector3} from 'three'
import {readGlb,accessorData,writeGlb} from './glb-data.mjs'
import {loadPaletteSource,pixel,colorClass} from './inspect-scott-palette.mjs'

const source='public/models/mospeada/scott-gear-v3-animated.glb',output='assets/01-SCOTT/scott-gear-v3-helmet-corrected.glb',publicOutput='public/models/mospeada/scott-gear-v3-helmet-corrected.glb',dir='artifacts/scott-v3/helmet'
const sharp=createRequire('C:/IT-UP/3D-LAB/package.json')('sharp')
fs.mkdirSync(dir,{recursive:true})
const s=await loadPaletteSource(source),g=s.g,doc=structuredClone(g.doc),p=doc.meshes[0].primitives[0],originalAttributes=Object.fromEntries(Object.entries(p.attributes).map(([k,a])=>[k,accessorData(g,a)])),positions=s.positions,indices=s.indices
const sha=b=>createHash('sha256').update(b).digest('hex'),beforeSha=sha(g.bytes),count=positions.length
const vertexData=Object.fromEntries(Object.entries(originalAttributes).map(([k,a])=>[k,a.values.map(v=>[...v])]))
const canonicalMap=new Map(),canonical=positions.map((v,i)=>{const key=v.map(n=>Math.round(n*1e6)).join(',');if(!canonicalMap.has(key))canonicalMap.set(key,i);return canonicalMap.get(key)})
const bounds={y:[1.608,1.659],z:[-.107,-.032],minX:.078},patches=[],removed=new Set(),recolorFaces=[],allNewTriangles=[],copiedFrom=[]
const rgb=i=>pixel(s.base,s.uv[i])
const normalImage=g.doc.images[g.doc.textures[g.doc.materials[0].normalTexture.index].source],normalView=g.doc.bufferViews[normalImage.bufferView],normalPixels=await sharp(g.bin.subarray(normalView.byteOffset,normalView.byteOffset+normalView.byteLength)).ensureAlpha().raw().toBuffer({resolveWithObject:true})
const W=s.base.info.width,H=s.base.info.height,whiteMask=new Uint8Array(W*H),protectedMask=new Uint8Array(W*H),repairNormalMask=new Uint8Array(W*H)
const topTab=i=>Math.abs(positions[i][0])>.025&&Math.abs(positions[i][0])<.075&&positions[i][1]>1.653&&positions[i][2]>-.115&&positions[i][2]<-.04
function raster(polygon,mask){
 for(let f=1;f<polygon.length-1;f++){
  const [a,b,c]=[polygon[0],polygon[f],polygon[f+1]].map(v=>[v[0]*W,v[1]*H]),den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-8)continue
  const minX=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),maxX=Math.min(W-1,Math.ceil(Math.max(a[0],b[0],c[0]))),minY=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),maxY=Math.min(H-1,Math.ceil(Math.max(a[1],b[1],c[1])))
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){const px=x+.5,py=y+.5,u=((b[1]-c[1])*(px-c[0])+(c[0]-b[0])*(py-c[1]))/den,v=((c[1]-a[1])*(px-c[0])+(a[0]-c[0])*(py-c[1]))/den;if(u>=0&&v>=0&&u+v<=1)mask[y*W+x]=1}
 }
}

// Reuse flat samples of the original helmet atlas for the two local repairs.
// Existing body UVs and native skin weights remain untouched.
function reference(kind){
 let best=null
 for(let i=0;i<count;i++){
  const [x,y,z]=positions[i],c=rgb(i)
  if(kind==='white'?(y<1.49||y>1.59||z>-.125||Math.abs(x)>.075||colorClass(c)!=='white'):(y<1.63||y>1.69||z<-.12||z>.055||Math.abs(x)>.125||y+.5*z<1.625||colorClass(c)!=='blue'))continue
  const target=kind==='white'?[205,210,210]:[4,42,155],normal=pixel(normalPixels,s.uv[i]),score=c.reduce((n,v,k)=>n+(v-target[k])**2,0)+8*((normal[0]-128)**2+(normal[1]-128)**2+(normal[2]-255)**2)
  if(!best||score<best.score)best={id:i,score,uv:s.uv[i],rgb:c}
 }
 if(!best)throw Error('Helmet atlas reference missing: '+kind)
 return best
}
const references={white:reference('white'),blue:reference('blue')}
function atlasUV(position,kind){const base=references[kind].uv;return [base[0]+position[2]*.0001,base[1]+(position[1]-1.6)*.0001]}
function solve(matrix,rhs){
 const n=rhs.length,a=matrix.map((row,i)=>[...row,rhs[i]])
 for(let k=0;k<n;k++){
  let pivot=k;for(let i=k+1;i<n;i++)if(Math.abs(a[i][k])>Math.abs(a[pivot][k]))pivot=i
  if(Math.abs(a[pivot][k])<1e-12)throw Error('Singular local helmet surface')
  ;[a[k],a[pivot]]=[a[pivot],a[k]];const scale=a[k][k];for(let j=k;j<=n;j++)a[k][j]/=scale
  for(let i=0;i<n;i++)if(i!==k){const f=a[i][k];for(let j=k;j<=n;j++)a[i][j]-=f*a[k][j]}
 }
 return a.map(row=>row[n])
}
const kernel=r2=>r2<1e-14?0:.5*r2*Math.log(r2)
function localSurface(boundary,side){
 const points=boundary.map(i=>[(positions[i][1]-1.635)/.03,(positions[i][2]+.07)/.045]),n=points.length,N=n+3,m=Array.from({length:N},()=>Array(N).fill(0)),rhs=Array(N).fill(0)
 for(let i=0;i<n;i++){
  rhs[i]=Math.abs(positions[boundary[i]][0]);for(let j=0;j<n;j++)m[i][j]=kernel((points[i][0]-points[j][0])**2+(points[i][1]-points[j][1])**2)
  m[i][i]+=1e-8;m[i][n]=m[n][i]=1;m[i][n+1]=m[n+1][i]=points[i][0];m[i][n+2]=m[n+2][i]=points[i][1]
 }
 const coefficients=solve(m,rhs)
 const evaluate=(y,z)=>{const u=(y-1.635)/.03,v=(z+.07)/.045;let x=coefficients[n]+coefficients[n+1]*u+coefficients[n+2]*v;for(let i=0;i<n;i++)x+=coefficients[i]*kernel((u-points[i][0])**2+(v-points[i][1])**2);return x}
 return (y,z)=>{const x=evaluate(y,z),eps=1e-5,dy=(evaluate(y+eps,z)-evaluate(y-eps,z))/(2*eps),dz=(evaluate(y,z+eps)-evaluate(y,z-eps))/(2*eps),normal=new Vector3(side,-dy,-dz).normalize().toArray();return {position:[side*x,y,z],normal}}
}
function appendVertex(original,position,normal,kind,uv=null){
 const id=vertexData.POSITION.length
 copiedFrom.push(original)
 for(const [name,values]of Object.entries(vertexData))values.push(name==='POSITION'?[...position]:name==='NORMAL'?[...normal]:name==='TEXCOORD_0'?(uv||atlasUV(position,kind)):[...originalAttributes[name].values[original]])
 return id
}
const seam=position=>position[1]+.5*position[2]-1.603
function clipMaterial(records,white){
 const result=[]
 for(let i=0;i<records.length;i++){
  const a=records[i],b=records[(i+1)%records.length],da=seam(a.position),db=seam(b.position),inside=white?da<=0:da>=0,nextInside=white?db<=0:db>=0
  if(inside)result.push(a)
  if(inside!==nextInside){const t=da/(da-db),position=a.position.map((v,k)=>v+(b.position[k]-v)*t),normal=new Vector3(...a.normal).lerp(new Vector3(...b.normal),t).normalize().toArray(),uv=a.uv&&b.uv?a.uv.map((v,k)=>v+(b.uv[k]-v)*t):null;result.push({position,normal,uv,original:t<.5?a.original:b.original})}
 }
 return result
}
function emitMaterialTriangles(records,preserveBlueUV=false){
 const result=[]
 for(const kind of ['white','blue']){
  const polygon=clipMaterial(records,kind==='white')
  for(let i=1;i<polygon.length-1;i++)result.push([polygon[0],polygon[i],polygon[i+1]].map(r=>appendVertex(r.original,r.position,r.normal,kind,kind==='blue'&&preserveBlueUV?r.uv:null)))
 }
 return result
}

for(const side of [-1,1]){
 const selected=[],edges=new Map()
 for(let f=0;f<indices.length;f+=3){const ids=indices.slice(f,f+3),c=[0,1,2].map(k=>ids.reduce((sum,i)=>sum+positions[i][k],0)/3)
  if(c[0]*side>bounds.minX&&c[1]>bounds.y[0]&&c[1]<bounds.y[1]&&c[2]>bounds.z[0]&&c[2]<bounds.z[1])selected.push(f/3)
 }
 for(const f of selected){removed.add(f);const ids=indices.slice(f*3,f*3+3).map(i=>canonical[i]);for(let k=0;k<3;k++){const a=ids[k],b=ids[(k+1)%3],key=a<b?a+','+b:b+','+a,e=edges.get(key)||{n:0,a,b};e.n++;edges.set(key,e)}}
 const boundaryEdges=[...edges.values()].filter(e=>e.n===1),neighbors=new Map()
 for(const e of boundaryEdges)for(const [a,b]of [[e.a,e.b],[e.b,e.a]]){if(!neighbors.has(a))neighbors.set(a,[]);neighbors.get(a).push(b)}
 if([...neighbors.values()].some(v=>v.length!==2))throw Error('Helmet cut is not one closed manifold boundary')
 const boundary=[boundaryEdges[0].a];let previous=-1,current=boundary[0]
 while(true){const next=neighbors.get(current).find(i=>i!==previous);if(next===boundary[0])break;if(boundary.includes(next))throw Error('Self-intersecting helmet boundary');boundary.push(next);previous=current;current=next}
 if(boundary.length!==boundaryEdges.length)throw Error('Unexpected second helmet hole')
 const surface=localSurface(boundary,side),contour=boundary.map(i=>new Vector2(positions[i][1],positions[i][2])),triangles=ShapeUtils.triangulateShape(contour,[])
 if(triangles.length!==boundary.length-2)throw Error('Helmet boundary could not be filled')
 const interior=[...new Set(selected.flatMap(f=>indices.slice(f*3,f*3+3)))],points=boundary.map(id=>({position:positions[id],normal:originalAttributes.NORMAL.values[id],original:id})),midpoints=new Map(),replacement=[]
 function addPoint(y,z){const sample=surface(y,z);let original=interior[0],best=Infinity;for(const i of interior){const distance=(positions[i][1]-y)**2+(positions[i][2]-z)**2;if(distance<best){best=distance;original=i}}if(Math.abs(sample.position[0])<.06||Math.abs(sample.position[0])>.14)throw Error('Local surface escaped helmet envelope');points.push({...sample,original});return points.length-1}
 for(const [a,b,c]of triangles){
  const ring=[]
  for(const [u,v]of [[a,b],[b,c],[c,a]]){
   ring.push(u)
   if((u+1)%boundary.length===v||(v+1)%boundary.length===u)continue
   const key=u<v?u+','+v:v+','+u
   if(!midpoints.has(key))midpoints.set(key,addPoint((points[u].position[1]+points[v].position[1])/2,(points[u].position[2]+points[v].position[2])/2))
   ring.push(midpoints.get(key))
  }
  const center=addPoint((points[a].position[1]+points[b].position[1]+points[c].position[1])/3,(points[a].position[2]+points[b].position[2]+points[c].position[2])/3)
  for(let i=0;i<ring.length;i++)replacement.push([center,ring[i],ring[(i+1)%ring.length]])
 }
 for(const t of replacement){
  let records=t.map(i=>points[i])
  const a=new Vector3(...records[0].position),b=new Vector3(...records[1].position),d=new Vector3(...records[2].position),normal=b.sub(a).cross(d.sub(a));if(normal.x*side<0)records=[records[0],records[2],records[1]]
  allNewTriangles.push(...emitMaterialTriangles(records))
 }
 patches.push({side,removedFaces:selected.length,boundaryVertices:boundary.length,replacementFaces:replacement.length,min:[0,1,2].map(k=>Math.min(...points.map(v=>v.position[k]))),max:[0,1,2].map(k=>Math.max(...points.map(v=>v.position[k])))})
}

const updatedIndices=[]
const cutVertices=new Set([...removed].flatMap(f=>indices.slice(f*3,f*3+3).map(i=>canonical[i])))
const repairVertices=new Set(cutVertices)
for(let f=0;f<indices.length;f+=3){const ids=indices.slice(f,f+3);if(ids.some(i=>cutVertices.has(canonical[i])))for(const i of ids)repairVertices.add(canonical[i])}
for(let f=0;f<indices.length;f+=3){
 const ids=indices.slice(f,f+3),c=[0,1,2].map(k=>ids.reduce((sum,i)=>sum+positions[i][k]/3,0)),uv=[0,1].map(k=>ids.reduce((sum,i)=>sum+s.uv[i][k]/3,0)),blueish=c=>c[2]>c[0]*1.10&&c[2]>c[1]*1.05,blue=blueish(pixel(s.base,uv))||ids.some(i=>blueish(rgb(i)))
 if(ids.some(i=>positions[i][1]<1.43)||ids.every(i=>positions[i][2]>-.02)||ids.some(topTab))raster(ids.map(i=>s.uv[i]),protectedMask)
 const localRepair=ids.some(i=>repairVertices.has(canonical[i]))
 if(localRepair)raster(ids.map(i=>s.uv[i]),repairNormalMask)
 // This plane follows the open visor's existing rear/lateral junction.
 // Never recolor its frontal dome, face, chin, or the two retained top tabs.
 if(c[1]>1.58&&c[2]<-.025&&ids.some(i=>seam(positions[i])<0)){recolorFaces.push(f/3);const white=clipMaterial(ids.map(i=>({position:positions[i],normal:originalAttributes.NORMAL.values[i],original:i,uv:s.uv[i]})),true);raster(white.map(v=>v.uv),whiteMask)}
 if(!removed.has(f/3))updatedIndices.push(...ids)
}
for(const triangle of allNewTriangles)updatedIndices.push(...triangle)

let length=g.bin.length;const chunks=[g.bin]
function append(values,componentType,type){
 const padding=(-length)&3;if(padding){chunks.push(Buffer.alloc(padding));length+=padding}
 const ArrayType={5121:Uint8Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array}[componentType];if(!ArrayType)throw Error('Unsupported source component type '+componentType)
 const typed=new ArrayType(values.flat()),bytes=Buffer.from(typed.buffer),view=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:length,byteLength:bytes.length});chunks.push(bytes);length+=bytes.length
 const accessor=doc.accessors.length,entry={bufferView:view,componentType,count:values.length,type}
 if(type==='VEC3'){entry.min=[0,1,2].map(k=>values.reduce((n,v)=>Math.min(n,v[k]),Infinity));entry.max=[0,1,2].map(k=>values.reduce((n,v)=>Math.max(n,v[k]),-Infinity))}
 doc.accessors.push(entry);return accessor
}
for(const [name,values]of Object.entries(vertexData)){const a=originalAttributes[name].accessor;p.attributes[name]=append(values,a.componentType,a.type)}
p.indices=append(updatedIndices.map(i=>[i]),5125,'SCALAR')
// This libvips build expands white coverage with erode (black morphology).
// Include atlas gutters so filtering cannot reveal the removed blue bevel.
const smoothWhite=await sharp(Buffer.from(whiteMask.map(v=>v*255)),{raw:{width:W,height:H,channels:1}}).erode(2).blur(.5).extractChannel(0).raw().toBuffer()
const smoothNormal=await sharp(Buffer.from(repairNormalMask.map(v=>v*255)),{raw:{width:W,height:H,channels:1}}).erode(2).blur(1).extractChannel(0).raw().toBuffer()
if(smoothWhite.length!==W*H||smoothNormal.length!==W*H)throw Error('Invalid local atlas mask')
const newAlbedo=Buffer.from(s.base.data),newMR=Buffer.from(s.mr.data),newNormal=Buffer.from(normalPixels.data),whiteMR=pixel(s.mr,references.white.uv);let repaintedPixels=0,protectedPixels=0
for(let i=0;i<whiteMask.length;i++)if(smoothWhite[i]){
 if(protectedMask[i]){protectedPixels++;continue}
 const k=i*4,original=[s.base.data[k],s.base.data[k+1],s.base.data[k+2]]
 if(!smoothNormal[i]&&!(original[2]>original[0]*1.035&&original[2]>original[1]*1.02))continue
 const shade=Math.max(.93,Math.min(1.04,.96+original[2]/255*.08))
 const mix=smoothWhite[i]/255
 for(let c=0;c<3;c++){newAlbedo[k+c]=Math.round(s.base.data[k+c]*(1-mix)+references.white.rgb[c]*shade*mix);newMR[k+c]=Math.round(s.mr.data[k+c]*(1-mix)+whiteMR[c]*mix)}
 repaintedPixels++
}
for(let i=0;i<smoothNormal.length;i++)if(smoothNormal[i]&&!protectedMask[i])for(let c=0;c<3;c++)newNormal[i*4+c]=Math.round(newNormal[i*4+c]*(1-smoothNormal[i]/255)+[128,128,255][c]*smoothNormal[i]/255)
async function replaceImage(textureIndex,raw){
 const png=await sharp(raw,{raw:{width:W,height:H,channels:4}}).png().toBuffer(),padding=(-length)&3;if(padding){chunks.push(Buffer.alloc(padding));length+=padding}
 const view=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:length,byteLength:png.length});chunks.push(png);length+=png.length;doc.images[doc.textures[textureIndex].source].bufferView=view
}
await replaceImage(doc.materials[0].pbrMetallicRoughness.baseColorTexture.index,newAlbedo)
await replaceImage(doc.materials[0].pbrMetallicRoughness.metallicRoughnessTexture.index,newMR)
await replaceImage(doc.materials[0].normalTexture.index,newNormal)
doc.buffers[0].byteLength=length
doc.extras={...doc.extras,helmetCorrection:{source,sourceSha256:beforeSha,scope:'two lateral tabs removed and local white shell continuation; open visor preserved'}}
writeGlb(output,doc,Buffer.concat(chunks));fs.copyFileSync(output,publicOutput)
const corrected=readGlb(output)
for(const key of ['nodes','skins','animations','materials','textures','samplers'])if(JSON.stringify(g.doc[key])!==JSON.stringify(corrected.doc[key]))throw Error('Protected model data changed: '+key)
if(!corrected.bin.subarray(0,g.bin.length).equals(g.bin))throw Error('Original model binary was altered')
for(const [name,original]of Object.entries(originalAttributes)){
 const actual=accessorData(corrected,p.attributes[name]).values
 for(let i=0;i<count;i++)for(let k=0;k<original.components;k++)if(actual[i][k]!==original.values[i][k])throw Error('Original vertex attribute changed: '+name+' '+i)
 if(name==='JOINTS_0'||name==='WEIGHTS_0')for(let i=0;i<copiedFrom.length;i++)for(let k=0;k<original.components;k++)if(actual[count+i][k]!==original.values[copiedFrom[i]][k])throw Error('Local skin data is not an exact native copy')
}
if(sha(fs.readFileSync(source))!==beforeSha)throw Error('Source GLB was modified')
const report={source,output,publicOutput,sourceSha256:beforeSha,outputSha256:sha(corrected.bytes),patches,recoloredFaces:recolorFaces.length,repaintedPixels,protectedPixels,originalVertices:count,localDuplicatedOrReconstructedVertices:vertexData.POSITION.length-count,originalTriangles:indices.length/3,correctedTriangles:updatedIndices.length/3,atlasReferences:references,preserved:['source GLB','all original binary bytes','all body geometry and UVs','native rig hierarchy','all original joint indices and weights','bind pose','all animations','all material definitions','all body/front visor/top-tab texture pixels','open visor and top tabs','face and chin','helmet transform'],skinPolicy:'Local duplicate/reconstruction vertices copy native joint indices and weights directly; no weight generation or transfer from another model'}
fs.writeFileSync(dir+'/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
