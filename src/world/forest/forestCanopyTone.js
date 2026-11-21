// Leaf-only grading in linear space. Alpha and geometry are never modified.
// A shared strength permits an exact developer baseline without new materials.
const baseline=import.meta.env?.DEV&&typeof location!=='undefined'&&new URLSearchParams(location.search).get('canopyTone')==='original'
export const canopyToneUniforms={uCanopyTone:{value:baseline?0:1}}
export function patchCanopyTone(shader){
 shader.uniforms.uCanopyTone=canopyToneUniforms.uCanopyTone
 shader.fragmentShader='uniform float uCanopyTone;\n'+shader.fragmentShader
 shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
  float canopyLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
  float canopyLight=smoothstep(.06,.5,canopyLuma);
  vec3 canopyGain=mix(vec3(.055,.080,.18),vec3(.105,.14,.26),canopyLight);
  vec3 canopyNeutral=mix(diffuseColor.rgb,vec3(canopyLuma),.16);
  // Deep moss, with a small cool fill to retain the painted interior detail.
  vec3 canopyPaint=canopyNeutral*canopyGain+vec3(.004,.008,.006)*(1.0-canopyLight);
  diffuseColor.rgb=mix(diffuseColor.rgb,canopyPaint,clamp(uCanopyTone,0.0,1.0));
  #include <color_fragment>`)
}
export function canopyInstanceTint(color,p){
 const n=Math.sin(p.x*4.17+p.z*9.31+(p.yaw||0))*43758.5453,t=n-Math.floor(n)
 return color.setRGB(.98+t*.04,.99+t*.02,1.025-t*.05)
}
