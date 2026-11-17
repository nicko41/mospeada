// Zombie02 inspected in Idle: 4.19517754 model units tall. Its Walk travels
// 3.34148645 units per 4-second cycle; code owns that translation instead.
export const ZOMBIE02_SCALE = 1.8 / 4.195177543522338
export const ZOMBIE02_OPTIONS = {
  scale: ZOMBIE02_SCALE, poseClip: 'Armature|Idle', centeredRoot: true,
  eyes: { height: 0.56, forward: 0.47, halfSpacing: 0.15, centerX: -0.015 },
}
export const ZOMBIE02_ANIMATION_OPTIONS = {
  referenceSpeed: 3.34148645401001 * ZOMBIE02_SCALE / 4,
  clips: { idle: 'Armature|Idle', walk: 'Armature|Walk', attack: 'Armature|Attack',
    // Keep the existing procedural stagger and dissolve instead of long FBX actions.
    reaction: null, death: null },
}

export function prepareZombie02Animations(clips) {
  return clips.map(clip => {
    if (!/\|Walk2?$/.test(clip.name)) return clip
    const result = clip.clone()
    for (const track of result.tracks) {
      if (!/Hips\.position$/.test(track.name)) continue
      const values = track.values, times = track.times
      const last = values.length - 3
      const dx = values[last] - values[0], dz = values[last + 2] - values[2]
      const duration = times[times.length - 1] - times[0]
      if (duration <= 0) continue
      for (let i = 0; i < times.length; i++) {
        const fraction = (times[i] - times[0]) / duration
        values[i * 3] -= dx * fraction
        values[i * 3 + 2] -= dz * fraction
      }
    }
    return result
  })
}
