import {LEVEL_ASSETS} from './levelAssets.js'
import {loadGLTF,loadTexture,loadJSON,loadFoliage,loadAudio,resourceState,resourceProgress} from './resources.js'
import {STAGE2_FOLIAGE_KEY} from '../world/forest/forestStage2Foliage.js'
import {prepareTerrain} from './terrainPreparation.js'
export function preloadInitial(){const set=LEVEL_ASSETS.initial;set.gltf.forEach(loadGLTF);set.texture.forEach(loadTexture);set.json.forEach(loadJSON);set.audio.forEach(loadAudio);prepareTerrain('stage2');loadFoliage(STAGE2_FOLIAGE_KEY)}
export function initialProgress(sceneReady,renderReady,graphicsProgress=0){
 const entries=Object.entries(LEVEL_ASSETS.initial).flatMap(([kind,urls])=>urls.map(url=>({kind,url,entry:resourceState(kind,url)})))
 let loaded=0,total=0,complete=true,error=''
 for(const {kind,url,entry}of entries){
  const sizes=typeof __ASSET_SIZES__==='undefined'?{}:__ASSET_SIZES__,weight=sizes[url]||(kind==='gltf'?1000000:100000)
  total+=weight
  if(entry?.state==='ready')loaded+=weight
  else{complete=false;loaded+=Math.min(.98,(entry?.loaded||0)/(sizes[url]||entry?.total||weight))*weight}
  if(entry?.error)error=entry.error.message
 }
 const download=loaded/Math.max(1,total),prepared=renderReady?1:graphicsProgress
 return{percent:download*80+prepared*19,download,complete:complete&&sceneReady,error,message:error?'LOAD ERROR':!complete?'DOWNLOADING ASSETS':renderReady?'SYSTEM READY':'PREPARING GRAPHICS'}
}
export {resourceProgress}
