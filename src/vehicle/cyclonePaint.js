import { Color } from 'three'

// Mid-tone sampled from the original boot texture (foot/toe skin regions).
// Tint private material instances; original vertex colours/GLBs stay intact.
export const SCOTT_BOOT_PAINT = '#92a6a0'
const target=new Color(SCOTT_BOOT_PAINT),bodyPaint=new Color('#80beb0'),bodyHighlight=new Color('#8dc8bb'),cuffPaint=new Color('#9fc3b9')
const tintFrom=c=>new Color().setRGB(target.r/c.r,target.g/c.g,target.b/c.b)
const bodyTint=tintFrom(bodyPaint),cuffTint=tintFrom(cuffPaint)
const near=(r,g,b,c)=>Math.abs(r-c.r)+Math.abs(g-c.g)+Math.abs(b-c.b)<.0001

function tintPaint(mesh,material,tint){
  if(!mesh.geometry.attributes.color){material.color.multiply(tint);return}
  const compile=material.onBeforeCompile,key=material.customProgramCacheKey()
  material.onBeforeCompile=(shader,renderer)=>{
    compile.call(material,shader,renderer)
    shader.uniforms.uCyclonePaintTint={value:tint}
    shader.fragmentShader='uniform vec3 uCyclonePaintTint;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      #if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)
        // Authored mint pigment only: white stripes, lettering and neutral
        // metal retain their original colour even within the same mesh.
        float cycloneMint=step(max(0.015,vColor.g*0.12),vColor.g-vColor.r)*step(vColor.r*1.02+0.001,vColor.b);
        diffuseColor.rgb*=mix(vec3(1.0),uCyclonePaintTint,cycloneMint);
      #endif`)
  }
  material.customProgramCacheKey=()=>key+'|cyclone-boot-paint-v2'
}

export function matchCyclonePaintToBoots(mesh,material){
  if(material.name!=='Painted Metal')return
  if(/^Arm_Guard_/.test(mesh.userData.sourcePiece||'')){
    tintPaint(mesh,material,cuffTint)
    material.userData.cyclonePaintTone='scott-boots'
    return
  }
  const c=material.color,a=mesh.geometry.attributes.color
  let selected=near(c.r,c.g,c.b,bodyPaint)||near(c.r,c.g,c.b,bodyHighlight)
  if(!selected&&a)for(let i=0;i<a.count;i++){
    if(near(a.getX(i),a.getY(i),a.getZ(i),bodyPaint)||near(a.getX(i),a.getY(i),a.getZ(i),bodyHighlight)){selected=true;break}
  }
  if(selected){
    // Multiplication preserves the panel's baked relief, dark seams and
    // lighter edge accents, including pieces split for transformation.
    tintPaint(mesh,material,bodyTint)
    material.userData.cyclonePaintTone='scott-boots'
  }
}
