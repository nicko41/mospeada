const clamp = (n, a, b) => Math.max(a, Math.min(b, n))

// Engine-load cadence only. Quarks still owns emission, simulation and pooling.
// A private PRNG keeps idle/boost randomness independent of burst scheduling.
export class ExhaustBurstCycle {
  constructor(seed = 173) { this.seed = seed; this.reset() }
  random() { this.seed = (Math.imul(1664525, this.seed) + 1013904223) >>> 0; return this.seed / 4294967296 }
  reset() { this.wait = 0; this.remaining = 0; this.duration = 0; this.power = 0; this.previousLoad = 0; this.previousThrottle = 0; this.since = 1; this.moving = false; this.bursts = 0 }
  update(dt, moving, throttle, acceleration) {
    if (dt <= 0) return this.remaining > 0 ? 1 : 0
    const load = clamp(throttle * .22 + Math.max(0, acceleration) / 14 * .78, 0, 1)
    if (!moving) { this.remaining = 0; this.moving = false; this.previousLoad = load; this.previousThrottle = throttle; return 0 }
    if (!this.moving) { this.moving = true; this.wait = load > .3 ? 0 : .25 + this.random() * .6 }
    const released = throttle < this.previousThrottle - .2
    if (released) { this.remaining = Math.min(this.remaining, .025); this.wait = 1 + this.random() * 1.4 }
    else if (load - this.previousLoad > .2 && this.since > .18) this.wait = Math.min(this.wait, .015)
    this.previousLoad = load; this.previousThrottle = throttle; this.since += dt
    if (this.remaining > 0) {
      this.remaining = Math.max(0, this.remaining - dt)
      return this.remaining > 0 ? .65 + .35 * Math.sin(Math.PI * (1 - this.remaining / this.duration)) : 0
    }
    this.wait -= dt
    if (this.wait > 0) return 0
    this.power = Math.max(.12, load)
    this.duration = .045 + this.power * .04 + this.random() * .02
    this.remaining = this.duration; this.since = 0; this.bursts++
    this.wait = load > .4 ? .27 + this.random() * .5 : 1 + this.random() * 1.5
    return .7
  }
}
