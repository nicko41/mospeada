import bpy,json,math
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/scott-hd-hybrid-v2'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models/mospeada/scott-bernard-hd-hybrid-v2.glb'))
# Match the current game's clean body maps for QA, without changing the GLB.
base=bpy.data.objects.get('char1')
if base:
 material=base.data.materials[0];bsdf=next(n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
 def replace_image(socket,path,color):
  queue=[link.from_node for link in socket.links];seen=set()
  while queue:
   node=queue.pop()
   if node in seen:continue
   seen.add(node)
   if node.type=='TEX_IMAGE':
    image=bpy.data.images.load(str(ROOT/path),check_existing=True);image.colorspace_settings.name=color;node.image=image;return
   for source in node.inputs:
    queue.extend(link.from_node for link in source.links)
 replace_image(bsdf.inputs['Base Color'],'public/models/mospeada/scott-shoulders-decals.png','sRGB')
 replace_image(bsdf.inputs['Normal'],'public/models/mospeada/scott-shoulders-normal.png','Non-Color')
 replace_image(bsdf.inputs['Roughness'],'public/models/mospeada/scott-shoulders-roughness.png','Non-Color')
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');rig.animation_data_clear()
for pb in rig.pose.bones:pb.matrix_basis.identity()
bpy.context.view_layer.update()
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=12
scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('QA');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.22,.25,.28,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7
scene.view_settings.view_transform='AgX'
for position,power,size in [((3,-4,5),450,4),((-3,-2,2),250,3),((0,3,5),500,3)]:
 data=bpy.data.lights.new('Softbox','AREA');data.energy=power;data.shape='DISK';data.size=size
 light=bpy.data.objects.new('Softbox',data);scene.collection.objects.link(light);light.location=position;light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('QA');camera=bpy.data.objects.new('QA',data);scene.collection.objects.link(camera);scene.camera=camera;data.type='ORTHO'
def render(name,location,target,scale):
 camera.location=location;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();data.ortho_scale=scale;scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
render('v2-rest-front',(0,-4,.95),(0,0,.86),2.08)
render('v2-rest-profile',(-4,-.4,1.15),(0,0,.86),2.08)
render('v2-head',(-1.2,-3,1.65),(0,0,1.49),.70)
pose_path=OUT/'animation-poses.json'
if pose_path.exists():
 poses=json.loads(pose_path.read_text());conversion=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
 def matrix(values):return Matrix([values[i:i+4] for i in range(0,16,4)]).transposed()
 rest={pb.name:pb.bone.matrix_local.copy() for pb in rig.pose.bones}
 for pose in poses['poses']:
  if pose['name']=='rest':continue
  for record in pose['bones']:
   name=record['name'];pb=rig.pose.bones.get(name) or rig.pose.bones.get(name.replace('mixamorig','mixamorig:'))
   if not pb:continue
   delta=matrix(record['world'])@matrix(poses['rest'][name]).inverted()
   pb.matrix=rig.matrix_world.inverted()@conversion@delta@conversion.inverted()@rig.matrix_world@rest[pb.name]
   bpy.context.view_layer.update()
  points=[o.matrix_world@Vector(c) for o in scene.objects if o.type=='MESH' for c in o.evaluated_get(bpy.context.evaluated_depsgraph_get()).bound_box]
  low=Vector(tuple(min(p[i] for p in points) for i in range(3)));high=Vector(tuple(max(p[i] for p in points) for i in range(3)));center=(low+high)*.5;span=max(high.x-low.x,high.z-low.z)*1.22
  render('v2-'+pose['name'],center+Vector((2,-4,.65)),center,max(1.7,span))
