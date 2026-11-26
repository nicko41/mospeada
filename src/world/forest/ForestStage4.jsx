import {useMemo,useLayoutEffect,useRef} from 'react'
import {useFrame,useThree} from '@react-three/fiber'
import {useTexture} from '@react-three/drei'
import {Color,Vector3,SRGBColorSpace,LinearFilter,LinearMipmapLinearFilter,MirroredRepeatWrapping} from 'three'
import grassUrl from '../../../assets/texturas/pasto/grass-01.jpg'
import dirtUrl from '../../../assets/texturas/pasto/dirt01.jpg'
import desertSandUrl from '../../../assets/texturas/desierto-floor2.png'
import {stage4GroundMaterial,stage4RockMaterial,stage4DesertMaterial,stage4CliffMaterial} from './forestStage4Materials.js'
import {worldFoliageMaterial} from './forestFoliageWorldRendering.js'
import {FOLIAGE_CATALOG} from './foliageCatalog.js'
import {getForestImpostor} from './forestImpostors.js'
import {ForestStage4World} from './forestStage4World.js'
import {stage4World,smooth4} from './forestStage4Config.js'
import {timeOfDayState} from '../TimeOfDay.jsx'
import OvercastSky from '../OvercastSky.jsx'
import {DesertClimaxAtmosphere} from './DesertClimaxAtmosphere.js'
import DesertHorizonCarrier from './DesertHorizonCarrier.jsx'

const desertUrl='/textures/desert/desierto-floor.png'
useTexture.preload(desertUrl)
useTexture.preload(desertSandUrl)
export default function ForestStage4({assets}){
  const {gl,camera,scene}=useThree(),[grass,dirt,desertTexture,desertSand,atlas]=useTexture([grassUrl,dirtUrl,desertUrl,desertSandUrl,FOLIAGE_CATALOG.atlas.url])
  const resources=useMemo(()=>{
    const anisotropy=gl.capabilities.getMaxAnisotropy(),origin=new Vector3(),density={value:1}
    for(const t of [atlas,desertTexture,desertSand]){t.colorSpace=SRGBColorSpace;t.minFilter=LinearMipmapLinearFilter;t.magFilter=LinearFilter;t.generateMipmaps=true;t.anisotropy=Math.min(t===atlas?4:8,anisotropy);t.needsUpdate=true}
    for(const t of [desertTexture,desertSand])t.wrapS=t.wrapT=MirroredRepeatWrapping
    const ground=stage4GroundMaterial(grass,dirt,anisotropy,origin),desert=stage4DesertMaterial(desertTexture,desertSand,{},origin),cliff=stage4CliffMaterial(desertTexture),foliage={density,near:worldFoliageMaterial(atlas,'near',density),far:worldFoliageMaterial(atlas,'far',density)},rocks=new Map()
    for(const a of assets.filter(a=>a.kind==='rock'))for(const p of a.parts)rocks.set(a.name+p.material.uuid,stage4RockMaterial(p.material))
    const distant=new Map(assets.filter(a=>a.kind==='tree').map(a=>[a.name,getForestImpostor(gl,a)])),materials={origin,ground,desert,cliff,foliage,rocks}
    return {world:new ForestStage4World(assets,materials,distant),materials,skyCoverage:{value:0},haze:new DesertClimaxAtmosphere(),refs:0}
  },[assets,grass,dirt,desertTexture,desertSand,atlas,gl])
  const actor=useRef(),point=useMemo(()=>new Vector3(),[]),atmosphere=useMemo(()=>({sky:new Color('#9bcfec'),fog:new Color('#d6b9a0'),sun:new Color('#fff0d0'),coldSun:new Color('#dce9dc')}),[])
  // Restore before ForestAtmosphere writes its baseline. Only the final
  // desert overrides that baseline later in this frame, including on retries.
  useFrame(()=>resources.haze.restore(scene),-.9)
  useFrame(()=>{
    if(!actor.current?.parent)actor.current=scene.getObjectByName('Scott_original_playback')
    if(actor.current)actor.current.getWorldPosition(point)
    const world=resources.world;world.update(camera)
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
    return()=>{resources.haze.restore(scene);remove();stage4World.clear(resources.world);camera.far=700;camera.updateProjectionMatrix();if(import.meta.env.DEV)delete window.__FOREST_STAGE4__;resources.refs--;setTimeout(()=>{if(!resources.refs){resources.world.dispose();const m=resources.materials;[m.ground,m.desert,m.cliff,m.foliage.near,m.foliage.far,...m.rocks.values()].forEach(m=>m.dispose())}},0)}
  },[resources,camera])
  return <><primitive object={resources.world} dispose={null}/><DesertHorizonCarrier world={resources.world}/><OvercastSky clearSky coverage={resources.skyCoverage} haze={resources.haze.horizon} priority={.8}/></>
}
