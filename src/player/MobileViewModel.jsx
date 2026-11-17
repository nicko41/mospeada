import { isGameInputActive } from './touchInput'
import { useEffect, useMemo, useRef } from 'react'
import { createPortal, useFrame, useLoader, useThree } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as THREE from 'three'
import { phoneLightState } from './PhoneLight'
import { MOBILE_POSITION, MOBILE_SCALE } from './flashlightConfig'
import { mobileClockTime } from './mobileClock'

export default function MobileViewModel() {
  const asset = useLoader(GLTFLoader, '/models/mobile.glb')
  const screenImage = useLoader(THREE.TextureLoader, `${import.meta.env.BASE_URL}textures/mobile/mobile-screen-clock.png`)
  const { camera, scene } = useThree()
  const pivot = useRef()
  const elapsedSeconds = useRef(0)
  const { model, materials, geometries, screenTexture, updateClock } = useMemo(() => {
    const model = asset.scene.clone(true), shared = new Map()
    const geometries = []
    const canvas = document.createElement('canvas')
    canvas.width = screenImage.image.width
    canvas.height = screenImage.image.height
    const context = canvas.getContext('2d')
    const screenTexture = new THREE.CanvasTexture(canvas)
    screenTexture.colorSpace = THREE.SRGBColorSpace
    let displayedTime = null
    const updateClock = seconds => {
      const time = mobileClockTime(seconds)
      if (time === displayedTime) return
      displayedTime = time
      context.drawImage(screenImage.image, 0, 0, canvas.width, canvas.height)
      context.font = `300 ${Math.round(canvas.height * 0.09)}px Arial, sans-serif`
      context.textAlign = 'center'
      context.textBaseline = 'alphabetic'
      context.fillStyle = '#ffffff'
      context.fillText(time, canvas.width * 0.5, canvas.height * 0.225)
      screenTexture.needsUpdate = true
    }
    updateClock(elapsedSeconds.current)
    const screenMaterial = new THREE.MeshBasicMaterial({
      map: screenTexture, color: '#cccccc', toneMapped: false, fog: false,
      depthTest: false, depthWrite: false,
      // Match the viewmodel's late render pass; overwrite the world completely.
      transparent: true, opacity: 1, blending: THREE.NoBlending,
    })
    model.rotation.set(Math.PI / 2, 0, Math.PI / 2, 'ZYX')
    model.updateMatrixWorld(true)
    const center = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3())
    model.position.sub(center)
    model.traverse(mesh => {
      if (!mesh.isMesh) return
      const convert = source => {
        if (!shared.has(source)) shared.set(source, new THREE.MeshBasicMaterial({
          map: source.map, color: '#757d80', fog: false, depthTest: false,
          depthWrite: false, transparent: true,
        }))
        return shared.get(source)
      }
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material)
      // This GLB's display is a separate quad within the single body mesh.
      // Clone its geometry so the cached model and body atlas stay untouched.
      const geometry = mesh.geometry.clone()
      const positions = geometry.attributes.position
      const uv = geometry.attributes.uv
      const screenVertices = new Set()
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i)
        if (y > 2.76 && Math.abs(x) <= 20.19 && Math.abs(z) <= 12.62
          && uv.getX(i) < 0.4 && uv.getY(i) < 0.2) {
          screenVertices.add(i)
          // After the model rotation, +X is up and +Z is screen-right.
          uv.setXY(i, (z + 12.611) / 25.222, (x + 20.186) / 40.372)
        }
      }
      const bodyIndices = [], screenIndices = []
      for (let i = 0; i < geometry.index.count; i += 3) {
        const face = [geometry.index.getX(i), geometry.index.getX(i + 1), geometry.index.getX(i + 2)]
        const target = face.every(index => screenVertices.has(index)) ? screenIndices : bodyIndices
        target.push(...face)
      }
      geometry.setIndex([...bodyIndices, ...screenIndices])
      geometry.clearGroups()
      geometry.addGroup(0, bodyIndices.length, 0)
      geometry.addGroup(bodyIndices.length, screenIndices.length, 1)
      uv.needsUpdate = true
      mesh.geometry = geometry
      geometries.push(geometry)
      mesh.material = [mesh.material, screenMaterial]
      mesh.castShadow = mesh.receiveShadow = false
      mesh.frustumCulled = false
      mesh.renderOrder = 1001
    })
    return { model, materials: [...shared.values(), screenMaterial], geometries, screenTexture, updateClock }
  }, [asset, screenImage])
  useEffect(() => {
    if (!camera.parent) scene.add(camera)
    return () => {
      materials.forEach(material => material.dispose())
      geometries.forEach(geometry => geometry.dispose())
      screenTexture.dispose()
    }
  }, [camera, scene, materials, geometries, screenTexture])
  useFrame((_, delta) => {
    if (isGameInputActive() && document.hasFocus() && !document.hidden) elapsedSeconds.current += delta
    updateClock(elapsedSeconds.current)
    if (!pivot.current) return
    const raised = phoneLightState.raised
    pivot.current.visible = raised > 0.001
    pivot.current.position.set(MOBILE_POSITION[0], MOBILE_POSITION[1] - (1 - raised) * 0.45, MOBILE_POSITION[2])
    pivot.current.rotation.x = (1 - raised) * -0.7
    pivot.current.rotation.z = 0.06
  }, -0.35)
  return createPortal(<group ref={pivot} visible={false}>
    <group scale={MOBILE_SCALE}><primitive object={model} dispose={null} /></group>
  </group>, camera)
}
