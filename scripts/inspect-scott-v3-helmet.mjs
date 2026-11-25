import fs from 'node:fs'
import {loadPaletteSource,pixel,colorClass} from './inspect-scott-palette.mjs'
const source=await loadPaletteSource('public/models/mospeada/scott-gear-v3-animated.glb'),{g,p,positions,uv,indices}=source
const parent=Int32Array.from({length:positions.length},(_,i)=>i),find=i=>parent[i]===i?i:(parent[i]=find(parent[i])),join=(a,b)=>{a=find(a);b=find(b);if(a!==b)parent[b]=a},seams=new Map()
for(let i=0;i<positions.length;i++)if(positions[i][1]>1.43){const key=positions[i].map(n=>Math.round(n*1e6)).join(',');if(seams.has(key))join(i,seams.get(key));else seams.set(key,i)}
for(let f=0;f<indices.length;f+=3){const ids=indices.slice(f,f+3);if(ids.every(i=>positions[i][1]>1.43)){join(ids[0],ids[1]);join(ids[1],ids[2])}}
const groups=new Map()
for(let i=0;i<positions.length;i++)if(positions[i][1]>1.43){const k=find(i);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(i)}
const components=[...groups.values()].filter(ids=>ids.length>8).map(ids=>({vertices:ids.length,min:[0,1,2].map(k=>Math.min(...ids.map(i=>positions[i][k]))),max:[0,1,2].map(k=>Math.max(...ids.map(i=>positions[i][k]))),colors:ids.reduce((a,i)=>{const c=colorClass(pixel(source.base,uv[i]));a[c]=(a[c]||0)+1;return a},{})})).sort((a,b)=>b.vertices-a.vertices)
fs.mkdirSync('artifacts/scott-v3/helmet',{recursive:true});fs.writeFileSync('artifacts/scott-v3/helmet/components.json',JSON.stringify(components,null,2));console.log(JSON.stringify(components.slice(0,35),null,2))
