import sys, json, time
sys.path.insert(0, "/home/claude/addons")
import bpy, blender_skp_io
from mathutils import Vector
src, out_blend, out_json = sys.argv[-3:]
t = time.time()
bpy.ops.wm.read_factory_settings(use_empty=True)
blender_skp_io.register()
bpy.ops.import_scene.skp(filepath=src)
print("import", round(time.time() - t, 1), "s")
rows = []
dg = bpy.context.evaluated_depsgraph_get()
for o in bpy.context.scene.objects:
    r = dict(name=o.name, type=o.type, parent=o.parent.name if o.parent else None,
             coll=[c.name for c in o.users_collection], inst=o.instance_collection.name if o.instance_type == 'COLLECTION' and o.instance_collection else None,
             hide=o.hide_get() or o.hide_viewport, polys=0, mats=[])
    if o.type == 'MESH':
        r['polys'] = len(o.data.polygons)
        r['mats'] = sorted({s.material.name for s in o.material_slots if s.material})
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        r['lo'] = [round(min(v[i] for v in bb), 3) for i in range(3)]
        r['hi'] = [round(max(v[i] for v in bb), 3) for i in range(3)]
    elif o.type == 'EMPTY':
        r['loc'] = [round(v, 3) for v in o.matrix_world.translation]
    rows.append(r)
json.dump(rows, open(out_json, 'w'), ensure_ascii=False)
print("objects", len(rows), "meshes", sum(r['type'] == 'MESH' for r in rows), "empties", sum(r['type'] == 'EMPTY' for r in rows),
      "inst", sum(1 for r in rows if r['inst']), "polys", sum(r['polys'] for r in rows))
print("collections", len(bpy.data.collections), [c.name for c in bpy.data.collections][:20])
bpy.ops.wm.save_as_mainfile(filepath=out_blend)
print("saved")
