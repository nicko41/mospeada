// One cooperative queue for all background construction and GPU submissions.
// Individual jobs are measured: a budget cannot preempt synchronous JS/WebGL.
const jobs=[],telemetry={jobs:0,maxJobMs:0,overruns:[],labels:{}}
let scheduled=false
const tick=()=>{
 scheduled=false
 const deadline=performance.now()+2.5
 do{const job=jobs.shift();if(!job)break;const start=performance.now()
 try{job.resolve(job.run())}catch(error){job.reject(error)}
 const ms=performance.now()-start;telemetry.jobs++;telemetry.maxJobMs=Math.max(telemetry.maxJobMs,ms);if(ms>8)telemetry.overruns.push({label:job.label,ms});if(telemetry.overruns.length>200)telemetry.overruns.shift()
 const label=telemetry.labels[job.label]||={count:0,totalMs:0,maxMs:0};label.count++;label.totalMs+=ms;label.maxMs=Math.max(label.maxMs,ms)
 }while(jobs.length&&performance.now()<deadline)
 if(jobs.length)schedule()
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{if(typeof requestIdleCallback==='function')requestIdleCallback(tick,{timeout:32});else setTimeout(tick,0)})}
const priority=label=>/stage2/i.test(label)?0:/stage3/i.test(label)?1:/stage4/i.test(label)?2:/scouts/i.test(label)?3:/horizon/i.test(label)?4:/rand/i.test(label)?5:0
export const workQueue={telemetry,submit(run,label='preparation'){return new Promise((resolve,reject)=>{jobs.push({run,label,resolve,reject,priority:priority(label)});jobs.sort((a,b)=>a.priority-b.priority);schedule()})},drain(iterator,label){return new Promise((resolve,reject)=>{const chunk=()=>{const end=performance.now()+2;let step;do{step=iterator.next();if(step.done){resolve(step.value);return}}while(performance.now()<end);this.submit(chunk,label).catch(reject)};this.submit(chunk,label).catch(reject)})}}
