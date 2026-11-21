import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
const folder='assets/rand-cyclone',out='public/models/mospeada',bikeSource=folder+'/cyclone-rand.glb',bikeOutput=out+'/rand-cyclone.glb'
fs.mkdirSync(folder,{recursive:true});fs.mkdirSync(out,{recursive:true})
// A separate editable source and runtime resource. Subsequent imports never
// replace Rand's edited bike with Scott's version.
if(!fs.existsSync(bikeSource))fs.copyFileSync(out+'/cyclone-vr052f.glb',bikeSource)
fs.copyFileSync(bikeSource,bikeOutput)
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const rigged=process.argv[2],rider=rigged?path.resolve(rigged):null
const manifest={bike:{source:bikeSource,output:bikeOutput,sha256:hash(bikeSource)},rider:null}
if(rider){
 const bytes=fs.readFileSync(rider),doc=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)))
 if(!doc.skins?.length)throw Error('Rand necesita el GLB riggeado para transferir las animaciones de Scott')
 const output=out+'/rand-casual-rigged.glb';fs.copyFileSync(rider,output)
 manifest.rider={source:rider,output,sha256:hash(rider),bones:doc.skins.map(s=>s.joints.map(i=>doc.nodes[i].name)),animations:doc.animations?.map(a=>a.name)||[],materials:doc.materials?.map(m=>m.name)||[]}
}
fs.writeFileSync(out+'/rand-manifest.json',JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest,null,2))
