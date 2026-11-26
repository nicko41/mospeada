// Material.copy serializes userData as JSON. A texture kept in metadata then
// encodes its entire image as a data URL on the main thread. Keep GPU resource
// references as references, and privately copy the ordinary editable metadata.
function copyMetadata(value,seen=new WeakMap()){
 if(!value||typeof value!=='object')return value
 if(value.isTexture||value.isSource||value.isMaterial||value.isObject3D||value.isBufferGeometry||value.isWebGLRenderTarget)return value
 if(seen.has(value))return seen.get(value)
 if(typeof value.toJSON==='function')return value.toJSON()
 const result=Array.isArray(value)?[]:{};seen.set(value,result)
 for(const [key,item]of Object.entries(value))if(typeof item!=='function')result[key]=copyMetadata(item,seen)
 return result
}
export function cloneRenderMaterial(source){
 const metadata=source.userData;let copy
 try{source.userData={};copy=source.clone()}finally{source.userData=metadata}
 copy.userData=copyMetadata(metadata);return copy
}
