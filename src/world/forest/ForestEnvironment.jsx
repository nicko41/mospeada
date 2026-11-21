import { useEffect,useMemo } from 'react'
import {useTexture} from '@react-three/drei'
import ForestTerrain, { preloadForestGround } from './ForestTerrain.jsx'
import ForestVegetation from './ForestVegetation.jsx'
import ForestProps from './ForestProps.jsx'
import ForestAtmosphere from './ForestAtmosphere.jsx'
import ForestPerformance from './ForestPerformance.jsx'
import ForestBoundaries from './ForestBoundaries.jsx'
import ForestStage2,{preloadForestStage2} from './ForestStage2.jsx'
import ForestStage3 from './ForestStage3.jsx'
import ForestStage4 from './ForestStage4.jsx'
import ForestAlpha, { preloadForestAlpha } from './ForestAlpha.jsx'
import ForestCrashSite from './ForestCrashSite.jsx'
import ForestFoliagePilot,{preloadFoliagePilot} from './ForestFoliagePilot.jsx'
import ForestFoliageWorld,{preloadFoliageWorld} from './ForestFoliageWorld.jsx'
import {foliageWorldMode} from './forestFoliageWorldConfig.js'
import { prepareForestAssets, useForestAssets } from './forestAssets.js'
import {createAnimeForestAssets} from './forestAnimeCanopies.js'
import largeCanopyUrl from '../../../assets/texturas/follaje/follaje1.png'
import edgeCanopyUrl from '../../../assets/texturas/follaje/follaje2.png'

export default function ForestEnvironment() {
  const foliageMode=foliageWorldMode()
  preloadForestAlpha()
  preloadForestGround()
  preloadForestStage2()
  if(foliageMode==='world')preloadFoliageWorld();else preloadFoliagePilot()
  const loaded = useForestAssets(),atlases=useTexture([largeCanopyUrl,edgeCanopyUrl]),originalAssets=useMemo(()=>prepareForestAssets(loaded),[loaded])
  // Developer-only baseline for matching before/after captures, never a UI or
  // gameplay option. Production always uses the approved illustrated crowns.
  const baseline=import.meta.env.DEV&&typeof location!=='undefined'&&new URLSearchParams(location.search).get('canopies')==='original'
  const canopies=useMemo(()=>baseline?null:createAnimeForestAssets(originalAssets,atlases),[originalAssets,atlases[0],atlases[1],baseline]),assets=canopies?.assets||originalAssets
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
      <ForestStage2 assets={assets}/>
      <ForestStage3 assets={assets}/>
      <ForestStage4 assets={assets}/>
    </group>
  </>
}
