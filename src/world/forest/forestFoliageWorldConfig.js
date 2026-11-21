export const FOLIAGE_WORLD=Object.freeze({
  version:'world-foliage-forward-route-v5',seed:19830924,sectorSize:32,worldSize:800,candidateStep:.7,
  nearFadeStart:18,nearFadeEnd:27,maxDistance:112,
  initialRadius:176,residentRadius:240,evictRadius:288,translationStep:8,
  preparationBudgetMs:2.5,maxSectorsPerFrame:3,
  profiles:{2000:.44,3000:.65,4000:.85},defaultProfile:3000,
  contactFadeStart:18,contactDistance:26,referenceVramMB:4096,
})
export const foliageWorldMode=()=>typeof location!=='undefined'&&new URLSearchParams(location.search).get('foliage')==='pilot'?'pilot':'world'
