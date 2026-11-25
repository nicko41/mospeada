import bpy,json,struct,numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/scott-rigid-chest';OUT.mkdir(parents=True,exist_ok=True)
def glb(p):
 raw=p.read_bytes();n=struct.unpack_from('<I',raw,12)[0];return json.loads(raw[20:20+n]),raw[28+n:]
def accessor(d,b,i):
 a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];size={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
 return np.ndarray((a['count'],size),dtype=dtype,buffer=b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',np.dtype(dtype).itemsize*size),np.dtype(dtype).itemsize))
d,b=glb(ROOT/'artifacts/scott-gear-v2/aligned-optimized.glb');p=d['meshes'][0]['primitives'][0];xyz=accessor(d,b,p['attributes']['POSITION']);source=accessor(d,b,p['attributes']['_SOURCE_POSITION']);uv=accessor(d,b,p['attributes']['TEXCOORD_0']);tri=accessor(d,b,p['indices']).reshape(-1,3)
original,original_bin=glb(ROOT/'public/models/mospeada/scott-bernard-gear-v2-animated.glb');material=original['materials'][original['meshes'][0]['primitives'][0]['material']];tex=material['pbrMetallicRoughness']['baseColorTexture']['index'];im=original['images'][original['textures'][tex]['source']];view=original['bufferViews'][im['bufferView']];image_path=OUT/'source-base.png';image_path.write_bytes(original_bin[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]);image=bpy.data.images.load(str(image_path));image.colorspace_settings.name='Non-Color';pixels=np.empty(len(image.pixels),dtype=np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape(image.size[1],image.size[0],4)
u=np.clip((uv[:,0]*image.size[0]).astype(int),0,image.size[0]-1);v=np.clip(((1-uv[:,1])*image.size[1]).astype(int),0,image.size[1]-1);rgb=pixels[v,u,:3]
red=(rgb[:,0]>rgb[:,1]*1.20)&(rgb[:,0]>rgb[:,2]*1.25)&(rgb[:,0]>.10)
blue=(rgb[:,2]>rgb[:,0]*1.25)&(rgb[:,2]>rgb[:,1]*1.10)
hard=(~red)&(~blue)&(rgb.max(axis=1)>.24)
sx,sy,sz=source.T
region=(sy>.31)&(sy<.68)&(abs(sx)<.18)&(abs(xyz[:,0]-.00394)<.178)&(sz>-.24)
labels=np.full(len(xyz),255,dtype=np.uint8)
# Restrict by anatomical regions and atlas material. White decals and outlines
# stay with the surrounding hard plate; red cloth is explicitly excluded.
chest=region&hard&(~((abs(sx)<.065)&(sy>.56)))
labels[chest]=3
keys={};canonical=np.array([keys.setdefault(tuple(np.round(p*1e5).astype(int)),len(keys)) for p in xyz]);parent=np.arange(len(keys))
def find(i):
 while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
 return int(i)
for face in tri:
 ids=[int(canonical[i]) for i in face if labels[i]==3]
 for i in ids[1:]:parent[find(i)]=find(ids[0])
components={}
for i in np.where(labels==3)[0]:components.setdefault(find(canonical[i]),[]).append(int(i))
stats=[]
for ids in sorted(components.values(),key=len,reverse=True):
 points=xyz[ids];stats.append({'count':len(ids),'min':points.min(axis=0).tolist(),'max':points.max(axis=0).tolist(),'center':points.mean(axis=0).tolist()})
 # Small disconnected slivers under the helmet are not part of the plate.
 if points[:,1].min()>1.44 and abs(points[:,0].mean())<.12:labels[ids]=255
(OUT/'selection-components.json').write_text(json.dumps(stats,indent=2)+'\n')
selected=np.where(labels!=255)[0];ids=(selected+15429).tolist();owners=labels[selected].tolist()
report={'legacyVerticesPreserved':15429,'selectedVertices':len(ids),'regions':{str(owner):int((labels==owner).sum()) for owner in [3]},'vertexIds':ids,'owners':owners,'redClothSelected':int((red&(labels!=255)).sum()),'method':'Front chest only; atlas material and donor anatomical regions; shoulder pads, back and collar excluded'}
(OUT/'selection.json').write_text(json.dumps(report)+'\n');print(json.dumps({k:v for k,v in report.items() if k not in ['vertexIds','owners']}),flush=True)
