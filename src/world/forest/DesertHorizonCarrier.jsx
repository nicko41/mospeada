import {useGLTF} from '../../loading/resources.js'
import {useStagePreparationRoot} from '../../loading/DeferredStage.jsx'
import {useLayoutEffect,useMemo,useRef} from 'react'
import {useFrame} from '@react-three/fiber'

import {HORIZON_CARRIER,createHorizonCarrier} from './horizonCarrier.js'
import {DESERT_CLIMAX} from './forestClimaxConfig.js'

export default function DesertHorizonCarrier({world}){
 const asset=useGLTF(HORIZON_CARRIER.model),instance=useMemo(()=>createHorizonCarrier(asset.scene,world.materials.desert),[asset.scene,world]),age=useRef(1)
 useStagePreparationRoot(instance.root)
 useLayoutEffect(()=>{
  world.add(instance.root);instance.refs=(instance.refs||0)+1
  if(import.meta.env.DEV)window.__HORIZON_CARRIER__=instance
  return()=>{instance.root.removeFromParent();if(import.meta.env.DEV&&window.__HORIZON_CARRIER__===instance)delete window.__HORIZON_CARRIER__;instance.refs--;setTimeout(()=>{if(!instance.refs)instance.dispose()},0)}
 },[world,instance])
 useFrame(({camera},dt)=>{
  instance.root.visible=instance.root.userData.stagePrepared!==false&&world.bound&&!!world.climaxPlain&&world.distance(camera.position.z)>DESERT_CLIMAX.start-180
  if(!instance.root.visible)return
  instance.ground.value=world.position.y+instance.placement.ground
  age.current+=dt;if(age.current>=.2){instance.root.updateWorldMatrix(true,true);instance.lod.update(camera);age.current=0}
 },.75)
 return null
}
