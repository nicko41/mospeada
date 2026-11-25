import bpy,sys,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'artifacts/scott-rigid-chest';mask='--mask' in sys.argv
pairs=[('mask-rest','SELECCION EN REPOSO')] if mask else [('before-riding','ANTES'),('after-riding','ARMADURA RIGIDA')]
for view,campos in [('front',(0,-6,1.5)),('three-quarter',(3,-5,1.7))]:
 bpy.ops.wm.read_factory_settings(use_empty=True);groups=[]
 for key,label in pairs:
  old=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(OUT/(key+'.glb')));group=bpy.data.objects.new(label,None);bpy.context.scene.collection.objects.link(group)
  for obj in set(bpy.data.objects)-old:
   if obj!=group and obj.parent is None:obj.parent=group
  groups.append(group)
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=12;scene.render.resolution_x=1600 if not mask else 1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
 scene.world=bpy.data.worlds.new('Inspection');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.17,.20,.23,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.8
 for position,power,size in [((3,-4,5),650,4),((-3,-3,3),550,4),((0,3,5),650,4)]:
  light=bpy.data.objects.new('Softbox',bpy.data.lights.new('Softbox','AREA'));scene.collection.objects.link(light);light.data.energy=power;light.data.shape='DISK';light.data.size=size;light.location=position;light.rotation_euler=(Vector((0,0,1.5))-light.location).to_track_quat('-Z','Y').to_euler()
 camera=bpy.data.objects.new('Camera',bpy.data.cameras.new('Camera'));scene.collection.objects.link(camera);scene.camera=camera;camera.data.type='ORTHO';camera.data.ortho_scale=1.3 if mask else 2.15;target=Vector((0,0,1.28 if mask else 1.67));camera.location=campos;camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();rotation=camera.rotation_euler.to_matrix();right=rotation@Vector((1,0,0));up=rotation@Vector((0,1,0))
 for i,group in enumerate(groups):group.location=right*(0 if mask else (-.55 if i==0 else .55))
 for i,(_,label)in enumerate(pairs):
  data=bpy.data.curves.new('Label','FONT');data.body=label;data.align_x='CENTER';data.size=.045;obj=bpy.data.objects.new(label,data);scene.collection.objects.link(obj);obj.location=target+right*(0 if mask else (-.55 if i==0 else .55))-up*(.58 if mask else .58);obj.rotation_euler=camera.rotation_euler
 scene.render.filepath=str(OUT/(('selection-' if mask else 'comparison-')+view+'.png'));bpy.ops.render.render(write_still=True)
