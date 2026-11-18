import fs from 'node:fs'

export function readGlb(file) {
  const bytes = fs.readFileSync(file), jsonLength = bytes.readUInt32LE(12)
  const doc = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength).trim())
  const start = 20 + jsonLength
  return { bytes, doc, bin: bytes.subarray(start + 8, start + 8 + bytes.readUInt32LE(start)) }
}

export function accessorData(glb, index) {
  const a = glb.doc.accessors[index], v = glb.doc.bufferViews[a.bufferView]
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type]
  const types = { 5121: ['getUint8', 1], 5123: ['getUint16', 2], 5125: ['getUint32', 4], 5126: ['getFloat32', 4] }
  const [method, size] = types[a.componentType], stride = v.byteStride || size * components
  const view = new DataView(glb.bin.buffer, glb.bin.byteOffset, glb.bin.byteLength), offset = (v.byteOffset || 0) + (a.byteOffset || 0)
  const values = Array.from({ length: a.count }, (_, i) => Array.from({ length: components }, (_, k) => view[method](offset + i * stride + k * size, true)))
  return { accessor: a, values, components, size, stride, offset }
}

export function writeGlb(file, doc, binary) {
  const json = Buffer.from(JSON.stringify(doc)), jsonLength = (json.length + 3) & ~3, binLength = (binary.length + 3) & ~3
  const bytes = Buffer.alloc(12 + 8 + jsonLength + 8 + binLength)
  bytes.writeUInt32LE(0x46546c67, 0); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8)
  bytes.writeUInt32LE(jsonLength, 12); bytes.writeUInt32LE(0x4e4f534a, 16); bytes.fill(32, 20, 20 + jsonLength); json.copy(bytes, 20)
  const start = 20 + jsonLength; bytes.writeUInt32LE(binLength, start); bytes.writeUInt32LE(0x004e4942, start + 4); binary.copy(bytes, start + 8)
  fs.writeFileSync(file, bytes)
}
