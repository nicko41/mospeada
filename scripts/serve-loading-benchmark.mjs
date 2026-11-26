// Local production server with negotiated Brotli and conditional/range requests.
// Precompression happens before measurements, on both builds at quality 4.
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import crypto from 'node:crypto'
import zlib from 'node:zlib'
const root=path.resolve(process.argv[2]||'dist'),port=Number(process.argv[3]||5180),immutable=process.argv.includes('--immutable')
const cache=path.resolve('.cache/http-br-'+crypto.createHash('sha256').update(root).digest('hex').slice(0,10))
fs.mkdirSync(cache,{recursive:true})
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)])
const records=new Map(),compressible=/\.(js|css|html|json|gltf|glb|bin|ttf|svg)$/i
const types={'.js':'application/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.gltf':'model/gltf+json','.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ttf':'font/ttf','.mp3':'audio/mpeg','.bin':'application/octet-stream'}
for(const file of walk(root)){
 const stat=fs.statSync(file),hash=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),relative='/'+path.relative(root,file).replaceAll('\\','/'),record={file,size:stat.size,etag:'"'+hash+'"'}
 if(compressible.test(file)){const br=path.join(cache,hash+'.br');if(!fs.existsSync(br))fs.writeFileSync(br,zlib.brotliCompressSync(fs.readFileSync(file),{params:{[zlib.constants.BROTLI_PARAM_QUALITY]:4}}));record.br=br;record.brSize=fs.statSync(br).size}
 records.set(relative,record)
}
console.log(JSON.stringify({ready:true,root,port,files:records.size,immutable,compression:'br quality=4; identical settings before/after'}))
http.createServer((request,response)=>{
 let name;try{name=decodeURIComponent(new URL(request.url,'http://localhost').pathname)}catch{response.writeHead(400).end();return}
 if(name==='/')name='/index.html'
 const record=records.get(name)
 if(!record){response.writeHead(404).end('Not found');return}
 const policy=immutable&&(/^\/assets\/.*-[A-Za-z0-9_-]{8}\.[^/]+$/.test(name)||/^\/resources\/[a-f0-9]{16}\//.test(name))?'public, max-age=31536000, immutable':'public, max-age=0, must-revalidate'
 const headers={'Content-Type':types[path.extname(name)]||'application/octet-stream','Cache-Control':policy,ETag:record.etag,'Vary':'Accept-Encoding','Timing-Allow-Origin':'*','Access-Control-Allow-Origin':'*'}
 if(request.headers['if-none-match']===record.etag){response.writeHead(304,headers).end();return}
 const br=record.br&&/\bbr\b/.test(request.headers['accept-encoding']||''),file=br?record.br:record.file,size=br?record.brSize:record.size
 if(br)headers['Content-Encoding']='br'
 let status=200,start=0,end=size-1
 if(!br&&request.headers.range){const range=/bytes=(\d+)-(\d*)/.exec(request.headers.range);if(range){start=Number(range[1]);end=range[2]?Math.min(size-1,Number(range[2])):size-1;if(start> end){response.writeHead(416,{'Content-Range':'bytes */'+size}).end();return}status=206;headers['Content-Range']=`bytes ${start}-${end}/${size}`;headers['Accept-Ranges']='bytes'}}
 headers['Content-Length']=end-start+1;response.writeHead(status,headers)
 if(request.method==='HEAD')response.end();else fs.createReadStream(file,{start,end}).pipe(response)
}).listen(port,'127.0.0.1')
