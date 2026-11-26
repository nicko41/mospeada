import test from 'node:test'
import assert from 'node:assert/strict'
import {BufferGeometry,Float32BufferAttribute,Uint16BufferAttribute,SkinnedMesh,MeshBasicMaterial,Bone,Skeleton} from 'three'
import {packTree,unpackTree} from './geometryTransfer.js'
import {skinnedBoundsSteps} from './skinnedBounds.js'
import {prepareResource,usePreparedResource} from './preparedResources.js'
import {scottModelSelection as selection} from '../vehicle/scottModelSelection.js'
import {AnimeRenderer} from '../rendering/AnimeRenderer.js'
import {MeshPhysicalMaterial,Mesh,DoubleSide,BackSide} from 'three'
import {Texture} from 'three'
import {cloneRenderMaterial} from './cloneMaterial.js'
import {PlaneGeometry} from 'three'
import {prepareRideSurfaceGeometrySteps,registerRideSurfaces,sampleRideHeight} from '../vehicle/rideSurface.js'
import {ForestStage4World} from '../world/forest/forestStage4World.js'
import {stage4Anchor} from '../world/forest/forestStage4Config.js'
import {waitForGpuPreparation} from './gpuUploads.js'

test('a future scene waits for the GPU fence and rejects a failed fence',async()=>{
 let polls=0,deleted=0,flushed=0
 const gl={SYNC_GPU_COMMANDS_COMPLETE:1,ALREADY_SIGNALED:2,CONDITION_SATISFIED:3,TIMEOUT_EXPIRED:4,WAIT_FAILED:5,isContextLost:()=>false,fenceSync:()=>({}),flush:()=>flushed++,deleteSync:()=>deleted++,clientWaitSync:(_sync,flags,timeout)=>{assert.equal(flags,0);assert.equal(timeout,0);return ++polls<3?4:3}}
 const queue={submit:async run=>run()}
 await waitForGpuPreparation({getContext:()=>gl},'test',queue)
 assert.equal(polls,3);assert.equal(flushed,1);assert.equal(deleted,1)
 gl.clientWaitSync=()=>5
 await assert.rejects(waitForGpuPreparation({getContext:()=>gl},'test',queue),/GPU fence failed/)
 assert.equal(deleted,2)
})

test('a deferred connector retains the authored exit if the encounter has completed',()=>{
 const world=Object.create(ForestStage4World.prototype),state={z:-2000},encounter={phase:'complete',exitAnchor:{z:-1415}};let anchor
 Object.assign(world,{userData:{streamingPrepared:false},bound:false,pending:null,preparationPeakMs:0,distance:()=>0,bindingSteps:function*(at){anchor=at;yield;this.bound=true}})
 world.prepare(encounter,state);assert.equal(world.bound,false)
 world.userData.streamingPrepared=true
 world.prepare(encounter,state)
 assert.equal(world.bound,true);assert.deepEqual(anchor,stage4Anchor(-1380));assert.equal(state.z,-2000)
})

test('deferred contact grids yield and register the unchanged rendered surface',()=>{
 const geometry=new PlaneGeometry(64,64,64,64);geometry.rotateX(-Math.PI/2)
 const positions=geometry.attributes.position.array.slice(),indices=geometry.index.array.slice(),mesh=new Mesh(geometry,new MeshBasicMaterial());mesh.position.set(1200,7,-1200);mesh.userData.rideSurface=true
 assert.equal(sampleRideHeight(1200,-1200),-Infinity)
 let chunks=0;for(const step of prepareRideSurfaceGeometrySteps(geometry))chunks++
 assert.ok(chunks>1);assert.deepEqual(geometry.attributes.position.array,positions);assert.deepEqual(geometry.index.array,indices)
 const remove=registerRideSurfaces(mesh)
 try{for(const [x,z]of [[1200,-1200],[1180,-1180],[1220,-1220]])assert.ok(Math.abs(sampleRideHeight(x,z)-7)<1e-12)}finally{remove();geometry.dispose();mesh.material.dispose()}
 assert.equal(sampleRideHeight(1200,-1200),-Infinity)
})

test('worker transfer retains every vertex, index, bound and collision metadata',()=>{
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute([1,2,3,4,5,6,-7,8,9],3));geometry.setIndex([0,1,2]);geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.userData={canyonRows:30,rideGridCell:4};geometry.addGroup(0,3,0)
 const buffers=new Set(),packed=packTree({tops:[geometry]},buffers),copy=unpackTree(structuredClone(packed)).tops[0]
 assert.ok(buffers.size>=3)
 for(const [key,a]of Object.entries(geometry.attributes)){assert.deepEqual(copy.attributes[key].array,a.array);assert.equal(copy.attributes[key].itemSize,a.itemSize)}
 assert.deepEqual(copy.index.array,geometry.index.array);assert.deepEqual(copy.boundingBox,geometry.boundingBox);assert.deepEqual(copy.boundingSphere,geometry.boundingSphere);assert.deepEqual(copy.userData,geometry.userData);assert.deepEqual(copy.groups,geometry.groups)
})

test('cooperative skinned bounds match the native algorithm using one frozen pose',()=>{
 const g=new BufferGeometry(),positions=[],indices=[],weights=[]
 for(let i=0;i<2048;i++){positions.push(Math.sin(i)*2,Math.cos(i*.1),i/2048);indices.push(0,1,0,0);weights.push(.35,.65,0,0)}
 g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setAttribute('skinIndex',new Uint16BufferAttribute(indices,4));g.setAttribute('skinWeight',new Float32BufferAttribute(weights,4))
 const root=new Bone(),hand=new Bone();root.add(hand);hand.position.set(.2,.4,.1);const mesh=new SkinnedMesh(g,new MeshBasicMaterial());mesh.add(root);mesh.bind(new Skeleton([root,hand]));hand.rotation.x=.2;mesh.updateMatrixWorld(true);mesh.computeBoundingSphere();const expected=mesh.boundingSphere.clone();mesh.boundingSphere=null
 const steps=skinnedBoundsSteps(mesh);assert.equal(steps.next().done,false);hand.rotation.x=.7;mesh.updateMatrixWorld(true);for(const step of steps)void step
 assert.deepEqual(mesh.boundingSphere,expected);assert.equal(hand.rotation.x,.7)
})

test('prefetch and render share a single prepared resource and propagate errors',async()=>{
 const scope={},value={prepared:true};let calls=0
 const make=async()=>{calls++;return value}
 await Promise.all([prepareResource(scope,'route',make),prepareResource(scope,'route',make)])
 assert.equal(calls,1);assert.equal(usePreparedResource(scope,'route',make),value)
 await assert.rejects(prepareResource(scope,'failed',()=>{throw Error('driver error')}),/driver error/)
 assert.throws(()=>usePreparedResource(scope,'failed',make),/driver error/)
})

test('Scott keeps the current visual until ready and cancels a superseded selection',async()=>{
 selection.ready(true);selection.select('v3')
 let finish;const remove=selection.setLoader(()=>new Promise(resolve=>{finish=resolve}))
 selection.select('v1');assert.equal(selection.snapshot().variant,'v3');assert.equal(selection.snapshot().loading,'v1')
 selection.select('v3');finish();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(selection.snapshot().variant,'v3');assert.equal(selection.snapshot().loading,null)
 selection.select('v2');finish();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(selection.snapshot().variant,'v2');assert.equal(selection.snapshot().loading,null)
 remove();selection.select('v3');selection.ready(false)
})

test('preparation waits for transmission back-face programs and restores the material',async()=>{
 const material=new MeshPhysicalMaterial({transmission:.94,side:DoubleSide}),mesh=new Mesh(new BufferGeometry(),material),calls=[],programs=new Map();let current,ready=false,yields=0
 const effect=Object.create(AnimeRenderer.prototype);effect.camera={};effect.renderer={compile(){calls.push(material.side);current={program:{},isReady:()=>material.side!==BackSide&&calls.length===1||ready};programs.set(material.side,current)},properties:{get:()=>({currentProgram:current,programs})}}
 await effect.compileObject(mesh,mesh,async()=>{yields++;ready=true})
 assert.deepEqual(calls,[DoubleSide,BackSide]);assert.equal(material.side,DoubleSide);assert.equal(material.transmission,.94);assert.ok(yields>0)
 effect.renderer.compile=()=>{if(material.side===BackSide)throw Error('compile failure')}
 assert.throws(()=>effect.compileObject(mesh),/compile failure/);assert.equal(material.side,DoubleSide)
})

test('render variants keep identical maps without serializing image metadata',()=>{
 const texture=new Texture(),source=new MeshPhysicalMaterial({map:texture,roughness:.31,transmission:.94});texture.toJSON=()=>{throw Error('Image serialization blocks gameplay')}
 const metadata=source.userData={settings:{enabled:true,color:'#4488aa'},preview:texture},copy=cloneRenderMaterial(source)
 assert.equal(source.userData,metadata);assert.equal(copy.map,texture);assert.equal(copy.userData.preview,texture);assert.deepEqual(copy.userData.settings,metadata.settings);assert.notEqual(copy.userData.settings,metadata.settings);assert.equal(copy.roughness,source.roughness);assert.equal(copy.transmission,source.transmission)
})
