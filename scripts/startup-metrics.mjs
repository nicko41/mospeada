// Resource Timing reports cached body sizes even after a 304. CDP transport
// bytes are the authoritative total, including unfinished downloads at ready.
export function startupMetrics(result,events){
 const all=[...result.resources,...result.navigation],complete=all.filter(x=>x.responseEnd<=result.readyMs),metrics={requestsComplete:complete.length,transferBytes:complete.reduce((s,x)=>s+x.transferSize,0),encodedBodyBytes:complete.filter(x=>x.transferSize>300).reduce((s,x)=>s+x.encodedBodySize,0),uniqueUrlDecodedBytes:[...new Map(complete.map(x=>[x.name,x])).values()].reduce((s,x)=>s+x.decodedBodySize,0),maxStartupTaskMs:Math.max(0,...result.tasks.filter(x=>x.at<result.readyMs).map(x=>x.ms))}
 const transfers=startupTransfers(result,events)
 metrics.workerTimingFallbackBytes=transfers.filter(t=>t.workerFallback).reduce((n,t)=>n+t.bytes,0)
 metrics.transportBytesAtReady=transfers.reduce((n,t)=>n+t.bytes,0)
 metrics.partialDownloads=transfers.filter(t=>t.partial&&t.bytes).map(t=>({url:t.url,receivedBytes:t.bytes}))
 return metrics
}
export function startupTransfers(result,events){
 const complete=[...result.resources,...result.navigation].filter(x=>x.responseEnd<=result.readyMs)
 const requests=new Map();let navStart
 for(const {method,params:p}of events){
  const id=p.requestId;if(!id)continue
  let item=requests.get(id);if(!item){item={id,received:0};requests.set(id,item)}
  if(method==='Network.requestWillBeSent'){item.url=p.request.url;item.start=p.timestamp;if(p.type==='Document'&&navStart===undefined)navStart=p.timestamp}
  if(method==='Network.responseReceived')item.headerBytes=p.response.encodedDataLength||0
  if(method==='Network.dataReceived')item.chunks=[...(item.chunks||[]),{time:p.timestamp,bytes:p.encodedDataLength}]
  if(method==='Network.loadingFinished'){item.end=p.timestamp;item.transfer=p.encodedDataLength}
 }
 const limit=navStart+result.readyMs/1000,transfers=[]
 for(const item of requests.values()){
  if(!/^http/.test(item.url||'')||item.start>limit)continue
  const partial=!(item.end<=limit),bytes=partial?(item.headerBytes||0)+(item.chunks||[]).filter(x=>x.time<=limit).reduce((n,x)=>n+x.bytes,0):item.transfer
  transfers.push({url:item.url,bytes,partial,workerFallback:false})
 }
 for(const url of new Set(complete.filter(x=>/(forestFoliage|terrain)Worker-/.test(x.name)).map(x=>x.name))){
  const timing=complete.filter(x=>x.name===url).reduce((n,x)=>n+x.transferSize,0)
  const observed=[...requests.values()].filter(item=>item.url===url&&item.start<=limit).reduce((n,item)=>n+(item.end<=limit?item.transfer:(item.headerBytes||0)+(item.chunks||[]).filter(x=>x.time<=limit).reduce((s,x)=>s+x.bytes,0)),0)
  if(timing>observed)transfers.push({url,bytes:timing-observed,partial:false,workerFallback:true})
 }
 return transfers
}
