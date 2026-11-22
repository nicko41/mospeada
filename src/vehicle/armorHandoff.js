const smooth=n=>{const t=Math.max(0,Math.min(1,n));return t*t*(3-2*t)}

export function armorAssemblyProgress(entry){
  if(!entry||entry.returnFlight)return 0
  if(['armorboost','complete'].includes(entry.phase))return 1
  return entry.phase==='transforming'?(entry.assemblyProgress??entry.mechanicalProgress??entry.store?.snapshot().progress??0):0
}

export function armorAttachmentTarget(armor,entry){
  const progress=armorAssemblyProgress(entry)
  if(armor?.active)return{active:true,state:armor.state,entry}
  // These are MECHANICAL times: wheels finish at .70. The knee pieces must
  // already follow Scott while those wheels are still travelling behind him.
  if(progress>=.42)return{active:true,state:entry,entry,assembling:progress<1,weight:smooth((progress-.42)/.18)}
  return armor
}

export function armorGallantVisible(armor,entry){return !!armor?.active||armorAssemblyProgress(entry)>=.42}
