import {useLayoutEffect,useMemo} from 'react'
import {useTexture} from '@react-three/drei'
import {useFrame} from '@react-three/fiber'
import {registerColliders} from '../../player/collisionWorld.js'
import {FOLIAGE_CATALOG} from './foliageCatalog.js'
import {foliageCardMaterial,ForestSpriteBatch} from './forestFoliageLibrary.js'
import {forestBoundaryLayout,createBoundaryColliders,createBoundaryLogs} from './forestBoundaries.js'

export default function ForestBoundaries({assets}){
  const atlas=useTexture(FOLIAGE_CATALOG.atlas.url)
  const plants=useMemo(()=>{const material=foliageCardMaterial(atlas,false,true),batch=new ForestSpriteBatch(forestBoundaryLayout.sprites,material);batch.distance=160;batch.name='Forest_boundary_dense_illustrated_understory';return {material,batch}},[atlas])
  const logs=useMemo(()=>createBoundaryLogs(assets.find(a=>a.name==='CommonTree_3')),[assets])
  const lifetime=useMemo(()=>({refs:0}),[plants,logs])
  useFrame(({camera})=>plants.batch.updateDistance(camera),.5)
  useLayoutEffect(()=>{
    lifetime.refs++;const colliders=createBoundaryColliders(),remove=registerColliders(colliders)
    if(import.meta.env.DEV)window.__FOREST_BOUNDARIES__={layout:forestBoundaryLayout,colliders,logs,plants}
    return()=>{remove();if(import.meta.env.DEV)delete window.__FOREST_BOUNDARIES__;lifetime.refs--;setTimeout(()=>{if(!lifetime.refs){plants.batch.dispose();plants.material.dispose();logs.owned.forEach(g=>g.dispose())}},0)}
  },[plants,logs,lifetime])
  return <group name="Forest_forward_route_edges">
    <primitive object={plants.batch} dispose={null}/><primitive object={logs.group} dispose={null}/>
  </group>
}
