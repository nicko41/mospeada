import * as T from 'three'
import { createCycloneLights } from './cycloneLights.js'
import { matchCyclonePaintToBoots } from './cyclonePaint.js'

// Shared imported vehicle instance. The driving controller adds mechanical
// articulation separately; this constructor never creates or modifies Scott.
export const CYCLONE_PRESENTATION_SCALE = 0.88 * 1.07

export function createParkedCyclone(source,options){const steps=createParkedCycloneSteps(source,options);let step;do{step=steps.next()}while(!step.done);return step.value}
export function* createParkedCycloneSteps(source, { scale = CYCLONE_PRESENTATION_SCALE } = {}) {
  const root = new T.Group(), body = new T.Group(), model = source.clone(true), surfaces = []
  root.name = 'Cyclone_riding_vehicle'; body.name = 'Chassis'; root.add(body); body.add(model)
  // Scale the complete imported instance; keep its internal geometry and all
  // relative part transforms untouched. The body remains a metre-based frame.
  model.scale.multiplyScalar(scale)
  const meshes=[];model.traverse(mesh=>{if(mesh.isMesh)meshes.push(mesh)})
  for(const mesh of meshes){
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(m => m.clone()) : mesh.material.clone()
    for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])matchCyclonePaintToBoots(mesh,material)
    if (mesh.userData.sourcePiece === 'rear_sit + rear_sit') {
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        // Neutral charcoal upholstery; the imported vertex tint is brown.
        material.vertexColors = false
        material.color.set('#4c5054')
        material.metalness = 0; material.roughness = 0.98
        material.envMapIntensity = 0.08
        material.userData.animeSurfaceShine = 0.05
      }
    }
    mesh.castShadow = mesh.receiveShadow = true; surfaces.push(mesh);yield
  }
  root.updateMatrixWorld(true)
  const tire = prefix => surfaces.find(mesh => mesh.userData.sourcePiece === prefix + '_Tire_Rubber')
  const f = new T.Box3().setFromObject(tire('Front')), r = new T.Box3().setFromObject(tire('Rear'))
  const fc = f.getCenter(new T.Vector3()), rc = r.getCenter(new T.Vector3())
  const offset = new T.Vector3(-(fc.x + rc.x) / 2, -(f.min.y + r.min.y) / 2, -(fc.z + rc.z) / 2)
  model.position.copy(offset); fc.add(offset); rc.add(offset); root.updateMatrixWorld(true)
  const metrics = { frontZ: fc.z, rearZ: rc.z, frontY: fc.y, rearY: rc.y, frontRadius: (f.max.y - f.min.y) / 2, rearRadius: (r.max.y - r.min.y) / 2, wheelbase: fc.z - rc.z, tireHalfWidth: (f.max.x - f.min.x) / 2 }
  const lighting = createCycloneLights(body, surfaces), sunlight = new T.DirectionalLight('#f1f3df', 0.6)
  sunlight.position.set(4, 7, 3); root.add(sunlight, sunlight.target)
  const articulation = { frontTravel: 0, rearTravel: 0 }
  return { root, body, surfaces, surfaceMaterials:new Map(surfaces.map(mesh=>[mesh,mesh.material])), metrics, lighting, sunlight, articulation, presentationScale: scale, arms: [], hydraulics: [], update(s) { root.position.set(s.x, s.height, s.z); root.rotation.y = s.yaw; body.rotation.x = s.pitch; root.updateMatrixWorld(true) } }
}
