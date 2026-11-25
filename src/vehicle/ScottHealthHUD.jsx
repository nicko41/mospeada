import {useLayoutEffect,useRef,useSyncExternalStore} from 'react'
import {getPlayerHealth,subscribePlayerHealth,playerCombat} from '../player/playerCombat.js'
import {rideCommand} from './rideUI.js'
import {cycloneFontReady,fitCycloneReadout} from '../ui/cycloneReadout.js'

export function DefeatReadout({value,displayValue=value,width,height,className=''}){
  const group=useRef(null)
  useLayoutEffect(()=>{
    let mounted=true
    const fit=()=>{if(mounted&&group.current){fitCycloneReadout(group.current,value,{x:0,y:0,width,height});group.current.querySelector('text').textContent=displayValue}}
    fit();cycloneFontReady.then(fit)
    return()=>{mounted=false}
  },[value,displayValue,width,height])
  return <svg className={`ride-defeat-readout ${className}`} viewBox={`0 0 ${width} ${height}`} aria-label={value} role="img"><g ref={group}/></svg>
}

export default function ScottHealthHUD({defeat}){
  const health=useSyncExternalStore(subscribePlayerHealth,getPlayerHealth),maximum=playerCombat.playerMaxHealth,dead=health<=0
  return <>
    <section className={`ride-health${health<=maximum*.25?' critical':''}`} role="progressbar" aria-label="Salud de Scott" aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={health}>
      <span>SCOTT <b>{Math.ceil(health)} / {maximum}</b></span><div><i style={{transform:`scaleX(${Math.max(0,health/maximum)})`}}/></div>
    </section>
    {dead&&<section className="ride-defeat-overlay" role="alert">
      <div className="ride-defeat-band"><div className="ride-defeat-title"><strong><DefeatReadout value="DERROTADO" width={460} height={72}/></strong></div></div>
      <button className="ride-defeat-reset" type="button" aria-label="Reintentar desde el último checkpoint (R)" aria-keyshortcuts="R" onClick={()=>rideCommand({retryDefeat:true})}><kbd aria-hidden="true"><DefeatReadout value="R" width={40} height={46}/></kbd><DefeatReadout value="RESET" width={114} height={34} className="ride-defeat-reset-label"/></button>
    </section>}
  </>
}
