import ForestInstances from './ForestInstances.jsx'
import {canyonSideHeight} from './forestCanyonSides.js'
import {forestLodRange} from './forestLod.js'

export default function ForestCanyonSides({sides,assets,distant,ground,cliff,river}){
  return <group name="Forest_canyon_procedural_sides">
    {sides.tiles.map((tile,i)=><group key={i} name={'Forest_canyon_side_'+i}>
      {tile.tops.map((geometry,j)=><mesh key={j} geometry={geometry} material={ground} userData={{forest:true}}/>)}
      <mesh geometry={tile.cliffs} material={cliff.wall} userData={{forest:true}}/>
      <mesh geometry={tile.bed} material={cliff.bed} userData={{forest:true}}/>
      <mesh geometry={tile.river} material={river.material} userData={{forest:true}}/>
    </group>)}
    {assets.filter(a=>a.kind==='tree').map(asset=><group key={asset.name}>
      {asset.parts.map((part,i)=><ForestInstances key={i} part={part} placements={sides.byName[asset.name]} bounds={asset.bounds} kind="tree" distance={forestLodRange('tree').max} heightAt={canyonSideHeight} name={'Forest_side_detail_'+asset.name+i}/>)}
      {distant.get(asset.name).parts.map((part,i)=><ForestInstances key={'far'+i} part={part} placements={sides.byName[asset.name]} bounds={asset.bounds} kind="tree" distance={340} minimum={forestLodRange('tree',true).start} heightAt={canyonSideHeight} name={'Forest_side_horizon_'+asset.name+i}/>)}
    </group>)}
  </group>
}
