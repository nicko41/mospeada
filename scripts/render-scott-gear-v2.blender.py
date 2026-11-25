import bpy,json,sys
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/scott-gear-v2'
final='--final' in sys.argv
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models/mospeada/scott-bernard-gear-v2-animated.glb' if final else OUT/'aligned-optimized.glb'))
rig=next((o for o in bpy.context.scene.objects if o.type=='ARMATURE'),None)
if rig:
 rig.animation_data_clear()
 for pb in rig.pose.bones:pb.matrix_basis.identity()
bpy.context.view_layer.update();scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=12
scene.render.resolution_x=1100;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('QA');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.2,.23,.25,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7
scene.view_settings.view_transform='AgX'
for position,power,size in [((3,-4,5),500,4),((-3,-2,2),300,3),((0,3,5),550,3)]:
 data=bpy.data.lights.new('Softbox','AREA');data.energy=power;data.shape='DISK';data.size=size
 light=bpy.data.objects.new('Softbox',data);scene.collection.objects.link(light);light.location=position;light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('QA');camera=bpy.data.objects.new('QA',data);scene.collection.objects.link(camera);scene.camera=camera;data.type='ORTHO'
def render(name,location,target,scale):
 camera.location=location;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();data.ortho_scale=scale;scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
prefix='rigged' if final else 'aligned'
render(prefix+'-front',(0,-4,.9),(0,0,.85),2.10)
render(prefix+'-profile',(-4,-.15,1.05),(0,0,.85),2.10)
render(prefix+'-back',(0,4,.9),(0,0,.85),2.10)
if final:
 poses=json.loads((OUT/'animation-poses.json').read_text());conversion=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
 def matrix(values):return Matrix([values[i:i+4] for i in range(0,16,4)]).transposed()
 rest={pb.name:pb.bone.matrix_local.copy() for pb in rig.pose.bones}
 for pose in poses['poses']:
  if pose['name']=='rest':continue
  for record in pose['bones']:
   name=record['name'];pb=rig.pose.bones.get(name) or rig.pose.bones.get(name.replace('mixamorig','mixamorig:'))
   if not pb:continue
   delta=matrix(record['world'])@matrix(poses['rest'][name]).inverted();pb.matrix=rig.matrix_world.inverted()@conversion@delta@conversion.inverted()@rig.matrix_world@rest[pb.name];bpy.context.view_layer.update()
  deps=bpy.context.evaluated_depsgraph_get();points=[]
  for obj in scene.objects:
   if obj.type!='MESH':continue
   evaluated=obj.evaluated_get(deps);mesh=evaluated.to_mesh()
   # Bounds use rendered indices, excluding the unrendered anchor references.
   ids={i for poly in mesh.polygons for i in poly.vertices};points.extend(obj.matrix_world@mesh.vertices[i].co for i in ids);evaluated.to_mesh_clear()
  low=Vector(tuple(min(p[i] for p in points) for i in range(3)));high=Vector(tuple(max(p[i] for p in points) for i in range(3)));center=(low+high)*.5;span=max(high.x-low.x,high.z-low.z)*1.22
  render('rigged-'+pose['name'],center+Vector((2,-4,.65)),center,max(1.7,span))
