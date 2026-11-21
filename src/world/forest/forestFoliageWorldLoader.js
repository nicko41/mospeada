import {Loader} from 'three'
export class ForestFoliageWorldLoader extends Loader{
  load(key,onLoad,onProgress,onError){
    this.manager.itemStart(key)
    const worker=new Worker(new URL('./forestFoliageWorker.js',import.meta.url),{type:'module'})
    worker.onmessage=({data})=>{if(data.progress){onProgress?.({loaded:data.progress,total:1});return}worker.terminate();if(data.error){this.manager.itemError(key);onError?.(Error(data.error))}else onLoad(data.world);this.manager.itemEnd(key)}
    worker.onerror=error=>{worker.terminate();this.manager.itemError(key);this.manager.itemEnd(key);onError?.(error)};worker.postMessage({key})
  }
}
