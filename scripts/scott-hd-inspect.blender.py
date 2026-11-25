import bpy, json, math
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/scott-hd-hybrid-v1'
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/01-SCOTT/scott-hd-cabeza-torso-hombros-brazos.glb'))
objects=[o for o in bpy.context.scene.objects if o.type=='MESH']
obj=objects[0]
report={'objects':[{'name':o.name,'dimensions':list(o.dimensions),'vertices':len(o.data.vertices),'faces':len(o.data.polygons)} for o in objects]}
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=12
scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Inspection world');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.35,.35,.35,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.6
scene.view_settings.view_transform='Standard'
for position,power,size in [((3,-4,5),700,4),((-3,-2,2),450,3),((0,3,5),850,3)]:
 data=bpy.data.lights.new('Softbox','AREA');data.energy=power;data.shape='DISK';data.size=size
 light=bpy.data.objects.new('Softbox',data);scene.collection.objects.link(light);light.location=position;light.rotation_euler=(-light.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('Inspect');camera=bpy.data.objects.new('Inspect',data);scene.collection.objects.link(camera);scene.camera=camera;data.type='ORTHO';data.ortho_scale=2.2
for name,location in [('front',(0,-4,0)),('back',(0,4,0)),('right',(-4,0,0))]:
 camera.location=location;camera.rotation_euler=(-camera.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(OUT/('donor-'+name+'.png'));bpy.ops.render.render(write_still=True)
(OUT/'blender-inspection.json').write_text(json.dumps(report,indent=2)+'\n')
