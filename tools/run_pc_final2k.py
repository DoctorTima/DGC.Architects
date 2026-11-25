"""2K timing of the current final_gpu preset: blender -b --python run_pc_final2k.py"""
import bpy, sys, os, time, json
root = os.path.join(os.path.expanduser('~'), 'Documents', 'DGC_Render')
tools, tests = os.path.join(root, 'tools'), os.path.join(root, 'tests')
sys.path.insert(0, tools)
import dgc_cycles_presets as P, dgc_test_room as R
s = bpy.context.scene
R.build(s)
info = P.apply(s, 'final_gpu')
s.view_settings.exposure = -2.6; s.view_settings.look = 'AgX - Medium High Contrast'
s.render.resolution_x, s.render.resolution_y, s.render.resolution_percentage = 1600, 2000, 100
s.render.image_settings.file_format = 'PNG'; s.render.image_settings.color_depth = '8'
s.render.filepath = os.path.join(tests, 'final_2k_t002.png')
t = time.time(); bpy.ops.render.render(write_still=True)
json.dump({'final_2k_t002': round(time.time() - t, 1), **info, 'threshold': s.cycles.adaptive_threshold,
           'finished': time.strftime('%H:%M:%S')}, open(os.path.join(tests, 'pc_final2k.json'), 'w'))
