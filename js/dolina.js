// «Долина»: survey/project wipe, one guided stage for both models (drawing / 3D / Vlad's angle),
// free view with return to the same place, light and socket blocks, staged furnishing cost.
// The text is in the HTML; this module only adds behaviour. Data comes from assets/dolina/data.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const BASE = 'assets/dolina/';
const view = document.getElementById('view-dolina');

if (view) {
  let started = false;
  const go = () => { if (!started && view.classList.contains('is-active')) { started = true; start(); } };
  document.addEventListener('rec:view', go); go();
}

function start() {
  const json = n => fetch(BASE + 'data/' + n + '.json').then(r => { if (!r.ok) throw Error(n + ' ' + r.status); return r.json(); });
  // the estimate is loaded only where the cost chapter is part of the page (the public issue has none)
  const withCost = !!$('#d-ledger');
  const data = Promise.all(['drawings', 'views', 'electrical', ...(withCost ? ['cost-stages', 'estimate'] : [])].map(json))
    .then(([drawings, views, electrical, stages, estimate]) => ({drawings, views: views.views || views, electrical, stages, estimate}));
  wipe();
  drift();
  const stage = guidedStage(data);
  lightAndSockets(data, stage);
  cost(data, stage);
}

/* ---------- Scroll values for the cover and the renders ----------
   --v: 0 when the block enters at the bottom of the window, 1 when it has left at the top;
   --u: how far the block has been scrolled past the header (0..1). CSS turns them into motion. */
function drift() {
  const els = $$('[data-drift]', view); if (!els.length) return;
  const clamp = x => Math.max(0, Math.min(1, x));
  let raf = 0;
  function update() {
    raf = 0; if (!view.classList.contains('is-active')) return;
    const vh = innerHeight, rm = reduced();
    for (const el of els) {
      const r = el.getBoundingClientRect(); if (!r.height || r.bottom < -vh || r.top > 2 * vh) continue;
      el.style.setProperty('--v', rm ? '.5' : clamp((vh - r.top) / (vh + r.height)).toFixed(4));
      el.style.setProperty('--u', rm ? '0' : clamp((72 - r.top) / r.height).toFixed(4));
      el.style.setProperty('--s', rm ? '0' : clamp((60 - r.top) / (vh * .42)).toFixed(4));   // the cover title sinks within half a screen
    }
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(update); };
  addEventListener('scroll', kick, {passive: true}); addEventListener('resize', kick); document.addEventListener('rec:view', kick);
  update();
}

/* ---------- 01: survey and project in one frame ---------- */
function wipe() {
  const fig = $('#d-wipe'); if (!fig) return;
  const box = $('#d-wipe-stage', fig), range = $('#d-wipe-range', fig);
  let touched = false;
  const set = v => {
    v = Math.max(0, Math.min(100, Math.round(v)));
    fig.style.setProperty('--pos', v + '%'); range.value = v;
    range.setAttribute('aria-valuetext', v >= 100 ? 'Только обмер АИ-1' : v <= 0 ? 'Только проект АИ-4' : `Слева обмер АИ-1, справа проект АИ-4, граница на ${v}%`);
    $$('[data-wipe]', fig).forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.wipe === v)));
  };
  range.addEventListener('input', () => { touched = true; set(+range.value); });
  let raf = 0;
  const glide = to => {
    cancelAnimationFrame(raf);
    if (reduced()) { set(to); return; }
    const from = +range.value, t0 = performance.now();
    const step = now => { const t = Math.min(1, (now - t0) / 650), q = 1 - Math.pow(1 - t, 3); set(from + (to - from) * q); if (t < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
  };
  $$('[data-wipe]', fig).forEach(b => b.addEventListener('click', () => { touched = true; glide(+b.dataset.wipe); }));
  let drag = false;
  const at = e => { const r = box.getBoundingClientRect(); set((e.clientX - r.left) / r.width * 100); };
  box.addEventListener('pointerdown', e => { drag = touched = true; cancelAnimationFrame(raf); box.setPointerCapture(e.pointerId); at(e); });
  box.addEventListener('pointermove', e => { if (drag) at(e); });
  box.addEventListener('pointerup', () => { drag = false; });
  box.addEventListener('pointercancel', () => { drag = false; });
  // first look: the survey sheet slides away to the middle
  set(50);
  if (!reduced()) {
    const io = new IntersectionObserver(es => {
      if (!es[0].isIntersecting) return; io.disconnect();
      if (touched) return; set(100); setTimeout(() => { if (!touched) glide(50); }, 450);
    }, {threshold: .45});
    io.observe(box);
  }
}

/* ---------- 02-03: the guided stage ---------- */
function guidedStage(dataReady) {
  const story = $('#d-story'); if (!story) return null;
  const stage = $('#d-stage'), frame = $('#d-frame'), load = $('#d-load'), caption = $('#d-caption');
  const sheetBtn = $('#d-sheet'), renderBtn = $('#d-render'), back = $('#d-model-back');
  const modeBtns = $$('.d-modes [data-mode]', stage), explore = $('#d-explore'), close = $('#d-close');
  const steps = $$('.d-step', story), count = $('#d-count'), rail = $('#d-rail');
  const env = window.DGC_ENV || {};
  const gl = env.gl2 != null ? env.gl2 : (() => { try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; } })();
  // light mode (old iPhones, weak devices): keyframes of the same model; the live viewer only on request
  let lite = !!env.lite;
  let want = 'model';                     // the reader's choice; a step without an angle falls back to 3D
  let heard = false, failed = false, active = null, data = null, loaded = false, ready = false, pending = null, full = false, savedY = 0, opener = null;

  /* 3D did not start or was dropped by the browser: the stage stays on keyframes, nothing waits or blocks.
     The buttons that need the live model are switched off with an honest label. */
  function fail(why) {
    if (failed) return; failed = true; ready = false;
    if (full) closeFull(true);
    stage.classList.remove('is-live'); load.hidden = true;
    try { frame.removeAttribute('srcdoc'); frame.src = 'about:blank'; } catch (e) {}
    explore.disabled = true; explore.title = '3D не запустилась в этом браузере';
    explore.querySelector('.l-long').textContent = '3D недоступно'; explore.querySelector('.l-short').textContent = '3D недоступно';
    $$('[data-open]').forEach(b => { b.disabled = true; b.title = '3D не запустилась в этом браузере'; });
    show(); console.warn('Dolina 3D:', why);
  }

  /* keyframes: the guided viewer filmed at every step, two sets (wide and narrow stage), cross-faded */
  const keys = $('#d-keys'), [ka, kb] = keys ? $$('img', keys) : [];
  let keyShown = '';
  function showKey(k) {
    if (!keys) return;
    const set = stage.clientWidth >= 900 ? 'l' : 'p', src = `${BASE}keys/${set}/k${k}.webp`;
    if (keyShown === src) return; keyShown = src;
    const im = new Image(); im.src = src;
    const swap = () => { if (keyShown !== src) return; kb.src = src; kb.style.opacity = 1; setTimeout(() => { if (keyShown === src) { ka.src = src; kb.style.opacity = 0; } }, 540); };
    (im.decode ? im.decode() : Promise.resolve()).then(swap, swap);
    steps.forEach((s, n) => { if (Math.abs(n - k) === 1) new Image().src = `${BASE}keys/${set}/k${n}.webp`; });
  }

  if (!gl) {
    explore.disabled = true;
    $$('[data-open]').forEach(b => { b.disabled = true; b.title = '3D недоступно в этом браузере'; });
    $('.d-bar', stage).insertAdjacentHTML('beforeend', '<p class="d-nogl mono">Нет WebGL 2: модель показана кадрами. Чертежи и ракурсы Влада работают.</p>');
    load.hidden = true;
  } else if (lite) {
    load.hidden = true;
    explore.querySelector('.l-long').textContent = 'Включить 3D-модель';
    explore.querySelector('.l-short').textContent = 'Включить 3D';
  }

  dataReady.then(d => { data = d; if (active) apply(active, true); }).catch(() => {});

  /* the viewer runs in its own document (srcdoc), its relative paths resolve against assets/dolina/review/ */
  function loadFrame() {
    if (loaded || !gl || lite || failed) return; loaded = true;
    load.hidden = false; load.textContent = 'Открываю модель…';
    const base = new URL(BASE + 'review/', location.href).href;
    fetch(base + 'index.html').then(r => { if (!r.ok) throw Error(r.status); return r.text(); })
      .then(html => {
        frame.srcdoc = html.replace('<meta charset="utf-8">', `<meta charset="utf-8"><base href="${base}">`);
        // if the viewer never answers (a strict browser or host policy), say so instead of waiting forever
        setTimeout(() => { if (!heard) fail('no answer from the viewer'); }, 25000);
      })
      .catch(e => fail(e.message || e));
  }
  addEventListener('message', e => {
    if (e.source !== frame.contentWindow || e.data?.app !== 'dolina-viewer') return;
    const d = e.data; heard = true;
    if (d.error || d.lost) { fail(d.error || 'context lost'); return; }
    if (d.progress != null) load.textContent = (d.model === 'before' ? 'Исходная квартира' : 'Модель «Долины»') + ' · ' + d.progress + '%';
    if (d.ready && !failed) { ready = true; load.hidden = true; stage.classList.add('is-live'); show(); if (pending) frame.contentWindow.postMessage(pending, '*'); }
    if (d.close) closeFull();
  });
  function send(cmd) {
    pending = {app: 'dolina-article', full, ...cmd};
    if (full) loadFrame();     // otherwise the model waits until the reader comes near the stage
    if (ready) frame.contentWindow.postMessage(pending, '*');
  }
  new IntersectionObserver(es => { if (es[0].isIntersecting) loadFrame(); }, {rootMargin: '900px 0px'}).observe(story);
  // the same check on scroll: an observer set up while the article is hidden can miss its first change
  const nearStage = () => { if (loaded || !story.offsetParent) return; const r = story.getBoundingClientRect(); if (r.top < innerHeight + 900 && r.bottom > -900) loadFrame(); };
  addEventListener('scroll', nearStage, {passive: true}); document.addEventListener('rec:view', () => setTimeout(nearStage, 0));

  const sheetOf = n => data?.drawings?.[n - 1];
  const viewOf = f => data?.views?.find(v => v.file === f);
  const cmdOf = s => { const c = {action: s.dataset.action}; if (s.dataset.issue != null) c.issue = +s.dataset.issue; return c; };

  function apply(s, force) {
    if (s === active && !force) return;
    active = s;
    steps.forEach(x => x.classList.toggle('is-active', x === s));
    const k = steps.indexOf(s); count.textContent = String(k + 1).padStart(2, '0'); rail.style.setProperty('--k', (k / (steps.length - 1)).toFixed(3));
    const sh = sheetOf(+s.dataset.sheet), v = s.dataset.view;
    if (sh) { const img = $('img', sheetBtn); if (!img.src.endsWith(sh.file)) img.src = BASE + sh.file; img.alt = `${sh.sheet} · ${sh.title}`; sheetBtn.dataset.zoom = BASE + sh.file; sheetBtn.dataset.title = `${sh.sheet} · ${sh.title}`; }
    const rb = modeBtns.find(b => b.dataset.mode === 'render');
    rb.disabled = !v; rb.title = v ? '' : 'Исходная квартира есть только на обмере и в проверочной модели';
    if (v) { const img = $('img', renderBtn), meta = viewOf(v), t = (meta?.title || 'Авторская визуализация') + ' · визуализация Владислава Изотова'; if (!img.src.endsWith(v)) img.src = BASE + v; img.alt = t; renderBtn.dataset.zoom = BASE + v; renderBtn.dataset.title = t; }
    back.textContent = s.dataset.mark || '';
    showKey(steps.indexOf(s));
    show();
    if (!full && !force) send(cmdOf(s));
  }
  function show() {
    const s = active; if (!s) return;
    let m = want; if (m === 'render' && !s.dataset.view) m = 'model';   // 'model' shows keyframes until the live viewer is ready
    stage.dataset.mode = m;
    modeBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    const sh = sheetOf(+s.dataset.sheet), meta = viewOf(s.dataset.view);
    caption.textContent = m === 'sheet' ? (sh ? `${sh.sheet} · ${sh.title}` : 'Лист альбома')
      : m === 'render' ? `${meta?.title || 'Ракурс'} · Владислав Изотов`
      : (s.dataset.action === 'before' ? 'Исходная квартира · стены по АИ-1, мебель — проверка DGC' : 'Проект Влада · модель «Долина»') + (ready ? '' : ' · кадры модели');
    explore.hidden = m !== 'model' || !gl;
  }
  modeBtns.forEach(b => b.addEventListener('click', () => { want = b.dataset.mode; show(); if (want === 'model') loadFrame(); }));

  // the active step is the one whose top has passed the reading line
  let raf = 0;
  function track() {
    raf = 0; if (full || !view.classList.contains('is-active')) return;
    // a step becomes active when its card has come into the window (cards sit at the bottom on narrow screens)
    const line = innerHeight * (matchMedia('(max-width: 899px)').matches ? .88 : .66);
    let pick = steps[0];
    for (const s of steps) if (s.firstElementChild.getBoundingClientRect().top < line) pick = s;
    apply(pick);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(track); };
  addEventListener('scroll', kick, {passive: true}); addEventListener('resize', kick);
  document.addEventListener('rec:view', () => { if (!view.classList.contains('is-active') && full) closeFull(true); kick(); });
  track();

  /* free view: the same stage fixed over the page; back to the same place and the same button */
  function openFull(cmd, from) {
    if (!gl || failed) return;
    lite = false;
    opener = from || document.activeElement; savedY = scrollY; full = true;
    stage.classList.add('is-full'); document.documentElement.classList.add('d-lock');
    stage.setAttribute('role', 'dialog'); stage.setAttribute('aria-modal', 'true'); stage.setAttribute('aria-label', 'Свободный просмотр модели «Долины»');
    close.hidden = false; frame.tabIndex = 0;
    if (!ready) load.hidden = false;
    send(cmd);
    close.focus({preventScroll: true});
  }
  function closeFull(silent) {
    if (!full) return; full = false;
    stage.classList.remove('is-full'); document.documentElement.classList.remove('d-lock');
    ['role', 'aria-modal', 'aria-label'].forEach(a => stage.removeAttribute(a));
    close.hidden = true; frame.tabIndex = -1;
    if (silent) return;
    scrollTo({top: savedY, behavior: 'instant'});
    if (active) send(cmdOf(active));
    opener?.focus({preventScroll: true});
  }
  explore.addEventListener('click', () => {
    if (lite) {
      lite = false; try { sessionStorage.setItem('dgc-3d', 'on'); } catch (e) {}
      explore.querySelector('.l-long').textContent = 'Свободный просмотр'; explore.querySelector('.l-short').textContent = 'Вращать';
      loadFrame(); if (active) send(cmdOf(active)); return;
    }
    if (active) openFull(cmdOf(active), explore);
  });
  close.addEventListener('click', () => closeFull());
  addEventListener('keydown', e => {
    if (!full) return;
    if (e.key === 'Escape') { e.preventDefault(); closeFull(); }
    if (e.key === 'Tab') { e.preventDefault(); (document.activeElement === close ? frame : close).focus(); }
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('#view-dolina [data-open]'); if (!b || b.disabled) return;
    const c = {action: b.dataset.open};
    if (b.dataset.issue != null) c.issue = +b.dataset.issue;
    if (b.dataset.stage != null) c.stage = +b.dataset.stage;
    if (b.dataset.row != null) c.row = +b.dataset.row;
    openFull(c, b);
  });
  return {openFull, gl};
}

/* ---------- 04: light and sockets ---------- */
function lightAndSockets(dataReady, stage) {
  const root = $('#d-elec'); if (!root) return;
  const PLACES = [
    {id: 'arch', label: 'У арки', frames: ['E06', 'E05'], view: 'views/kitchen-05.webp'},
    {id: 'bed', label: 'У кровати', frames: ['E02', 'E01', 'E04', 'E03'], view: 'views/kitchen-06.webp'},
    {id: 'desk', label: 'Стол и ТВ', frames: ['E08', 'E07'], view: 'views/kitchen-04.webp'},
    {id: 'entry', label: 'У входа', frames: ['E09', 'E10'], sheet: 6},
    {id: 'kitchen', label: 'Кухня', frames: ['E12', 'E13', 'E15', 'E14', 'E11', 'E17', 'E16'], view: 'views/kitchen-01.webp'},
    {id: 'bath', label: 'Санузел', frames: ['E19', 'E18'], view: 'views/bath-02.webp'}];
  const places = $('.d-elec-places', root), blocks = $('.d-elec-blocks', root), card = $('.d-elec-card', root);
  const figBtn = $('.d-elec-fig button', root), figImg = $('.d-elec-fig img', root), figCap = $('.d-elec-fig figcaption', root);
  dataReady.then(d => {
    const E = d.electrical, frames = new Map(E.frames.map(f => [f.id, f])), mech = E.mechanisms;
    $('#d-elec-series').textContent = `Серия ${E.series}. Рамки и механизмы — по каталогу производителя.`;
    let place = PLACES[0];
    PLACES.forEach(p => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = p.label; b.dataset.place = p.id;
      b.addEventListener('click', () => pick(p)); places.append(b);
    });
    function pick(p, frameId) {
      place = p;
      $$('button', places).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.place === p.id)));
      let src, title;
      if (p.view) { const v = d.views.find(x => x.file === p.view); src = BASE + p.view; title = (v?.title || 'Визуализация') + ' · Владислав Изотов'; }
      else { const s = d.drawings[p.sheet - 1]; src = BASE + s.file; title = `${s.sheet} · ${s.title}`; }
      if (!figImg.src.endsWith(src)) figImg.src = src;
      figImg.alt = title; figCap.textContent = p.view ? `Помещение на визуализации: ${title}` : `Лист ${title}`;
      figBtn.dataset.zoom = src; figBtn.dataset.title = title;
      blocks.replaceChildren(...p.frames.map(id => {
        const f = frames.get(id), b = document.createElement('button'); b.type = 'button'; b.dataset.frame = id;
        b.textContent = `${id} · ${f.xyz_mm[2]} мм`; b.setAttribute('aria-label', `Блок ${id}, ${f.context}, ${f.xyz_mm[2]} мм от пола`);
        b.addEventListener('click', () => show(id)); return b;
      }));
      show(frameId || p.frames[0]);
    }
    function show(id) {
      const f = frames.get(id);
      $$('button', blocks).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.frame === id)));
      const posts = f.positions.map(k => mech[k]);
      const sheets = f.sheet.replace('АИ-', '').split(',').map(x => x.trim()).filter(Boolean);
      const groups = f.groups.length ? `<div><dt>Группы света</dt><dd>${f.groups.join(', ')} по АИ-6</dd></div>` : '';
      card.innerHTML = `<h3><span class="num">${f.id}</span>${esc(f.context)}</h3>
        <div class="d-elec-draw">${face(f)}${elevation(f)}</div>
        <ul>${posts.map(m => `<li><span>${esc(m.label)}</span><span class="mono">арт. ${m.article}</span></li>`).join('')}</ul>
        <dl><div style="display:contents"><dt>Высота</dt><dd>${f.xyz_mm[2]} мм от чистого пола до центра блока</dd></div>
          <div style="display:contents"><dt>Рамка</dt><dd>${f.positions.length}-постовая${f.vertical ? ', вертикальная' : ''}, арт. ${f.frame_article}</dd></div>
          ${groups.replace('<div>', '<div style="display:contents">')}
          <div style="display:contents"><dt>Лист</dt><dd>${sheets.map(n => `<button type="button" class="link-btn" data-zoom="${BASE}drawings/AI-${String(n).padStart(2, '0')}.webp" data-title="${esc(d.drawings[+n - 1]?.sheet + ' · ' + d.drawings[+n - 1]?.title)}">АИ-${n} ↗</button>`).join(' ')}</dd></div></dl>
        ${f.note ? `<p class="note">${esc(f.note)}</p>` : ''}`;
    }
    pick(place);
  }).catch(e => { card.textContent = 'Данные электрики не загрузились: ' + (e.message || e); });
}
// the face of a frame: posts drawn as on the catalogue sheet, switch keys in oak
function face(f) {
  const n = f.positions.length, s = 64, pad = 8, w = f.vertical ? s + pad * 2 : n * s + pad * 2, h = f.vertical ? n * s + pad * 2 : s + pad * 2;
  const glyph = (k, x, y) => {
    const c = `cx="${x + s / 2}" cy="${y + s / 2}"`;
    if (k === 'power' || k === 'cover') return `<circle class="g" ${c} r="19"/><circle class="gf" cx="${x + s / 2 - 7}" cy="${y + s / 2}" r="2.6"/><circle class="gf" cx="${x + s / 2 + 7}" cy="${y + s / 2}" r="2.6"/>${k === 'cover' ? `<path class="g acc" d="M${x + 12} ${y + 14} h${s - 24}"/>` : `<path class="g" d="M${x + s / 2} ${y + 13} v5 M${x + s / 2} ${y + s - 13} v-5"/>`}`;
    if (k === 'net') return `<rect class="g" x="${x + 20}" y="${y + 22}" width="24" height="20"/><path class="g" d="M${x + 26} ${y + 22} v6 M${x + 32} ${y + 22} v6 M${x + 38} ${y + 22} v6"/>`;
    if (k === 'tv') return `<circle class="g" ${c} r="14"/><circle class="gf" ${c} r="3"/>`;
    if (k === 'one') return `<rect class="g acc" x="${x + 14}" y="${y + 12}" width="${s - 28}" height="${s - 24}"/>`;
    const keys = `<rect class="g acc" x="${x + 12}" y="${y + 12}" width="${(s - 26) / 2}" height="${s - 24}"/><rect class="g acc" x="${x + 14 + (s - 26) / 2}" y="${y + 12}" width="${(s - 26) / 2}" height="${s - 24}"/>`;
    return k === 'pass' ? keys + `<path class="g" d="M${x + s / 2 - 9} ${y + s - 7} h18 m-4 -3 l4 3 l-4 3"/>` : keys;
  };
  const posts = f.positions.map((k, i) => { const x = pad + (f.vertical ? 0 : i * s), y = pad + (f.vertical ? i * s : 0); return `<rect class="post" x="${x + 3}" y="${y + 3}" width="${s - 6}" height="${s - 6}"/>${glyph(k, x, y)}`; }).join('');
  return `<svg class="d-face" viewBox="0 0 ${w} ${h}" style="max-width:${Math.min(320, w * 1.2)}px" role="img" aria-label="Лицевая часть блока ${f.id}: ${f.positions.length} пост."><rect class="frame" x=".75" y=".75" width="${w - 1.5}" height="${h - 1.5}"/>${posts}</svg>`;
}
// height above the finished floor on a 0-2000 mm wall strip
function elevation(f) {
  const H = 2000, z = Math.min(H, f.xyz_mm[2]), y = 190 - z / H * 180;
  return `<svg class="d-elev" viewBox="0 0 96 200" role="img" aria-label="${f.xyz_mm[2]} мм от чистого пола"><rect class="wall" x="40" y="10" width="40" height="180"/><line x1="0" y1="190" x2="96" y2="190"/><path d="M24 190 V${y} M20 ${y} h8 M20 190 h8"/><rect class="blk" x="52" y="${y - 6}" width="16" height="12"/><text x="18" y="${Math.max(24, y - 8)}" text-anchor="end" transform="rotate(-90 18 ${Math.max(24, y - 8)})">${f.xyz_mm[2]}</text><text x="40" y="200">пол</text></svg>`;
}
const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

/* ---------- 05: staged cost, in whole kopecks ---------- */
function cost(dataReady, stage) {
  const root = $('#d-ledger'); if (!root) return;
  const fmt = new Intl.NumberFormat('ru-RU', {style: 'currency', currency: 'RUB', minimumFractionDigits: 0, maximumFractionDigits: 2});
  const rub = k => fmt.format(k / 100), kop = x => Math.round(x * 100);
  dataReady.then(d => {
    const est = d.estimate;
    // every row belongs to exactly one sheet of the estimate, so each is counted once
    const groups = d.stages.sections.map(g => ({...g, items: est.items.filter(i => i.sheet === g.source)}));
    groups.forEach(g => { g.kop = g.items.reduce((a, i) => a + kop(i.amount_rub), 0); });
    const all = groups.reduce((a, g) => a + g.kop, 0), total = kop(est.total_rub), rows = groups.reduce((a, g) => a + g.items.length, 0);
    const list = $('#d-stages'), out = $('#d-sum'), of = $('#d-sum-of'), bar = $('#d-sum-bar'), lab = $('#d-sum-label'), rowsEl = $('#d-rows'), rowsLab = $('#d-rows-label');
    const btn3d = $('[data-open="cost"]', root);
    list.replaceChildren(...groups.map((g, i) => {
      const li = document.createElement('li'), b = document.createElement('button'); b.type = 'button'; b.dataset.stageIndex = i;
      b.innerHTML = `<span class="num">${String(i + 1).padStart(2, '0')}</span><span>${esc(g.label)}</span><b>${rub(g.kop)}</b>`;
      b.addEventListener('click', () => select(i)); li.append(b); return li;
    }));
    function select(i) {
      const g = groups[i], sum = groups.slice(0, i + 1).reduce((a, x) => a + x.kop, 0);
      out.textContent = rub(sum); out.dataset.kop = sum;
      lab.textContent = i === 0 ? `Раздел 1 · ${g.label}` : `Разделы 1–${i + 1} · до «${g.label}» включительно`;
      of.textContent = `из ${rub(total)} по всем ${rows} строкам сметы` + (all !== total ? ` (сумма строк ${rub(all)})` : '');
      bar.style.width = (100 * sum / total).toFixed(2) + '%';
      $$('button', list).forEach((b, k) => { b.setAttribute('aria-pressed', String(k === i)); b.classList.toggle('is-sum', k <= i); });
      rowsLab.textContent = `${g.label} · ${g.items.length} ${g.items.length % 10 === 1 && g.items.length !== 11 ? 'строка' : g.items.length % 10 >= 2 && g.items.length % 10 <= 4 && (g.items.length < 10 || g.items.length > 20) ? 'строки' : 'строк'} · ${rub(g.kop)}`;
      btn3d.dataset.stage = i;
      rowsEl.replaceChildren(...g.items.map(a => {
        const li = document.createElement('li');
        const unit = a.unit_explicit ? ' ' + a.unit_explicit : '';
        li.innerHTML = `<span class="nm" title="${esc(a.name)}">${esc(a.name)}</span><span class="am">${rub(kop(a.amount_rub))}</span>
          <span class="meta"><span>${esc(a.room_label || 'Общие расходы')}</span><span>${String(a.quantity).replace('.', ',')}${esc(unit)} × ${rub(kop(a.unit_price_rub))}</span><span>строка ${a.row}</span>${a.skp_instance_ids.length && stage?.gl ? `<button type="button" class="link-btn" data-open="cost" data-stage="${i}" data-row="${a.row}">В модели ↗</button>` : ''}</span>`;
        return li;
      }));
    }
    select(0);
  }).catch(e => { $('#d-rows').textContent = 'Смета не загрузилась: ' + (e.message || e); });
}
