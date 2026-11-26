import fs from 'node:fs'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import {createStage2Terrain} from '../src/world/forest/forestStage2Terrain.js'
import {createCanyonSides} from '../src/world/forest/forestCanyonSides.js'
import {createStage4Terrain} from '../src/world/forest/forestStage4Terrain.js'
import {packTree,unpackTree} from '../src/loading/geometryTransfer.js'
const directory='artifacts/startup-optimization';fs.mkdirSync(directory,{recursive:true})
const baseline='../.cache/startup-before-src/src/world/forest/',before2=await import(baseline+'forestStage2Terrain.js'),beforeSides=await import(baseline+'forestCanyonSides.js'),before4=await import(baseline+'forestStage4Terrain.js')
function fingerprint(value){
 const hash=crypto.createHash('sha256');let geometries=0,vertices=0,triangles=0
 const visit=v=>{if(v?.isBufferGeometry){geometries++;vertices+=v.attributes.position.count;triangles+=(v.index?.count||v.attributes.position.count)/3;for(const [key,a]of Object.entries(v.attributes)){hash.update(key).update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength))}if(v.index)hash.update(Buffer.from(v.index.array.buffer,v.index.array.byteOffset,v.index.array.byteLength));hash.update(JSON.stringify({box:v.boundingBox,sphere:v.boundingSphere,groups:v.groups,data:v.userData}));return}if(Array.isArray(v)){v.forEach(visit);return}if(v&&typeof v==='object')for(const [key,item]of Object.entries(v)){if(typeof item==='function')continue;hash.update(key);visit(item)}else hash.update(String(v))}
 visit(value);return {sha256:hash.digest('hex'),geometries,vertices,triangles}
}
const report=[]
for(const [name,before,after]of [['stage2 terrain',before2.createStage2Terrain,createStage2Terrain],['canyon sides',beforeSides.createCanyonSides,createCanyonSides],['stage4 terrain',before4.createStage4Terrain,createStage4Terrain]]){
 const a=fingerprint(before()),value=after(),b=fingerprint(value),buffers=new Set(),roundTrip=unpackTree(structuredClone(packTree(value,buffers))),c=fingerprint(roundTrip)
 assert.deepEqual(b,a,name+' preserves original geometry and placements');assert.deepEqual(c,b,name+' preserves worker transfer');report.push({name,...b,pass:true});console.log(name,b)
}
fs.writeFileSync(directory+'/geometry-equivalence.json',JSON.stringify(report,null,2)+'\n')
