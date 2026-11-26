import fs from 'node:fs'
import path from 'node:path'
import {build} from 'vite'
import {execFileSync} from 'node:child_process'
const root=path.resolve('.cache/startup-before-src')
const ref=process.env.MOSPEADA_BASELINE_REF||'1dae241'
const files=execFileSync('git',['ls-tree','-r','--name-only',ref,'--','src','scripts'],{encoding:'utf8'}).trim().split('\n')
for(const file of files){
 const target=path.join(root,file),source=execFileSync('git',['show',ref+':'+file],{maxBuffer:32*1024*1024})
 if(!fs.existsSync(target)){fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,source)}
 else if(!/\.test\./.test(file)&&fs.readFileSync(target,'utf8').replaceAll('\r\n','\n')!==source.toString('utf8').replaceAll('\r\n','\n'))throw Error('Modified baseline source: '+file)
}
fs.copyFileSync('index.html',path.join(root,'index.html'))
const assets=path.join(root,'assets'),sourceAssets=path.resolve('assets')
await build({configFile:false,root,publicDir:path.resolve('public'),mode:'load-qa',build:{outDir:path.resolve('.cache/startup-baseline-dist'),emptyOutDir:true},plugins:[{name:'local-benchmark-telemetry',resolveId(source,importer){if(!importer||!source.startsWith('.'))return;const resolved=path.resolve(path.dirname(importer.split('?')[0]),source);if(resolved.startsWith(assets+path.sep))return path.join(sourceAssets,path.relative(assets,resolved))},transform(code,id){if(id.includes('/src/')&&!id.includes('/node_modules/'))return code.replaceAll('import.meta.env.DEV',"(import.meta.env.DEV || import.meta.env.MODE === 'load-qa')")}}]})
