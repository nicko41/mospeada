import { Box3, Color, Matrix4, Vector2, Vector4 } from 'three'
import { patchSoilShader } from './soilShader.js'

const excluded = /Headlight|faro|Display|Windshield|Pieza 30|rear_sit|black-interior|Silenciador|Salida posterior|Button|Lever|Grip|Control_|Central_Shaft|Collar de transición/i
export function soilEligible(mesh, material, bounds) {
  const name = mesh.userData.sourcePiece || mesh.name
  return mesh.isMesh && !mesh.isSkinnedMesh && mesh.visible && material.isMeshStandardMaterial
    && !excluded.test(name) && !material.transparent && !(material.transmission > 0)
    && !/Transparent|Glass/i.test(material.name) && bounds.min.y < .87
    && !(material.emissive?.getHex() && material.emissiveIntensity > 0)
}

export class CycloneSoilLayer {
  constructor(rig) {
    this.rig = rig; this.records = []
    this.uniforms = { uSoilEnabled: { value: 1 }, uSoilLoad: { value: new Vector4() }, uSoilAxles: { value: new Vector2(rig.metrics.frontZ, rig.metrics.rearZ) }, uSoilDark: { value: new Color('#503d2c') }, uSoilLight: { value: new Color('#987c55') } }
    rig.body.updateWorldMatrix(true, true)
    const inverse = rig.body.matrixWorld.clone().invert()
    rig.body.traverse(mesh => {
      if (!mesh.isMesh || !mesh.geometry.attributes.position) return
      const bind = new Matrix4().multiplyMatrices(inverse, mesh.matrixWorld)
      const bounds = new Box3().setFromBufferAttribute(mesh.geometry.attributes.position).applyMatrix4(bind)
      const source = mesh.material, materials = Array.isArray(source) ? source : [source]
      let changed = false
      const name = mesh.userData.sourcePiece || mesh.name
      let seed = 0; for (const char of name + bounds.min.toArray().join(',')) seed = (seed * 31 + char.charCodeAt(0)) >>> 0
      const coated = materials.map(original => {
        if (!soilEligible(mesh, original, bounds)) return original
        changed = true
        const copy = original.clone(), compile = original.onBeforeCompile, key = original.customProgramCacheKey()
        const gain = /Tire|Rubber/.test(name) ? .42 : original.metalness > .4 ? .75 : 1
        const uniforms = { ...this.uniforms, uSoilBind: { value: bind }, uSoilGain: { value: gain }, uSoilSeed: { value: seed % 173 / 13 } }
        copy.onBeforeCompile = (shader, renderer) => { compile.call(original, shader, renderer); Object.assign(shader.uniforms, uniforms); patchSoilShader(shader) }
        copy.customProgramCacheKey = () => key + '|mospeada-soil-v2'
        return copy
      })
      if (changed) this.records.push({ mesh, source, coated: Array.isArray(source) ? coated : coated[0], owned: coated.filter((m, i) => m !== materials[i]) })
    })
  }
  install() { for (const r of this.records) { r.mesh.material = r.coated; r.owned.forEach(m => { m.needsUpdate = true }) } }
  update(load, config) {
    this.uniforms.uSoilEnabled.value = config.enabled && config.accumulation ? 1 : 0
    this.uniforms.uSoilLoad.value.set(...[load.frontMud, load.rearMud, load.frontFilm, load.rearFilm].map(v => Math.min(v, config.maximum)))
  }
  dispose() {
    for (const r of this.records) { if (r.mesh.material === r.coated) r.mesh.material = r.source; r.owned.forEach(m => m.dispose()) }
  }
}
