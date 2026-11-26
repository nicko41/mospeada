import {BufferGeometry,BufferAttribute,Box3,Sphere,Vector3} from 'three'

export function packGeometry(geometry){
 const attribute=a=>({array:a.array,itemSize:a.itemSize,normalized:a.normalized,usage:a.usage,name:a.name})
 return {geometry:true,name:geometry.name,attributes:Object.fromEntries(Object.entries(geometry.attributes).map(([key,a])=>[key,attribute(a)])),index:geometry.index&&attribute(geometry.index),groups:geometry.groups,drawRange:geometry.drawRange,userData:geometry.userData,box:geometry.boundingBox&&[geometry.boundingBox.min.toArray(),geometry.boundingBox.max.toArray()],sphere:geometry.boundingSphere&&[geometry.boundingSphere.center.toArray(),geometry.boundingSphere.radius]}
}
export function unpackGeometry(data){
 const g=new BufferGeometry(),attribute=a=>{const result=new BufferAttribute(a.array,a.itemSize,a.normalized);result.usage=a.usage;result.name=a.name;return result}
 g.name=data.name;for(const [key,a]of Object.entries(data.attributes))g.setAttribute(key,attribute(a));if(data.index)g.setIndex(attribute(data.index))
 g.groups=data.groups;g.drawRange=data.drawRange;g.userData=data.userData
 if(data.box)g.boundingBox=new Box3(new Vector3().fromArray(data.box[0]),new Vector3().fromArray(data.box[1]))
 if(data.sphere)g.boundingSphere=new Sphere(new Vector3().fromArray(data.sphere[0]),data.sphere[1])
 return g
}
export function packTree(value,buffers=new Set()){
 if(value?.isBufferGeometry)return packTree(packGeometry(value),buffers)
 if(ArrayBuffer.isView(value)){buffers.add(value.buffer);return value}
 if(Array.isArray(value))return value.map(item=>packTree(item,buffers))
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,v])=>typeof v!=='function').map(([k,v])=>[k,packTree(v,buffers)]))
 return value
}
export function unpackTree(value){
 if(value?.geometry===true)return unpackGeometry(value)
 if(ArrayBuffer.isView(value))return value
 if(Array.isArray(value))return value.map(unpackTree)
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,unpackTree(v)]))
 return value
}
