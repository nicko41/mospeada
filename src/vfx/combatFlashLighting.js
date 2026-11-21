import {Vector3,Vector4} from 'three'

// Two uniform slots, not Three scene lights: hits never change NUM_POINT_LIGHTS
// or invalidate the world's day/night programs. Only lit Anime materials read
// this inexpensive, short-range additive illumination.
let owner=null
const point=new Vector3()
export const combatFlashUniforms={
  uCombatFlashPositionRange:{value:[new Vector4(),new Vector4()]},
  uCombatFlashColorPower:{value:[new Vector4(),new Vector4()]},
}
export function setCombatFlashLights(lights){owner=lights}
export function releaseCombatFlashLights(lights){if(owner===lights)owner=null}
export function syncCombatFlashLighting(camera){
  for(let i=0;i<2;i++){
    const light=owner?.[i],position=combatFlashUniforms.uCombatFlashPositionRange.value[i],color=combatFlashUniforms.uCombatFlashColorPower.value[i]
    if(!light||light.intensity<=0){color.set(0,0,0,0);continue}
    point.copy(light.position).applyMatrix4(camera.matrixWorldInverse)
    position.set(point.x,point.y,point.z,Math.max(.01,light.distance))
    color.set(light.color.r,light.color.g,light.color.b,light.intensity)
  }
}
export function patchCombatFlashLighting(shader){
  if(!shader.includes('#include <lights_fragment_end>'))return shader
  return 'uniform vec4 uCombatFlashPositionRange[2],uCombatFlashColorPower[2];\n'+shader.replace('#include <opaque_fragment>',`
    for(int flashIndex=0;flashIndex<2;flashIndex++){
      float flashPower=uCombatFlashColorPower[flashIndex].a;
      if(flashPower>.001){
        vec3 flashDelta=uCombatFlashPositionRange[flashIndex].xyz+vViewPosition;
        float flashDistance=length(flashDelta);
        float flashFade=max(0.0,1.0-flashDistance/uCombatFlashPositionRange[flashIndex].w);
        float flashFacing=.35+.65*max(0.0,dot(normal,flashDelta/max(.001,flashDistance)));
        outgoingLight+=diffuseColor.rgb*uCombatFlashColorPower[flashIndex].rgb*(flashPower*.12*flashFade*flashFade*flashFacing);
      }
    }
    #include <opaque_fragment>`)
}
