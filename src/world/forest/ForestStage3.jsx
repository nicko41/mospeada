import {useMemo,useLayoutEffect,useRef} from 'react'
import {useFrame,useThree} from '@react-three/fiber'
import {useTexture} from '@react-three/drei'
import {Vector3,SRGBColorSpace,LinearFilter,LinearMipmapLinearFilter} from 'three'
import grassUrl from '../../../assets/texturas/pasto/grass-01.jpg'
import dirtUrl from '../../../assets/texturas/pasto/dirt01.jpg'
import {createForestGroundMaterial} from './forestGroundMaterial.js'
import {stage3PathGLSL} from './forestStage3Config.js'
import {ForestStage3World,stage3World} from './forestStage3World.js'
import {FOLIAGE_CATALOG} from './foliageCatalog.js'
import {worldFoliageMaterial} from './forestFoliageWorldRendering.js'
import {getForestImpostor} from './forestImpostors.js'
import {registerRideSurfaces} from '../../vehicle/rideSurface.js'

export default function ForestStage3({assets}){
  const {gl,scene}=useThree(),[grass,dirt,atlas]=useTexture([grassUrl,dirtUrl,FOLIAGE_CATALOG.atlas.url])
  const resources=useMemo(()=>{
    atlas.colorSpace=SRGBColorSpace;atlas.minFilter=LinearMipmapLinearFilter;atlas.magFilter=LinearFilter;atlas.generateMipmaps=true;atlas.anisotropy=Math.min(4,gl.capabilities.getMaxAnisotropy());atlas.needsUpdate=true
    const ground=createForestGroundMaterial(grass,dirt,gl.capabilities.getMaxAnisotropy()),compile=ground.onBeforeCompile
    ground.name='Forest Plano 3 / approved illustrated ground'
    ground.onBeforeCompile=(shader,renderer)=>{compile(shader,renderer);shader.fragmentShader=stage3PathGLSL+'\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('float earthMask=forestPathEarth(ground);','float earthMask=stage3Earth(ground);').replace('float forestGroundShade=texture2D(uForestGroundShade,vForestGround/800.0+.5).r;','float forestGroundShade=1.0;')}
    ground.customProgramCacheKey=()=> 'forest-stage3-original-images-v1'
    const density={value:1},foliage={density,near:worldFoliageMaterial(atlas,'near',density),far:worldFoliageMaterial(atlas,'far',density)},distant=new Map(assets.filter(a=>a.kind==='tree').map(a=>[a.name,getForestImpostor(gl,a)]))
    return {world:new ForestStage3World(assets,ground,foliage,distant),ground,foliage,refs:0}
  },[assets,grass,dirt,atlas,gl])
  const actor=useRef(),position=useMemo(()=>new Vector3(),[])
  useFrame(({camera})=>{if(!actor.current?.parent)actor.current=scene.getObjectByName('Scott_original_playback');if(actor.current)actor.current.getWorldPosition(position);resources.world.ensureAround(position.z);resources.world.update(camera)},.6)
  useLayoutEffect(()=>{
    resources.refs++;stage3World.set(resources.world);const remove=registerRideSurfaces(resources.world),removeColliders=resources.world.register()
    if(import.meta.env.DEV)window.__FOREST_STAGE3_WORLD__=resources.world
    return()=>{remove();removeColliders();stage3World.clear(resources.world);if(import.meta.env.DEV)delete window.__FOREST_STAGE3_WORLD__;resources.refs--;setTimeout(()=>{if(!resources.refs){resources.world.dispose();resources.ground.dispose();resources.foliage.near.dispose();resources.foliage.far.dispose()}},0)}
  },[resources])
  return <primitive object={resources.world} dispose={null}/>
}
