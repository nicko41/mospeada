import {SoundEffects} from './SoundEffects.js'
const step1=new URL('../../assets/sound/cyclone-armor/steps/armor-step1.mp3',import.meta.url).href
const step2=new URL('../../assets/sound/cyclone-armor/steps/armor-step2.mp3',import.meta.url).href
const step3=new URL('../../assets/sound/cyclone-armor/steps/armor-step3.mp3',import.meta.url).href
const step4=new URL('../../assets/sound/cyclone-armor/steps/armor-step4.mp3',import.meta.url).href

export const SOUND_EFFECTS=Object.freeze({
  gallantShot:{volume:.35,variants:[
    {url:new URL('../../assets/sound/cyclone-armor/gallant/gallant-shot-default.mp3',import.meta.url).href,weight:80,volume:.8},
    {url:new URL('../../assets/sound/cyclone-armor/gallant/gallant-shot-alt.mp3',import.meta.url).href,weight:20},
  ]},
  cycloneEngineLoop:{volume:1,variants:[{url:new URL('../../assets/sound/cyclone-armor/engine/02-engine-loop1.mp3',import.meta.url).href,weight:1}]},
  cycloneBoost:{volume:.25,variants:[{url:new URL('../../assets/sound/cyclone-armor/boost/boost.mp3',import.meta.url).href,weight:1}]},
  cycloneTransform:{volume:.52,variants:[{url:new URL('../../assets/sound/cyclone-armor/transform/cyclone-to-armor.mp3',import.meta.url).href,weight:1}]},
  armorStrafe:{volume:.22,variants:[
    {url:new URL('../../assets/sound/cyclone-armor/boost/strafe01.mp3',import.meta.url).href,weight:1},
    {url:new URL('../../assets/sound/cyclone-armor/boost/strafe02.mp3',import.meta.url).href,weight:1},
    {url:new URL('../../assets/sound/cyclone-armor/boost/strafe03.mp3',import.meta.url).href,weight:1},
  ]},
  armorStep:{volume:.45,variants:[{url:step2,weight:80},{url:step1,weight:20/3},{url:step3,weight:20/3},{url:step4,weight:20/3}]},
  armorLanding:{volume:.65,variants:[{url:step1,weight:1}]},
  scoutOrb:{volume:.45,playbackRate:.8,variants:[{url:new URL('../../assets/sound/invid/01-invid-laser.mp3',import.meta.url).href,weight:1}]},
  invidExplosion:{volume:1,variants:[
    {url:new URL('../../assets/sound/invid/01-explode.mp3',import.meta.url).href,weight:1},
    {url:new URL('../../assets/sound/invid/02-explode.mp3',import.meta.url).href,weight:1},
    {url:new URL('../../assets/sound/invid/03-explode.mp3',import.meta.url).href,weight:1},
  ]},
  droneExplosion:{volume:1,variants:[{url:new URL('../../assets/sound/invid/drone-explode.mp3',import.meta.url).href,weight:1}]},
  droneFlight:{volume:1,variants:[{url:new URL('../../assets/sound/invid/drone-loop.mp3',import.meta.url).href,weight:1}]},
})
export const GALLANT_SHOT_URLS=SOUND_EFFECTS.gallantShot.variants.map(variant=>variant.url)
export const CYCLONE_ENGINE_URLS=SOUND_EFFECTS.cycloneEngineLoop.variants.map(variant=>variant.url)
export const PLAYER_INITIAL_AUDIO_URLS=[...new Set([...CYCLONE_ENGINE_URLS,...['cycloneBoost','cycloneTransform','armorStrafe','armorStep','armorLanding'].flatMap(name=>SOUND_EFFECTS[name].variants.map(variant=>variant.url))])]
export const SCOUT_AUDIO_URLS=['scoutOrb','invidExplosion'].flatMap(name=>SOUND_EFFECTS[name].variants.map(variant=>variant.url))
export const DRONE_AUDIO_URLS=['droneFlight','droneExplosion'].flatMap(name=>SOUND_EFFECTS[name].variants.map(variant=>variant.url))
export const gameAudio=new SoundEffects(SOUND_EFFECTS)
