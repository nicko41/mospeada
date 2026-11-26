import {useTexture} from '../../loading/resources.js'
import { useEffect } from 'react'
import {useThree} from '@react-three/fiber'

import ForestTerrain, { preloadForestGround } from './ForestTerrain.jsx'
import ForestVegetation from './ForestVegetation.jsx'
import ForestProps from './ForestProps.jsx'
import ForestAtmosphere from './ForestAtmosphere.jsx'
import ForestPerformance from './ForestPerformance.jsx'
import ForestBoundaries from './ForestBoundaries.jsx'
import {prepareStage2Resources} from './ForestStage2.jsx'
import ForestAlpha, { preloadForestAlpha } from './ForestAlpha.jsx'
import ForestCrashSite from './ForestCrashSite.jsx'
import ForestFoliagePilot,{preloadFoliagePilot} from './ForestFoliagePilot.jsx'
import ForestFoliageWorld,{preloadFoliageWorld} from './ForestFoliageWorld.jsx'
import {foliageWorldMode} from './forestFoliageWorldConfig.js'
import { prepareForestAssets, useForestAssets } from './forestAssets.js'
import {createAnimeForestAssets} from './forestAnimeCanopies.js'
import largeCanopyUrl from '../../../assets/texturas/follaje/follaje1.png'
import edgeCanopyUrl from '../../../assets/texturas/follaje/follaje2.png'
import {ForestStageStreaming} from '../../loading/ForestStageStreaming.jsx'
useTexture.preload([largeCanopyUrl,edgeCanopyUrl])
const preparedAssets=new WeakMap()

export default function ForestEnvironment() {
  const {gl,camera}=useThree()
  const foliageMode=foliageWorldMode()
  preloadForestAlpha()
  preloadForestGround()
  if(foliageMode==='world')preloadFoliageWorld();else preloadFoliagePilot()
  const loaded = useForestAssets(),atlases=useTexture([largeCanopyUrl,edgeCanopyUrl])
  // Developer-only baseline for matching before/after captures, never a UI or
  // gameplay option. Production always uses the approved illustrated crowns.
  const baseline=import.meta.env.DEV&&typeof location!=='undefined'&&new URLSearchParams(location.search).get('canopies')==='original'
  let prepared=preparedAssets.get(gl)
  if(!prepared||prepared.loaded!==loaded||prepared.baseline!==baseline){const originalAssets=prepareForestAssets(loaded),canopies=baseline?null:createAnimeForestAssets(originalAssets,atlases);prepared={loaded,baseline,canopies,assets:canopies?.assets||originalAssets};preparedAssets.set(gl,prepared)}
  const {canopies,assets}=prepared
  prepareStage2Resources(gl,camera,assets).catch(()=>{})
  useEffect(()=>{if(!canopies)return;canopies.refs=(canopies.refs||0)+1;return()=>{canopies.refs--;setTimeout(()=>{if(!canopies.refs)canopies.dispose()},0)}},[canopies])
  return <>
    <ForestAtmosphere />
    <ForestPerformance />
    <group name="MOSPEADA_Level_01_Forest">
      <ForestTerrain />
      <ForestVegetation assets={assets} />
      {foliageMode==='world'?<ForestFoliageWorld/>:<ForestFoliagePilot />}
      <ForestProps assets={assets} />
      <ForestBoundaries assets={assets}/>
      <ForestAlpha assets={assets} />
      <ForestCrashSite assets={assets}/>
      <ForestStageStreaming assets={assets}/>
    </group>
  </>
}
