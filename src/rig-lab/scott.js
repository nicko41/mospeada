import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'

const ui = id => document.getElementById(id), renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.outputColorSpace = T.SRGBColorSpace
renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1; document.body.append(renderer.domElement)
const scene = new T.Scene(); scene.background = new T.Color('#53616a')
const camera = new T.PerspectiveCamera(38, innerWidth / innerHeight, 0.01, 100), orbit = new OrbitControls(camera, renderer.domElement)
scene.add(new T.HemisphereLight('#ffffff', '#788392', 2))
for (const p of [[3, 4, 5], [-4, 3, -3]]) { const l = new T.DirectionalLight('#ffffff', 2.5); l.position.fromArray(p); scene.add(l) }
const floor = new T.Mesh(new T.PlaneGeometry(100, 100), new T.MeshStandardMaterial({ color: '#414b50', roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.01; scene.add(floor)
scene.add(new T.GridHelper(8, 40, '#899c98', '#5b6967'))
const loader = new GLTFLoader(), sources = {}, state = { model: null, mixer: null, action: null, fingers: null, helper: null, bones: null }
function view(name = 'front') {
  if (name === 'hand') {
    const hand = state.bones.get('LeftHand'), p = hand.getWorldPosition(new T.Vector3()).add(new T.Vector3(0.07, 0, 0))
    orbit.target.copy(p); camera.position.copy(p).add(new T.Vector3(0.22, 0.22, 0.38))
  } else if (name === 'shoulders') { orbit.target.set(0, 1.35, 0); camera.position.set(0.65, 1.6, 1.5) }
  else { orbit.target.set(0, 0.9, 0); camera.position.set(name === 'back' ? -0.25 : 0.25, 1.4, name === 'back' ? -3.6 : 3.6) }
  orbit.update()
}
function setClip(name) {
  state.mixer.stopAllAction(); state.action = null
  for (const [bone, data] of state.rest) { bone.position.copy(data.position); bone.quaternion.copy(data.quaternion) }
  const clip = state.asset.animations.find(a => a.name === name)
  if (clip) state.action = state.mixer.clipAction(clip).play()
  ui('clip').value = name; renderPose()
}
function renderPose() {
  if (state.action) {
    state.mixer.setTime(Math.min(state.action.getClip().duration - 1e-5, Number(ui('time').value) * state.action.getClip().duration))
    if (!ui('root').checked) { state.hip.position.x = state.hipRest.x; state.hip.position.z = state.hipRest.z }
  }
  state.model.updateMatrixWorld(true)
}
async function select() {
  const name = ui('model').value
  sources[name] ||= await loader.loadAsync('/assets/scott-bernard-animated.glb')
  if (state.model) scene.remove(state.model)
  if (state.helper) { scene.remove(state.helper); state.helper.dispose() }
  state.mixer?.stopAllAction()
  state.asset = sources[name]; state.model = clone(state.asset.scene); scene.add(state.model)
  state.bones = new Map(); state.rest = new Map()
  state.model.traverse(n => { if (n.isBone) { state.bones.set(n.name.replace(/^mixamorig[:_]?/, ''), n); state.rest.set(n, { position: n.position.clone(), quaternion: n.quaternion.clone() }) } if (n.isMesh) n.frustumCulled = false })
  state.hip = state.bones.get('Hips'); state.hipRest = state.hip.position.clone()
  state.mixer = new T.AnimationMixer(state.model)
  state.helper = new T.SkeletonHelper(state.model); scene.add(state.helper); state.helper.visible = ui('skeleton').checked
  const selected = ui('clip').value
  ui('clip').innerHTML = '<option value="rest">Reposo original</option>' + state.asset.animations.map(a => `<option value="${a.name}">${a.name} · ${a.duration.toFixed(2)} s</option>`).join('')
  setClip(selected || 'rest'); view()
  ui('metrics').textContent = `${name} · ${state.bones.size} huesos\n${state.asset.animations.length} clips conservados\nSin cambios de geometría, pesos ni huesos\nMouse: órbita · rueda: zoom\nClips originales completos · sin IK.`
  window.__SCOTT_LAB__ = { state, scene, renderer, camera, orbit, view, select, setClip, renderPose }
}
ui('model').onchange = select; ui('clip').onchange = () => setClip(ui('clip').value)
ui('time').oninput = ui('root').onchange = renderPose
ui('skeleton').onchange = () => { state.helper.visible = ui('skeleton').checked }
document.querySelectorAll('[data-view]').forEach(button => { button.onclick = () => view(button.dataset.view) })
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix() })
let previous = performance.now()
renderer.setAnimationLoop(now => {
  const delta = Math.min(0.1, (now - previous) / 1000); previous = now
  if (ui('play').checked && state.action) { ui('time').value = (Number(ui('time').value) + delta / state.action.getClip().duration) % 1; renderPose() }
  orbit.update(); renderer.render(scene, camera)
})
select().catch(error => { ui('metrics').textContent = error.stack; console.error(error) })
