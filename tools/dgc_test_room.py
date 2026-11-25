"""Procedural test interior for comparing DGC render presets (no external textures).
Room 5 x 4 x 2.8 m, one large window in the right wall, sun + sky, wabi-sabi palette,
a sofa, travertine table, glass vase, pendant lamp (2700 K) and an LED ceiling cove.
build(scene, with_portal=True, glass="thin") returns the camera object."""
import bpy, math


def _mat(name, base, rough=0.6, sheen=0.0, transmission=0.0, ior=1.45, metal=0.0, bump=0.0, noise_scale=40.0, tint_var=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*base, 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    p.inputs["IOR"].default_value = ior
    p.inputs["Transmission Weight"].default_value = transmission
    if sheen:
        p.inputs["Sheen Weight"].default_value = sheen
    if bump or tint_var:
        tc = nt.nodes.new("ShaderNodeTexCoord")
        nz = nt.nodes.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = noise_scale
        nz.inputs["Detail"].default_value = 8
        nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
        if bump:
            b = nt.nodes.new("ShaderNodeBump")
            b.inputs["Strength"].default_value = bump
            b.inputs["Distance"].default_value = 0.002
            nt.links.new(nz.outputs["Fac"], b.inputs["Height"])
            nt.links.new(b.outputs["Normal"], p.inputs["Normal"])
        if tint_var:
            mr = nt.nodes.new("ShaderNodeMapRange")
            mr.inputs["To Min"].default_value = 1 - tint_var
            mr.inputs["To Max"].default_value = 1 + tint_var
            nt.links.new(nz.outputs["Fac"], mr.inputs["Value"])
            mx = nt.nodes.new("ShaderNodeMix")
            mx.data_type = "RGBA"
            mx.blend_type = "MULTIPLY"
            mx.inputs["Factor"].default_value = 1.0
            mx.inputs["A"].default_value = (*base, 1)
            nt.links.new(mr.outputs["Result"], mx.inputs["B"])
            nt.links.new(mx.outputs["Result"], p.inputs["Base Color"])
    return m


def _wood(name="oak_floor"):
    """Oak planks 180 mm wide with per-plank tone variation and grain."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    br = nt.nodes.new("ShaderNodeTexBrick")
    br.offset = 0.5
    br.inputs["Scale"].default_value = 1.0
    br.inputs["Brick Width"].default_value = 1.6
    br.inputs["Row Height"].default_value = 0.18
    br.inputs["Mortar Size"].default_value = 0.002
    br.inputs["Color1"].default_value = (0.42, 0.29, 0.18, 1)
    br.inputs["Color2"].default_value = (0.33, 0.22, 0.13, 1)
    br.inputs["Mortar"].default_value = (0.12, 0.08, 0.05, 1)
    nt.links.new(tc.outputs["Object"], br.inputs["Vector"])
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (2.0, 40.0, 1.0)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 6.0
    nz.inputs["Detail"].default_value = 10
    nt.links.new(mp.outputs["Vector"], nz.inputs["Vector"])
    mx = nt.nodes.new("ShaderNodeMix")
    mx.data_type = "RGBA"; mx.blend_type = "OVERLAY"
    mx.inputs["Factor"].default_value = 0.35
    nt.links.new(br.outputs["Color"], mx.inputs["A"])
    nt.links.new(nz.outputs["Fac"], mx.inputs["B"])
    nt.links.new(mx.outputs["Result"], p.inputs["Base Color"])
    rr = nt.nodes.new("ShaderNodeMapRange")
    rr.inputs["To Min"].default_value = 0.32
    rr.inputs["To Max"].default_value = 0.48
    nt.links.new(nz.outputs["Fac"], rr.inputs["Value"])
    nt.links.new(rr.outputs["Result"], p.inputs["Roughness"])
    return m


def _box(name, size, loc, mat, bevel=0.0, sub=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        m = o.modifiers.new("bevel", "BEVEL")
        m.width = bevel
        m.segments = 4
        m.limit_method = "ANGLE"
    if sub:
        m = o.modifiers.new("sub", "SUBSURF")
        m.levels = sub
        m.render_levels = sub
    o.data.materials.append(mat)
    return o


def _emission(name, strength, kelvin):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type == "BSDF_PRINCIPLED":
            nt.nodes.remove(n)
    out = nt.nodes["Material Output"]
    em = nt.nodes.new("ShaderNodeEmission")
    bb = nt.nodes.new("ShaderNodeBlackbody")
    bb.inputs["Temperature"].default_value = kelvin
    nt.links.new(bb.outputs["Color"], em.inputs["Color"])
    em.inputs["Strength"].default_value = strength
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return m


def _thin_glass():
    """Window glass as pros set it up in Cycles: real glass only for camera and reflection rays,
    fully transparent for shadow / diffuse / transmission rays, so sky and sun enter the room
    without noise even with refractive caustics off."""
    m = bpy.data.materials.new("window_glass")
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type == "BSDF_PRINCIPLED":
            nt.nodes.remove(n)
    out = nt.nodes["Material Output"]
    g = nt.nodes.new("ShaderNodeBsdfGlass")
    g.inputs["IOR"].default_value = 1.5
    g.inputs["Roughness"].default_value = 0.0
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    lp = nt.nodes.new("ShaderNodeLightPath")
    mx_ = nt.nodes.new("ShaderNodeMath"); mx_.operation = "MAXIMUM"
    nt.links.new(lp.outputs["Is Camera Ray"], mx_.inputs[0])
    nt.links.new(lp.outputs["Is Glossy Ray"], mx_.inputs[1])
    mx = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(mx_.outputs[0], mx.inputs[0])      # 1 -> glass, 0 -> transparent
    nt.links.new(tr.outputs[0], mx.inputs[1])
    nt.links.new(g.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs["Surface"])
    return m


def build(scene, with_portal=True, glass="thin", sun_elev=28.0, sun_rot=90.0, led=True):
    for o in list(scene.collection.objects):
        bpy.data.objects.remove(o, do_unlink=True)

    W, D, H, T = 5.0, 4.0, 2.8, 0.2
    plaster = _mat("limewash", (0.70, 0.64, 0.56), rough=0.92, bump=0.15, noise_scale=6.0, tint_var=0.06)
    ceiling = _mat("ceiling", (0.74, 0.70, 0.64), rough=0.95, bump=0.05, noise_scale=8.0)
    floor = _wood()
    boucle = _mat("boucle", (0.62, 0.57, 0.50), rough=0.95, sheen=0.6, bump=0.6, noise_scale=180.0)
    trav = _mat("travertine", (0.62, 0.55, 0.45), rough=0.55, bump=0.25, noise_scale=25.0, tint_var=0.08)
    brass = _mat("brass", (0.78, 0.60, 0.35), rough=0.3, metal=1.0)
    clay = _mat("clay", (0.45, 0.33, 0.25), rough=0.8, bump=0.3, noise_scale=60.0)
    vase_glass = _mat("vase_glass", (0.9, 0.92, 0.9), rough=0.05, transmission=1.0, ior=1.5)
    frame = _mat("window_frame", (0.20, 0.18, 0.16), rough=0.5)
    ground = _mat("ground", (0.25, 0.27, 0.18), rough=0.9)

    # shell: floor, ceiling, walls (window in +X wall)
    _box("floor", (W, D, 0.02), (W / 2, D / 2, -0.01), floor)
    _box("ceiling", (W, D, 0.02), (W / 2, D / 2, H + 0.01), ceiling)
    _box("wall_back", (W + 2 * T, T, H), (W / 2, D + T / 2, H / 2), plaster)
    _box("wall_front", (W + 2 * T, T, H), (W / 2, -T / 2, H / 2), plaster)
    _box("wall_left", (T, D, H), (-T / 2, D / 2, H / 2), plaster)
    win_w, win_h, sill = 2.2, 1.9, 0.55
    wy0, wy1 = D / 2 - win_w / 2, D / 2 + win_w / 2
    x = W + T / 2
    _box("wall_r_a", (T, wy0, H), (x, wy0 / 2, H / 2), plaster)
    _box("wall_r_b", (T, D - wy1, H), (x, (wy1 + D) / 2, H / 2), plaster)
    _box("wall_r_sill", (T, win_w, sill), (x, D / 2, sill / 2), plaster)
    _box("wall_r_head", (T, win_w, H - sill - win_h), (x, D / 2, (H + sill + win_h) / 2), plaster)
    # frame + glass
    _box("frame_mullion", (0.06, 0.05, win_h), (W + 0.05, D / 2, sill + win_h / 2), frame)
    if glass:
        g = _box("glass", (0.008, win_w, win_h), (W + 0.06, D / 2, sill + win_h / 2),
                 _thin_glass() if glass == "thin" else vase_glass)
    _box("ground", (60, 60, 0.02), (W + 30, D / 2, -0.3), ground)

    # furniture
    _box("sofa_base", (2.2, 0.9, 0.42), (2.0, D - 0.5, 0.21), boucle, bevel=0.04)
    _box("sofa_back", (2.2, 0.22, 0.45), (2.0, D - 0.12, 0.64), boucle, bevel=0.06)
    cu = _box("cushion", (0.45, 0.18, 0.42), (1.3, D - 0.32, 0.62), boucle, bevel=0.08, sub=2)
    cu.rotation_euler = (math.radians(-12), 0, math.radians(6))
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=0.55, depth=0.38, location=(2.1, 2.2, 0.19))
    t = bpy.context.active_object; t.name = "table_travertine"; t.data.materials.append(trav)
    b = t.modifiers.new("bevel", "BEVEL"); b.width = 0.015; b.segments = 3
    bpy.ops.object.shade_smooth()
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=0.11, location=(2.0, 2.05, 0.49))
    v = bpy.context.active_object; v.name = "vase_clay"; v.scale = (1, 1, 1.4); v.data.materials.append(clay)
    bpy.ops.object.shade_smooth()
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=0.07, depth=0.3, location=(2.3, 2.4, 0.53))
    gv = bpy.context.active_object; gv.name = "vase_glass"; gv.data.materials.append(vase_glass)
    bpy.ops.object.shade_smooth()
    # pendant: brass shade + warm bulb
    bpy.ops.mesh.primitive_cone_add(vertices=64, radius1=0.22, radius2=0.03, depth=0.2, location=(2.1, 2.2, 1.95))
    sh = bpy.context.active_object; sh.name = "pendant"; sh.data.materials.append(brass)
    bpy.ops.object.shade_smooth()
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.04, location=(2.1, 2.2, 1.86))
    bulb = bpy.context.active_object; bulb.name = "bulb"; bulb.data.materials.append(_emission("bulb", 60.0, 2700))
    leds = []
    if led:
        _box("cove", (0.12, D - 0.4, 0.12), (0.06, D / 2, H - 0.06), ceiling)
        leds.append(_box("led_strip", (0.01, D - 0.5, 0.02), (0.125, D / 2, H - 0.11), _emission("led", 4.0, 3000)))

    # world: sky with sun (physically scaled); exposure set by camera EV below
    w = scene.world or bpy.data.worlds.new("World")
    scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    sky = nt.nodes.new("ShaderNodeTexSky")
    sky.sky_type = "MULTIPLE_SCATTERING"
    sky.sun_elevation = math.radians(sun_elev)
    sky.sun_rotation = math.radians(sun_rot)
    sky.sun_size = math.radians(0.545)
    bg = nt.nodes.new("ShaderNodeBackground")
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(sky.outputs[0], bg.inputs[0])
    nt.links.new(bg.outputs[0], out.inputs[0])

    if with_portal:
        d = bpy.data.lights.new("window_portal", "AREA")
        d.shape = "RECTANGLE"; d.size = win_w; d.size_y = win_h
        d.cycles.is_portal = True
        po = bpy.data.objects.new("window_portal", d)
        po.location = (W + 0.12, D / 2, sill + win_h / 2)
        po.rotation_euler = (0, math.radians(-90), 0)   # emit toward -X (into the room)
        scene.collection.objects.link(po)

    # camera: 30 mm, eye level 1.45 m, level horizon, looking toward back wall (+Y), window on the right
    cd = bpy.data.cameras.new("cam")
    cd.lens = 30.0
    cd.sensor_width = 36.0
    cam = bpy.data.objects.new("cam", cd)
    cam.location = (0.4, 0.35, 1.45)
    cam.rotation_euler = (math.radians(90), 0, math.radians(-50))
    cd.shift_y = -0.06
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.resolution_x = 800
    scene.render.resolution_y = 1000
    return cam
