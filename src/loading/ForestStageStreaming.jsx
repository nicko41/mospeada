import {useLayoutEffect} from 'react'
import {useThree} from '@react-three/fiber'
import {stageStreaming} from './stageStreaming.js'
import {DeferredStage} from './DeferredStage.jsx'
import ForestStage2 from '../world/forest/ForestStage2.jsx'
import ForestStage3,{prepareForestStage3} from '../world/forest/ForestStage3.jsx'
import ForestStage4,{prepareForestStage4} from '../world/forest/ForestStage4.jsx'
import {workQueue} from './workQueue.js'
export function ForestStageStreaming({assets}){
 const {gl}=useThree()
 if(import.meta.env.DEV){window.__STREAMING__=stageStreaming;window.__QUEUE__=workQueue.telemetry}
 useLayoutEffect(()=>{
  const prepare=()=>{
   prepareForestStage3(gl,assets).catch(error=>stageStreaming.fail('stage3',error))
   prepareForestStage4(gl,assets).catch(error=>stageStreaming.fail('stage4',error))
  }
  window.addEventListener('startup-assets-ready',prepare,{once:true});stageStreaming.start(gl)
  return()=>window.removeEventListener('startup-assets-ready',prepare)
 },[gl,assets])
 return <><DeferredStage id="stage2"><ForestStage2 assets={assets}/></DeferredStage><DeferredStage id="stage3"><ForestStage3 assets={assets}/></DeferredStage><DeferredStage id="stage4"><ForestStage4 assets={assets}/></DeferredStage></>
}
