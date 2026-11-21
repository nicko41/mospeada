import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { Box3, BufferGeometry, Float32BufferAttribute, Matrix4, Vector3 } from 'three'
import { prepareForestGeometry } from './forestGeometry.js'
import { FOREST_ASSETS } from './forestConfig.js'

function primitive(name,material) {
  const document=JSON.parse(fs.readFileSync(`public/models/glTF/${name}.gltf`)),buffers=document.buffers.map(b=>fs.readFileSync('public/models/glTF/'+b.uri))
  const p=document.meshes.flatMap(m=>m.primitives).find(p=>document.materials[p.material].name.includes(material))
  const read=id=>{
    const a=document.accessors[id],b=document.bufferViews[a.bufferView],bytes=buffers[b.buffer],view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)
    const components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],length={5121:1,5123:2,5125:4,5126:4}[a.componentType]
    const readValue=offset=>a.componentType===5126?view.getFloat32(offset,true):a.componentType===5125?view.getUint32(offset,true):a.componentType===5123?view.getUint16(offset,true):view.getUint8(offset)
    const result=new Float32Array(a.count*components)
    for(let i=0;i<a.count;i++)for(let j=0;j<components;j++){let v=readValue((b.byteOffset||0)+(a.byteOffset||0)+i*(b.byteStride||components*length)+j*length);if(a.normalized)v/=a.componentType===5121?255:65535;result[i*components+j]=v}
    return {result,components}
  }
  const geometry=new BufferGeometry()
  for(const [gltf,three]of[['POSITION','position'],['NORMAL','normal'],['COLOR_0','color'],['TEXCOORD_0','uv']])if(p.attributes[gltf]!==undefined){const {result,components}=read(p.attributes[gltf]);geometry.setAttribute(three,new Float32BufferAttribute(result,components))}
  if(p.indices!==undefined)geometry.setIndex(Array.from(read(p.indices).result))
  const positions=document.accessors[p.attributes.POSITION]
  const allPositions=document.meshes.flatMap(m=>m.primitives).map(p=>document.accessors[p.attributes.POSITION])
  const bounds=new Box3();for(const a of allPositions)bounds.union(new Box3(new Vector3(...a.min),new Vector3(...a.max)))
  return {geometry,bounds,name:document.materials[p.material].name,positions}
}

test('forest catalogue contains ramified broadleaf species and no conifers',()=>{
  const trees=FOREST_ASSETS.filter(a=>a.kind==='tree')
  assert.deepEqual(new Set(trees.map(a=>a.name)),new Set(['CommonTree_1','CommonTree_2','CommonTree_3','CommonTree_4']))
  assert.ok(FOREST_ASSETS.every(a=>!/pine|conifer|twistedtree/i.test(a.name)))
})

test('runtime taper preserves branch topology and upper crown while reducing basal trunk girth',()=>{
  for(const asset of FOREST_ASSETS.filter(a=>a.kind==='tree')) {
    const {geometry:source,bounds,name}=primitive(asset.name,'Bark'),original=source.attributes.position.array.slice(),indices=source.index.array.slice()
    const result=prepareForestGeometry(source,new Matrix4(),'tree',name,bounds),p=source.attributes.position,q=result.attributes.position
    let originalRadius=0,resultRadius=0,upper=0
    for(let i=0;i<p.count;i++) {
      assert.equal(q.getY(i),p.getY(i))
      if(p.getY(i)<1){originalRadius=Math.max(originalRadius,Math.hypot(p.getX(i),p.getZ(i)));resultRadius=Math.max(resultRadius,Math.hypot(q.getX(i),q.getZ(i)))}
      if(p.getY(i)>bounds.min.y+(bounds.max.y-bounds.min.y)*.54){assert.equal(q.getX(i),p.getX(i));assert.equal(q.getZ(i),p.getZ(i));upper++}
    }
    assert.ok(upper>100);assert.ok(resultRadius<originalRadius*.6)
    assert.ok(resultRadius<=asset.trunkRadius+.035,`${asset.name}: collider ${asset.trunkRadius} must enclose tapered root ${resultRadius}`)
    assert.deepEqual(source.attributes.position.array,original);assert.deepEqual(result.index.array,indices)
    source.dispose();result.dispose()
  }
})

test('leaf packets retain their authored shapes, open crown windows and receive multiple painted values',()=>{
  for(const asset of FOREST_ASSETS.filter(a=>a.kind==='tree'||a.kind==='shrub')) {
    const {geometry:source,bounds,name}=primitive(asset.name,'Leaves'),original=source.attributes.position.array.slice(),indices=source.index.array.slice()
    const result=prepareForestGeometry(source,new Matrix4(),asset.kind,name,bounds)
    assert.ok(result.userData.forestLeafGroups>100)
    assert.equal(result.attributes.position.count,source.attributes.position.count)
    assert.ok(result.index.count<=indices.length)
    if(asset.kind==='tree'){assert.ok(result.index.count<indices.length);assert.ok(result.userData.forestLeafGroups<result.userData.forestSourceLeafGroups)}
    else assert.deepEqual(result.index.array,indices)
    const triangles=new Set();for(let i=0;i<indices.length;i+=3)triangles.add([indices[i],indices[i+1],indices[i+2]].join(','))
    for(let i=0;i<result.index.count;i+=3)assert.ok(triangles.has([result.index.getX(i),result.index.getX(i+1),result.index.getX(i+2)].join(',')))
    const colors=result.attributes.color,tones=new Set()
    for(let i=0;i<colors.count;i++)tones.add([colors.getX(i),colors.getY(i),colors.getZ(i)].map(v=>v.toFixed(3)).join(','))
    assert.ok(tones.size>40,'Each crown needs interior, edge and illuminated leaf groups')
    assert.deepEqual(source.attributes.position.array,original)
    source.dispose();result.dispose()
  }
})
