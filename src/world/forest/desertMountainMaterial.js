import {Vector3} from 'three'
import {stage4DesertSurfaceMaterial} from './forestStage4Materials.js'

// Same painted earth/sand recipe and scale as the approved floor, projected
// onto the rock faces without rotating or mirroring individual cells.
export function desertMountainMaterial(texture,origin=new Vector3(),settings={},sand=texture){
  const material=stage4DesertSurfaceMaterial(texture,sand,origin,settings)
  material.name='Desert mountains / continuous floor paint';material.flatShading=true;material.vertexColors=false;material.color.set('#ded8ca')
  material.userData.mountainTexture={uniforms:material.userData.desertBlend.uniforms}
  return material
}
