import test from 'node:test'
import assert from 'node:assert/strict'
import {DirectionalLight,Vector3} from 'three'
import {followCharacterShadow} from './characterShadow.js'
test('sun shadow follows distant Armor positions and contains the jumping character and its true ground projection',()=>{
  const light=new DirectionalLight();light.shadow.mapSize.set(2048,2048)
  for(const [x,y,z,ground]of[[0,0,0,0],[110,13,-250,1],[-80,27,95,2]]){
    const p=new Vector3(x,y,z);followCharacterShadow(light,p,ground);light.shadow.updateMatrices(light)
    for(const point of[p.clone().add(new Vector3(0,2,0)),p.clone(),p.clone().addScaledVector(new Vector3(25,-35,-20),(y-ground)/35)]){
      const ndc=point.clone().project(light.shadow.camera)
      assert.ok(Math.abs(ndc.x)<1&&Math.abs(ndc.y)<1&&Math.abs(ndc.z)<1,'Keep caster and receiver inside the focused shadow camera')
    }
    assert.ok(light.position.clone().sub(light.target.position).distanceTo(new Vector3(-25,35,20))<1e-8)
  }
})
