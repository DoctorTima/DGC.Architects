import asyncio, sys, time, os
from playwright.async_api import async_playwright
# capt_rec.py set W H dpr count
SET, W, H, DPR = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), float(sys.argv[4]); ONLY = sys.argv[5] if len(sys.argv) > 5 else None
OUT = f'/home/claude/build/work/frames-rec/{SET}'; os.makedirs(OUT, exist_ok=True)
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    ctx = await b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=DPR)
    pg = await ctx.new_page(); t0 = time.time()
    await pg.goto('http://localhost:8840/index.html#story'); await pg.wait_for_timeout(2000)
    print('page', await pg.evaluate("[document.documentElement.dataset.view, document.getElementById('story-load').textContent]"), flush=True)
    await pg.add_style_tag(content='.story-steps{visibility:hidden!important}.story-hud,.story-rail,.story-note,.read-progress{display:none!important}.edges{display:none!important}')
    # stand in the middle of the story so the stage is pinned
    await pg.evaluate("(()=>{const s=document.getElementById('story');scrollTo(0,s.getBoundingClientRect().top+scrollY+s.offsetHeight/2-innerHeight/2)})()")
    for i in range(240):
      t = await pg.evaluate("document.getElementById('story-load').textContent")
      if 'Живая' in t: break
      if i == 40 and 'Загружаем' not in t:
        print('reload', t, flush=True); await pg.reload(); await pg.wait_for_timeout(2000)
        await pg.add_style_tag(content='.story-steps{visibility:hidden!important}.story-hud,.story-rail,.story-note,.read-progress{display:none!important}.edges{display:none!important}')
        await pg.evaluate("(()=>{const s=document.getElementById('story');scrollTo(0,s.getBoundingClientRect().top+scrollY+s.offsetHeight/2-innerHeight/2)})()")
      await pg.wait_for_timeout(1000)
    print('ready', round(time.time()-t0), t, flush=True)
    try: await pg.wait_for_load_state('networkidle', timeout=240000)
    except Exception as e: print('networkidle timeout', e)
    await pg.wait_for_timeout(3000); print('all loaded', round(time.time()-t0), flush=True)
    r = await pg.evaluate("(()=>{const r=document.getElementById('story-stage').getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()")
    clip = {'x': r[0], 'y': r[1] + 1, 'width': r[2], 'height': r[3] - 2}; print('clip', clip, flush=True)
    PER = int(os.environ.get('PER', '6')); ps = [k / PER for k in range(10 * PER + 1)] if not ONLY else [float(x) for x in ONLY.split(',')]
    for k, pv in enumerate(ps):
      name = f'{OUT}/f{round(pv*PER):03d}.png'   # skip existing
      if os.path.exists(name): continue
      n0 = await pg.evaluate(f"(window.__storyP={pv}, window.__storyKick(), window.__storyFrames)")
      for _ in range(60):
        await pg.wait_for_timeout(120)
        if await pg.evaluate("window.__storyFrames") > n0: break
      await pg.wait_for_timeout(250)
      await pg.screenshot(path=name, clip=clip, timeout=180000)
      if k % 10 == 0: print(k, round(time.time()-t0), flush=True)
    await b.close()
asyncio.run(main())
