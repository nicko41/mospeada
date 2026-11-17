const simplexNoise = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 10.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
    -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = x0.x > x0.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
    dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
`

export const grassVertexShader = /* glsl */ `
${simplexNoise}

attribute float aClumpAngle;
attribute vec2 aClumpCenter;
attribute float aClumpDistance;
attribute float aAccent;
attribute float aColorVariation;

uniform float uTime;
uniform vec2 uWindDirection;
uniform float uWindStrength;
uniform vec2 uColorSeed;
uniform float uFadeStart;
uniform float uFadeEnd;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying float vAccent;
varying float vBiomeNoise;
varying float vColorVariation;
varying float vViewDepth;
varying float vDistanceFade;
varying float vFadeSeed;

mat3 rotateAxis(vec3 axis, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  float t = 1.0 - c;
  float x = axis.x;
  float y = axis.y;
  float z = axis.z;
  return mat3(
    t*x*x+c, t*x*y-s*z, t*x*z+s*y,
    t*x*y+s*z, t*y*y+c, t*y*z-s*x,
    t*x*z-s*y, t*y*z+s*x, t*z*z+c
  );
}

void main() {
  vUv = uv;
  vAccent = aAccent;
  vColorVariation = aColorVariation;

  vec3 bladeOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vBiomeNoise = snoise(bladeOrigin.xz * 0.055 + uColorSeed);
  vDistanceFade = 1.0 - smoothstep(uFadeStart, uFadeEnd, distance(cameraPosition, bladeOrigin));
  vFadeSeed = fract(sin(dot(bladeOrigin.xz, vec2(12.9898, 78.233))) * 43758.5453);

  float heightFalloff = pow(uv.y, 1.55);
  vec2 wavePosition = bladeOrigin.xz * 0.048 + uWindDirection * uTime * 0.31;
  float broadWind = snoise(wavePosition) * 0.62
    + snoise(wavePosition * 2.7) * 0.27
    + snoise(wavePosition * 5.1) * 0.11;
  float gust = smoothstep(0.38, 0.78, snoise(bladeOrigin.xz * 0.022
    + uWindDirection * uTime * 0.18));
  float regionalPhase = snoise(floor(bladeOrigin.xz / 3.5) * 0.73) * 2.8;
  float phase = snoise(bladeOrigin.xz * 0.24) * 6.283185
    + regionalPhase + aColorVariation * 2.1;
  float sway = sin(uTime * (1.35 + aColorVariation * 0.45) + phase) * 0.24 + 0.76;
  float flexibility = mix(0.68, 1.12, aColorVariation);
  float travelingPulse = sin(uTime * 1.65 + bladeOrigin.x * 0.16
    + bladeOrigin.z * 0.1 + regionalPhase) * 0.32;
  float bend = clamp((0.15 + broadWind * 0.85 + gust * 0.48
    + travelingPulse) * sway * uWindStrength * flexibility * heightFalloff,
    -0.95, 1.18);

  float directionNoise = snoise(wavePosition * 0.45 + 17.0) * 0.24;
  float c = cos(directionNoise);
  float s = sin(directionNoise);
  vec2 localWind = mat2(c, s, -s, c) * uWindDirection;
  vec3 windAxis = normalize(vec3(-localWind.y, 0.0, localWind.x));
  mat3 windRotation = rotateAxis(windAxis, bend);
  mat3 clumpRotation = rotateAxis(vec3(0.0, 1.0, 0.0), aClumpAngle);
  vec3 domeAxis = normalize(vec3(-aClumpCenter.y, 0.0, aClumpCenter.x) + vec3(0.0001, 0.0, 0.0));
  mat3 domeRotation = rotateAxis(domeAxis, aClumpDistance * 0.10 * heightFalloff);

  vec3 localPosition = position;
  localPosition.y *= mix(1.0, 1.4, aAccent);
  vec3 bentPosition = windRotation * domeRotation * clumpRotation * localPosition;
  bentPosition.xz += vec2(
    snoise(bladeOrigin.xz * 0.12 + uTime * 0.18),
    snoise(bladeOrigin.xz * 0.12 + uTime * 0.18 + 31.0)
  ) * 0.018 * smoothstep(0.65, 1.0, uv.y);

  vec4 worldPosition = modelMatrix * instanceMatrix * vec4(bentPosition, 1.0);
  vec4 viewPosition = viewMatrix * worldPosition;
  vWorldPosition = worldPosition.xyz;
  vViewDepth = -viewPosition.z;
  vNormal = normalize(mat3(modelMatrix * instanceMatrix)
    * windRotation * domeRotation * clumpRotation * normal);
  gl_Position = projectionMatrix * viewPosition;
}
`

export const grassFragmentShader = /* glsl */ `
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uPhonePosition;
uniform vec3 uPhoneDirection;
uniform float uPhoneEnabled;
uniform float uPhoneDistance;
uniform float uFadeEnd;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying float vAccent;
varying float vBiomeNoise;
varying float vColorVariation;
varying float vViewDepth;
varying float vDistanceFade;
varying float vFadeSeed;

float interleavedGradientNoise(vec2 position) {
  return fract(52.9829189 * fract(dot(position, vec2(0.06711056, 0.00583715))));
}

void main() {
  float dither = interleavedGradientNoise(gl_FragCoord.xy + vFadeSeed * 97.0);
  if (dither > vDistanceFade) discard;

  float biome = clamp(vBiomeNoise * 0.5 + 0.5, 0.0, 1.0);
  vec3 dryBase = vec3(0.036, 0.038, 0.027);
  vec3 dryTip = vec3(0.072, 0.074, 0.049);
  vec3 fieldBase = vec3(0.022, 0.034, 0.025);
  vec3 fieldTip = vec3(0.052, 0.067, 0.049);
  vec3 coldBase = vec3(0.021, 0.029, 0.028);
  vec3 coldTip = vec3(0.047, 0.056, 0.052);

  vec3 dry = mix(dryBase, dryTip, vUv.y);
  vec3 field = mix(fieldBase, fieldTip, vUv.y);
  vec3 cold = mix(coldBase, coldTip, vUv.y);
  vec3 baseColor = biome < 0.5
    ? mix(dry, field, biome * 2.0)
    : mix(field, cold, (biome - 0.5) * 2.0);
  baseColor *= 0.9 + vColorVariation * 0.14;
  baseColor = mix(baseColor, dry, vAccent * 0.42 * vUv.y);
  vec3 groundBlend = vec3(0.018, 0.022, 0.017);
  baseColor = mix(groundBlend, baseColor, smoothstep(0.08, 0.68, vUv.y));

  vec3 normal = normalize(gl_FrontFacing ? vNormal : -vNormal);
  normal = normalize(mix(normal, vec3(0.0, 1.0, 0.0), 0.55));
  vec3 moonDirection = normalize(vec3(-0.42, 0.82, 0.25));
  float diffuse = dot(normal, moonDirection) * 0.5 + 0.5;
  float ambient = 0.075;
  float heightOcclusion = mix(0.32, 1.0, smoothstep(0.0, 0.82, vUv.y));
  vec3 finalColor = baseColor * (ambient + diffuse * 0.14) * heightOcclusion;

  vec3 phoneToFragment = vWorldPosition - uPhonePosition;
  float phoneDistance = length(phoneToFragment);
  vec3 phoneRay = phoneToFragment / max(phoneDistance, 0.001);
  float cone = smoothstep(0.73, 0.95, dot(phoneRay, normalize(uPhoneDirection)));
  float range = pow(clamp(1.0 - phoneDistance / min(uPhoneDistance, 30.0), 0.0, 1.0), 2.25);
  vec3 toPhone = -phoneRay;
  float bladeFacing = mix(0.42, 0.82, abs(dot(normal, toPhone)));
  float phoneLight = cone * range * bladeFacing * uPhoneEnabled;
  finalColor += baseColor * vec3(0.72, 0.79, 0.79) * phoneLight * 2.15;

  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float edgeSheen = pow(1.0 - max(dot(normal, viewDirection), 0.0), 4.0);
  finalColor += edgeSheen * vec3(0.006, 0.008, 0.007) * vUv.y;

  float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vViewDepth * vViewDepth);
  fogFactor = max(fogFactor, smoothstep(14.0, uFadeEnd, vViewDepth) * 0.92);
  gl_FragColor = vec4(mix(finalColor, uFogColor, clamp(fogFactor, 0.0, 1.0)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`
