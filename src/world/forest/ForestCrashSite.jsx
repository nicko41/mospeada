import {useLayoutEffect,useMemo} from 'react'
import {useTexture} from '@react-three/drei'
import {registerColliders} from '../../player/collisionWorld.js'
import {FOLIAGE_CATALOG} from './foliageCatalog.js'
import {createCrashTree,createCrushedFoliage} from './forestCrashDressing.js'
import {CRASH_TREE} from './forestCrashSite.js'

export default function ForestCrashSite({assets}){
  const atlas=useTexture(FOLIAGE_CATALOG.atlas.url)
  const tree=useMemo(()=>createCrashTree(assets.find(a=>a.name===CRASH_TREE.assetName)),[assets])
  const plants=useMemo(()=>createCrushedFoliage(atlas),[atlas])
  const lifetime=useMemo(()=>({refs:0}),[tree,plants])
  useLayoutEffect(()=>{
    lifetime.refs++
    const remove=registerColliders(tree.colliders)
    if(import.meta.env.DEV)window.__FOREST_CRASH_SITE__={tree,plants}
    return()=>{remove();if(import.meta.env.DEV)delete window.__FOREST_CRASH_SITE__;lifetime.refs--;setTimeout(()=>{if(!lifetime.refs){tree.owned.forEach(g=>g.dispose());tree.material.dispose();tree.extraMaterials.forEach(m=>m.dispose());plants.batch.dispose();plants.material.dispose()}},0)}
  },[tree,plants,lifetime])
  return <group name="Forest_local_crash_site"><primitive object={tree.group} dispose={null}/><primitive object={plants.batch} dispose={null}/></group>
}
