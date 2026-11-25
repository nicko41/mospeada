import bpy,json,struct,numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/scott-source-chest';OUT.mkdir(parents=True,exist_ok=True)
def glb(path):
 raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0];return json.loads(raw[20:20+n]),raw[28+n:]
def attr(d,b,i):
 a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
 return np.ndarray((a['count'],n),dtype=dtype,buffer=b,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',np.dtype(dtype).itemsize*n),np.dtype(dtype).itemsize))
donor,binary=glb(ROOT/'assets/01-SCOTT/scott-bernard-gear-v2.glb');primitive=donor['meshes'][0]['primitives'][0];material=donor['materials'][primitive.get('material',0)];image=donor['images'][donor['textures'][material['pbrMetallicRoughness']['baseColorTexture']['index']]['source']];view=donor['bufferViews'][image['bufferView']];texture=OUT/'source-base.png';texture.write_bytes(binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]);im=bpy.data.images.load(str(texture));im.colorspace_settings.name='Non-Color';pixels=np.empty(len(im.pixels),dtype=np.float32);im.pixels.foreach_get(pixels);pixels=pixels.reshape(im.size[1],im.size[0],4)
def select(points,uv,triangles):
 center=points[triangles].mean(axis=1);tex=uv[triangles].mean(axis=1);u=np.clip((tex[:,0]*im.size[0]).astype(int),0,im.size[0]-1);v=np.clip(((1-tex[:,1])*im.size[1]).astype(int),0,im.size[1]-1);rgb=pixels[v,u,:3]
 red=(rgb[:,0]>rgb[:,1]*1.20)&(rgb[:,0]>rgb[:,2]*1.25)&(rgb[:,0]>.10);blue=(rgb[:,2]>rgb[:,0]*1.25)&(rgb[:,2]>rgb[:,1]*1.10);x,y,z=center.T
 width=np.where(y<.50,.265,.180)
 eligible=(y>.27)&(y<.735)&(abs(x)<width)&(z>-.30)&(~((abs(x)<.065)&(y>.56)))&(~red)&(~blue)
 keys={};canonical=np.array([keys.setdefault(tuple(np.round(p*1e5).astype(int)),len(keys)) for p in points]);parent=np.arange(len(keys))
 def find(i):
  while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
  return int(i)
 for face in triangles[eligible]:
  ids=canonical[face]
  for i in ids[1:]:parent[find(i)]=find(ids[0])
 components={}
 for face in np.where(eligible)[0]:components.setdefault(find(canonical[triangles[face,0]]),[]).append(int(face))
 chosen=max(components.values(),key=len);ids=np.unique(triangles[chosen]);return {'faceIds':chosen,'vertexIds':ids.tolist(),'triangles':len(chosen),'vertices':len(ids),'min':points[ids].min(axis=0).tolist(),'max':points[ids].max(axis=0).tolist(),'redFacesSelected':int(red[chosen].sum())}
source=select(attr(donor,binary,primitive['attributes']['POSITION']),attr(donor,binary,primitive['attributes']['TEXCOORD_0']),attr(donor,binary,primitive['indices']).reshape(-1,3))
aligned,aligned_binary=glb(ROOT/'artifacts/scott-gear-v2/aligned-optimized.glb');p=aligned['meshes'][0]['primitives'][0];replacement=select(attr(aligned,aligned_binary,p['attributes']['_SOURCE_POSITION']),attr(aligned,aligned_binary,p['attributes']['TEXCOORD_0']),attr(aligned,aligned_binary,p['indices']).reshape(-1,3))
report={'source':source,'replacement':replacement,'sourcePath':'assets/01-SCOTT/scott-bernard-gear-v2.glb','scope':'Complete connected original front torso armor, including plate edges/thickness and upper discs; shoulder pads remain outside'};(OUT/'selection.json').write_text(json.dumps(report)+'\n');print(json.dumps({k:{n:v for n,v in value.items() if n not in ['faceIds','vertexIds']} if isinstance(value,dict) else value for k,value in report.items()}),flush=True)
