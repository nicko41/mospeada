import {useLayoutEffect,useRef} from 'react'
import {playerCombat,subscribePlayerHealth} from '../player/playerCombat.js'

export default function ScottHitFeedback({paused=false}){
  const layer=useRef(null)
  useLayoutEffect(()=>{
    let hit=playerCombat.hitVersion,reset=playerCombat.resetVersion,animation=null
    const clear=()=>{animation?.cancel();animation=null}
    const unsubscribe=subscribePlayerHealth(()=>{
      if(reset!==playerCombat.resetVersion){reset=playerCombat.resetVersion;hit=playerCombat.hitVersion;clear();return}
      if(hit===playerCombat.hitVersion)return
      hit=playerCombat.hitVersion
      clear()
      if(!paused)animation=layer.current.animate([{opacity:0},{opacity:.38,offset:.08},{opacity:0}],{duration:360,easing:'ease-out'})
    })
    return()=>{unsubscribe();clear()}
  },[paused])
  return <div ref={layer} className="scott-hit-vignette" aria-hidden="true"/>
}
