import bpy,sys,os
from pathlib import Path
from mathutils import Vector
OUT=Path(os.environ.get('MOSPEADA_SCOTT_V3_INSPECTION_DIR',str(Path(__file__).resolve().parents[1]/'artifacts/scott-v3')))
modes=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['stationary','moving','armor']
for mode in modes:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.ops.import_scene.gltf(filepath=str(OUT/(mode+'-inspection.glb')))
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=8
 scene.render.resolution_x=1000;scene.render.resolution_y=900;scene.render.resolution_percentage=100
 scene.world=bpy.data.worlds.new('V3 pose inspection');scene.world.use_nodes=True
 scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.2,.23,.25,1)
 scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.8
 for pos,power in [((3,-4,5),550),((-3,-2,2),300),((0,3,5),550)]:
  light=bpy.data.objects.new('Softbox',bpy.data.lights.new('Softbox','AREA'));scene.collection.objects.link(light);light.data.energy=power;light.data.size=4;light.location=pos;light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat('-Z','Y').to_euler()
 camera=bpy.data.objects.new('V3 camera',bpy.data.cameras.new('V3 camera'));scene.collection.objects.link(camera);scene.camera=camera;camera.data.type='ORTHO';camera.data.ortho_scale=2.85
 for name,pos in [('profile',(5,0,1.4)),('three-quarter',(3.5,-4,1.6)),('front',(0,-5,1.6)),('rear',(0,5,1.6)),('rear-three-quarter',(-3.5,4,1.6))]:
  if os.environ.get('MOSPEADA_SCOTT_V3_INSPECTION_VIEW') and name not in os.environ['MOSPEADA_SCOTT_V3_INSPECTION_VIEW'].split(','):continue
  camera.location=pos;camera.rotation_euler=(Vector((0,0,1))-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(OUT/(mode+'-'+name+'.png'));bpy.ops.render.render(write_still=True)
