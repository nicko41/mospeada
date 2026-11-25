import {FOREST_STAGE4} from '../world/forest/forestStage4Config.js'

export const ARMOR_UNLOCK_DROP=4
export function armorTransformationUnlocked(runtime){return !runtime.levelProgress||!!runtime.armorUnlocked}
export function observeArmorUnlock(runtime,world){
 if(armorTransformationUnlocked(runtime))return true
 const s=runtime.state,phase=runtime.desertPatrol?.phase
 if(!world?.bound||!s||!['entering','active','leaving','complete'].includes(phase))return false
 // Sighting Scouts from the forest plateau or passing the earlier jump does
 // not unlock Armor. Scott must have entered the actual desert ravine drop.
 if(world.contains(s.x,s.z)&&world.distance(s.z)>=FOREST_STAGE4.forestLength&&Number.isFinite(s.height)&&s.height<world.position.y-ARMOR_UNLOCK_DROP)runtime.armorUnlocked=true
 return !!runtime.armorUnlocked
}
