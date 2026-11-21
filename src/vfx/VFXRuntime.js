import { Group } from 'three'
import { BatchedRenderer } from 'three.quarks'

// Shared Quarks renderer/registry; future effects register their own emitters
// here rather than introducing another particle loop or renderer per vehicle.
export class VFXRuntime {
  constructor() {
    this.root = new Group(); this.root.name = 'MOSPEADA_VFX_world'
    this.renderer = new BatchedRenderer(); this.renderer.name = 'MOSPEADA_Quarks_batches'
    this.root.add(this.renderer); this.effects = new Map()
  }
  register(name, effect) {
    if (this.effects.has(name)) throw Error('Duplicate VFX: ' + name)
    this.effects.set(name, effect)
    if(effect.root)this.root.add(effect.root)
    // Fixed light pools stay outside effect roots whose visibility changes.
    // Idle intensity is zero; the scene light count remains stable in combat.
    if(effect.lightingRoot)this.root.add(effect.lightingRoot)
    for (const system of effect.systems) { this.root.add(system.emitter); this.renderer.addSystem(system) }
    effect.configureBatches?.(this.renderer)
    return effect
  }
  update(dt) {
    for (const effect of this.effects.values()) effect.beforeStep?.(dt)
    this.renderer.update(dt)
  }
  dispose() {
    for (const effect of this.effects.values()) {
      for (const system of effect.systems) { this.renderer.deleteSystem(system); system.dispose() }
      effect.dispose?.()
    }
    for (const batch of this.renderer.batches) { batch.geometry.dispose(); batch.material.dispose(); batch.settings.material.dispose() }
    this.effects.clear(); this.root.removeFromParent(); this.root.clear()
  }
}
