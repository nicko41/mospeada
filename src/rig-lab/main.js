import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { createCycloneRig } from '../vehicle/cycloneRig.js'
import { createBikeState } from '../vehicle/bikePhysics.js'
import { bikeConfig } from '../vehicle/bikeConfig.js'
import { rigBones, applyTestPose, copyDrivingPose } from './testPoses.js'

const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(innerWidth, innerHeight)
renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2
document.body.append(renderer.domElement)
const scene = new T.Scene(); scene.background = new T.Color('#53616a')
const camera = new T.PerspectiveCamera(38, innerWidth / innerHeight, 0.01, 100)
const orbit = new OrbitControls(camera, renderer.domElement); orbit.enableDamping = true
scene.add(new T.HemisphereLight('#ffffff', '#adb5c1', 2))
for (const [position, intensity] of [[[3, 4, 5], 3], [[-4, 3, -3], 2]]) {
  const light = new T.DirectionalLight('#ffffff', intensity); light.position.set(...position); scene.add(light)
}
const floor = new T.Mesh(new T.PlaneGeometry(200, 200), new T.MeshStandardMaterial({ color: '#414a50', roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.01; scene.add(floor)
const grid = new T.GridHelper(8, 40, '#8a999a', '#586569'); scene.add(grid)
const loader = new GLTFLoader(), sources = {}, ui = id => document.getElementById(id)
let active, helper, mixer, bike, driving, originalRig, baselines
const colors = ['#78a8f2', '#ffd37b', '#dc8cbd', '#8fce91', '#65cee3', '#db9e74', '#bba0ed', '#e8e993', '#c35e68', '#a4b6c8', '#cdb390', '#7ccab5', '#c6cce9', '#f4c1a2', '#afc07c', '#89b7d7']
function view(back = false) {
  const riding = ui('pose').value === 'driving'
  const raised = ui('pose').value === 'shoulders'
  orbit.target.set(0, raised ? 1.05 : riding ? 1 : 0.9, 0)
  camera.position.set(riding ? 3.3 : 0, riding ? 2 : 1.5, back ? -4.4 : 4.4)
  orbit.update()
}
async function select() {
  const name = ui('model').value, pose = ui('pose').value
  if (!sources[name]) sources[name] = await loader.loadAsync(`/assets/scott-bernard-gear${name === 'hybrid' ? '-hybrid' : ''}.glb`)
  if (active) scene.remove(active); if (helper) scene.remove(helper); if (bike) scene.remove(bike)
  mixer?.stopAllAction(); mixer = null
  active = clone(sources[name].scene); scene.add(active); active.updateMatrixWorld(true)
  const bones = rigBones(active)
  applyTestPose(active, pose)
  if (pose === 'driving') {
    if (!originalRig) {
      sources.original ||= await loader.loadAsync('/assets/scott-bernard-gear.glb')
      driving = await loader.loadAsync('/models/mospeada/cyclone-vr052f.glb')
      const pose = await (await fetch('/models/mospeada/scott-riding-pose.json')).json()
      originalRig = createCycloneRig(driving.scene, sources.original.scene, pose)
      const s = createBikeState({ x: 0, z: 0, yaw: 0 }, originalRig.metrics, () => 0); s.idleBlend = 0; originalRig.update(s, () => 0, bikeConfig)
    }
    const root = copyDrivingPose(active, originalRig)
    root.visible = false; bike = originalRig.root; scene.add(bike)
  }
  if (['Running', 'Walking'].includes(pose)) { mixer = new T.AnimationMixer(active); mixer.clipAction(sources[name].animations.find(a => a.name === pose)).play() }
  active.updateMatrixWorld(true)
  const skin = []; active.traverse(n => { if (n.isSkinnedMesh) { n.frustumCulled = false; skin.push(n); n.userData.originalMaterial = n.material } })
  baselines = skin
  helper = new T.SkeletonHelper(active); scene.add(helper); helper.visible = ui('skeleton').checked
  colorRegions(); view()
  ui('metrics').textContent = `${name === 'hybrid' ? 'HÍBRIDO' : 'ORIGINAL'} · ${bones.size} huesos\n${skin.length} regiones · ${sources[name].animations.length} clips\n${name === 'hybrid' ? 'Naranja: interfaces pendientes de revisión\n' : ''}${skin.map(n => n.name).join('\n')}`
  window.__RIG_LAB__ = { active, bones, scene, camera, orbit, sources, select, renderer, view, snapshot: () => ({ model: name, pose, meshes: skin.map(n => ({ name: n.name, rigid: n.userData.rigidArmor, bone: n.userData.ownerBone })), bones: [...bones].map(([name, bone]) => ({ name, position: bone.position.toArray(), quaternion: bone.quaternion.toArray(), scale: bone.scale.toArray() })) }) }
}
function colorRegions() {
  baselines?.forEach((mesh, i) => { mesh.material = ui('regions').checked ? new T.MeshStandardMaterial({ color: mesh.userData.reviewRequired ? '#ff861c' : mesh.userData.rigidArmor ? colors[i % colors.length] : '#bb4a52', roughness: 0.7, side: T.DoubleSide }) : mesh.userData.originalMaterial })
}
for (const id of ['model', 'pose']) ui(id).addEventListener('change', () => select().catch(error => { ui('metrics').textContent = error.stack; ui('metrics').classList.add('error') }))
ui('regions').addEventListener('change', colorRegions); ui('skeleton').addEventListener('change', () => { helper.visible = ui('skeleton').checked })
ui('front').onclick = () => view(); ui('back').onclick = () => view(true)
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix() })
let last = performance.now()
renderer.setAnimationLoop(now => { const dt = Math.min((now - last) / 1000, 0.1); last = now; mixer?.update(dt); orbit.update(); renderer.render(scene, camera) })
select().catch(error => { ui('metrics').textContent = error.stack })
