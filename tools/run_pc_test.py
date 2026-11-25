"""Background timing test on Timofey's PC: blender -b --python run_pc_test.py"""
import bpy, sys, os, time, json
root = os.path.join(os.path.expanduser('~'), 'Documents', 'DGC_Render')
tools, tests = os.path.join(root, 'tools'), os.path.join(root, 'tests')
sys.path.insert(0, tools)
import dgc_cycles_presets as P, dgc_test_room as R
s = bpy.context.scene
log = {'started': time.strftime('%H:%M:%S')}
def save():
    json.dump(log, open(os.path.join(tests, 'pc_timing.json'), 'w'), ensure_ascii=False, indent=1)
R.build(s)
for name, preset in [('final_2k', 'final_gpu'), ('draft_2k', 'draft_gpu')]:
    info = P.apply(s, preset)
    s.view_settings.exposure = -2.6
    s.view_settings.look = 'AgX - Medium High Contrast'
    s.render.resolution_x, s.render.resolution_y, s.render.resolution_percentage = 1600, 2000, 100
    s.render.image_settings.file_format = 'PNG'; s.render.image_settings.color_depth = '8'
    s.render.filepath = os.path.join(tests, name + '.png')
    t = time.time(); bpy.ops.render.render(write_still=True)
    log[name] = {'seconds': round(time.time() - t, 1), **info}
    save()
log['finished'] = time.strftime('%H:%M:%S'); save()
