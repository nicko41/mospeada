import {defineConfig} from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import {FOREST_ASSETS} from './src/world/forest/forestConfig.js'

const walk=directory=>fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(directory,entry.name)):[path.join(directory,entry.name)])
export default defineConfig(({command,mode})=>{
 const files=walk('public').sort(),digest=crypto.createHash('sha256'),sizes={}
 for(const file of files){const relative=path.relative('public',file).replaceAll('\\','/'),bytes=fs.readFileSync(file);digest.update(relative+'\0').update(crypto.createHash('sha256').update(bytes).digest());sizes['/'+relative]=bytes.length}
 const revision=digest.digest('hex').slice(0,16),base=command==='build'?'/resources/'+revision:''
 const forestTextures=new Set()
 for(const asset of FOREST_ASSETS){const doc=JSON.parse(fs.readFileSync('public/models/glTF/'+asset.name+'.gltf'));for(const material of doc.materials||[]){const index=material.pbrMetallicRoughness?.baseColorTexture?.index;if(index===undefined)continue;const uri=doc.images?.[doc.textures[index].source]?.uri;if(uri&&!/^(data:|https?:)/.test(uri))forestTextures.add('/models/glTF/'+uri)}}
 let out
 return {publicDir:command==='build'?false:'public',define:{__PUBLIC_ASSET_BASE__:JSON.stringify(base),__ASSET_SIZES__:JSON.stringify(sizes),__FOREST_COLOR_TEXTURES__:JSON.stringify([...forestTextures])},plugins:[{
  name:'versioned-public-resources',
  configResolved(config){out=config.build.outDir},
  transformIndexHtml(html){return base?html.replaceAll('href="/fonts/','href="'+base+'/fonts/').replace('href="/favicon.svg"','href="'+base+'/favicon.svg"'):html},
  transform(code,id){let result=code;if(base&&id.endsWith('cycloneInstrument.css'))result=result.replaceAll('/fonts/',base+'/fonts/');if(mode==='load-qa'&&id.includes('/src/')&&!id.includes('/node_modules/'))result=result.replaceAll('import.meta.env.DEV',"(import.meta.env.DEV || import.meta.env.MODE === 'load-qa')");if(result!==code)return result},
  closeBundle(){if(command!=='build')return;for(const file of files){const dest=path.join(out,'resources',revision,path.relative('public',file));fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(file,dest)}fs.writeFileSync(path.join(out,'resource-version.json'),JSON.stringify({revision,base})+'\n')},
 }]}
})
