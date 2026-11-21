import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import ForestInstances from './ForestInstances.jsx'
import { FOREST } from './forestConfig.js'
import { forestLayout } from './forestLayout.js'
import { forestAtlasDay, getForestImpostor } from './forestImpostors.js'
import { timeOfDayState } from '../TimeOfDay.jsx'
import { forestLodRange } from './forestLod.js'
import { forestRenderLayout,forestWorldRenderLayout,forestUnderstoryStats } from './forestUnderstory.js'
import { foliageWorldMode } from './forestFoliageWorldConfig.js'
import {forestBoundaryLayout} from './forestBoundaries.js'

export default function ForestVegetation({ assets }) {
  const {gl}=useThree()
  const mode=foliageWorldMode(),base=mode==='world'?forestWorldRenderLayout:forestRenderLayout
  // Boundary trees share the normal detail/impostor batches and LOD transition.
  const layout=useMemo(()=>Object.fromEntries(Object.entries(base).map(([name,p])=>[name,forestBoundaryLayout.byName[name].some(v=>v.kind==='tree')?[...p,...forestBoundaryLayout.byName[name]]:p])),[base])
  const distant=useMemo(()=>new Map(assets.filter(a=>a.kind==='tree'||mode==='pilot'&&a.kind==='shrub').map(a=>[a.name,getForestImpostor(gl,a)])),[assets,gl,mode])
  useFrame(()=>{forestAtlasDay.value=timeOfDayState.value},.25)
  useEffect(()=>{
    if(import.meta.env.DEV)window.__FOREST_FOLIAGE__={assets,atlases:distant,day:forestAtlasDay,config:FOREST,layout,sourceLayout:forestLayout,understoryStats:forestUnderstoryStats,mode}
    return()=>{if(import.meta.env.DEV)delete window.__FOREST_FOLIAGE__}
  },[assets,distant,layout,mode])
  return assets.filter(a=>['tree','shrub','grass','plant'].includes(a.kind)&&layout[a.name].length).map(asset=>{
    const range=forestLodRange(asset.kind),farRange=forestLodRange(asset.kind,true),distance=range.max
    return <group key={asset.name} name={`Forest_${asset.name}`}>
      {asset.parts.map((part,i)=><ForestInstances key={i} part={part} placements={layout[asset.name]}
        bounds={asset.bounds} kind={asset.kind} distance={distance} name={`Forest_detail_${asset.name}_${i}`}/>)}
      {distant.get(asset.name)?.parts.map((part,i)=><ForestInstances key={`far${i}`} part={part} placements={layout[asset.name]}
        bounds={asset.bounds} kind={asset.kind} distance={asset.kind==='tree'?FOREST.treeDistance:FOREST.shrubFarDistance}
        minimum={farRange.start} name={`Forest_horizon_${asset.name}_${i}`}/>)}
    </group>
  })
}
