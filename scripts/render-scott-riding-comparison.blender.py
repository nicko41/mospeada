import bpy,sys,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1];folder=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'seated-comparison';OUT=ROOT/'artifacts/scott-v2-riding'/folder
if folder=='seat-forward-adjustment':
 measurements=json.loads((OUT/'measurements.json').read_text());forward_cm=round((measurements['adjusted']['hips'][2]-measurements['approved-base']['hips'][2])*100)
 variants=[('approved-base','BASE APROBADA'),('adjusted',f'AJUSTE +{forward_cm} CM')]
elif folder=='pelvis-support':variants=[('before','ANTES'),('after','APOYO CORREGIDO')]
else:variants=[('previous','ANTERIOR'),('air-squat-seated','AIR SQUAT - NUEVA')]
bpy.ops.wm.read_factory_settings(use_empty=True)
groups=[]
for key,label in variants:
 before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(OUT/(key+'.glb')))
 group=bpy.data.objects.new(label,None);bpy.context.scene.collection.objects.link(group)
 for obj in set(bpy.data.objects)-before:
  if obj!=group and obj.parent is None:obj.parent=group
 groups.append(group)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=8;scene.render.resolution_x=1800;scene.render.resolution_y=1100;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX'
scene.world=bpy.data.worlds.new('Comparison');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.19,.22,.24,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.85
for position,power,size in [((3,-4,6),800,6),((-4,-3,4),650,5),((0,5,6),800,6)]:
 light=bpy.data.objects.new('Softbox',bpy.data.lights.new('Softbox','AREA'));scene.collection.objects.link(light);light.data.energy=power;light.data.shape='DISK';light.data.size=size;light.location=position;light.rotation_euler=(Vector((0,0,1))-light.location).to_track_quat('-Z','Y').to_euler()
camera=bpy.data.objects.new('Camera',bpy.data.cameras.new('Camera'));scene.collection.objects.link(camera);scene.camera=camera;camera.data.type='ORTHO';camera.data.ortho_scale=6.6
labels=[]
for _,label in variants:
 data=bpy.data.curves.new('Label','FONT');data.body=label;data.align_x='CENTER';data.size=.15
 obj=bpy.data.objects.new(label,data);scene.collection.objects.link(obj);material=bpy.data.materials.new('Label');material.diffuse_color=(.8,.91,.95,1);data.materials.append(material);labels.append(obj)
for name,position,target in [('profile',(6,0,1.3),(0,0,1)),('front',(0,-6,1.3),(0,0,1)),('top',(0,-.001,7),(0,0,0))]:
 camera.location=position;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();rotation=camera.rotation_euler.to_matrix();right=rotation@Vector((1,0,0));up=rotation@Vector((0,1,0))
 for i,group in enumerate(groups):group.location=right*(-1.68 if i==0 else 1.68)
 for i,label in enumerate(labels):label.location=Vector(target)+right*(-1.68 if i==0 else 1.68)-up*1.72;label.rotation_euler=camera.rotation_euler
 scene.render.filepath=str(OUT/(name+'.png'));bpy.ops.render.render(write_still=True)
