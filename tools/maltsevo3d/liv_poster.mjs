import puppeteer from 'puppeteer-core';
// кадр сцены страницы без меток и подсказок — постер под загрузку модели
const [,, out, w, h] = process.argv;
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl'] });
const page = await browser.newPage();
await page.setViewport({ width: +w, height: +h, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:8731/maltsevo-3d/?shot=1', { waitUntil: 'load' });
await page.waitForFunction(() => window.__app && window.__app.state.ready, { timeout: 120000 });
await page.addStyleTag({ content: '.pins,.stage-hint,.loader{display:none!important}' });
await page.evaluate(() => { document.getElementById('model').scrollIntoView(); window.__app.goOrbit('iso', true); });
await new Promise((r) => setTimeout(r, 800));
const el = await page.$('.stage-gl');
await el.screenshot({ path: out });
await browser.close();
