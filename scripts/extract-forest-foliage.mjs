import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {readRgbaPng,writeRgbaPng,components} from './foliage-png.mjs'

const source='assets/texturas/pasto/vegetacion01.png',root='public/foliage/forest',reportDir='artifacts/forest-foliage-library'
fs.mkdirSync(root,{recursive:true});fs.mkdirSync(reportDir,{recursive:true})
const image=readRgbaPng(source),clean=image.pixels.slice(),statistics={lowAlphaRemoved:0,greenResidueRemoved:0,edgeDespill:0,isolatedPixelsRemoved:0}
for(let i=0;i<clean.length;i+=4){
  const r=clean[i],g=clean[i+1],b=clean[i+2],a=clean[i+3],excess=g-Math.max(r,b)
  if(!a)continue
  if(a<=12){clean.fill(0,i,i+4);statistics.lowAlphaRemoved++;continue}
  // Inspection confirms that ALL these chroma-green residues have alpha <97.
  // Never key or recolour opaque illustrated leaves, including yellow tips.
  if(a<128&&g>180&&excess>100){clean.fill(0,i,i+4);statistics.greenResidueRemoved++;continue}
  if(a<128&&excess>55&&g>130){clean[i+1]=Math.min(g,Math.max(r,b)+45);statistics.edgeDespill++}
}
// Reviewed regions follow actual plant groups, not a regular slicing grid.
// Detached clover leaves, grain heads and small stones belong to their group.
const regions=[
  ['pasto','pasto-bajo-01',[0,128,140,110],[.25,.4]],
  ['pasto','pasto-bajo-02',[140,82,165,153],[.35,.55]],
  ['pasto','pasto-bajo-03',[306,99,154,130],[.3,.48]],
  ['pasto','pasto-medio-01',[460,72,203,164],[.45,.7]],
  ['pasto','pasto-alto-01',[663,0,317,239],[.65,1.05]],
  ['pasto','pasto-alto-02',[980,0,391,239],[.7,1.15]],
  ['pasto','pasto-ancho-01',[1371,0,403,247],[.65,1.0]],
  ['pasto','pasto-extendido-01',[0,239,280,148],[.4,.65]],
  ['hierbas','roseta-01',[280,239,299,148],[.38,.65]],
  ['hierbas','hierba-baja-01',[579,239,236,139],[.25,.45]],
  ['hierbas','hojas-anchas-01',[815,239,201,152],[.4,.68]],
  ['hierbas','hierba-vertical-01',[1016,239,176,148],[.45,.75]],
  ['hierbas','treboles-01',[1192,239,279,175],[.25,.45]],
  ['hierbas','treboles-02',[1471,247,303,167],[.3,.5]],
  ['arbustos','arbusto-hojas-01',[0,387,455,256],[.65,1.05]],
  ['arbustos','arbusto-hojas-02',[455,378,449,257],[.7,1.15]],
  ['arbustos','arbusto-hojas-03',[904,389,383,246],[.65,1.05]],
  ['hierbas','roseta-02',[1287,414,269,224],[.4,.65]],
  ['arbustos','arbusto-flores-01',[1556,422,218,216],[.5,.8]],
  ['helechos','helecho-01',[0,643,369,244],[.45,.75]],
  ['hierbas','hojas-anchas-02',[369,643,381,244],[.5,.8]],
  ['pasto','pasto-espigas-01',[750,634,349,253],[.85,1.3]],
  ['vegetacion-con-rocas','rocas-plantas-01',[1099,644,435,243],[.4,.65]],
  ['vegetacion-con-rocas','rocas-plantas-02',[1534,644,240,243],[.35,.6]],
]
const atlas={width:2048,height:2048,pixels:new Uint8Array(2048*2048*4)},entries=[]
function bleedRgb(pixels,width,height,iterations){
  let known=new Uint8Array(width*height);for(let i=0;i<known.length;i++)known[i]=pixels[i*4+3]>0?1:0
  for(let pass=0;pass<iterations;pass++){const next=known.slice();for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x;if(known[i])continue;for(const [dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=width||yy>=height)continue;const j=yy*width+xx;if(known[j]){pixels[i*4]=pixels[j*4];pixels[i*4+1]=pixels[j*4+1];pixels[i*4+2]=pixels[j*4+2];next[i]=1;break}}}known=next}
}
for(const [index,[category,id,region,heightRange]]of regions.entries()){
  const [rx,ry,rw,rh]=region,local=new Uint8Array(rw*rh*4)
  for(let y=0;y<rh;y++)for(let x=0;x<rw;x++)local.set(clean.subarray(((ry+y)*image.width+rx+x)*4,((ry+y)*image.width+rx+x)*4+4),(y*rw+x)*4)
  const {labels,found}=components(rw,rh,local,13)
  for(let i=0;i<labels.length;i++)if(labels[i]>=0&&found[labels[i]].count<9){local.fill(0,i*4,i*4+4);statistics.isolatedPixelsRemoved++}
  let minX=rw,minY=rh,maxX=-1,maxY=-1,opaque=0,semi=0,green=0
  for(let y=0;y<rh;y++)for(let x=0;x<rw;x++){const i=(y*rw+x)*4;if(!local[i+3])continue;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);if(local[i+3]>=224)opaque++;else semi++;if(local[i+1]>180&&local[i+1]-Math.max(local[i],local[i+2])>100)green++}
  if(maxX<minX||green)throw Error('Invalid sprite '+id)
  const width=maxX-minX+5,height=maxY-minY+5,pixels=new Uint8Array(width*height*4)
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++)pixels.set(local.subarray((y*rw+x)*4,(y*rw+x)*4+4),((y-minY+2)*width+x-minX+2)*4)
  let baseSum=0,baseWeight=0
  for(let y=Math.max(0,height-2-Math.ceil(height*.08));y<height-2;y++)for(let x=0;x<width;x++){const a=pixels[(y*width+x)*4+3];if(a>=96){baseSum+=x*a;baseWeight+=a}}
  const anchorX=baseWeight?baseSum/baseWeight/width:.5,anchorY=(height-2)/height
  bleedRgb(pixels,width,height,4)
  const file=`${category}/${id}.png`;fs.mkdirSync(path.join(root,category),{recursive:true});writeRgbaPng(path.join(root,file),{width,height,pixels})
  const cellX=(index%4)*512,cellY=Math.floor(index/4)*320,ax=cellX+Math.floor((512-width)/2),ay=cellY+Math.floor((320-height)/2)
  for(let y=0;y<height;y++)atlas.pixels.set(pixels.subarray(y*width*4,(y+1)*width*4),((ay+y)*atlas.width+ax)*4)
  entries.push({id,category,url:'/foliage/forest/'+file,width,height,anchor:[anchorX,anchorY],heightRange,sourceRegion:region,sourceCrop:[rx+minX,ry+minY,maxX-minX+1,maxY-minY+1],atlasPixels:[ax,ay,width,height],uv:[ax/2048,1-(ay+height)/2048,(ax+width)/2048,1-ay/2048],opaquePixels:opaque,partialPixels:semi})
}
bleedRgb(atlas.pixels,atlas.width,atlas.height,12)
writeRgbaPng(path.join(root,'atlas.png'),atlas)
const catalogue={version:1,source,sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),sourceSize:[image.width,image.height],atlas:{url:'/foliage/forest/atlas.png',width:2048,height:2048},cleanup:{...statistics,opaqueColoursPreserved:true,transparentRgbBleed:'RGB only, never alpha; prevents dark mip fringes',safetyMarginPixels:2},entries}
const json=JSON.stringify(catalogue,null,2)+'\n'
fs.writeFileSync(path.join(root,'catalog.json'),json);fs.writeFileSync(reportDir+'/extraction.json',json)
fs.writeFileSync('src/world/forest/foliageCatalog.js','// Generated by scripts/extract-forest-foliage.mjs from the original illustration.\nexport const FOLIAGE_CATALOG='+JSON.stringify(catalogue)+'\n')
fs.writeFileSync(reportDir+'/catalog.html',`<!doctype html><meta charset="utf-8"><title>Forest · foliage catalogue</title><style>body{font:15px system-ui;background:#d5ddd1;color:#20382b;margin:24px}main{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}figure{margin:0;padding:12px;background:#f5f5ef;border:1px solid #8a9c8d}img{width:100%;height:230px;object-fit:contain;background:repeating-conic-gradient(#677669 0 25%,#a4b0a5 0 50%) 50%/24px 24px}figcaption{padding-top:8px}</style><h1>Forest · 24 sprites de la ilustración original</h1><main>${entries.map(e=>`<figure><img src="../../public/foliage/forest/${e.category}/${e.id}.png"><figcaption>${e.category} · ${e.id}<br>${e.width} × ${e.height} RGBA</figcaption></figure>`).join('')}</main>`)
fs.writeFileSync(path.join(root,'index.html'),fs.readFileSync(reportDir+'/catalog.html','utf8').replaceAll('../../public/foliage/forest/',''))
console.log(JSON.stringify({sprites:entries.length,categories:Object.fromEntries([...new Set(entries.map(e=>e.category))].map(c=>[c,entries.filter(e=>e.category===c).length])),cleanup:catalogue.cleanup},null,2))
