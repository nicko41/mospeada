import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useFieldGroundMaterial } from '../materials/groundMaterials'
import { timeOfDayState } from '../TimeOfDay'
import { terrainHeight } from '../terrain'
import { createWeatheredTexture } from '../hutWeathering'
import { getWalkableHeightAt } from '../../player/getWalkableHeight'
import {
  HIGHWAY_ROAD_HEIGHT, HIGHWAY_Z, INFINITE_HIGHWAY_START_X,
  infiniteHighwayHeightAt,
} from './highwayProfile'
import { highwayFogState } from './highwayFogState'
import { recordHighwaySigns } from '../../narrative/casetaScene'
import { FIRST_SIGN_X, SIGN_SPACING, SIGNS, signXAt, highwaySequence } from '../../narrative/highwaySequence'
import { highwayPoleVisibility, POLE_FADE_RESPONSE } from './highwayPoleFade'

// Narrative controls: edit these without changing the recycled geometry.
const CHUNK_LENGTH = 72
const ACTIVE_CHUNKS = 4
const TOWN_DISTANCE = 105
const SIGN_LIGHT_X_POSITIONS = [-60, -36, -12, 12, 36, 60]

const seamGround = (z) => terrainHeight(INFINITE_HIGHWAY_START_X, z)
const extensionGround = (_x, z) => seamGround(z)

function stripGeometry(section, attributeName, divisions = 18) {
  const vertices = []
  const uvs = []
  const blends = []
  const indices = []
  const width = section.length
  for (let row = 0; row <= divisions; row += 1) {
    const x = -CHUNK_LENGTH * row / divisions
    for (const point of section) {
      const z = HIGHWAY_Z + point.z
      vertices.push(x, point.y(z), z)
      uvs.push((INFINITE_HIGHWAY_START_X + x) / point.tile, z / point.tile)
      blends.push(point.blend ?? 1)
    }
    if (row === divisions) continue
    const current = row * width
    for (let column = 0; column < width - 1; column += 1) {
      indices.push(current + column, current + width + column, current + column + 1)
      indices.push(current + column + 1, current + width + column, current + width + column + 1)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  if (attributeName) geometry.setAttribute(attributeName, new THREE.Float32BufferAttribute(blends, 1))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function makeChunkGeometry() {
  // Keep the field beneath the fog horizon, including shallow views along the shoulders.
  const field = stripGeometry([-240, -160, -80, -56, 0, 56, 80, 160, 240].map((z) => ({
    z, y: (worldZ) => seamGround(worldZ) - 0.012, tile: 4,
  })))
  const embankment = stripGeometry([
    [-27, 0], [-24, 0.32], [-22.6, 0.78], [-19, 1], [-16, 1], [-14, 1],
    [14, 1], [16, 1], [19, 1], [22.6, 0.78], [24, 0.32], [27, 0],
  ].map(([z, blend]) => ({
    z, blend, tile: 4,
    y: (worldZ) => infiniteHighwayHeightAt(INFINITE_HIGHWAY_START_X - 1, worldZ)
      + 0.012 - (Math.abs(z) < 15 ? 0.075 : 0),
  })), 'aEmbankmentBlend')
  const asphalt = [-1, 1].map((side) => stripGeometry((side < 0
    ? [[-11.16, 0], [-10, 1], [-2.9, 1], [-1.75, 0]]
    : [[1.75, 0], [2.9, 1], [10, 1], [11.16, 0]])
    .map(([z, blend]) => ({
      z, blend, tile: 7,
      y: (worldZ) => seamGround(worldZ) + HIGHWAY_ROAD_HEIGHT + 0.06,
    })), 'aRoadBlend'))
  const markings = []
  const addLine = (zOffset, from, to) => {
    const z = HIGHWAY_Z + zOffset
    const y = seamGround(z) + HIGHWAY_ROAD_HEIGHT + 0.075
    const geometry = new THREE.PlaneGeometry(to - from, 0.11)
    geometry.rotateX(-Math.PI / 2)
    geometry.translate((from + to) * 0.5, y, z)
    const paintSpans = []
    for (let index = 0; index < geometry.attributes.position.count; index += 1) {
      paintSpans.push(to - from, Math.abs(zOffset) === 6.25 ? 1 : 0)
    }
    geometry.setAttribute('aPaintSpan', new THREE.Float32BufferAttribute(paintSpans, 2))
    markings.push(geometry)
  }
  for (const z of [-9.82, -1.78, 1.78, 9.82]) addLine(z, -CHUNK_LENGTH, 0)
  for (const z of [-6.25, 6.25]) {
    for (let x = -CHUNK_LENGTH; x < 0; x += 9) addLine(z, x, Math.min(x + 5, 0))
  }
  const marking = new THREE.BufferGeometry()
  const positions = []
  const uvs = []
  const paintSpans = []
  const indices = []
  for (const piece of markings) {
    const offset = positions.length / 3
    positions.push(...piece.attributes.position.array)
    uvs.push(...piece.attributes.uv.array)
    paintSpans.push(...piece.attributes.aPaintSpan.array)
    indices.push(...Array.from(piece.index.array, (index) => index + offset))
    piece.dispose()
  }
  marking.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  marking.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  marking.setAttribute('aPaintSpan', new THREE.Float32BufferAttribute(paintSpans, 2))
  marking.setIndex(indices)
  marking.computeVertexNormals()
  return { field, embankment, asphalt, marking }
}

function distanceForSign(index) {
  return SIGNS[index].distance
}

const SIGN_CORNER_RADIUS = 0.055
const signPanelShape = new THREE.Shape()
signPanelShape.moveTo(-1.8 + SIGN_CORNER_RADIUS, -0.81)
signPanelShape.lineTo(1.8 - SIGN_CORNER_RADIUS, -0.81)
signPanelShape.quadraticCurveTo(1.8, -0.81, 1.8, -0.81 + SIGN_CORNER_RADIUS)
signPanelShape.lineTo(1.8, 0.81 - SIGN_CORNER_RADIUS)
signPanelShape.quadraticCurveTo(1.8, 0.81, 1.8 - SIGN_CORNER_RADIUS, 0.81)
signPanelShape.lineTo(-1.8 + SIGN_CORNER_RADIUS, 0.81)
signPanelShape.quadraticCurveTo(-1.8, 0.81, -1.8, 0.81 - SIGN_CORNER_RADIUS)
signPanelShape.lineTo(-1.8, -0.81 + SIGN_CORNER_RADIUS)
signPanelShape.quadraticCurveTo(-1.8, -0.81, -1.8 + SIGN_CORNER_RADIUS, -0.81)
const signPanelGeometry = new THREE.ExtrudeGeometry(signPanelShape, { depth: 0.025, bevelEnabled: false, curveSegments: 4 })

// The extruded caps originally use metre coordinates as UVs; fit the weathering once.
for (let index = 0; index < signPanelGeometry.attributes.uv.count; index += 1) {
  const positions = signPanelGeometry.attributes.position
  signPanelGeometry.attributes.uv.setXY(index, (positions.getX(index) + 1.8) / 3.6,
    (positions.getY(index) + 0.81) / 1.62)
}
const SIGN_POST_OFFSETS = [-1.24, 1.24]

function makeSignGrassGeometry(x, z, base) {
  const positions = [], colors = [], indices = []
  const rootColor = new THREE.Color('#30372a')
  const tipColor = new THREE.Color('#666b43')
  const random = (seed) => THREE.MathUtils.euclideanModulo(Math.sin(seed * 127.1 + x * 0.37) * 43758.5453, 1)
  for (let post = 0; post < SIGN_POST_OFFSETS.length; post += 1) {
    for (let blade = 0; blade < 24; blade += 1) {
      const seed = post * 97 + blade
      const tuft = Math.floor(blade / 6)
      const angle = tuft * Math.PI / 2 + 0.35
      const localX = Math.cos(angle) * 0.15 + (random(seed + 1) - 0.5) * 0.09
      const localZ = SIGN_POST_OFFSETS[post] + Math.sin(angle) * 0.15 + (random(seed + 2) - 0.5) * 0.09
      const y = getWalkableHeightAt(x + localX, z + localZ) - base - 0.018
      const height = 0.32 + random(seed + 3) * 0.48
      const yaw = random(seed + 4) * Math.PI * 2
      const widthX = Math.cos(yaw) * 0.018, widthZ = Math.sin(yaw) * 0.018
      const leanX = (random(seed + 5) - 0.5) * 0.22
      const leanZ = (random(seed + 6) - 0.5) * 0.22
      const first = positions.length / 3
      positions.push(
        localX - widthX, y, localZ - widthZ,
        localX + widthX, y, localZ + widthZ,
        localX + leanX * 0.35 - widthX * 0.7, y + height * 0.55, localZ + leanZ * 0.35 - widthZ * 0.7,
        localX + leanX * 0.35 + widthX * 0.7, y + height * 0.55, localZ + leanZ * 0.35 + widthZ * 0.7,
        localX + leanX, y + height, localZ + leanZ)
      for (let vertex = 0; vertex < 5; vertex += 1) {
        const tint = vertex < 2 ? rootColor : tipColor
        colors.push(tint.r, tint.g, tint.b)
      }
      indices.push(first, first + 1, first + 2, first + 1, first + 3, first + 2, first + 2, first + 3, first + 4)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function makeSignPostTexture() {
  // One tall shared atlas: no repeating vertical gradient or tile boundaries.
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 1024
  const context = canvas.getContext('2d')
  let seed = 72931
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  const grain = context.createImageData(canvas.width, canvas.height)
  for (let index = 0; index < grain.data.length; index += 4) {
    const noise = (random() - 0.5) * 22
    grain.data[index] = 119 + noise
    grain.data[index + 1] = 70 + noise * 0.65
    grain.data[index + 2] = 41 + noise * 0.45
    grain.data[index + 3] = 255
  }
  context.putImageData(grain, 0, 0)
  for (let index = 0; index < 180; index += 1) {
    context.save()
    context.translate(random() * 128, random() * 1024)
    context.scale(3 + random() * 8, 8 + random() * 39)
    const stain = context.createRadialGradient(0, 0, 0, 0, 0, 1)
    const color = index % 5 === 0 ? '107,115,106' : index % 3 === 0 ? '163,86,38' : '55,32,22'
    stain.addColorStop(0, `rgba(${color},0.85)`)
    stain.addColorStop(0.55, `rgba(${color},0.48)`)
    stain.addColorStop(1, `rgba(${color},0)`)
    context.fillStyle = stain
    context.fillRect(-1, -1, 2, 2)
    context.restore()
  }
  // Broken corrosion edges and small pits, scattered over the full non-repeating atlas.
  const flakes = ['#583422', '#9d542c', '#b56836', '#754026', '#777c70']
  for (let index = 0; index < 1300; index += 1) {
    const x = random() * 128, y = random() * 1024
    const width = 0.4 + random() * 2.6, height = 0.8 + random() * 7
    context.globalAlpha = 0.3 + random() * 0.45
    context.fillStyle = flakes[Math.floor(random() * flakes.length)]
    context.beginPath()
    context.moveTo(x, y)
    context.lineTo(x + width, y + height * 0.18)
    context.lineTo(x + width * 0.7, y + height)
    context.lineTo(x - width * 0.2, y + height * 0.62)
    context.closePath()
    context.fill()
  }
  context.globalAlpha = 1
  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  map.anisotropy = 4
  return map
}

function LeonesSign({ index, signMaterials }) {
  const distance = distanceForSign(index)
  const phrase = SIGNS[index].phrase
  const x = signXAt(index)
  const z = HIGHWAY_Z - 15.5
  const base = x < INFINITE_HIGHWAY_START_X
    ? seamGround(z) + HIGHWAY_ROAD_HEIGHT
    : terrainHeight(x, z) + HIGHWAY_ROAD_HEIGHT
  const grassGeometry = useMemo(() => makeSignGrassGeometry(x, z, base), [x, z, base])
  useEffect(() => () => grassGeometry.dispose(), [grassGeometry])
  const posts = useMemo(() => SIGN_POST_OFFSETS.map((offset) => {
    const bottom = getWalkableHeightAt(x, z + offset) - base - 0.12
    const height = 3.3 - bottom
    const geometry = new THREE.BoxGeometry(0.1, height, 0.1)
    const { uv } = geometry.attributes
    // A continuous atlas strip covers each face from bottom to top, without tiling.
    for (let index = 0; index < uv.count; index += 1) {
      const face = Math.floor(index / 4)
      uv.setXY(index, ((face % 4) + 0.05 + uv.getX(index) * 0.9) / 4,
        0.02 + uv.getY(index) * 0.96)
    }
    return { offset, y: (3.3 + bottom) / 2, geometry }
  }), [x, z, base])
  useEffect(() => () => posts.forEach(({ geometry }) => geometry.dispose()), [posts])
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 300
    const context = canvas.getContext('2d')
    context.beginPath()
    context.roundRect(0, 0, 640, 300, 10)
    context.clip()
    let seed = (distance ?? index) * 173 + 719
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 4294967296
    }
    context.fillStyle = '#24513a'
    context.fillRect(0, 0, 640, 300)
    const grime = context.createLinearGradient(0, 0, 0, 300)
    grime.addColorStop(0, 'rgba(16,21,17,0.16)')
    grime.addColorStop(0.54, 'rgba(38,43,29,0.04)')
    grime.addColorStop(1, 'rgba(32,24,16,0.3)')
    context.fillStyle = grime
    context.fillRect(0, 0, 640, 300)
    context.strokeStyle = '#d0d0bd'
    context.lineWidth = 8
    context.beginPath()
    context.roundRect(14, 14, 612, 272, 10)
    context.stroke()
    context.fillStyle = '#e0e1d5'
    if (phrase) {
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.font = 'bold 62px Arial, sans-serif'
      context.fillText(phrase, 320, 150, 550)
    } else {
    context.font = 'bold 82px Arial, sans-serif'
    context.fillText('LEONES', 47, 124)
    // Same white, broad upward route arrow as the lettering, with softly rounded shoulders.
    context.beginPath()
    context.moveTo(533, 61)
    context.quadraticCurveTo(538, 58, 542, 64)
    context.lineTo(576, 102)
    context.quadraticCurveTo(581, 109, 574, 112)
    context.quadraticCurveTo(571, 113, 568, 112)
    context.lineTo(551, 107)
    context.lineTo(551, 125)
    context.lineTo(524, 125)
    context.lineTo(524, 107)
    context.lineTo(507, 112)
    context.quadraticCurveTo(499, 114, 497, 108)
    context.quadraticCurveTo(496, 105, 500, 101)
    context.lineTo(533, 61)
    context.closePath()
    context.fill()
    context.font = 'bold 70px Arial, sans-serif'
    context.fillText(`${distance} km`, 48, 225)
    }
    // Corrosion collects at the rim; rain pulls dirt and rust down the face.
    for (const [px, py] of [[28, 24], [613, 36], [37, 274], [605, 266]]) {
      const stain = context.createRadialGradient(px, py, 4, px, py, 82)
      stain.addColorStop(0, 'rgba(103,65,39,0.62)')
      stain.addColorStop(0.42, 'rgba(74,57,37,0.32)')
      stain.addColorStop(1, 'rgba(74,57,37,0)')
      context.fillStyle = stain
      context.fillRect(px - 82, py - 82, 164, 164)
    }
    for (const [px, py, width, height] of [[555, 262, 58, 22], [592, 93, 28, 50], [45, 268, 44, 17], [109, 20, 54, 13]]) {
      context.fillStyle = 'rgba(91,55,32,0.29)'
      context.beginPath()
      context.ellipse(px, py, width, height, -0.17, 0, Math.PI * 2)
      context.fill()
    }
    for (let index = 0; index < 95; index += 1) {
      const edge = random() < 0.72
      const px = edge ? (random() < 0.5 ? random() * 46 : 594 + random() * 46) : random() * 640
      const py = edge ? random() * 300 : (random() < 0.5 ? random() * 35 : 265 + random() * 35)
      const radius = 1 + random() * (edge ? 10 : 5)
      context.fillStyle = random() < 0.58
        ? `rgba(91,57,35,${0.12 + random() * 0.24})`
        : `rgba(28,31,25,${0.08 + random() * 0.15})`
      context.beginPath()
      context.ellipse(px, py, radius, radius * (0.3 + random()), random(), 0, Math.PI * 2)
      context.fill()
    }
    for (let index = 0; index < 25; index += 1) {
      const px = 22 + random() * 596
      const py = random() < 0.65 ? 17 + random() * 15 : 215 + random() * 55
      const length = 16 + random() * 85
      const streak = context.createLinearGradient(px, py, px, Math.min(300, py + length))
      streak.addColorStop(0, 'rgba(43,35,26,0.38)')
      streak.addColorStop(1, 'rgba(43,35,26,0)')
      context.fillStyle = streak
      context.fillRect(px, py, 3 + random() * 9, length)
    }
    for (const px of [32, 608]) for (const py of [32, 268]) {
      context.fillStyle = '#594d3a'
      context.beginPath()
      context.arc(px, py, 5, 0, Math.PI * 2)
      context.fill()
    }
    const map = new THREE.CanvasTexture(canvas)
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = 8
    return map
  }, [distance, phrase, index])
  useEffect(() => () => texture.dispose(), [texture])

  return <group position={[x, base, z]}>
    {posts.map(({ offset, y, geometry }) => <mesh key={offset}
      position={[0, y, offset]} geometry={geometry} material={signMaterials.post} />)}
    <mesh geometry={grassGeometry} material={signMaterials.grass} />
    <mesh geometry={signPanelGeometry} material={signMaterials.back}
      position={[0.04, 3.34, 0]} rotation-y={Math.PI / 2} />
    <mesh position={[0.068, 3.34, 0]} rotation-y={Math.PI / 2}>
      <planeGeometry args={[3.6, 1.62]} />
      <meshBasicMaterial map={texture} side={THREE.FrontSide} transparent alphaTest={0.5} />
    </mesh>
  </group>
}

// z offset, height, glow diameter, palette index. Soft clusters stay camera-relative.
const TOWN_LIGHTS = [
  [-19, 0.12, 3.2, 0], [-16.8, 0.28, 2.1, 1], [-13, 0.08, 3.7, 0],
  [-11.6, 0.15, 1.7, 2], [-8, 0.38, 2.5, 1], [-4.2, 0.14, 3.6, 0],
  [-1.9, 0.3, 1.8, 1], [2.1, 0.16, 3.3, 0], [4.6, 0.11, 1.7, 2],
  [7.6, 0.36, 2.5, 1], [11, 0.1, 3.8, 0], [13.3, 0.24, 2, 1],
  [17, 0.13, 2.9, 0], [19.5, 0.09, 1.5, 2],
]
const TOWN_COLORS = ['#c9a476', '#aa7657', '#884e49']

function makeTownGlowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const context = canvas.getContext('2d')
  const glow = context.createRadialGradient(32, 32, 0, 32, 32, 32)
  glow.addColorStop(0, 'rgba(255,255,255,0.35)')
  glow.addColorStop(0.2, 'rgba(255,255,255,0.26)')
  glow.addColorStop(0.62, 'rgba(255,255,255,0.07)')
  glow.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = glow
  context.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(canvas)
}

function DistantTown() {
  const { camera } = useThree()
  const group = useRef()
  const lights = useRef([])
  const approachFade = useRef(0)
  const glowTexture = useMemo(makeTownGlowTexture, [])
  useEffect(() => () => glowTexture.dispose(), [glowTexture])
  useFrame((_, delta) => {
    // Begin revealing the town before the former hard x=-20 boundary.
    // Fade both approaches and departures, including leaving the road sideways.
    const alongRoad = 1 - THREE.MathUtils.smoothstep(camera.position.x, -45, 10)
    const nearRoad = 1 - THREE.MathUtils.smoothstep(Math.abs(camera.position.z - HIGHWAY_Z), 18, 50)
    approachFade.current = THREE.MathUtils.damp(approachFade.current,
      alongRoad * nearRoad, 1.4, Math.min(delta, 0.1))
    group.current.position.set(camera.position.x - TOWN_DISTANCE,
      seamGround(HIGHWAY_Z) + HIGHWAY_ROAD_HEIGHT + 0.55, HIGHWAY_Z)
    const visibility = Math.pow(1 - highwayFogState.darkness, 2)
    const opacity = (0.56 - timeOfDayState.value * 0.45) * visibility * approachFade.current
    // Skip drawing only once the entire cluster is effectively invisible.
    group.current.visible = opacity > 0.0005
    for (const material of lights.current) if (material) {
      material.opacity = opacity
    }
  })
  return <group ref={group} visible={false}>
    {TOWN_LIGHTS.map(([z, y, size, palette], index) => <sprite key={index}
      position={[-(index % 4) * 2.7, y, z]} scale={[size * 1.7, size * 1.25, 1]}>
      <spriteMaterial ref={(material) => { lights.current[index] = material }}
        map={glowTexture} color={TOWN_COLORS[palette]} transparent opacity={0}
        depthWrite={false} fog={false} blending={THREE.AdditiveBlending} />
    </sprite>)}
  </group>
}

function SignLightCluster({ index, Furniture, Guardrails, guardrailMaterial, guardrailGeometries }) {
  const { camera } = useThree()
  const group = useRef()
  const barriers = useRef()
  const appearance = useRef(0)
  const x = signXAt(index)
  useFrame((_, delta) => {
    const along = Math.abs(camera.position.x - x)
    const lateral = Math.abs(camera.position.z - HIGHWAY_Z)
    appearance.current = THREE.MathUtils.damp(appearance.current,
      highwayPoleVisibility(along, lateral), POLE_FADE_RESPONSE, Math.min(delta, 0.1))
    group.current.visible = appearance.current > 0.0005
    barriers.current.visible = along < 105 && lateral < 32
  }, -0.1)
  return <group ref={group} position-x={x} visible={false}>
    <Furniture xPositions={SIGN_LIGHT_X_POSITIONS} heightAt={extensionGround} collisionOffsetX={x} appearance={appearance} />
    <group ref={barriers} visible={false}>
    <Guardrails material={guardrailMaterial} geometries={guardrailGeometries}
      xPositions={SIGN_LIGHT_X_POSITIONS} heightAt={extensionGround} damageSeed={index} collisionOffsetX={x} />
    </group>
  </group>
}

export default function InfiniteHighway({ asphaltMaterial, embankmentMaterial, markingMaterial, guardrailMaterial, guardrailGeometries, Guardrails, Furniture }) {
  const { camera } = useThree()
  const chunks = useRef([])
  const [beat, setBeat] = useState(0)
  const signMaterials = useMemo(() => {
    const map = createWeatheredTexture('metal', 4)
    map.wrapS = map.wrapT = THREE.RepeatWrapping
    return {
      back: new THREE.MeshLambertMaterial({ map, color: '#b3a18b' }),
      post: new THREE.MeshLambertMaterial({ map: makeSignPostTexture(), color: '#c7b8a5' }),
      grass: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    }
  }, [])
  useEffect(() => () => {
    signMaterials.back.map.dispose()
    signMaterials.back.dispose()
    signMaterials.post.map.dispose()
    signMaterials.post.dispose()
    signMaterials.grass.dispose()
  }, [signMaterials])
  const geometry = useMemo(makeChunkGeometry, [])
  const fieldMaterial = useFieldGroundMaterial()
  useEffect(() => () => Object.values(geometry).flat().forEach((mesh) => mesh.dispose()), [geometry])

  useFrame(() => {
    const chunkIndex = Math.max(0, Math.floor((INFINITE_HIGHWAY_START_X - camera.position.x) / CHUNK_LENGTH))
    const firstChunk = Math.max(0, chunkIndex - 1)
    for (let step = 0; step < ACTIVE_CHUNKS; step += 1) {
      const index = firstChunk + step
      chunks.current[index % ACTIVE_CHUNKS].position.x = INFINITE_HIGHWAY_START_X - index * CHUNK_LENGTH
    }
    const onHighway = Math.abs(camera.position.z - HIGHWAY_Z) < 40
    const passed = onHighway && camera.position.x < FIRST_SIGN_X
      ? 1 + Math.floor((FIRST_SIGN_X - camera.position.x) / SIGN_SPACING) : 0
    if (passed > 0) recordHighwaySigns(passed)
    if (beat !== passed) setBeat(passed)
  })

  return <>
    {Array.from({ length: ACTIVE_CHUNKS }, (_, slot) => <group key={slot}
      ref={(group) => { chunks.current[slot] = group }}
      position-x={INFINITE_HIGHWAY_START_X - slot * CHUNK_LENGTH}>
      <mesh geometry={geometry.field} material={fieldMaterial} receiveShadow />
      <mesh geometry={geometry.embankment} material={embankmentMaterial} receiveShadow />
      {geometry.asphalt.map((strip, index) => <mesh key={index} geometry={strip}
        material={asphaltMaterial} receiveShadow renderOrder={1} />)}
      <mesh geometry={geometry.marking} material={markingMaterial} renderOrder={2} />

    </group>)}
    {[beat - 1, beat, beat + 1].filter((index) => index >= 0 && index < SIGNS.length && (!highwaySequence.completed || index === 0)).map((index) =>
      <LeonesSign key={index} index={index} signMaterials={signMaterials} />)}
    {[beat - 1, beat, beat + 1].filter((index) => index > 0).map((index) =>
      <SignLightCluster key={index} index={index} Furniture={Furniture} Guardrails={Guardrails}
        guardrailMaterial={guardrailMaterial} guardrailGeometries={guardrailGeometries} />)}
    <DistantTown />
  </>
}
