import grass from '../../assets/texturas/pasto/grass-01.jpg'
import {FOREST_ASSETS} from '../world/forest/forestConfig.js'
import dirt from '../../assets/texturas/pasto/dirt01.jpg'
import canyon from '../../assets/texturas/pasto/barranco.jpg'
import shore from '../../assets/texturas/pasto/orilla-rio.png'
import canopy1 from '../../assets/texturas/follaje/follaje1.png'
import canopy2 from '../../assets/texturas/follaje/follaje2.png'
import sand from '../../assets/texturas/desierto-floor2.png'
import ground from '../../assets/texturas/explosion-piso.png'
import air from '../../assets/texturas/explosion-aire.png'
import impact from '../../assets/texturas/impascto-invid-suelo.png'
import leaves from '../../assets/texturas/hojas flotantes.png'
import blood1 from '../../assets/texturas/invid-blood01.png'
import blood2 from '../../assets/texturas/invid-blood02.png'
import orbs from '../../assets/invid/invid-orbes.png'
import cuffSmoke from '../../assets/texturas/humo-misil-cuff.png'
import {GALLANT_SHOT_URLS,PLAYER_INITIAL_AUDIO_URLS,SCOUT_AUDIO_URLS,DRONE_AUDIO_URLS} from '../audio/gameAudio.js'
export const LEVEL_ASSETS=Object.freeze({
 initial:{audio:PLAYER_INITIAL_AUDIO_URLS,gltf:['/delivery/scott-controller-v2.glb','/delivery/scott-reference-v1.glb','/delivery/scott-v3.glb','/models/mospeada/cyclone-vr052f.glb','/models/mospeada/alpha-fighter-down.glb','/transformations/cyclone-rear-pieces.glb',...FOREST_ASSETS.map(a=>'/models/glTF/'+a.name+'.gltf')],texture:[grass,dirt,canopy1,canopy2,'/foliage/forest/atlas.png','/foliage/forest/wheel-fragments.png',impact,leaves,cuffSmoke,'/models/mospeada/cyclone-cover-21.png','/models/mospeada/cyclone-cover-rango.png',...(typeof __FOREST_COLOR_TEXTURES__==='undefined'?[]:__FOREST_COLOR_TEXTURES__)],json:['/animations/scott-cyclone-actions.json',...['front','rear','guard','wheel','suspension-hide'].map(n=>`/transformations/cyclone-${n}${n==='suspension-hide'?'':'-battloid'}.json`)]},
 stage2:{texture:[canyon,shore]},
 stage3:{gltf:['/delivery/mars-gallant.glb'],texture:[ground,air],audio:[...GALLANT_SHOT_URLS,...DRONE_AUDIO_URLS]},
 stage4:{texture:['/textures/desert/desierto-floor.png',sand]},
 scouts:{gltf:['/delivery/invid-scout.glb?rig=flight-v4-leg-seam'],texture:[blood1,blood2,orbs],audio:SCOUT_AUDIO_URLS},
 horizon:{gltf:['/delivery/horizon-t.glb']},
 rand:{gltf:['/delivery/rand-rider.glb']},
})
