import asyncio, sys, os, time
from playwright.async_api import async_playwright
# capt_dolina.py set W H dpr  -> /home/claude/build/work/dolina-keys/<set>/k0..k8.png
SET, W, H, DPR = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), float(sys.argv[4])
OUT = f'/home/claude/build/work/dolina-keys/{SET}'; os.makedirs(OUT, exist_ok=True)
CMDS = [{'action': 'before', 'issue': 0}, {'action': 'before', 'issue': 1}, {'action': 'before', 'issue': 2}, {'action': 'before', 'issue': 3},
        {'action': 'overview'}, {'action': 'storage'}, {'action': 'desk'}, {'action': 'kitchen'}, {'action': 'bath'}]
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg = await (await b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=DPR)).new_page(); t0 = time.time()
    pg.on('pageerror', lambda e: print('ERR', e, flush=True))
    await pg.goto('http://localhost:8850/assets/dolina/review/index.html')
    for i in range(180):
      if await pg.evaluate("document.body.dataset.ready === '1'"): break
      await pg.wait_for_timeout(1000)
    print('ready', round(time.time() - t0), flush=True)
    send = lambda c: pg.evaluate("c => window.postMessage(Object.assign({app:'dolina-article', full:false}, c), '*')", c)
    for k, c in enumerate(CMDS):
      await send(c)
      for i in range(120):
        await pg.wait_for_timeout(1000)
        st = await pg.evaluate("(()=>{const s=document.getElementById('status');return s.hidden||!s.textContent})()")
        if st and i >= 3: break
      if c['action'] == 'before' and k == 0:      # the first command loads the old flat: send it again once it is there
        await send(c); await pg.wait_for_timeout(4000)
      await pg.wait_for_timeout(1500)
      await pg.screenshot(path=f'{OUT}/k{k}.png', timeout=180000)
      print(k, c, round(time.time() - t0), flush=True)
    await b.close()
asyncio.run(main())
