import { DataTexture, LinearFilter, LinearMipmapLinearFilter, MeshLambertMaterial, MirroredRepeatWrapping, RedFormat, RGBAFormat, SRGBColorSpace } from 'three'
import { FOREST } from './forestConfig.js'
import { forestLayout } from './forestLayout.js'
import { FOREST_CRASH } from './forestCrashConfig.js'
import { CRASH_MATERIAL_BOUNDS as CRASH_PATCH,crashSiteSample } from './forestCrashSite.js'
import {forestPathMaskGLSL} from './forestSurface.js'

function crashSurfaceMap(){
  const size=256,values=new Uint8Array(size*size*4),b=CRASH_PATCH
  for(let z=0;z<size;z++)for(let x=0;x<size;x++){const s=crashSiteSample(b.minX+(x+.5)/size*(b.maxX-b.minX),b.minZ+(z+.5)/size*(b.maxZ-b.minZ)),i=(z*size+x)*4;values[i]=Math.round(s.earth*255);values[i+1]=Math.round(s.dark*255);values[i+2]=Math.round(s.damage*255);values[i+3]=255}
  const map=new DataTexture(values,size,size,RGBAFormat);map.minFilter=map.magFilter=LinearFilter;map.needsUpdate=true;return map
}

export const FOREST_GROUND_TILE_METRES=4
export function configureGroundTexture(texture,anisotropy) {
  const changed=texture.colorSpace!==SRGBColorSpace||texture.wrapS!==MirroredRepeatWrapping||texture.wrapT!==MirroredRepeatWrapping||texture.repeat.x!==FOREST.size/FOREST_GROUND_TILE_METRES||texture.repeat.y!==FOREST.size/FOREST_GROUND_TILE_METRES||texture.minFilter!==LinearMipmapLinearFilter||texture.magFilter!==LinearFilter||!texture.generateMipmaps||texture.anisotropy!==Math.min(8,anisotropy)
  texture.colorSpace=SRGBColorSpace
  texture.wrapS=texture.wrapT=MirroredRepeatWrapping
  texture.repeat.set(FOREST.size/FOREST_GROUND_TILE_METRES,FOREST.size/FOREST_GROUND_TILE_METRES)
  texture.minFilter=LinearMipmapLinearFilter;texture.magFilter=LinearFilter
  texture.generateMipmaps=true;texture.anisotropy=Math.min(8,anisotropy)
  if(changed)texture.needsUpdate=true
  return texture
}

function canopyGrounding() {
  const resolution=1024,values=new Uint8Array(resolution*resolution).fill(255)
  for(const placements of Object.values(forestLayout))for(const p of placements){
    if(p.kind!=='tree'&&p.kind!=='rock')continue
    const radius=(p.kind==='tree'?2.5:1.3)*p.scale*resolution/FOREST.size
    const cx=(p.x/FOREST.size+.5)*resolution,cy=(p.z/FOREST.size+.5)*resolution
    for(let y=Math.max(0,Math.floor(cy-radius));y<=Math.min(resolution-1,cy+radius);y++)for(let x=Math.max(0,Math.floor(cx-radius));x<=Math.min(resolution-1,cx+radius);x++){
      const d=Math.hypot(x-cx,y-cy)/radius
      if(d<1)values[y*resolution+x]=Math.min(values[y*resolution+x],Math.round(255*(1-(1-d)**2*.8)))
    }
  }
  const texture=new DataTexture(values,resolution,resolution,RedFormat)
  texture.minFilter=texture.magFilter=LinearFilter;texture.needsUpdate=true
  return texture
}

// Visible colour/detail comes from the two original illustrations. Spatial
// masks only choose grass/dirt; hashes only vary image coordinates, never RGB.
let sharedShade,sharedCrash,maskUsers=0
export function createForestGroundMaterial(grass,dirt,anisotropy=1) {
  configureGroundTexture(grass,anisotropy);configureGroundTexture(dirt,anisotropy)
  const material=new MeshLambertMaterial({map:grass,vertexColors:false})
  material.name='Forest / original illustrated grass and dirt';material.userData.forest=true
  material.userData.forestGround={tileMetres:FOREST_GROUND_TILE_METRES,source:'original grass-01.jpg + dirt01.jpg'}
  const shade=sharedShade ||=canopyGrounding(),crash=sharedCrash ||=crashSurfaceMap();maskUsers++
  material.onBeforeCompile=shader=>{
    shader.uniforms.uForestDirt={value:dirt};shader.uniforms.uForestGroundShade={value:shade};shader.uniforms.uForestCrashSurface={value:crash}
    shader.vertexShader='varying vec2 vForestGround;\n'+shader.vertexShader
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      vForestGround=(modelMatrix*vec4(transformed,1.0)).xz;
    `)
    shader.fragmentShader=`
      varying vec2 vForestGround;
      uniform sampler2D uForestDirt,uForestGroundShade,uForestCrashSurface;
      ${forestPathMaskGLSL}
      vec3 groundUvHash(vec2 p){vec3 h=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));h+=dot(h,h.yxz+33.33);return fract((h.xxy+h.yzz)*h.zyx);}
      vec4 groundImage(sampler2D image,vec2 uv,vec2 tile,vec2 dx,vec2 dy){
        vec3 h=groundUvHash(tile);float turn=floor(h.z*4.0);
        mat2 rotate=turn<1.0?mat2(1,0,0,1):turn<2.0?mat2(0,1,-1,0):turn<3.0?mat2(-1,0,0,-1):mat2(0,-1,1,0);
        float size=.9+h.x*.2;
        return textureGrad(image,rotate*uv*size+h.xy*7.0,rotate*dx*size,rotate*dy*size);
      }
      vec4 groundIllustration(sampler2D image,vec2 uv,vec2 dx,vec2 dy){
        vec2 cell=floor(uv),f=fract(uv),a,b,c;vec3 weights;
        if(f.x+f.y<1.0){a=cell;b=cell+vec2(1,0);c=cell+vec2(0,1);weights=vec3(1.0-f.x-f.y,f.x,f.y);}
        else{a=cell+vec2(1);b=cell+vec2(0,1);c=cell+vec2(1,0);weights=vec3(f.x+f.y-1.0,1.0-f.x,1.0-f.y);}
        weights=pow(max(weights,vec3(0)),vec3(4));weights/=dot(weights,vec3(1));
        return groundImage(image,uv,a,dx,dy)*weights.x+groundImage(image,uv,b,dx,dy)*weights.y+groundImage(image,uv,c,dx,dy)*weights.z;
      }
    `+shader.fragmentShader
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      vec2 ground=vForestGround;
      float earthMask=forestPathEarth(ground);
      vec2 crashUv=(ground-vec2(${CRASH_PATCH.minX.toFixed(1)},${CRASH_PATCH.minZ.toFixed(1)}))/vec2(${(CRASH_PATCH.maxX-CRASH_PATCH.minX).toFixed(1)},${(CRASH_PATCH.maxZ-CRASH_PATCH.minZ).toFixed(1)});
      vec3 crashSurface=texture2D(uForestCrashSurface,crashUv).rgb;
      earthMask=max(earthMask,crashSurface.r);
      vec2 imageUv=ground/${FOREST_GROUND_TILE_METRES.toFixed(1)};
      vec2 imageDx=dFdx(imageUv),imageDy=dFdy(imageUv);
      vec4 groundPaint;
      if(earthMask<.001)groundPaint=groundIllustration(map,imageUv,imageDx,imageDy);
      else if(earthMask>.999)groundPaint=groundIllustration(uForestDirt,imageUv+vec2(13.7,-9.3),imageDx,imageDy);
      else groundPaint=mix(groundIllustration(map,imageUv,imageDx,imageDy),groundIllustration(uForestDirt,imageUv+vec2(13.7,-9.3),imageDx,imageDy),earthMask);
      if(crashSurface.r>.001){
        // Both dry and damp soil retain the approved illustrated dirt image.
        // The second crop breaks repetition without replacing detail by RGB noise.
        vec2 dampScale=vec2(.78,1.17);
        vec3 dampPaint=groundIllustration(uForestDirt,imageUv*dampScale+vec2(-7.3,5.1),imageDx*dampScale,imageDy*dampScale).rgb;
        float wetness=smoothstep(.28,.82,crashSurface.g);
        vec3 scraped=mix(groundPaint.rgb*vec3(.82,.77,.62),dampPaint*vec3(.42,.45,.38),wetness);
        groundPaint.rgb=mix(groundPaint.rgb,scraped,crashSurface.r);
      }
      diffuseColor*=groundPaint;
    `)
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
      #include <color_fragment>
      float forestGroundShade=texture2D(uForestGroundShade,vForestGround/${FOREST.size.toFixed(1)}+.5).r;
      diffuseColor.rgb*=mix(vec3(.55,.74,.83),vec3(1.0),forestGroundShade);
    `)
  }
  material.addEventListener('dispose',()=>{if(--maskUsers===0){shade.dispose();crash.dispose();sharedShade=sharedCrash=null}})
  material.customProgramCacheKey=()=>`forest-original-ground-images-forward-route-v4/${FOREST_CRASH.length}`
  return material
}
