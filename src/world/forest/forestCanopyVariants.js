import {isCanopyTestTree} from './treeCanopyTestConfig.js'
export const FOREST_CANOPY_VARIANTS=5
export function forestCanopyVariant(p,count=FOREST_CANOPY_VARIANTS){
 // Keep the approved reference tree on its original packet recipe.
 if(isCanopyTestTree(p))return 0
 const n=Math.sin(p.x*12.9898+p.z*78.233+(p.yaw||0)*3.7)*43758.5453
 return Math.floor((n-Math.floor(n))*count)
}
