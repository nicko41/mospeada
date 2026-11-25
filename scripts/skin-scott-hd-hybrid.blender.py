"""Surface correspondence on the unchanged receiver; no bone relocation."""
import bpy, json, struct, numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/scott-hd-hybrid-v1'
ref=json.loads((OUT/'receiver-reference.json').read_text())
points=[Vector(v) for v in ref['positions']];faces=[ref['indices'][i:i+3] for i in range(0,len(ref['indices']),3)]
bvh=BVHTree.FromPolygons(points,faces,all_triangles=True)
bones={b['name']:Vector(b['position']) for b in ref['bones']};joint={n:i for i,n in enumerate(ref['jointNames'])}
raw=(OUT/'aligned-parts.glb').read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);binary=raw[28+n:]
def accessor(i):
 a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];dim={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
 return np.ndarray((a['count'],dim),dtype=dtype,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',np.dtype(dtype).itemsize*dim),np.dtype(dtype).itemsize))
bpy.ops.wm.open_mainfile(filepath=str(OUT/'scott-hd-aligned.blend'))
material=bpy.data.objects['HD_face'].data.materials[0];bsdf=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED');image=bsdf.inputs['Base Color'].links[0].from_node.image
pixels=np.empty(len(image.pixels),dtype=np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape(image.size[1],image.size[0],4)
def armor(uv):
 c=pixels[min(image.size[1]-1,max(0,int((1-uv[1])*image.size[1]))),min(image.size[0]-1,max(0,int(uv[0]*image.size[0]))),:3]
 return min(c)>.18 and max(c)-min(c)<.28 and c[1]>=c[0]*.88
def surface_weights(p):
 hit,normal,face,distance=bvh.find_nearest(p);ids=faces[face];a,b,c=[points[i] for i in ids];v0=b-a;v1=c-a;v2=hit-a
 d00=v0.dot(v0);d01=v0.dot(v1);d11=v1.dot(v1);d20=v2.dot(v0);d21=v2.dot(v1);den=d00*d11-d01*d01
 if abs(den)<1e-18:bc=[1,0,0]
 else:
  v=(d11*d20-d01*d21)/den;w=(d00*d21-d01*d20)/den;bc=[max(0,1-v-w),max(0,v),max(0,w)]
 weights={}
 for i,f in zip(ids,bc):
  for j,w in zip(ref['joints'][i],ref['weights'][i]):weights[j]=weights.get(j,0)+w*f
 return weights,distance
manifest={'method':'nearest receiver surface triangle + barycentric original skin weights; semantic rigid armor plates','parts':[]};payload=bytearray()
for mi,mesh in enumerate(doc['meshes']):
 for pi,prim in enumerate(mesh['primitives']):
  pos=accessor(prim['attributes']['POSITION']);uv=accessor(prim['attributes']['TEXCOORD_0']);js=np.zeros((len(pos),4),dtype=np.uint8);ws=np.zeros((len(pos),4),dtype='<f4');rigid=0;distances=[];blended=0
  name=mesh['name']
  for i,(xyz,tex) in enumerate(zip(pos,uv)):
   p=Vector(xyz);weights,distance=surface_weights(p);distances.append(distance);owner=None
   if name in ['HD_face','HD_helmet','HD_helmet_left_repair']:owner='mixamorigHead'
   elif name.endswith('_arm'):
    side='Left' if 'Left' in name else 'Right';allowed={joint['mixamorig'+side+n] for n in ['Shoulder','Arm','ForeArm','Hand']};allowed.add(joint['mixamorigSpine2'])
    weights={j:w for j,w in weights.items() if j in allowed}
    e=bones['mixamorig'+side+'ForeArm'];w=bones['mixamorig'+side+'Hand'];t=(p-e).dot(w-e)/(w-e).length_squared
    # Keep surface-interpolated weights across shoulder/elbow boundaries.
    # Texture pixels are not a reliable way to partition a fused plate: a
    # painted seam must never assign neighboring vertices to unrelated joints.
   if owner:weights={joint[owner]:1};rigid+=1
   ranked=sorted(weights.items(),key=lambda t:-t[1])[:4];total=sum(w for j,w in ranked)
   if total<1e-8:raise RuntimeError('Empty surface weights '+name+' '+str(p))
   for k,(j,w) in enumerate(ranked):js[i,k]=j;ws[i,k]=w/total
   if sum(w>.02 for j,w in ranked)>1:blended+=1
  jo=len(payload);payload.extend(js.tobytes());wo=len(payload);payload.extend(ws.tobytes())
  item={'mesh':mi,'primitive':pi,'name':name,'vertices':len(pos),'jointsOffset':jo,'weightsOffset':wo,'rigidVertices':rigid,'blendedVertices':blended,'surfaceDistanceMedian':float(np.median(distances)),'surfaceDistanceMax':max(distances)}
  manifest['parts'].append(item);print('TRANSFERRED',item,flush=True)
(OUT/'skin-weights.bin').write_bytes(payload);(OUT/'skin-report.json').write_text(json.dumps(manifest,indent=2)+'\n')
