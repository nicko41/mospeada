import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
const sharp=createRequire('C:/IT-UP/3D-LAB/package.json')('sharp'),dir='artifacts/shoulder-cleanup',work='.local/shoulder-cleanup',W=2048,H=2048
fs.mkdirSync(dir,{recursive:true})
const source='public/models/mospeada/scott-shoulders-color.png',output='public/models/mospeada/scott-shoulders-color-clean-v2.png',original=await sharp(source).removeAlpha().raw().toBuffer(),result=Buffer.from(original),ownership=fs.readFileSync(work+'/ownership.bin'),mask=new Uint8Array(W*H)
const patches=[{id:'A',box:[654,2010,706,2031]},{id:'B',box:[1270,874,1317,916]},{id:'C',box:[1179,767,1207,790]}],crops=JSON.parse(fs.readFileSync(work+'/crops.json'))
for(const patch of patches){
 const crop=crops.find(c=>c.id===patch.id),paint=await sharp(`${work}/generated-${patch.id}.png`).resize(crop.width,crop.height).removeAlpha().raw().toBuffer(),[x0,y0,x1,y1]=patch.box
 fs.copyFileSync(`${work}/generated-${patch.id}.png`,`${dir}/paint-${patch.id}.png`)
 patch.changed=0
 for(let y=y0-3;y<Math.min(H,y1+3);y++)for(let x=x0-3;x<Math.min(W,x1+3);x++){
  const index=y*W+x;if(!ownership[index])continue
  const distance=Math.max(x0-x,0,x-(x1-1),y0-y,0,y-(y1-1)),weight=distance===0?1:(4-distance)/4
  const sample=((y-crop.top)*crop.width+x-crop.left)*3
  for(let channel=0;channel<3;channel++)result[index*3+channel]=Math.round(original[index*3+channel]*(1-weight)+paint[sample+channel]*weight)
  mask[index]=Math.round(255*weight);patch.changed++
 }
}
let changed=0,outsideShoulders=0,outsideMask=0
for(let i=0;i<W*H;i++)if([0,1,2].some(c=>result[i*3+c]!==original[i*3+c])){changed++;if(!ownership[i])outsideShoulders++;if(!mask[i])outsideMask++}
if(outsideShoulders||outsideMask)throw Error('La edición salió de las manchas de las hombreras')
await sharp(result,{raw:{width:W,height:H,channels:3}}).png().toFile(output)
await sharp(mask,{raw:{width:W,height:H,channels:1}}).png().toFile(dir+'/edited-texels.png')
const hash=path=>createHash('sha256').update(fs.readFileSync(path)).digest('hex'),preserved=Object.fromEntries(['public/models/mospeada/scott-bernard-animated-original.glb','public/models/mospeada/scott-shoulders-normal.png','public/models/mospeada/scott-shoulders-roughness.png'].map(path=>[path,hash(path)]))
const report={source,output,method:'Built-in imagegen edits composited only inside shoulder-owned stain texels',patches,changedTexels:changed,outsideShoulders,outsideMask,preserved}
fs.writeFileSync(dir+'/texture-validation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
