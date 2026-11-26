import {usePreparedResource,prepareResource} from '../../loading/preparedResources.js'
import {workQueue} from '../../loading/workQueue.js'
import {loadTexture,configureTexture} from '../../loading/resources.js'
import {useMemo,useLayoutEffect,useRef} from 'react'
import {useFrame,useThree} from '@react-three/fiber'

import {Vector3,SRGBColorSpace,LinearFilter,LinearMipmapLinearFilter} from 'three'
import grassUrl from '../../../assets/texturas/pasto/grass-01.jpg'
import dirtUrl from '../../../assets/texturas/pasto/dirt01.jpg'
import {createForestGroundMaterial} from './forestGroundMaterial.js'
import {stage3PathGLSL} from './forestStage3Config.js'
import {ForestStage3World,stage3World} from './forestStage3World.js'
import {FOLIAGE_CATALOG} from './foliageCatalog.js'
import {worldFoliageMaterial} from './forestFoliageWorldRendering.js'
import {getForestImpostor} from './forestImpostors.js'
import {prepareRideSurfaceGeometrySteps,registerRideSurfaces} from '../../vehicle/rideSurface.js'

async function createStage3Resources(gl,assets){
    const [grass,dirt,atlas]=await Promise.all([grassUrl,dirtUrl,FOLIAGE_CATALOG.atlas.url].map(loadTexture))
    configureTexture(atlas,{colorSpace:SRGBColorSpace,minFilter:LinearMipmapLinearFilter,magFilter:LinearFilter,generateMipmaps:true,anisotropy:Math.min(4,gl.capabilities.getMaxAnisotropy())})
    const ground=createForestGroundMaterial(grass,dirt,gl.capabilities.getMaxAnisotropy()),compile=ground.onBeforeCompile
    ground.name='Forest Plano 3 / approved illustrated ground'
    ground.onBeforeCompile=(shader,renderer)=>{compile(shader,renderer);shader.fragmentShader=stage3PathGLSL+'\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('float earthMask=forestPathEarth(ground);','float earthMask=stage3Earth(ground);').replace('float forestGroundShade=texture2D(uForestGroundShade,vForestGround/800.0+.5).r;','float forestGroundShade=1.0;')}
    ground.customProgramCacheKey=()=> 'forest-stage3-original-images-v1'
    const density={value:1},foliage={density,near:worldFoliageMaterial(atlas,'near',density),far:worldFoliageMaterial(atlas,'far',density)},distant=new Map(assets.filter(a=>a.kind==='tree').map(a=>[a.name,getForestImpostor(gl,a)]))
    const world=new ForestStage3World(assets,ground,foliage,distant,{deferred:true});await workQueue.drain(world.preparationSteps,'ForestStage3World')
    for(const tile of world.tiles)await workQueue.drain(prepareRideSurfaceGeometrySteps(tile.mesh.geometry),'stage3 contact grid')
    return {world,ground,foliage,refs:0}
}
export const prepareForestStage3=(gl,assets)=>prepareResource(gl,'ForestStage3World',()=>createStage3Resources(gl,assets))
export default function ForestStage3({assets}){
  const {gl,scene}=useThree()
  const resources=usePreparedResource(gl,'ForestStage3World',()=>createStage3Resources(gl,assets))
  const actor=useRef(),position=useMemo(()=>new Vector3(),[])
  useFrame(({camera})=>{if(!actor.current?.parent)actor.current=scene.getObjectByName('Scott_original_playback');if(actor.current)actor.current.getWorldPosition(position);resources.world.ensureAround(position.z);resources.world.update(camera)},.6)
  useLayoutEffect(()=>{
    resources.refs++;stage3World.set(resources.world);const remove=registerRideSurfaces(resources.world),removeColliders=resources.world.register()
    if(import.meta.env.DEV)window.__FOREST_STAGE3_WORLD__=resources.world
    return()=>{remove();removeColliders();stage3World.clear(resources.world);if(import.meta.env.DEV)delete window.__FOREST_STAGE3_WORLD__;resources.refs--;setTimeout(()=>{if(!resources.refs){resources.world.dispose();resources.ground.dispose();resources.foliage.near.dispose();resources.foliage.far.dispose()}},0)}
  },[resources])
  return <primitive object={resources.world} dispose={null}/>
}
