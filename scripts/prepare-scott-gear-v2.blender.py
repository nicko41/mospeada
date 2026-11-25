"""Original donor -> unskinned anatomical alignment -> evaluated reduction.
The original rig is read only. Skinning is deliberately a later stage.
"""
import bpy,json,math,numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/scott-gear-v2'
ref=json.loads((OUT/'reference.json').read_text());bones={b['name']:np.array(b['position']) for b in ref['bones']}
scale=1.7/(.9496849775+.9506199956);offset=np.array([.003941314,.9506199956*scale,.210])
def smooth(a,b,x):
 t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)
def rot(a,b):return np.array(Vector(a).rotation_difference(Vector(b)).to_matrix())
calibration={}
for side,sign in [('Left',1),('Right',-1)]:
 s=np.array([sign*.230,.550,-.280]);e=np.array([sign*.375,.530,-.029]);w=np.array([sign*.525,.515,.230])
 ts,te,tw=[bones['mixamorig'+side+n] for n in ['Arm','ForeArm','Hand']]
 calibration[side]={'s':s,'e':e,'w':w,'ts':ts,'te':te,'tw':tw,'upper':rot(e-s,te-ts),'lower':rot(w-e,tw-te)}
def align(points):
 result=points*scale+offset
 for side,sign in [('Left',1),('Right',-1)]:
  c=calibration[side];s,e,w,ts,te,tw=[c[n] for n in ['s','e','w','ts','te','tw']];upper,lower=c['upper'],c['lower']
  upper_axis=(e-s)/np.linalg.norm(e-s);t=(points-s)@upper_axis
  shoulder=ts+(points-s)@upper.T*scale
  upper_delta=te-(ts+(e-s)@upper.T*scale)
  # Absorb the length discrepancy in the cloth between pad and elbow, not
  # by flattening a shoulder pad or stretching the rigid forearm protector.
  shoulder+=smooth(.175,np.linalg.norm(e-s),t)[:,None]*upper_delta
  forearm=te+(points-e)@lower.T*scale
  along=(points-e)@((w-e)/np.linalg.norm(w-e))
  lower_delta=tw-(te+(w-e)@lower.T*scale)
  forearm+=smooth(.245,np.linalg.norm(w-e),along)[:,None]*lower_delta
  hand=tw+(points-w)@lower.T*scale
  forearm=forearm*(1-smooth(np.linalg.norm(w-e)-.018,np.linalg.norm(w-e)+.012,along))[:,None]+hand*smooth(np.linalg.norm(w-e)-.018,np.linalg.norm(w-e)+.012,along)[:,None]
  blend=smooth(np.linalg.norm(e-s)-.025,np.linalg.norm(e-s)+.020,t)
  arm=shoulder*(1-blend[:,None])+forearm*blend[:,None]
  alpha=smooth(.180,.260,points[:,0]*sign)*smooth(.405,.485,points[:,1])
  pad=((points-np.array([sign*.273,.594,-.215]))/np.array([.086,.075,.113]))**2
  alpha=np.maximum(alpha,(1-smooth(.85,1.75,pad.sum(axis=1)))*smooth(.185,.215,points[:,0]*sign))
  result=result*(1-alpha[:,None])+arm*alpha[:,None]
 return result
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/01-SCOTT/scott-bernard-gear-v2.glb'))
obj=next(o for o in bpy.context.scene.objects if o.type=='MESH');obj.name='Scott_Gear_V2';mesh=obj.data
raw=np.empty(len(mesh.vertices)*3,dtype=np.float32);mesh.vertices.foreach_get('co',raw);blender_points=raw.reshape(-1,3);points=blender_points[:,[0,2,1]].copy();points[:,2]*=-1
source_attribute=mesh.attributes.new(name='_SOURCE_POSITION',type='FLOAT_VECTOR',domain='POINT');source_attribute.data.foreach_set('vector',points.astype(np.float32).ravel())
normals=np.empty(len(mesh.loops)*3,dtype=np.float32);mesh.corner_normals.foreach_get('vector',normals);normals=normals.reshape(-1,3)[:,[0,2,1]].copy();normals[:,2]*=-1
loop_vertices=np.empty(len(mesh.loops),dtype=np.int32);mesh.loops.foreach_get('vertex_index',loop_vertices)
mapped=align(points)
# Transform split normals with the local inverse-transpose Jacobian.
epsilon=1e-5;jac=np.empty((len(points),3,3))
for axis in range(3):
 delta=np.zeros(3);delta[axis]=epsilon;jac[:,:,axis]=(align(points+delta)-align(points-delta))/(2*epsilon)
inverse=np.linalg.pinv(jac).transpose(0,2,1)
new_normals=np.einsum('nij,nj->ni',inverse[loop_vertices],normals);new_normals/=np.maximum(np.linalg.norm(new_normals,axis=1)[:,None],1e-8)
output=mapped[:,[0,2,1]].copy();output[:,1]*=-1;mesh.vertices.foreach_set('co',output.astype(np.float32).ravel());mesh.update()
normal_blender=new_normals[:,[0,2,1]].copy();normal_blender[:,1]*=-1;mesh.normals_split_custom_set(normal_blender.tolist())
obj.select_set(True);bpy.context.view_layer.objects.active=obj
bpy.ops.export_scene.gltf(filepath=str(OUT/'aligned-full.glb'),export_format='GLB',use_selection=True,export_animations=False,export_attributes=True)
landmarks={}
for side,c in calibration.items():
 landmarks[side]={}
 for source_key,target_key in [('s','ts'),('e','te'),('w','tw')]:
  value=align(c[source_key][None,:])[0];landmarks[side][source_key]={'source':c[source_key].tolist(),'aligned':value.tolist(),'target':c[target_key].tolist(),'error':float(np.linalg.norm(value-c[target_key]))}
# Reduction uses one intact manifold, retaining its UV seams and full atlas.
# Do not split it into guessed submeshes or regenerate/repaint its textures.
modifier=obj.modifiers.new('Gear V2 evaluated reduction','DECIMATE');modifier.ratio=.30;modifier.use_collapse_triangulate=True
bpy.ops.object.modifier_apply(modifier=modifier.name)
bpy.ops.export_scene.gltf(filepath=str(OUT/'aligned-optimized.glb'),export_format='GLB',use_selection=True,export_animations=False,export_attributes=True)
report={'sourceTriangles':801630,'optimizedTriangles':sum(len(p.vertices)-2 for p in obj.data.polygons),'uniformBodyScale':scale,'offset':offset.tolist(),'armLandmarks':landmarks,'rigMoved':False,'skinningApplied':False,'texturesRepainted':False}
(OUT/'alignment.json').write_text(json.dumps(report,indent=2)+'\n');bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'alignment.blend'));print('ALIGNMENT_READY',json.dumps(report),flush=True)
