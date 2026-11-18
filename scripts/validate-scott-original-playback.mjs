import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { connect } from './browser-cdp.mjs'

const source = fs.readFileSync('assets/scott-bernard-animated.glb'), runtime = fs.readFileSync('public/models/mospeada/scott-bernard-animated-original.glb')
assert.ok(source.equals(runtime), 'The game must load a byte-for-byte copy of the original')
const directory = 'artifacts/scott-original', c = await connect(), wait = ms => new Promise(resolve => setTimeout(resolve, ms))
fs.mkdirSync(directory, { recursive: true })
async function ready(expression) { for (let i = 0; i < 300; i++) { if (await c.evaluate(expression).catch(() => false)) return; await wait(200) } throw Error('Original playback did not become ready') }
async function shot(name) { await wait(200); fs.writeFileSync(`${directory}/${name}.png`, Buffer.from((await c.send('Page.captureScreenshot', { format: 'png' })).data, 'base64')) }
try {
  await c.send('Page.bringToFront')
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await c.send('Page.navigate', { url: 'http://127.0.0.1:5173/' })
  await ready('!!window.__SCOTT_ORIGINAL__ && !!window.__ANIME__?.state.snapshot().ready && !document.querySelector("#entry-preloader")')
  const report = { sourceSha256: createHash('sha256').update(source).digest('hex'), byteIdenticalRuntimeCopy: true, startupGLError: await c.evaluate('__ANIME__.renderer.getContext().getError()') }
  Object.assign(report, await c.evaluate(`(async()=>{
    const d=__SCOTT_ORIGINAL__,{clone}=await import('/node_modules/three/examples/jsm/utils/SkeletonUtils.js');
    const reference=clone(d.source.scene),referenceBones=new Map(),visible=d.instance;
    reference.traverse(n=>{if(n.isBone)referenceBones.set(n.name,n)});
    const mixer=new visible.mixer.constructor(reference);
    window.__ORIGINAL_REFERENCE__={model:reference,bones:referenceBones,mixer};
    let sourceMesh;d.source.scene.traverse(n=>{if(n.isSkinnedMesh)sourceMesh=n});
    const mesh=visible.skins[0].mesh;
    return{bones:visible.bones.size,meshes:visible.skins.length,vertices:mesh.geometry.attributes.position.count,triangles:mesh.geometry.index.count/3,sharedOriginalGeometry:mesh.geometry===sourceMesh.geometry,sharedOriginalSkinIndices:mesh.geometry.attributes.skinIndex.array===sourceMesh.geometry.attributes.skinIndex.array,sharedOriginalWeights:mesh.geometry.attributes.skinWeight.array===sourceMesh.geometry.attributes.skinWeight.array,clips:d.source.animations.map(c=>({name:c.name,duration:c.duration,tracks:c.tracks.length})),cameraActive:__MOSPEADA__.runtime.orbit.enabled,preview:__MOSPEADA__.runtime.scottPreview};
  })()`))
  assert.equal(report.bones, 24); assert.equal(report.meshes, 1); assert.equal(report.vertices, 15429); assert.equal(report.triangles, 10334)
  assert.ok(report.sharedOriginalGeometry && report.sharedOriginalSkinIndices && report.sharedOriginalWeights)
  assert.equal(report.clips.length, 16); assert.ok(report.cameraActive && report.preview)
  report.samples = []
  for (const clip of report.clips) for (const fraction of [0.15, 0.45, 0.75]) {
    await c.evaluate(`__SCOTT_ORIGINAL__.playback.select(${JSON.stringify(clip.name)});__SCOTT_ORIGINAL__.playback.scrub(${fraction})`)
    await ready(`__SCOTT_ORIGINAL__.instance.clip===${JSON.stringify(clip.name)} && __SCOTT_ORIGINAL__.instance.lastSeek===__SCOTT_ORIGINAL__.playback.snapshot().seekRequest`)
    const result = await c.evaluate(`(()=>{
      const d=__SCOTT_ORIGINAL__,r=__ORIGINAL_REFERENCE__,clip=d.source.animations.find(c=>c.name===${JSON.stringify(clip.name)}),time=${fraction}*clip.duration;
      r.mixer.stopAllAction();const action=r.mixer.clipAction(clip).reset().play();action.time=time;r.mixer.update(0);
      let rotationError=0,positionError=0,scaleError=0;
      for(const[name,bone]of d.instance.bones){const ref=r.bones.get(name),a=bone.quaternion.toArray(),b=ref.quaternion.toArray();const difference=Math.min(Math.max(...a.map((q,i)=>Math.abs(q-b[i]))),Math.max(...a.map((q,i)=>Math.abs(q+b[i]))));rotationError=Math.max(rotationError,difference);positionError=Math.max(positionError,bone.position.distanceTo(ref.position));scaleError=Math.max(scaleError,bone.scale.distanceTo(ref.scale))}
      return{clip:clip.name,fraction:${fraction},rotationError,positionError,scaleError,originalClipObject:d.instance.action.getClip()===clip,actionActive:d.instance.action.isRunning()};
    })()`)
    assert.ok(result.rotationError < 1e-10 && result.positionError < 1e-9 && result.scaleError < 1e-9 && result.originalClipObject && result.actionActive, JSON.stringify(result))
    report.samples.push(result)
    if (fraction === 0.45 && ['Walking', 'Running', 'air_squat'].includes(clip.name)) await shot(clip.name + '-original-in-game')
  }
  // Map switching cannot affect a bone, geometry, index or weight.
  await c.evaluate(`__SCOTT_ORIGINAL__.playback.select('rest');__SCOTT_ORIGINAL__.playback.set({cleanShoulders:false,playing:false})`)
  await ready("__SCOTT_ORIGINAL__.instance.clip==='rest' && __SCOTT_ORIGINAL__.instance.clean===false")
  await shot('rest-original-textures')
  report.originalMaterialRestored = await c.evaluate('__SCOTT_ORIGINAL__.instance.skins.every(s=>s.mesh.material===s.original)')
  await c.evaluate('__SCOTT_ORIGINAL__.playback.set({cleanShoulders:true})')
  await ready('__SCOTT_ORIGINAL__.instance.clean===true'); await shot('rest-clean-shoulders')
  report.textureOnly = await c.evaluate('(()=>{const d=__SCOTT_ORIGINAL__;let m;d.source.scene.traverse(n=>{if(n.isSkinnedMesh)m=n});return d.instance.skins.every(s=>s.mesh.geometry===m.geometry&&s.mesh.skeleton.bones.length===24)})()')
  assert.ok(report.originalMaterialRestored && report.textureOnly)
  report.errors = await c.evaluate('({shader:__ANIME__.state.snapshot().error,gl:__ANIME__.renderer.getContext().getError()})')
  assert.equal(report.errors.shader, ''); assert.equal(report.errors.gl, 0)
  fs.writeFileSync(`${directory}/validation.json`, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ ...report, clips: report.clips.length, samples: report.samples.length }, null, 2))
} finally {
  await c.evaluate(`if(window.__SCOTT_ORIGINAL__){__SCOTT_ORIGINAL__.playback.select('Cyclone_RidingPose');__SCOTT_ORIGINAL__.playback.set({cleanShoulders:true,playing:true});delete window.__ORIGINAL_REFERENCE__}`).catch(() => {})
  c.close()
}
