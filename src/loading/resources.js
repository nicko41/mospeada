import {useMemo} from 'react'
import {DefaultLoadingManager,LoadingManager,TextureLoader,Texture} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {MeshoptDecoder} from 'meshoptimizer/decoder'
import {ForestFoliageWorldLoader} from '../world/forest/forestFoliageWorldLoader.js'
import {prepareGpu} from './gpuUploads.js'
import {workQueue} from './workQueue.js'

// Keep lossless geometry decoding off the driving thread. GLTFLoader uses
// decodeGltfBufferAsync and transfers buffer views to these shared workers.
if(typeof window!=='undefined'&&typeof Worker!=='undefined')MeshoptDecoder.useWorkers(2)

const base=typeof __PUBLIC_ASSET_BASE__==='undefined'?'':__PUBLIC_ASSET_BASE__
export function assetUrl(url){
 if(typeof url!=='string'||!url.startsWith('/')||url.startsWith('//')||base&&url.startsWith(base+'/'))return url
 return /^\/(models|textures|fonts|sounds|transformations|animations|foliage|delivery)\//.test(url)?base+url:url
}
DefaultLoadingManager.setURLModifier(assetUrl)
const cache=new Map(),listeners=new Set()
let revision=0
const publish=()=>{revision++;listeners.forEach(f=>f())}
export const resourceProgress={subscribe:f=>{listeners.add(f);return()=>listeners.delete(f)},snapshot:()=>revision,records:()=>[...cache.values()]}
const key=(kind,url)=>kind+':'+assetUrl(url)
function record(kind,url,start){
 const id=key(kind,url);let entry=cache.get(id)
 if(!entry){
  entry={id,kind,url:assetUrl(url),state:'pending',loaded:0,total:0,start:performance.now()};cache.set(id,entry)
  entry.promise=Promise.resolve().then(async()=>{for(let attempt=0;;attempt++)try{return await start(entry)}catch(error){if(attempt>=2)throw error instanceof Error?error:Error('Could not load '+entry.url);entry.loaded=0;await new Promise(resolve=>setTimeout(resolve,400*2**attempt))}}).then(value=>{entry.value=value;entry.state='ready';entry.end=performance.now();publish();return value},error=>{entry.error=error;entry.state='error';publish();throw error})
  entry.promise.catch(()=>{});publish()
 }
 return entry
}
const textureLoader=new TextureLoader()
const textureHandles=new Map()
export function deferredTexture(url){const id=assetUrl(url);if(!textureHandles.has(id)){const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const texture=new Texture(canvas);texture.needsUpdate=true;textureHandles.set(id,texture)}return textureHandles.get(id)}
function textureRecord(url,{hold=false}={}){return record('texture',url,entry=>new Promise((resolve,reject)=>{const handle=deferredTexture(url);textureLoader.load(assetUrl(url),texture=>{if(hold)entry.stagedSource=texture.source;else{handle.dispose();handle.source=texture.source;handle.needsUpdate=true}resolve(handle)},undefined,reject)}))}
export const loadTexture=(url,options)=>textureRecord(url,options).promise
export async function prepareTexture(url,renderer,label='texture'){
 const entry=textureRecord(url),handle=await entry.promise
 if(!entry.stagedSource){await prepareGpu(renderer,()=>renderer.initTexture(handle),label);return handle}
 if(!entry.preparing)entry.preparing=(async()=>{
  const staged=handle.clone();staged.source=entry.stagedSource;staged.needsUpdate=true
  await prepareGpu(renderer,()=>renderer.initTexture(staged),label)
  await workQueue.submit(()=>{
   // Dispose the 1x1 GPU allocation before changing its source. The prepared
   // source/sampler cache supplies the full-size texture without uploading it
   // again on the first live frame. Keep the stable material-facing handle.
   handle.dispose();handle.source=staged.source;renderer.initTexture(handle)
   staged.dispose();delete entry.stagedSource
  },label+' commit')
 })()
 await entry.preparing;return handle
}
export function configureTexture(texture,properties){let changed=false;for(const [key,value]of Object.entries(properties))if(texture[key]!==value){texture[key]=value;changed=true}if(changed)texture.needsUpdate=true;return texture}
export function useTexture(input){
 const urls=Array.isArray(input)?input:[input],textures=urls.map(url=>read(textureRecord(url)))
 return useMemo(()=>Array.isArray(input)?textures:textures[0],textures)
}
useTexture.preload=input=>{for(const url of Array.isArray(input)?input:[input])loadTexture(url)}
const manager=new LoadingManager();manager.setURLModifier(assetUrl)
manager.addHandler(/\.(png|jpe?g|webp)(?:\?|$)/i,{load(url,onLoad,onProgress,onError){const entry=textureRecord(url);entry.promise.then(onLoad,onError);return entry.value}})
const loader=new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder)
const forestLoader=createForestLoader()
function gltfRecord(url){return record('gltf',url,entry=>new Promise((resolve,reject)=>(url.includes('/models/glTF/')?forestLoader:loader).load(assetUrl(url),resolve,event=>{entry.loaded=event.loaded;entry.total=event.total||entry.total;publish()},reject)))}
function read(entry){if(entry.state==='error')throw entry.error;if(entry.state!=='ready')throw entry.promise;return entry.value}
export const loadGLTF=url=>gltfRecord(url).promise
export const useGLTF=url=>read(gltfRecord(url))
useGLTF.preload=url=>loadGLTF(url)
export function loadJSON(url){return record('json',url,async()=>{const response=await fetch(assetUrl(url));if(!response.ok)throw Error(`${response.status}: ${url}`);return response.json()}).promise}
export function useJSON(url){return read(record('json',url,async()=>{const response=await fetch(assetUrl(url));if(!response.ok)throw Error(`${response.status}: ${url}`);return response.json()}))}
export function resourceState(kind,url){return cache.get(key(kind,url))}
const foliageLoader=new ForestFoliageWorldLoader()
const foliageRecord=url=>record('foliage',url,()=>foliageLoader.loadAsync(url))
export const loadFoliage=url=>foliageRecord(url).promise
export const useFoliage=url=>read(foliageRecord(url))

// The forest's final Lambert materials only use the color/alpha map.
// Skip unused source PBR maps before GLTFLoader discovers image dependencies.
export function createForestLoader(){
 return new GLTFLoader(manager).register(parser=>({name:'MOSPEADA_LAMBERT_INPUTS',beforeRoot(){for(const material of parser.json.materials||[]){delete material.normalTexture;delete material.occlusionTexture;if(material.pbrMetallicRoughness)delete material.pbrMetallicRoughness.metallicRoughnessTexture}}}))
}
