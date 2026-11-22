import {fitCycloneReadout,cycloneFontReady} from './cycloneReadout.js'
import {instrumentLevel} from './cycloneInstrumentModel.js'

let current
function display(){
  const root=document.getElementById('entry-preloader')
  if(!root)return null
  if(current?.root===root)return current
  current={root,svg:root.querySelector('#entry-dashboard'),number:root.querySelector('#entry-digits'),activity:root.querySelector('#entry-activity'),segments:[...root.querySelectorAll('#entry-segments .segment')],glows:[...root.querySelectorAll('#entry-segment-glow path')],leds:[...root.querySelectorAll('.status-led')],percent:0,message:'INITIALIZING'}
  return current
}
export function updateEntryPreloader(value,message='LOADING TERRAIN'){
  const d=display();if(!d)return
  const percent=Math.max(0,Math.min(100,Number(value)||0)),active=instrumentLevel(percent)
  d.percent=percent;d.message=message
  d.segments.forEach((n,i)=>n.classList.toggle('on',i<active));d.glows.forEach((n,i)=>n.setAttribute('opacity',i<active?'1':'0'))
  d.leds.forEach(n=>n.classList.toggle('on',percent>=Number(n.dataset.step)/6*100))
  d.svg.setAttribute('aria-valuenow',String(Math.round(percent)));d.svg.setAttribute('aria-valuetext',`${Math.round(percent)}% · ${message}`)
  fitCycloneReadout(d.number,Math.round(percent).toString().padStart(2,'0'),{x:446,y:164,width:164,height:84.48,align:'end'})
  fitCycloneReadout(d.activity,message,{x:421,y:134.1,width:208,height:11.9,align:'start'});d.activity.setAttribute('aria-label',message)
  document.getElementById('entry-loading-status').textContent=message
}
if(typeof document!=='undefined'){
  window.MospeadaPreloader={setProgress:updateEntryPreloader,finish:()=>updateEntryPreloader(100,'SYSTEM READY'),reset:()=>updateEntryPreloader(0,'INITIALIZING')}
  cycloneFontReady.then(()=>{if(display())updateEntryPreloader(current.percent,current.message)})
}
