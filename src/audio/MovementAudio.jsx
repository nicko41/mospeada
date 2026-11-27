import {useMemo} from 'react'
import {useFrame} from '@react-three/fiber'
import {desktopInput} from '../player/touchInput.js'
import {playerCombat} from '../player/playerCombat.js'
import {gameAudio} from './gameAudio.js'
import {MovementSounds} from './MovementSounds.js'

export default function MovementAudio({runtime}){
  const sounds=useMemo(()=>new MovementSounds(gameAudio),[])
  useFrame(()=>sounds.update({
    state:runtime.state,armor:runtime.armorController?.active?runtime.armorController.state:null,
    instance:runtime.scottInstance,input:runtime.input,paused:runtime.paused,
    enabled:desktopInput.ready&&!runtime.opening?.active&&!runtime.ending?.holding&&!playerCombat.dead,
  }),.14)
  return null
}
