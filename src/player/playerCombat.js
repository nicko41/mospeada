import { PLAYER_MAX_HEALTH } from './meleeConfig'

export const playerCombat = {
  playerHealth: PLAYER_MAX_HEALTH, playerMaxHealth: PLAYER_MAX_HEALTH,
  dead: false, hitVersion: 0,
  hitSource: { x: 0, y: 0, z: 0 }, hasHitSource: false,
}

const listeners = new Set()
export const subscribePlayerHealth = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export const getPlayerHealth = () => playerCombat.playerHealth

export function damagePlayer(damage, attackerPosition) {
  if (playerCombat.dead) return
  playerCombat.hasHitSource = !!attackerPosition
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
