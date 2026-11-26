import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import zlib from 'node:zlib'

const out='artifacts/startup-diagnostic'
fs.mkdirSync(out,{recursive:true})
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)])
const files=walk('dist').map(file=>({path:file.replaceAll('\\','/'),bytes:fs.statSync(file).size}))
const publicFiles=walk('public').map(file=>({path:file.replaceAll('\\','/'),bytes:fs.statSync(file).size}))
const sum=(items,key)=>items.reduce((n,x)=>n+(x[key]||0),0)
function imageSize(bytes){
 if(bytes.readUInt32BE(0)===0x89504e47)return{width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),format:'png'}
 if(bytes[0]===255&&bytes[1]===216){let p=2;while(p+9<bytes.length){if(bytes[p]!==255){p++;continue}const type=bytes[p+1],length=bytes.readUInt16BE(p+2);if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(type))return{width:bytes.readUInt16BE(p+7),height:bytes.readUInt16BE(p+5),format:'jpeg'};p+=2+length}}
 return{}
}
function model(file){
 const b=fs.readFileSync(file),jsonBytes=b.readUInt32LE(12),json=JSON.parse(b.subarray(20,20+jsonBytes).toString()),binOffset=20+jsonBytes+8
 const images=(json.images||[]).map((image,index)=>{const view=json.bufferViews?.[image.bufferView];let bytes;if(view)bytes=b.subarray(binOffset+(view.byteOffset||0),binOffset+(view.byteOffset||0)+view.byteLength);else if(image.uri?.startsWith('data:'))bytes=Buffer.from(image.uri.split(',')[1],'base64');return{index,name:image.name,mimeType:image.mimeType,uri:image.uri?.startsWith('data:')?'data:':image.uri,bytes:bytes?.length,...bytes&&bytes.length>24?imageSize(bytes):{}}})
 const embeddedImageBytes=sum(images,'bytes')
 return{file:file.replaceAll('\\','/'),bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex'),extensionsUsed:json.extensionsUsed||[],extensionsRequired:json.extensionsRequired||[],jsonBytes,embeddedImageBytes,otherBytes:b.length-embeddedImageBytes,images,meshCount:json.meshes?.length,materialCount:json.materials?.length,animationCount:json.animations?.length}
}
const models=publicFiles.filter(f=>f.path.endsWith('.glb')).map(f=>model(f.path))
const bundles=files.filter(f=>f.path.endsWith('.js')).map(f=>{
 const b=fs.readFileSync(f.path),source=b.toString(),uris=[...source.matchAll(/data:[a-z][a-z0-9+.-]*\/[^\s"'`<>]*;base64,[a-z0-9+/=]+/gi)].map(m=>({length:m[0].length,prefix:m[0].slice(0,100),offset:m.index}))
 return{...f,gzipBytes:zlib.gzipSync(b).length,dataUriCount:uris.length,dataUriCharacters:sum(uris,'length'),dataUris:uris,sourceMap:source.includes('sourceMappingURL=')}
})
const inventory={units:'MB = 1,000,000 bytes; MiB = 1,048,576 bytes',dist:{files:files.length,bytes:sum(files,'bytes')},public:{files:publicFiles.length,bytes:sum(publicFiles,'bytes')},largestPublished:files.sort((a,b)=>b.bytes-a.bytes).slice(0,25),bundles,models}
fs.writeFileSync(`${out}/inventory.json`,JSON.stringify(inventory,null,2)+'\n')

for(const mode of ['baseline','instrumented','cold']){
 const file=`${out}/${mode}.json`;if(!fs.existsSync(file))continue
 const r=JSON.parse(fs.readFileSync(file)),requests=new Map()
 for(const event of r.events){const p=event.params,id=p.requestId
  if(event.method==='Network.requestWillBeSent')requests.set(id,{...requests.get(id),id,url:p.request.url,method:p.request.method,requestHeaders:p.request.headers,type:p.type,start:p.timestamp,wallTime:p.wallTime,initiator:p.initiator})
  if(event.method==='Network.responseReceivedExtraInfo'){if(!requests.has(id))requests.set(id,{id});Object.assign(requests.get(id),{networkStatus:p.statusCode,networkHeaders:p.headers})}
  const q=requests.get(id);if(!q)continue
  if(event.method==='Network.responseReceived')Object.assign(q,{response:p.response,responseTime:p.timestamp})
  if(event.method==='Network.dataReceived'){q.dataLength=(q.dataLength||0)+p.dataLength;q.encodedDataLength=(q.encodedDataLength||0)+p.encodedDataLength}
  if(event.method==='Network.loadingFinished')Object.assign(q,{end:p.timestamp,wireBytes:p.encodedDataLength,finishedEncodedBodyLength:p.encodedBodyLength})
  if(event.method==='Network.loadingFailed')q.failure=p
 }
 const all=[...requests.values()],nav=all.find(x=>x.type==='Document'),t0=nav?.start||0
 const rows=all.filter(x=>/^https?:/.test(x.url||'')).map(x=>{
  const timing=x.response?.timing,relativeStart=(x.start-t0)*1000,finish=x.end?((x.end-t0)*1000):null,headers=Object.fromEntries(Object.entries(x.response?.headers||{}).map(([k,v])=>[k.toLowerCase(),v])),pathname=decodeURIComponent(new URL(x.url).pathname),local=path.join('dist',pathname)
  return{url:x.url,path:pathname,type:x.type,status:x.response?.status,networkStatus:x.networkStatus,protocol:x.response?.protocol,startMs:relativeStart,headersMs:timing?(timing.requestTime-t0)*1000+timing.receiveHeadersEnd:(x.responseTime-t0)*1000,responseEventMs:(x.responseTime-t0)*1000,endMs:finish,durationMs:finish!==null?finish-relativeStart:null,bodyMs:timing&&finish!==null?finish-((timing.requestTime-t0)*1000+timing.receiveHeadersEnd):null,requestToHeadersMs:timing?timing.receiveHeadersEnd-timing.sendEnd:null,wireBytes:x.wireBytes||0,encodedBodyBytes:x.networkStatus===304?0:(x.finishedEncodedBodyLength??x.encodedDataLength??0),decodedBodyBytes:x.dataLength||0,fileBytes:fs.existsSync(local)&&fs.statSync(local).isFile()?fs.statSync(local).size:null,fromDiskCache:x.response?.fromDiskCache,fromServiceWorker:x.response?.fromServiceWorker,headers,requestHeaders:x.requestHeaders,initiator:x.initiator,failure:x.failure}
 })
 // Worker responses belong to separate CDP targets. Fill their completion
 // from Resource Timing rather than misreporting them as hung downloads.
 const workerTiming=r.resources.filter(x=>x.name.includes('/assets/forestFoliageWorker-'))
 const workerRows=rows.filter(x=>x.path.includes('/assets/forestFoliageWorker-'))
 workerRows.forEach((row,i)=>{const t=workerTiming[i];if(!t)return;Object.assign(row,{status:t.responseStatus,networkStatus:t.deliveryType==='cache'?304:t.responseStatus,endMs:t.responseEnd,wireBytes:t.transferSize,encodedBodyBytes:t.deliveryType==='cache'?0:t.encodedBodySize,decodedBodyBytes:t.decodedBodySize,completionSource:'ResourceTiming; worker CDP response not attached',durationMs:null,bodyMs:null})})
 const before=rows.filter(x=>x.startMs<r.readyMs),completed=before.filter(x=>x.endMs!==null&&x.endMs<=r.readyMs),inFlight=before.filter(x=>x.endMs===null||x.endMs>r.readyMs)
 const rt=r.resources.filter(x=>x.name.startsWith('http'))
 const aggregate={mode,date:r.date,readyMs:r.readyMs,requestCount:rows.length,beforeReadyCount:before.length,completedBeforeReadyCount:completed.length,inFlightAtReady:inFlight.map(x=>({path:x.path,endMs:x.endMs,wireBytes:x.wireBytes})),completedWireBytes:sum(completed,'wireBytes'),completedEncodedBodyBytes:sum(completed,'encodedBodyBytes'),completedDecodedBodyBytes:sum(completed,'decodedBodyBytes'),startedBeforeReadyFullWireBytes:sum(before,'wireBytes'),resourceTiming:{allTransferBytes:sum(rt,'transferSize'),allEncodedBodyBytes:sum(rt,'encodedBodySize'),allDecodedBodyBytes:sum(rt,'decodedBodySize'),completedTransferBytes:sum(rt.filter(x=>x.responseEnd<=r.readyMs),'transferSize'),completedEncodedBodyBytes:sum(rt.filter(x=>x.responseEnd<=r.readyMs),'encodedBodySize'),completedDecodedBodyBytes:sum(rt.filter(x=>x.responseEnd<=r.readyMs),'decodedBodySize')},lastCompletedBeforeReady:completed.sort((a,b)=>b.endMs-a.endMs).slice(0,8),top15:before.sort((a,b)=>(b.fileBytes||b.decodedBodyBytes)-(a.fileBytes||a.decodedBodyBytes)).slice(0,15),httpErrors:rows.filter(x=>x.status>=400||x.failure),runtimeErrors:r.events.filter(e=>e.method==='Runtime.exceptionThrown').map(e=>e.params),rows:rows.sort((a,b)=>a.startMs-b.startMs)}
 const timingAll=[...rt,...r.navigation],uniqueTiming=[...new Map(timingAll.map(x=>[x.name,x])).values()]
 aggregate.download={resourceTimingTransferBytes:sum(timingAll,'transferSize'),resourceTimingNetworkEncodedBodyBytes:sum(timingAll.filter(x=>x.deliveryType!=='cache'),'encodedBodySize'),logicalDecodedBodyBytes:sum(timingAll,'decodedBodySize'),uniqueUrlDecodedBodyBytes:sum(uniqueTiming,'decodedBodySize'),cacheRevalidations:rows.filter(x=>x.networkStatus===304).length,distinctUrls:uniqueTiming.length,notes:'ResourceTiming transferSize estimates 300 header bytes per entry. deliveryType=cache entries retain original encodedBodySize; excluded from actual downloaded body. CDP ExtraInfo exposes HTTP 304 hidden by the assembled response status 200.'}
 const groups={};for(const s of r.spans){const g=groups[s.name]||={count:0,totalMs:0,maxMs:0,firstStart:Infinity,lastEnd:0};g.count++;g.totalMs+=s.duration;g.maxMs=Math.max(g.maxMs,s.duration);g.firstStart=Math.min(g.firstStart,s.start);g.lastEnd=Math.max(g.lastEnd,s.end)}
 aggregate.spans=groups;aggregate.bitmap={count:r.bitmaps.length,sumWallMs:sum(r.bitmaps,'duration'),maxWallMs:Math.max(0,...r.bitmaps.map(x=>x.duration)),pixels:sum(r.bitmaps.map(x=>({pixels:x.width*x.height})),'pixels')};aggregate.gpu=r.gpu;aggregate.glCalls=r.glCalls;aggregate.renderer=r.renderer;aggregate.preparation=r.preparation
 fs.writeFileSync(`${out}/${mode}-summary.json`,JSON.stringify(aggregate,null,2)+'\n')
 const cols=['path','type','status','networkStatus','startMs','headersMs','endMs','durationMs','bodyMs','wireBytes','encodedBodyBytes','decodedBodyBytes','fileBytes']
 const csv=[cols.join(','),...aggregate.rows.map(x=>cols.map(k=>JSON.stringify(x[k]??'')).join(','))].join('\n')
 fs.writeFileSync(`${out}/${mode}-network.csv`,csv+'\n')
 if(mode==='instrumented'){
  const traceFile=`${out}/instrumented-trace.json`,compressedTraceFile=traceFile+'.gz'
  const union=items=>{let total=0,end=-Infinity;for(const x of [...items].sort((a,b)=>a.start-b.start)){total+=Math.max(0,x.end-Math.max(end,x.start));end=Math.max(end,x.end)}return total}
  const traceBytes=fs.existsSync(traceFile)?fs.readFileSync(traceFile):fs.existsSync(compressedTraceFile)?zlib.gunzipSync(fs.readFileSync(compressedTraceFile)):null
  const decodeEvents=traceBytes?JSON.parse(traceBytes).traceEvents.filter(x=>x.ph==='X'&&x.name==='Decode Image'):[]
  const glbSpans=r.spans.filter(x=>x.name==='gltf.parse-inclusive'&&models.some(m=>m.bytes===x.bytes))
  const detail={readyMs:r.readyMs,preparation:r.preparation,renderer:r.renderer,renderInfo:r.renderInfo,glb:{count:glbSpans.length,sumInclusiveWallMs:sum(glbSpans,'duration'),unionInclusiveWallMs:union(glbSpans),assets:glbSpans.map(s=>({...s,candidateFiles:models.filter(m=>m.bytes===s.bytes).map(m=>m.file)})),note:'parse() to onLoad, starting with GLB bytes already available. Includes embedded image decoding and scheduling; not exclusive CPU geometry decoding.'},bitmap:{count:r.bitmaps.length,sumAsyncWallMs:sum(r.bitmaps,'duration'),unionAsyncWallMs:union(r.bitmaps),traceDecodeCount:decodeEvents.length,traceDecodeSumWallMs:sum(decodeEvents,'dur')/1000,traceDecodeSumThreadCpuMs:sum(decodeEvents,'tdur')/1000,threadCpuAvailable:decodeEvents.filter(x=>x.tdur!==undefined).length,note:'Trace Decode Image includes external images as well as embedded GLB images. These times overlap GLB parse.'},gpu:{queries:r.gpu?.length,available:r.gpu?.filter(x=>x.available).length,disjoint:r.gpu?.filter(x=>x.disjoint).length,sumRenderGpuMs:sum(r.gpu||[],'gpuMs'),note:'EXT_disjoint_timer_query_webgl2 around renderer.render calls only, not a total of uploads, shader compilation or all GPU startup work.'},spans:groups,glCalls:r.glCalls,longTasks:{count:r.longTasks.length,sumWallMs:sum(r.longTasks,'duration'),maxWallMs:Math.max(...r.longTasks.map(x=>x.duration))}}
  fs.writeFileSync(`${out}/cpu-texture-gpu.json`,JSON.stringify(detail,null,2)+'\n')
 }
 console.log(JSON.stringify({mode,readyMs:r.readyMs,requests:rows.length,completedWireMB:aggregate.completedWireBytes/1e6,completedEncodedMB:aggregate.completedEncodedBodyBytes/1e6,completedDecodedMB:aggregate.completedDecodedBodyBytes/1e6,inFlightAtReady:aggregate.inFlightAtReady,top15:aggregate.top15.map(x=>({path:x.path,MB:(x.fileBytes||x.decodedBodyBytes)/1e6,wireMB:x.wireBytes/1e6})),spans:groups,bitmap:aggregate.bitmap,preparation:r.preparation},null,2))
}
console.log(JSON.stringify({publicMB:inventory.public.bytes/1e6,distMB:inventory.dist.bytes/1e6,bundles:bundles.map(({dataUris,...b})=>b)},null,2))
