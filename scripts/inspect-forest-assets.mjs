import fs from 'node:fs'
import path from 'node:path'
import { Box3, Matrix4, Quaternion, Vector3 } from 'three'

// Read-only audit: resolve every dependency and measure the authored node transforms.
const directory = 'public/models/glTF'
const rows = fs.readdirSync(directory).filter(name => name.endsWith('.gltf')).sort().map(file => {
  const asset = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'))
  const bounds = new Box3(), primitives = [], transforms = []
  const visit = (index, parent = new Matrix4()) => {
    const node = asset.nodes[index]
    const local = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(
      new Vector3(...(node.translation || [0, 0, 0])), new Quaternion(...(node.rotation || [0, 0, 0, 1])), new Vector3(...(node.scale || [1, 1, 1])))
    const world = parent.clone().multiply(local)
    transforms.push({ name: node.name, matrix: world.toArray() })
    for (const primitive of asset.meshes?.[node.mesh]?.primitives || []) {
      const accessor = asset.accessors[primitive.attributes.POSITION]
      bounds.union(new Box3(new Vector3(...accessor.min), new Vector3(...accessor.max)).applyMatrix4(world))
      primitives.push({ triangles: (asset.accessors[primitive.indices]?.count || accessor.count) / 3,
        vertices: accessor.count, attributes: Object.keys(primitive.attributes), material: asset.materials[primitive.material]?.name })
    }
    node.children?.forEach(child => visit(child, world))
  }
  asset.scenes[asset.scene || 0].nodes.forEach(index => visit(index))
  const dependencies = [...(asset.buffers || []), ...(asset.images || [])].map(item => item.uri).filter(Boolean)
  const missing = dependencies.filter(uri => !fs.existsSync(path.join(directory, uri)))
  if (missing.length) throw Error(`${file}: missing ${missing.join(', ')}`)
  return { name: file.slice(0, -5), format: asset.asset, size: bounds.getSize(new Vector3()).toArray(),
    min: bounds.min.toArray(), max: bounds.max.toArray(), triangles: primitives.reduce((n, p) => n + p.triangles, 0),
    primitives, transforms, materials: asset.materials, dependencies,
    bytes: [file, ...dependencies].reduce((n, uri) => n + fs.statSync(path.join(directory, uri)).size, 0) }
})
fs.mkdirSync('artifacts/forest', { recursive: true })
fs.writeFileSync('artifacts/forest/asset-audit.json', JSON.stringify(rows, null, 2) + '\n')
console.table(rows.map(({ name, size, triangles, primitives }) => ({ name, size: size.map(n => n.toFixed(2)).join(' × '), triangles, parts: primitives.length })))
console.log(`Audited ${rows.length} glTFs; all buffer and texture dependencies exist.`)
