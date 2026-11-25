// Fragment-only treatment: native skinning, morphs, instancing, maps, light
// attenuation, shadow maps and transmission remain in Three's original shaders.
export const animeUniformsGLSL = /* glsl */`
uniform float uAnimeCel;
uniform float uAnimeLevels;
uniform float uAnimeShadow;
uniform float uAnimeHighlights;
uniform float uAnimeSurfaceShine;
uniform float uAnimeDay;
uniform float uAnimeGlass;
uniform float uAnimeHero;
uniform float uAnimeMask;
uniform float uDistanceHaze;
uniform vec2 uDistanceHazeRange;
layout(location = 1) out highp vec4 animeMaskOutput;
float animeLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float animeStep(float threshold, float value) {
  float aa = max(fwidth(value) * 0.85, 0.006);
  return smoothstep(threshold - aa, threshold + aa, value);
}
float animeBand(float value) {
  float band = 0.0;
  for (int i = 1; i < 5; i++) {
    if (float(i) < uAnimeLevels) band += animeStep(float(i) / uAnimeLevels, value);
  }
  return band / max(uAnimeLevels - 1.0, 1.0);
}
`

export const animeLightingGLSL = /* glsl */`
if (uAnimeCel > 0.5) {
  vec3 animeAlbedo = max(diffuseColor.rgb, vec3(0.001));
  vec3 animeDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
  vec3 animeIllumination = animeDiffuse / max(animeAlbedo, vec3(0.025));
  float animeBrightness = max(animeLuma(animeIllumination), 0.0);
  float animeBandValue = animeBand(animeBrightness / (animeBrightness + 0.22));
  float animeShade = mix(1.0 - 0.8 * uAnimeShadow, 1.0, animeBandValue);
  vec3 animeHue = clamp(animeIllumination / max(animeBrightness, 0.001), vec3(0.78), vec3(1.15));
  animeHue = mix(vec3(0.80, 0.87, 1.0), animeHue, 0.7 + animeBandValue * 0.3);
  // Exposure follows the same band, so continuous irradiance cannot sneak a
  // smooth lighting gradient back into each cel level. Day/night stays gradual.
  float animeExposure = mix(0.12 + 0.48 * uAnimeDay, 1.1, animeBandValue);
  float animeMetal = 0.0;
  #ifdef STANDARD
    animeMetal = metalnessFactor;
  #endif
  if (uAnimeGlass < 0.5) {
    vec3 animeLit = animeAlbedo * animeShade * animeHue * animeExposure * (1.0 - 0.8 * animeMetal);
    // Retain the ambient share: Three applies the original AO map to it later.
    float animeAmbientShare = clamp(animeLuma(reflectedLight.indirectDiffuse) / max(animeLuma(animeDiffuse), 0.0001), 0.0, 1.0);
    reflectedLight.directDiffuse = animeLit * (1.0 - animeAmbientShare);
    reflectedLight.indirectDiffuse = animeLit * animeAmbientShare;
  }
  vec3 animeSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
  float animeSpecularValue = max(animeLuma(animeSpecular), 0.0001);
  vec3 animeSpecularHue = clamp(animeSpecular / animeSpecularValue, vec3(0.65), vec3(1.4));
  vec3 animeN = normal;
  #ifndef FLAT_SHADED
    animeN = normalize(vNormal);
  #endif
  vec3 animeV = normalize(vViewPosition);
  float animeBlue = step(animeAlbedo.r * 1.4, animeAlbedo.b) * step(animeAlbedo.g * 1.15, animeAlbedo.b) * step(0.04, animeAlbedo.b) * uAnimeHero;
  float animeReflection = max(dot(reflect(-animeV, animeN), normalize(vec3(-0.35, 0.8, 0.45))), 0.0);
  float animeVisorShine = animeStep(0.79, animeReflection) * animeBlue;
  float animeRim = animeStep(0.62, pow(1.0 - abs(dot(animeN, animeV)), 2.5));
  vec3 animeShine = animeSpecularHue * animeStep(0.075, animeSpecularValue) * (0.20 + animeMetal * 0.30);
  animeShine += vec3(0.38, 0.56, 0.85) * (animeVisorShine * 0.65 + animeRim * animeBlue * 0.14);
  animeShine += vec3(0.04, 0.05, 0.065) * animeRim * uAnimeHero;
  reflectedLight.directSpecular = (animeShine + animeSpecular * 0.06) * uAnimeHighlights * uAnimeSurfaceShine;
  reflectedLight.indirectSpecular = vec3(0.0);
  #ifdef MOSPEADA_SOIL
    reflectedLight.directSpecular *= 1.0 - soilCoverage * .9;
  #endif
}
`

export function insertAtMainEnd(shader, code) {
  const start = shader.indexOf('void main')
  if (start < 0) return shader
  const open = shader.indexOf('{', start)
  let depth = 1, index = open + 1
  while (index < shader.length && depth) { if (shader[index] === '{') depth++; if (shader[index] === '}') depth--; index++ }
  return shader.slice(0, index - 1) + '\n' + code + '\n' + shader.slice(index - 1)
}

export function patchAnimeShader(shader, profile) {
  const lit = shader.includes('#include <lights_fragment_end>')
  let result = animeUniformsGLSL + shader
  result=result.replace('#include <fog_fragment>',`
    #ifdef USE_FOG
      if(uDistanceHaze>.5){
        float hazeFactor=smoothstep(uDistanceHazeRange.x,uDistanceHazeRange.y,vFogDepth);
        gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,hazeFactor);
      }else{
        #include <fog_fragment>
      }
    #endif
  `)
  if (lit && !profile.natural) result = result.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + animeLightingGLSL)
  if (profile.grass) result = result.replace(
    'mix(vColor * 0.55, vColor, smoothstep(0.05, 0.8, vUv.y))',
    'mix(vColor * 0.55, vColor, uAnimeCel > 0.5 ? animeBand(smoothstep(0.05, 0.8, vUv.y)) : smoothstep(0.05, 0.8, vUv.y))',
  )
  const mask = lit ? 'animeMaskOutput = vec4(uAnimeMask, 0.0, 0.0, step(0.25, uAnimeMask));' : 'animeMaskOutput = vec4(0.0);'
  return insertAtMainEnd(result, mask)
}

export const compositeVertex = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`
export const compositeFragment = /* glsl */`
uniform sampler2D uBeauty;
uniform sampler2D uMask;
uniform sampler2D uDepth;
uniform vec2 uPixel;
uniform float uNear;
uniform float uFar;
uniform float uWidth;
uniform float uOutlines;
uniform vec3 uOutlineColor;
uniform float uFogDensity;
uniform float uFogLinear;
uniform vec2 uFogRange;
uniform float uHazeBlur;
uniform vec2 uImpactBlurDirection;
uniform vec2 uImpactBlurFocus;
uniform float uImpactBlurPixels;
uniform float uImpactBlurBlend;
uniform float uBoostBlurStrength;
uniform float uBoostBlurPixels;
uniform float uBoostClearRadius;
uniform float uBoostAspect;
uniform vec4 uBoostProtectRects[2];
varying vec2 vUv;
float viewDepth(vec2 uv) {
  float d = texture2D(uDepth, uv).r;
  return uNear * uFar / max(uFar - d * (uFar - uNear), 0.0001);
}
float boostProtected(vec2 uv){
  float protect=step(.65,texture2D(uMask,uv).r);
  for(int i=0;i<2;i++){
    vec4 r=uBoostProtectRects[i];
    protect=max(protect,step(r.x,uv.x)*step(r.y,uv.y)*step(uv.x,r.z)*step(uv.y,r.w));
  }
  return protect;
}
void main() {
  float edge = 0.0;
  if (uOutlines > 0.5) {
  vec4 mask = texture2D(uMask, vUv);
  float depth = viewDepth(vUv);
  float edgeDepth = depth;
  for (int i = 0; i < 8; i++) {
    float angle = float(i) * 0.78539816339;
    vec2 uv = vUv + vec2(cos(angle), sin(angle)) * uPixel * uWidth;
    float nd = viewDepth(uv);
    vec4 neighbor = texture2D(uMask, uv);
    float nearest = min(depth, nd);
    float gap = abs(depth - nd) / max(nearest, 1.0);
    float participant = depth < nd ? mask.r : neighbor.r;
    float silhouette = smoothstep(0.012, 0.035, gap) * step(0.25, participant);
    // Only silhouettes and occlusions. Authored flat normals must never become
    // triangle outlines; panel detail stays in the existing textures/lighting.
    edge = max(edge, silhouette); edgeDepth = min(edgeDepth, nearest);
  }
  float fogVisibility=uFogLinear>.5?1.0-smoothstep(uFogRange.x,uFogRange.y,edgeDepth):exp(-uFogDensity*uFogDensity*edgeDepth*edgeDepth);
  edge *= fogVisibility * uOutlines;
  }
  vec3 beauty=texture2D(uBeauty,vUv).rgb;
  if(uHazeBlur>.001){
    float hazeDepth=viewDepth(vUv);
    float softDistance=smoothstep(0.0,.5,smoothstep(uFogRange.x,uFogRange.y,hazeDepth));
    // The sky already has a smooth haze gradient and needs no depth blur.
    if(softDistance>.001&&hazeDepth<uFar*.999){
      vec3 softened=beauty*4.0;float totalWeight=4.0;
      for(int i=0;i<8;i++){
        float angle=float(i)*.78539816339;
        vec2 sampleUv=clamp(vUv+vec2(cos(angle),sin(angle))*uPixel*uHazeBlur*softDistance,vec2(0.0),vec2(1.0));
        // Never pull Scott, Rand or a nearby enemy into a background blur.
        float weight=smoothstep(uFogRange.x,uFogRange.x+250.0,viewDepth(sampleUv));
        softened+=texture2D(uBeauty,sampleUv).rgb*weight;totalWeight+=weight;
      }
      beauty=softened/totalWeight;
      edge*=1.0-softDistance*.65;
    }
  }
  if(uBoostBlurStrength>0.00001){
    vec2 radial=vUv-vec2(.5);
    float radius=length(radial*vec2(uBoostAspect,1.0))*2.0;
    float peripheral=smoothstep(uBoostClearRadius,1.2,radius);
    // Dilate hero protection through AA edges; never smear Scott or Cyclone
    // into the moving background. Small rectangles also protect clear optics.
    float protect=boostProtected(vUv);
    protect=max(protect,boostProtected(clamp(vUv+vec2(uPixel.x*1.5,0.0),vec2(0.0),vec2(1.0))));
    protect=max(protect,boostProtected(clamp(vUv-vec2(uPixel.x*1.5,0.0),vec2(0.0),vec2(1.0))));
    protect=max(protect,boostProtected(clamp(vUv+vec2(0.0,uPixel.y*1.5),vec2(0.0),vec2(1.0))));
    protect=max(protect,boostProtected(clamp(vUv-vec2(0.0,uPixel.y*1.5),vec2(0.0),vec2(1.0))));
    float aimProtect=1.0-smoothstep(.04,.09,length(vUv-uImpactBlurFocus));
    if(peripheral>0.0&&max(protect,aimProtect)<.001){
      vec2 ray=radial/uPixel;ray/=max(length(ray),.001);
      vec2 offset=ray*uPixel*uBoostBlurPixels*peripheral;
      vec3 accumulated=beauty*2.0;float total=2.0;
      for(int i=1;i<=3;i++){
        vec2 tap=clamp(vUv-offset*(float(i)/3.0),vec2(0.0),vec2(1.0));
        float weight=1.0-boostProtected(tap);
        accumulated+=texture2D(uBeauty,tap).rgb*weight;total+=weight;
      }
      beauty=mix(beauty,accumulated/total,uBoostBlurStrength*peripheral);
    }
  }
  if(uImpactBlurBlend>0.0001){
    // Directional impulse blur. Wide Invid destruction pulses use five
    // balanced taps; ordinary hits keep their original three-tap response.
    vec2 offset=uImpactBlurDirection*uPixel*uImpactBlurPixels;
    vec3 outer=texture2D(uBeauty,clamp(vUv-offset,vec2(0.0),vec2(1.0))).rgb+texture2D(uBeauty,clamp(vUv+offset,vec2(0.0),vec2(1.0))).rgb;
    vec3 softened=beauty*.8+outer*.1;
    if(uImpactBlurPixels>24.0){
      vec3 inner=texture2D(uBeauty,clamp(vUv-offset*.5,vec2(0.0),vec2(1.0))).rgb+texture2D(uBeauty,clamp(vUv+offset*.5,vec2(0.0),vec2(1.0))).rgb;
      softened=mix(softened,(beauty+outer+inner)*.2,smoothstep(24.0,48.0,uImpactBlurPixels));
    }
    float focus=smoothstep(.045,.13,length(vUv-uImpactBlurFocus));
    beauty=mix(beauty,softened,uImpactBlurBlend*focus);
  }
  gl_FragColor = vec4(beauty, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uOutlineColor, edge * 0.92);
}
`
