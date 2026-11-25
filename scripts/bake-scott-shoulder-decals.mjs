import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {Vector3} from 'three'
import {readGlb,accessorData} from './glb-data.mjs'

// Project the supplied insignia onto the original bind-space armor and bake
// into its existing UV atlas. No mesh, rig, animation or runtime draw changes.
const sharp=createRequire('C:/IT-UP/3D-LAB/package.json')('sharp'),dir='artifacts/shoulder-decals',W=2048,H=2048
fs.mkdirSync(dir,{recursive:true})
const source='public/models/mospeada/scott-shoulders-color-clean-v2.png',output='public/models/mospeada/scott-shoulders-decals.png',base=await sharp(source).removeAlpha().raw().toBuffer(),paint=Buffer.from(base),mask=new Uint8Array(W*H)
const glb=readGlb('public/models/mospeada/scott-bernard-animated-original.glb'),primitive=glb.doc.meshes[0].primitives[0],positions=accessorData(glb,primitive.attributes.POSITION).values,normals=accessorData(glb,primitive.attributes.NORMAL).values,uvs=accessorData(glb,primitive.attributes.TEXCOORD_0).values,indices=accessorData(glb,primitive.indices).values.flat(),regions=JSON.parse(fs.readFileSync('artifacts/rig-hybrid/regions.json')).regions
const definitions=[
 {side:'Right',file:'assets/texturas/decals/rango.png',center:[-.2515,1.410,-.045],normal:[-.35,.94,-.05],up:[1,0,0],width:.075},
 {side:'Left',file:'assets/texturas/decals/21.png',center:[.2515,1.410,-.045],normal:[.35,.94,-.05],up:[-1,0,0],width:.075},
]
const point=new Vector3(),normal=new Vector3(),delta=new Vector3(),reports=[]
for(const definition of definitions){
 const {data,info}=await sharp(definition.file).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true})
 let x0=info.width,y0=info.height,x1=0,y1=0
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>8){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y)}
 const pixelWidth=x1-x0+1,pixelHeight=y1-y0+1,height=definition.width*pixelHeight/pixelWidth,center=new Vector3().fromArray(definition.center),out=new Vector3().fromArray(definition.normal).normalize(),up=new Vector3().fromArray(definition.up).projectOnPlane(out).normalize(),right=new Vector3().crossVectors(up,out).normalize()
 const sample=(u,v)=>{
  const x=x0+u*(pixelWidth-1),y=y0+v*(pixelHeight-1),ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,result=[0,0,0,0]
  for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){const weight=(dx?fx:1-fx)*(dy?fy:1-fy),index=(Math.min(y1,iy+dy)*info.width+Math.min(x1,ix+dx))*4;for(let c=0;c<4;c++)result[c]+=data[index+c]*weight}return result
 }
 let texels=0,box=[W,H,0,0]
 const visited=new Set(),region=regions.find(r=>r.name===`Rigid_${definition.side}_shoulder`)
 for(const face of region.sourceTriangles){
  const ids=indices.slice(face*3,face*3+3),uv=ids.map(i=>uvs[i].map(v=>v*W)),den=(uv[1][1]-uv[2][1])*(uv[0][0]-uv[2][0])+(uv[2][0]-uv[1][0])*(uv[0][1]-uv[2][1]);if(Math.abs(den)<1e-9)continue
  for(let y=Math.max(0,Math.floor(Math.min(...uv.map(p=>p[1]))));y<=Math.min(H-1,Math.ceil(Math.max(...uv.map(p=>p[1]))));y++)for(let x=Math.max(0,Math.floor(Math.min(...uv.map(p=>p[0]))));x<=Math.min(W-1,Math.ceil(Math.max(...uv.map(p=>p[0]))));x++){
   const a=((uv[1][1]-uv[2][1])*(x+.5-uv[2][0])+(uv[2][0]-uv[1][0])*(y+.5-uv[2][1]))/den,b=((uv[2][1]-uv[0][1])*(x+.5-uv[2][0])+(uv[0][0]-uv[2][0])*(y+.5-uv[2][1]))/den,c=1-a-b
   if(Math.min(a,b,c)<-.001)continue
   point.set(0,0,0);normal.set(0,0,0);for(const [i,w]of [[ids[0],a],[ids[1],b],[ids[2],c]]){point.x+=positions[i][0]*w;point.y+=positions[i][1]*w;point.z+=positions[i][2]*w;normal.x+=normals[i][0]*w;normal.y+=normals[i][1]*w;normal.z+=normals[i][2]*w}
   delta.subVectors(point,center);if(Math.abs(delta.dot(out))>.035||normal.normalize().dot(out)<.25)continue
   const u=.5+delta.dot(right)/definition.width,v=.5-delta.dot(up)/height;if(u<0||u>1||v<0||v>1)continue
   const index=y*W+x;if(visited.has(index))continue;visited.add(index)
   const rgba=sample(u,v),alpha=rgba[3]/255;if(alpha<.01)continue
   for(let channel=0;channel<3;channel++)paint[index*3+channel]=Math.round(base[index*3+channel]*(1-alpha)+rgba[channel]*alpha)
   mask[index]=definition.side==='Right'?127:255;texels++;box=[Math.min(box[0],x),Math.min(box[1],y),Math.max(box[2],x),Math.max(box[3],y)]
  }
 }
 if(texels<40)throw Error('Insignia fuera de la superficie: '+definition.side)
 reports.push({...definition,height,trim:[x0,y0,x1,y1],texels,uvBounds:box})
}
let changed=0,outsideDecals=0;for(let i=0;i<W*H;i++)if([0,1,2].some(c=>paint[i*3+c]!==base[i*3+c])){changed++;if(!mask[i])outsideDecals++}if(outsideDecals)throw Error('La composición cambió texeles ajenos a las insignias')
await sharp(paint,{raw:{width:W,height:H,channels:3}}).png().toFile(output)
await sharp(mask,{raw:{width:W,height:H,channels:1}}).png().toFile(dir+'/decal-texels.png')
const hash=path=>createHash('sha256').update(fs.readFileSync(path)).digest('hex'),report={source,output,decals:reports,changedTexels:changed,outsideDecals,preserved:Object.fromEntries([source,'public/models/mospeada/scott-bernard-animated-original.glb','public/models/mospeada/scott-shoulders-normal.png','public/models/mospeada/scott-shoulders-roughness.png',...definitions.map(d=>d.file)].map(path=>[path,hash(path)]))}
fs.writeFileSync(dir+'/validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
