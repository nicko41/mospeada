export const ENGINE_AUDIO_DEFAULTS=Object.freeze({pitchMin:.65,pitchMax:1.9,volumeMin:.12,volumeMax:.7,throttleSensitivity:.55,speedSensitivity:.85,riseTime:.28,fallTime:1.15,filterIntensity:.8})
export const ENGINE_AUDIO_CONTROLS=Object.freeze([
  ['pitchMin','Pitch mínimo',.25,2.5,.01,'×'],['pitchMax','Pitch máximo',.5,3.5,.01,'×'],
  ['volumeMin','Volumen mínimo',0,1,.01,''],['volumeMax','Volumen máximo',0,1,.01,''],
  ['throttleSensitivity','Sensibilidad al acelerador',0,2,.01,''],['speedSensitivity','Sensibilidad a la velocidad',0,2,.01,''],
  ['riseTime','Inercia de subida',.04,2,.01,' s'],['fallTime','Inercia de bajada',.08,4,.01,' s'],
  ['filterIntensity','Intensidad del filtro',0,1,.01,''],
])
let settings={...ENGINE_AUDIO_DEFAULTS}
const listeners=new Set()
export const engineAudioState={
  snapshot:()=>settings,
  subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener)},
  set(key,value){
    const control=ENGINE_AUDIO_CONTROLS.find(control=>control[0]===key)
    if(!control||!Number.isFinite(Number(value)))return
    const next={...settings,[key]:Math.max(control[2],Math.min(control[3],Number(value)))}
    for(const [min,max]of [['pitchMin','pitchMax'],['volumeMin','volumeMax']])if(next[min]>next[max]){
      if(key===min)next[max]=next[min];else next[min]=next[max]
    }
    settings=next;listeners.forEach(listener=>listener())
  },
  reset(){settings={...ENGINE_AUDIO_DEFAULTS};listeners.forEach(listener=>listener())},
}
