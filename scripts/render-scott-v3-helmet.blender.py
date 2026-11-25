import bpy,sys,os
from pathlib import Path
from mathutils import Vector

root=Path(__file__).resolve().parents[1]
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
source=Path(args[0]) if args else root/'public/models/mospeada/scott-gear-v3-animated.glb'
label=args[1] if len(args)>1 else 'original'
out=root/'artifacts/scott-v3/helmet';out.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
for obj in bpy.context.scene.objects:
 if obj.type=='ARMATURE':obj.animation_data_clear()
if os.environ.get('MOSPEADA_HELMET_CLAY')=='1':
 mat=bpy.data.materials.new('Geometry diagnostic');mat.diffuse_color=(.65,.65,.65,1);mat.use_nodes=True;mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.75
 for obj in bpy.context.scene.objects:
  if obj.type=='MESH':
   for i in range(len(obj.data.materials)):obj.data.materials[i]=mat
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=12;scene.cycles.use_denoising=True
if os.environ.get('MOSPEADA_HELMET_ALBEDO')=='1':
 for mat in bpy.data.materials:
  if not mat.use_nodes:continue
  shader=mat.node_tree.nodes.get('Principled BSDF')
  if shader:
   source=shader.inputs['Base Color'].links[0].from_socket
   emission=mat.node_tree.nodes.new('ShaderNodeEmission');mat.node_tree.links.new(source,emission.inputs['Color']);mat.node_tree.links.new(emission.outputs[0],mat.node_tree.nodes.get('Material Output').inputs['Surface'])
scene.render.resolution_x=850;scene.render.resolution_y=850;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Helmet studio');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.16,.18,.2,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7
focus=Vector((0,-.06,1.60))
for position,power in [((2,-3,4),450),((-3,-1,3),300),((1,3,3),400)]:
 light=bpy.data.objects.new('Softbox',bpy.data.lights.new('Softbox','AREA'));scene.collection.objects.link(light);light.location=position;light.data.energy=power;light.data.size=3;light.rotation_euler=(focus-light.location).to_track_quat('-Z','Y').to_euler()
camera=bpy.data.objects.new('Helmet camera',bpy.data.cameras.new('Helmet camera'));scene.collection.objects.link(camera);scene.camera=camera;camera.data.type='ORTHO';camera.data.ortho_scale=.45;camera.data.lens=70
views=[('front',(0,-3,1.7)),('right',(3,0,1.7)),('left',(-3,0,1.7)),('rear',(0,3,1.8)),('rear-quarter',(2.5,3,2.1)),('top',(0,.3,4))]
if os.environ.get('MOSPEADA_HELMET_VIEWS'):views=[v for v in views if v[0] in os.environ['MOSPEADA_HELMET_VIEWS'].split(',')]
for name,position in views:
 camera.location=position;camera.rotation_euler=(focus-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(out/(label+'-'+name+'.png'));bpy.ops.render.render(write_still=True)
