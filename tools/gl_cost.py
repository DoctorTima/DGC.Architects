#!/usr/bin/env python3
"""How heavy is each live 3D frame: draw calls and triangles per frame, counted by wrapping WebGL draw functions.
Device-independent: phones start to struggle well before desktop does when calls or triangles are high.
Usage: gl_cost.py <base-url>"""
import asyncio, sys, json
from playwright.async_api import async_playwright
BASE = sys.argv[1].rstrip('/')
WRAP = """
(() => {
  const S = window.__gl = {calls: 0, tris: 0, frames: []};
  for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!C) continue; const P = C.prototype;
    const tri = (mode, n, inst) => (mode === 4 ? n / 3 : mode === 5 || mode === 6 ? n - 2 : 0) * (inst || 1);
    for (const [name, ci, ii] of [['drawElements', 1, -1], ['drawArrays', 2, -1], ['drawElementsInstanced', 1, 4], ['drawArraysInstanced', 2, 3]]) {
      const f = P[name]; if (!f) continue;
      P[name] = function (...a) { S.calls++; S.tris += tri(a[0], a[ci], ii >= 0 ? a[ii] : 1); return f.apply(this, a); };
    }
  }
  (function tick() { if (S.calls) S.frames.push([S.calls, Math.round(S.tris)]); S.calls = 0; S.tris = 0; requestAnimationFrame(tick); })();
})();
"""
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=3,
      user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1')
    await ctx.add_init_script(WRAP)
    pg = await ctx.new_page()
    # REC story
    await pg.goto(BASE + '/index.html#story', wait_until='domcontentloaded')
    for i in range(120):
      if await pg.evaluate("document.getElementById('story-stage').classList.contains('is-live')"): break
      await pg.wait_for_timeout(1000)
    await pg.wait_for_timeout(15000)   # life and details groups
    st = await pg.evaluate("[...document.querySelectorAll('.story-step')].map(s=>s.getBoundingClientRect().top+scrollY+s.offsetHeight/2)")
    rec = {}
    for k in (0, 3, 5, 6, 7, 10):
      await pg.evaluate("window.__gl.frames = []")
      await pg.evaluate(f"scrollTo(0, {st[k]} - innerHeight * .55)"); await pg.wait_for_timeout(7000)   # software GL is slow: give each frame time
      fr = await pg.evaluate("window.__gl.frames"); rec[k] = max(fr, key=lambda f: f[0]) if fr else None
    dpr = await pg.evaluate("(()=>{const c=document.querySelector('#story-host canvas');return c?[c.width,c.height]:null})()")
    print(json.dumps({'REC story, [calls, triangles] per step': rec, 'canvas px': dpr}, ensure_ascii=False), flush=True)
    # Dolina viewer (inside the iframe)
    await pg.goto(BASE + '/index.html#d-walk', wait_until='domcontentloaded'); await pg.wait_for_timeout(1500)
    sd = await pg.evaluate("[...document.querySelectorAll('.d-step')].map(s=>s.firstElementChild.getBoundingClientRect().top+scrollY)")
    await pg.evaluate(f"scrollTo(0, {sd[4]} - innerHeight * .5)")
    for i in range(90):
      if await pg.evaluate("document.getElementById('d-stage').classList.contains('is-live')"): break
      await pg.wait_for_timeout(1000)
    dol = {}
    fr_ = pg.frames[-1]
    for k in (0, 4, 5, 6, 8):
      await fr_.evaluate("window.__gl.frames = []")
      await pg.evaluate(f"scrollTo(0, {sd[k]} - innerHeight * .5)"); await pg.wait_for_timeout(4000)
      fr = await fr_.evaluate("window.__gl.frames"); dol[k] = max(fr, key=lambda f: f[0]) if fr else None
    cv = await fr_.evaluate("(()=>{const c=document.querySelector('canvas');return c?[c.width,c.height]:null})()")
    print(json.dumps({'Dolina viewer, [calls, triangles] per step': dol, 'canvas px': cv}, ensure_ascii=False), flush=True)
    await b.close()
asyncio.run(main())
