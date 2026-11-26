import {usePreparedResource,prepareResource} from '../../loading/preparedResources.js'
import {workQueue} from '../../loading/workQueue.js'
import {prepareStage4Terrain} from '../../loading/terrainPreparation.js'
import {DeferredStage} from '../../loading/DeferredStage.jsx'
import {stageStreaming} from '../../loading/stageStreaming.js'
import {loadTexture,deferredTexture,configureTexture} from '../../loading/resources.js'
import {useMemo,useLayoutEffect,useRef} from 'react'
import {useFrame,useThree} from '@react-three/fiber'

import {Color,Vector3,SRGBColorSpace,LinearFilter,LinearMipmapLinearFilter,MirroredRepeatWrapping,RepeatWrapping} from 'three'
import grassUrl from '../../../assets/texturas/pasto/grass-01.jpg'
import dirtUrl from '../../../assets/texturas/pasto/dirt01.jpg'
import desertSandUrl from '../../../assets/texturas/desierto-floor2.png'
import {stage4GroundMaterial,stage4RockMaterial,stage4DesertMaterial,stage4DesertSurfaceMaterial,stage4CliffMaterial} from './forestStage4Materials.js'
import {worldFoliageMaterial} from './forestFoliageWorldRendering.js'
import {FOLIAGE_CATALOG} from './foliageCatalog.js'
import {getForestImpostor} from './forestImpostors.js'
import {ForestStage4World} from './forestStage4World.js'
import {stage4World,smooth4} from './forestStage4Config.js'
import {timeOfDayState} from '../TimeOfDay.jsx'
import OvercastSky from '../OvercastSky.jsx'
import {DesertClimaxAtmosphere} from './DesertClimaxAtmosphere.js'
import {desertMountainMaterial} from './desertMountainMaterial.js'
import DesertHorizonCarrier from './DesertHorizonCarrier.jsx'

const desertUrl='/textures/desert/desierto-floor.png'
async function createStage4Resources(gl,assets){
    const [grass,dirt,atlas]=await Promise.all([grassUrl,dirtUrl,FOLIAGE_CATALOG.atlas.url].map(loadTexture)),desertTexture=deferredTexture(desertUrl),desertSand=deferredTexture(desertSandUrl)
    const anisotropy=gl.capabilities.getMaxAnisotropy(),origin=new Vector3(),density={value:1}
    for(const t of [atlas,desertTexture,desertSand])configureTexture(t,{colorSpace:SRGBColorSpace,minFilter:LinearMipmapLinearFilter,magFilter:LinearFilter,generateMipmaps:true,anisotropy:Math.min(t===atlas?4:8,anisotropy)})
    for(const t of [desertTexture,desertSand])t.wrapS=t.wrapT=MirroredRepeatWrapping
    // Independent sampler settings: leave the approved floor's cached maps
    // untouched. Both surface materials reuse these two bitmap-backed clones.
    const surfaceTextures=[desertTexture,desertSand].map(source=>{const t=source.clone();t.wrapS=t.wrapT=RepeatWrapping;t.needsUpdate=true;return t})
    const ground=stage4GroundMaterial(grass,dirt,anisotropy,origin),desert=stage4DesertMaterial(desertTexture,desertSand,{},origin),cliff=stage4CliffMaterial(...surfaceTextures,origin),foliage={density,near:worldFoliageMaterial(atlas,'near',density),far:worldFoliageMaterial(atlas,'far',density)},rocks=new Map()
    const terrainSlopes=stage4DesertSurfaceMaterial(...surfaceTextures,origin,{}, {detail:desertTexture,sand:desertSand})
    for(const a of assets.filter(a=>a.kind==='rock'))for(const p of a.parts)rocks.set(a.name+p.material.uuid,stage4RockMaterial(p.material))
    const distant=new Map(assets.filter(a=>a.kind==='tree').map(a=>[a.name,getForestImpostor(gl,a)])),materials={origin,ground,desert,terrainSlopes,cliff,foliage,rocks,surfaceTextures,mountains:desertMountainMaterial(surfaceTextures[0],origin,{},surfaceTextures[1])}
    const terrain=await prepareStage4Terrain(),world=new ForestStage4World(assets,materials,distant,{deferred:true,terrain});world.userData.streamingPrepared=false;await workQueue.drain(world.preparationSteps,'ForestStage4World')
    await stageStreaming.downloaded('stage4')
    // Construction overlaps the next-plane download. Sampler clones adopt the
    // completed original image before any GPU upload or visible mounting.
    for(const [i,source]of [desertTexture,desertSand].entries()){surfaceTextures[i].source=source.source;surfaceTextures[i].needsUpdate=true}
    return {world,materials,skyCoverage:{value:0},haze:new DesertClimaxAtmosphere(),refs:0}
}
export const prepareForestStage4=(gl,assets)=>prepareResource(gl,'ForestStage4World',()=>createStage4Resources(gl,assets))
export default function ForestStage4({assets}){
  const {gl,camera,scene}=useThree()
  const resources=usePreparedResource(gl,'ForestStage4World',()=>createStage4Resources(gl,assets))
  const actor=useRef(),point=useMemo(()=>new Vector3(),[]),atmosphere=useMemo(()=>({sky:new Color('#9bcfec'),fog:new Color('#d6b9a0'),sun:new Color('#fff0d0'),coldSun:new Color('#dce9dc')}),[])
  // Restore before ForestAtmosphere writes its baseline. Only the final
  // desert overrides that baseline later in this frame, including on retries.
  useFrame(()=>resources.haze.restore(scene),-.9)
  useFrame(()=>{
    if(!actor.current?.parent)actor.current=scene.getObjectByName('Scott_original_playback')
    if(actor.current)actor.current.getWorldPosition(point)
    const world=resources.world;world.update(camera)
    if(world.bound)stageStreaming.placed('stage4');else stageStreaming.unplaced('stage4')
    const mix=world.bound?smooth4(430,615,world.distance(point.z)):0,day=timeOfDayState.value
    resources.skyCoverage.value=world.bound?smooth4(545,665,world.distance(point.z)):0
    if(mix>0){scene.background.lerp(atmosphere.sky,mix*.7*day);scene.fog.color.lerp(atmosphere.fog,mix*day);scene.fog.density=scene.fog.density*(1-mix)+.0006*mix}
    resources.haze.update(scene,world,world.distance(point.z),day,atmosphere.sky)
    const sun=scene.getObjectByName('Character_sun_shadow');if(sun)sun.color.copy(atmosphere.coldSun).lerp(atmosphere.sun,mix*day)
    const far=700+3300*mix;if(Math.abs(camera.far-far)>.5){camera.far=far;camera.updateProjectionMatrix()}
  },.7)
  useLayoutEffect(()=>{
    resources.refs++;stage4World.set(resources.world);const remove=resources.world.register()
    if(import.meta.env.DEV)window.__FOREST_STAGE4__=resources
    return()=>{resources.haze.restore(scene);remove();stage4World.clear(resources.world);camera.far=700;camera.updateProjectionMatrix();if(import.meta.env.DEV)delete window.__FOREST_STAGE4__;resources.refs--;setTimeout(()=>{if(!resources.refs){resources.world.dispose();const m=resources.materials;[m.ground,m.desert,m.terrainSlopes,m.mountains,m.cliff,m.foliage.near,m.foliage.far,...m.rocks.values()].forEach(m=>m.dispose());m.surfaceTextures.forEach(t=>t.dispose())}},0)}
  },[resources,camera])
  return <><primitive object={resources.world} dispose={null}/><DeferredStage id="horizon"><DesertHorizonCarrier world={resources.world}/></DeferredStage><OvercastSky clearSky coverage={resources.skyCoverage} haze={resources.haze.horizon} priority={.8}/></>
}
