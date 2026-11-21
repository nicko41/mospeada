import { Color } from 'three'

// Material/vertex albedo only. Ground illustrations, atmosphere and lights keep
// their authored colours. Shared moss/olive family, with colder deep shadows.
export const FOREST_PALETTE_VERSION='foliage-pilot-midgreens-v1'
export const FOREST_FOLIAGE_PALETTES=Object.freeze({
  tree:['#294b43','#526c49','#7d935e','#b4bf86'],
  shrub:['#315542','#4b7148','#6c8b56','#95aa75'],
  grass:['#174b2b','#1c6534','#227a3f','#398c51'],
  plant:['#284f39','#47763c','#6c9346','#93b15c'],
})
const species=Object.freeze({CommonTree_1:'#7c977b',CommonTree_2:'#8f965b',CommonTree_3:'#829d67',CommonTree_4:'#91a578'})
export function forestLeafPalette(kind='tree',assetName='') {
  const colours=(FOREST_FOLIAGE_PALETTES[kind]||FOREST_FOLIAGE_PALETTES.tree).map(c=>new Color(c))
  if(species[assetName]){const tint=new Color(species[assetName]);colours.forEach(c=>c.lerp(tint,.08))}
  return colours
}
export function forestMaterialPalette(kind,bark=false) {
  if(bark)return {low:'#3f4945',mid:'#616b5b',high:'#939b80',emissive:'#252e29',emissiveIntensity:.08}
  const colours=FOREST_FOLIAGE_PALETTES[kind]||FOREST_FOLIAGE_PALETTES.plant
  const emissive=kind==='tree'?'#49583b':kind==='shrub'?'#355335':'#285439'
  return {low:colours[0],mid:colours[2],high:colours[3],emissive,emissiveIntensity:.12}
}
