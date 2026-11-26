import {loadTexture,loadFoliage,configureTexture} from '../../loading/resources.js'
import {usePreparedResource,prepareResource} from '../../loading/preparedResources.js'
import {workQueue} from '../../loading/workQueue.js'
import {prepareTerrain} from '../../loading/terrainPreparation.js'
import {useLayoutEffect,useMemo,useRef} from 'react'
import {useFrame,useThree} from '@react-three/fiber'

import {LinearFilter,LinearMipmapLinearFilter,MirroredRepeatWrapping,SRGBColorSpace,Vector3} from 'three'
import grassUrl from '../../../assets/texturas/pasto/grass-01.jpg'
import dirtUrl from '../../../assets/texturas/pasto/dirt01.jpg'
import canyonUrl from '../../../assets/texturas/pasto/barranco.jpg'
import shoreUrl from '../../../assets/texturas/pasto/orilla-rio.png'
import ForestCanyonSides from './ForestCanyonSides.jsx'
import {createForestGroundMaterial} from './forestGroundMaterial.js'
import {stage2SurfaceHeight,stage2Height} from './forestStage2Terrain.js'
import {createRiverGeometry} from './forestCanyon.js'
import {canyonEarthMaterial,canyonRiverMaterial,canyonShoreMaterial} from './forestCanyonMaterials.js'
import {createCanyonDressing} from './forestCanyonDressing.js'
import {createCanyonFoliageSteps} from './forestCanyonFoliage.js'
import {stage2Layout} from './forestStage2Layout.js'
import {stage2PathX,stage2EarthWeight,stage2Void,stage2LipZ,FOREST_STAGE2} from './forestStage2Config.js'
import {createForestSideLayoutSteps,createSideBoundaryLibrary,createSideBoundaryColliders,forestSideWidth,ForestSideBoundaryBand} from './forestSideBoundaries.js'
import {registerColliders,cylinderCollider} from '../../player/collisionWorld.js'
import {prepareRideSurfaceGeometrySteps,registerRideSurfaces} from '../../vehicle/rideSurface.js'
import {getForestImpostor} from './forestImpostors.js'
import {forestLodRange} from './forestLod.js'
import ForestInstances,{prepareForestInstances} from './ForestInstances.jsx'
import {canyonSideHeight} from './forestCanyonSides.js'
import {FOLIAGE_CATALOG} from './foliageCatalog.js'
import {ForestFoliageWorldManager} from './forestFoliageWorldManager.js'
import {worldFoliageMaterial} from './forestFoliageWorldRendering.js'
import {FOLIAGE_WORLD} from './forestFoliageWorldConfig.js'
import {STAGE2_FOLIAGE_KEY} from './forestStage2Foliage.js'
import {foliageContactMaterial} from './forestFoliageLibrary.js'

export function preloadForestStage2(){prepareTerrain('stage2');loadFoliage(STAGE2_FOLIAGE_KEY)}
async function createStage2Resources(gl,camera,assets){
  const [grass,dirt,atlas,canyonTexture,shoreTexture,world]=await Promise.all([...[grassUrl,dirtUrl,FOLIAGE_CATALOG.atlas.url,canyonUrl,shoreUrl].map(loadTexture),loadFoliage(STAGE2_FOLIAGE_KEY)])

  const {terrain,sides}=await prepareTerrain('stage2')
  const ground=await workQueue.submit(()=>{
    const material=createForestGroundMaterial(grass,dirt,gl.capabilities.getMaxAnisotropy()),compile=material.onBeforeCompile
    material.name='Forest Plano 2 / approved illustrated ground'
    material.onBeforeCompile=(shader,renderer)=>{
      compile(shader,renderer)
      shader.fragmentShader=`float stage2Earth(vec2 p){float t=smoothstep(0.0,80.0,-p.y-400.0);float oldX=sin(p.y*.013)*20.0+sin(p.y*.033)*3.0;float pathX=mix(oldX,${stage2PathX(-480).toFixed(9)},t);return 1.0-smoothstep(1.2,4.5,abs(p.x-pathX));}\n`+shader.fragmentShader
      shader.fragmentShader=shader.fragmentShader.replace('float earthMask=forestPathEarth(ground);','float earthMask=stage2Earth(ground);').replace('float forestGroundShade=texture2D(uForestGroundShade,vForestGround/800.0+.5).r;','float forestGroundShade=1.0;')
    }
    material.customProgramCacheKey=()=> 'forest-stage2-approved-images-v1';return material
  },'stage2 ground material')
  const cliff=await workQueue.submit(()=>{
    for(const texture of [canyonTexture,shoreTexture]){texture.colorSpace=SRGBColorSpace;texture.wrapS=texture.wrapT=MirroredRepeatWrapping;texture.minFilter=LinearMipmapLinearFilter;texture.magFilter=LinearFilter;texture.generateMipmaps=true;texture.anisotropy=Math.min(8,gl.capabilities.getMaxAnisotropy());texture.needsUpdate=true}
    shoreTexture.repeat.set(.5,.5)
    return {wall:canyonEarthMaterial(canyonTexture,{stratified:true}),bed:canyonShoreMaterial(shoreTexture,grass)}
  },'stage2 cliff materials')
  const canyon=await workQueue.submit(()=>createCanyonDressing(assets,stage2Height),'stage2 canyon dressing')
  const river=await workQueue.submit(()=>({geometry:createRiverGeometry(),...canyonRiverMaterial()}),'stage2 river')
  const distant=await workQueue.submit(()=>new Map(assets.filter(a=>a.kind==='tree').map(a=>[a.name,getForestImpostor(gl,a)])),'stage2 impostors')
  const plants=await workQueue.submit(()=>{
    configureTexture(atlas,{colorSpace:SRGBColorSpace,minFilter:LinearMipmapLinearFilter,magFilter:LinearFilter,anisotropy:Math.min(4,gl.capabilities.getMaxAnisotropy()),generateMipmaps:true})
    const density={value:FOLIAGE_WORLD.profiles[FOLIAGE_WORLD.defaultProfile]},materials={density,near:worldFoliageMaterial(atlas,'near',density),far:worldFoliageMaterial(atlas,'far',density),contact:foliageContactMaterial('foliageCard')}
    return new ForestFoliageWorldManager(world,materials,gl,camera)
  },'stage2 foliage manager')
  const rim=await workQueue.drain(createCanyonFoliageSteps(atlas,terrain,sides),'stage2 rim foliage')
  const boundary=await (async()=>{const library=createSideBoundaryLibrary(assets,atlas),layout=await workQueue.drain(createForestSideLayoutSteps({minZ:FOREST_STAGE2.endZ,maxZ:FOREST_STAGE2.startZ,pathAt:stage2PathX,heightAt:stage2SurfaceHeight,widthAt:(z,side)=>forestSideWidth(z,side)-side*stage2PathX(z),seed:19831124,trees:library.trees,allowed:(x,z,r)=>!stage2Void(x,z)&&Math.min(Math.abs(z-stage2LipZ(x)),Math.abs(z-stage2LipZ(x,true)))>4+r}),'stage2 boundary layout');const band=new ForestSideBoundaryBand(layout,library,stage2SurfaceHeight,{deferred:true});await workQueue.drain(band.preparationSteps,'stage2 boundary batches');return{library,layout,band}})()
  await (async()=>{
    const specs=[]
    for(const asset of assets){
      const common={bounds:asset.bounds,kind:asset.kind}
      if(stage2Layout.layout[asset.name].length){
        const base={...common,placements:stage2Layout.layout[asset.name],heightAt:stage2SurfaceHeight}
        ;[...asset.parts,...(asset.midParts||[])].forEach((part,i)=>specs.push({...base,part,distance:forestLodRange(asset.kind).max,name:'Forest_Plano_2_detail_'+asset.name+i}))
        distant.get(asset.name)?.parts.forEach((part,i)=>specs.push({...base,part,distance:340,minimum:forestLodRange('tree',true).start,name:'Forest_Plano_2_horizon_'+asset.name+i}))
      }
      if(asset.kind==='tree'){
        const base={...common,placements:sides.byName[asset.name],heightAt:canyonSideHeight}
        ;[...asset.parts,...(asset.midParts||[])].forEach((part,i)=>specs.push({...base,part,distance:forestLodRange('tree').max,name:'Forest_side_detail_'+asset.name+i}))
        distant.get(asset.name).parts.forEach((part,i)=>specs.push({...base,part,distance:340,minimum:forestLodRange('tree',true).start,name:'Forest_side_horizon_'+asset.name+i}))
      }
    }
    await Promise.all(specs.map(props=>prepareForestInstances(gl,props)))
  })()
  for(const geometry of [...terrain.tops,terrain.cliffs])await workQueue.drain(prepareRideSurfaceGeometrySteps(geometry),'stage2 contact grid')
  return {terrain,sides,ground,cliff,canyon,river,distant,plants,rim,boundary,lifetime:{refs:0}}
}
export const prepareStage2Resources=(gl,camera,assets)=>prepareResource(gl,'stage2 resources',()=>createStage2Resources(gl,camera,assets))
export default function ForestStage2({assets}){
  const {gl,camera,scene}=useThree()
  const resources=usePreparedResource(gl,'stage2 resources',()=>createStage2Resources(gl,camera,assets))
  const {terrain,sides,ground,cliff,canyon,river,distant,plants,rim,boundary,lifetime}=resources
  const root=useRef(),actor=useRef(),position=useMemo(()=>new Vector3(),[])
  useFrame((_,dt)=>{river.time.value+=Math.min(dt,.1);if(!actor.current?.parent)actor.current=scene.getObjectByName('Scott_original_playback')||scene.getObjectByName('Cyclone_riding_vehicle');if(actor.current)actor.current.getWorldPosition(position);plants.update(position,camera,dt);rim.update(camera);boundary.band.update(camera)},.6)
  useLayoutEffect(()=>{
    lifetime.refs++
    const removeSurfaces=registerRideSurfaces(root.current)
    const colliders=[...assets.flatMap(a=>stage2Layout.layout[a.name].map(p=>{const y=stage2SurfaceHeight(p.x,p.z);return cylinderCollider(p.x,p.z,p.kind==='tree'?p.trunkRadius:p.scale*.7,y-.15,y+(p.kind==='tree'?a.bounds.max.y*p.scale*.78:p.scale))})),...createSideBoundaryColliders(boundary.layout)],remove=registerColliders(colliders)
    if(import.meta.env.DEV)window.__FOREST_STAGE2__={terrain,ground,plants,layout:stage2Layout,colliders,river,canyon,cliff,sides,rim,boundary}
    return()=>{remove();removeSurfaces();if(import.meta.env.DEV)delete window.__FOREST_STAGE2__;lifetime.refs--;setTimeout(()=>{if(!lifetime.refs){terrain.tops.forEach(g=>g.dispose());terrain.cliffs.dispose();terrain.bed.dispose();ground.dispose();cliff.wall.dispose();cliff.bed.dispose();plants.dispose();river.geometry.dispose();river.material.dispose();canyon.dispose();sides.dispose();rim.dispose();boundary.band.dispose();boundary.library.dispose()}},0)}
  },[assets,terrain,ground,cliff,plants,lifetime,canyon,river,sides,rim,boundary])
  return <group ref={root} name="MOSPEADA_Level_01_Forest_Plano_2">
    {terrain.tops.map((geometry,i)=><mesh key={i} name={'Forest_Plano_2_ground_'+i} geometry={geometry} material={ground} receiveShadow userData={{forest:true,rideSurface:true,rideSurfaceType:'dirt',rideSurfaceBiome:'forest',rideSurfaceEarthWeight:stage2EarthWeight}}/>)}
    <mesh name="Forest_Plano_2_canyon_cliffs" geometry={terrain.cliffs} material={cliff.wall} userData={{forest:true,rideBarrier:true}}/>
    <mesh name="Forest_Plano_2_deep_ravine_bed" geometry={terrain.bed} material={cliff.bed} userData={{forest:true}}/>
    <mesh name="Forest_canyon_flowing_river" geometry={river.geometry} material={river.material} userData={{forest:true}}/>
    <primitive object={canyon.group} dispose={null}/>
    <primitive object={rim.group} dispose={null}/>
    <primitive object={boundary.band} dispose={null}/>
    <ForestCanyonSides sides={sides} assets={assets} distant={distant} ground={ground} cliff={cliff} river={river}/>
    {assets.filter(a=>stage2Layout.layout[a.name].length).map(asset=><group key={asset.name}>
      {[...asset.parts,...(asset.midParts||[])].map((part,i)=><ForestInstances deferred key={i} part={part} bounds={asset.bounds} placements={stage2Layout.layout[asset.name]} kind={asset.kind} distance={forestLodRange(asset.kind).max} heightAt={stage2SurfaceHeight} name={'Forest_Plano_2_detail_'+asset.name+i}/>)}
      {distant.get(asset.name)?.parts.map((part,i)=><ForestInstances deferred key={'far'+i} part={part} bounds={asset.bounds} placements={stage2Layout.layout[asset.name]} kind={asset.kind} distance={340} minimum={forestLodRange('tree',true).start} heightAt={stage2SurfaceHeight} name={'Forest_Plano_2_horizon_'+asset.name+i}/>)}
    </group>)}
    <primitive object={plants} dispose={null}/>
  </group>
}
