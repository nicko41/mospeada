import { useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import grassUrl from '../../../assets/texturas/pasto/grass-01.jpg'
import dirtUrl from '../../../assets/texturas/pasto/dirt01.jpg'
import { createForestTerrain } from './forestTerrainGeometry.js'
import { createForestGroundMaterial } from './forestGroundMaterial.js'
import {forestEarthWeight} from './forestSurface.js'
export const preloadForestGround=()=>useTexture.preload([grassUrl,dirtUrl])

export default function ForestTerrain() {
  const {gl}=useThree(),[grass,dirt]=useTexture([grassUrl,dirtUrl])
  const geometry = useMemo(createForestTerrain, [])
  const material = useMemo(()=>createForestGroundMaterial(grass,dirt,gl.capabilities.getMaxAnisotropy()), [grass,dirt,gl])
  useEffect(()=>{
    if(import.meta.env.DEV)window.__FOREST_GROUND__={material,grass,dirt}
    return()=>{if(import.meta.env.DEV)delete window.__FOREST_GROUND__}
  },[material,grass,dirt])
  return <mesh name="Forest_organic_ground" geometry={geometry} receiveShadow
    userData={{ rideSurface: true, rideSurfaceType: 'dirt', forest: true,rideSurfaceBiome:'forest',rideSurfaceEarthWeight:forestEarthWeight }}>
    <primitive object={material} attach="material" />
  </mesh>
}
