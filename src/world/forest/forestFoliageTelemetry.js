export const foliageTelemetry={frameMs:0,fps:0,p95Ms:0,drawCalls:0,triangles:0,visibleGroups:0,nearGroups:0,farGroups:0,residentSectors:0,pendingSectors:0,gpuMB:0,width:0,height:0,pixelRatio:1,profile:3000,latePrepares:0,worldGroups:0,recording:false}
const listeners=new Set()
let snapshot={...foliageTelemetry}
export const foliageTelemetryStore={subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},snapshot:()=>snapshot,publish:()=>{snapshot={...foliageTelemetry};listeners.forEach(fn=>fn())}}
export const foliageRecording={rows:[],end:0,start(seconds=10){this.rows=[];this.end=performance.now()+seconds*1000;foliageTelemetry.recording=true},sample(){if(!this.end)return;if(performance.now()<this.end)this.rows.push({time:performance.now(),...foliageTelemetry});else{this.end=0;foliageTelemetry.recording=false}},export(){return JSON.stringify({generatedAt:new Date().toISOString(),samples:this.rows},null,2)}}
