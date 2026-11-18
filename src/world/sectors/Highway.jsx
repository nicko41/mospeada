import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { timeOfDayState } from '../TimeOfDay'
import { terrainHeight } from '../terrain'
import { highwayFogState } from './highwayFogState'
import { highwayLightState } from './highwayLightState'
import { createRoadGlowMaterial } from './highwayRoadGlow'
import { addMarkingPaintWear } from './highwayMarkingPaint'
import { registerColliders, boxCollider, cylinderCollider } from '../../player/collisionWorld'
import InfiniteHighway from './InfiniteHighway'
import {
  HIGHWAY_LENGTH,
  HIGHWAY_ROAD_HEIGHT as ROAD_HEIGHT,
  HIGHWAY_TOP_HALF_WIDTH,
  HIGHWAY_Z,
  highwayEarthEdgeAt,
  highwayLiftAt,
} from './highwayProfile'

const SEGMENTS = 120
const CARRIAGEWAY_OFFSET = 6.25
const CARRIAGEWAY_WIDTH = 9
function makeCrossingStrip(zOffset, width, heightOffset, crown = 0, outerSide = 0) {
  const vertices = []
  const indices = []
  const uvs = []
  const blends = []
  const columns = outerSide === 0 ? 2 : 4

  for (let index = 0; index <= SEGMENTS; index += 1) {
    const progress = index / SEGMENTS
    const x = THREE.MathUtils.lerp(-HIGHWAY_LENGTH * 0.5, HIGHWAY_LENGTH * 0.5, progress)

    const points = outerSide < 0
      ? [
        { z: HIGHWAY_Z - 11.16, blend: 0 },
        { z: HIGHWAY_Z - 10, blend: 1 },
        { z: HIGHWAY_Z - 2.9, blend: 1 },
        { z: HIGHWAY_Z - 1.75, blend: 0 },
      ]
      : outerSide > 0
        ? [
          { z: HIGHWAY_Z + 1.75, blend: 0 },
          { z: HIGHWAY_Z + 2.9, blend: 1 },
          { z: HIGHWAY_Z + 10, blend: 1 },
          { z: HIGHWAY_Z + 11.16, blend: 0 },
        ]
        : [-1, 1].map((side) => ({ z: HIGHWAY_Z + zOffset + side * width * 0.5, blend: 1 }))

    for (const point of points) {
      const z = point.z
      vertices.push(x, terrainHeight(x, z) + heightOffset + crown, z)
      uvs.push(x / 7, z / 7)
      blends.push(point.blend)
    }

    if (index < SEGMENTS) {
      const current = index * columns
      for (let column = 0; column < columns - 1; column += 1) {
        indices.push(current + column, current + column + 1, current + column + columns)
        indices.push(current + column + columns, current + column + 1, current + column + columns + 1)
      }
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('aRoadBlend', new THREE.Float32BufferAttribute(blends, 1))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function makeEmbankmentGeometry() {
  const vertices = []
  const indices = []
  const uvs = []
  const blends = []
  const pointsPerSection = 14

  for (let index = 0; index <= SEGMENTS; index += 1) {
    const x = THREE.MathUtils.lerp(-HIGHWAY_LENGTH * 0.5, HIGHWAY_LENGTH * 0.5, index / SEGMENTS)
    const leftEdge = highwayEarthEdgeAt(x, -1)
    const rightEdge = highwayEarthEdgeAt(x, 1)
    const crossSection = [
      { z: -leftEdge.foot - 2.5, blend: 0 },
      { z: -leftEdge.foot, blend: 0.32 },
      { z: -leftEdge.foot + 1.4, blend: 0.78 },
      { z: -leftEdge.mid, blend: 1 },
      { z: -(leftEdge.mid + leftEdge.crown) * 0.5, blend: 1 },
      { z: -leftEdge.crown, blend: 1 },
      { z: -HIGHWAY_TOP_HALF_WIDTH, blend: 1 },
      { z: HIGHWAY_TOP_HALF_WIDTH, blend: 1 },
      { z: rightEdge.crown, blend: 1 },
      { z: (rightEdge.mid + rightEdge.crown) * 0.5, blend: 1 },
      { z: rightEdge.mid, blend: 1 },
      { z: rightEdge.foot - 1.4, blend: 0.78 },
      { z: rightEdge.foot, blend: 0.32 },
      { z: rightEdge.foot + 2.5, blend: 0 },
    ]

    for (const point of crossSection) {
      const z = HIGHWAY_Z + point.z
      const lift = highwayLiftAt(x, z)
      const roadbedRecess = 0.075 * THREE.MathUtils.clamp(lift / 0.5, 0, 1)
      vertices.push(x, terrainHeight(x, z) + lift + 0.012 - roadbedRecess, z)
      uvs.push(x / 4, z / 4)
      blends.push(point.blend)
    }

    if (index < SEGMENTS) {
      const current = index * pointsPerSection
      for (let column = 0; column < pointsPerSection - 1; column += 1) {
        const bottomLeft = current + column
        const bottomRight = bottomLeft + 1
        const topLeft = bottomLeft + pointsPerSection
        const topRight = topLeft + 1
        indices.push(bottomLeft, bottomRight, topLeft, topLeft, bottomRight, topRight)
      }
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('aEmbankmentBlend', new THREE.Float32BufferAttribute(blends, 1))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function addEmbankmentFade(material, shaderRef) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHighwayDayFill = { value: 0 }
    shaderRef.current = shader
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aEmbankmentBlend;\nvarying float vEmbankmentBlend;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvEmbankmentBlend = aEmbankmentBlend;',
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vEmbankmentBlend;\nuniform float uHighwayDayFill;',
      )
      .replace(
        '#include <opaque_fragment>',
        'diffuseColor.a *= smoothstep(0.0, 1.0, vEmbankmentBlend);\noutgoingLight += diffuseColor.rgb * uHighwayDayFill;\n#include <opaque_fragment>',
      )
  }
  material.customProgramCacheKey = () => 'highway-earth-embankment-day-v1'
  return material
}

function createAsphaltTextures() {
  const size = 512
  const colorCanvas = document.createElement('canvas')
  const roughnessCanvas = document.createElement('canvas')
  const normalCanvas = document.createElement('canvas')
  for (const canvas of [colorCanvas, roughnessCanvas, normalCanvas]) {
    canvas.width = size
    canvas.height = size
  }
  const colorContext = colorCanvas.getContext('2d')
  const roughnessContext = roughnessCanvas.getContext('2d')
  const normalContext = normalCanvas.getContext('2d')
  const colorImage = colorContext.createImageData(size, size)
  const roughnessImage = roughnessContext.createImageData(size, size)
  const normalImage = normalContext.createImageData(size, size)
  const heights = new Float32Array(size * size)
  const hash = (x, y) => {
    let value = Math.imul(x, 374761393) ^ Math.imul(y, 668265263)
    value = Math.imul(value ^ (value >>> 13), 1274126177)
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296
  }
  const noise = (x, y, cells) => {
    const px = x * cells / size
    const py = y * cells / size
    const ix = Math.floor(px)
    const iy = Math.floor(py)
    const tx = (px - ix) ** 2 * (3 - 2 * (px - ix))
    const ty = (py - iy) ** 2 * (3 - 2 * (py - iy))
    const a = hash(ix % cells, iy % cells)
    const b = hash((ix + 1) % cells, iy % cells)
    const c = hash(ix % cells, (iy + 1) % cells)
    const d = hash((ix + 1) % cells, (iy + 1) % cells)
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, tx), THREE.MathUtils.lerp(c, d, tx), ty)
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4
      const broad = noise(x, y, 16)
      const aggregate = noise(x, y, 128)
      const grit = hash(x, y)
      const value = Math.round(72 + (broad - 0.5) * 12 + (aggregate - 0.5) * 14 + (grit - 0.5) * 24)
      colorImage.data.set([value, value + 1, value + 2, 255], index)
      const roughness = Math.round(188 + broad * 27 + (aggregate - 0.5) * 24 + (grit - 0.5) * 20)
      roughnessImage.data.set([roughness, roughness, roughness, 255], index)
      heights[y * size + x] = aggregate * 0.25 + grit * 0.75
    }
  }
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4
      const dx = (heights[y * size + (x + 1) % size] - heights[y * size + (x + size - 1) % size]) * 0.42
      const dy = (heights[((y + 1) % size) * size + x] - heights[((y + size - 1) % size) * size + x]) * 0.42
      const inverseLength = 1 / Math.hypot(dx, dy, 1)
      normalImage.data.set([
        Math.round((0.5 - dx * inverseLength * 0.5) * 255),
        Math.round((0.5 - dy * inverseLength * 0.5) * 255),
        Math.round((0.5 + inverseLength * 0.5) * 255),
        255,
      ], index)
    }
  }

  colorContext.putImageData(colorImage, 0, 0)
  roughnessContext.putImageData(roughnessImage, 0, 0)
  normalContext.putImageData(normalImage, 0, 0)
  const textures = [
    new THREE.CanvasTexture(colorCanvas),
    new THREE.CanvasTexture(roughnessCanvas),
    new THREE.CanvasTexture(normalCanvas),
  ]
  textures[0].colorSpace = THREE.SRGBColorSpace
  for (const texture of textures) {
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(4, 4)
    texture.anisotropy = 8
  }
  return textures
}

function makeMarkingsGeometry() {
  const vertices = []
  const indices = []
  const uvs = []
  const paintSpans = []
  const solidOffsets = [-9.82, -1.78, 1.78, 9.82]
  const dashedOffsets = [-CARRIAGEWAY_OFFSET, CARRIAGEWAY_OFFSET]

  const addMarking = (zOffset, startX, endX) => {
    const vertexOffset = vertices.length / 3
    for (const [index, x] of [startX, endX].entries()) {
      for (const side of [-1, 1]) {
        const z = HIGHWAY_Z + zOffset + side * 0.055
        vertices.push(x, terrainHeight(x, z) + ROAD_HEIGHT + 0.075, z)
        uvs.push(index, (side + 1) * 0.5)
        paintSpans.push(endX - startX, Math.abs(zOffset) === CARRIAGEWAY_OFFSET ? 1 : 0)
      }
    }
    indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2, vertexOffset + 2, vertexOffset + 1, vertexOffset + 3)
  }

  for (const offset of solidOffsets) {
    addMarking(offset, -HIGHWAY_LENGTH * 0.5, HIGHWAY_LENGTH * 0.5)
  }

  for (const offset of dashedOffsets) {
    for (let x = -HIGHWAY_LENGTH * 0.5; x < HIGHWAY_LENGTH * 0.5; x += 9) {
      addMarking(offset, x, Math.min(x + 5, HIGHWAY_LENGTH * 0.5))
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('aPaintSpan', new THREE.Float32BufferAttribute(paintSpans, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function addAsphaltFeather(material, shaderRef) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHighwayDayFill = { value: 0 }
    shaderRef.current = shader
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aRoadBlend;\nvarying float vRoadBlend;\nvarying float vRoadX;\nvarying vec2 vAsphaltPosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoadBlend = aRoadBlend;\nvRoadX = position.x;\nvAsphaltPosition = position.xz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vRoadBlend;\nvarying float vRoadX;\nvarying vec2 vAsphaltPosition;\nuniform float uHighwayDayFill;\nfloat asphaltWetness;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float macroA = sin(vAsphaltPosition.x * 0.085 + sin(vAsphaltPosition.y * 0.37) * 1.25);
        float macroB = sin(vAsphaltPosition.x * 0.19 - vAsphaltPosition.y * 0.53);
        asphaltWetness = smoothstep(-0.46, 0.56, macroA * 0.72 + macroB * 0.28);
        diffuseColor.rgb *= 1.04 - asphaltWetness * 0.12;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + 0.055 - asphaltWetness * 0.13, 0.27, 0.72);`)
      .replace('#include <opaque_fragment>', `
        float edgeWave = sin(vRoadX * 0.19) * 0.12 + sin(vRoadX * 0.43 + 1.7) * 0.055;
        float feather = clamp(vRoadBlend + edgeWave * sin(vRoadBlend * 3.14159), 0.0, 1.0);
        diffuseColor.a *= smoothstep(0.0, 1.0, feather);
        outgoingLight += diffuseColor.rgb * uHighwayDayFill;
        #include <opaque_fragment>`)
  }
  material.customProgramCacheKey = () => 'highway-asphalt-feather-day-material-v2'
  return material
}

// Folded steel sheet: two outward crests and a recessed central mounting valley.
// The closed 3 mm shell supplies the silhouette; the map only supplies weathering.
function guardrailBeamGeometry() {
  const profile = [
    [-0.155, 0.012], [-0.135, 0.004], [-0.105, 0.052],
    [-0.080, 0.075], [-0.055, 0.065], [-0.015, 0.004],
    [0.015, 0.004], [0.055, 0.065], [0.080, 0.075],
    [0.105, 0.052], [0.135, 0.004], [0.155, 0.012],
  ]
  const ring = [...profile, ...profile.toReversed().map(([y, z]) => [y, z - 0.003])]
  const positions = [], uvs = []
  const addTriangle = (a, b, c) => {
    for (const [x, y, z] of [a, b, c]) {
      positions.push(x, y, z)
      // Crop a quiet strip between the photographed corrugations.
      uvs.push((x + 1.5) / 1.2, 0.43 + (y + 0.155) / 0.31 * 0.045)
    }
  }
  const addQuad = (a, b, c, d) => {
    addTriangle(a, b, c)
    addTriangle(a, c, d)
  }
  // A raised 6 cm end laps over the next module without coplanar surfaces.
  const stations = [[-1.5, 0], [1.48, 0], [1.50, 0.004], [1.56, 0.004]]
  for (let step = 0; step < stations.length - 1; step += 1) {
    const [x0, lift0] = stations[step]
    const [x1, lift1] = stations[step + 1]
    for (let index = 0; index < ring.length; index += 1) {
      const a = ring[index], b = ring[(index + 1) % ring.length]
      addQuad([x0, a[0], a[1] + lift0], [x1, a[0], a[1] + lift1],
        [x1, b[0], b[1] + lift1], [x0, b[0], b[1] + lift0])
    }
  }
  // Close the sheet thickness at each exposed end, following each fold.
  for (const [x, lift] of [stations[0], stations[stations.length - 1]]) {
    for (let index = 0; index < profile.length - 1; index += 1) {
      const a = profile[index], b = profile[index + 1]
      const corners = [[x, a[0], a[1] + lift], [x, b[0], b[1] + lift],
        [x, b[0], b[1] + lift - 0.003], [x, a[0], a[1] + lift - 0.003]]
      if (x > 0) corners.reverse()
      addQuad(...corners)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.computeVertexNormals()
  return geometry
}

function guardrailPostGeometry() {
  const geometry = new THREE.BoxGeometry(0.10, 0.85, 0.08)
  const uv = geometry.attributes.uv
  for (let index = 0; index < uv.count; index += 1) {
    // Small unbanded crop: supports remain straight, subtly mottled metal.
    uv.setXY(index, 0.58 + uv.getX(index) * 0.08, 0.43 + uv.getY(index) * 0.045)
  }
  return geometry
}

function Guardrails({ material, geometries, xPositions = LIGHT_X_POSITIONS, heightAt = terrainHeight, damageSeed = 0, collisionOffsetX = 0 }) {
  const beams = useRef()
  const posts = useRef()
  const transform = useMemo(() => new THREE.Object3D(), [])
  const sections = useMemo(() => xPositions.map((x, index) => ({
    x, length: index % 3 === 1 ? 12 : 18,
  })), [xPositions])
  const beamCount = sections.reduce((count, section) => count + section.length / 3, 0) * 4
  const postCount = beamCount + sections.length * 4

  useLayoutEffect(() => {
    let beamIndex = 0
    let postIndex = 0
    const colliders = []
    const worldOffset = new THREE.Vector3(collisionOffsetX, 0, 0)
    const beamBounds = new THREE.Box3(new THREE.Vector3(-1.5, -0.155, 0.001), new THREE.Vector3(1.56, 0.155, 0.079))
    const postBounds = new THREE.Box3(new THREE.Vector3(-0.05, -0.425, -0.04), new THREE.Vector3(0.05, 0.425, 0.04))
    const random = (seed) => THREE.MathUtils.euclideanModulo(Math.sin(seed * 127.1 + 311.7) * 43758.5453, 1)
    const vertex = new THREE.Vector3()
    const pivot = new THREE.Vector3()
    const vertices = geometries.beam.attributes.position
    // Only evaluated while placing instances, never in the animation loop.
    const groundClearance = () => {
      transform.updateMatrix()
      let clearance = Infinity
      for (let index = 0; index < vertices.count; index += 1) {
        vertex.fromBufferAttribute(vertices, index).applyMatrix4(transform.matrix)
        clearance = Math.min(clearance, vertex.y - heightAt(vertex.x, vertex.z) - ROAD_HEIGHT)
      }
      return clearance
    }
    for (const zOffset of [-12.9, -1.55, 1.55, 12.9]) {
      const z = HIGHWAY_Z + zOffset
      const facing = zOffset === -12.9 || zOffset === 1.55 ? 1 : -1
      for (const section of sections) {
        const start = section.x - section.length / 2
        const seed = section.x * 1.73 + zOffset * 7.19 + damageSeed * 13.37
        // At most one damaged module in a section; roughly 6–7% overall.
        const damagedOffset = random(seed) < 0.35
          ? Math.floor(random(seed + 17) * (section.length / 3)) * 3 : -1
        const fallen = random(seed + 41) < 0.45
        for (let offset = 0; offset <= section.length; offset += 3) {
          const x = start + offset
          const baseY = heightAt(x, z) + ROAD_HEIGHT
          transform.position.set(x, baseY + 0.365, z - facing * 0.045)
          transform.rotation.set(0, 0, 0)
          transform.scale.setScalar(1)
          transform.updateMatrix()
          posts.current.setMatrixAt(postIndex++, transform.matrix)
          colliders.push(boxCollider(postBounds.clone().applyMatrix4(transform.matrix).translate(worldOffset)))
          if (offset < section.length) {
            const slope = (heightAt(x + 3, z) - heightAt(x, z)) / 3
            transform.position.set(x + 1.5, heightAt(x + 1.5, z) + ROAD_HEIGHT + 0.65, z)
            transform.rotation.set(0, facing > 0 ? 0 : Math.PI, Math.atan(slope) * facing, 'YXZ')
            transform.scale.setScalar(1)
            if (offset === damagedOffset) {
              if (fallen) {
                // Move the existing sheet off its supports and lay it beside them.
                transform.position.z += facing * (0.28 + random(seed + 63) * 0.20)
                transform.rotation.set(-Math.PI / 2,
                  (facing > 0 ? 0 : Math.PI) + (random(seed + 79) - 0.5) * 0.24, 0, 'YXZ')
                transform.position.y = heightAt(transform.position.x, transform.position.z) + ROAD_HEIGHT
                transform.position.y += 0.008 - groundClearance()
              } else {
                const direction = random(seed + 97) < 0.5 ? 1 : -1
                const anchorX = direction > 0 ? x : x + 3
                const anchorY = heightAt(anchorX, z) + ROAD_HEIGHT + 0.65
                const placeAtAngle = (angle) => {
                  transform.rotation.set(0, facing > 0 ? 0 : Math.PI,
                    -direction * facing * angle, 'YXZ')
                  pivot.set(-direction * facing * 1.5, 0, 0).applyQuaternion(transform.quaternion)
                  transform.position.set(anchorX - pivot.x, anchorY - pivot.y, z - pivot.z)
                }
                // Keep one mounting point fixed and lower the free end onto the ground.
                let low = -0.35
                let high = 0.65
                for (let step = 0; step < 12; step += 1) {
                  const angle = (low + high) / 2
                  placeAtAngle(angle)
                  if (groundClearance() > 0.008) low = angle
                  else high = angle
                }
                placeAtAngle(low)
              }
            }
            transform.updateMatrix()
            beams.current.setMatrixAt(beamIndex++, transform.matrix)
            colliders.push(boxCollider(beamBounds.clone().applyMatrix4(transform.matrix).translate(worldOffset), { vaultable: true }))
          }
        }
      }
    }
    for (const mesh of [beams.current, posts.current]) {
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    }
    return registerColliders(colliders)
  }, [collisionOffsetX, damageSeed, geometries, heightAt, sections, transform])

  return <>
    <instancedMesh ref={beams} args={[geometries.beam, material.beam, beamCount]} />
    <instancedMesh ref={posts} args={[geometries.post, material.post, postCount]} />
  </>
}

const glowVertexShader = /* glsl */ `
uniform float uConeHeight;
uniform float uIsCone;
varying vec3 vNormal;
varying vec3 vViewDirection;
varying vec3 vWorldPosition;
varying float vSeed;
varying float vHeight;
varying float vDepth;
void main() {
  vec3 center = instanceMatrix[3].xyz;
  vSeed = fract(sin(dot(center.xz, vec2(12.9898, 78.233))) * 43758.5453);
  vec3 shaped = position;
  float angle = atan(position.z, position.x);
  float coneWarp = sin(position.y * 2.6 + angle * 3.0 + vSeed * 6.28) * 0.024
    + sin(position.y * 5.1 - angle * 2.0 + vSeed * 12.0) * 0.01;
  float haloWarp = sin(position.x * 5.0 + position.y * 7.0 + vSeed * 8.0)
    * sin(position.z * 6.0 - position.y * 3.0) * 0.026;
  shaped.xz *= 1.0 + mix(haloWarp, coneWarp, uIsCone);
  vec4 worldPosition = modelMatrix * instanceMatrix * vec4(shaped, 1.0);
  vec4 viewPosition = viewMatrix * worldPosition;
  vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  vViewDirection = -viewPosition.xyz;
  vWorldPosition = worldPosition.xyz;
  vHeight = position.y / uConeHeight + 0.5;
  vDepth = -viewPosition.z;
  gl_Position = projectionMatrix * viewPosition;
}
`

const glowFragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uIsCone;
uniform float uFogDensity;
uniform float uHaze;
uniform float uEmitterFloor;
varying vec3 vNormal;
varying vec3 vViewDirection;
varying vec3 vWorldPosition;
varying float vSeed;
varying float vHeight;
varying float vDepth;
void main() {
  float facing = abs(dot(normalize(vNormal), normalize(vViewDirection)));
  float humidity = sin(vWorldPosition.x * 1.7 + vWorldPosition.z * 2.3
    + vHeight * 13.0 + vSeed * 6.28) * 0.075
    + sin(vWorldPosition.x * 4.1 - vWorldPosition.z * 3.7
    + vHeight * 29.0) * 0.035;
  float halo = pow(facing, 2.8) * (0.97 + humidity * 0.75);
  float fadeDown = smoothstep(0.0, 0.53, vHeight + humidity * 0.24);
  float fadeUp = 1.0 - smoothstep(0.86, 1.0, vHeight);
  float cone = pow(facing, 1.15) * fadeDown * fadeUp * (0.94 + humidity);
  float fogDensity = max(0.038 + vSeed * 0.004, uFogDensity);
  float fogFade = exp(-fogDensity * fogDensity * vDepth * vDepth);
  float distantHalo = exp(-0.015 * vDepth) * 0.6;
  float visibility = mix(max(fogFade, distantHalo * (1.0 - uHaze)), fogFade, uIsCone);
  // A small lamp core remains faintly visible through black haze; cones keep normal fog.
  visibility = max(visibility, uEmitterFloor * uHaze * exp(-0.012 * max(vDepth, 0.0)));
  float alpha = uOpacity * (0.92 + vSeed * 0.16)
    * mix(halo, cone, uIsCone) * visibility;
  gl_FragColor = vec4(uColor, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

function createGlowMaterial(opacity, isCone, coneHeight = 1, emitterFloor = 0) {
  return new THREE.ShaderMaterial({
    vertexShader: glowVertexShader,
    fragmentShader: glowFragmentShader,
    uniforms: {
      uColor: { value: new THREE.Color('#e2d6aa') },
      uOpacity: { value: opacity },
      uIsCone: { value: isCone ? 1 : 0 },
      uFogDensity: { value: 0.038 },
      uHaze: { value: 0 },
      uEmitterFloor: { value: emitterFloor },
      uConeHeight: { value: coneHeight },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
}

const LIGHT_X_POSITIONS = [-60, -36, -12, 12, 36, 60]

const roadLightClusters = new Set()

function HighwayRoadLights() {
  const lights = useRef([])
  const targets = useMemo(() => highwayLightState.map(() => new THREE.Object3D()), [])
  const nearest = useMemo(() => Array(4).fill(null), [])

  useFrame(({ camera }) => {
    nearest.fill(null)
    for (const cluster of roadLightClusters) {
      let visible = true
      for (let parent = cluster.group; parent; parent = parent.parent) visible &&= parent.visible
      if (!visible) continue
      cluster.group.updateWorldMatrix(true, false)
      for (const bulb of cluster.bulbs) {
        bulb.world.copy(bulb.local).applyMatrix4(cluster.group.matrixWorld)
        bulb.distance = (camera.position.x - bulb.world.x) ** 2 + (camera.position.z - bulb.world.z) ** 2
        if (bulb.distance > 32 ** 2) continue
        for (let slot = 0; slot < nearest.length; slot += 1) {
          if (!nearest[slot] || bulb.distance < nearest[slot].distance) {
            for (let next = nearest.length - 1; next > slot; next -= 1) nearest[next] = nearest[next - 1]
            nearest[slot] = bulb
            break
          }
        }
      }
    }
    for (let slot = 0; slot < lights.current.length; slot += 1) {
      const light = lights.current[slot]
      const bulb = nearest[slot]
      const strength = bulb ? (1 - timeOfDayState.value)
        * (1 - THREE.MathUtils.smoothstep(Math.sqrt(bulb.distance), 24, 32))
        * (bulb.appearance?.current ?? 1) : 0
      light.intensity = 350 * strength
      const mistLight = highwayLightState[slot]
      mistLight.strength = strength
      if (!bulb) continue
      light.position.copy(bulb.world)
      targets[slot].position.copy(bulb.world)
      targets[slot].position.y -= 7.9
      targets[slot].updateMatrixWorld()
      mistLight.x = bulb.world.x
      mistLight.z = bulb.world.z
    }
  })

  return <>{targets.map((target, slot) => <group key={slot}>
    <primitive object={target} />
    <spotLight ref={(light) => { lights.current[slot] = light }} target={target}
      color="#fff0d4" intensity={0} distance={18} angle={0.62}
      penumbra={0.85} decay={2} castShadow={false} />
  </group>)}</>
}

function HighwayFurniture({ xPositions = LIGHT_X_POSITIONS, heightAt = terrainHeight, collisionOffsetX = 0, appearance }) {
  const scene = useThree((state) => state.scene)
  const group = useRef()
  const shafts = useRef()
  const arms = useRef()
  const housings = useRef()
  const lenses = useRef()
  const emitterCores = useRef()
  const roadGlows = useRef()
  const outerHalos = useRef()
  const innerHalos = useRef()
  const outerVolumes = useRef()
  const innerVolumes = useRef()
  const transform = useMemo(() => new THREE.Object3D(), [])
  useLayoutEffect(() => registerColliders(xPositions.map((x) => {
    const y = heightAt(x, HIGHWAY_Z) + ROAD_HEIGHT
    return cylinderCollider(x + collisionOffsetX, HIGHWAY_Z, 0.13, y, y + 8.4)
  })), [collisionOffsetX, heightAt, xPositions])
  const outerHaloMaterial = useMemo(() => createGlowMaterial(0.065, false, 1, 0.38), [])
  const innerHaloMaterial = useMemo(() => createGlowMaterial(0.24, false, 1, 0.8), [])
  const emitterMaterial = useMemo(() => createGlowMaterial(0.8, false, 1, 0.9), [])
  const roadGlowMaterial = useMemo(createRoadGlowMaterial, [])
  useEffect(() => () => roadGlowMaterial.dispose(), [roadGlowMaterial])
  const outerVolumeMaterial = useMemo(() => createGlowMaterial(0.012, true, 7.4), [])
  const innerVolumeMaterial = useMemo(() => createGlowMaterial(0.026, true, 7.15), [])
  const lensMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#fff2dc',
    emissive: '#fff0d4',
    emissiveIntensity: 5.5,
    roughness: 0.48,
    alphaHash: !!appearance,
    opacity: appearance ? 0 : 1,
  }), [appearance])

  useFrame(() => {
    const night = 1 - timeOfDayState.value
    const fade = appearance?.current ?? 1
    roadGlowMaterial.uniforms.uOpacity.value = 0.035 * night * fade
    roadGlowMaterial.uniforms.uFogDensity.value = Math.max(0.038, scene.fog?.density ?? 0.038)
    roadGlowMaterial.uniforms.uHaze.value = highwayFogState.darkness
    if (appearance) {
      for (const mesh of [shafts.current, arms.current, housings.current, lenses.current]) {
        if (mesh) mesh.material.opacity = fade
      }
    }
    for (const [material, opacity] of [
      [outerHaloMaterial, 0.065], [innerHaloMaterial, 0.24],
      [outerVolumeMaterial, 0.012], [innerVolumeMaterial, 0.026],
      [emitterMaterial, 0.8],
    ]) {
      material.uniforms.uOpacity.value = opacity * night * fade
      material.uniforms.uFogDensity.value = Math.max(0.038, scene.fog?.density ?? 0.038)
      material.uniforms.uHaze.value = highwayFogState.darkness
    }
    lensMaterial.emissiveIntensity = 5.5 * night
  })

  useLayoutEffect(() => {
    const cluster = { group: group.current, bulbs: xPositions.flatMap((x) =>
      [-4.55, 4.55].map((offset) => ({
        local: new THREE.Vector3(x, heightAt(x, HIGHWAY_Z) + ROAD_HEIGHT + 7.9, HIGHWAY_Z + offset),
        world: new THREE.Vector3(), distance: 0, appearance,
      }))) }
    roadLightClusters.add(cluster)
    return () => roadLightClusters.delete(cluster)
  }, [xPositions, heightAt, appearance])

  useLayoutEffect(() => {
    xPositions.forEach((x, index) => {
      const y = heightAt(x, HIGHWAY_Z) + ROAD_HEIGHT
      transform.position.set(x, y + 4.2, HIGHWAY_Z)
      transform.scale.set(1, 8.4, 1)
      transform.rotation.set(0, 0, 0)
      transform.updateMatrix()
      shafts.current.setMatrixAt(index, transform.matrix)

      transform.position.set(x, y + 8.3, HIGHWAY_Z)
      transform.scale.set(1, 1, 9.4)
      transform.updateMatrix()
      arms.current.setMatrixAt(index, transform.matrix)

      for (let sideIndex = 0; sideIndex < 2; sideIndex += 1) {
        const bulbIndex = index * 2 + sideIndex
        const z = HIGHWAY_Z + (sideIndex === 0 ? -4.55 : 4.55)
        const opening = 1 + Math.sin(bulbIndex * 2.31 + 1.2) * 0.045
        const length = 1 + Math.cos(bulbIndex * 1.71 + 0.6) * 0.045
        const haloSize = 1 + Math.sin(bulbIndex * 1.93) * 0.035
        transform.position.set(x, y + 8.08, z)
        transform.scale.setScalar(1)
        transform.updateMatrix()
        housings.current.setMatrixAt(bulbIndex, transform.matrix)

        transform.position.set(x, y + 7.98, z)
        transform.scale.setScalar(1)
        transform.updateMatrix()
        lenses.current.setMatrixAt(bulbIndex, transform.matrix)

        transform.scale.set(0.28, 0.12, 0.18)
        transform.updateMatrix()
        emitterCores.current.setMatrixAt(bulbIndex, transform.matrix)

        transform.position.set(x, heightAt(x, z) + ROAD_HEIGHT + 0.078, z)
        transform.rotation.set(-Math.PI / 2, 0, 0)
        transform.scale.set(11, 11, 1)
        transform.updateMatrix()
        roadGlows.current.setMatrixAt(bulbIndex, transform.matrix)
        transform.rotation.set(0, 0, 0)

        transform.position.set(x, y + 7.98, z)
        transform.scale.set(1.2 * haloSize, 1.1 * haloSize, 1.2 * haloSize)
        transform.updateMatrix()
        outerHalos.current.setMatrixAt(bulbIndex, transform.matrix)

        transform.scale.set(0.48 * haloSize, 0.44 * haloSize, 0.48 * haloSize)
        transform.updateMatrix()
        innerHalos.current.setMatrixAt(bulbIndex, transform.matrix)

        transform.position.set(x, y + 8 - 7.4 * length * 0.5, z)
        transform.scale.set(opening, length, opening)
        transform.updateMatrix()
        outerVolumes.current.setMatrixAt(bulbIndex, transform.matrix)

        transform.position.set(x, y + 8 - 7.15 * length * 0.5, z)
        transform.scale.set(opening * 0.98, length, opening * 0.98)
        transform.updateMatrix()
        innerVolumes.current.setMatrixAt(bulbIndex, transform.matrix)
      }
    })

    for (const mesh of [shafts.current, arms.current, housings.current, lenses.current, emitterCores.current, roadGlows.current, outerHalos.current, innerHalos.current, outerVolumes.current, innerVolumes.current]) {
      mesh.instanceMatrix.needsUpdate = true
    }
  }, [heightAt, transform, xPositions])

  return (
    <group ref={group}>
      <instancedMesh ref={shafts} args={[undefined, undefined, xPositions.length]}>
        <cylinderGeometry args={[0.07, 0.11, 1, 7]} />
        <meshStandardMaterial color="#3d4341" roughness={0.72} metalness={0.35} alphaHash={!!appearance} opacity={appearance ? 0 : 1} />
      </instancedMesh>
      <instancedMesh ref={arms} args={[undefined, undefined, xPositions.length]}>
        <boxGeometry args={[0.12, 0.12, 1]} />
        <meshStandardMaterial color="#3d4341" roughness={0.72} metalness={0.35} alphaHash={!!appearance} opacity={appearance ? 0 : 1} />
      </instancedMesh>
      <instancedMesh ref={housings} args={[undefined, undefined, xPositions.length * 2]}>
        <boxGeometry args={[0.48, 0.16, 0.3]} />
        <meshStandardMaterial color="#292d2c" roughness={0.58} metalness={0.42} alphaHash={!!appearance} opacity={appearance ? 0 : 1} />
      </instancedMesh>
      <instancedMesh ref={lenses} args={[undefined, undefined, xPositions.length * 2]}>
        <boxGeometry args={[0.38, 0.035, 0.22]} />
        <primitive object={lensMaterial} attach="material" />
      </instancedMesh>
      <instancedMesh ref={outerVolumes} args={[undefined, outerVolumeMaterial, xPositions.length * 2]} renderOrder={3}>
        <cylinderGeometry args={[0.28, 4.1, 7.4, 16, 10, true]} />
      </instancedMesh>
      <instancedMesh ref={innerVolumes} args={[undefined, innerVolumeMaterial, xPositions.length * 2]} renderOrder={4}>
        <cylinderGeometry args={[0.16, 2.55, 7.15, 16, 10, true]} />
      </instancedMesh>
      <instancedMesh ref={outerHalos} args={[undefined, outerHaloMaterial, xPositions.length * 2]} renderOrder={5}>
        <sphereGeometry args={[1, 16, 12]} />
      </instancedMesh>
      <instancedMesh ref={innerHalos} args={[undefined, innerHaloMaterial, xPositions.length * 2]} renderOrder={6}>
        <sphereGeometry args={[1, 16, 12]} />
      </instancedMesh>
      <instancedMesh ref={emitterCores} args={[undefined, emitterMaterial, xPositions.length * 2]} renderOrder={7}>
        <sphereGeometry args={[1, 12, 8]} />
      </instancedMesh>
      <instancedMesh ref={roadGlows} args={[undefined, roadGlowMaterial, xPositions.length * 2]} renderOrder={3}>
        <planeGeometry args={[1, 1]} />
      </instancedMesh>
    </group>
  )
}

export default function Highway() {
  const gl = useThree((state) => state.gl)
  const guardrailMap = useLoader(THREE.TextureLoader, '/textures/guardaraid.jpg')
  const guardrailMaterial = useMemo(() => {
    guardrailMap.colorSpace = THREE.SRGBColorSpace
    guardrailMap.wrapS = guardrailMap.wrapT = THREE.RepeatWrapping
    // Geometry UVs control the weathering crop and longitudinal repetition.
    guardrailMap.repeat.set(1, 1)
    guardrailMap.generateMipmaps = true
    guardrailMap.minFilter = THREE.LinearMipmapLinearFilter
    guardrailMap.anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy())
    guardrailMap.needsUpdate = true
    return {
      beam: new THREE.MeshLambertMaterial({ map: guardrailMap, color: '#b4b6b4' }),
      post: new THREE.MeshLambertMaterial({ map: guardrailMap, color: '#858b88' }),
    }
  }, [gl, guardrailMap])
  const guardrailGeometries = useMemo(() => ({
    beam: guardrailBeamGeometry(),
    post: guardrailPostGeometry(),
  }), [])
  useEffect(() => () => {
    guardrailGeometries.beam.dispose()
    guardrailGeometries.post.dispose()
  }, [guardrailGeometries])
  // The loader owns the one cached texture; both materials are shared across sectors.
  useEffect(() => () => {
    guardrailMaterial.beam.dispose()
    guardrailMaterial.post.dispose()
  }, [guardrailMaterial])
  const embankmentShader = useRef(null)
  const asphaltShader = useRef(null)
  useFrame(() => {
    if (embankmentShader.current) embankmentShader.current.uniforms.uHighwayDayFill.value = timeOfDayState.value * 1.65
    if (asphaltShader.current) asphaltShader.current.uniforms.uHighwayDayFill.value = timeOfDayState.value * 1.3
  })
  const [embankmentMap, embankmentNormal, embankmentRoughness] = useLoader(THREE.TextureLoader, [
    '/textures/ground/field/albedo.jpg',
    '/textures/ground/field/normal.jpg',
    '/textures/ground/field/roughness.jpg',
  ])
  const embankment = useMemo(makeEmbankmentGeometry, [])
  const leftCarriageway = useMemo(() => makeCrossingStrip(-CARRIAGEWAY_OFFSET, CARRIAGEWAY_WIDTH, ROAD_HEIGHT + 0.06, 0, -1), [])
  const rightCarriageway = useMemo(() => makeCrossingStrip(CARRIAGEWAY_OFFSET, CARRIAGEWAY_WIDTH, ROAD_HEIGHT + 0.06, 0, 1), [])
  const markings = useMemo(makeMarkingsGeometry, [])
  const [asphaltTexture, asphaltRoughness, asphaltNormal] = useMemo(createAsphaltTextures, [])

  const asphaltMaterial = useMemo(() => addAsphaltFeather(new THREE.MeshStandardMaterial({
    map: asphaltTexture,
    roughnessMap: asphaltRoughness,
    normalMap: asphaltNormal,
    normalScale: new THREE.Vector2(0.42, 0.42),
    color: '#929594',
    roughness: 0.6,
    metalness: 0.035,
    emissive: '#1a1d1e',
    emissiveIntensity: 0.08,
    transparent: true,
    depthWrite: false,
  }), asphaltShader), [asphaltNormal, asphaltRoughness, asphaltTexture])
  const embankmentMaterial = useMemo(() => {
    const anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
    for (const texture of [embankmentMap, embankmentNormal, embankmentRoughness]) {
      texture.wrapS = THREE.RepeatWrapping
      texture.wrapT = THREE.RepeatWrapping
      texture.anisotropy = anisotropy
    }
    embankmentMap.colorSpace = THREE.SRGBColorSpace
    return addEmbankmentFade(new THREE.MeshStandardMaterial({
      map: embankmentMap,
      normalMap: embankmentNormal,
      roughnessMap: embankmentRoughness,
      color: '#716b5d',
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughness: 0.88,
      metalness: 0,
      transparent: true,
      // The solid crown must occlude its far slope. Otherwise transparent
      // triangles draw over each other as flat blocks at shallow camera angles.
      depthWrite: true,
      alphaTest: 0.015,
    }), embankmentShader)
  }, [embankmentMap, embankmentNormal, embankmentRoughness, gl])
  const markingMaterial = useMemo(() => addMarkingPaintWear(new THREE.MeshBasicMaterial({
    color: '#565b53',
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  })), [])
  useEffect(() => () => markingMaterial.dispose(), [markingMaterial])

  return (
    <group>
      <mesh userData={{ rideSurface: true, rideSurfaceType: 'dirt' }} geometry={embankment} material={embankmentMaterial} receiveShadow />
      <mesh userData={{ rideSurface: true, rideSurfaceType: 'asphalt' }} geometry={leftCarriageway} material={asphaltMaterial} receiveShadow renderOrder={1} />
      <mesh userData={{ rideSurface: true, rideSurfaceType: 'asphalt' }} geometry={rightCarriageway} material={asphaltMaterial} receiveShadow renderOrder={1} />
      <mesh geometry={markings} material={markingMaterial} renderOrder={2} />
      <Guardrails material={guardrailMaterial} geometries={guardrailGeometries} />
      <HighwayFurniture />
      <HighwayRoadLights />
      <InfiniteHighway asphaltMaterial={asphaltMaterial} embankmentMaterial={embankmentMaterial}
        markingMaterial={markingMaterial} guardrailMaterial={guardrailMaterial}
        guardrailGeometries={guardrailGeometries} Guardrails={Guardrails} Furniture={HighwayFurniture} />
    </group>
  )
}
