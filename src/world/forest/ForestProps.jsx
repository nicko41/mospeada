import { useLayoutEffect } from 'react'
import { registerColliders } from '../../player/collisionWorld.js'
import { FOREST } from './forestConfig.js'
import { forestLayout } from './forestLayout.js'
import ForestInstances from './ForestInstances.jsx'
import { createForestColliders } from './forestColliders.js'
import {forestBoundaryLayout} from './forestBoundaries.js'

const placements=Object.fromEntries(Object.entries(forestLayout).map(([name,p])=>[name,[...p,...forestBoundaryLayout.byName[name].filter(v=>v.kind==='rock')]]))

export default function ForestProps({ assets }) {
  useLayoutEffect(() => registerColliders(createForestColliders(assets)), [assets])
  return assets.filter(a => a.kind === 'rock' || a.kind === 'pebble').flatMap(asset => asset.parts.map((part, i) =>
    <ForestInstances key={`${asset.name}${i}`} part={part} placements={placements[asset.name]}
      bounds={asset.bounds} kind={asset.kind} distance={asset.kind === 'rock' ? FOREST.propDistance : FOREST.grassDistance}
      name={`Forest_prop_${asset.name}_${i}`} />))
}
