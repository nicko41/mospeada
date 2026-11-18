import bpy
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root / 'assets/scott-bernard-gear-hybrid.glb'))
meshes = [obj for obj in bpy.data.objects if obj.type == 'MESH' and obj.find_armature()]
armatures = [obj for obj in bpy.data.objects if obj.type == 'ARMATURE']
assert len(armatures) == 1
assert len(armatures[0].data.bones) == 24
triangle_count = sum(len(obj.data.polygons) for obj in meshes)
rigid = [obj for obj in meshes if obj.get('rigidArmor')]
assert len(rigid) == 17
for obj in rigid:
    for vertex in obj.data.vertices:
        nonzero = [group for group in vertex.groups if group.weight > 0]
        assert len(nonzero) == 1 and abs(nonzero[0].weight - 1) < 1e-6
names = [action.name for action in bpy.data.actions]
assert any('Running' in name for name in names)
assert any('Walking' in name for name in names)
report = {'imported': True, 'meshes': len(meshes), 'rigidRegions': len(rigid),
          'bones': len(armatures[0].data.bones), 'trianglesImportedByBlender': triangle_count,
          'actions': names, 'singleJointWeightsVerified': True}
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root / 'assets/scott-bernard-gear.glb'))
source_count = sum(len(obj.data.polygons) for obj in bpy.data.objects if obj.type == 'MESH' and obj.find_armature())
print('SOURCE_AND_HYBRID_TRIANGLES', source_count, triangle_count)
assert triangle_count == source_count
assert source_count == 10334
report['originalTrianglesImportedByBlender'] = source_count
(root / 'artifacts/rig-hybrid/blender-validation.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print('HYBRID_VALIDATION', json.dumps(report))
