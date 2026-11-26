import sys
sys.path.insert(0, "/home/claude/addons/blender_skp_io")
import numpy as np, skppy
from skppy.data_structure.primitives import Transform
IN = 0.0254
m = skppy.load(sys.argv[1])
defs = {d.id: d for d in m.definitions}
layers = {l.id: l.name for l in m.layers}

def bbox(ents, M, acc, depth=0):
    if depth > 14: return
    vs = ents.vertices
    if vs:
        P = np.array([[v.position.x, v.position.y, v.position.z, 1.0] for v in vs]) @ M.T
        acc.append((P[:, :3].min(0), P[:, :3].max(0)))
    for inst in list(ents.component_instances) + list(ents.groups):
        d = defs.get(inst.definition_id)
        if d is None: continue
        bbox(d.entities, M @ Transform(inst.transform)._matrix, acc, depth + 1)

def count_faces(ents, depth=0):
    n = len(ents.faces)
    if depth > 14: return n
    for inst in list(ents.component_instances) + list(ents.groups):
        d = defs.get(inst.definition_id)
        if d is not None: n += count_faces(d.entities, depth + 1)
    return n

rows = []
for kind, lst in (("G", m.entities.groups), ("C", m.entities.component_instances)):
    for inst in lst:
        d = defs.get(inst.definition_id)
        if d is None: continue
        M = Transform(inst.transform)._matrix
        acc = []
        bbox(d.entities, M, acc)
        if not acc: continue
        lo = np.min([a[0] for a in acc], 0) * IN; hi = np.max([a[1] for a in acc], 0) * IN
        nm = getattr(inst, "name", "") or ""
        hid = getattr(inst, "hidden", None)
        rows.append((kind, nm, d.name, layers.get(getattr(inst, "layer_id", None), "?"), lo.round(2), hi.round(2), count_faces(d.entities), hid))
rows.sort(key=lambda r: (r[4][0], r[4][1]))
for r in rows:
    print(r[0], repr(r[1])[:40], "|", r[2][:40], "|", r[3], "| x", r[4][0], r[5][0], "y", r[4][1], r[5][1], "z", r[4][2], r[5][2], "| faces", r[6], "| hidden", r[7])
