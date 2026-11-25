import fs from 'node:fs'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {Group,Mesh,MeshLambertMaterial} from 'three'
import {createDrivingCyclone} from '../src/vehicle/createDrivingCyclone.js'
import {advanceBike,createBikeState} from '../src/vehicle/bikePhysics.js'
import {bikeConfig} from '../src/vehicle/bikeConfig.js'
import {registerRideSurfaces,sampleRideHeight} from '../src/vehicle/rideSurface.js'
import {createStage2Terrain} from '../src/world/forest/forestStage2Terrain.js'
import {stage2PathX,FOREST_STAGE2 as S,stage2EarthWeight,stage2Void} from '../src/world/forest/forestStage2Config.js'

export async function stage2PhysicsFixture(){
  globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
  const b=fs.readFileSync('public/models/mospeada/cyclone-vr052f.glb'),g=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')
  const rig=createDrivingCyclone(g.scene),scene=new Group(),terrain=createStage2Terrain(),material=new MeshLambertMaterial()
  for(const geometry of terrain.tops){const mesh=new Mesh(geometry,material);mesh.userData={rideSurface:true,rideSurfaceType:'dirt',rideSurfaceBiome:'forest',rideSurfaceEarthWeight:stage2EarthWeight};scene.add(mesh)}
  const wall=new Mesh(terrain.cliffs,material);wall.userData.rideBarrier=true;scene.add(wall)
  const remove=registerRideSurfaces(scene)
  return {rig,scene,terrain,sample:sampleRideHeight,dispose(){remove();terrain.tops.forEach(g=>g.dispose());terrain.cliffs.dispose();terrain.bed.dispose();material.dispose()}}
}
export function simulateStage2(f,{startZ=-655,speed=0,airDelay=null,groundPulseZ=null,idealGroundLimit=false,first=false,spam=false,fps=120}={}){
  const {rig,sample}=f,s=createBikeState({x:stage2PathX(startZ),z:startZ,yaw:Math.PI},rig.metrics,sample),config={...bikeConfig,airBoostEnabled:true},rows=[]
  s.speed=speed;let launch=null,land=null,airPressed=false,groundPressed=false,landingRange=0,peakY=s.height,flightStart=0,flightEnd=0
  for(let i=0;i<fps*20;i++){
    let boost=false
    if(groundPulseZ!==null&&!groundPressed&&!s.airborne&&s.z<=groundPulseZ){boost=true;groundPressed=true}
    if(airDelay!==null&&s.airborne&&s.airTime>=airDelay&&(!airPressed||spam&&i%12===0)){boost=true;airPressed=true}
    if(idealGroundLimit&&!s.airborne)s.speed=bikeConfig.boostMaxSpeed
    const canMove=(x,z,yaw)=>{const y=sample(x,z);if(!Number.isFinite(y)&&!stage2Void(x,z))return false;if(Number.isFinite(y)&&s.airborne&&(s.frontOverVoid||s.rearOverVoid)&&s.height<y-.25)return false;return true}
    advanceBike(s,{throttle:1,boost},1/fps,rig.metrics,sample,canMove,config)
    if(![s.x,s.z,s.height,s.pitch,s.bank,s.verticalVelocity].every(Number.isFinite))throw Error('Non-finite flight state')
    peakY=Math.max(peakY,s.height)
    if(s.airborne&&!launch){launch={z:s.z,speed:s.speed,vy:s.verticalVelocity,y:s.height};flightStart=i/fps}
    if(launch&&s.verticalVelocity<0&&s.height>=S.canyon.landingHeight)landingRange=Math.max(landingRange,Math.max(0,S.canyon.lipZ-s.z))
    if(launch&&s.frontGrounded&&s.rearGrounded){land={z:s.z,speed:s.speed,y:s.height,impact:s.landingImpact};flightEnd=i/fps}
    if(i%4===0)rows.push({t:i/fps,z:s.z,y:s.height,speed:s.speed,vy:s.verticalVelocity,air:s.airborne,boost:s.boostTime,front:s.frontGrounded,rear:s.rearGrounded})
    if(land){for(let n=0;n<fps;n++)advanceBike(s,{throttle:1},1/fps,rig.metrics,sample,canMove,config);break}
    if(s.height<S.fallY)break
  }
  return {launch,land,landed:!!land,flightSeconds:flightEnd-flightStart,peakY,landingRange,airBoostCount:s.airBoostCount,final:{x:s.x,z:s.z,y:s.height,speed:s.speed,vy:s.verticalVelocity,front:s.frontGrounded,rear:s.rearGrounded,airBoostUsed:s.airBoostUsed},rows}
}
