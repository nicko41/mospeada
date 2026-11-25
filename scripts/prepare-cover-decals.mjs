import fs from 'node:fs'
import {createRequire} from 'node:module'
import {Matrix4,Vector3} from 'three'
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js'
import {createDrivingCyclone} from '../src/vehicle/createDrivingCyclone.js'
import {frontGeometryKey} from '../src/vehicle/frontTransformMath.js'
const sharp=createRequire('C:/IT-UP/3D-LAB/package.json')('sharp'),data=JSON.parse(fs.readFileSync('public/transformations/cyclone-front-battloid.json'))
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:1,height:1,close(){}})
const bytes=fs.readFileSync('public/models/mospeada/cyclone-vr052f.glb'),asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length),''),rig=createDrivingCyclone(asset.scene),bakedToEditor=new Matrix4().fromArray(data.importMatrix).multiply(new Matrix4().fromArray(data.originalAssemblyMatrix)).invert(),definitions=[]
for(const mesh of rig.surfaces.filter(m=>m.userData.sourcePiece==='tapa-bottom + tapa-bottom')){
 const key=frontGeometryKey(mesh),record=data.records.find(r=>r.key===key),group=data.motionGroups.find(g=>g.id===record?.motionGroupId)
 if(group?.role!=='cover')throw Error('La superficie no pertenece a una cover')
 const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal,center=new Vector3(),normal=new Vector3(),a=new Vector3(),b=new Vector3(),c=new Vector3(),edge=new Vector3();let total=0
 for(let i=0;i<p.count;i+=3){if(n.getY(i)>-.6)continue;a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);const area=edge.subVectors(b,a).cross(c.clone().sub(a)).length()*.5;center.addScaledVector(a.add(b).add(c).multiplyScalar(1/3),area);normal.addScaledVector(new Vector3().fromBufferAttribute(n,i),area);total+=area}
 center.divideScalar(total);normal.normalize()
 const armorFrame=new Matrix4().fromArray(data.referenceTransform).invert().multiply(new Matrix4().fromArray(record.delta)).multiply(bakedToEditor),armorCenter=center.clone().applyMatrix4(armorFrame),side=armorCenter.x>0?'Left':'Right',name=side==='Right'?'rango':'21',texture=`/models/mospeada/cyclone-cover-${name}.png`,source=`assets/texturas/decals/${name}.png`
 const {data:pixels,info}=await sharp(source).toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});let x0=info.width,y0=info.height,x1=0,y1=0
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(pixels[(y*info.width+x)*4+3]>8){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y)}
 x0=Math.max(0,x0-3);y0=Math.max(0,y0-3);x1=Math.min(info.width-1,x1+3);y1=Math.min(info.height-1,y1+3)
 const width=x1-x0+1,height=y1-y0+1
 await sharp(source).toColourspace('srgb').extract({left:x0,top:y0,width,height}).resize({width:512,height:512,fit:'inside'}).png().toFile('public'+texture)
 const up=new Vector3(0,1,0).transformDirection(armorFrame.clone().invert()).projectOnPlane(normal).normalize(),right=new Vector3().crossVectors(up,normal).normalize(),decalWidth=.13
 definitions.push({key,side,name,texture,source,center:center.toArray(),normal:normal.toArray(),up:up.toArray(),right:right.toArray(),size:[decalWidth,decalWidth*height/width],depth:.035,armorCenter:armorCenter.toArray()})
}
definitions.sort((a,b)=>a.side.localeCompare(b.side))
fs.writeFileSync('src/vehicle/coverDecalData.js','// Generated from the authored cover endpoints; Left/Right are Scott\'s Armor sides.\nexport const COVER_DECALS='+JSON.stringify(definitions,null,2)+'\n')
console.log(JSON.stringify(definitions,null,2))
