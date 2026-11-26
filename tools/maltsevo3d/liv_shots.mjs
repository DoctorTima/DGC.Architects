import puppeteer from 'puppeteer-core';
// node liv_shots.mjs <outdir> <w> <h> job1 job2 ...   job = name:action  (action: iso|plan|stop=<id>|ceil|cut|k2 combos with +)
const [,, outdir, w, h, ...jobs] = process.argv;
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage();
await page.setViewport({ width: +w, height: +h, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));
page.on('requestfailed', (r) => logs.push('REQFAIL: ' + r.url() + ' ' + r.failure()?.errorText));
const t0 = Date.now();
await page.goto('http://127.0.0.1:8731/maltsevo-3d/?shot=1' + (process.env.BARE ? '&bare=1' : '') + (process.env.CAND ? '&cand=' + encodeURIComponent(process.env.CAND) : ''), { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__app && window.__app.state.ready, { timeout: 180000 }).catch(() => logs.push('WAIT TIMEOUT'));
logs.push('ready ms ' + (Date.now() - t0));
const settle = async () => { await page.waitForFunction(() => !window.__app.state.anim, { timeout: 30000 }); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); await new Promise((r) => setTimeout(r, 400)); };
for (const job of jobs) {
  const [name, action] = job.split(':');
  await page.evaluate((action) => {
    const A = window.__app;
    for (const a of action.split('+')) {
      if (a === 'iso' || a === 'plan') A.goOrbit(a, true);
      else if (a.startsWith('stop=')) A.goStop(a.slice(5), true);
      else if (a === 'ceil') A.setCeiling(true);
      else if (a === 'noceil') A.setCeiling(false);
      else if (a === 'cut') { A.state.cut = true; A.applyCut(); }
      else if (a === 'nocut') { A.state.cut = false; A.applyCut(); }
      else if (a === 'k1') A.setKitchen('A');
      else if (a === 'k2') A.setKitchen('B');
      else if (a === 'k3') A.setKitchen('C');
      else if (a === 'shelf0') A.setShelf(false);
      else if (a === 'shelf1') A.setShelf(true);
      else if (a === 'relief1') A.setRelief(true);
      else if (a === 'relief0') A.setRelief(false);
      else if (a.startsWith('cam=')) { const v = a.slice(4).split(',').map(Number); A.camera.position.set(v[0], v[1], v[2]); A.controls.target.set(v[3], v[4], v[5]); A.controls.update(); }
      else if (a.startsWith('yaw=')) { const d = +a.slice(4) * Math.PI / 180; const c = A.camera.position, t = A.controls.target; const dx = t.x - c.x, dz = t.z - c.z; t.x = c.x + dx * Math.cos(d) - dz * Math.sin(d); t.z = c.z + dx * Math.sin(d) + dz * Math.cos(d); A.controls.update(); }
    }
    A.requestRender();
  }, action);
  await settle();
  await page.screenshot({ path: `${outdir}/${name}.png` });
}
console.log(logs.filter((l) => !/GPU stall|swiftshader|WebGL-/.test(l)).join('\n'));
await browser.close();
