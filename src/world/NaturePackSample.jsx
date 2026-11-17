import { useLayoutEffect, useMemo, useRef } from 'react'
import { useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as THREE from 'three'
import { getWalkableHeightAt } from '../player/getWalkableHeight'

import { NATURE_SAMPLE as SAMPLE } from './natureSampleDistribution'
import { boxCollider, registerColliders } from '../player/collisionWorld'

const URLS = SAMPLE.map(asset => `/models/glTF/${asset.name}.gltf`)

// GLTFLoader caches textures within one asset, not across separate files.
// This pack-only manager shares identical image/sampler textures across assets,
// including concurrent requests. Original relative URLs stay untouched.
const manager = new THREE.LoadingManager()
const textureLoader = new THREE.TextureLoader(manager)
const textures = new Map()
manager.addHandler(/\.png$/i, {
  load(url, onLoad, onProgress, onError) {
    let entry = textures.get(url)
    if (!entry) {
      entry = { texture: null, ready: null }
      entry.ready = new Promise((resolve, reject) => {
        entry.texture = textureLoader.load(url, resolve, onProgress, reject)
        entry.texture.anisotropy = 2
      })
      textures.set(url, entry)
      entry.ready.catch(() => textures.delete(url))
    }
    entry.ready.then(onLoad, onError)
    return entry.texture
  },
})
const packLoader = new GLTFLoader(manager)

function SampleAsset({ scene, definition }) {
  const parts = useMemo(() => {
    scene.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(scene)
    const materials = new Map(), result = []
    scene.traverse(mesh => {
      if (!mesh.isMesh) return
      const source = mesh.material
      // Selected assets were inspected: one material per mesh/primitive.
      if (!materials.has(source)) materials.set(source, new THREE.MeshLambertMaterial({
        map: source.map, color: new THREE.Color(definition.tint).multiply(source.color),
        vertexColors: !!mesh.geometry.attributes.color, side: source.side,
        alphaTest: source.alphaTest, transparent: false, depthWrite: true, fog: true,
      }))
      result.push({ geometry: mesh.geometry, material: materials.get(source),
        transform: mesh.matrixWorld.clone(), bounds })
    })
    return result
  }, [scene, definition])
  // Own only the lightweight runtime materials; loader owns geometry/textures.
  useLayoutEffect(() => () => {
    new Set(parts.map(part => part.material)).forEach(material => material.dispose())
  }, [parts])
  return parts.map((part, index) => <SampleInstances key={index} part={part} placements={definition.placements} />)
}

function SampleInstances({ part, placements }) {
  const ref = useRef()
  useLayoutEffect(() => {
    const object = new THREE.Object3D(), matrix = new THREE.Matrix4()
    const rotatedBounds = new THREE.Box3(), solids = []
    placements.forEach(([x, z, scale, yaw, pitch = 0, roll = 0, burial, solid = false], index) => {
      object.position.set(0, 0, 0)
      object.rotation.set(pitch, yaw, roll, 'YXZ')
      object.scale.setScalar(scale)
      object.updateMatrix()
      rotatedBounds.copy(part.bounds).applyMatrix4(object.matrix)
      const height = rotatedBounds.max.y - rotatedBounds.min.y
      // Ground against the rotated silhouette; burial remains correct even for
      // fallen wood. Old standing-tree placements retain their original offset.
      const groundOffset = burial === undefined ? -.025 : .035 - height * burial
      object.position.set(x, getWalkableHeightAt(x, z) - rotatedBounds.min.y + groundOffset, z)
      if (solid) {
        rotatedBounds.translate(object.position)
        solids.push(boxCollider(rotatedBounds, { walkable: true }))
      }
      object.updateMatrix()
      matrix.multiplyMatrices(object.matrix, part.transform)
      ref.current.setMatrixAt(index, matrix)
    })
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
    return solids.length ? registerColliders(solids) : undefined
  }, [part, placements])
  return <instancedMesh ref={ref} args={[part.geometry, part.material, placements.length]}
    castShadow={false} receiveShadow={false} dispose={null} />
}

export default function NaturePackSample() {
  const assets = useLoader(packLoader, URLS)
  return SAMPLE.map((definition, index) => <SampleAsset key={definition.name}
    scene={assets[index].scene} definition={definition} />)
}

