import fs from 'node:fs'
import crypto from 'node:crypto'
import {readRgbaPng} from './foliage-png.mjs'

// Metadata only: do not crop, recolour or rewrite the supplied illustrations.
const sheets=[]
for(const name of ['follaje1','follaje2']){
 const source=`assets/texturas/follaje/${name}.png`,image=readRgbaPng(source),entries=[],histogram=Array(16).fill(0);let transparent=0,partial=0,opaque=0,discardedNeon=0,retainedNeon=0
 for(let i=0;i<image.pixels.length;i+=4){const [r,g,b,a]=image.pixels.subarray(i,i+4);histogram[Math.min(15,Math.floor(a/16))]++;if(!a)transparent++;else if(a===255)opaque++;else partial++;if(a&&g>180&&g-Math.max(r,b)>85){if(a<141)discardedNeon++;else retainedNeon++}}
 for(let row=0;row<4;row++)for(let col=0;col<4;col++){
  const x0=Math.round(col*image.width/4),x1=Math.round((col+1)*image.width/4),y0=Math.round(row*image.height/4),y1=Math.round((row+1)*image.height/4)
  let minX=x1,minY=y1,maxX=x0,maxY=y0,kept=0
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(image.pixels[(y*image.width+x)*4+3]>=141){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);kept++}
  minX=Math.max(x0,minX-2);minY=Math.max(y0,minY-2);maxX=Math.min(x1-1,maxX+2);maxY=Math.min(y1-1,maxY+2)
  const width=maxX-minX+1,height=maxY-minY+1
  entries.push({id:`${name}-${row*4+col+1}`,cell:[col,row],pixels:[minX,minY,width,height],aspect:width/height,uv:[minX/image.width,1-(minY+height)/image.height,width/image.width,height/image.height],retainedPixels:kept})
 }
 sheets.push({name,source,width:image.width,height:image.height,sha256:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),transparency:{transparent,partial,opaque,histogram},edgeAudit:{discardedNeon,retainedNeon},entries})
}
const report={alphaCutoff:.55,columns:4,rows:4,originalsUnmodified:true,cleanup:'Runtime alpha cutout; original RGB and PNGs preserved. Two-pixel cell padding; no mipmap bleed.',sheets}
fs.mkdirSync('artifacts/forest-canopy-test',{recursive:true});fs.writeFileSync('artifacts/forest-canopy-test/sheets.json',JSON.stringify(report,null,2)+'\n')
fs.writeFileSync('src/world/forest/canopySpriteCatalog.js','// Generated metadata only; the original PNGs are never rewritten.\nexport const CANOPY_SPRITES='+JSON.stringify(report)+'\n')
console.log(JSON.stringify({sheets:sheets.map(s=>({name:s.name,size:[s.width,s.height],sprites:s.entries.length,alpha:s.transparency,edges:s.edgeAudit}))},null,2))
