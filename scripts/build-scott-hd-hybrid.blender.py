import bpy, bmesh, json, math, struct, numpy as np
from pathlib import Path
from mathutils import Vector, Quaternion
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/scott-hd-hybrid-v1'
REF=json.loads((OUT/'receiver-reference.json').read_text())
bone={b['name']:Vector(b['position']) for b in REF['bones']}
joint={name:i for i,name in enumerate(REF['jointNames'])}
source_points=[Vector(p) for p in REF['positions']]
source_faces=[REF['indices'][i:i+3] for i in range(0,len(REF['indices']),3)]
bvh=BVHTree.FromPolygons(source_points,source_faces,all_triangles=True)
report={'alignment':{},'parts':[],'repairs':{},'weights':{}}

def smooth(a,b,x):
 t=max(0,min(1,(x-a)/(b-a)));return t*t*(3-2*t)
def gltf(v):return Vector((v.x,v.z,-v.y))
def blender(v):return Vector((v.x,-v.z,v.y))
def segment_distance(p,a,b):
 d=b-a;t=max(0,min(1,(p-a).dot(d)/d.length_squared));return (p-a-d*t).length
def arm_anchors(side):
 sign=1 if side=='Left' else -1
 return [Vector((sign*.54,.13,-.02)),Vector((sign*.695,-.37,0)),Vector((sign*.84,-.84,.01))]
def arm_map(p,side):
 s,e,w=arm_anchors(side);ts,te,tw=[bone['mixamorig'+side+n] for n in ['Arm','ForeArm','Hand']]
 def local(a,b,ta,tb,cross):
  axis=(b-a).normalized();along=(p-a).dot(axis);radial=p-a-axis*along
  return ta+(tb-ta)*(along/(b-a).length)+axis.rotation_difference((tb-ta).normalized())@radial*cross
 upper=local(s,e,ts,te,.40);lower=local(e,w,te,tw,.40)
 return upper.lerp(lower,1-smooth(-.46,-.28,p.y))
def aligned(p,part):
 body=Vector((p.x*.40+.00394,p.y*.40+1.32,p.z*.32-.018))
 if part.endswith('_arm'):return arm_map(p,'Left' if 'Left' in part else 'Right')
 head=Vector((.00394,1.545,-.005))+(p-Vector((0,.49,.04)))*.48
 if part in ['HD_face','HD_helmet','HD_helmet_left_repair']:return head
 head_weight=smooth(.10,.19,p.y)*(1-smooth(.42,.46,abs(p.x)))
 return body.lerp(head,head_weight)
def label(p):
 if p.y>.19 and abs(p.x)<.43:
  return 'HD_face' if p.z>.20 and abs(p.x)<.205 and p.y<.585 else 'HD_helmet'
 side='Left' if p.x>=0 else 'Right'
 return 'HD_'+side+'_arm' if abs(p.x)>.50 else 'HD_torso_neck'

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'assets/01-SCOTT/scott-hd-cabeza-torso-hombros-brazos.glb'))
donor=next(o for o in bpy.context.scene.objects if o.type=='MESH')
mesh=donor.data;mesh.calc_loop_triangles()
points=[gltf(donor.matrix_world@v.co) for v in mesh.vertices]
uv_layer=mesh.uv_layers.active.data
image=next(n.image for n in donor.data.materials[0].node_tree.nodes if n.type=='TEX_IMAGE' and 'base' in n.label.lower()) if any(n.type=='TEX_IMAGE' and 'base' in n.label.lower() for n in donor.data.materials[0].node_tree.nodes) else None
if image is None:
 bsdf=next(n for n in donor.data.materials[0].node_tree.nodes if n.type=='BSDF_PRINCIPLED')
 image=bsdf.inputs['Base Color'].links[0].from_node.image
pixels=np.empty(len(image.pixels),dtype=np.float32);image.pixels.foreach_get(pixels);pixels=pixels.reshape(image.size[1],image.size[0],4)
def color(uv):return pixels[min(image.size[1]-1,max(0,int(uv[1]*image.size[1]))),min(image.size[0]-1,max(0,int(uv[0]*image.size[0]))),:3]
def armor_color(c):return min(c)>.18 and max(c)-min(c)<.28 and c[1]>=c[0]*.88

parts={name:[] for name in ['HD_face','HD_helmet','HD_torso_neck','HD_Left_arm','HD_Right_arm','HD_helmet_left_repair']}
repair_bounds=[Vector((math.inf,math.inf,math.inf)),Vector((-math.inf,-math.inf,-math.inf))]
for tri in mesh.loop_triangles:
 ids=list(tri.vertices);ps=[points[i] for i in ids];center=sum(ps,Vector())/3
 # The cut waist/belt and flat wrist caps are not part of the transplant.
 if center.y<-.685 and abs(center.x)<.52:continue
 if center.y<-.755 and abs(center.x)>.55:continue
 uvs=[tuple(uv_layer[i].uv) for i in tri.loops]
 name=label(center);parts[name].append((ids,uvs,False))
 # Anatomical RIGHT is -X when Scott faces +Z. Only this white outer
 # ear/helmet plate is copied; the face, blue shell and opposite jaw stay.
 if name=='HD_helmet' and -.22<center.x<-.035 and .15<center.y<.30 and .30<center.z<.54 and armor_color(color(sum((Vector(uv) for uv in uvs),Vector((0,0)))/3)):
  parts['HD_helmet_left_repair'].append((ids[::-1],uvs[::-1],True))
  for p in ps:
   for a in range(3):repair_bounds[0][a]=min(repair_bounds[0][a],p[a]);repair_bounds[1][a]=max(repair_bounds[1][a],p[a])
report['repairs']['helmet']={'donorSide':'anatomical right (-X)','sourceBounds':[list(p) for p in repair_bounds],'sourceTriangles':len(parts['HD_helmet_left_repair']),'wholeHelmetMirrored':False}
report['alignment']={'donorWaist':[0,-.75,0],'donorNeck':[0,.17,0],'donorHeadCenter':[0,.49,.04],'headUniformScale':.48,'targetHeadCenter':[.00394,1.545,-.005],
 'bodyScale':[.40,.40,.32],'bodyOffset':[.00394,1.32,-.018],'armAnchors':{s:{'donor':[list(p) for p in arm_anchors(s)],'receiver':[list(bone['mixamorig'+s+n]) for n in ['Arm','ForeArm','Hand']]} for s in ['Left','Right']}}
targets={'HD_face':None,'HD_helmet':50000,'HD_torso_neck':42000,'HD_Left_arm':22000,'HD_Right_arm':22000,'HD_helmet_left_repair':5000}
objects=[]
for name,faces in parts.items():
 if not faces:continue
 lookup={};verts=[];polys=[];face_uvs=[]
 for ids,uvs,mirror in faces:
  mapped=[]
  for i in ids:
   key=(i,mirror)
   if key not in lookup:
    p=points[i].copy()
    if mirror:p.x=-p.x+.002
    lookup[key]=len(verts);verts.append(blender(aligned(p,name)))
   mapped.append(lookup[key])
  polys.append(mapped);face_uvs.append(uvs)
 data=bpy.data.meshes.new(name);data.from_pydata(verts,[],polys);data.update()
 uv=data.uv_layers.new(name='UVMap')
 for poly,uvs in zip(data.polygons,face_uvs):
  for i,coord in zip(poly.loop_indices,uvs):uv.data[i].uv=coord
 obj=bpy.data.objects.new(name,data);bpy.context.scene.collection.objects.link(obj);obj.data.materials.append(donor.data.materials[0]);objects.append(obj)
 bpy.context.view_layer.objects.active=obj;obj.select_set(True)
 bm=bmesh.new();bm.from_mesh(data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
 extended=0
 if name.endswith('_arm'):
  side='Left' if 'Left' in name else 'Right';elbow,wrist=[bone['mixamorig'+side+n] for n in ['ForeArm','Hand']];axis=(wrist-elbow).normalized();length=(wrist-elbow).length
  edges=[e for e in bm.edges if e.is_boundary and all((gltf(v.co)-elbow).dot(axis)/length>.78 for v in e.verts)]
  if edges:
   result=bmesh.ops.extrude_edge_only(bm,edges=edges)
   new=[v for v in result['geom'] if isinstance(v,bmesh.types.BMVert)]
   for v in new:
    p=gltf(v.co);along=(p-elbow).dot(axis);radial=p-elbow-axis*along;v.co=blender(elbow+axis*length*1.025+radial*.96)
   extended=len(new)
  report['repairs'][side+'Wrist']={'extendedVertices':extended,'originalDistalForearmSupport':True,'newDesign':False}
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
 before=sum(len(p.vertices)-2 for p in data.polygons)
 if targets[name] and before>targets[name]:
  modifier=obj.modifiers.new('Preserve silhouette / HD V1','DECIMATE');modifier.ratio=targets[name]/before;modifier.use_collapse_triangulate=True
  bpy.ops.object.modifier_apply(modifier=modifier.name)
 for poly in obj.data.polygons:poly.use_smooth=True
 obj.select_set(False)
 report['parts'].append({'name':name,'sourceTriangles':len(faces),'beforeOptimization':before,'triangles':sum(len(p.vertices)-2 for p in obj.data.polygons),'vertices':len(obj.data.vertices)})
 print('HYBRID_PART',report['parts'][-1],flush=True)

donor.hide_render=True;donor.hide_viewport=True
# Export geometry with UVs, normals and original material. Node packing below
# reuses the donor's original JPEG bytes and receiver's untouched rig/animations.
for obj in bpy.context.selected_objects:obj.select_set(False)
for obj in objects:obj.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
bpy.ops.export_scene.gltf(filepath=str(OUT/'aligned-parts.glb'),export_format='GLB',use_selection=True,export_animations=False,export_yup=True,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_image_format='AUTO')
(OUT/'geometry-report.json').write_text(json.dumps(report,indent=2)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'scott-hd-aligned.blend'))
print('HD_GEOMETRY_READY',flush=True)
