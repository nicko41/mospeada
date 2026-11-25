import bpy,json,struct,sys,numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/scott-gear-v2'
def glb(path):
 raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0];return json.loads(raw[20:20+n]),raw[28+n:]
def accessor(doc,binary,i):
 a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];dim={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
 return np.ndarray((a['count'],dim),dtype=dtype,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',np.dtype(dtype).itemsize*dim),np.dtype(dtype).itemsize))
doc,binary=glb(OUT/'aligned-optimized.glb');primitive=doc['meshes'][0]['primitives'][0];points=accessor(doc,binary,primitive['attributes']['POSITION']);uvs=accessor(doc,binary,primitive['attributes']['TEXCOORD_0']);triangles=accessor(doc,binary,primitive['indices']).reshape(-1,3)
donor,source=glb(ROOT/'assets/01-SCOTT/scott-bernard-gear-v2.glb');tex=donor['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index'];image=donor['images'][donor['textures'][tex]['source']];v=donor['bufferViews'][image['bufferView']]
temp=ROOT/'.local/scott-gear-v2';temp.mkdir(parents=True,exist_ok=True);path=temp/'donor-base.png';path.write_bytes(source[v['byteOffset']:v['byteOffset']+v['byteLength']])
image=bpy.data.images.load(str(path));image.colorspace_settings.name='Non-Color';pixels=np.empty(len(image.pixels),dtype=np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape(image.size[1],image.size[0],4)
centers=points[triangles].mean(axis=1);source_points_attr=accessor(doc,binary,primitive['attributes']['_SOURCE_POSITION']);source_centers=source_points_attr[triangles].mean(axis=1);uv=uvs[triangles].mean(axis=1);u=np.clip((uv[:,0]*image.size[0]).astype(int),0,image.size[0]-1);v=np.clip(((1-uv[:,1])*image.size[1]).astype(int),0,image.size[1]-1);rgb=pixels[v,u,:3]
red=(rgb[:,0]>rgb[:,1]*1.28)&(rgb[:,0]>rgb[:,2]*1.35)
blue=(rgb[:,2]>rgb[:,0]*1.25)&(rgb[:,2]>rgb[:,1]*1.10)
gray=(~red)&(~blue)&(rgb.max(axis=1)>.34)
green=(rgb[:,1]>rgb[:,0]*1.035)&(rgb[:,1]>rgb[:,2]*1.020)
head=(source_centers[:,1]>.665)&(abs(source_centers[:,0])<.175)&(~green);gray|=head
# Weld only graph identities across UV/normal seams. Vertex streams and all
# triangle indices remain unchanged; this graph never rewrites the geometry.
keys={};canonical=np.empty(len(points),dtype=np.int32)
for i,p in enumerate(points):
 key=tuple(np.round(p*1e5).astype(int));canonical[i]=keys.setdefault(key,len(keys))
parent=np.arange(len(keys),dtype=np.int32)
def find(i):
 while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
 return int(i)
def join(a,b):parent[find(a)]=find(b)
for ids in canonical[triangles[gray]]:join(ids[0],ids[1]);join(ids[1],ids[2])
components={}
for fi in np.where(gray)[0]:
 key=find(canonical[triangles[fi,0]]);components.setdefault(key,[]).append(int(fi))
groups=[]
for ids in sorted(components.values(),key=len,reverse=True):
 c=centers[ids];groups.append({'triangles':len(ids),'center':c.mean(axis=0).tolist(),'min':c.min(axis=0).tolist(),'max':c.max(axis=0).tolist()})
(OUT/'armor-components.json').write_text(json.dumps(groups,indent=2)+'\n');print('ARMOR_COMPONENTS',len(groups),flush=True)
if '--inspect' in sys.argv:sys.exit(0)
ref=json.loads((OUT/'reference.json').read_text());source_points=[Vector(p) for p in ref['positions']];source_faces=[ref['indices'][i:i+3] for i in range(0,len(ref['indices']),3)];bvh=BVHTree.FromPolygons(source_points,source_faces,all_triangles=True)
joint={name:i for i,name in enumerate(ref['jointNames'])};bone={b['name']:np.array(b['position']) for b in ref['bones']}
base=np.zeros((len(points),24),dtype=np.float64);distances=[]
for i,xyz in enumerate(points):
 hit,normal,fi,distance=bvh.find_nearest(Vector(xyz));ids=source_faces[fi];a,b,c=[source_points[j] for j in ids];v0=b-a;v1=c-a;v2=hit-a;d00=v0.dot(v0);d01=v0.dot(v1);d11=v1.dot(v1);d20=v2.dot(v0);d21=v2.dot(v1);den=d00*d11-d01*d01
 if abs(den)<1e-18:bc=[1,0,0]
 else:
  v=(d11*d20-d01*d21)/den;w=(d00*d21-d01*d20)/den;bc=np.maximum([1-v-w,v,w],0);bc/=sum(bc)
 for vertex,f in zip(ids,bc):
  for j,w in zip(ref['joints'][vertex],ref['weights'][vertex]):base[i,j]+=f*w
 distances.append(distance)
counts=np.bincount(canonical,minlength=len(keys));prior=np.zeros((len(keys),24));np.add.at(prior,canonical,base);prior/=counts[:,None]
W=prior.copy()
edges=np.concatenate([canonical[triangles[:,[0,1]]],canonical[triangles[:,[1,2]]],canonical[triangles[:,[2,0]]]],axis=0);edges=np.unique(np.sort(edges,axis=1),axis=0);edges=edges[edges[:,0]!=edges[:,1]]
degree=np.bincount(edges.ravel(),minlength=len(keys));free=degree>0
# Regularize the surface transfer across UV seams before adding rigid cores.
# The source solution remains the prior; weights never cross disconnected mesh.
for iteration in range(6):
 sums=np.zeros_like(W);np.add.at(sums,edges[:,0],W[edges[:,1]]);np.add.at(sums,edges[:,1],W[edges[:,0]])
 W[free]=.55*sums[free]/degree[free,None]+.45*prior[free]
W=W[canonical];labels=np.full(len(points),255,dtype=np.uint8)
def ramp(a,b,v):
 t=np.clip((v-a)/(b-a),0,1);return t*t*(3-2*t)
def bind(j,alpha):
 global W
 alpha=np.clip(alpha,0,1);W*=1-alpha[:,None];W[:,j]+=alpha;labels[(alpha>0)&(alpha<.999999)]=255;labels[alpha>=.999999]=j
sx,sy,sz=source_points_attr.T
# Rigid cores retain the exact joint transform. Their border bands use the
# transferred skin to preserve the fused source shell without tearing it.
bind(joint['mixamorigSpine2'],ramp(.31,.38,sy)*(1-ramp(.54,.64,sy))*(1-ramp(.20,.27,abs(sx))))
bind(joint['mixamorigHead'],ramp(.65,.73,sy)*(1-ramp(.17,.21,abs(sx))))
for side,sign in [('Left',1),('Right',-1)]:
 right_side=ramp(.015,.06,sx*sign);j=lambda n:joint['mixamorig'+side+n]
 pad=np.sum(((source_points_attr-np.array([sign*.273,.594,-.215]))/np.array([.105,.100,.135]))**2,axis=1)
 bind(j('Arm'),(1-ramp(.55,1.65,pad))*ramp(.18,.225,sx*sign)*right_side)
 along=(source_points_attr-np.array([sign*.23,.55,-.28]))@np.array([sign*.5,0,.8660254])
 arm=ramp(.40,.47,sy)*ramp(.25,.33,sx*sign)*right_side
 bind(j('ForeArm'),ramp(.285,.335,along)*(1-ramp(.545,.605,along))*arm)
 bind(j('Hand'),ramp(.59,.645,along)*arm)
 leg=right_side*(1-ramp(.07,.14,sy))
 bind(j('UpLeg'),ramp(-.24,-.18,sy)*(1-ramp(.0,.09,sy))*leg)
 bind(j('Leg'),ramp(-.65,-.55,sy)*(1-ramp(-.32,-.22,sy))*leg)
 bind(j('Foot'),(1-ramp(-.68,-.58,sy))*right_side)
bind(joint['mixamorigHips'],ramp(.06,.13,sy)*(1-ramp(.26,.32,sy))*(1-ramp(.22,.27,abs(sx))))
order=np.argsort(-W,axis=1)[:,:4];values=np.take_along_axis(W,order,axis=1);values/=values.sum(axis=1)[:,None]
# Retain the complete source topology; blend the existing junction bands.
keep=np.ones(len(triangles),dtype=bool);removed=[]
(OUT/'render-indices.bin').write_bytes(triangles[keep].astype('<u4').tobytes())
(OUT/'separated-armor-interfaces.json').write_text(json.dumps({'faces':removed,'reason':'No faces removed. Source topology retained with continuous skin transition bands.'},indent=2)+'\n')
payload=order.astype(np.uint8).tobytes()+values.astype('<f4').tobytes()+labels.tobytes();(OUT/'skin.bin').write_bytes(payload)
# Evaluate the reduction against the full, already-aligned surface.
full,full_binary=glb(OUT/'aligned-full.glb');prim=full['meshes'][0]['primitives'][0];fp=accessor(full,full_binary,prim['attributes']['POSITION']);ft=accessor(full,full_binary,prim['indices']).reshape(-1,3)
surface=BVHTree.FromPolygons([Vector(p) for p in fp],ft.tolist(),all_triangles=True);deviation=[surface.find_nearest(Vector(p))[3] for p in points[::max(1,len(points)//15000)]]
report={'vertices':len(points),'triangles':int(keep.sum()),'separatedFusionFaces':len(removed),'jointsOffset':0,'weightsOffset':len(points)*4,'rigidLabelsOffset':len(points)*20,'method':'Barycentric nearest original surface; anatomically constrained rigid armor and cloth boundary diffusion','rigidVertices':int((labels!=255).sum()),'flexibleVertices':int((labels==255).sum()),'surfaceDistanceMedian':float(np.median(distances)),'surfaceDistanceP95':float(np.percentile(distances,95)),'reductionSurfaceErrorP95':float(np.percentile(deviation,95)),'reductionSurfaceErrorMax':max(deviation),'weightsNormalized':True,'rigidOwners':{ref['jointNames'][j]:int((labels==j).sum()) for j in range(24) if (labels==j).any()}}
(OUT/'skin.json').write_text(json.dumps(report,indent=2)+'\n');print('SKIN_READY',json.dumps(report),flush=True)
