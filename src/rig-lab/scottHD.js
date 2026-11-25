import * as T from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js'
import {clone} from 'three/addons/utils/SkeletonUtils.js'
import {parseCycloneScottActions} from '../vehicle/cycloneScottActions.js'
const ui=id=>document.getElementById(id),renderer=new T.WebGLRenderer({antialias:true}),scene=new T.Scene(),camera=new T.PerspectiveCamera(36,innerWidth/innerHeight,.01,100),orbit=new OrbitControls(camera,renderer.domElement)
renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;document.body.append(renderer.domElement)
scene.background=new T.Color('#53616a');scene.add(new T.HemisphereLight('#ffffff','#788392',2))
for(const p of [[3,4,5],[-4,3,-3]]){const l=new T.DirectionalLight('#ffffff',2.5);l.position.fromArray(p);scene.add(l)}
const loader=new GLTFLoader(),state={model:null,wrapper:null,mixer:null,action:null,helper:null,center:new T.Vector3(0,.9,0),span:1.8},cache={}
let generation=0,proof,authored,clips,bodyMaps
function frame(){state.wrapper.updateMatrixWorld(true);const box=new T.Box3().setFromObject(state.wrapper,true);box.getCenter(state.center);const size=box.getSize(new T.Vector3());state.span=Math.max(size.x,size.y,size.z)}
function view(name='front'){
 const target=state.center.clone(),distance=Math.max(2.5,state.span*1.8),offset=name==='side'?new T.Vector3(distance,.15,0):new T.Vector3(.15,.15,name==='back'?-distance:distance)
 if(name==='head'){state.bones.get('mixamorigHead').getWorldPosition(target);target.y+=.10;offset.set(.40,.08,.80)}
 orbit.target.copy(target);camera.position.copy(target).add(offset);orbit.update()
}
function pose(){
 if(!state.model)return
 state.mixer.stopAllAction();state.action=null;state.wrapper.position.set(0,0,0);state.wrapper.quaternion.identity();state.wrapper.scale.setScalar(1)
 for(const [b,r]of state.rest){b.position.copy(r.position);b.quaternion.copy(r.quaternion);b.scale.copy(r.scale)}
 const name=ui('clip').value
 if(name.startsWith('proof:')){
  const preset=proof.poses.find(p=>p.name===name.slice(6));state.wrapper.position.fromArray(preset.wrapper.position);state.wrapper.quaternion.fromArray(preset.wrapper.quaternion);state.wrapper.scale.fromArray(preset.wrapper.scale)
  for(const r of preset.bones){const b=state.bones.get(r.name);b.position.fromArray(r.position);b.quaternion.fromArray(r.quaternion);b.scale.fromArray(r.scale)}
 }else{
  const clip=clips.find(c=>c.name===name);if(clip){state.action=state.mixer.clipAction(clip).reset().play();state.action.time=Math.min(clip.duration-1e-5,Number(ui('time').value)*clip.duration);state.mixer.update(0)}
 }
 state.wrapper.updateMatrixWorld(true);frame()
}
async function select(){
 const token=++generation,name=ui('model').value;ui('metrics').textContent='Cargando…'
 cache[name]||=loader.loadAsync(`/models/mospeada/scott-bernard-${name==='hd'?'hd-hybrid-v2':'animated-original'}.glb`)
 const asset=await cache[name];if(token!==generation)return
 state.mixer?.stopAllAction();state.helper?.removeFromParent();state.helper?.dispose();state.wrapper?.removeFromParent()
 state.model=clone(asset.scene);state.wrapper=new T.Group();state.wrapper.add(state.model);scene.add(state.wrapper);state.bones=new Map();state.rest=new Map()
 let triangles=0
 state.model.traverse(n=>{if(n.isBone){state.bones.set(n.name,n);state.rest.set(n,{position:n.position.clone(),quaternion:n.quaternion.clone(),scale:n.scale.clone()})}if(n.isMesh){n.frustumCulled=false;triangles+=(n.geometry.index?.count||n.geometry.attributes.position.count)/3;if(n.name==='char1'){n.material=n.material.clone();[n.material.map,n.material.normalMap,n.material.roughnessMap]=bodyMaps;n.material.metalnessMap=bodyMaps[2]}}})
 state.mixer=new T.AnimationMixer(state.model);state.helper=new T.SkeletonHelper(state.model);scene.add(state.helper);state.helper.visible=ui('skeleton').checked
 pose();view();ui('metrics').textContent=`${name==='hd'?'Scott HD V2':'Scott original'} · ${triangles.toLocaleString('es-AR')} triángulos\n24 huesos · 16 clips originales + conducción\nCabeza → Head · pechera → Spine2\nMouse: órbita · rueda: zoom\nLas poses del juego son muestras verificadas; los clips sí se reproducen.`
}
ui('model').onchange=()=>select().catch(showError);ui('clip').onchange=()=>{pose();view()};ui('time').oninput=pose;ui('skeleton').onchange=()=>{if(state.helper)state.helper.visible=ui('skeleton').checked}
document.querySelectorAll('[data-view]').forEach(b=>{b.onclick=()=>view(b.dataset.view)})
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()})
let previous=performance.now()
renderer.setAnimationLoop(now=>{const dt=Math.min(.1,(now-previous)/1000);previous=now;if(ui('play').checked&&state.action){const c=state.action.getClip();ui('time').value=(Number(ui('time').value)+dt/c.duration)%1;state.action.time=Number(ui('time').value)*c.duration;state.mixer.update(0);state.wrapper.updateMatrixWorld(true)}orbit.update();renderer.render(scene,camera)})
function showError(error){ui('metrics').textContent=error.message;console.error(error)}
const textureLoader=new T.TextureLoader()
Promise.all([fetch('/models/mospeada/scott-hd-v2-proof.json').then(r=>r.json()),fetch('/animations/scott-cyclone-actions.json').then(r=>r.json()),loader.loadAsync('/models/mospeada/scott-bernard-animated-original.glb'),Promise.all(['decals','normal','roughness'].map(name=>textureLoader.loadAsync(`/models/mospeada/scott-shoulders-${name}.png`)))]).then(([p,a,source,maps])=>{
 bodyMaps=maps;maps.forEach((map,i)=>{map.flipY=false;map.colorSpace=i===0?T.SRGBColorSpace:T.NoColorSpace;map.needsUpdate=true})
 proof=p;authored=a;clips=[...source.animations,...parseCycloneScottActions(authored)];cache.original=Promise.resolve(source)
 for(const clip of clips){const option=document.createElement('option');option.value=clip.name;option.textContent=clip.name;ui('clip').append(option)}
 return select()
}).catch(showError)
