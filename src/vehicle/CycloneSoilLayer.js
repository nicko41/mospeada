import { Box3, Color, Matrix4, Vector2, Vector4 } from 'three'
import { patchSoilShader } from './soilShader.js'
import { bikeSoil,BIKE_SOIL_COVERAGE_MAX } from './equipmentSoilLimit.js'

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
    this.uniforms = { uSoilEnabled: { value: 1 }, uSoilLoad: { value: new Vector4() }, uBikeSoilCoverageMax:{value:BIKE_SOIL_COVERAGE_MAX}, uSoilAxles: { value: new Vector2(rig.metrics.frontZ, rig.metrics.rearZ) }, uSoilDark: { value: new Color('#503d2c') }, uSoilLight: { value: new Color('#987c55') } }
    // Body pieces share one visibility switch; wheels retain the original
    // enable/load uniforms and their exact accumulated bind-space masks.
    this.bodyEnabled = { value: 1 }
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
        const wheel = /^(Front|Rear)_(Tire|Rim|Hub)(_|$)/.test(name)
        const uniforms = { ...this.uniforms, uSoilEnabled: wheel ? this.uniforms.uSoilEnabled : this.bodyEnabled, uSoilBind: { value: bind }, uSoilGain: { value: gain }, uSoilSeed: { value: seed % 173 / 13 } }
        copy.onBeforeCompile = (shader, renderer) => { compile.call(original, shader, renderer); Object.assign(shader.uniforms, uniforms); patchSoilShader(shader) }
        copy.customProgramCacheKey = () => key + '|mospeada-soil-v5'
        return copy
      })
      if (changed) this.records.push({ mesh, source, coated: Array.isArray(source) ? coated : coated[0], owned: coated.filter((m, i) => m !== materials[i]) })
    })
    this.byMesh=new Map(this.records.map(r=>[r.mesh,r]))
  }
  install() { this.installed=true;for (const r of this.records) { r.mesh.material = r.coated; r.owned.forEach(m => { m.needsUpdate = true }) } }
  inheritParts(parts){
    // Exported rear splits retain their source mesh's rest coordinates. Share
    // its exact soil material, bind mask and load; no new shader/material per split.
    for(const p of parts){
      const original=this.byMesh.get(p.source.mesh)
      if(!original||this.byMesh.has(p.mesh))continue
      const record={mesh:p.mesh,source:p.mesh.material,coated:original.coated,owned:[]}
      this.records.push(record);this.byMesh.set(p.mesh,record)
      if(this.installed)p.mesh.material=record.coated
    }
  }
  update(load, config, armor=false) {
    this.uniforms.uSoilEnabled.value = config.enabled && config.accumulation ? 1 : 0
    this.bodyEnabled.value = armor ? 0 : this.uniforms.uSoilEnabled.value
    this.uniforms.uSoilLoad.value.set(...[load.frontMud, load.rearMud, load.frontFilm, load.rearFilm].map(v => bikeSoil(v, config.maximum)))
  }
  dispose() {
    this.installed=false
    for (const r of this.records) { if (r.mesh.material === r.coated) r.mesh.material = r.source; r.owned.forEach(m => m.dispose()) }
  }
}
