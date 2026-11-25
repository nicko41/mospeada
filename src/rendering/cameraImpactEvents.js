const empty=Object.freeze([]),capacity=8
export function createCameraImpactEvents(){
 const pending=[]
 const priority=(event,runtime)=>{
  if(event.kind==='directHit')return 2
  if(event.kind==='boostStart')return -1
  const s=runtime?.state,p=s?.riderMode==='onFoot'?s.pedestrian:null
  if(!s)return event.strength
  const distance=Math.hypot(event.origin.x-(p?.x??s.x),event.origin.y-((p?.ground??s.height)+.9),event.origin.z-(p?.z??s.z))
  return event.strength/(1+distance*distance)
 }
 return{
  runtime:null,generation:0,
  bind(runtime){this.runtime=runtime;this.clear();return()=>{if(this.runtime===runtime){this.runtime=null;this.clear()}}},
  clear(){pending.length=0;this.generation++},
  emit(kind,point,strength=1,shakeScale=1){
   if(!['explosion','environmentExplosion','enemyImpact','directHit','boostStart'].includes(kind)||!Number.isFinite(strength)||strength<=0)return
   if(point&&![point.x,point.y,point.z].every(Number.isFinite))return
   if(!point&&kind!=='directHit')return
   // Copy coordinates: combat FX reuse their scratch vectors immediately.
   const event={kind,origin:point?{x:point.x,y:point.y,z:point.z}:null,strength:Math.min(1,strength)}
   if(!Number.isFinite(shakeScale))return
   if(shakeScale!==1)event.shakeScale=Math.max(0,Math.min(1,shakeScale))
   const duplicate=pending.find(e=>e.kind===kind&&(e.shakeScale??1)===(event.shakeScale??1)&&(!e.origin&&!event.origin||e.origin&&event.origin&&Math.hypot(e.origin.x-event.origin.x,e.origin.y-event.origin.y,e.origin.z-event.origin.z)<.25))
   if(duplicate){duplicate.strength=Math.max(duplicate.strength,event.strength);return}
   if(pending.length<capacity)pending.push(event)
   else if(kind!=='boostStart'){let weakest=0;for(let i=1;i<pending.length;i++)if(priority(pending[i],this.runtime)<priority(pending[weakest],this.runtime))weakest=i;if(priority(event,this.runtime)>priority(pending[weakest],this.runtime))pending[weakest]=event}
  },
  drain(){return pending.length?pending.splice(0):empty},
 }
}
export const cameraImpactEvents=createCameraImpactEvents()
