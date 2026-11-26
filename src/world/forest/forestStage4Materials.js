import {Color,Vector3} from 'three'
import {createForestGroundMaterial} from './forestGroundMaterial.js'
import {stage2PathX} from './forestStage2Config.js'
import {FOREST_STAGE3 as S} from './forestStage3Config.js'
import {canyonEarthMaterial} from './forestCanyonMaterials.js'

// Approximate area balance, not a uniform crossfade. Dimensions are metres.
// These settings affect only the desert's existing opaque material.
export const DESERT_BLEND_DEFAULTS=Object.freeze({sandShare:.60,detailTileMetres:12,sandTileMetres:8.8,maskMetres:32,edgeSoftness:.14,rockShare:.3,rockPatchMetres:29,pebbleMetres:.36})

export function stage4CliffMaterial(texture){
  // Use the floor's rotated three-sample blend, not the former wall's
  // horizontal strata / per-cell reflection. Keep the authored wall UVs.
  const material=canyonEarthMaterial(texture),compile=material.onBeforeCompile
  material.name='Plano 4 / desierto-floor.png organic darkened cliff'
  material.color.setScalar(.8)
  material.onBeforeCompile=(shader,renderer)=>{
    compile(shader,renderer)
    shader.fragmentShader=shader.fragmentShader.replace('diffuseColor*=canyonPaint(canyonDirt,vCanyonUv);',`
      // Match the floor's 12 x 6 metre texture scale on the vertical face.
      vec2 cliffUv=vCanyonUv*vec2(.666666667,1.0);
      vec2 cliffWarp=vec2(
        sin(dot(cliffUv,vec2(.71,.43))+sin(cliffUv.y*.83)),
        sin(dot(cliffUv,vec2(-.37,.61))+sin(cliffUv.x*.57))
      )*.22;
      diffuseColor*=canyonPaint(canyonDirt,cliffUv+cliffWarp);
    `)
  }
  material.customProgramCacheKey=()=> 'stage4-organic-desert-cliff-v1'
  return material
}

export function stage4DesertMaterial(detail,sand,settings={},origin=new Vector3()){
  const config={...DESERT_BLEND_DEFAULTS,...settings},material=canyonEarthMaterial(detail),compile=material.onBeforeCompile
  const uniforms={
    uDesertSand:{value:sand},
    uDesertSandShare:{value:config.sandShare},
    uDesertDetailMetres:{value:config.detailTileMetres},
    uDesertSandMetres:{value:config.sandTileMetres},
    uDesertMaskMetres:{value:config.maskMetres},
    uDesertEdgeSoftness:{value:config.edgeSoftness},
    uDesertOrigin:{value:origin},
    uDesertRockShare:{value:config.rockShare},
    uDesertRockPatchMetres:{value:config.rockPatchMetres},
    uDesertPebbleMetres:{value:config.pebbleMetres},
  }
  material.name='Plano 4 / original illustrated earth + illustrated sand'
  // Shared uniform objects also let the author compare/tune the balance live.
  // sandShare=0 restores the exact previously approved single-image material.
  material.userData.desertBlend={settings:config,uniforms}
  material.onBeforeCompile=(shader,renderer)=>{
    compile(shader,renderer);Object.assign(shader.uniforms,uniforms)
    // All desert tiles already use this same local coordinate frame. Sampling
    // it directly avoids tile seams and any camera/time-dependent distribution.
    shader.vertexShader='uniform vec3 uDesertOrigin;varying vec2 vDesertGround;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvDesertGround=(modelMatrix*vec4(transformed,1.0)).xz-uDesertOrigin.xz;')
    shader.fragmentShader=`
      varying vec2 vDesertGround;
      uniform sampler2D uDesertSand;
      uniform float uDesertSandShare,uDesertDetailMetres,uDesertSandMetres,uDesertMaskMetres,uDesertEdgeSoftness;
      uniform float uDesertRockShare,uDesertRockPatchMetres,uDesertPebbleMetres;
      float desertHash(vec2 p){vec3 h=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));h+=dot(h,h.yzx+33.33);return fract((h.x+h.y)*h.z);}
      float desertNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(desertHash(i),desertHash(i+vec2(1,0)),f.x),mix(desertHash(i+vec2(0,1)),desertHash(i+vec2(1)),f.x),f.y);}
      float desertPebble(vec2 p){
        vec2 cell=floor(p),f=fract(p);float nearest=2.0,shade=0.0;
        for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
          vec2 o=vec2(float(i),float(j)),id=cell+o;
          vec2 seed=vec2(desertHash(id),desertHash(id+vec2(73.2,19.1)));
          vec2 delta=o+.18+seed*.64-f;
          float d=length(delta*vec2(1.0,1.24));
          if(d<nearest){nearest=d;shade=seed.x;}
        }
        float edge=max(fwidth(nearest),.025);
        float stone=1.0-smoothstep(.24-edge,.24+edge,nearest);
        return stone*(.26+shade*.2);
      }
    `+shader.fragmentShader
    shader.fragmentShader=shader.fragmentShader.replace('diffuseColor*=canyonPaint(canyonDirt,vCanyonUv);',`
      float sandShare=clamp(uDesertSandShare,0.0,1.0);
      vec4 desertPaint;
      if(sandShare<.001){desertPaint=canyonPaint(canyonDirt,vCanyonUv);}
      else{
        vec2 ground=vDesertGround;
        vec2 macro=ground/max(uDesertMaskMetres,1.0);
        vec2 warp=vec2(desertNoise(macro*.73+vec2(4.7,-8.2)),desertNoise(macro*.81+vec2(-13.1,6.4)))-.5;
        float distribution=desertNoise(macro+warp*.7)*.72+desertNoise(macro*2.31+vec2(17.3,-11.8))*.28;
        float threshold=.5+(.5-sandShare)*.36;
        float feather=max(.015,uDesertEdgeSoftness);
        float sandWeight=sandShare>.999?1.0:smoothstep(threshold-feather,threshold+feather,distribution);
        // Warp/rotate coordinates only. Every RGB detail comes from the two
        // supplied paintings; procedural noise only controls their coverage.
        vec2 earthPoint=ground+warp*1.5;
        vec2 earthUv=vec2(earthPoint.x,-earthPoint.y)/vec2(max(1.0,uDesertDetailMetres),max(1.0,uDesertDetailMetres)*.5);
        mat2 sandRotation=mat2(.819648,.572867,-.572867,.819648);
        vec2 sandPoint=sandRotation*(ground+vec2(47.3,-29.1))+warp*2.1;
        vec2 sandUv=vec2(sandPoint.x,-sandPoint.y)/vec2(max(1.0,uDesertSandMetres),max(1.0,uDesertSandMetres)*.562799);
        // Both samples execute together: implicit UV derivatives stay valid
        // across mask boundaries, keeping mip transitions clean at speed.
        desertPaint=mix(canyonPaint(canyonDirt,earthUv),canyonPaint(uDesertSand,sandUv),sandWeight);
      }
      // A restrained central trail continues through the pass and broad plain.
      // Shared world-relative coordinates keep recycled tiles seamless.
      float routeDepth=-vDesertGround.y;
      float routeAge=max(0.0,routeDepth-2400.0);
      float routeX=(38.0*sin(routeAge*.0022)+16.0*sin(routeAge*.0041))*smoothstep(0.0,350.0,routeAge);
      float routeMark=(1.0-smoothstep(8.0,18.0,abs(vDesertGround.x-routeX)))*smoothstep(1150.0,1450.0,routeDepth);
      desertPaint.rgb*=mix(1.0,.84,routeMark);
      // Irregular gravel islands blend into the two existing ground paintings.
      // No decals/extra transparent layers, and subpixel pebbles fade out to
      // avoid shimmer during boost. All masks share the terrain's local frame.
      vec2 rockMacro=vDesertGround/max(1.0,uDesertRockPatchMetres);
      vec2 rockWarp=vec2(desertNoise(rockMacro*.8+12.7),desertNoise(rockMacro*.9-9.4))-.5;
      float rockDistribution=desertNoise(rockMacro+rockWarp)*.75+desertNoise(rockMacro*2.8)*.25;
      float rockMask=smoothstep(.59,.71,rockDistribution)*clamp(uDesertRockShare,0.0,1.0)*2.5;
      rockMask*=smoothstep(670.0,950.0,routeDepth)*(1.0-routeMark*.75);
      vec2 pebbleUv=vDesertGround/max(.12,uDesertPebbleMetres);
      float pebbleFootprint=max(length(dFdx(pebbleUv)),length(dFdy(pebbleUv)));
      float pebbleDetail=desertPebble(pebbleUv)*(1.0-smoothstep(.35,1.2,pebbleFootprint));
      vec3 gravel=desertPaint.rgb*vec3(.79,.82,.84)*(1.0-pebbleDetail);
      desertPaint.rgb=mix(desertPaint.rgb,gravel,clamp(rockMask,0.0,.8));
      diffuseColor*=desertPaint;
    `)
  }
  material.customProgramCacheKey=()=> 'stage4-two-original-desert-images-gravel-v3'
  return material
}

export function stage4GroundMaterial(grass,dirt,anisotropy,origin){
  const m=createForestGroundMaterial(grass,dirt,anisotropy),compile=m.onBeforeCompile,k=Math.PI*2/(S.chunkLength*S.chunks)
  const path=`uniform vec3 uStage4Origin;
  float stage4Path(vec2 p){float d=-p.y,t=smoothstep(0.0,96.0,d);float path=(12.0*sin(d*.012)+5.0*sin(d*.026))*(1.0-smoothstep(490.0,600.0,d));float a=${k.toFixed(12)}*(${S.startZ.toFixed(1)}-p.y-uStage4Origin.z);float old=${stage2PathX(S.startZ).toFixed(9)}+12.0*(1.0-cos(a))-7.0*(1.0-cos(a*2.0))-uStage4Origin.x;return mix(old,path,t);}
  float stage4Earth(vec2 world){vec2 p=world-uStage4Origin.xz;return max(max(1.0-smoothstep(1.3,4.5,abs(p.x-stage4Path(p))),smoothstep(520.0,620.0,-p.y+4.0*sin(p.x*.13))),smoothstep(800.0,1024.0,abs(p.x)));}`
  m.name='Plano 4 / original illustrated forest ground'
  m.onBeforeCompile=(shader,renderer)=>{compile(shader,renderer);shader.uniforms.uStage4Origin={value:origin};shader.fragmentShader=path+'\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('float earthMask=forestPathEarth(ground);','float earthMask=stage4Earth(ground);').replace('float forestGroundShade=texture2D(uForestGroundShade,vForestGround/800.0+.5).r;','float forestGroundShade=1.0;')}
  m.customProgramCacheKey=()=> 'stage4-approved-forest-images-v2';return m
}
export function stage4RockMaterial(source){
  const material=source.clone(),compile=source.onBeforeCompile,low=new Color('#685b53'),high=new Color('#ba9471')
  material.onBeforeCompile=(shader,renderer)=>{compile(shader,renderer);if(shader.uniforms.uForestLow)shader.uniforms.uForestLow={value:low};if(shader.uniforms.uForestHigh)shader.uniforms.uForestHigh={value:high}}
  material.customProgramCacheKey=()=>source.customProgramCacheKey()+'/desert-stones';return material
}
