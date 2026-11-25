import bpy,json,math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/scott-hd-hybrid-v1'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models/mospeada/scott-bernard-hd-hybrid-v1.glb'))
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');rig.animation_data_clear()
for track in rig.animation_data.nla_tracks if rig.animation_data else []:track.mute=True
for pb in rig.pose.bones:pb.matrix_basis.identity()
bpy.context.view_layer.update()
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=12
scene.render.resolution_x=1200;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('QA');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.22,.25,.28,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7
scene.view_settings.view_transform='AgX'
for position,power,size in [((3,-4,5),450,4),((-3,-2,2),250,3),((0,3,5),500,3)]:
 data=bpy.data.lights.new('Softbox','AREA');data.energy=power;data.shape='DISK';data.size=size
 light=bpy.data.objects.new('Softbox',data);scene.collection.objects.link(light);light.location=position;light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('QA');camera=bpy.data.objects.new('QA',data);scene.collection.objects.link(camera);scene.camera=camera;data.type='ORTHO'
def render(name,location,target,scale):
 camera.location=location;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();data.ortho_scale=scale;scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
render('hybrid-rest-front',(0,-4,.95),(0,0,.86),2.08)
render('hybrid-head',(-1.2,-3,1.65),(0,0,1.49),.70)
render('hybrid-rest-back',(0,4,.95),(0,0,.86),2.08)
