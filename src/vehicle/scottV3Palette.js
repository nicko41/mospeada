import {Color,Vector3,Vector4} from 'three'
import {SCOTT_BOOT_PAINT} from './cyclonePaint.js'

const bytes=color=>color.clone().convertLinearToSRGB().toArray().map(v=>Math.round(v*255))
const cyclonePaint=new Color(SCOTT_BOOT_PAINT),bodyPaint=new Color('#80beb0')
// Same base paint and lighter panel accent as the existing Cyclone shader.
const cycloneHighlight=new Color('#8dc8bb').multiply(new Color().setRGB(cyclonePaint.r/bodyPaint.r,cyclonePaint.g/bodyPaint.g,cyclonePaint.b/bodyPaint.b))
// V3's textured paint renders darker than Cyclone's panel pigment in the live
// cel pass. Compensate only painted lower-leg pixels, retaining texture relief,
// native PBR maps, the normal day/night lighting and protected dark joints.
export const SCOTT_V3_LOWER_LEG_PAINT_GAIN=2

// Area-weighted albedo samples from the V1/V3 assets, in sRGB bytes.
// Chest whites use the physical chest region rather than V1's sparse spine
// weights. Lower legs use Cyclone paint; thighs retain their previous palette.
// Original texture detail and every PBR map remain in use.
export const scottV3Palette={
 chest:{source:{green:[151,174,155],white:[214,214,219]},target:{green:[175,182,164],white:[196,196,193]}},
 shoulders:{source:{green:[156,179,161],white:[217,217,221]},target:{green:[173,180,163],white:[190,192,180]}},
 legs:{source:{green:[156,179,161],white:[224,220,227]},target:{green:bytes(cyclonePaint),white:bytes(cycloneHighlight)}},
 thighs:{source:{green:[156,179,161],white:[224,220,227]},target:{green:[169,194,186],white:[236,236,235]}},
}
export const scottV3PaletteRegion=name=>/Spine/.test(name)?1:/(Left|Right)(Shoulder|Arm)$/.test(name)?2:/UpLeg/.test(name)?4:/(Leg|Foot|Toe)/.test(name)?3:0
export const paletteLinear=x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)}
export const scottV3PaletteMask=(indices,weights,roles)=>{
 const mask=[0,0,0,0];for(let k=0;k<4;k++){const role=roles[indices[k]];if(role)mask[role-1]+=weights[k]}
 return mask
}
const ratios=Object.values(scottV3Palette).map(p=>Object.fromEntries(['green','white'].map(c=>[c,p.target[c].map((v,i)=>paletteLinear(v/255)/paletteLinear(p.source[c][i]/255))])))
export function scottV3PaletteColor(rgb,mask){
 const c=rgb.map(v=>v/255),lo=Math.min(...c),hi=Math.max(...c)
 const green=smooth(1/255,7/255,c[1]-c[0])*smooth(-10/255,-4/255,c[1]-c[2])*smooth(60/255,75/255,c[1])*(1-smooth(.35,.39,hi-lo))
 const white=(1-green)*smooth(135/255,145/255,lo)*(1-smooth(.12,.14,hi-lo))
 const weights=mask.map(v=>smooth(.55,.80,v)),sum=weights.reduce((a,b)=>a+b,0),normal=Math.max(1,sum)
 const lift=1+(weights[2]||0)/normal*(green+white)*(SCOTT_V3_LOWER_LEG_PAINT_GAIN-1)
 return c.map((v,k)=>Math.min(1,paletteLinear(v)*(1+weights.reduce((n,w,i)=>n+w/normal*(green*(ratios[i].green[k]-1)+white*(ratios[i].white[k]-1)),0))*lift))
}
export function patchScottV3PaletteShader(shader,count){
 shader.vertexShader=`uniform vec4 uV3PaletteRegions[${count}];
varying vec4 vV3PaletteRegion;
`+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
vV3PaletteRegion = uV3PaletteRegions[int(skinIndex.x)] * skinWeight.x + uV3PaletteRegions[int(skinIndex.y)] * skinWeight.y + uV3PaletteRegions[int(skinIndex.z)] * skinWeight.z + uV3PaletteRegions[int(skinIndex.w)] * skinWeight.w;
`)
 shader.fragmentShader=`varying vec4 vV3PaletteRegion;
uniform vec3 uV3PaletteGreen[4];
uniform vec3 uV3PaletteWhite[4];
uniform float uV3LowerLegPaintGain;
`+shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
// Recolour albedo before the existing soil and anime/cel lighting passes.
vec3 v3Linear = max(diffuseColor.rgb, vec3(0.0));
vec3 v3SRGB = mix(v3Linear * 12.92, 1.055 * pow(v3Linear, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), v3Linear));
float v3Low = min(v3SRGB.r, min(v3SRGB.g, v3SRGB.b));
float v3High = max(v3SRGB.r, max(v3SRGB.g, v3SRGB.b));
float v3Green = smoothstep(1.0 / 255.0, 7.0 / 255.0, v3SRGB.g - v3SRGB.r) * smoothstep(-10.0 / 255.0, -4.0 / 255.0, v3SRGB.g - v3SRGB.b) * smoothstep(60.0 / 255.0, 75.0 / 255.0, v3SRGB.g) * (1.0 - smoothstep(0.35, 0.39, v3High - v3Low));
float v3White = (1.0 - v3Green) * smoothstep(135.0 / 255.0, 145.0 / 255.0, v3Low) * (1.0 - smoothstep(0.12, 0.14, v3High - v3Low));
vec4 v3Region = smoothstep(vec4(0.55), vec4(0.80), vV3PaletteRegion);
v3Region /= max(1.0, v3Region.x + v3Region.y + v3Region.z + v3Region.w);
vec3 v3Ratio = vec3(1.0);
for (int i = 0; i < 4; i++) v3Ratio += v3Region[i] * (v3Green * (uV3PaletteGreen[i] - vec3(1.0)) + v3White * (uV3PaletteWhite[i] - vec3(1.0)));
float v3PaintLift = 1.0 + v3Region.z * (v3Green + v3White) * (uV3LowerLegPaintGain - 1.0);
diffuseColor.rgb = min(diffuseColor.rgb * v3Ratio * v3PaintLift, vec3(1.0));
`)
}
export function installScottV3Palette(material,bones){
 const compile=material.onBeforeCompile,key=material.customProgramCacheKey(),uniforms={
  uV3PaletteRegions:{value:bones.map(b=>{const mask=[0,0,0,0],role=scottV3PaletteRegion(b.name);if(role)mask[role-1]=1;return new Vector4(...mask)})},
  uV3PaletteGreen:{value:ratios.map(r=>new Vector3(...r.green))},uV3PaletteWhite:{value:ratios.map(r=>new Vector3(...r.white))},
  uV3LowerLegPaintGain:{value:SCOTT_V3_LOWER_LEG_PAINT_GAIN},
 }
 material.onBeforeCompile=(shader,renderer)=>{compile.call(material,shader,renderer);Object.assign(shader.uniforms,uniforms);patchScottV3PaletteShader(shader,bones.length)}
 material.customProgramCacheKey=()=>key+'|scott-v3-v1-chest-thighs-cyclone-lower-legs-palette-v4-'+bones.length
 material.userData.scottV3Palette='v1-chest-thighs-cyclone-lower-legs'
}
