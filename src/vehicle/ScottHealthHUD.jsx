import {useSyncExternalStore} from 'react'
import {getPlayerHealth,subscribePlayerHealth,playerCombat} from '../player/playerCombat.js'
import {rideCommand} from './rideUI.js'

export default function ScottHealthHUD({defeat}){
  const health=useSyncExternalStore(subscribePlayerHealth,getPlayerHealth),maximum=playerCombat.playerMaxHealth,dead=health<=0
  return <>
    <section className={`ride-health${health<=maximum*.25?' critical':''}`} role="progressbar" aria-label="Salud de Scott" aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={health}>
      <span>SCOTT <b>{Math.ceil(health)} / {maximum}</b></span><div><i style={{transform:`scaleX(${Math.max(0,health/maximum)})`}}/></div>
    </section>
    {dead&&<section className="ride-defeat-overlay" role="alert"><div><strong>SCOTT DERROTADO</strong><p>Volvé al último checkpoint.</p><button onClick={()=>rideCommand({retryDefeat:true})}>Reintentar · R</button></div></section>}
  </>
}
