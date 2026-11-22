export function instrumentLevel(value,maximum=100,count=40){
  const safe=Number.isFinite(Number(value))?Math.max(0,Number(value)):0
  return Math.ceil(Math.min(1,safe/Math.max(1,maximum))*count)
}
export function speedometerValue(speed){return Math.round(Math.min(999,Math.abs(Number(speed)||0))).toString().padStart(2,'0')}
export function entryLoadingMessage({active,sceneReady,renderReady,item=''}){
  if(!active&&sceneReady&&renderReady)return'SYSTEM READY'
  if(!active&&sceneReady)return'PREPARING SCENE'
  return /\.(?:glb|gltf)(?:\?|$)|vehicle|cyclone|scott|invid|gallant|rand/i.test(item)?'LOADING VEHICLES':'LOADING TERRAIN'
}
