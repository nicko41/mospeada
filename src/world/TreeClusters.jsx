import {useGLTF} from '../loading/resources.js'
import { useLayoutEffect, useMemo, useRef } from 'react'

import * as THREE from 'three'
import { HIGHWAY_CLEARANCE, HIGHWAY_Z } from './sectors/highwayProfile'
import { terrainHeight } from './terrain'
import { registerColliders, cylinderCollider } from '../player/collisionWorld'

const CLUSTERS = [
  { center: [-63, -72], count: 11, radius: 14 },
  { center: [72, -124], count: 14, radius: 17 },
  { center: [-82, -218], count: 16, radius: 19 },
  { center: [88, -276], count: 10, radius: 13 },
]

function gradeTreeColor(material, tint, strength, brightness = 1) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      float treeLuminance = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      diffuseColor.rgb = mix(diffuseColor.rgb,
        treeLuminance * vec3(${tint.join(', ')}) * ${brightness.toFixed(2)},
        ${strength.toFixed(2)});`,
    )
  }
  material.customProgramCacheKey = () => `tree-grade-${tint.join('-')}-${strength}-${brightness}`
  return material
}

function seededRandom(seed) {
  let value = seed
  return () => {
    value = (value * 48271) % 2147483647
    return (value - 1) / 2147483646
  }
}

function createTrees() {
  const random = seededRandom(431)
  return CLUSTERS.flatMap((cluster) => Array.from({ length: cluster.count }, () => {
    const angle = random() * Math.PI * 2
    const distance = Math.sqrt(random()) * cluster.radius
    const x = cluster.center[0] + Math.cos(angle) * distance
    const z = cluster.center[1] + Math.sin(angle) * distance
    return {
      position: [x, terrainHeight(x, z), z],
      height: 4.8 + random() * 4.4,
      width: 0.82 + random() * 0.36,
      rotation: random() * Math.PI * 2,
      kind: random() < 0.36 ? 1 + Math.floor(random() * 5) : 0,
    }
  })).filter((tree) => Math.abs(tree.position[2] - HIGHWAY_Z) >= HIGHWAY_CLEARANCE + 3)
}

function treeParts(root, materialForMesh) {
  root.updateMatrixWorld(true)
  const parts = []
  const bounds = new THREE.Box3()
  root.traverse((mesh) => {
    if (!mesh.isMesh) return
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
    geometry.computeBoundingBox()
    bounds.union(geometry.boundingBox)
    parts.push({ geometry, material: materialForMesh(mesh),
      bark: !/leav|foliage/i.test(mesh.material.name) })
  })
  const centerX = (bounds.min.x + bounds.max.x) / 2
  const centerZ = (bounds.min.z + bounds.max.z) / 2
  const height = bounds.max.y - bounds.min.y
  parts.forEach(({ geometry }) => geometry.translate(-centerX, -bounds.min.y, -centerZ))
  // Fit a static primitive to the lower bark, not the canopy's bounding centre.
  // Inspect vertices only once per loaded variant; gameplay never queries the mesh.
  const trunkBounds = new THREE.Box3()
  const point = new THREE.Vector3()
  for (const { geometry, bark } of parts) {
    if (!bark) continue
    const positions = geometry.attributes.position
    for (let index = 0; index < positions.count; index += 1) {
      point.fromBufferAttribute(positions, index)
      if (point.y <= height * 0.30) trunkBounds.expandByPoint(point)
    }
  }
  const trunkCenter = trunkBounds.getCenter(new THREE.Vector3())
  let radius = 0
  for (const { geometry, bark } of parts) {
    if (!bark) continue
    const positions = geometry.attributes.position
    for (let index = 0; index < positions.count; index += 1) {
      point.fromBufferAttribute(positions, index)
      if (point.y <= height * 0.30) {
        radius = Math.max(radius, Math.hypot(point.x - trunkCenter.x, point.z - trunkCenter.z))
      }
    }
  }
  return { parts, height, trunk: { x: trunkCenter.x, z: trunkCenter.z, radius } }
}

function TreeVariant({ model, trees }) {
  const refs = useRef([])
  const transform = useMemo(() => new THREE.Object3D(), [])

  useLayoutEffect(() => {
    const colliders = []
    const trunkCenter = new THREE.Vector3()
    // Exactly the same transform as the rendered instances, including off-centre trunks.
    trees.forEach((tree) => {
      const [x, y, z] = tree.position
      const scale = tree.height / model.height
      transform.position.set(x, y, z)
      transform.rotation.set(0, tree.rotation, 0)
      transform.scale.set(scale * tree.width, scale, scale * tree.width)
      transform.updateMatrix()
      trunkCenter.set(model.trunk.x, 0, model.trunk.z).applyMatrix4(transform.matrix)
      colliders.push(cylinderCollider(trunkCenter.x, trunkCenter.z,
        Math.max(0.12, model.trunk.radius * scale * tree.width), y, y + tree.height * 0.5))
    })
    refs.current.forEach((mesh) => {
      if (!mesh) return
      trees.forEach((tree, index) => {
        const [x, y, z] = tree.position
        const scale = tree.height / model.height
        transform.position.set(x, y, z)
        transform.rotation.set(0, tree.rotation, 0)
        transform.scale.set(scale * tree.width, scale, scale * tree.width)
        transform.updateMatrix()
        mesh.setMatrixAt(index, transform.matrix)
      })
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    })
    return registerColliders(colliders)
  }, [model, transform, trees])

  return model.parts.map((part, index) => (
    <instancedMesh
      key={index}
      ref={(mesh) => { refs.current[index] = mesh }}
      args={[part.geometry, part.material, trees.length]}
      castShadow
      receiveShadow
    />
  ))
}

export default function TreeClusters() {
  const living = useGLTF('/models/tree02.glb')
  const dead = useGLTF('/models/deadtrees01.glb')
  const trees = useMemo(createTrees, [])
  const livingMaterials = useMemo(() => ({
    bark: gradeTreeColor(new THREE.MeshLambertMaterial({
      map: living.materials.Bark_NormalTree.map,
      color: '#aaa49a',
      vertexColors: true,
      flatShading: true,
    }), [0.82, 0.82, 0.78], 0.9, 0.88),
    leaves: gradeTreeColor(new THREE.MeshLambertMaterial({
      map: living.materials.Leaves_NormalTree.map,
      color: '#adb0a3',
      vertexColors: true,
      flatShading: true,
      side: THREE.DoubleSide,
      alphaTest: 0.35,
    }), [0.69, 0.87, 0.58], 0.78, 1.05),
  }), [living.materials])
  const deadBark = useMemo(() => {
    const source = dead.materials.MapleTree_Bark
    return new THREE.MeshLambertMaterial({
      color: '#827b70',
      map: source.map,
      flatShading: true,
    })
  }, [dead.materials])
  const models = useMemo(() => [
    treeParts(living.scene, (mesh) => mesh.material.name === 'Leaves_NormalTree'
      ? livingMaterials.leaves : livingMaterials.bark),
    ...dead.scene.children[0].children.map((tree) => treeParts(tree, () => deadBark)),
  ], [living.scene, livingMaterials, dead.scene, deadBark])

  return models.map((model, kind) => (
    <TreeVariant key={kind} model={model} trees={trees.filter((tree) => tree.kind === kind)} />
  ))
}

useGLTF.preload('/models/tree02.glb')
useGLTF.preload('/models/deadtrees01.glb')
