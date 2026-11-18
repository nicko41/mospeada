import { BRUSH_SWEEP_SECONDS, BRUSH_TOTAL_SECONDS } from './surfaceBrushState.js'

const vertexDeclarations = /* glsl */`
attribute vec2 aBrushAtlas;
attribute vec3 aBrushEdgeDistance;
attribute vec4 aBrushData;
attribute float aBrushBikeZ;
varying float vBrushBikeZ;
varying vec2 vBrushAtlas;
varying vec3 vBrushEdges;
varying vec4 vBrushData;
varying vec3 vBrushGeometricNormal;
`
const fragmentDeclarations = /* glsl */`
uniform float uBrushEnabled, uBrushProgress, uBrushSize, uBrushIntensity;
uniform float uBrushIrregularity, uBrushSensitivity, uBrushDirection, uBrushDay;
uniform vec3 uBrushColor;
uniform mat3 uBrushViewToLocalNormal;
uniform float uBrushPanelDelay, uBrushDelayStrength;
varying float vBrushBikeZ;
varying vec2 vBrushAtlas;
varying vec3 vBrushEdges;
varying vec4 vBrushData;
varying vec3 vBrushGeometricNormal;
`
const paint = /* glsl */`
if (uBrushEnabled > 0.5 && vBrushData.x > 0.99 && gl_FrontFacing && uBrushProgress >= 0.0 && uBrushProgress <= 1.0) {
  vec3 brushN = normalize(uBrushViewToLocalNormal * normal);
  vec3 brushGeometricN = normalize(vBrushGeometricNormal);
  float relief = 1.0 - clamp(dot(brushN, brushGeometricN), 0.0, 1.0);
  float sequenceProgress = uBrushDirection > 0.0 ? uBrushProgress : 1.0 - uBrushProgress;
  vec2 uv = vBrushAtlas;
  // This is an intrinsic surface chart, folded with the real triangle edges.
  // Local normals bend the painted contour again at folds and normal-map relief.
  uv += vec2(brushN.z * 0.018, brushN.x * 0.045 + relief * 0.3) * uBrushSensitivity;
  float seed = uBrushPanel.z;
  // Delay by piece and surface orientation, never by triangle index. Coplanar
  // triangles stay together and curved skins vary smoothly with their normals.
  float faceDelay = 0.04 + 0.04 * sin(dot(brushGeometricN, vec3(2.7, 4.1, 1.3)) + seed);
  float delay = (uBrushPanelDelay + faceDelay) * uBrushDelayStrength;
  float progress = (sequenceProgress * ${BRUSH_TOTAL_SECONDS} - delay) / ${BRUSH_SWEEP_SECONDS};
  float travelZ = mix(uBrushBikeRange.y + 0.22, uBrushBikeRange.x - 0.22, progress);
  // Narrow along the bike, broad across its surface: an irregular rectangle
  // perpendicular to travel, with a different contour on each real panel.
  // Bind-space Z coordinates arrival across separate parts; the intrinsic
  // chart, folds and relief determine the actual painted shape on each one.
  float foldedZ = vBrushBikeZ + uBrushSensitivity * (brushN.z * 0.018 + relief * 0.04);
  foldedZ += uBrushIrregularity * 0.012 * sin(uv.y * 7.0 + seed);
  float q = (foldedZ - travelZ) / (0.065 * uBrushSize);
  float curve = 0.5 + uBrushIrregularity * (0.045 * sin(q * 2.6 + seed) + 0.035 * sin(uv.x * 7.0 + seed));
  float taper = pow(max(0.0, 1.0 - pow(abs(q), 8.0)), 0.12);
  float width = 0.43 * uBrushSize * taper * (1.0 + uBrushIrregularity * (0.12 * sin(q * 4.0 + seed) + 0.05 * sin(q * 8.0)));
  float signedShape = width - abs(uv.y - curve);
  // An off-centre bite splits a portion of the trailing tip, like a brush lift.
  float bite = length(vec2((q + 0.72) * 0.22, uv.y - curve + 0.34)) - 0.05 * uBrushIrregularity;
  float brushAA = max(fwidth(signedShape), 0.0015);
  float stroke = smoothstep(-brushAA, brushAA, signedShape) * step(abs(q), 1.0);
  stroke *= smoothstep(-brushAA, brushAA, bite);
  vec3 edgeDistances = mix(vec3(1.0), vBrushEdges, vBrushData.yzw);
  float edgeDistance = min(edgeDistances.x, min(edgeDistances.y, edgeDistances.z));
  stroke *= smoothstep(0.0015, 0.0015 + max(fwidth(edgeDistance), 0.0004), edgeDistance);
  float foldLight = 0.26 + 0.74 * max(dot(brushN, normalize(vec3(0.35, 0.85, 0.3))), 0.0);
  foldLight *= 0.86 + 0.14 * sin(seed + dot(brushGeometricN, vec3(2.7, 4.1, 1.3)));
  float gain = mix(1.0, foldLight * (1.0 - relief * 0.7), clamp(uBrushSensitivity, 0.0, 1.0));
  float envelope = smoothstep(0.0, 0.09, progress) * (1.0 - smoothstep(0.91, 1.0, progress));
  float coverage = stroke * gain * envelope * clamp(uBrushIntensity, 0.0, 1.0);
  vec3 pigment = uBrushColor * (1.25 + 0.2 * max(0.0, uBrushIntensity - 1.0)) * (0.55 + 0.45 * uBrushDay);
  outgoingLight = mix(outgoingLight, pigment, coverage);
}
`

export function patchSurfaceBrush(shader) {
  shader.vertexShader = vertexDeclarations + shader.vertexShader.replace('#include <defaultnormal_vertex>', '#include <defaultnormal_vertex>\nvBrushGeometricNormal = normalize(objectNormal);')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBrushAtlas = aBrushAtlas; vBrushEdges = aBrushEdgeDistance; vBrushData = aBrushData; vBrushBikeZ = aBrushBikeZ;')
  shader.fragmentShader = 'uniform vec2 uBrushBikeRange;\nuniform vec3 uBrushPanel;\n' + fragmentDeclarations + shader.fragmentShader.replace('#include <opaque_fragment>', paint + '\n#include <opaque_fragment>')
}

