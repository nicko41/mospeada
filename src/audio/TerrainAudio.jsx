import {useLayoutEffect,useMemo} from 'react'
import {useFrame} from '@react-three/fiber'
import {desktopInput} from '../player/touchInput.js'
import {playerCombat} from '../player/playerCombat.js'
import {gameAudio} from './gameAudio.js'
import {TerrainSounds} from './TerrainSounds.js'

export default function TerrainAudio({runtime}){
  const sounds=useMemo(()=>new TerrainSounds(gameAudio),[])
  useLayoutEffect(()=>{
    if(import.meta.env.DEV)window.__TERRAIN_AUDIO__=sounds
    return()=>{sounds.dispose();if(import.meta.env.DEV&&window.__TERRAIN_AUDIO__===sounds)delete window.__TERRAIN_AUDIO__}
  },[sounds])
  useFrame(()=>sounds.update({
    state:runtime.state,wheels:runtime.weathering?.contacts.wheels,input:runtime.input,paused:runtime.paused,
    enabled:desktopInput.ready&&runtime.state?.riderMode==='mounted'&&!runtime.armorController?.active&&!runtime.opening?.active&&!runtime.ending?.holding&&!playerCombat.dead&&(!runtime.transformEntry||runtime.transformEntry.phase==='idle'),
  }),.135)
  return null
}
