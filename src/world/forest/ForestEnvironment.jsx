import { useMemo } from 'react'
import ForestTerrain, { preloadForestGround } from './ForestTerrain.jsx'
import ForestVegetation from './ForestVegetation.jsx'
import ForestProps from './ForestProps.jsx'
import ForestAtmosphere from './ForestAtmosphere.jsx'
import ForestPerformance from './ForestPerformance.jsx'
import ForestBoundaries from './ForestBoundaries.jsx'
import ForestStage2,{preloadForestStage2} from './ForestStage2.jsx'
import ForestAlpha, { preloadForestAlpha } from './ForestAlpha.jsx'
import ForestCrashSite from './ForestCrashSite.jsx'
import ForestFoliagePilot,{preloadFoliagePilot} from './ForestFoliagePilot.jsx'
import ForestFoliageWorld,{preloadFoliageWorld} from './ForestFoliageWorld.jsx'
import {foliageWorldMode} from './forestFoliageWorldConfig.js'
import { prepareForestAssets, useForestAssets } from './forestAssets.js'

export default function ForestEnvironment() {
  const foliageMode=foliageWorldMode()
  preloadForestAlpha()
  preloadForestGround()
  preloadForestStage2()
  if(foliageMode==='world')preloadFoliageWorld();else preloadFoliagePilot()
  const loaded = useForestAssets(), assets = useMemo(() => prepareForestAssets(loaded), [loaded])
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
    </group>
  </>
}
