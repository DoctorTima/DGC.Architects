import puppeteer from 'puppeteer-core';
// кадры для страницы: мини-план (орто, срез), постер, превью точек, og
const OUT = process.argv[2];
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl'] });
const page = await browser.newPage();
async function open(q, w, h, dpr = 1) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: dpr });
  await page.goto('http://127.0.0.1:8731/maltsevo-3d/?shot=1&bare=1' + q, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__app && window.__app.state.ready, { timeout: 180000 });
}
const settle = async () => { await page.waitForFunction(() => !window.__app.state.anim, { timeout: 30000 }); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); await new Promise((r) => setTimeout(r, 300)); };
await open('&ortho=1' + (process.env.K2 ? '&k=2' : ''), 1200, 898);
await page.evaluate(() => window.__app.requestRender()); await settle();
await page.screenshot({ path: OUT + '/plan.png' });
await open('', 1600, 1000);
await page.evaluate(() => { window.__app.goOrbit('iso', true); }); await settle();
await page.screenshot({ path: OUT + '/poster.png' });
await page.setViewport({ width: 1200, height: 630 }); await page.evaluate(() => { window.__app.goOrbit('iso', true); }); await settle();
await page.screenshot({ path: OUT + '/og.png' });
await page.setViewport({ width: 480, height: 320 });
const ids = await page.evaluate(() => window.MALTSEVO.stops.map((s) => s.id));
for (const id of ids) {
  await page.evaluate((id) => window.__app.goStop(id, true), id); await settle();
  await page.screenshot({ path: OUT + '/stop-' + id + '.png' });
}
await browser.close();
