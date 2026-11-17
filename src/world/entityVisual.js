import * as THREE from 'three'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { timeOfDayState } from './TimeOfDay'

const ENTITY_DAY_COLOR = new THREE.Color('#414747')
const ENTITY_BODY_OPACITY = 0.82
// Trial switch for animated body shadows; aura layers stay out of shadow passes.
export const ENTITY_CAST_SHADOW = true
export const entityBodyOpacity = () => THREE.MathUtils.lerp(1, ENTITY_BODY_OPACITY, timeOfDayState.value)

// Normal living body. Dissolve effects temporarily manage their own blending.
export function restoreEntityBodySurface(body) {
    const transparent = timeOfDayState.value > 0.001
    body.opacity = transparent ? entityBodyOpacity() : 1
    body.userData.bodyOpacity = entityBodyOpacity()
    if (body.transparent !== transparent || body.depthWrite !== !transparent) {
        body.transparent = transparent
        body.depthWrite = !transparent
        body.needsUpdate = true
    }
}

export function updateEntityDayColor(materials) {
    const body = materials[0]
    const day = timeOfDayState.value
    if (body.userData.dayColor === day) return
    const opacity = entityBodyOpacity()
    body.opacity *= opacity / body.userData.bodyOpacity
    body.userData.bodyOpacity = opacity
    body.userData.dayColor = day
    body.color.copy(ENTITY_DAY_COLOR).multiplyScalar(day)
}

export const ENTITY_MODEL_SCALE = 0.002556
const ZOMBIE_TEST_SCALE = ENTITY_MODEL_SCALE
// Remove either entry (or both) to reduce the extra skinned draws.
const AURA_LAYERS = [{ scale: 1.025, opacity: 0.16 }, { scale: 1.05, opacity: 0.07 }]
// Local Head coordinates, inspected against the FBX's head vertices (+Z faces forward).
const EYE_HEIGHT = 0.615
const EYE_FORWARD = 0.375
const EYE_HALF_SPACING = 0.12

export function createEntityVisual(source, options = {}) {
    const model = clone(source)
    const scale = options.scale ?? ZOMBIE_TEST_SCALE
    const eyes = options.eyes ?? { height: EYE_HEIGHT, forward: EYE_FORWARD,
      halfSpacing: EYE_HALF_SPACING, centerX: -0.005 }
    const mixer = new THREE.AnimationMixer(model)
    // GLB may store an arbitrary action pose. Measure a known idle pose once.
    const poseClip = source.animations.find(clip => clip.name === options.poseClip)
    if (poseClip) { mixer.clipAction(poseClip).play(); mixer.update(0) }
    // Unlit silhouette: ash by day, black by night, independent of flashlight intensity.
    const bodyMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, fog: true, toneMapped: false,
      transparent: true, opacity: entityBodyOpacity(), depthWrite: false })
    bodyMaterial.userData.bodyOpacity = bodyMaterial.opacity
    restoreEntityBodySurface(bodyMaterial)
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true, toneMapped: false })
    const auraMaterials = AURA_LAYERS.map(({ opacity }) => new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity, side: THREE.BackSide,
      depthTest: true, depthWrite: false, fog: true, toneMapped: false,
    }))
    const meshes = []
    let head = null
    model.traverse((object) => {
      if (object.isLight) object.visible = false
      if (!object.isMesh) return
      object.castShadow = ENTITY_CAST_SHADOW
      object.receiveShadow = false
      object.material = bodyMaterial
      meshes.push(object)
      if (object.isSkinnedMesh) {
        object.frustumCulled = false
        head ??= object.skeleton.bones.find((bone) => /^head$/i.test(bone.name))
          ?? object.skeleton.bones.find((bone) => /head/i.test(bone.name) && !/end|top/i.test(bone.name))
      }
    })
    model.updateMatrixWorld(true)
    // Preserve the original placement: measure only the original body, before adding eyes/aura.
    const bounds = new THREE.Box3().setFromObject(model, !!poseClip)
    const center = bounds.getCenter(new THREE.Vector3())
    const offset = [options.centeredRoot ? 0 : -center.x * scale, -bounds.min.y * scale,
      options.centeredRoot ? 0 : -center.z * scale]

    const eyeGeometry = new THREE.SphereGeometry(1, 8, 6)
    if (head) {
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(eyeGeometry, eyeMaterial)
        eye.name = side < 0 ? 'EntityEyeLeft' : 'EntityEyeRight'
        eye.position.set(eyes.centerX + side * eyes.halfSpacing, eyes.height, eyes.forward)
        eye.scale.set(0.043, 0.019, 0.025)
        head.add(eye)
      }
    }

    for (const mesh of meshes) {
      const pivot = mesh.worldToLocal(center.clone())
      AURA_LAYERS.forEach(({ scale }, index) => {
        const shell = mesh.isSkinnedMesh
          ? new THREE.SkinnedMesh(mesh.geometry, auraMaterials[index])
          : new THREE.Mesh(mesh.geometry, auraMaterials[index])
        shell.name = `EntityAura${index}`
        shell.position.copy(pivot).multiplyScalar(1 - scale)
        shell.scale.setScalar(scale)
        shell.castShadow = false
        shell.receiveShadow = false
        shell.frustumCulled = false
        shell.renderOrder = index + 1
        if (mesh.morphTargetInfluences) {
          shell.morphTargetInfluences = mesh.morphTargetInfluences
          shell.morphTargetDictionary = mesh.morphTargetDictionary
        }
        if (mesh.isSkinnedMesh) {
          // One skeleton/animation, shared geometry. No cloned rig or second mixer.
          shell.skeleton = mesh.skeleton
          shell.bindMode = THREE.DetachedBindMode
          shell.bindMatrix.copy(mesh.bindMatrix)
          shell.bindMatrixInverse.copy(mesh.bindMatrixInverse)
          // Use the BODY's skinning space after world matrices update. Using the
          // enlarged shell's inverse would cancel its scale or misalign the skin.
          shell.onBeforeRender = () => {
            shell.bindMatrix.copy(mesh.bindMatrix)
            shell.bindMatrixInverse.copy(mesh.bindMatrixInverse)
          }
        }
        mesh.add(shell)
      })
    }
    if (poseClip) { mixer.stopAllAction(); mixer.uncacheRoot(model) }
    return { model, offset, eyeGeometry, scale,
      materials: [bodyMaterial, eyeMaterial, ...auraMaterials], mixer }
}

