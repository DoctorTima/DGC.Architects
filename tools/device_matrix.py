#!/usr/bin/env python3
"""Device matrix for the journal (see STANDARD.md). Runs every article in Chrome pretending to be different
devices and checks what each must do. Chrome is not Safari: this proves the logic of every path
(live 3D, frames, keyframes, fallbacks); a real iPhone check is still part of the release.

  modes: desktop   - normal desktop: live 3D in both articles, chapter title follows the page
         nogl2     - desktop without WebGL 2: light mode, 3D buttons off, frames
         old-ios   - iPhone on iOS 15: light mode, no 3D files downloaded at all
         ios16-2   - iPhone 14 Pro on iOS 16.2 (the user's phone): live 3D in both articles
         instagram - Instagram in-app browser on iOS 16: live 3D (texture path fix)
         telegram  - Telegram in Android WebView, inline video blocked: the Blender loop runs as frames
         broken    - the 3D code fails to load: frames / keyframes stay, no blocking message
Usage: device_matrix.py <base-url> [mode ...]      exit code 1 if any check fails."""
import asyncio, sys, time, json
from playwright.async_api import async_playwright

BASE = sys.argv[1].rstrip('/')
UA = {
    'iphone15': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1',
    'iphone16': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.2 Mobile/15E148 Safari/604.1',
    'insta': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 309.0.0.21.110 (iPhone14,5; iOS 16_6; ru_RU; ru; scale=3.00; 1170x2532; 536988435)',
    'tg': 'Mozilla/5.0 (Linux; Android 13; SM-A536B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0.6045.163 Mobile Safari/537.36 Telegram-Android/10.3.2',
}
MODES = {
    'desktop':   dict(ua=None, w=1440, h=900, expect='live'),
    'nogl2':     dict(ua=None, w=1280, h=800, expect='lite', args=['--disable-webgl2']),
    'old-ios':   dict(ua='iphone15', w=390, h=844, expect='lite'),
    'ios16-2':   dict(ua='iphone16', w=390, h=844, expect='live'),
    'instagram': dict(ua='insta', w=390, h=844, expect='live'),
    'telegram':  dict(ua='tg', w=390, h=844, expect='live', noplay=True),
    'broken':    dict(ua='iphone16', w=390, h=844, expect='broken'),
}
BREAK = 'class A{static{ this.x = 1 }; broken( }'

async def run(p, name, m):
    res, fails = {}, []
    ok = lambda cond, what: (None if cond else fails.append(what))
    args = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] + m.get('args', [])
    b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=args)
    kw = dict(viewport={'width': m['w'], 'height': m['h']})
    if m['ua']: kw['user_agent'] = UA[m['ua']]
    if m['w'] < 900: kw.update(is_mobile=True, has_touch=True)
    ctx = await b.new_context(**kw)
    if m.get('noplay'): await ctx.add_init_script("HTMLMediaElement.prototype.play = function () { return Promise.reject(new DOMException('blocked', 'NotAllowedError')); };")
    if m['expect'] == 'broken':
        for pat in ('**/js/viewer/app.js', '**/assets/dolina/review/viewer.js'):
            await ctx.route(pat, lambda r: r.fulfill(status=200, content_type='text/javascript', body=BREAK))
    pg = await ctx.new_page(); errs, reqs = [], []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('request', lambda r: reqs.append(r.url.split(BASE)[-1]))
    t0 = time.time()
    env = None
    # ---- REC: the model story
    await pg.goto(BASE + '/index.html#story', wait_until='domcontentloaded'); await pg.wait_for_timeout(2500)
    env = json.loads(await pg.evaluate("JSON.stringify(window.DGC_ENV || null)") or 'null')
    st = await pg.evaluate("[...document.querySelectorAll('.story-step')].map(s=>s.getBoundingClientRect().top+scrollY+s.offsetHeight/2)")
    async def at(k):
        i = int(k); f = k - i; y = st[i] + f * (st[min(i + 1, len(st) - 1)] - st[i]) - m['h'] * .55
        await pg.evaluate(f'scrollTo(0,{y})')
    await at(2); await pg.wait_for_timeout(1500)
    f1 = await pg.evaluate("document.querySelector('#story-frames img').src")
    await at(4); await pg.wait_for_timeout(1500)
    f2 = await pg.evaluate("document.querySelector('#story-frames img').src")
    early = await pg.evaluate("document.getElementById('story-stage').classList.contains('is-live')")   # live already: frames rest
    live = False
    if m['expect'] == 'live':
        for i in range(150):
            if await pg.evaluate("document.getElementById('story-stage').classList.contains('is-live')"): live = True; break
            await pg.wait_for_timeout(1000)
    else:
        await pg.wait_for_timeout(4000)
        live = await pg.evaluate("document.getElementById('story-stage').classList.contains('is-live')")
    hud = await pg.evaluate("document.getElementById('story-load').textContent")
    btn3d = await pg.evaluate("!document.getElementById('story-3d').hidden")
    res['REC'] = {'live': live, 'frames move': f1 != f2, 'hud': hud, '3D button': btn3d}
    ok(f1 != f2 or early, 'REC frames do not follow the scroll')
    if m['expect'] == 'live': ok(live, 'REC live model did not start')
    else: ok(not live, 'REC should stay on frames')
    if m['expect'] == 'lite': ok(btn3d == bool(env and env.get('gl2')), 'REC "switch on 3D" button state')
    chap = await pg.evaluate("document.getElementById('chapter-now-no').textContent")
    ok(chap == '05', f'chapter title shows {chap} instead of 05')
    # ---- REC: the Blender loop
    await pg.evaluate("document.querySelector('.parts').scrollIntoView({block:'center'})"); await pg.wait_for_timeout(3500)
    parts = await pg.evaluate("(()=>{const v=document.getElementById('parts-video'), f=document.querySelector('.parts-flip');return v ? {video: true, playing: !v.paused, t: Math.round(v.currentTime*10)/10} : {video: false, frame: f && f.src.split('/').pop()}})()")
    await pg.wait_for_timeout(1200)
    parts2 = await pg.evaluate("(()=>{const v=document.getElementById('parts-video'), f=document.querySelector('.parts-flip');return v ? Math.round(v.currentTime*10)/10 : f && f.src.split('/').pop()})()")
    res['Blender loop'] = parts
    ok((parts.get('t') if parts['video'] else parts.get('frame')) != parts2, 'the Blender loop does not move')
    if m.get('noplay') or m['expect'] == 'lite': ok(not parts['video'], 'expected the frame loop instead of video')
    # ---- Dolina: the stage
    await pg.goto(BASE + '/index.html#d-before', wait_until='domcontentloaded'); await pg.wait_for_timeout(2500)
    sd = await pg.evaluate("[...document.querySelectorAll('.d-step')].map(s=>s.firstElementChild.getBoundingClientRect().top+scrollY)")
    await pg.evaluate(f'scrollTo(0,{sd[2]}-innerHeight*.5)'); await pg.wait_for_timeout(2000)
    k1 = await pg.evaluate("document.querySelector('#d-keys img').src")
    await pg.evaluate(f'scrollTo(0,{sd[5]}-innerHeight*.5)'); await pg.wait_for_timeout(2500)
    k2 = await pg.evaluate("document.querySelector('#d-keys img').src")
    dearly = await pg.evaluate("document.getElementById('d-stage').classList.contains('is-live')")
    dlive = False
    if m['expect'] == 'live':
        for i in range(120):
            if await pg.evaluate("document.getElementById('d-stage').classList.contains('is-live')"): dlive = True; break
            await pg.wait_for_timeout(1000)
    else:
        await pg.wait_for_timeout(5000)
        dlive = await pg.evaluate("document.getElementById('d-stage').classList.contains('is-live')")
    d = await pg.evaluate("({box: document.getElementById('d-load').hidden ? '' : document.getElementById('d-load').textContent, explore: document.getElementById('d-explore').textContent.trim(), exploreOff: document.getElementById('d-explore').disabled, caption: document.getElementById('d-caption').textContent})")
    res['Dolina'] = {'live': dlive, 'keyframes move': k1 != k2, **d}
    ok(k1 != k2 or dearly, 'Dolina keyframes do not follow the steps')
    if m['expect'] == 'live': ok(dlive, 'Dolina live model did not start')
    else: ok(not dlive, 'Dolina should stay on keyframes')
    if m['expect'] == 'broken': ok(not d['box'] and d['exploreOff'], 'Dolina failure should be quiet and switch 3D buttons off')
    chap = await pg.evaluate("document.getElementById('chapter-now-no').textContent")
    ok(chap == '03', f'Dolina chapter title shows {chap} instead of 03')
    # ---- light mode must not download the heavy files
    heavy = [r for r in reqs if (r.startswith('/models/') and r.endswith('.txt')) or '/assets/dolina/model/' in r]
    res['3D files downloaded'] = len(heavy)
    if m['expect'] == 'lite': ok(not heavy, 'light mode downloaded 3D model files')
    page_errs = [e for e in errs if 'broken' not in e and "Unexpected token '}'" not in e]
    ok(not page_errs, 'page errors: ' + '; '.join(page_errs[:3]))
    await b.close()
    return {'mode': name, 'env': env and {k: env[k] for k in ('lite', 'reason', 'inApp')}, 'seconds': round(time.time() - t0), **res, 'FAIL': fails}

async def main():
    names = sys.argv[2:] or list(MODES)
    bad = 0
    async with async_playwright() as p:
        for n in names:
            r = await run(p, n, MODES[n])
            bad += len(r['FAIL'])
            print(('✓ ' if not r['FAIL'] else '✗ ') + json.dumps(r, ensure_ascii=False), flush=True)
    print(f'device matrix: {"ok" if not bad else str(bad) + " failed check(s)"}')
    sys.exit(1 if bad else 0)

asyncio.run(main())
