import test from 'node:test'
import assert from 'node:assert/strict'
import {Vector3} from 'three'
import {advanceArmor,createArmorState} from './armorPhysics.js'
import {updateRiderPresence} from './riderPresence.js'
import {bikeConfig} from './bikeConfig.js'

// Derive screen-right independently from the camera's forward/up basis.
for(const mode of ['ARMOR_HOVER','ARMOR_GROUND','onFoot']){
  test(`${mode}: A/D move to camera-left/right at every heading`,()=>{
    for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2,.73]){
      const forward=new Vector3(Math.sin(yaw),0,Math.cos(yaw))
      const right=forward.clone().cross(new Vector3(0,1,0))
      for(const side of [-1,1]){
        let displacement
        if(mode==='onFoot'){
          const s={riderMode:'onFoot',pedestrian:{x:0,z:0,yaw:0,ground:0,phase:0,feet:{Left:null,Right:null}}}
          updateRiderPresence(s,{walkSide:side,walkYaw:yaw},.1,()=>0,()=>true,bikeConfig)
          displacement=new Vector3(s.pedestrian.x,0,s.pedestrian.z)
        }else{
          const a=createArmorState({x:0,z:0,height:.8,yaw,speed:0});a.mode=mode
          advanceArmor(a,{side,yaw},.1,()=>0)
          displacement=new Vector3(a.x,0,a.z)
        }
        assert.ok(displacement.dot(right)*side>0,'D must go screen-right and A screen-left')
        assert.ok(Math.abs(displacement.dot(forward))<1e-10,'Strafing must not become forward/backward')
      }
    }
  })
}
