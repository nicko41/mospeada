import {useGLTF} from '../loading/resources.js'
import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useFrame } from '@react-three/fiber'

import * as THREE from 'three'
import { timeOfDayState } from './TimeOfDay'
import { registerColliders, placedBox } from '../player/collisionWorld'
import { createInteriorGrimeTexture, createWeatheredTexture } from './hutWeathering'
import { highwayLiftAt } from './sectors/highwayProfile'
import { getCasetaScene, subscribeCasetaScene } from '../narrative/casetaScene'

function Part({ position, size, material, glass = false, rotation }) {
  return (
    <mesh position={position} rotation={rotation} castShadow={!glass} receiveShadow={!glass}>
      <boxGeometry args={size} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}

function BrokenFrontPane({ material }) {
  const geometry = useMemo(() => {
    const outline = new THREE.Shape()
    outline.moveTo(-1.11, -0.6)
    outline.lineTo(1.11, -0.6)
    outline.lineTo(1.11, 0.6)
    outline.lineTo(-1.11, 0.6)
    outline.closePath()
    const opening = new THREE.Path()
    opening.moveTo(-0.54, -0.28)
    opening.lineTo(-0.63, 0.19)
    opening.lineTo(-0.23, 0.08)
    opening.lineTo(0.08, 0.43)
    opening.lineTo(0.26, 0.13)
    opening.lineTo(0.74, 0.31)
    opening.lineTo(0.81, -0.18)
    opening.lineTo(0.38, -0.07)
    opening.lineTo(0.14, -0.44)
    opening.closePath()
    outline.holes.push(opening)
    const pane = new THREE.ShapeGeometry(outline)
    const uv = pane.getAttribute('uv')
    for (let index = 0; index < uv.count; index += 1) {
      uv.setXY(index, (uv.getX(index) + 1.11) / 2.22, (uv.getY(index) + 0.6) / 1.2)
    }
    return pane
  }, [])
  return <mesh position={[-0.64, 2.13, 1.529]} geometry={geometry} material={material} />
}

function BrokenSidePane({ material, position }) {
  const geometry = useMemo(() => {
    const vertices = new Float32Array([
      0, -0.6, -0.69, 0, -0.6, 0.69, 0, -0.36, -0.42,
      0, -0.6, 0.69, 0, -0.24, 0.69, 0, -0.36, -0.42,
      0, 0.6, -0.69, 0, 0.6, 0.69, 0, 0.41, -0.28,
      0, 0.6, 0.69, 0, 0.32, 0.43, 0, 0.41, -0.28,
      0, -0.6, -0.69, 0, -0.36, -0.42, 0, 0.13, -0.69,
    ])
    const shape = new THREE.BufferGeometry()
    shape.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
    shape.computeVertexNormals()
    return shape
  }, [])
  return <mesh position={position} geometry={geometry} material={material} />
}

function WindowCrack() {
  const geometry = useMemo(() => {
    const segments = [
      [-0.25, 0.18, -0.07, 0.07], [-0.07, 0.07, 0.12, -0.03],
      [0.12, -0.03, 0.38, -0.22], [0.38, -0.22, 0.54, -0.38],
      [-0.07, 0.07, -0.05, -0.21], [-0.05, -0.21, -0.24, -0.48],
      [0.12, -0.03, 0.26, 0.28], [0.26, 0.28, 0.44, 0.43],
      [-0.25, 0.18, -0.52, 0.4],
    ]
    const positions = new Float32Array(segments.flatMap(([x1, y1, x2, y2]) => [
      x1, y1, 0, x2, y2, 0,
    ]))
    const lines = new THREE.BufferGeometry()
    lines.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return lines
  }, [])
  return (
    <lineSegments position={[-1.829, 2.13, -0.75]} rotation-y={Math.PI / 2} geometry={geometry}>
      <lineBasicMaterial color="#8d9690" transparent opacity={0.3} depthWrite={false} />
    </lineSegments>
  )
}

function OvergrownBase() {
  const tufts = useMemo(() => {
    const items = []
    for (let index = 0; index < 44; index += 1) {
      const side = index % 4
      const along = (Math.sin(index * 12.7) * 0.5 + 0.5) * 2 - 1
      const x = side < 2 ? along * 2.13 : (side === 2 ? -2.14 : 2.14)
      const z = side < 2 ? (side === 0 ? -1.82 : 1.82) : along * 1.82
      items.push({ x, z, height: 0.17 + (index % 7) * 0.052 })
    }
    return items
  }, [])
  return tufts.map(({ x, z, height }, index) => (
    <mesh key={index} position={[x, height * 0.5, z]} rotation-z={Math.sin(index * 3.1) * 0.24}>
      <coneGeometry args={[0.055, height, 3]} />
      <meshLambertMaterial color={index % 3 === 0 ? '#343b2b' : '#3a3d2e'} side={THREE.DoubleSide} />
    </mesh>
  ))
}

function MudAtBase() {
  const patches = useMemo(() => {
    const shapes = []
    for (let index = 0; index < 9; index += 1) {
      const angle = index * 2.39
      const centerX = Math.cos(angle) * 2.09
      const centerZ = Math.sin(angle) * 1.79
      const vertices = [centerX, 0.009, centerZ]
      for (let corner = 0; corner <= 7; corner += 1) {
        const direction = corner * Math.PI * 2 / 7
        const radius = 0.34 + Math.sin(index * 6.1 + corner * 2.7) * 0.12
        vertices.push(centerX + Math.cos(direction) * radius, 0.009,
          centerZ + Math.sin(direction) * radius * 0.72)
      }
      const triangles = []
      for (let corner = 1; corner < 8; corner += 1) {
        triangles.push(0, corner, corner + 1)
      }
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
      geometry.setIndex(triangles)
      geometry.computeVertexNormals()
      shapes.push(geometry)
    }
    return shapes
  }, [])
  return patches.map((geometry, index) => (
    <mesh key={index} geometry={geometry}>
      <meshLambertMaterial color={index % 3 === 0 ? '#313a31' : '#292e28'} side={THREE.DoubleSide} />
    </mesh>
  ))
}

function InteriorFluorescent({ worldPosition }) {
  const light = useRef()
  const distantGlow = useRef()
  const glowMap = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    const context = canvas.getContext('2d')
    const gradient = context.createRadialGradient(32, 32, 3, 32, 32, 31)
    gradient.addColorStop(0, 'rgba(235,243,238,0.9)')
    gradient.addColorStop(0.3, 'rgba(214,226,220,0.42)')
    gradient.addColorStop(1, 'rgba(214,226,220,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 64, 64)
    return new THREE.CanvasTexture(canvas)
  }, [])
  useFrame(({ camera }) => {
    light.current.intensity = THREE.MathUtils.lerp(20, 1.2, timeOfDayState.value)
    const distance = Math.hypot(camera.position.x - worldPosition[0], camera.position.z - worldPosition[2])
    const crestFade = THREE.MathUtils.smoothstep(highwayLiftAt(camera.position.x, camera.position.z), 0.35, 1.75)
    distantGlow.current.opacity = 0.8 * (1 - timeOfDayState.value)
      * THREE.MathUtils.smoothstep(distance, 12, 32) * crestFade
  })

  return <group>
    <mesh position={[0, 2.77, 0.12]}>
      <boxGeometry args={[1.49, 0.105, 0.15]} />
      <meshStandardMaterial color="#515952" roughness={1} metalness={0.12} />
    </mesh>
    {[-0.7, 0.7].map((x) => <mesh key={x} position={[x, 2.63, 0.12]} rotation-z={Math.PI / 2}>
      <cylinderGeometry args={[0.034, 0.034, 0.075, 8]} />
      <meshStandardMaterial color="#747a72" roughness={0.9} metalness={0.1} />
    </mesh>)}
    <mesh position={[0, 2.63, 0.12]} rotation-z={Math.PI / 2}>
      <cylinderGeometry args={[0.027, 0.027, 1.34, 10]} />
      <meshBasicMaterial color="#d0d9d4" toneMapped={false} fog={false} />
    </mesh>
    <mesh position={[0, 2.63, 0.12]} rotation-z={Math.PI / 2} renderOrder={5}>
      <cylinderGeometry args={[0.095, 0.095, 1.3, 10, 1, true]} />
      <meshBasicMaterial color="#d3ddd7" transparent opacity={0.055} depthWrite={false}
        fog={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
    </mesh>
    <pointLight ref={light} position={[0, 2.35, 0.12]} color="#d9e0dc"
      intensity={20} distance={5.5} decay={2} castShadow={false} />
    <mesh position={[0, 2.63, 0.12]} renderOrder={12}>
      <planeGeometry args={[2.5, 1.35]} />
      <meshBasicMaterial ref={distantGlow} map={glowMap} transparent opacity={0.8}
        depthTest={false} depthWrite={false} fog={false} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  </group>
}

function DeskPhone() {
  const { scene } = useGLTF('/models/phone.glb')
  const handsetInUse = useSyncExternalStore(subscribeCasetaScene, () => {
    const narrative = getCasetaScene()
    return narrative.phoneTestInProgress || (narrative.phoneAnswered && !narrative.phoneCallFinished)
  })
  const phone = useMemo(() => {
    const model = scene.clone(true)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 256
    const context = canvas.getContext('2d')
    context.fillStyle = '#d6d7d5'
    context.fillRect(0, 0, 256, 256)
    for (let index = 0; index < 95; index += 1) {
      const x = (Math.sin(index * 38.71) * 0.5 + 0.5) * 256
      const y = (Math.sin(index * 17.13) * 0.5 + 0.5) * 256
      const radius = 3 + (Math.sin(index * 5.93) * 0.5 + 0.5) * 22
      const stain = context.createRadialGradient(x, y, 0, x, y, radius)
      stain.addColorStop(0, index % 8 === 0 ? 'rgba(93,62,44,0.42)' : 'rgba(56,59,56,0.42)')
      stain.addColorStop(1, 'rgba(56,59,56,0)')
      context.fillStyle = stain
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
    }
    const grime = new THREE.CanvasTexture(canvas)
    grime.colorSpace = THREE.SRGBColorSpace
    grime.anisotropy = 4
    model.traverse((child) => {
      if (!child.isMesh) return
      const weather = (original) => {
        if (original.name === 'Screen') {
          return new THREE.MeshBasicMaterial({ name: 'Screen', color: '#496d50', fog: true })
        }
        const color = original.color.clone()
        if (original.name === 'Light grey') color.set('#858b88')
        return new THREE.MeshBasicMaterial({ name: original.name, map: grime, color, fog: true })
      }
      child.material = Array.isArray(child.material) ? child.material.map(weather) : weather(child.material)
    })
    const bounds = new THREE.Box3().setFromObject(model)
    const size = bounds.getSize(new THREE.Vector3())
    const center = bounds.getCenter(new THREE.Vector3())
    const scale = Math.min(0.31 / size.x, 0.28 / size.y, 0.52 / size.z)
    model.scale.setScalar(scale)
    model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale)
    return model
  }, [scene])
  useEffect(() => {
    const handle = phone.getObjectByName('Handle')
    if (handle) handle.visible = !handsetInUse
  }, [phone, handsetInUse])

  return <group position={[1.28, 1.08, -0.32]} rotation-y={-0.18}>
    <primitive object={phone} />
  </group>
}

useGLTF.preload('/models/phone.glb')

function LostLetter() {
  const writing = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 512
    const context = canvas.getContext('2d')
    context.beginPath()
    context.moveTo(15, 18)
    context.lineTo(482, 13)
    context.lineTo(499, 66)
    context.lineTo(489, 475)
    context.lineTo(443, 501)
    context.lineTo(25, 492)
    context.lineTo(9, 443)
    context.closePath()
    context.clip()
    context.fillStyle = '#b9aa91'
    context.fillRect(0, 0, 512, 512)
    for (let index = 0; index < 30; index += 1) {
      const x = (Math.sin(index * 17.3) * 0.5 + 0.5) * 512
      const y = (Math.sin(index * 31.1) * 0.5 + 0.5) * 512
      const radius = 15 + (index % 7) * 9
      const stain = context.createRadialGradient(x, y, 0, x, y, radius)
      stain.addColorStop(0, index % 5 === 0 ? 'rgba(82,56,36,0.38)' : 'rgba(76,69,54,0.25)')
      stain.addColorStop(1, 'rgba(76,69,54,0)')
      context.fillStyle = stain
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
    }
    // Native handwriting faces; bake the uneven ink into the existing texture once.
    context.fillStyle = '#232625'
    context.font = '30px "Ink Free", "Segoe Print", "Bradley Hand", cursive'
    ;['A quien encuentre esto...', 'La ruta sigue, pero', 'ya no sé cuánto falta.', 'No esperen por mí.'].forEach((line, index) => {
      context.save()
      context.translate(42 + (index % 2) * 9, 112 + index * 71)
      context.rotate([-0.025, 0.012, -0.018, -0.035][index])
      // Keep the longest line inside the worn paper edges on every fallback font.
      context.scale(Math.min(1, 400 / (context.measureText(line).width + line.length)), 1)
      let x = 0
      Array.from(line).forEach((letter, letterIndex) => {
        const phase = index * 19.7 + letterIndex * 2.31
        context.save()
        context.translate(x, Math.sin(phase) * 0.85 + Math.sin(letterIndex * 0.6) * 1.1)
        context.rotate(Math.sin(phase * 1.7) * 0.035)
        context.globalAlpha = 0.67 + (Math.sin(phase * 0.9) * 0.5 + 0.5) * 0.14
        context.fillText(letter, 0, 0)
        context.restore()
        x += context.measureText(letter).width + 0.25 + Math.sin(phase) * 0.35
      })
      context.restore()
    })
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }, [])
  return <group position={[-0.93, 0.78, -0.3]} rotation-y={0.12}>
    <mesh position={[0, 0.004, 0]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[0.39, 0.31]} />
      <meshBasicMaterial map={writing} transparent alphaTest={0.05} side={THREE.DoubleSide} />
    </mesh>
  </group>
}

export default function GuardHut({ position = [0, 0, 0], rotation = 0 }) {
  const letterAvailable = useSyncExternalStore(subscribeCasetaScene, () => getCasetaScene().highwayAnomalySeen)
  const [worldX, worldY, worldZ] = position
  useLayoutEffect(() => {
    // Separate wall primitives leave the real front doorway open.
    const parts = [
      [[0, 0.12, 0], [4.3, 0.24, 3.7]],
      [[0, 0.26, 0], [3.45, 0.055, 2.85]],
      [[-1.8, 1.54, 0], [0.13, 2.55, 3.1]],
      [[1.8, 1.54, 0], [0.13, 2.55, 3.1]],
      [[0, 1.54, -1.5], [3.6, 2.55, 0.13]],
      [[-0.64, 1.54, 1.5], [2.28, 2.55, 0.13]],
      [[0, 2.78, 1.5], [3.6, 0.13, 0.13]],
      [[1.15, 0.3, 1.54], [1.2, 0.08, 0.24]],
      [[0, 2.95, 0], [4.15, 0.25, 3.55]],
      [[-0.93, 0.86, -0.3], [0.67, 1.16, 0.65]],
      [[0.43, 0.86, -0.53], [0.67, 1.16, 0.65]],
      [[-0.35, 0.70, -1.12], [2.35, 0.85, 0.4]],
      [[1.28, 0.67, -0.25], [0.38, 0.8, 1.7]],
    ]
    return registerColliders(parts.map(([center, size]) =>
      placedBox(center, size, [worldX, worldY, worldZ], rotation)))
  }, [worldX, worldY, worldZ, rotation])
  const materials = useMemo(() => ({
    concrete: new THREE.MeshStandardMaterial({ map: createWeatheredTexture('concrete'), roughness: 1 }),
    metal: Array.from({ length: 3 }, (_, index) => new THREE.MeshStandardMaterial({ map: createWeatheredTexture('metal', index), emissive: '#39413e', emissiveIntensity: 0, roughness: 1, metalness: 0.03 })),
    panel: Array.from({ length: 3 }, (_, index) => new THREE.MeshStandardMaterial({ map: createWeatheredTexture('panel', index), emissive: '#777d73', emissiveIntensity: 0, roughness: 1 })),
    roof: new THREE.MeshStandardMaterial({ map: createWeatheredTexture('roof'), emissive: '#555e5a', emissiveIntensity: 0, roughness: 1, metalness: 0 }),
    glass: new THREE.MeshStandardMaterial({
      map: createWeatheredTexture('glass'), color: '#46504e', roughness: 0.82, metalness: 0,
      transparent: true, opacity: 0.76, depthWrite: false, side: THREE.DoubleSide,
    }),
    interior: new THREE.MeshStandardMaterial({ color: '#353b38', roughness: 1 }),
    dirtyFloor: new THREE.MeshStandardMaterial({ map: createInteriorGrimeTexture('floor'), roughness: 1, metalness: 0 }),
    dirtySeat: new THREE.MeshStandardMaterial({ map: createInteriorGrimeTexture('seat'), roughness: 1, metalness: 0 }),
    damp: new THREE.MeshStandardMaterial({ color: '#343a35', roughness: 1 }),
    rust: new THREE.MeshStandardMaterial({ color: '#705341', roughness: 1, metalness: 0 }),
  }), [])

  useFrame(() => {
    const day = timeOfDayState.value
    materials.panel.forEach((panel) => { panel.emissiveIntensity = day * 0.055 })
    materials.metal.forEach((metal) => { metal.emissiveIntensity = day * 0.035 })
    materials.roof.emissiveIntensity = day * 0.09
  })

  const posts = [
    [-1.8, -1.5], [1.8, -1.5], [-1.8, 1.5], [1.8, 1.5],
    [-0.6, -1.5], [0.6, -1.5], [-0.6, 1.5], [0.52, 1.5],
    [-1.8, 0], [1.8, 0],
  ]
  const sidePanels = [-1, 1]

  return (
    <group position={position} rotation-y={rotation}>
      <Part position={[0, 0.12, 0]} size={[4.3, 0.24, 3.7]} material={materials.concrete} />
      <Part position={[0, 0.055, 0]} size={[4.31, 0.065, 3.71]} material={materials.damp} />
      <Part position={[0, 0.26, 0]} size={[3.45, 0.055, 2.85]} material={materials.dirtyFloor} />
      <MudAtBase />
      <OvergrownBase />

      {posts.map(([x, z], index) => (
        <Part key={`post-${x}-${z}`} position={[x, 1.54, z]} size={[0.11, 2.55, 0.11]} material={materials.metal[index % 3]} />
      ))}

      {sidePanels.map((side) => (
        <group key={`side-${side}`}>
          {[-0.75, 0.75].map((z) => (
            <group key={`side-${side}-${z}`}>
              <Part position={[side * 1.8, 0.86, z]} size={[0.065, 1.16, 1.39]}
                material={materials.panel[side === 1 && z === -0.75 ? 2 : z === 0.75 ? 1 : 0]}
                rotation={side === 1 && z === -0.75 ? [0, 0, 0.025] : undefined} />
              {side === 1 && z === 0.75
                ? <BrokenSidePane position={[side * 1.8, 2.13, z]} material={materials.glass} />
                : <Part position={[side * 1.8, 2.13, z]} size={[0.045, 1.2, 1.39]} material={materials.glass} glass />}
            </group>
          ))}
          <Part position={[side * 1.8, 1.48, 0]} size={[0.13, 0.09, 3]} material={materials.metal[side === 1 ? 1 : 0]} />
          <Part position={[side * 1.8, 2.78, 0]} size={[0.13, 0.13, 3]} material={materials.metal[2]} />
        </group>
      ))}

      {[-1.2, 0, 1.2].map((x) => (
        <group key={`back-${x}`}>
          <Part position={[x, 0.86, -1.5]} size={[1.11, 1.16, 0.065]} material={materials.panel[x === 0 ? 2 : x < 0 ? 1 : 0]} />
          <Part position={[x, 2.13, -1.5]} size={[1.11, 1.2, 0.045]} material={materials.glass} glass />
        </group>
      ))}
      <Part position={[0, 1.48, -1.5]} size={[3.6, 0.09, 0.13]} material={materials.metal[1]} />
      <Part position={[0, 2.78, -1.5]} size={[3.6, 0.13, 0.13]} material={materials.metal[2]} />

      <Part position={[-0.64, 0.86, 1.5]} size={[2.22, 1.16, 0.065]} material={materials.panel[2]} rotation={[0.012, 0, -0.018]} />
      <BrokenFrontPane material={materials.glass} />
      <WindowCrack />
      <Part position={[-0.64, 1.48, 1.5]} size={[2.22, 0.09, 0.13]} material={materials.metal[1]} />
      <Part position={[0, 2.78, 1.5]} size={[3.6, 0.13, 0.13]} material={materials.metal[2]} />
      <Part position={[1.15, 0.3, 1.54]} size={[1.2, 0.08, 0.24]} material={materials.concrete} />

      <Part position={[0, 2.95, 0]} size={[4.15, 0.25, 3.55]} material={materials.roof} />
      <InteriorFluorescent worldPosition={position} />
      <Part position={[0, 3.09, 0]} size={[4.18, 0.045, 3.58]} material={materials.metal[2]} />
      <Part position={[0, 2.84, 1.75]} size={[3.95, 0.055, 0.04]} material={materials.damp} />
      <Part position={[2.05, 2.84, 0]} size={[0.04, 0.055, 3.36]} material={materials.damp} />
      {[-1.62, -0.34, 1.36].map((x, index) => (
        <Part key={`rust-edge-${index}`} position={[x, 2.836, 1.778]}
          size={[0.19 + index * 0.05, 0.027, 0.012]} material={materials.rust} />
      ))}

      <Part position={[-0.35, 1.08, -1.12]} size={[2.35, 0.1, 0.4]} material={materials.interior} rotation={[0.025, 0, -0.06]} />
      <Part position={[1.28, 1.02, -0.25]} size={[0.38, 0.1, 1.7]} material={materials.interior} rotation={[0, 0, 0.12]} />
      <DeskPhone />
      {letterAvailable && <LostLetter />}
      <Part position={[0.86, 0.66, -1.05]} size={[0.62, 0.035, 0.9]} material={materials.panel[1]} rotation={[0.2, 0.15, -0.24]} />
      {[[-0.93, -0.3, -0.08], [0.43, -0.53, 0.1]].map(([x, z, lean], index) => (
        <group key={`seat-${index}`} position={[x, 0, z]} rotation-y={index * -0.2}>
          <Part position={[0, 0.72, 0]} size={[0.67, 0.1, 0.62]} material={materials.dirtySeat} rotation={[0, 0, lean]} />
          <Part position={[0, 1.08, -0.27]} size={[0.67, 0.72, 0.09]} material={materials.dirtySeat} rotation={[0.08, 0, lean]} />
          {[-0.25, 0.25].map((legX) => [-0.22, 0.22].map((legZ) => (
            <Part key={`${legX}-${legZ}`} position={[legX, 0.47, legZ]} size={[0.055, 0.43, 0.055]} material={materials.metal[1]} />
          )))}
        </group>
      ))}
    </group>
  )
}
