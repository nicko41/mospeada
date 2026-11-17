import { roadCenterAt } from './terrain'

// Generated once from a fixed seed. Placements: x, z, scale, yaw, pitch,
// roll, buried fraction of rotated height, solid obstacle.
let seed = 73129
const random = () => { seed = (seed * 48271) % 2147483647; return (seed - 1) / 2147483646 }
const between = (a, b) => a + (b - a) * random()
const definitions = [
  { name: 'Grass_Common_Short', tint: '#777c66', placements: [] },
  { name: 'Grass_Wispy_Tall', tint: '#777c66', placements: [] },
  { name: 'Rock_Medium_1', tint: '#777974', placements: [] },
  { name: 'Rock_Medium_2', tint: '#777974', placements: [] },
  { name: 'Pebble_Round_2', tint: '#777974', placements: [] },
  { name: 'Pebble_Square_3', tint: '#777974', placements: [] },
  { name: 'Bush_Common', tint: '#777c66', placements: [] },
  // Preserve the first pass's two standing trees.
  { name: 'DeadTree_1', tint: '#81796f', placements: [[-13, -18, .65, 1.4]] },
  { name: 'CommonTree_2', tint: '#777c66', placements: [[-14, -7, .7, 3.2]] },
  { name: 'DeadTree_5', tint: '#81796f', placements: [] },
]
const byName = Object.fromEntries(definitions.map(definition => [definition.name, definition]))
function place(name, lateral, z, scale, buried = 0, solid = false, fallen = false) {
  // Leave room around the parked car and its doors.
  if (z > -3 && z < 9 && lateral > 4.5) lateral = -lateral
  byName[name].placements.push([roadCenterAt(z) + lateral, z, scale, between(0, Math.PI * 2),
    fallen ? Math.PI / 2 + between(-.08, .08) : between(-.16, .16),
    fallen ? between(-.05, .05) : between(-.13, .13), buried, solid])
}

// Uneven groups and clear stretches, starting 5–15 m in front of spawn.
const clusters = [[-1, 12], [1, 6], [-1, -2], [1, -11], [-1, -21], [1, -31], [-1, -41]]
for (const [side, centerZ] of clusters) {
  for (let i = 0; i < 6; i++) {
    const small = i < 4
    const name = small ? (i % 2 ? 'Pebble_Square_3' : 'Pebble_Round_2')
      : (i % 2 ? 'Rock_Medium_1' : 'Rock_Medium_2')
    const lateral = side * (small ? between(.8, 3.5) : between(3.4, 4.8))
    const scale = small ? between(.75, 1.55) : between(.12, .23)
    place(name, lateral, centerZ + between(-1.8, 1.8), scale, between(.1, .35))
  }
  for (let i = 0; i < 7; i++) {
    place(i % 2 ? 'Grass_Wispy_Tall' : 'Grass_Common_Short', side * between(2.65, 4.65),
      centerZ + between(-2.2, 2.2), between(.32, .64), between(.02, .08))
  }
}
// Only these two larger rocks are solid; they stay beyond the walkable center.
place('Rock_Medium_1', -4.7, 9.5, .42, .25, true)
place('Rock_Medium_2', 4.9, -24, .38, .3, true)
for (let i = 0; i < 10; i++) {
  const [side, z] = clusters[i % clusters.length]
  place('Bush_Common', side * between(4.8, 6.7), z + between(-2.4, 2.4), between(.38, .66), .08)
}
for (const [side, z] of [[-1, 6], [1, -17], [-1, -35]]) {
  // Small fallen dead-tree silhouettes (~2 m long), not full-size fallen trees.
  place('DeadTree_5', side * 5.1, z, between(.10, .13), .22, false, true)
}

export const NATURE_SAMPLE = definitions
