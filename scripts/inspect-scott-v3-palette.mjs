import fs from 'node:fs'
import {loadPaletteSource,colorClass,pixel} from './inspect-scott-palette.mjs'
import {accessorData} from './glb-data.mjs'
import {scottV3PaletteRegion as paletteRegion} from '../src/vehicle/scottV3Palette.js'

export async function samplePalette(file){
 const s=await loadPaletteSource(file),j=accessorData(s.g,s.p.attributes.JOINTS_0).values,w=accessorData(s.g,s.p.attributes.WEIGHTS_0).values,roles=s.g.doc.skins[0].joints.map(i=>paletteRegion(s.g.doc.nodes[i].name)),stats={}
 for(let f=0;f<s.indices.length;f+=3){
  const ids=s.indices.slice(f,f+3),weights=[0,0,0,0,0]
  for(const id of ids)for(let k=0;k<4;k++)weights[roles[j[id][k]]]+=w[id][k]/3
  const role=weights.indexOf(Math.max(...weights));if(!role||weights[role]<.65)continue
  const uv=[0,1].map(k=>ids.reduce((a,id)=>a+s.uv[id][k],0)/3),rgb=pixel(s.base,uv),kind=colorClass(rgb)
  if(!['green','white'].includes(kind))continue
  const [a,b,c]=ids.map(i=>s.positions[i]),u=b.map((v,k)=>v-a[k]),v=c.map((x,k)=>x-a[k]),area=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2,key=['protected','chest','shoulders','legs','thighs'][role]+':'+kind
  ;(stats[key]??=[]).push({rgb,area})
 }
 return Object.fromEntries(Object.entries(stats).map(([key,values])=>[key,{area:values.reduce((n,x)=>n+x.area,0),samples:values.length,median:[0,1,2].map(k=>{const hist=new Float64Array(256);values.forEach(x=>hist[x.rgb[k]]+=x.area);const half=values.reduce((n,x)=>n+x.area,0)/2;let sum=0;for(let i=0;i<256;i++){sum+=hist[i];if(sum>=half)return i}return 0})}]))
}
if(process.argv[1]?.endsWith('inspect-scott-v3-palette.mjs')){
 const report={v1:await samplePalette('public/models/mospeada/scott-bernard-animated-original.glb'),v3:await samplePalette('public/models/mospeada/scott-gear-v3-animated.glb')}
 fs.mkdirSync('artifacts/scott-v3/palette',{recursive:true});fs.writeFileSync('artifacts/scott-v3/palette/samples.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2))
}
