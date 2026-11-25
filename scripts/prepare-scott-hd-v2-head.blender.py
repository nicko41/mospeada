"""Author a deterministic head face selection from the original donor atlas.
This selects geometry only; it never generates skinning or edits the donor.
"""
import bpy,json,struct,hashlib,numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];path=ROOT/'assets/01-SCOTT/scott-hd-cabeza-torso-hombros-brazos.glb'
raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);binary=raw[28+n:]
def accessor(i):
 a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];dim={'SCALAR':1,'VEC2':2,'VEC3':3}[a['type']];dtype={5126:'<f4',5125:'<u4',5123:'<u2'}[a['componentType']]
 return np.ndarray((a['count'],dim),dtype=dtype,buffer=binary,offset=v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',np.dtype(dtype).itemsize*dim),np.dtype(dtype).itemsize))
p=doc['meshes'][0]['primitives'][0];positions=accessor(p['attributes']['POSITION']);uv=accessor(p['attributes']['TEXCOORD_0']);indices=accessor(p['indices']).reshape(-1,3)
tex=doc['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index'];image=doc['images'][doc['textures'][tex]['source']];view=doc['bufferViews'][image['bufferView']]
temp=ROOT/'.local/scott-hd-v2';temp.mkdir(parents=True,exist_ok=True);image_path=temp/'donor-base.jpg';image_path.write_bytes(binary[view['byteOffset']:view['byteOffset']+view['byteLength']])
image=bpy.data.images.load(str(image_path));pixels=np.empty(len(image.pixels),dtype=np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape(image.size[1],image.size[0],4)
center=positions[indices].mean(axis=1);texcoord=uv[indices].mean(axis=1)
u=np.clip((texcoord[:,0]*image.size[0]).astype(int),0,image.size[0]-1);v=np.clip(((1-texcoord[:,1])*image.size[1]).astype(int),0,image.size[1]-1);rgb=pixels[v,u,:3]
x,y,z=center.T;t=np.clip((z-.05)/.25,0,1);cut=.235-(t*t*(3-2*t))*.100
# Helmet ear covers are neutral white; the fused chest collar is green-gray.
# Keep face/blue shell and white ear covers intact, rejecting collar material.
collar=(y<.43)&(rgb[:,1]>rgb[:,0]+.010)&(rgb[:,1]>rgb[:,2]+.010)
selected=np.where((abs(x)<.385)&(y>cut)&(~collar))[0].tolist()
manifest={'donorSha256':hashlib.sha256(raw).hexdigest(),'method':'Anatomical head volume; donor atlas separates neutral helmet ear covers from green-gray collar. Geometry selection only.','triangles':selected}
(ROOT/'assets/01-SCOTT/scott-hd-v2-head-selection.json').write_text(json.dumps(manifest)+'\n')
print('HEAD_SELECTION',len(selected),flush=True)
