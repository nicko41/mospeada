import { PLAYER_MAX_HEALTH } from './meleeConfig.js'

export const playerCombat = {
  playerHealth: PLAYER_MAX_HEALTH, playerMaxHealth: PLAYER_MAX_HEALTH,
  dead: false, hitVersion: 0, hitKind:'generic',resetVersion:0,
  hitSource: { x: 0, y: 0, z: 0 }, hasHitSource: false,
}

const listeners = new Set()
export const subscribePlayerHealth = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export const getPlayerHealth = () => playerCombat.playerHealth
export function resetPlayerCombat(){
  playerCombat.playerHealth=playerCombat.playerMaxHealth;playerCombat.dead=false;playerCombat.hasHitSource=false
  playerCombat.hitKind='generic';playerCombat.resetVersion++
  listeners.forEach(listener=>listener())
}

export function damagePlayer(damage, attackerPosition,{kind='generic'}={}) {
  if (playerCombat.dead||!Number.isFinite(damage)||damage<=0) return
  playerCombat.hasHitSource = !!attackerPosition
  playerCombat.hitKind=kind
  if (attackerPosition) {
    playerCombat.hitSource.x = attackerPosition.x
    playerCombat.hitSource.y = attackerPosition.y
    playerCombat.hitSource.z = attackerPosition.z
  }
  playerCombat.playerHealth = Math.max(0, playerCombat.playerHealth - damage)
  playerCombat.hitVersion += 1
  playerCombat.dead = playerCombat.playerHealth === 0
  listeners.forEach(listener => listener())
  console.info('[entity] player hit - health: ' + playerCombat.playerHealth)
}
