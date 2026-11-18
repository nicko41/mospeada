import * as T from 'three'

// Locate the real outward-facing lens, rather than a box centre inside its housing.
function emittingFace(mesh, body) {
  const positions = mesh.geometry.attributes.position, index = mesh.geometry.index
  const triangle = new T.Triangle(), center = new T.Vector3(), normal = new T.Vector3(), n = new T.Vector3()
  const transform = body.matrixWorld.clone().invert().multiply(mesh.matrixWorld)
  let area = 0
  for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
    for (const [k, vertex] of [triangle.a, triangle.b, triangle.c].entries()) vertex.fromBufferAttribute(positions, index ? index.getX(i + k) : i + k).applyMatrix4(transform)
    triangle.getNormal(n)
    if (n.z < 0.55) continue
    const weight = triangle.getArea()
    center.addScaledVector(triangle.getMidpoint(new T.Vector3()), weight)
    normal.addScaledVector(n, weight); area += weight
  }
  if (area === 0) throw Error('No se encontró la cara emisora del faro: ' + mesh.name)
  return { center: center.divideScalar(area), normal: normal.normalize() }
}

export function createCycloneLights(body, surfaces) {
  body.updateWorldMatrix(true, true)
  const glasses = surfaces.filter(mesh => mesh.userData.sourcePiece === 'Headlight_Front_Glass')
  const triangles = surfaces.filter(mesh => mesh.userData.sourcePiece === 'faro-yellow'
    && mesh.material.color.r > mesh.material.color.g && mesh.material.color.b < mesh.material.color.g * 0.35)
  if (glasses.length !== 2 || triangles.length !== 2) throw Error('Cyclone necesita dos ópticas frontales y dos triangulares ámbar.')
  const luminous = []
  function illuminate(mesh, color, intensity) {
    mesh.material = mesh.material.clone()
    const originalIntensity = mesh.material.emissive.getHex() === 0 ? 0 : mesh.material.emissiveIntensity
    mesh.material.emissive.copy(color)
    luminous.push({ mesh, material: mesh.material, originalIntensity, nightIntensity: intensity })
  }
  const white = new T.Color('#fff3de')
  for (const mesh of surfaces.filter(mesh => /^Headlight_Armor_(Main_Optic|Lower_Optic_[AB])$/.test(mesh.userData.sourcePiece))) illuminate(mesh, white, 10)
  for (const glass of glasses) {
    illuminate(glass, white, 0.85)
    glass.castShadow = false // A clear lens must not cast an opaque shadow over its own beam.
  }
  for (const triangle of triangles) illuminate(triangle, triangle.material.color, 2)

  function makeLight(mesh, kind) {
    const face = emittingFace(mesh, body), main = kind === 'headlight'
    const color = main ? white : mesh.material.color
    // The front lenses are tilted upward as pieces of bodywork. Their internal
    // optics aim a low road beam; amber lenses emit along their own outward normal.
    const direction = main ? new T.Vector3(face.normal.x * 0.2, -0.065, 1).normalize() : face.normal.clone()
    const light = new T.SpotLight(color, 0, main ? 75 : 13, main ? 0.31 : 0.52, main ? 0.72 : 0.8, 2)
    light.name = `Cyclone_${kind}_${face.center.x > 0 ? 'left' : 'right'}`
    light.position.copy(face.center).addScaledVector(face.normal, 0.012)
    light.target.position.copy(light.position).addScaledVector(direction, main ? 40 : 10)
    if (main) {
      light.castShadow = true; light.shadow.mapSize.set(1024, 1024)
      light.shadow.camera.near = 0.03; light.shadow.camera.far = 75
      light.shadow.bias = -0.00008; light.shadow.normalBias = 0.012
    }
    body.add(light, light.target)
    return { light, lens: mesh, face, direction, nightIntensity: main ? 2400 : 65 }
  }
  const headlights = glasses.map(mesh => makeLight(mesh, 'headlight'))
  const amberLights = triangles.map(mesh => makeLight(mesh, 'amber'))
  function update(day) {
    const night = T.MathUtils.clamp(1 - day, 0, 1)
    for (const item of luminous) item.material.emissiveIntensity = item.originalIntensity + item.nightIntensity * night
    for (const item of [...headlights, ...amberLights]) {
      item.light.intensity = item.nightIntensity * night
      item.light.visible = night > 0.001
    }
  }
  update(1)
  return { headlights, amberLights, luminous, update }
}
