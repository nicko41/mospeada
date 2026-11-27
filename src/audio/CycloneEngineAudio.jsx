import {useLayoutEffect,useMemo} from 'react'
import {useFrame} from '@react-three/fiber'
import {desktopInput} from '../player/touchInput.js'
import {playerCombat} from '../player/playerCombat.js'
import {gameAudio} from './gameAudio.js'
import {CycloneEngine} from './CycloneEngine.js'
import {bikeConfig} from '../vehicle/bikeConfig.js'

export default function CycloneEngineAudio({runtime}){
  const engine=useMemo(()=>new CycloneEngine(gameAudio),[])
  useLayoutEffect(()=>{
    if(import.meta.env.DEV)window.__CYCLONE_ENGINE_AUDIO__=engine
    return()=>{engine.dispose();if(import.meta.env.DEV&&window.__CYCLONE_ENGINE_AUDIO__===engine)delete window.__CYCLONE_ENGINE_AUDIO__}
  },[engine])
  useFrame((_,delta)=>engine.update(Math.min(delta,.1),{
    state:runtime.state,input:runtime.input,speedReference:bikeConfig.maxSpeed,paused:runtime.paused,
    enabled:desktopInput.ready&&runtime.state?.riderMode==='mounted'&&!runtime.armorController?.active&&!runtime.opening?.active&&!runtime.ending?.holding&&!playerCombat.dead&&(!runtime.transformEntry||runtime.transformEntry.phase==='idle'),
  }),.13)
  return null
}
