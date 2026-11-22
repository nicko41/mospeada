// All distances in metres. Source glTFs remain in their original metre / +Y frame.
export const FOREST = Object.freeze({
  seed: 19830902, size: 800, segments: 200,
  clearingRadius: 13, pathHalfWidth: 4.6,
  trees: 4200, shrubs: 11000, grass: 58000, plants: 6500, rocks: 480, pebbles: 1800,
  canopyFullDetailStart:130,canopyFullDetailDistance:150,
  treeDetailFadeStart: 230, treeDetailDistance: 260,treeLodHysteresis:10, treeFadeStart: 300, treeDistance: 340,
  shrubDetailFadeStart: 50, shrubDistance: 62, shrubFarFadeStart: 145, shrubFarDistance: 175, grassDistance: 48, propDistance: 105,
  groveBands: [
    { layer: 'foreground', count: 200, radius: [20, 95], groves: 20, spread: [6, 16] },
    { layer: 'middle', count: 900, radius: [85, 185], groves: 38, spread: [12, 28] },
    { layer: 'outer', count: 3100, radius: [170, 540], groves: 100, spread: [15, 38] },
  ],
  fogDensity: .0047,
  foliageAtlas: { views: 8, columns: 4, tileWidth: 256, treeTileHeight: 512, shrubTileHeight: 256 },
  clearingPatches: { count: 12, radius: [8, 14], grass: 28, plants: 6 },
  performance: { adaptiveResolution: false, minPixelRatio: .65, targetFrameMs: 33.3 },
  palette: { sky: '#8dcbea', fog: '#4c7c8a', ground: '#517f76', path: '#889b88',
    foliageLight: '#75b4a1', foliageShade: '#244f5f', bark: '#4b6c73', rock: '#849e9b' },
})

export const FOREST_ASSETS = Object.freeze([
  // Conservative radii of the tapered runtime bark, 0.15–2 m above the source origin.
  { name: 'CommonTree_3', kind: 'tree', scale: [2.0, 2.9], trunkRadius: .25 },
  { name: 'CommonTree_2', kind: 'tree', scale: [2.4, 3.4], trunkRadius: .28 },
  { name: 'CommonTree_4', kind: 'tree', scale: [2.1, 3.0], trunkRadius: .24 },
  { name: 'CommonTree_1', kind: 'tree', scale: [2.4, 3.4], trunkRadius: .28 },
  { name: 'Bush_Common', kind: 'shrub', scale: [.65, 1.65] },
  { name: 'Grass_Common_Short', kind: 'grass', scale: [.22, .45] },
  { name: 'Grass_Wispy_Short', kind: 'grass', scale: [.2, .43] },
  { name: 'Fern_1', kind: 'plant', scale: [.13, .25] },
  { name: 'Plant_1', kind: 'plant', scale: [.38, .8] },
  { name: 'Plant_7', kind: 'plant', scale: [.7, 1.4] },
  { name: 'Rock_Medium_1', kind: 'rock', scale: [.22, .65] },
  { name: 'Rock_Medium_2', kind: 'rock', scale: [.22, .72] },
  { name: 'Pebble_Round_2', kind: 'pebble', scale: [.6, 1.7] },
  { name: 'Pebble_Square_3', kind: 'pebble', scale: [.7, 1.7] },
])

// Selected silhouettes frame the clearing without putting roots in its exits.
// The rest of the forest is generated from the seeded irregular grove bands.
export const FOREST_HERO_TREES = Object.freeze([
  { name: 'CommonTree_3', x: -15, z: -17, scale: 3.5, yaw: .5 },
  { name: 'CommonTree_3', x: 17, z: -21, scale: 3.8, yaw: 2.4 },
  { name: 'CommonTree_2', x: -24, z: 4, scale: 4.1, yaw: 1.8 },
  { name: 'CommonTree_3', x: 23, z: 10, scale: 3.4, yaw: 4.2 },
  { name: 'CommonTree_4', x: -13, z: 24, scale: 3.6, yaw: 3.1 },
  { name: 'CommonTree_1', x: 25, z: 32, scale: 4.2, yaw: 2.9 },
])
