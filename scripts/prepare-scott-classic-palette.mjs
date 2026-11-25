// Material-only variant: never reskin, repose, split, or rewrite geometry.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {createRequire} from 'node:module'
import {loadPaletteSource,analyze,region,colorClass,pixel} from './inspect-scott-palette.mjs'
import {accessorData,readGlb,writeGlb} from './glb-data.mjs'
const sharp=createRequire('C:/IT-UP/3D-LAB/package.json')('sharp'),directory='artifacts/scott-palette'
fs.mkdirSync(directory,{recursive:true})
const input='public/models/mospeada/scott-bernard-gear-v2-animated.glb',output='public/models/mospeada/scott-bernard-gear-v2-classic-palette.glb'
const source=await loadPaletteSource(input),reference=await loadPaletteSource('public/models/mospeada/scott-bernard-animated-original.glb'),oldPalette=analyze(reference),currentPalette=analyze(source)
const {width,height}=source.base.info
assert.equal(source.mr.info.width,width);assert.equal(source.mr.info.height,height)
const ids={helmet:1,visor:2,chest:3,pelvis:4,thigh:5,knee:6,shin:7,boot:8,arms:255},mask=new Uint8Array(width*height),owners=accessorData(source.g,source.p.attributes._RIGID_OWNER).values
function raster(uv,id){
 const q=uv.map(([u,v])=>[u*width,v*height]),[a,b,c]=q,den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-8)return
 const minX=Math.max(0,Math.floor(Math.min(...q.map(p=>p[0])))),maxX=Math.min(width-1,Math.ceil(Math.max(...q.map(p=>p[0])))),minY=Math.max(0,Math.floor(Math.min(...q.map(p=>p[1])))),maxY=Math.min(height-1,Math.ceil(Math.max(...q.map(p=>p[1]))))
 for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){const u=((b[1]-c[1])*(x+.5-c[0])+(c[0]-b[0])*(y+.5-c[1]))/den,v=((c[1]-a[1])*(x+.5-c[0])+(a[0]-c[0])*(y+.5-c[1]))/den;if(u< -1e-6||v< -1e-6||u+v>1.000001)continue;const i=y*width+x;if(mask[i]!==ids.visor||id===ids.visor)mask[i]=id}
}
for(let f=0;f<source.indices.length;f+=3){
 const vertices=source.indices.slice(f,f+3),p=[0,1,2].map(k=>vertices.reduce((a,i)=>a+source.positions[i][k],0)/3),uv=vertices.map(i=>source.uv[i]);let name=region(p)
 // Include the entire low chin guard; a horizontal cut at the upper shell's
 // height leaves metallic triangles along that separate lower component.
 if(p[1]>1.415&&Math.abs(p[0])<.125)name='helmet'
 else if(name==='helmet')name='chest'
 if(p[1]>1.32&&Math.abs(p[0])>.17||vertices.some(i=>[9,13].includes(owners[i][0])))name='arms' // Existing shoulder pads stay untouched.
 if(name==='helmet'){
  const center=[0,1].map(k=>uv.reduce((s,p)=>s+p[k],0)/3)
  if(colorClass(pixel(source.base,center))==='blue'||uv.filter(point=>colorClass(pixel(source.base,point))==='blue').length>=2)name='visor'
 }
 raster(uv,ids[name])
}
// Extend each island's own pixels into atlas padding, without crossing another
// mapped surface. This avoids filtered seams while preserving arm/visor islands.
for(let step=0;step<3;step++){const previous=mask.slice();for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){const i=y*width+x;if(previous[i])continue;for(const n of[i-1,i+1,i-width,i+width])if(previous[n]){mask[i]=previous[n];break}}}
const base=Buffer.from(source.base.data),mr=Buffer.from(source.mr.data),counts={},delta={}
for(const part of['chest','pelvis','thigh','knee','shin','boot'])delta[part]=oldPalette[part+':green'].median.map((v,k)=>v-currentPalette[part+':green'].median[k])
const reverse=Object.fromEntries(Object.entries(ids).map(([k,v])=>[v,k])),smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)},clamp=v=>Math.max(0,Math.min(255,Math.round(v)))
let protectedVisorPixels=0
for(let i=0;i<mask.length;i++){
 const part=reverse[mask[i]],o=i*4,rgb=Array.from(source.base.data.subarray(o,o+3)),type=colorClass(rgb)
 if(part==='visor'){protectedVisorPixels++;continue}
 if(part==='helmet'){
  // Also guard blue texels on mixed triangles at the visor's boundary.
  if(type==='blue'){protectedVisorPixels++;continue}
  mr[o+2]=0;mr[o+1]=Math.max(mr[o+1],183)
  const luma=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2],spread=Math.max(...rgb)-Math.min(...rgb)
  if(luma>55&&spread<80){const shade=luma/230;for(let k=0;k<3;k++)base[o+k]=clamp([242,240,235][k]*shade)}
  counts.helmet=(counts.helmet??0)+1
 }else if(delta[part]&&type==='green'){
  const spread=Math.max(...rgb)-Math.min(...rgb),strength=smooth(8,18,spread)*smooth(45,80,rgb[1]);if(!strength)continue
  for(let k=0;k<3;k++)base[o+k]=clamp(rgb[k]+delta[part][k]*strength)
  counts[part]=(counts[part]??0)+1
 }
}
const colorPng=await sharp(base,{raw:{width,height,channels:4}}).png().toBuffer(),pbrPng=await sharp(mr,{raw:{width,height,channels:4}}).png().toBuffer()
fs.writeFileSync(directory+'/classic-base-color.png',colorPng);fs.writeFileSync(directory+'/classic-metallic-roughness.png',pbrPng)
const doc=structuredClone(source.g.doc),chunks=[source.g.bin];let length=source.g.bin.length
function appendImage(bytes,imageIndex,name){while(length%4){chunks.push(Buffer.alloc(1));length++}const view=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:length,byteLength:bytes.length});chunks.push(bytes);length+=bytes.length;doc.images[imageIndex]={bufferView:view,mimeType:'image/png',name}}
const material=doc.materials[source.p.material],baseImage=doc.textures[material.pbrMetallicRoughness.baseColorTexture.index].source,pbrImage=doc.textures[material.pbrMetallicRoughness.metallicRoughnessTexture.index].source
appendImage(colorPng,baseImage,'Scott V2 classic palette');appendImage(pbrPng,pbrImage,'Scott V2 white nonmetal helmet')
material.name='Scott_V2_ClassicPalette';doc.buffers[0].byteLength=length
writeGlb(output,doc,Buffer.concat(chunks))
const result=readGlb(output)
for(const key of['meshes','nodes','skins','animations','accessors'])assert.deepEqual(result.doc[key],source.g.doc[key],key+' must not change')
assert.ok(result.bin.subarray(0,source.g.bin.length).equals(source.g.bin),'All original binary data must survive intact')
let visorDifferences=0,helmetMetalPixels=0
for(let i=0;i<mask.length;i++){const o=i*4;if(mask[i]===ids.visor||mask[i]===ids.helmet&&colorClass(Array.from(source.base.data.subarray(o,o+3)))==='blue'){for(let k=0;k<4;k++)if(base[o+k]!==source.base.data[o+k]||mr[o+k]!==source.mr.data[o+k])visorDifferences++}if(mask[i]===ids.helmet&&mr[o+2]>0&&colorClass(Array.from(source.base.data.subarray(o,o+3)))!=='blue')helmetMetalPixels++}
assert.equal(visorDifferences,0);assert.equal(helmetMetalPixels,0)
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),report={input,output,sourceSha256:sha(input),outputSha256:sha(output),reference:'Scott original: area-weighted regional diffuse palette',counts,delta,protectedVisorPixels,visorDifferences,helmetMetalPixels,geometryUnchanged:true,skinningUnchanged:true,rigAndAnimationsUnchanged:true,originalBinaryPreserved:true,sourceFilesOverwritten:false}
fs.writeFileSync(directory+'/material-variant.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
