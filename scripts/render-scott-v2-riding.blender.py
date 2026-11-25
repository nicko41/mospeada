import bpy,sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];phase=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'before';OUT=ROOT/'artifacts/scott-v2-riding'/phase
for mode in ['rest','moving']:
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(OUT/(mode+'.glb')))
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=8;scene.render.resolution_x=1200;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
 scene.world=bpy.data.worlds.new('Pose inspection');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.20,.23,.25,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.8
 for position,power,size in [((3,-4,5),550,4),((-3,-2,2),300,3),((0,3,5),550,3)]:
  light=bpy.data.objects.new('Softbox',bpy.data.lights.new('Softbox','AREA'));scene.collection.objects.link(light);light.data.energy=power;light.data.shape='DISK';light.data.size=size;light.location=position;light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat('-Z','Y').to_euler()
 data=bpy.data.cameras.new('Pose camera');camera=bpy.data.objects.new('Pose camera',data);scene.collection.objects.link(camera);scene.camera=camera;data.type='ORTHO';data.ortho_scale=3.0;target=Vector((0,0,1.0))
 for name,position in [('front',(0,-5,1.20)),('profile',(5,-.05,1.2)),('back',(0,5,1.2)),('three-quarter',(3.5,-4,1.6))]:
  camera.location=position;camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(OUT/(mode+'-'+name+'.png'));bpy.ops.render.render(write_still=True)
