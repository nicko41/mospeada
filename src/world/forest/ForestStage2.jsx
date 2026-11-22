import {useLayoutEffect,useMemo,useRef} from 'react'
import {useFrame,useLoader,useThree} from '@react-three/fiber'
import {useTexture} from '@react-three/drei'
import {LinearFilter,LinearMipmapLinearFilter,MirroredRepeatWrapping,SRGBColorSpace,Vector3} from 'three'
import grassUrl from '../../../assets/texturas/pasto/grass-01.jpg'
import dirtUrl from '../../../assets/texturas/pasto/dirt01.jpg'
import canyonUrl from '../../../assets/texturas/pasto/barranco.jpg'
import shoreUrl from '../../../assets/texturas/pasto/orilla-rio.png'
import ForestCanyonSides from './ForestCanyonSides.jsx'
import {createCanyonSides} from './forestCanyonSides.js'
import {createForestGroundMaterial} from './forestGroundMaterial.js'
import {createStage2Terrain,stage2SurfaceHeight,stage2Height} from './forestStage2Terrain.js'
import {createRiverGeometry} from './forestCanyon.js'
import {canyonEarthMaterial,canyonRiverMaterial,canyonShoreMaterial} from './forestCanyonMaterials.js'
import {createCanyonDressing} from './forestCanyonDressing.js'
import {createCanyonFoliage} from './forestCanyonFoliage.js'
import {stage2Layout} from './forestStage2Layout.js'
import {stage2PathX,stage2EarthWeight,stage2Void,stage2LipZ,FOREST_STAGE2} from './forestStage2Config.js'
import {createForestSideLayout,createSideBoundaryLibrary,createSideBoundaryColliders,forestSideWidth,ForestSideBoundaryBand} from './forestSideBoundaries.js'
import {registerColliders,cylinderCollider} from '../../player/collisionWorld.js'
import {getForestImpostor} from './forestImpostors.js'
import {forestLodRange} from './forestLod.js'
import ForestInstances from './ForestInstances.jsx'
import {FOLIAGE_CATALOG} from './foliageCatalog.js'
import {ForestFoliageWorldLoader} from './forestFoliageWorldLoader.js'
import {ForestFoliageWorldManager} from './forestFoliageWorldManager.js'
import {worldFoliageMaterial} from './forestFoliageWorldRendering.js'
import {FOLIAGE_WORLD} from './forestFoliageWorldConfig.js'
import {STAGE2_FOLIAGE_KEY} from './forestStage2Foliage.js'
import {foliageContactMaterial} from './forestFoliageLibrary.js'

export function preloadForestStage2(){useTexture.preload([grassUrl,dirtUrl]);useTexture.preload([canyonUrl,shoreUrl]);useTexture.preload(FOLIAGE_CATALOG.atlas.url);useLoader.preload(ForestFoliageWorldLoader,STAGE2_FOLIAGE_KEY)}
export default function ForestStage2({assets}){
  const {gl,camera,scene}=useThree(),[grass,dirt]=useTexture([grassUrl,dirtUrl]),atlas=useTexture(FOLIAGE_CATALOG.atlas.url),world=useLoader(ForestFoliageWorldLoader,STAGE2_FOLIAGE_KEY)
  const terrain=useMemo(createStage2Terrain,[])
  const [canyonTexture,shoreTexture]=useTexture([canyonUrl,shoreUrl]),sides=useMemo(createCanyonSides,[])
  const ground=useMemo(()=>{
    const material=createForestGroundMaterial(grass,dirt,gl.capabilities.getMaxAnisotropy()),compile=material.onBeforeCompile
    material.name='Forest Plano 2 / approved illustrated ground'
    material.onBeforeCompile=(shader,renderer)=>{
      compile(shader,renderer)
      shader.fragmentShader=`float stage2Earth(vec2 p){float t=smoothstep(0.0,80.0,-p.y-400.0);float oldX=sin(p.y*.013)*20.0+sin(p.y*.033)*3.0;float pathX=mix(oldX,${stage2PathX(-480).toFixed(9)},t);return 1.0-smoothstep(1.2,4.5,abs(p.x-pathX));}\n`+shader.fragmentShader
      shader.fragmentShader=shader.fragmentShader.replace('float earthMask=forestPathEarth(ground);','float earthMask=stage2Earth(ground);').replace('float forestGroundShade=texture2D(uForestGroundShade,vForestGround/800.0+.5).r;','float forestGroundShade=1.0;')
    }
    material.customProgramCacheKey=()=> 'forest-stage2-approved-images-v1';return material
  },[grass,dirt,gl])
  const cliff=useMemo(()=>{
    for(const texture of [canyonTexture,shoreTexture]){texture.colorSpace=SRGBColorSpace;texture.wrapS=texture.wrapT=MirroredRepeatWrapping;texture.minFilter=LinearMipmapLinearFilter;texture.magFilter=LinearFilter;texture.generateMipmaps=true;texture.anisotropy=Math.min(8,gl.capabilities.getMaxAnisotropy());texture.needsUpdate=true}
    shoreTexture.repeat.set(.5,.5)
    return {wall:canyonEarthMaterial(canyonTexture,{stratified:true}),bed:canyonShoreMaterial(shoreTexture,grass)}
  },[dirt,grass,canyonTexture,shoreTexture,gl])
  const canyon=useMemo(()=>createCanyonDressing(assets,stage2Height),[assets])
  const river=useMemo(()=>({geometry:createRiverGeometry(),...canyonRiverMaterial()}),[])
  const distant=useMemo(()=>new Map(assets.filter(a=>a.kind==='tree').map(a=>[a.name,getForestImpostor(gl,a)])),[assets,gl])
  const plants=useMemo(()=>{
    atlas.colorSpace=SRGBColorSpace;atlas.minFilter=LinearMipmapLinearFilter;atlas.magFilter=LinearFilter;atlas.anisotropy=Math.min(4,gl.capabilities.getMaxAnisotropy());atlas.generateMipmaps=true;atlas.needsUpdate=true
    const density={value:FOLIAGE_WORLD.profiles[FOLIAGE_WORLD.defaultProfile]},materials={density,near:worldFoliageMaterial(atlas,'near',density),far:worldFoliageMaterial(atlas,'far',density),contact:foliageContactMaterial('foliageCard')}
    return new ForestFoliageWorldManager(world,materials,gl,camera)
  },[world,atlas,gl,camera])
  const rim=useMemo(()=>createCanyonFoliage(atlas,terrain,sides),[atlas,terrain,sides])
  const boundary=useMemo(()=>{const library=createSideBoundaryLibrary(assets,atlas),layout=createForestSideLayout({minZ:FOREST_STAGE2.endZ,maxZ:FOREST_STAGE2.startZ,pathAt:stage2PathX,heightAt:stage2SurfaceHeight,widthAt:(z,side)=>forestSideWidth(z,side)-side*stage2PathX(z),seed:19831124,trees:library.trees,allowed:(x,z,r)=>!stage2Void(x,z)&&Math.min(Math.abs(z-stage2LipZ(x)),Math.abs(z-stage2LipZ(x,true)))>4+r});return{library,layout,band:new ForestSideBoundaryBand(layout,library,stage2SurfaceHeight)}},[assets,atlas])
  const actor=useRef(),position=useMemo(()=>new Vector3(),[]),lifetime=useMemo(()=>({refs:0}),[terrain,ground,cliff,plants,canyon,river,sides,rim,boundary])
  useFrame((_,dt)=>{river.time.value+=Math.min(dt,.1);if(!actor.current?.parent)actor.current=scene.getObjectByName('Scott_original_playback')||scene.getObjectByName('Cyclone_riding_vehicle');if(actor.current)actor.current.getWorldPosition(position);plants.update(position,camera,dt);rim.update(camera);boundary.band.update(camera)},.6)
  useLayoutEffect(()=>{
    lifetime.refs++
    const colliders=[...assets.flatMap(a=>stage2Layout.layout[a.name].map(p=>{const y=stage2SurfaceHeight(p.x,p.z);return cylinderCollider(p.x,p.z,p.kind==='tree'?p.trunkRadius:p.scale*.7,y-.15,y+(p.kind==='tree'?a.bounds.max.y*p.scale*.78:p.scale))})),...createSideBoundaryColliders(boundary.layout)],remove=registerColliders(colliders)
    if(import.meta.env.DEV)window.__FOREST_STAGE2__={terrain,ground,plants,layout:stage2Layout,colliders,river,canyon,cliff,sides,rim,boundary}
    return()=>{remove();if(import.meta.env.DEV)delete window.__FOREST_STAGE2__;lifetime.refs--;setTimeout(()=>{if(!lifetime.refs){terrain.tops.forEach(g=>g.dispose());terrain.cliffs.dispose();terrain.bed.dispose();ground.dispose();cliff.wall.dispose();cliff.bed.dispose();plants.dispose();river.geometry.dispose();river.material.dispose();canyon.dispose();sides.dispose();rim.dispose();boundary.band.dispose();boundary.library.dispose()}},0)}
  },[assets,terrain,ground,cliff,plants,lifetime,canyon,river,sides,rim,boundary])
  return <group name="MOSPEADA_Level_01_Forest_Plano_2">
    {terrain.tops.map((geometry,i)=><mesh key={i} name={'Forest_Plano_2_ground_'+i} geometry={geometry} material={ground} receiveShadow userData={{forest:true,rideSurface:true,rideSurfaceType:'dirt',rideSurfaceBiome:'forest',rideSurfaceEarthWeight:stage2EarthWeight}}/>)}
    <mesh name="Forest_Plano_2_canyon_cliffs" geometry={terrain.cliffs} material={cliff.wall} userData={{forest:true}}/>
    <mesh name="Forest_Plano_2_deep_ravine_bed" geometry={terrain.bed} material={cliff.bed} userData={{forest:true}}/>
    <mesh name="Forest_canyon_flowing_river" geometry={river.geometry} material={river.material} userData={{forest:true}}/>
    <primitive object={canyon.group} dispose={null}/>
    <primitive object={rim.group} dispose={null}/>
    <primitive object={boundary.band} dispose={null}/>
    <ForestCanyonSides sides={sides} assets={assets} distant={distant} ground={ground} cliff={cliff} river={river}/>
    {assets.filter(a=>stage2Layout.layout[a.name].length).map(asset=><group key={asset.name}>
      {[...asset.parts,...(asset.midParts||[])].map((part,i)=><ForestInstances key={i} part={part} bounds={asset.bounds} placements={stage2Layout.layout[asset.name]} kind={asset.kind} distance={forestLodRange(asset.kind).max} heightAt={stage2SurfaceHeight} name={'Forest_Plano_2_detail_'+asset.name+i}/>)}
      {distant.get(asset.name)?.parts.map((part,i)=><ForestInstances key={'far'+i} part={part} bounds={asset.bounds} placements={stage2Layout.layout[asset.name]} kind={asset.kind} distance={340} minimum={forestLodRange('tree',true).start} heightAt={stage2SurfaceHeight} name={'Forest_Plano_2_horizon_'+asset.name+i}/>)}
    </group>)}
    <primitive object={plants} dispose={null}/>
  </group>
}
