import fs from 'node:fs'
import {createRequire} from 'node:module'
import {readGlb,accessorData} from './glb-data.mjs'
const sharp=createRequire('C:/IT-UP/3D-LAB/package.json')('sharp'),dir='.local/shoulder-cleanup'
fs.mkdirSync(dir,{recursive:true})
const glb=readGlb('public/models/mospeada/scott-bernard-animated-original.glb'),primitive=glb.doc.meshes[0].primitives[0],uv=accessorData(glb,primitive.attributes.TEXCOORD_0).values,indices=accessorData(glb,primitive.indices).values.flat(),regions=JSON.parse(fs.readFileSync('artifacts/rig-hybrid/regions.json')).regions.filter(r=>/shoulder/.test(r.name)),W=2048,H=2048,ownership=new Uint8Array(W*H)
const original=await sharp('public/models/mospeada/scott-shoulders-color.png').removeAlpha().raw().toBuffer()
for(const [regionId,region]of regions.entries())for(const face of region.sourceTriangles){
 const p=indices.slice(face*3,face*3+3).map(i=>uv[i].map(v=>v*W)),area=(p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[1][1]-p[0][1])*(p[2][0]-p[0][0]);if(Math.abs(area)<1e-9)continue
 for(let y=Math.max(0,Math.floor(Math.min(...p.map(v=>v[1]))));y<=Math.min(H-1,Math.ceil(Math.max(...p.map(v=>v[1]))));y++)for(let x=Math.max(0,Math.floor(Math.min(...p.map(v=>v[0]))));x<=Math.min(W-1,Math.ceil(Math.max(...p.map(v=>v[0]))));x++){
  if([[0,1],[1,2],[2,0]].every(([a,b])=>((p[b][0]-p[a][0])*(y+.5-p[a][1])-(p[b][1]-p[a][1])*(x+.5-p[a][0]))/area>=-.001))ownership[y*W+x]=regionId+1
 }
}
fs.writeFileSync(dir+'/ownership.bin',ownership)
const flags=new Uint8Array(W*H),seen=new Uint8Array(W*H),components=[]
for(let i=0;i<flags.length;i++)if(ownership[i]){const [r,g,b]=original.subarray(i*3,i*3+3);if(Math.max(r,g,b)<100||r>g*1.11&&r-b>20)flags[i]=1}
for(let i=0;i<flags.length;i++)if(flags[i]&&!seen[i]){
 const queue=[i];seen[i]=1;let x0=W,y0=H,x1=0,y1=0
 for(let k=0;k<queue.length;k++){const j=queue[k],x=j%W,y=Math.floor(j/W);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);for(const n of [j-1,j+1,j-W,j+W])if(n>=0&&n<flags.length&&flags[n]&&!seen[n]&&ownership[n]===ownership[i]){seen[n]=1;queue.push(n)}}
 if(queue.length>=12)components.push({side:regions[ownership[i]-1].name,pixels:queue.length,box:[x0,y0,x1+1,y1+1]})
}
components.sort((a,b)=>b.pixels-a.pixels);fs.writeFileSync(dir+'/stains.json',JSON.stringify(components,null,2))
const pixels=Buffer.from(original);for(let i=0;i<ownership.length;i++)if(!ownership[i])pixels.fill(16,i*3,i*3+3)
await sharp(pixels,{raw:{width:W,height:H,channels:3}}).resize(1024).png().toFile(dir+'/shoulders-current.png')
for(const [i,c]of components.slice(0,12).entries()){const [x0,y0,x1,y1]=c.box,left=Math.max(0,x0-40),top=Math.max(0,y0-40),width=Math.min(W,left+Math.max(160,x1-x0+80))-left,height=Math.min(H,top+Math.max(160,y1-y0+80))-top;await sharp('public/models/mospeada/scott-shoulders-color.png').extract({left,top,width,height}).resize(width*3,height*3).png().toFile(dir+`/stain-${i}.png`)}
console.log(JSON.stringify(components.slice(0,16),null,2))
