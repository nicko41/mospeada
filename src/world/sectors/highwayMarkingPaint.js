// World-space wear stays deterministic, including on recycled highway chunks.
export function addMarkingPaintWear(material) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aPaintSpan;
        varying float vPaintStart;
        varying vec2 vPaintSpan;
        varying vec2 vPaintPosition;
        varying vec2 vPaintUv;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vPaintPosition = (modelMatrix * vec4(position, 1.0)).xz;
        vPaintStart = vPaintPosition.x - uv.x * aPaintSpan.x;
        vPaintSpan = aPaintSpan;
        vPaintUv = uv;`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vPaintStart;
        varying vec2 vPaintSpan;
        varying vec2 vPaintPosition;
        varying vec2 vPaintUv;
        float paintHash(vec2 p) {
          vec3 h = fract(vec3(p.xyx) * 0.1031);
          h += dot(h, h.yzx + 33.33);
          return fract((h.x + h.y) * h.z);
        }
        float paintNoise(vec2 p) {
          vec2 cell = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(paintHash(cell), paintHash(cell + vec2(1.0, 0.0)), f.x),
                     mix(paintHash(cell + vec2(0.0, 1.0)), paintHash(cell + vec2(1.0)), f.x), f.y);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // Erode the silhouette first, with independent edges and centimetre-scale nicks.
        vec2 p = vPaintPosition;
        float leftWear = paintNoise(vec2(p.x * 13.0, p.y * 31.0));
        float rightWear = paintNoise(vec2(p.x * 17.0 + 91.7, p.y * 29.0 + 43.2));
        float nicks = paintNoise(p * vec2(67.0, 103.0));
        float aa = max(fwidth(vPaintUv.y) * 0.65, 0.006);
        float leftInset = 0.012 + leftWear * leftWear * 0.065;
        float rightInset = 0.012 + rightWear * rightWear * 0.065;
        float nickInset = smoothstep(0.60, 0.85, nicks) * 0.055;
        float silhouette = smoothstep(leftInset + nickInset, leftInset + nickInset + aa, vPaintUv.y)
          * smoothstep(rightInset + nickInset, rightInset + nickInset + aa, 1.0 - vPaintUv.y);
        // Only dashed lines have eroded ends; continuous lines keep seamless chunk joins.
        float endDistance = min(vPaintUv.x, 1.0 - vPaintUv.x) * vPaintSpan.x;
        float endWear = paintNoise(p * vec2(23.0, 79.0) + vec2(17.3, 5.8));
        float endInset = 0.004 + endWear * endWear * 0.032;
        float endAa = max(fwidth(endDistance) * 0.65, 0.002);
        silhouette *= mix(1.0, smoothstep(endInset, endInset + endAa, endDistance), vPaintSpan.y);
        // Each dash has a stable coverage level; continuous lines vary smoothly in world space.
        float segmentWear = paintHash(vec2(floor(vPaintStart * 4.0 + 0.5), floor(p.y * 0.5)));
        float age = mix(paintNoise(p * vec2(0.12, 0.5)), segmentWear, vPaintSpan.y);
        // Broad missing paint exposes asphalt rather than tinting it with dark spots.
        vec2 warp = vec2(leftWear, rightWear) * 0.37;
        float abrasion = paintNoise(p * vec2(1.7, 24.0) + warp);
        float scuffs = paintNoise(p * vec2(0.65, 145.0) + warp);
        float patches = paintNoise(p * vec2(0.85, 18.0) + vec2(abrasion, scuffs) * 0.3);
        float missingPaint = smoothstep(0.58 - age * 0.12, 0.76 - age * 0.12, patches);
        float detail = 1.0 - smoothstep(0.015, 0.065, max(fwidth(p.x), fwidth(p.y)));
        float coverage = mix(0.92, 0.68, age)
          * (1.0 - missingPaint * 0.96)
          * (1.0 - smoothstep(0.34, 0.78, abrasion) * 0.38)
          * (1.0 - smoothstep(0.42, 0.84, scuffs) * 0.32 * detail);
        diffuseColor.rgb *= 0.82 + abrasion * 0.12;
        diffuseColor.a *= silhouette * coverage;`)
  }
  material.customProgramCacheKey = () => 'highway-weathered-paint-v3'
  return material
}
