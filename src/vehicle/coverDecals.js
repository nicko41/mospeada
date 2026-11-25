import {SRGBColorSpace,Vector2,Vector3} from 'three'
import {frontGeometryKey} from './frontTransformMath.js'
import {COVER_DECALS} from './coverDecalData.js'

export function patchCoverDecalShader(shader,uniforms){
 Object.assign(shader.uniforms,uniforms)
 shader.vertexShader=`uniform vec3 uCoverDecalCenter;
uniform vec3 uCoverDecalRight;
uniform vec3 uCoverDecalUp;
uniform vec3 uCoverDecalNormal;
uniform vec2 uCoverDecalSize;
varying vec3 vCoverDecalPosition;
varying float vCoverDecalFacing;
`+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
vec3 coverDelta = position - uCoverDecalCenter;
vCoverDecalPosition = vec3(dot(coverDelta,uCoverDecalRight)/uCoverDecalSize.x,dot(coverDelta,uCoverDecalUp)/uCoverDecalSize.y,dot(coverDelta,uCoverDecalNormal));
vCoverDecalFacing = dot(normal,uCoverDecalNormal);
`)
 shader.fragmentShader=`uniform sampler2D uCoverDecal;
uniform float uCoverDecalDepth;
varying vec3 vCoverDecalPosition;
varying float vCoverDecalFacing;
`+shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
vec2 coverUV = vCoverDecalPosition.xy + .5;
if (vCoverDecalFacing > .7 && abs(vCoverDecalPosition.z) < uCoverDecalDepth && all(greaterThanEqual(coverUV,vec2(0.0))) && all(lessThanEqual(coverUV,vec2(1.0)))) {
  vec4 coverInk = texture2D(uCoverDecal,coverUV);
  diffuseColor.rgb = mix(diffuseColor.rgb,coverInk.rgb,coverInk.a);
}
`)
}

// Paint on the existing bottom surfaces. Their local coordinates move with the
// authored cover transforms, so the print cannot float or drift while folding.
export function applyCoverDecals(rig,textures){
 const meshes=new Map(rig.surfaces.map(mesh=>[frontGeometryKey(mesh),mesh]))
 return COVER_DECALS.map((definition,index)=>{
  const mesh=meshes.get(definition.key),texture=textures[index]
  if(!mesh||!texture)throw Error('Falta la cover o su insignia: '+definition.side)
  texture.colorSpace=SRGBColorSpace;texture.needsUpdate=true
  const material=mesh.material,compile=material.onBeforeCompile,key=material.customProgramCacheKey(),uniforms={
   uCoverDecal:{value:texture},uCoverDecalCenter:{value:new Vector3().fromArray(definition.center)},uCoverDecalRight:{value:new Vector3().fromArray(definition.right)},uCoverDecalUp:{value:new Vector3().fromArray(definition.up)},uCoverDecalNormal:{value:new Vector3().fromArray(definition.normal)},uCoverDecalSize:{value:new Vector2().fromArray(definition.size)},uCoverDecalDepth:{value:definition.depth},
  }
  material.onBeforeCompile=(shader,renderer)=>{compile.call(material,shader,renderer);patchCoverDecalShader(shader,uniforms)}
  material.customProgramCacheKey=()=>key+'|cyclone-cover-decals-v1';material.needsUpdate=true
  material.userData.coverDecal={side:definition.side,name:definition.name}
  return{mesh,definition,uniforms}
 })
}
