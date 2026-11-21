import { BIKE_SOIL_MAX, BIKE_SOIL_COVERAGE_MAX } from './equipmentSoilLimit.js'
export const soilDeclarations = /* glsl */`
#define MOSPEADA_SOIL
uniform float uSoilEnabled;
uniform vec4 uSoilLoad;
uniform vec2 uSoilAxles;
uniform float uSoilGain;
uniform float uSoilSeed;
uniform vec3 uSoilDark;
uniform vec3 uSoilLight;
varying vec3 vSoilPosition;
varying vec3 vSoilNormal;
float soilHash(vec3 p) {
  p = fract(p * .1031); p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float soilSplat(vec2 uv, float seed) {
  vec2 cell = floor(uv), f = fract(uv) - .5;
  float h = soilHash(vec3(cell, seed));
  f -= vec2(h - .5, soilHash(vec3(cell.yx, seed + 7.0)) - .5) * .22;
  float angle = atan(f.y, f.x);
  float radius = .14 + .27 * h;
  radius *= 1.0 + .15 * sin(angle * 3.0 + h * 19.0);
  float edge = radius - length(f);
  return smoothstep(-max(fwidth(edge), .012), max(fwidth(edge), .012), edge) * step(.32, h);
}
float soilNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(soilHash(i), soilHash(i + vec3(1,0,0)), f.x), mix(soilHash(i + vec3(0,1,0)), soilHash(i + vec3(1,1,0)), f.x), f.y), mix(mix(soilHash(i + vec3(0,0,1)), soilHash(i + vec3(1,0,1)), f.x), mix(soilHash(i + vec3(0,1,1)), soilHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float soilPattern(vec3 p, vec3 n, float scale) {
  vec3 w = pow(abs(n), vec3(5.0)); w /= max(w.x + w.y + w.z, .001);
  p = p * scale + vec3(uSoilSeed, 0.0, uSoilSeed * 1.71);
  return dot(w, vec3(soilSplat(p.yz, uSoilSeed), soilSplat(p.xz, uSoilSeed + 3.0), soilSplat(p.xy, uSoilSeed + 9.0)));
}
`

export function patchSoilShader(shader) {
  shader.vertexShader = 'uniform mat4 uSoilBind;\nvarying vec3 vSoilPosition;\nvarying vec3 vSoilNormal;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSoilPosition = (uSoilBind * vec4(position, 1.0)).xyz;\nvSoilNormal = normalize(mat3(uSoilBind) * normal);')
  shader.fragmentShader = 'uniform float uBikeSoilCoverageMax;\n' + soilDeclarations + shader.fragmentShader.replace('#include <color_fragment>', /* glsl */`
    #include <color_fragment>
    float soilCoverage = 0.0;
    if (uSoilEnabled > .5 && dot(uSoilLoad, vec4(1.0)) > .001) {
      vec3 soilN = normalize(vSoilNormal);
      float soilLower = 1.0 - smoothstep(.32, .94, vSoilPosition.y);
      float soilFacing = .52 + .28 * (1.0 - soilN.y) * .5 + .20 * abs(soilN.x);
      vec2 soilWeights = exp(-abs(vSoilPosition.zz - uSoilAxles) * 2.6);
      soilWeights /= max(soilWeights.x + soilWeights.y, .001);
      float soilMud = dot(soilWeights, uSoilLoad.xy);
      float soilFilm = dot(soilWeights, uSoilLoad.zw);
      float soilSaturation = clamp(soilMud / ${BIKE_SOIL_MAX.toFixed(2)}, 0.0, 1.0);
      vec3 soilWarp = vSoilPosition + .024 * sin(vSoilPosition.yzx * vec3(8.1, 6.4, 7.7) + uSoilSeed);
      float soilFine = soilPattern(soilWarp, soilN, 23.0);
      float soilCoarse = soilNoise(soilWarp * 7.0 + uSoilSeed);
      float soilMottle = soilNoise(soilWarp * 15.0 + uSoilSeed);
      float soilPatch = smoothstep(.75 - soilSaturation * .48, .88 - soilSaturation * .48, soilCoarse);
      float soilDust = .18 + soilMottle * .55 + soilFine * .4;
      soilCoverage = clamp((soilMud * soilPatch * 1.6 + soilMud * soilFine * .42 + soilFilm * soilDust) * soilLower * soilFacing * uSoilGain, 0.0, min(${BIKE_SOIL_COVERAGE_MAX}, uBikeSoilCoverageMax));
      vec3 soilColor = mix(uSoilDark, uSoilLight, soilMottle * .65 + soilN.y * .12 + .12);
      diffuseColor.rgb = mix(diffuseColor.rgb, soilColor, soilCoverage);
    }
  `)
  shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, .91, soilCoverage);')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - soilCoverage * .95;')
}
