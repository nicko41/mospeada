"""Static landmark derivative; never writes the supplied Horizon-T source.
After export, run: node scripts/optimize-horizon-t-textures.mjs
"""
import bpy,json,hashlib
from pathlib import Path
from mathutils import Vector

root=Path(__file__).resolve().parents[1]
source=root/'assets/LEVEL01/Horizon-T-Class-Transport-Carrier.glb'
output=root/'public/models/mospeada/horizon-t-desert-landmark.glb'
artifacts=root/'artifacts/horizon-t';artifacts.mkdir(parents=True,exist_ok=True)
source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(source))
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
assert len(meshes)==1
mesh=meshes[0];original_triangles=len(mesh.data.polygons)
mesh.name='HorizonT_LOD0'
bpy.context.view_layer.objects.active=mesh;mesh.select_set(True)
modifier=mesh.modifiers.new('Static scenery simplification','DECIMATE');modifier.ratio=70000/original_triangles;modifier.use_collapse_triangulate=True
bpy.ops.object.modifier_apply(modifier=modifier.name)
far=mesh.copy();far.data=mesh.data.copy();far.name='HorizonT_LOD1';bpy.context.collection.objects.link(far)
bpy.context.view_layer.objects.active=far
modifier=far.modifiers.new('Distant silhouette','DECIMATE');modifier.ratio=15000/len(far.data.polygons);modifier.use_collapse_triangulate=True
bpy.ops.object.modifier_apply(modifier=modifier.name)
for image in bpy.data.images:
 if image.size[0]>2048 or image.size[1]>2048:
  scale=2048/max(image.size);image.scale(round(image.size[0]*scale),round(image.size[1]*scale))
bpy.ops.object.select_all(action='DESELECT');mesh.select_set(True);far.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_animations=False,export_image_format='JPEG',export_jpeg_quality=86)
assert hashlib.sha256(source.read_bytes()).hexdigest()==source_hash
report={'source':str(source),'sourceSha256':source_hash,'sourceTriangles':original_triangles,'nearTriangles':len(mesh.data.polygons),'farTriangles':len(far.data.polygons),'outputBytes':output.stat().st_size,'textureMaxSize':2048,'animations':False}
(artifacts/'asset-validation.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
far.hide_render=True
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=12;scene.cycles.use_denoising=True;scene.render.resolution_x=1000;scene.render.resolution_y=750;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Carrier inspection');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.2,.24,.28,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7
focus=Vector((0,0,0))
for position,power in [((3,-4,6),800),((-4,0,3),500),((0,4,3),600)]:
 light=bpy.data.objects.new('Softbox',bpy.data.lights.new('Softbox','AREA'));scene.collection.objects.link(light);light.location=position;light.data.energy=power;light.data.size=4;light.rotation_euler=(focus-light.location).to_track_quat('-Z','Y').to_euler()
camera=bpy.data.objects.new('Camera',bpy.data.cameras.new('Camera'));scene.collection.objects.link(camera);camera.location=(2.7,-3.5,2.1);camera.rotation_euler=(focus-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=2.85;scene.camera=camera
scene.render.filepath=str(artifacts/'model-preview.png');bpy.ops.render.render(write_still=True)
