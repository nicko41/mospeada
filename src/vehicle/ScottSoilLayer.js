import { Box3, Color, Vector3, Vector4 } from 'three'
import { soilDeclarations } from './soilShader.js'

export function scottRegion(name) {
  if (/Foot|ToeBase/.test(name)) return new Vector4(1, 0, 0, 0)
  if (/UpLeg/.test(name)) return new Vector4(0, .7, 0, 0)
  if (/Leg$/.test(name)) return new Vector4(0, 1, 0, 0)
  if (/ForeArm/.test(name)) return new Vector4(0, 0, 1, 0)
  if (/Hand$/.test(name)) return new Vector4(0, 0, .55, 0)
  if (/Arm$/.test(name)) return new Vector4(0, 0, .12, 0)
  if (/Hips$/.test(name)) return new Vector4(0, 0, 0, .95)
  if (/Spine2$/.test(name)) return new Vector4(0, 0, 0, .12)
  if (/Spine1$/.test(name)) return new Vector4(0, 0, 0, .35)
  if (/Spine$/.test(name)) return new Vector4(0, 0, 0, .7)
  return new Vector4(0, 0, 0, 0)
}

export function patchScottSoilShader(shader, count) {
  shader.vertexShader = `uniform vec4 uScottRegions[${count}];
uniform float uScottHead[${count}];
uniform vec3 uScottOrigin;
uniform float uScottScale;
varying vec4 vScottRegion;
varying float vScottHead;
varying vec3 vSoilPosition;
varying vec3 vSoilNormal;
` + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
vSoilPosition = (position - uScottOrigin) * uScottScale;
vSoilNormal = normal;
vScottRegion = uScottRegions[int(skinIndex.x)] * skinWeight.x + uScottRegions[int(skinIndex.y)] * skinWeight.y + uScottRegions[int(skinIndex.z)] * skinWeight.z + uScottRegions[int(skinIndex.w)] * skinWeight.w;
vScottHead = uScottHead[int(skinIndex.x)] * skinWeight.x + uScottHead[int(skinIndex.y)] * skinWeight.y + uScottHead[int(skinIndex.z)] * skinWeight.z + uScottHead[int(skinIndex.w)] * skinWeight.w;
`)
  shader.fragmentShader = soilDeclarations + `
uniform vec4 uScottMud;
uniform vec4 uScottFilm;
varying vec4 vScottRegion;
varying float vScottHead;
` + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
float soilCoverage = 0.0;
if (uSoilEnabled > .5) {
  // Bind-space coordinates and existing skin influences only: no new vertex
  // attributes, geometry edits, bones, skin weights or animated transforms.
  float bodyMask = (1.0 - smoothstep(.78, .83, vSoilPosition.y)) * (1.0 - smoothstep(.005, .025, vScottHead));
  float mud = dot(vScottRegion, uScottMud) * bodyMask;
  float film = dot(vScottRegion, uScottFilm) * bodyMask;
  // Only the very top of the helmet can catch a trace. Face, eyes, visor and
  // mandibular region fall outside both this mask and the body mask.
  mud += smoothstep(.965, .995, vSoilPosition.y) * uScottMud.w * .012;
  if (mud + film > .001) {
    vec3 n = normalize(vSoilNormal);
    vec3 p = vSoilPosition + .012 * sin(vSoilPosition.yzx * 17.0);
    float fine = soilPattern(p, n, 38.0);
    float noise = soilNoise(p * 12.0 + 4.1);
    float scottPatch = smoothstep(.76 - mud * .43, .9 - mud * .43, noise);
    soilCoverage = clamp((mud * scottPatch * 1.45 + mud * fine * .52 + film * fine * .48), 0.0, .76);
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(uSoilDark, uSoilLight, soilNoise(p * 26.0) * .8), soilCoverage);
  }
}
`)
  shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, .93, soilCoverage);')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - soilCoverage * .96;')
}

export class ScottSoilLayer {
  constructor(instance) {
    this.instance = instance; this.records = []
    this.uniforms = { uSoilEnabled: { value: 1 }, uScottMud: { value: new Vector4(0, 0, 0, 0) }, uScottFilm: { value: new Vector4(0, 0, 0, 0) }, uSoilDark: { value: new Color('#503d2c') }, uSoilLight: { value: new Color('#987c55') }, uSoilSeed: { value: 5.7 } }
    for (const skin of instance.skins) {
      const box = new Box3().setFromBufferAttribute(skin.mesh.geometry.attributes.position), bones = skin.mesh.skeleton.bones
      const uniforms = { ...this.uniforms, uScottRegions: { value: bones.map(b => scottRegion(b.name)) }, uScottHead: { value: new Float32Array(bones.map(b => /Head|Neck|headfront/.test(b.name) ? 1 : 0)) }, uScottOrigin: { value: new Vector3(0, box.min.y, 0) }, uScottScale: { value: 1 / (box.max.y - box.min.y) } }
      const variants = new Map()
      for (const source of new Set([skin.original, skin.clean])) {
        const material = source.clone(), compile = source.onBeforeCompile, key = source.customProgramCacheKey()
        material.onBeforeCompile = (shader, renderer) => { compile.call(source, shader, renderer); Object.assign(shader.uniforms, uniforms); patchScottSoilShader(shader, bones.length) }
        material.customProgramCacheKey = () => key + '|mospeada-scott-soil-v1-' + bones.length
        variants.set(source, material)
      }
      this.records.push({ mesh: skin.mesh, variants, uniforms })
    }
    this.samples = {}
    for (const [region, pattern] of Object.entries({ boots: /Foot$/, legs: /Leg$/, arms: /ForeArm$/, torso: /Spine$/ })) {
      this.samples[region] = [...instance.bones.values()].filter(b => pattern.test(b.name)).map(bone => ({ bone, position: new Vector3() }))
    }
  }
  install() { for (const r of this.records) if (r.variants.has(r.mesh.material)) r.mesh.material = r.variants.get(r.mesh.material) }
  sampleBody() { for (const samples of Object.values(this.samples)) for (const sample of samples) sample.bone.getWorldPosition(sample.position); return this.samples }
  update(load, config) {
    this.install()
    this.uniforms.uSoilEnabled.value = config.enabled && config.scottEnabled ? 1 : 0
    const keys = ['boots', 'legs', 'arms', 'torso']
    this.uniforms.uScottMud.value.set(...keys.map(k => Math.min(config.maximum, load[k + 'Mud'])))
    this.uniforms.uScottFilm.value.set(...keys.map(k => Math.min(config.maximum, load[k + 'Film'])))
  }
  dispose() {
    for (const r of this.records) for (const [source, material] of r.variants) { if (r.mesh.material === material) r.mesh.material = source; material.dispose() }
  }
}
