"""Мальцево, гостиная + кухня 1/2 → GLB для веба.
venv-blender/bin/python scripts/liv_build.py liv/living.blend liv/split.json liv/living_raw.glb liv/meta.json"""
import sys, json, re, math
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix

blend, split_path, out_glb, out_meta = sys.argv[-4:]
bpy.ops.wm.open_mainfile(filepath=blend)
SCN = bpy.context.scene
VL = SCN.view_layers[0]
split = json.load(open(split_path))
A = set(split["A"]) - {"Clipping Box From SketchUp Selection"}
B = set(split["B"])
LEFT = set(split["L"])
DX = 22.5
CEIL_Z = 3.2
CEIL_ROOTS = re.compile(r"^(Группа#1|Группа#6|Группа#134|DL043-01-15W3K-RD-WB\.fbx(\.\d+)?)$")
BLINDS = re.compile(r"^Modular Window Blinds")
OBJ_TRIS = 7000      # потолок треугольников на один объект
ROOT_TRIS = 26000    # потолок на одну группу SketchUp (люстры из многих частей)
MIN_RATIO = 0.4      # декор не упрощаем сильнее, чем до 40 %
# гладкие тяжёлые предметы можно упростить сильнее без потери формы
HEAVY = {re.compile(r"^Zendi - Banqueta"): (9000, 0.15), re.compile(r"^Группа#(63|246)$"): (22000, 0.2), re.compile(r"^DL043"): (2500, 0.2)}
SHELF_OBJS = {"Группа#210", "Группа#211", "Группа#211.001", "Группа#214", "Группа#214.001", "Группа#214.002", "Группа#214.003"}

roots = [o for o in SCN.objects if o.parent is None]
def subtree(o):
    return [o] + list(o.children_recursive)

# 1. убрать правую копию (кроме кухни 2), рамку обрезки, камеры
kill = []
for r in roots:
    if r.type == 'CAMERA' or r.name.startswith("Clipping Box"):
        kill += subtree(r); continue
    if r.name in LEFT or r.name in B:
        continue
    if r.type in ('MESH', 'EMPTY'):
        kill += subtree(r)
for o in kill:
    bpy.data.objects.remove(o, do_unlink=True)
for r in [o for o in SCN.objects if o.parent is None and o.name in B]:
    r.matrix_world = Matrix.Translation((-DX, 0, 0)) @ r.matrix_world
bpy.context.view_layer.update()
DG = bpy.context.evaluated_depsgraph_get()

def group_of(r):
    if r.name in A: return "KITCHEN_A"
    if r.name == "Группа#248": return "KB_COLUMN"   # встроенная колонна с холодильниками (вариант 2)
    if r.name in B: return "KITCHEN_B"
    if r.name == "Группа#215": return "TV"           # телевизор: сдвигается от стены, когда включён рельеф
    if CEIL_ROOTS.match(r.name): return "CEIL"
    return "BASE"

def tris_of(me):
    return sum(len(p.vertices) - 2 for p in me.polygons)

def world_mesh(o, ratio=1.0):
    oe = o.evaluated_get(DG)
    me = bpy.data.meshes.new_from_object(oe, preserve_all_data_layers=True, depsgraph=DG)
    for i, s in enumerate(o.material_slots):
        if i < len(me.materials):
            me.materials[i] = s.material
    if ratio < 0.999 and len(me.polygons):
        tmp = bpy.data.objects.new("_dec", me)
        SCN.collection.objects.link(tmp)
        md = tmp.modifiers.new("d", "DECIMATE")
        md.ratio = ratio
        md.use_collapse_triangulate = True
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        me2 = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
        for i, mm in enumerate(me.materials):
            if i < len(me2.materials):
                me2.materials[i] = mm
        bpy.data.objects.remove(tmp)
        bpy.data.meshes.remove(me)
        me = me2
    M = oe.matrix_world.copy()
    me.transform(M)
    if M.to_3x3().determinant() < 0:
        bm = bmesh.new(); bm.from_mesh(me)
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
        bm.to_mesh(me); bm.free()
    return me

BLIND_MAT = bpy.data.materials.new("Blinds_Oak")
BLIND_MAT.use_nodes = True
_pr = next(n for n in BLIND_MAT.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
_pr.inputs["Base Color"].default_value = (0.62, 0.47, 0.33, 1)
_pr.inputs["Roughness"].default_value = 0.6

def blinds_mesh(mn, mx):
    """Лёгкие деревянные жалюзи вместо тяжёлой модели: ламели 25 мм через 25 мм."""
    z1 = min(mx.z, CEIL_Z) - 0.005; z0 = mn.z
    longx = (mx.x - mn.x) >= (mx.y - mn.y)
    bm = bmesh.new()
    parts = [(z1 - 0.05, z1, 0.035)]
    z = z1 - 0.07
    while z > z0 + 0.03:
        parts.append((z - 0.003, z, 0.0125)); z -= 0.03
    parts.append((z0, z0 + 0.03, 0.02))
    for za, zb, d in parts:
        r = bmesh.ops.create_cube(bm, size=1.0)
        for v in r["verts"]:
            if longx:
                v.co.x = mn.x if v.co.x < 0 else mx.x
                yc = (mn.y + mx.y) / 2; v.co.y = yc - d if v.co.y < 0 else yc + d
            else:
                v.co.y = mn.y if v.co.y < 0 else mx.y
                xc = (mn.x + mx.x) / 2; v.co.x = xc - d if v.co.x < 0 else xc + d
            v.co.z = za if v.co.z < 0 else zb
    me = bpy.data.meshes.new("blinds"); bm.to_mesh(me); bm.free()
    me.materials.append(BLIND_MAT)
    return me

def wbb(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs if o.type == 'MESH' for c in o.bound_box]
    return (Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))),
            Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts))))

meshes = {"BASE": [], "CEIL": [], "KITCHEN_A": [], "KITCHEN_B": [], "KB_COLUMN": [], "KC_FRIDGE": [], "SHELF": [], "TV": [], "RELIEF": []}
stats = {k: [0, 0] for k in meshes}
log = []
for r in [o for o in SCN.objects if o.parent is None]:
    g = group_of(r)
    objs = [o for o in subtree(r) if o.type == 'MESH' and len(o.data.polygons)]
    if not objs: continue
    if BLINDS.match(r.name):
        mn, mx = wbb(objs)
        meshes[g].append(blinds_mesh(mn, mx)); log.append(("blinds", r.name)); continue
    per = {o.name: tris_of(o.data) for o in objs}
    tot0 = sum(per.values())
    root_cap, min_ratio = ROOT_TRIS, MIN_RATIO
    for rx, (cap, mr) in HEAVY.items():
        if rx.match(r.name): root_cap, min_ratio = cap, mr
    ratios = {n: (max(min_ratio, OBJ_TRIS / t) if t > OBJ_TRIS else 1.0) for n, t in per.items()}
    tot1 = sum(per[n] * ratios[n] for n in per)
    if tot1 > root_cap:
        k = root_cap / tot1
        for n in per:
            if per[n] > 300:
                ratios[n] = max(min_ratio, ratios[n] * k)
    tot2 = 0
    for o in objs:
        me = world_mesh(o, ratios[o.name])
        tot2 += tris_of(me)
        meshes["SHELF" if (r.name == "Группа#225" and o.name in SHELF_OBJS) else g].append(me)
    stats[g][0] += tot0; stats[g][1] += tot2
    if tot2 < tot0 * 0.95:
        log.append(("decimated", r.name[:50], tot0, tot2))

# 1b. жалюзи и римские шторы на окна прихожей и кухни (как на утверждённых визуализациях Wabi-Sabi)
def solid_mat(name, rgb, rough, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    pr = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    pr.inputs["Base Color"].default_value = (*[(c / 255) ** 2.2 for c in rgb], 1)
    pr.inputs["Roughness"].default_value = rough; pr.inputs["Metallic"].default_value = metal
    return m
SLAT_MAT = solid_mat("Blinds_Walnut_Dark", (86, 62, 44), 0.55)
SHADE_MAT = solid_mat("Shade_Linen_Cream", (228, 219, 202), 0.95)

def add_box(bm, x0, x1, y0, y1, z0, z1):
    r = bmesh.ops.create_cube(bm, size=1.0)
    for v in r["verts"]:
        v.co.x = x0 if v.co.x < 0 else x1; v.co.y = y0 if v.co.y < 0 else y1; v.co.z = z0 if v.co.z < 0 else z1

def window_dressing(x0, x1, y_slats, y_shade, z_top, z_bottom, inward):
    """Жалюзи (ламели 25 мм через 30 мм) от низа римской шторы до z_bottom и римская штора в верхней части проёма.
    inward: +1 или -1 — куда смотрит комната по оси Y."""
    bm = bmesh.new()
    shade_h = 0.36
    add_box(bm, x0, x1, y_slats - 0.03, y_slats + 0.03, z_top - shade_h - 0.04, z_top - shade_h)   # карниз жалюзи
    z = z_top - shade_h - 0.06
    while z > z_bottom + 0.03:
        add_box(bm, x0 + 0.005, x1 - 0.005, y_slats - 0.0125, y_slats + 0.0125, z - 0.003, z); z -= 0.03
    add_box(bm, x0 + 0.005, x1 - 0.005, y_slats - 0.014, y_slats + 0.014, z_bottom, z_bottom + 0.022)    # нижняя планка
    me1 = bpy.data.meshes.new("blinds_win"); bm.to_mesh(me1); bm.free(); me1.materials.append(SLAT_MAT)
    # римская штора: три мягкие складки, развёртка профиля вдоль X
    bm = bmesh.new()
    prof = []
    folds, fh = 3, (shade_h - 0.04) / 3
    for i in range(folds):
        zt = z_top - 0.04 - i * fh
        for k in range(9):
            t = k / 8
            bulge = math.sin(math.pi * t) * 0.045
            prof.append((y_shade + inward * bulge, zt - t * fh))
    prof = [(y_shade, z_top)] + prof
    back = [(y_shade - inward * 0.006, zz) for (_, zz) in reversed(prof)]
    loop = prof + back
    vs0 = [bm.verts.new((x0, yy, zz)) for (yy, zz) in loop]
    vs1 = [bm.verts.new((x1, yy, zz)) for (yy, zz) in loop]
    n = len(loop)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((vs0[i], vs0[j], vs1[j], vs1[i]))
    bm.faces.new(vs0[::-1]); bm.faces.new(vs1)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    add_box(bm, x0 - 0.01, x1 + 0.01, y_shade - 0.025, y_shade + 0.025, z_top - 0.04, z_top)        # карниз шторы
    me2 = bpy.data.meshes.new("roman_shade"); bm.to_mesh(me2); bm.free(); me2.materials.append(SHADE_MAT)
    return [me1, me2]

# прихожая: окно в северной стене (стекло y 11.12–11.18), внутренняя грань стены y 10.89
meshes["BASE"] += window_dressing(18.625, 19.255, 11.05, 10.97, 2.985, 1.75, -1)
# кухня: окно в северной стене (стекло y 12.84–12.90), внутренняя грань стены y 12.39
meshes["BASE"] += window_dressing(6.925, 8.305, 12.77, 12.69, 3.125, 1.85, -1)

# 1c. вариант 3: отдельно стоящий двойной холодильник (side-by-side 912 × 1780 × 716 мм) вместо колонны
STEEL = solid_mat("Fridge_Steel", (196, 197, 195), 0.32, 0.75)
STEEL_DK = solid_mat("Fridge_Steel_Dark", (60, 61, 62), 0.35, 0.7)
BLACK = solid_mat("Fridge_Black", (22, 22, 22), 0.5)
def fridge_mesh(xb, yc):
    W, Hh, D = 0.912, 1.78, 0.716
    y0, y1 = yc - W / 2, yc + W / 2
    xf = xb + D            # передняя плоскость дверей
    parts = []
    bm = bmesh.new()
    add_box(bm, xb, xf - 0.05, y0, y1, 0.08, Hh)              # корпус
    add_box(bm, xf - 0.05, xf, y0, yc - 0.004 - 0.09, 0.10, Hh - 0.005)     # дверь морозилки (≈40 %)
    add_box(bm, xf - 0.05, xf, yc - 0.09 + 0.004, y1, 0.10, Hh - 0.005)     # дверь холодильника
    me = bpy.data.meshes.new("fridge_body"); bm.to_mesh(me); bm.free(); me.materials.append(STEEL); parts.append(me)
    bm = bmesh.new()
    add_box(bm, xb + 0.02, xf - 0.06, y0 + 0.01, y1 - 0.01, 0.0, 0.08)      # цоколь
    add_box(bm, xf - 0.052, xf - 0.05 + 0.001, y0 + 0.01, y1 - 0.01, 0.08, 0.10)   # щель
    add_box(bm, xf - 0.004, xf + 0.003, y0 + 0.1, y0 + 0.27, 1.02, 1.30)    # диспенсер воды и льда
    add_box(bm, xf - 0.004, xf + 0.002, y0 + 0.12, y0 + 0.25, 1.36, 1.42)   # дисплей
    me = bpy.data.meshes.new("fridge_black"); bm.to_mesh(me); bm.free(); me.materials.append(BLACK); parts.append(me)
    bm = bmesh.new()
    for yh in (yc - 0.09 - 0.045, yc - 0.09 + 0.045):        # вертикальные ручки у щели
        add_box(bm, xf + 0.035, xf + 0.055, yh - 0.011, yh + 0.011, 0.62, 1.52)
        for zz in (0.66, 1.48):
            add_box(bm, xf, xf + 0.035, yh - 0.007, yh + 0.007, zz - 0.012, zz + 0.012)
    add_box(bm, xb, xf - 0.05, y0 + 0.02, y1 - 0.02, Hh, Hh + 0.012)        # крышка петель
    me = bpy.data.meshes.new("fridge_handles"); bm.to_mesh(me); bm.free(); me.materials.append(STEEL_DK); parts.append(me)
    return parts
meshes["KC_FRIDGE"] += fridge_mesh(6.16, 8.962)

# 1d. рельефная стена за телевизором (ваби-саби): мягкие волны штукатурки, основа 10 мм + рельеф до 18 мм
def relief_mesh(xw, y0, y1, z0, z1, step=0.02, base=0.010, amp=0.018):
    rng = np.random.default_rng(27)
    lat = rng.random((64, 64))
    def vnoise(u, v):
        iu, iv = np.floor(u).astype(int), np.floor(v).astype(int)
        fu, fv = u - iu, v - iv
        fu, fv = fu * fu * (3 - 2 * fu), fv * fv * (3 - 2 * fv)
        g = lambda a, b: lat[a % 64, b % 64]
        return (g(iu, iv) * (1 - fu) + g(iu + 1, iv) * fu) * (1 - fv) + (g(iu, iv + 1) * (1 - fu) + g(iu + 1, iv + 1) * fu) * fv
    def fbm(u, v, oct=4):
        acc, a, f, n = 0, 0.5, 1.0, 0
        for _ in range(oct):
            acc += a * vnoise(u * f, v * f); n += a; a *= 0.5; f *= 2.03
        return acc / n
    ys = np.arange(y0, y1 + 1e-6, step); zs = np.arange(z0, z1 + 1e-6, step)
    S, T = np.meshgrid(ys - y0, zs - z0)            # строки — по высоте
    warp = 0.16 * (fbm(S * 0.7, T * 0.7) - 0.5) + 0.06 * (fbm(S * 1.9 + 5, T * 1.9 + 3) - 0.5)
    phase = (T + 0.22 * np.sin(S * 0.9 + 0.6) + 0.08 * np.sin(S * 2.3 + 1.9) + warp) / 0.17
    ridge = (0.5 + 0.5 * np.cos(2 * np.pi * phase)) ** 1.25
    amod = 0.65 + 0.35 * fbm(S * 0.6 + 11, T * 0.6 + 7)
    h = np.clip(amp * ridge * amod + 0.0015 * fbm(S * 9, T * 9), 0, amp)
    nz, ny = h.shape
    bm = bmesh.new()
    col = bm.loops.layers.color.new("Col")
    front = [[bm.verts.new((xw - base - h[i, j], ys[j], zs[i])) for j in range(ny)] for i in range(nz)]
    shade = 0.86 + 0.14 * (h / amp)                 # впадины чуть темнее
    for i in range(nz - 1):
        for j in range(ny - 1):
            f = bm.faces.new((front[i][j], front[i][j + 1], front[i + 1][j + 1], front[i + 1][j]))
            f.smooth = True
            for lp in f.loops:
                ii = i + (1 if lp.vert in (front[i + 1][j], front[i + 1][j + 1]) else 0)
                jj = j + (1 if lp.vert in (front[i][j + 1], front[i + 1][j + 1]) else 0)
                c = shade[ii, jj]; lp[col] = (c, c, c, 1.0)
    def edge(vs):
        back = [bm.verts.new((xw, v.co.y, v.co.z)) for v in vs]
        for k in range(len(vs) - 1):
            f = bm.faces.new((vs[k], back[k], back[k + 1], vs[k + 1]))
            for lp in f.loops: lp[col] = (0.86, 0.86, 0.86, 1.0)
    edge([front[0][j] for j in range(ny)]); edge([front[nz - 1][j] for j in range(ny)][::-1])
    edge([front[i][0] for i in range(nz)][::-1]); edge([front[i][ny - 1] for i in range(nz)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new("relief"); bm.to_mesh(me); bm.free()
    if me.color_attributes:
        me.color_attributes.active_color = me.color_attributes[0]; me.color_attributes.render_color_index = 0
    me.materials.append(solid_mat("Relief_Plaster", (214, 199, 178), 0.95))
    return me, float(base + amp)
_rel, RELIEF_DEPTH = relief_mesh(13.365, 3.637, 7.632, 0.44, 3.19)
meshes["RELIEF"].append(_rel)

# 2. центр квартиры → начало координат (по общей части)
allv = np.concatenate([np.array([v.co[:] for v in me.vertices]) for me in meshes["BASE"] if len(me.vertices)])
lo, hi = allv.min(0), allv.max(0)
cx, cy = float((lo[0] + hi[0]) / 2), float((lo[1] + hi[1]) / 2)
T = Matrix.Translation((-cx, -cy, 0))
for g in meshes:
    for me in meshes[g]:
        me.transform(T)

# 3. объединить по группам
for o in list(SCN.objects):
    bpy.data.objects.remove(o, do_unlink=True)
coll = SCN.collection
out_objs = []
for g, lst in meshes.items():
    if not lst: continue
    objs = []
    for i, me in enumerate(lst):
        o = bpy.data.objects.new(f"{g}_{i}", me); coll.objects.link(o); objs.append(o)
    if len(objs) > 1:
        with bpy.context.temp_override(active_object=objs[0], selected_editable_objects=objs, selected_objects=objs, object=objs[0]):
            bpy.ops.object.join()
    o = objs[0]; o.name = g; o.data.name = g
    out_objs.append(o)

# 4. материалы: шероховатость/металл по имени (импорт ставит 1.0 всем)
METAL = re.compile(r"(Brass|Gold|Steel|Iron|Zinc|Metal|Aluminum|Chrome|doré|image8|Screw|Galvan|Silver|Bronze|Cylinder|White Gold|Металл)", re.I)
GLOSS = re.compile(r"(Gloss|ceramic|Bosch|Mirror|зеркало|_23|Glass|стекло|1-4)", re.I)
for m in bpy.data.materials:
    if not m.use_nodes: continue
    pr = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not pr: continue
    nm = m.name
    if METAL.search(nm) and not re.search(r"Black|Graphite|Piping", nm):
        pr.inputs["Metallic"].default_value = 0.85; pr.inputs["Roughness"].default_value = 0.38
    elif re.search(r"Black|Graphite|Antracyt|Iron Blurry", nm):
        pr.inputs["Metallic"].default_value = 0.3; pr.inputs["Roughness"].default_value = 0.5
    elif GLOSS.search(nm):
        pr.inputs["Roughness"].default_value = 0.2
    else:
        pr.inputs["Roughness"].default_value = 0.82
    a = pr.inputs["Alpha"].default_value
    if a < 0.999:
        try: m.surface_render_method = "BLENDED"
        except Exception: pass
    if re.search(r"emit|Light spot|LED|Bulb", nm):
        c = pr.inputs["Base Color"].default_value
        pr.inputs["Emission Color"].default_value = (1.0, 0.93, 0.82, 1)
        pr.inputs["Emission Strength"].default_value = 1.0

for o in SCN.objects:
    if o.type == 'MESH' and o.name != 'RELIEF':
        for a in list(o.data.color_attributes): o.data.color_attributes.remove(a)
bpy.ops.export_scene.gltf(filepath=out_glb, export_format="GLB", use_selection=False, export_apply=True, export_yup=True, export_vertex_color="ACTIVE",
                          export_texcoords=True, export_normals=True, export_materials="EXPORT", export_cameras=False,
                          export_lights=False, export_image_format="AUTO")
meta = {"center_skp_m": [cx, cy], "bbox": [[float(lo[0] - cx), float(lo[1] - cy), float(lo[2])], [float(hi[0] - cx), float(hi[1] - cy), float(hi[2])]],
        "tris": {g: [stats[g][0], stats[g][1]] for g in stats}, "log": log}
json.dump(meta, open(out_meta, "w"), ensure_ascii=False, indent=1)
print("DONE", json.dumps(meta["tris"]), "center", cx, cy)
