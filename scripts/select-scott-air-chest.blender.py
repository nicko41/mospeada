import bpy,json,struct,numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/scott-air-chest';OUT.mkdir(parents=True,exist_ok=True)
def glb(path):
 raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0];return json.loads(raw[20:20+n]),raw[28+n:]
def attr(d,b,i):
 a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];dtype={5126:'<f4',5125:'<u4',5121:'u1',5123:'<u2'}[a['componentType']]
 return np.ndarray((a['count'],n),dtype=dtype,buffer=b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',np.dtype(dtype).itemsize*n),np.dtype(dtype).itemsize))
d,b=glb(ROOT/'artifacts/scott-gear-v2/aligned-optimized.glb');p=d['meshes'][0]['primitives'][0];xyz=attr(d,b,p['attributes']['POSITION']);source=attr(d,b,p['attributes']['_SOURCE_POSITION']);uv=attr(d,b,p['attributes']['TEXCOORD_0']);tri=attr(d,b,p['indices']).reshape(-1,3)
image=bpy.data.images.load(str(ROOT/'artifacts/scott-rigid-chest/source-base.png'));image.colorspace_settings.name='Non-Color';pixels=np.empty(len(image.pixels),dtype=np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape(image.size[1],image.size[0],4)
center=source[tri].mean(axis=1);mapped=xyz[tri].mean(axis=1);tex=uv[tri].mean(axis=1);u=np.clip((tex[:,0]*image.size[0]).astype(int),0,image.size[0]-1);v=np.clip(((1-tex[:,1])*image.size[1]).astype(int),0,image.size[1]-1);rgb=pixels[v,u,:3]
red=(rgb[:,0]>rgb[:,1]*1.20)&(rgb[:,0]>rgb[:,2]*1.25)&(rgb[:,0]>.10);blue=(rgb[:,2]>rgb[:,0]*1.25)&(rgb[:,2]>rgb[:,1]*1.10);sx,sy,sz=center.T
eligible=(sy>.31)&(sy<.68)&(abs(sx)<.18)&(abs(mapped[:,0]-.00394)<.178)&(sz>-.24)&(~((abs(sx)<.065)&(sy>.56)))&(~red)&(~blue)
# Select complete connected front-shell triangles, including their dark seams.
# No per-vertex material threshold leaves fragments inside a rigid plate.
keys={};canonical=np.array([keys.setdefault(tuple(np.round(p*1e5).astype(int)),len(keys)) for p in xyz]);parent=np.arange(len(keys))
def find(i):
 while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
 return int(i)
for face in tri[eligible]:
 ids=canonical[face]
 for i in ids[1:]:parent[find(i)]=find(ids[0])
components={}
for face in np.where(eligible)[0]:components.setdefault(find(canonical[tri[face,0]]),[]).append(int(face))
parts=sorted(components.values(),key=len,reverse=True);faces=parts[0];vertices=np.unique(tri[faces]);selection={'sourceModel':'scott-bernard-gear-v2-animated.glb','referenceClip':'air_squat','referenceTime':.6688890198866526,'faceIds':faces,'vertexIds':(vertices+15429).tolist(),'legacyVertices':15429,'faces':len(faces),'vertices':len(vertices),'scope':'Complete connected front chest shell; shoulder pads, back, neck and red cloth excluded'}
(OUT/'selection.json').write_text(json.dumps(selection)+'\n');(ROOT/'src/vehicle/scottFrontChestSelection.json').write_text(json.dumps({'faceIds':faces,'referenceClip':selection['referenceClip'],'referenceTime':selection['referenceTime']})+'\n');print(json.dumps({k:v for k,v in selection.items() if k not in ['faceIds','vertexIds']}),flush=True)
