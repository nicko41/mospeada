import fs from 'node:fs'
import assert from 'node:assert/strict'
import config from '../vite.config.js'

const origin=process.argv[2]||'http://127.0.0.1:5181',out=process.argv[3]||'.cache/startup-after-dist',report={}
const version=JSON.parse(fs.readFileSync(out+'/resource-version.json'))
const base=()=>JSON.parse(config({command:'build',mode:'production'}).define.__PUBLIC_ASSET_BASE__)
const original=base(),probe='public/loading-cache-invalidation-probe.txt'
assert.ok(!fs.existsSync(probe))
try{
 fs.writeFileSync(probe,'first content');const added=base()
 fs.writeFileSync(probe,'changed content');const changed=base()
 assert.notEqual(original,added);assert.notEqual(added,changed)
 report.invalidation={original,added,changed}
}finally{fs.unlinkSync(probe)}
assert.equal(base(),original);assert.equal(original,version.base)
report.invalidation.restored=base()
report.headers=[]
for(const path of ['/', '/index.html','/resource-version.json',version.base+'/delivery/scott-v3.glb',...fs.readdirSync(out+'/assets').filter(n=>/^index-.*\.(js|css)$/.test(n)).map(n=>'/assets/'+n)]){
 const response=await fetch(origin+path,{method:'HEAD',headers:{'Accept-Encoding':'br'}})
 assert.equal(response.status,200,path)
 const cache=response.headers.get('cache-control'),immutable=path.startsWith('/assets/')||path.startsWith('/resources/')
 assert.equal(cache.includes('immutable'),immutable,path)
 if(immutable)assert.ok(cache.includes('max-age=31536000'))
 assert.equal(response.headers.get('content-encoding'),'br',path)
 const cached=await fetch(origin+path,{method:'HEAD',headers:{'If-None-Match':response.headers.get('etag')}})
 assert.equal(cached.status,304,path)
 report.headers.push({path,cache,encoding:response.headers.get('content-encoding'),etag:response.headers.get('etag'),revalidation:cached.status})
}
const policy=JSON.parse(fs.readFileSync('vercel.json'));report.vercel=policy
assert.equal(policy.headers.filter(h=>h.headers.some(v=>v.value.includes('immutable'))).length,2)
const html=fs.readFileSync(out+'/index.html','utf8'),css=fs.readdirSync(out+'/assets').filter(n=>n.endsWith('.css')).map(n=>fs.readFileSync(out+'/assets/'+n,'utf8')).join('\n')
report.fonts={html:[...html.matchAll(/href="([^"]+\.ttf)"/g)].map(m=>m[1]),css:[...css.matchAll(/url\(([^)]+\.ttf)\)/g)].map(m=>m[1].replaceAll(/["']/g,''))}
assert.ok(report.fonts.html.length>0);assert.ok(report.fonts.html.every(url=>url.startsWith(version.base)&&report.fonts.css.includes(url)))
report.pass=true
fs.writeFileSync('artifacts/startup-optimization/cache-validation.json',JSON.stringify(report,null,2))
console.log(JSON.stringify(report,null,2))
