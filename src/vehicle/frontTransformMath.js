import { Matrix4, Quaternion, Vector3 } from 'three'

// Preserve CHEST's opening interval; compress the remaining tank/rear motion
// into .22 -> .64 of the existing clock, without retiming the wheel sockets.
export function rearAssemblyProgress(progress){return progress<=.22?progress:Math.min(1,.22+(progress-.22)*.78/.42)}

// Main assembly clock: CHEST snaps into place first; covers and tank follow.
export function sampleFrontSequence(progress){
  const ramp=(a,b)=>{const t=Math.max(0,Math.min(1,(progress-a)/(b-a)));return t*t*(3-2*t)}
  return{chest:ramp(0,.22),covers:ramp(.22,.36),coverFit:ramp(.36,.48),arms:ramp(.48,.62),legs:ramp(.62,.9),legLift:ramp(.22,.64)*(1-ramp(.86,1)),leftToeDown:ramp(.86,1),rightToeDown:ramp(.22,.64),fold:ramp(.22,.32),slide:ramp(.32,.64),tankTurn:ramp(.64,.86),tankFit:ramp(.86,1)}
}

const geometryHashes=new WeakMap()
// Stable across mesh ordering and GLTFLoader instances. Geometry stays intact.
export function frontGeometryKey(mesh) {
  const p = mesh.geometry.attributes.position
  const cached=geometryHashes.get(p)
  if(cached?.version===p.version)return `${mesh.userData.assembly}|${mesh.userData.sourcePiece}|${p.count}|${cached.hash}`
  let hash = 2166136261
  const add = n => { hash = Math.imul(hash ^ n, 16777619) >>> 0 }
  add(p.count)
  for (let i = 0; i < p.count; i++) for (let k = 0; k < 3; k++) add(Math.round(p.array[i * p.itemSize + k] * 1e5))
  const key=hash.toString(16);geometryHashes.set(p,{version:p.version,hash:key})
  return `${mesh.userData.assembly}|${mesh.userData.sourcePiece}|${p.count}|${key}`
}

// 3D LAB bakes edits into Vertex.point. Recover a single affine displacement
// from matching vertex IDs, then reject it if it cannot be represented by TRS.
export function fitPieceTransform(original, target, tolerance = 1e-5) {
  const lookup = new Map(target.vertices.map(v => [v.id, v.point]))
  const pairs = original.vertices.filter(v => lookup.has(v.id)).map(v => [new Vector3(...v.point), new Vector3(...lookup.get(v.id))])
  if (pairs.length < 3) throw Error('Faltan tres vértices comunes no colineales')
  const [a, b] = pairs[0]
  const longest = fn => pairs.reduce((best, pair) => fn(pair) > fn(best) ? pair : best)
  const p1 = longest(([v]) => v.distanceToSquared(a)), x = p1[0].clone().sub(a), tx = p1[1].clone().sub(b)
  const p2 = longest(([v]) => new Vector3().crossVectors(x, v.clone().sub(a)).lengthSq())
  const y = p2[0].clone().sub(a), ty = p2[1].clone().sub(b), normal = new Vector3().crossVectors(x, y)
  if (normal.length() < 1e-12) throw Error('Los vértices comunes son colineales')
  normal.normalize()
  const p3 = longest(([v]) => Math.abs(v.clone().sub(a).dot(normal)))
  let z = p3[0].clone().sub(a), tz = p3[1].clone().sub(b)
  const planar = Math.abs(z.dot(normal)) < x.length() * 1e-5
  if (planar) {
    z = normal.multiplyScalar(x.length())
    tz = new Vector3().crossVectors(tx, ty).normalize().multiplyScalar(x.length() * Math.sqrt(tx.length() * ty.length() / (x.length() * y.length())))
  }
  const from = new Matrix4().makeBasis(x, y, z).setPosition(a), to = new Matrix4().makeBasis(tx, ty, tz).setPosition(b)
  const matrix = to.multiply(from.invert()), position = new Vector3(), rotation = new Quaternion(), scale = new Vector3()
  matrix.decompose(position, rotation, scale)
  const trs = new Matrix4().compose(position, rotation, scale)
  const error = Math.max(...pairs.map(([v, target]) => v.clone().applyMatrix4(trs).distanceTo(target)))
  if (!Number.isFinite(error) || error > tolerance) throw Error(`La edición no es un TRS único: error ${error.toPrecision(4)} m`)
  return { matrix: trs, error, commonVertices: pairs.length, planar }
}
