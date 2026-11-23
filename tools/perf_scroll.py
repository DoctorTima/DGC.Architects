#!/usr/bin/env python3
"""Scroll smoothness of a journal page as a weak phone sees it.
Chrome, phone viewport, CPU slowed down 4x, touch scroll through the whole article by real gestures.
Reports frame times (from requestAnimationFrame) and long main-thread tasks.
Usage: perf_scroll.py <url-with-#route> [--lite] [--cpu 4] [--wide]
'--lite' pretends to be an old iPhone (frames instead of live 3D: measures the page itself, not swiftshader)."""
import asyncio, sys, json
from playwright.async_api import async_playwright

URL = sys.argv[1]; LITE = '--lite' in sys.argv; WIDE = '--wide' in sys.argv
CPU = float(sys.argv[sys.argv.index('--cpu') + 1]) if '--cpu' in sys.argv else 4
UA_OLD = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1'
UA_NEW = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

PROBE = """
window.__perf = {d: [], long: [], last: 0, on: false};
new PerformanceObserver(l => { for (const e of l.getEntries()) if (__perf.on) __perf.long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({type: 'longtask', buffered: false});
(function tick(t) { if (__perf.on && __perf.last) __perf.d.push(t - __perf.last); __perf.last = t; requestAnimationFrame(tick); })(0);
"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
        W, H = (1280, 800) if WIDE else (390, 844)
        ctx = await b.new_context(viewport={'width': W, 'height': H}, is_mobile=not WIDE, has_touch=not WIDE, device_scale_factor=2 if not WIDE else 1,
                                  user_agent=UA_OLD if LITE else UA_NEW)
        await ctx.add_init_script(PROBE)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL, wait_until='domcontentloaded'); await pg.wait_for_timeout(2500)
        cdp = await ctx.new_cdp_session(pg)
        await cdp.send('Emulation.setCPUThrottlingRate', {'rate': CPU})
        total = await pg.evaluate("document.querySelector('.view.is-active').getBoundingClientRect().height")
        await pg.evaluate("window.__perf.on = true")
        y = 0; step = 1400
        while y < total - H:
            await cdp.send('Input.synthesizeScrollGesture', {'x': W // 2, 'y': int(H * .6), 'yDistance': -step, 'speed': 1600,
                                                             'gestureSourceType': 'touch' if not WIDE else 'mouse', 'repeatCount': 1})
            y += step
        await pg.evaluate("window.__perf.on = false")
        r = await pg.evaluate("""(() => { const d = __perf.d.slice().sort((a, b) => a - b), n = d.length;
          const q = k => n ? Math.round(d[Math.min(n - 1, Math.floor(n * k))]) : 0;
          return {frames: n, median: q(.5), p95: q(.95), worst: q(1) , over50: d.filter(x => x > 50).length, over100: d.filter(x => x > 100).length,
                  longTasks: __perf.long.length, longMs: __perf.long.reduce((a, l) => a + l[1], 0), maxLong: Math.max(0, ...__perf.long.map(l => l[1]))} })()""")
        r.update({'page': URL.split('#')[-1], 'mode': 'lite' if LITE else 'live', 'cpu': f'{CPU}x', 'height': int(total), 'errors': errs[:3]})
        print(json.dumps(r, ensure_ascii=False))
        await b.close()

asyncio.run(main())
