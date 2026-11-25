"""Quality/time ladder for final settings on GPU: blender -b --python run_pc_ladder.py"""
import bpy, sys, os, time, json
import numpy as np
root = os.path.join(os.path.expanduser('~'), 'Documents', 'DGC_Render')
tools, tests = os.path.join(root, 'tools'), os.path.join(root, 'tests')
sys.path.insert(0, tools)
import dgc_cycles_presets as P, dgc_test_room as R
s = bpy.context.scene
R.build(s)
log = {}
def save(): json.dump(log, open(os.path.join(tests, 'pc_ladder.json'), 'w'), indent=1)
def load(p):
    im = bpy.data.images.load(p, check_existing=False)
    a = np.array(im.pixels[:], dtype=np.float32).reshape(im.size[1], im.size[0], 4)[:, :, :3]
    bpy.data.images.remove(im); return a
cases = [('L_ref', 0.003, 16384), ('L_0.01', 0.01, 4096), ('L_0.02', 0.02, 1024), ('L_0.03', 0.03, 512), ('L_0.05', 0.05, 256)]
for name, thr, spp in cases:
    P.apply(s, 'final_gpu')
    s.cycles.adaptive_threshold, s.cycles.samples = thr, spp
    s.view_settings.exposure = -2.6; s.view_settings.look = 'AgX - Medium High Contrast'
    s.render.resolution_x, s.render.resolution_y, s.render.resolution_percentage = 400, 500, 100
    s.render.image_settings.file_format = 'PNG'; s.render.image_settings.color_depth = '16'
    path = os.path.join(tests, name + '.png'); s.render.filepath = path
    t = time.time(); bpy.ops.render.render(write_still=True)
    log[name] = {'seconds': round(time.time() - t, 1), 'threshold': thr, 'max_spp': spp}
    save()
ref = load(os.path.join(tests, 'L_ref.png'))
for name, thr, spp in cases[1:]:
    d = load(os.path.join(tests, name + '.png')) - ref
    log[name]['rmse_x1000'] = round(float(np.sqrt((d ** 2).mean())) * 1000, 2)
    log[name]['p99_x1000'] = round(float(np.percentile(np.abs(d), 99)) * 1000, 1)
log['finished'] = time.strftime('%H:%M:%S'); save()
