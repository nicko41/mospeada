import bpy,sys
from pathlib import Path
from mathutils import Vector
out=Path(__file__).resolve().parents[1]/'artifacts/scott-v3/undersuit'
for name in ['ride-after','ride-before','extended-after','extended-before']:
 bpy.ops.wm.read_factory_settings(use_empty=True)
 bpy.ops.import_scene.gltf(filepath=str(out/(name+'-inspection.glb')))
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=12
 scene.render.resolution_x=800;scene.render.resolution_y=800;scene.render.resolution_percentage=100
 scene.world=bpy.data.worlds.new('Shoulder inspection');scene.world.use_nodes=True
 scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.18,.21,.23,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.8
 # Use the same receiver pose's shoulder focus for before/after.
 after=name.replace('before','after')
 if name.endswith('after'):
  cloth=next(o for o in scene.objects if 'Right_shoulder_undersuit' in o.name)
  focus=sum((cloth.matrix_world@v.co for v in cloth.data.vertices),Vector())/len(cloth.data.vertices)
  (out/(name.split('-')[0]+'-focus.txt')).write_text(','.join(str(x) for x in focus))
 else:focus=Vector(tuple(float(x) for x in (out/(name.split('-')[0]+'-focus.txt')).read_text().split(',')))
 for pos,power in [((3,-4,5),500),((-3,-2,2),300),((0,3,5),500)]:
  light=bpy.data.objects.new('Softbox',bpy.data.lights.new('Softbox','AREA'));scene.collection.objects.link(light);light.data.energy=power;light.data.size=4;light.location=pos;light.rotation_euler=(focus-light.location).to_track_quat('-Z','Y').to_euler()
 camera=bpy.data.objects.new('Shoulder camera',bpy.data.cameras.new('Shoulder camera'));scene.collection.objects.link(camera);scene.camera=camera;camera.data.type='ORTHO';camera.data.ortho_scale=.70
 for view,offset in [('front',(-3,-4,1.3)),('rear',(-3,4,1.3))]:
  camera.location=focus+Vector(offset);camera.rotation_euler=(focus-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(out/(name+'-'+view+'.png'));bpy.ops.render.render(write_still=True)
