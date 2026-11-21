import { useEffect,useMemo } from 'react'
import { useTexture } from '@react-three/drei'
import { useFrame,useThree } from '@react-three/fiber'
import { LinearFilter,LinearMipmapLinearFilter,SRGBColorSpace } from 'three'
import { FOLIAGE_CATALOG } from './foliageCatalog.js'
import { foliagePilotPlacements,forestUnderstoryStats } from './forestUnderstory.js'
import { foliageCardMaterial,foliageContactShadows,ForestSpriteBatch } from './forestFoliageLibrary.js'

export const preloadFoliagePilot=()=>useTexture.preload(FOLIAGE_CATALOG.atlas.url)
export default function ForestFoliagePilot(){
  const atlas=useTexture(FOLIAGE_CATALOG.atlas.url),{gl}=useThree()
  const resources=useMemo(()=>{
    atlas.colorSpace=SRGBColorSpace;atlas.minFilter=LinearMipmapLinearFilter;atlas.magFilter=LinearFilter;atlas.generateMipmaps=true;atlas.anisotropy=Math.min(4,gl.capabilities.getMaxAnisotropy());atlas.needsUpdate=true
    const material=foliageCardMaterial(atlas,true,true)
    return{material,batch:new ForestSpriteBatch(foliagePilotPlacements,material),shadows:foliageContactShadows(foliagePilotPlacements)}
  },[atlas,gl])
  useFrame(({camera})=>{resources.batch.updateDistance(camera);resources.shadows.updateDistance(camera)},.5)
  useEffect(()=>{if(import.meta.env.DEV)window.__FOREST_FOLIAGE_PILOT__={...resources,catalog:FOLIAGE_CATALOG,placements:foliagePilotPlacements,stats:forestUnderstoryStats};return()=>{if(import.meta.env.DEV)delete window.__FOREST_FOLIAGE_PILOT__}},[resources])
  return <group name="Forest_illustrated_foliage_test_zone" dispose={null}>
    <primitive object={resources.batch} receiveShadow />
    <primitive object={resources.shadows}/>
  </group>
}
