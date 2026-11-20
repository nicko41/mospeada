import {Vector3} from 'three'
const offset=new Vector3(-25,35,20),right=new Vector3(0,1,0).cross(offset).normalize(),up=offset.clone().normalize().cross(right).normalize()
const target=new Vector3()

// One real sun shadow, focused on the character and its ground projection.
// Stabilize its light-space texels rather than sweeping a world-sized map.
export function followCharacterShadow(light,position,ground=0){
  const height=Math.max(0,position.y-ground),extent=12+Math.ceil(height/2)*.75,camera=light.shadow.camera
  if(camera.right!==extent){camera.left=camera.bottom=-extent;camera.right=camera.top=extent;camera.near=.5;camera.far=130;camera.updateProjectionMatrix()}
  target.set(position.x,ground+height*.5+.8,position.z)
  const texel=extent*2/light.shadow.mapSize.x
  const x=target.dot(right),y=target.dot(up)
  target.addScaledVector(right,Math.round(x/texel)*texel-x).addScaledVector(up,Math.round(y/texel)*texel-y)
  light.target.position.copy(target);light.position.copy(target).add(offset)
  light.target.updateMatrixWorld();light.updateMatrixWorld()
}
