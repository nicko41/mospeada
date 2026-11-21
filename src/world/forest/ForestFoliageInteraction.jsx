import {useEffect,useMemo,useRef} from 'react'
import {useFrame,useThree} from '@react-three/fiber'
import {LinearFilter,NearestFilter} from 'three'
import {forestInteractionField,FOREST_INTERACTION} from './forestInteraction.js'

export default function ForestFoliageInteraction({runtime}){
  const {gl}=useThree(),field=useMemo(forestInteractionField,[]),lastState=useRef(),sources=useMemo(()=>Array.from({length:5},()=>({active:false,x:0,z:0,y:0,px:0,pz:0,py:0,dirX:0,dirZ:1,speed:0,radius:1,strength:0,fast:false})),[])
  useEffect(()=>{const filter=gl.extensions.has('OES_texture_float_linear')?LinearFilter:NearestFilter;field.texture.minFilter=field.texture.magFilter=filter;field.texture.needsUpdate=true;if(import.meta.env.DEV)window.__FOREST_INTERACTION__={field,config:FOREST_INTERACTION,sources};return()=>{field.clear();if(import.meta.env.DEV)delete window.__FOREST_INTERACTION__}},[field,gl,sources])
  useFrame((_,delta)=>{
    const s=runtime.state;field.area.w=FOREST_INTERACTION.enabled?1:0;if(!s||runtime.paused)return;const dt=Math.min(.1,delta),config=FOREST_INTERACTION,phase=runtime.transformEntry?.phase||'idle',armor=runtime.armorController,a=armor?.active?armor.state:null,p=s.pedestrian,foot=p&&s.dismountBlend>.8
    if(lastState.current!==s){field.clear();sources.forEach(v=>{v.active=false});lastState.current=s}
    const center=foot?p:a||s,cx=center.x,cz=center.z
    const set=(i,x,y,z,radius,strength,active,fast,yaw)=>{const v=sources[i],was=v.active;v.px=v.x;v.pz=v.z;v.py=v.y;v.x=x;v.y=y;v.z=z;v.active=active;v.radius=radius;v.strength=strength;v.fast=fast;if(!was||Math.hypot(v.x-v.px,v.z-v.pz)>16){v.px=x;v.pz=z;v.py=y}const dx=x-v.px,dz=z-v.pz,length=Math.hypot(dx,dz);v.speed=dt>0?length/dt:0;v.dirX=length>.001?dx/length:Math.sin(yaw);v.dirZ=length>.001?dz/length:Math.cos(yaw)}
    const wheels=runtime.weathering?.contacts.wheels,grounded=phase==='idle'&&!a&&!s.airborne&&!!wheels&&(wheels.front.grounded||wheels.rear.grounded),speed=Math.abs(s.speed),gain=Math.min(1,speed/35)
    const y=wheels?(wheels.front.position.y+wheels.rear.position.y)*.5:s.height
    set(0,s.x,y,s.z,config.bikeRadius,.55+(config.bikeStrength-.55)*gain,grounded,speed>3,s.travelYaw??s.yaw)
    for(const [i,side]of ['front','rear'].entries()){const w=wheels?.[side];set(i+1,w?.position.x??s.x,w?.position.y??s.height,w?.position.z??s.z,.9,.5+.9*gain,grounded&&!!w?.grounded,speed>3,s.travelYaw??s.yaw)}
    const run=p?.runBlend||0;set(3,p?.x??s.x,p?.ground??s.height,p?.z??s.z,config.walkRadius+(config.runRadius-config.walkRadius)*run,p?.moving?config.walkStrength+(config.runStrength-config.walkStrength)*run:.3,!!foot&&phase==='idle',run>.35,p?.yaw??s.yaw)
    set(4,a?.x??s.x,a?.ground??s.height,a?.z??s.z,a?.speed>2.5?config.runRadius:config.walkRadius,.3+Math.min(config.runStrength-.3,(a?.speed||0)*.3),!!a&&a.grounded,a?.speed>2.5,a?.yaw??s.yaw)
    field.update(dt,sources,cx,cz)
  },-.3)
  return null
}
