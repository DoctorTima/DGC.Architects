"""DGC Cycles presets: draft / final render settings for interiors and exteriors.

Usage inside Blender (Text Editor or MCP):
    import importlib.util, bpy
    spec = importlib.util.spec_from_file_location("dgc", r"C:/Users/ПК/Documents/DGC_Render/dgc_cycles_presets.py")
    dgc = importlib.util.module_from_spec(spec); spec.loader.exec_module(dgc)
    dgc.apply(bpy.context.scene, "final_gpu")

Presets (reasoning and test results: claude/render_settings_pro.md in the DGC.Architects project):
    draft_cloud  - Claude cloud CPU draft
    draft_gpu    - quick check on an RTX card (Timofey's PC / rented GPU)
    final_gpu    - client final on an RTX card
    final_cpu    - client final on a CPU farm / cloud CPU

Every preset: Cycles, light tree, adaptive sampling, OIDN (albedo+normal, accurate),
reflective caustics ON + filter glossy 1.0, refractive caustics OFF, indirect clamp OFF,
AgX, 16-bit PNG or EXR multilayer.

Test 25.11.2026 (sunlit room, glossy oak floor, glazed window): the usual advice
"caustics off + clamp 10" made the room ~1 stop darker in the shadows (light from the
sun patch on the floor and sky through the glass was cut). Fix = reflective caustics on,
clamp off, and window glass via window_glass() below. Path guiding and portals gave no
gain for a big window with direct sun (guiding +20% time); use them for small openings.
"""
import bpy

PRESETS = {
    "draft_cloud": dict(threshold=0.05, samples=256, time_limit=0, clamp_indirect=0.0,
                        guiding=False, oidn_quality="BALANCED", device="CPU"),
    "draft_gpu":   dict(threshold=0.03, samples=512, time_limit=0, clamp_indirect=0.0,
                        guiding=False, oidn_quality="HIGH", device="GPU"),
    "final_gpu":   dict(threshold=0.01, samples=4096, time_limit=0, clamp_indirect=0.0,
                        guiding=False, oidn_quality="HIGH", device="GPU"),
    "final_cpu":   dict(threshold=0.01, samples=4096, time_limit=0, clamp_indirect=0.0,
                        guiding=False, oidn_quality="HIGH", device="CPU"),
}

BOUNCES = dict(max_bounces=12, diffuse_bounces=4, glossy_bounces=4,
               transmission_bounces=12, volume_bounces=0, transparent_max_bounces=8)


def enable_gpu():
    """Turn on OptiX (or CUDA/HIP/Metal) devices in preferences; return True if a GPU is active."""
    try:
        cp = bpy.context.preferences.addons["cycles"].preferences
    except KeyError:
        return False
    for kind in ("OPTIX", "CUDA", "HIP", "METAL", "ONEAPI"):
        try:
            cp.compute_device_type = kind
        except TypeError:
            continue
        cp.get_devices()
        gpus = [d for d in cp.devices if d.type == kind]
        if gpus:
            for d in cp.devices:
                d.use = d.type == kind
            return True
    return False


def apply(scene, preset="draft_cloud", res_scale=None, exr=False, guiding=None):
    p = PRESETS[preset]
    scene.render.engine = "CYCLES"
    c = scene.cycles
    want_gpu = p["device"] == "GPU" and enable_gpu()
    c.device = "GPU" if want_gpu else "CPU"

    # sampling: stop on noise, not on sample count
    c.use_adaptive_sampling = True
    c.adaptive_threshold = p["threshold"]
    c.adaptive_min_samples = 0          # auto from threshold
    c.samples = p["samples"]
    c.time_limit = p["time_limit"]
    c.use_light_tree = True
    c.light_sampling_threshold = 0.01

    # path guiding: CPU only; helps rooms lit through windows/doorways
    use_guiding = (p["guiding"] if guiding is None else guiding) and c.device == "CPU"
    c.use_guiding = use_guiding
    if use_guiding:
        c.guiding_training_samples = 128
        c.use_surface_guiding = True
        c.use_volume_guiding = True

    # light paths
    for k, v in BOUNCES.items():
        setattr(c, k, v)
    c.sample_clamp_direct = 0.0
    c.sample_clamp_indirect = p["clamp_indirect"]   # 0 = off: keeps sky/sun energy in finals
    c.blur_glossy = 1.0
    c.caustics_reflective = True    # sun patch on a glossy floor lights the walls
    c.caustics_refractive = False   # glass handled by window_glass(); avoids fireflies
    c.use_fast_gi = False

    # denoise once, at the end
    c.use_denoising = True
    c.denoiser = "OPENIMAGEDENOISE"
    c.denoising_input_passes = "RGB_ALBEDO_NORMAL"
    c.denoising_prefilter = "ACCURATE"
    c.denoising_quality = p["oidn_quality"]
    c.denoising_use_gpu = want_gpu

    # colour: AgX base, no look (looks are chosen per project after review)
    v = scene.view_settings
    v.view_transform = "AgX"
    v.look = "None"
    v.gamma = 1.0
    scene.display_settings.display_device = "sRGB"
    scene.render.film_transparent = False
    scene.render.filter_size = 1.5

    if res_scale is not None:
        scene.render.resolution_percentage = int(res_scale * 100)

    f = scene.render.image_settings
    if exr:
        f.file_format = "OPEN_EXR_MULTILAYER"
        f.color_depth = "32"
        f.exr_codec = "DWAA"
    else:
        f.file_format = "PNG"
        f.color_depth = "16"
    return dict(preset=preset, device=c.device, guiding=use_guiding)


def camera_photo(cam_obj, focal_mm=30.0, height_m=1.45, shift_y=0.0):
    """Photographer's camera: level (no tilt), verticals straight; frame with shift instead of tilt."""
    cam = cam_obj.data
    cam.lens_unit = "MILLIMETERS"
    cam.lens = focal_mm
    cam.sensor_fit = "AUTO"
    cam.sensor_width = 36.0
    cam.shift_y = shift_y
    rx, ry, rz = cam_obj.rotation_euler
    cam_obj.rotation_euler = (1.5707963, 0.0, rz)   # level horizon, 2-point perspective
    cam_obj.location.z = height_m


def window_glass(mat):
    """Turn a window-glass material into the pro Cycles setup: real glass for camera and
    reflection rays, fully transparent for shadow/diffuse rays (sky and sun enter without noise)."""
    mat.use_nodes = True
    nt = mat.node_tree
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    old = out.inputs["Surface"].links[0].from_socket if out.inputs["Surface"].links else None
    if old is None:
        g = nt.nodes.new("ShaderNodeBsdfGlass")
        g.inputs["IOR"].default_value = 1.5
        old = g.outputs[0]
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    lp = nt.nodes.new("ShaderNodeLightPath")
    mx_ = nt.nodes.new("ShaderNodeMath"); mx_.operation = "MAXIMUM"
    nt.links.new(lp.outputs["Is Camera Ray"], mx_.inputs[0])
    nt.links.new(lp.outputs["Is Glossy Ray"], mx_.inputs[1])
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(mx_.outputs[0], mix.inputs[0])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(old, mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    return mat


def meter_exposure(scene, target=0.28, res=(160, 200), samples=32, tmp="/tmp/dgc_meter.exr"):
    """Exposure meter: quick low-res render in linear Standard view, returns the Exposure (stops)
    that puts the median luminance at `target`. 0.28 matched our light wabi-sabi interiors in the
    25.11 test (0.18 = classic mid grey gives a darker, moodier frame). Restores the scene afterwards."""
    import numpy as np, math, os
    r, c, v = scene.render, scene.cycles, scene.view_settings
    keep = (r.resolution_x, r.resolution_y, r.resolution_percentage, c.samples, v.view_transform,
            v.look, v.exposure, r.filepath, r.image_settings.file_format, r.image_settings.color_depth)
    r.resolution_x, r.resolution_y, r.resolution_percentage = res[0], res[1], 100
    c.samples = samples
    v.view_transform, v.look, v.exposure = "Standard", "None", 0.0
    r.image_settings.file_format, r.image_settings.color_depth = "OPEN_EXR", "32"
    r.filepath = tmp
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(tmp, check_existing=False)
    a = np.array(img.pixels[:], dtype=np.float32).reshape(img.size[1], img.size[0], 4)
    bpy.data.images.remove(img)
    lum = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    (r.resolution_x, r.resolution_y, r.resolution_percentage, c.samples, v.view_transform,
     v.look, v.exposure, r.filepath, r.image_settings.file_format, r.image_settings.color_depth) = keep
    med = float(np.median(lum))
    return round(math.log2(target / max(med, 1e-6)), 2)


def make_portal(window_obj, inset=0.02):
    """Area light portal sized to a window/door opening (object with dimensions X width, Z height),
    facing into the room along the window's local -Y (adjust rotation if needed)."""
    d = bpy.data.lights.new(window_obj.name + "_portal", "AREA")
    d.shape = "RECTANGLE"
    d.size = window_obj.dimensions.x
    d.size_y = window_obj.dimensions.z
    d.cycles.is_portal = True
    o = bpy.data.objects.new(d.name, d)
    o.matrix_world = window_obj.matrix_world.copy()
    o.rotation_euler = (window_obj.rotation_euler.x - 1.5707963, window_obj.rotation_euler.y,
                        window_obj.rotation_euler.z)
    bpy.context.scene.collection.objects.link(o)
    return o


def light_groups(scene, groups):
    """groups = {"sun_sky": [world], "ceiling": [obj, ...], "lamps": [...], "leds": [...]}
    Creates Light Groups (Blender's LightMix) so day/evening balance is set after rendering."""
    vl = scene.view_layers[0]
    for name in groups:
        if name not in vl.lightgroups:
            vl.lightgroups.add(name=name)
    for name, items in groups.items():
        for it in items:
            if isinstance(it, bpy.types.World):
                it.lightgroup = name
            else:
                it.lightgroup = name
