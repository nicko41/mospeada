export const TREE_CANOPY_TEST=Object.freeze({name:'CommonTree_3',x:-15,z:-17,referenceOffset:[-18,-2],clusters:12,alphaTest:.55})
export function treeCanopyTestMode(search=globalThis.location?.search||''){
 const mode=new URLSearchParams(search).get('canopy')
 return ['anime','original','compare'].includes(mode)?mode:'off'
}
export const isCanopyTestTree=p=>p.name===TREE_CANOPY_TEST.name&&Math.abs(p.x-TREE_CANOPY_TEST.x)<.001&&Math.abs(p.z-TREE_CANOPY_TEST.z)<.001
