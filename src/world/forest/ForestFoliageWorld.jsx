import {useEffect,useMemo,useRef} from 'react'
import {useFrame,useLoader,useThree} from '@react-three/fiber'
import {useTexture} from '@react-three/drei'
import {LinearFilter,LinearMipmapLinearFilter,SRGBColorSpace,Vector3} from 'three'
import {FOLIAGE_CATALOG} from './foliageCatalog.js'
import {FOLIAGE_WORLD} from './forestFoliageWorldConfig.js'
import {ForestFoliageWorldLoader} from './forestFoliageWorldLoader.js'
import {worldFoliageMaterial} from './forestFoliageWorldRendering.js'
import {foliageContactMaterial} from './forestFoliageLibrary.js'
import {ForestFoliageWorldManager} from './forestFoliageWorldManager.js'
import {renderFrameMetrics} from '../../rendering/renderMetrics.js'
import {animeState} from '../../rendering/animeState.js'
import {foliageTelemetry,foliageTelemetryStore,foliageRecording} from './forestFoliageTelemetry.js'
import ForestFoliageDiagnostics from './ForestFoliageDiagnostics.jsx'
import {forestOpeningState} from './forestOpeningState.js'

const cache=new WeakMap(),key=FOLIAGE_WORLD.version+'-'+FOLIAGE_WORLD.seed
export const preloadFoliageWorld=()=>{useTexture.preload(FOLIAGE_CATALOG.atlas.url);useLoader.preload(ForestFoliageWorldLoader,key)}
export default function ForestFoliageWorld(){
  const world=useLoader(ForestFoliageWorldLoader,key),atlas=useTexture(FOLIAGE_CATALOG.atlas.url),{gl,camera,scene}=useThree()
  const manager=useMemo(()=>{
    const previous=cache.get(gl);if(previous?.world===world)return previous.manager
    atlas.colorSpace=SRGBColorSpace;atlas.minFilter=LinearMipmapLinearFilter;atlas.magFilter=LinearFilter;atlas.anisotropy=Math.min(4,gl.capabilities.getMaxAnisotropy());atlas.generateMipmaps=true;atlas.needsUpdate=true
    const density={value:FOLIAGE_WORLD.profiles[FOLIAGE_WORLD.defaultProfile]},materials={density,near:worldFoliageMaterial(atlas,'near',density),far:worldFoliageMaterial(atlas,'far',density),contact:foliageContactMaterial('foliageContact')}
    const manager=new ForestFoliageWorldManager(world,materials,gl,camera);cache.set(gl,{world,manager,refs:0});return manager
  },[world,atlas,gl,camera])
  const actor=useRef(),position=useMemo(()=>new Vector3(),[]),timing=useRef({seconds:0,frames:[],sinceMetric:0})
  useFrame((_,delta)=>{
    if(!actor.current?.parent)actor.current=scene.getObjectByName('Scott_original_playback')||scene.getObjectByName('Cyclone_riding_vehicle')
    if(actor.current)actor.current.getWorldPosition(position)
    manager.update(position,camera,delta)
  },.6)
  useFrame((_,delta)=>{
    if(!animeState.snapshot().nightReady||forestOpeningState.snapshot().phase!=='done')return
    const state=timing.current;state.frames.push(delta*1000);if(state.frames.length>180)state.frames.shift();state.seconds+=delta;state.sinceMetric+=delta
    Object.assign(foliageTelemetry,{drawCalls:renderFrameMetrics.drawCalls+manager.warmCalls,triangles:renderFrameMetrics.triangles+manager.warmTriangles,width:renderFrameMetrics.width,height:renderFrameMetrics.height,pixelRatio:renderFrameMetrics.pixelRatio,profile:manager.profile})
    if(state.sinceMetric>.8){state.sinceMetric=0;const counts=manager.visibleGroups(camera),ordered=state.frames.slice().sort((a,b)=>a-b),mean=state.frames.reduce((n,v)=>n+v,0)/state.frames.length;Object.assign(foliageTelemetry,{fps:1000/mean,frameMs:mean,p95Ms:ordered[Math.floor(ordered.length*.95)],visibleGroups:manager.enabled?counts.groups:0,nearGroups:counts.crossed,farGroups:counts.billboards,residentSectors:counts.residentSectors,pendingSectors:counts.pendingSectors,gpuMB:counts.gpuMB,worldGroups:counts.worldGroups,latePrepares:counts.latePrepares,projectedScreenArea:counts.projectedScreenArea,preparationMs:manager.preparationMs});foliageRecording.sample();foliageTelemetryStore.publish()}
  },1.5)
  useEffect(()=>{
    const record=cache.get(gl);record.refs++
    const debug={manager,world,materials:manager.materials,catalog:FOLIAGE_CATALOG,metrics:foliageTelemetry,recording:foliageRecording,mode:'world'}
    if(import.meta.env.DEV)window.__FOREST_FOLIAGE_WORLD__=debug
    return()=>{record.refs--;if(import.meta.env.DEV)delete window.__FOREST_FOLIAGE_WORLD__;setTimeout(()=>{if(!record.refs){record.manager.dispose();if(cache.get(gl)===record)cache.delete(gl)}},0)}
  },[manager,gl,world])
  return <><primitive object={manager} dispose={null}/><ForestFoliageDiagnostics manager={manager}/></>
}
