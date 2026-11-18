import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { Group, Matrix3, PerspectiveCamera, Vector2, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { buildBrushGeometry, isBrushTarget } from './surfaceBrushGeometry.js'
import { SurfaceBrush } from './SurfaceBrush.js'
import { createBrushState } from './surfaceBrushState.js'

test('painted Cyclone panels use intrinsic charts without touching hardware or source geometry', async () => {
  globalThis.self = globalThis
  globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} })
  const bytes = fs.readFileSync('public/models/mospeada/cyclone-vr052f.glb')
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), '')
  const root = new Group(); root.name = 'Cyclone_riding_vehicle'; root.add(gltf.scene)
  const targets = []
  root.traverse(o => { if (o.material && isBrushTarget(o, o.material)) targets.push(o) })
  assert.equal(targets.length, 70, 'All painted body panels and guards, including both mirrored covers')
  assert.ok(targets.every(o => !/Fork_|Headlight_|Left_|Right_|Círculo|Display_/.test(o.userData.sourcePiece)))
  const object = targets.find(o => /^tapa-up/.test(o.userData.sourcePiece)), source = object.geometry, before = source.attributes.position.array.slice()
  const { geometry, report } = buildBrushGeometry(source, n => n.x > 0.1 && n.y > 0.18)
  assert.equal(report.exteriorTriangles, 7); assert.equal(report.excludedTriangles, 21)
  assert.equal(report.charts, 1); assert.equal(report.cutEdges, 1)
  assert.deepEqual(source.attributes.position.array, before)
  assert.equal(source.getAttribute('aBrushAtlas'), undefined)
  assert.deepEqual(geometry.attributes.position.array, before)
  const p = geometry.attributes.position, atlas = geometry.attributes.aBrushAtlas, mask = geometry.attributes.aBrushData
  for (let i = 0; i < p.count; i += 3) if (mask.getX(i)) for (let k = 0; k < 3; k++) {
    const a = i + k, b = i + (k + 1) % 3
    const distance = new Vector3().fromBufferAttribute(p, a).distanceTo(new Vector3().fromBufferAttribute(p, b))
    const A = new Vector2(atlas.getX(a) * report.atlasSize[0], atlas.getY(a) * report.atlasSize[1])
    const B = new Vector2(atlas.getX(b) * report.atlasSize[0], atlas.getY(b) * report.atlasSize[1])
    assert.ok(Math.abs(A.distanceTo(B) - distance) < 1e-6, 'Triangle lengths must survive unfolding')
  }
  const brush = new SurfaceBrush(createBrushState())
  for (const target of targets) {
    const item = brush.attach(target, target.material)
    for (const key of ['aBrushAtlas', 'aBrushEdgeDistance', 'aBrushData', 'aBrushBikeZ']) assert.ok(item.geometry.attributes[key].array.every(Number.isFinite), target.userData.sourcePiece)
    assert.equal(target.geometry, item.sourceGeometry)
    assert.ok(item.uniforms.uBrushPanel.value.y >= item.uniforms.uBrushPanel.value.x)
  }
  const attachment = brush.attach(object, object.material)
  const covers = [...brush.attachments].filter(a => /^tapa-up/.test(a.object.userData.sourcePiece))
  assert.equal(covers.length, 2)
  assert.ok(Math.abs(covers[0].uniforms.uBrushPanelDelay.value - covers[1].uniforms.uBrushPanelDelay.value) > 0.04, 'Mirrored covers must have visibly different timing')
  for (const a of brush.attachments) assert.ok(a.uniforms.uBrushPanelDelay.value >= 0.02 && a.uniforms.uBrushPanelDelay.value <= 0.24)
  const camera = new PerspectiveCamera(); camera.position.set(2, 3, 4); camera.lookAt(0, 0, 0)
  for (const angles of [[0, 0, 0], [0.2, 1.1, -0.5], [-0.3, -2, 0.4]]) {
    root.rotation.set(...angles); root.position.set(12, 4, -30); brush.sync(camera)
    const local = new Vector3(0.3, 0.88, 0.35).normalize()
    const normalMatrix = new Matrix3().getNormalMatrix(brush.modelView)
    const recovered = local.clone().applyMatrix3(normalMatrix).normalize().applyMatrix3(attachment.uniforms.uBrushViewToLocalNormal.value).normalize()
    assert.ok(recovered.distanceTo(local) < 1e-10, 'Turning, leaning and camera changes cannot slide the local normal field')
  }
  object.geometry = attachment.geometry; brush.dispose(); assert.equal(object.geometry, source)
  geometry.dispose()
})

test('staggered brush sequence lasts 0.87 seconds, slow playback lasts four times longer, and PBR pauses it', () => {
  const store = createBrushState(), brush = new SurfaceBrush(store, () => 0.5)
  store.set({ automatic: false }); store.play(); brush.tick(0, true)
  brush.tick(0.435, true); assert.ok(Math.abs(brush.progress - 0.5) < 1e-10)
  brush.tick(10, false); assert.ok(Math.abs(brush.progress - 0.5) < 1e-10)
  brush.tick(0.435, true); assert.equal(brush.playing, false); assert.equal(brush.uniforms.uBrushProgress.value, -1)
  store.set({ slow: true }); store.play(); brush.tick(0, true); brush.tick(1.74, true)
  assert.ok(Math.abs(brush.progress - 0.5) < 1e-10)
  brush.tick(1.74, true); assert.equal(brush.playing, false)
  store.scrub(0.42); brush.tick(5, true)
  assert.equal(brush.uniforms.uBrushProgress.value, 0.42); assert.equal(brush.playing, false)
})

test('automatic brush stops at rest, follows speed immediately and preserves manual inspection', () => {
  const store = createBrushState(), brush = new SurfaceBrush(store, () => 0.5)
  brush.tick(100, true, 1, 0); assert.equal(brush.playing, false)
  brush.tick(2, true, 1, 5); assert.equal(brush.playing, false)
  const slowPause = brush.pauseSeconds
  brush.tick(0.05, true, 1, 70); assert.equal(brush.playing, true)
  assert.ok(brush.pauseSeconds < 0.06 && slowPause > 4)
  brush.tick(0.4, true, 1, 70); const progress = brush.progress
  brush.tick(2, true, 1, 70, true); assert.equal(brush.progress, progress, 'Pause freezes the sweep')
  brush.tick(0.01, true, 1, 0); assert.equal(brush.playing, false); assert.equal(brush.uniforms.uBrushProgress.value, -1)
  store.play(); brush.tick(0, true, 1, 0); assert.equal(brush.playing, true)
  store.set({ enabled: false, direction: -1, sensitivity: 2, color: '#cceeff', speed: 2 })
  brush.tick(1, true)
  assert.equal(brush.uniforms.uBrushEnabled.value, 0); assert.equal(brush.uniforms.uBrushDirection.value, -1)
  assert.equal(brush.uniforms.uBrushColor.value.getHexString(), 'cceeff')
})

test('automatic brush cadence increases monotonically with speed', () => {
  const counts = [0, 5, 25, 45, 70].map(speed => {
    const brush = new SurfaceBrush(createBrushState(), () => 0.5)
    let count = 0, previous = false
    for (let i = 0; i < 120 * 20; i++) {
      brush.tick(1 / 120, true, 1, speed)
      if (brush.playing && !previous) count++
      previous = brush.playing
    }
    return count
  })
  assert.equal(counts[0], 0)
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i] > counts[i - 1], counts.join(','))
  assert.ok(counts.at(-1) >= 20)
})
