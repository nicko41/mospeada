import {useLayoutEffect,useMemo} from 'react'
import {useFrame,useLoader} from '@react-three/fiber'
import {useGLTF} from '@react-three/drei'
import {FileLoader} from 'three'
import {createRandCyclone,RAND_CYCLONE_URL} from '../../vehicle/createRandCyclone.js'
import {RandRider,RAND_RIDER_URL} from '../../vehicle/RandRider.js'
import {bikeConfig} from '../../vehicle/bikeConfig.js'
import {sampleRideHeight} from '../../vehicle/rideSurface.js'
import {RandDesertEscape} from './RandDesertEscape.js'
import {stage4World} from './forestStage4Config.js'
import {CycloneSoilLayer} from '../../vehicle/CycloneSoilLayer.js'
import {WheelContacts} from '../../vehicle/WheelContacts.js'
import {createSoilLoad,evolveSoil} from '../../vehicle/weatheringModel.js'
import {weatheringState} from '../../vehicle/weatheringState.js'
import {weatherState} from '../weatherState.js'
import {vfxState} from '../../vfx/vfxState.js'
import {playerCombat} from '../../player/playerCombat.js'

const SCOTT_URL='/models/mospeada/scott-bernard-animated-original.glb',ACTIONS_URL='/animations/scott-cyclone-actions.json'
useGLTF.preload(RAND_CYCLONE_URL);useGLTF.preload(RAND_RIDER_URL)
export default function ForestRandEscape({runtime}){
  const bike=useGLTF(RAND_CYCLONE_URL),rand=useGLTF(RAND_RIDER_URL),scott=useGLTF(SCOTT_URL),actions=useLoader(FileLoader,ACTIONS_URL)
  const resources=useMemo(()=>{
    const rig=createRandCyclone(bike.scene),escape=new RandDesertEscape(sampleRideHeight,rig.metrics)
    const config=weatheringState.snapshot(),weathering={rig,escape,layer:new CycloneSoilLayer(rig),contacts:new WheelContacts(rig,sampleRideHeight),load:createSoilLoad(),accumulationTime:0,cleanRequest:config.cleanRequest,soilRequest:config.soilRequest}
    // Select bike surfaces before the rider/hand meshes join the chassis.
    const rider=new RandRider(rand.scene,scott.scene,JSON.parse(actions),rig)
    rig.root.visible=false;return {rig,rider,escape,weathering,refs:0,actorState:null}
  },[bike.scene,rand.scene,scott.scene,actions])
  useLayoutEffect(()=>{
    resources.refs++;runtime.randEscape=resources.escape
    resources.weathering.layer.install();runtime.randWeathering=resources.weathering
    if(import.meta.env.DEV)window.__RAND_ESCAPE__=resources
    return()=>{resources.weathering.layer.dispose();if(runtime.randWeathering===resources.weathering)delete runtime.randWeathering;if(runtime.randEscape===resources.escape)delete runtime.randEscape;if(import.meta.env.DEV)delete window.__RAND_ESCAPE__;resources.refs--;setTimeout(()=>{if(!resources.refs){resources.rider.dispose();resources.rig.dispose()}},0)}
  },[resources,runtime])
  useFrame((_,delta)=>{
    const s=runtime.state;if(!s)return
    if(resources.actorState!==s){resources.actorState=s;resources.escape.reset();Object.assign(resources.weathering.load,createSoilLoad());resources.weathering.accumulationTime=0}
    const dt=runtime.paused||playerCombat.dead?0:Math.min(delta,.1),{escape,rig,rider,weathering}=resources,config=weatheringState.snapshot()
    if(config.cleanRequest!==weathering.cleanRequest){weathering.cleanRequest=config.cleanRequest;Object.assign(weathering.load,createSoilLoad())}
    if(config.soilRequest!==weathering.soilRequest){weathering.soilRequest=config.soilRequest;Object.assign(weathering.load,{frontMud:config.maximum,rearMud:config.maximum,frontFilm:config.maximum*.7,rearFilm:config.maximum*.7})}
    weathering.layer.update(weathering.load,config)
    if(runtime.climaxSequence?.phase==='resume'){rig.root.visible=false;return}
    escape.update(dt,s,stage4World.get(),!!runtime.desertPatrol?.active||!!runtime.climaxSequence?.active);rig.root.visible=escape.active
    if(!escape.active)return
    rig.update(escape.state,sampleRideHeight,bikeConfig);rider.update(escape.state,dt,bikeConfig,sampleRideHeight)
    const wheels=weathering.contacts.update(escape.state)
    weathering.accumulationTime+=dt
    if(weathering.accumulationTime>=.1){
      evolveSoil(weathering.load,wheels,escape.state,config,weatherState.rainIntensity,weathering.accumulationTime,rig.metrics,vfxState.snapshot().humidity)
      weathering.accumulationTime=0;weathering.layer.update(weathering.load,config)
    }
  },-.7)
  return <primitive object={resources.rig.root} dispose={null}/>
}
