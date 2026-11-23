// DGC.Architects journal: views, navigation and REC chapter interactives.
// All text is already in the HTML; this script only adds behaviour.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const ROUTES = window.REC_ROUTES || {journal: 'Журнал'};

/* ---------- Views (#journal, #<article slug>) ---------- */
let current = null;
// Old link to the cover variant: same article.
const VARIANTS = {'rec-photo': {view: 'rec-vtoraya-zhizn-pyatietazhki'}};
function viewFor(hash) {
  const h = (hash || '').replace('#', '');
  if (VARIANTS[h]) return {view: VARIANTS[h].view};
  if (h && ROUTES[h]) return {view: h};
  if (h) { const el = document.getElementById(h); const art = el?.closest('.view-article'); if (art) return {view: art.dataset.view, anchor: h}; }
  return {view: 'journal'};
}
function show(view, {anchor = null, focus = false} = {}) {
  const changed = current !== view; current = view;
  $$('.view').forEach(v => v.classList.toggle('is-active', v.dataset.view === view));
  const inArticle = view !== 'journal';
  document.documentElement.dataset.view = view;
  $$('.toc[data-toc-for]').forEach(o => { o.hidden = inArticle ? o.dataset.tocFor !== view : o !== $('.toc[data-toc-for]'); });
  $('#chapter-now').hidden = !inArticle;
  $('[data-nav-journal]')?.setAttribute('aria-current', inArticle ? 'false' : 'page');
  document.title = inArticle ? `${ROUTES[view]} | Журнал DGC.Architects` : 'Журнал DGC.Architects';
  closePanels();
  if (anchor) requestAnimationFrame(() => scrollToId(anchor));
  else if (changed) window.scrollTo(0, 0);
  if (focus && changed) $('#main').focus({preventScroll: true});
  updateProgress();
  if (changed) document.dispatchEvent(new Event('rec:view'));
}
function scrollToId(id) {
  const el = document.getElementById(id); if (!el) return;
  el.scrollIntoView({behavior: reduced() ? 'auto' : 'smooth', block: 'start'});
  if (el.matches('li[id^="src-"]')) { el.classList.add('is-flash'); setTimeout(() => el.classList.remove('is-flash'), 1600); }
}
window.addEventListener('hashchange', () => { const r = viewFor(location.hash); show(r.view, {anchor: r.anchor, focus: true}); });

document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]'); if (!a) return;
  const id = a.getAttribute('href').slice(1); if (!id) return;
  if (ROUTES[id]) { if (location.hash === '#' + id) { e.preventDefault(); show(id); window.scrollTo(0, 0); } return; }
  const target = document.getElementById(id); if (!target) return;
  e.preventDefault();
  const art = target.closest('.view-article');
  if (art && current !== art.dataset.view) { history.pushState(null, '', '#' + art.dataset.view); show(art.dataset.view, {anchor: id}); }
  else scrollToId(id);
  if (target.matches('.chapter')) target.querySelector('.chapter-title')?.setAttribute('tabindex', '-1');
});

/* ---------- Header: menu, chapter indicator, TOC ---------- */
const menuBtn = $('#menu-btn'), nav = $('#site-nav'), chapBtn = $('#chapter-now'), toc = $('#toc-panel');
function closePanels() {
  nav.classList.remove('is-open'); menuBtn.setAttribute('aria-expanded', 'false');
  toc.hidden = true; chapBtn.setAttribute('aria-expanded', 'false');
}
menuBtn.addEventListener('click', () => { const open = !nav.classList.contains('is-open'); closePanels(); nav.classList.toggle('is-open', open); menuBtn.setAttribute('aria-expanded', String(open)); });
chapBtn.addEventListener('click', () => { const open = toc.hidden; closePanels(); toc.hidden = !open; chapBtn.setAttribute('aria-expanded', String(open)); if (open) $('.toc-item.is-active', toc)?.focus(); });
toc.addEventListener('click', e => { if (e.target.closest('a')) closePanels(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanels(); });
document.addEventListener('click', e => { if (!e.target.closest('.site-head')) closePanels(); });

const chapters = $$('[data-chapter]');
// Continuation blocks, scroll scenes and story groups belong to the numbered chapter before them.
const tracked = $$('.chapter, .scene, [data-chapter], .d-track'); let owner = null;
tracked.forEach(el => { if (el.matches('[data-chapter]')) owner = el; el._owner = owner; });
function setChapter(sec) {
  chapters.forEach(c => c.classList.toggle('is-current', c === sec));
  $('#chapter-now-no').textContent = sec.dataset.chapter;
  $('#chapter-now-title').textContent = sec.querySelector('.chapter-title').textContent;
  $$('.toc-item').forEach(a => { const on = a.dataset.toc === sec.id; a.classList.toggle('is-active', on); a.toggleAttribute('aria-current', on); });
}
const chapterObs = new IntersectionObserver(entries => {
  const vis = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
  const o = vis[0]?.target._owner; if (o) setChapter(o);
}, {rootMargin: '-30% 0px -60% 0px'});
tracked.forEach(c => chapterObs.observe(c));

// Reading progress: transform only, updated from a sentinel-free rAF on scroll.
const bar = $('#read-bar'); let ticking = false;
function updateProgress() {
  ticking = false; const art = $('.view-article.is-active');
  if (!art) { bar.style.width = '0'; return; }
  const r = art.getBoundingClientRect(), h = r.height - innerHeight;
  bar.style.width = Math.max(0, Math.min(1, -r.top / Math.max(1, h))) * 100 + '%';
  const firstCh = art.querySelector('.chapter');
  if (firstCh && firstCh.getBoundingClientRect().top > innerHeight * .4) setChapter(firstCh);
}
document.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(updateProgress); } }, {passive: true});

/* ---------- Generic tabs (timeline, programmes, cases) ---------- */
function tabs(root, tabSel) {
  const ts = $$(tabSel, root);
  const select = (t, focus) => {
    ts.forEach(x => { const on = x === t; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1; document.getElementById(x.getAttribute('aria-controls')).hidden = !on; });
    if (focus) t.focus();
  };
  ts.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', e => {
      const k = e.key, n = ts.length;
      const j = k === 'ArrowRight' || k === 'ArrowDown' ? (i + 1) % n : k === 'ArrowLeft' || k === 'ArrowUp' ? (i - 1 + n) % n : k === 'Home' ? 0 : k === 'End' ? n - 1 : -1;
      if (j >= 0) { e.preventDefault(); select(ts[j], true); }
    });
  });
  select(ts.find(t => t.getAttribute('aria-selected') === 'true') || ts[0]);
}
$$('[data-timeline]').forEach(r => tabs(r, '[role="tab"]'));
$$('[data-tabs]').forEach(r => tabs(r, '[role="tab"]'));
$$('[data-cases]').forEach(r => tabs(r, '[role="tab"]'));

// Shared hatch pattern for the case schemes.
document.body.insertAdjacentHTML('beforeend', '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><pattern id="sc-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#272723" fill-opacity=".04"/><line x1="0" y1="0" x2="0" y2="6" stroke="#272723" stroke-width="1" stroke-opacity=".45"/></pattern></defs></svg>');

/* ---------- Chapter 05: transformation 0-100 ---------- */
(function transform() {
  const root = $('[data-transform]'); if (!root) return;
  const range = $('#tr-range'), out = $('#tr-value'), title = $('#tr-stage-title'), text = $('#tr-stage-text'), play = $('#tr-play');
  const photo = $('#tr-photo'), cap = $('#tr-photo-cap');
  const L = n => $(`[data-layer="${n}"]`, root);
  const growAdd = $('[data-grow="add"]', root), growRoof = $('[data-grow="roof"]', root), tint = $('.tr-keep-tint', root), cab = $('.tr-cab', root), path = $('.tr-lift-path', root);
  const STAGES = [
    {to: 15, title: 'Существующий дом', text: 'Исходная пятиэтажка: наружные стены, перекрытия и фундаменты. Облик «до» восстановлен приближённо по фотографиям.', img: 'v7-before', cap: 'Исходный облик, приближённо по фотографиям (иллюстрация v7)'},
    {to: 30, title: 'Основа остаётся, проёмы меняются локально', text: 'Стены существующего дома сохраняются. Оконные проёмы увеличиваются локально; простенки и основная оболочка остаются на месте.', img: 'v7-before', cap: 'Исходный облик, приближённо по фотографиям (иллюстрация v7)'},
    {to: 60, title: 'Добавляются новые объёмы', text: 'Со стороны входа: обстройка и лифтовой портал. Со стороны двора: лестничный узел. Обстройка расширяет дом с двух сторон.', img: 'v7-after-front', cap: 'Главный фасад с порталами (иллюстрация v7)'},
    {to: 80, title: 'Лифт, связи и крыша', text: 'Лифт и лестницы доходят до общей крыши; под ней предусмотрен служебный технический уровень.', img: 'v7-roof', cap: 'Общая терраса на крыше (иллюстрация v7)'},
    {to: 100, title: 'Двор и итоговый фасад', text: 'Участок и парковка остаются. Обновляются подходы к дому, места отдыха и детская площадка.', img: 'v7-courtyard', cap: 'Двор и итоговый объём (иллюстрация v7)'}
  ];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const p01 = (v, a, b) => clamp((v - a) / (b - a), 0, 1);
  // Section drawing coordinates: ground floor slab y=1220, roof slab y=270 (sheet AR6).
  const H = 1365, groundY = 1278, topY = 60;
  let lastImg = '';
  function render(v) {
    range.value = v; range.style.setProperty('--p', v + '%'); out.value = Math.round(v) + '%';
    const s = STAGES.find(s => v <= s.to) || STAGES.at(-1);
    title.textContent = s.title; text.textContent = s.text;
    range.setAttribute('aria-valuetext', `${Math.round(v)}%: ${s.title}`);
    $$('.tr-stage-buttons button', root).forEach(b => {
      const at = +b.dataset.at, idx = STAGES.findIndex(x => at <= x.to);
      b.setAttribute('aria-pressed', String(STAGES[idx] === s));
    });
    // Retained shell and ground: always visible. Emphasis between 15 and 30.
    tint.style.opacity = v < 15 ? .35 : v <= 30 ? .35 + .65 * p01(v, 15, 22) : .55;
    L('openings').style.opacity = p01(v, 18, 28);
    // Added volumes grow from the ground up between 30 and 60.
    const a = p01(v, 30, 60); setGrow(growAdd, a); L('add').style.opacity = a > 0 ? 1 : 0;
    // Roof, technical level, lift between 60 and 80.
    const r = p01(v, 60, 76); setGrow(growRoof, r); L('roof').style.opacity = r > 0 ? 1 : 0;
    const lift = p01(v, 60, 80); L('lift').style.opacity = lift > 0 ? 1 : 0;
    cab.style.transform = `translateY(${-(1095 - 145) * lift}px)`; cab.style.transition = 'none';
    path.style.opacity = lift;
    // Yard and final facade.
    L('yard').style.opacity = p01(v, 80, 95);
    if (s.img !== lastImg && photo) {
      lastImg = s.img; photo.style.opacity = 0;
      const img = new Image(); img.src = `assets/img/${s.img}-900.webp`;
      img.decode?.().catch(() => {}).finally(() => { photo.src = img.src; photo.alt = s.cap; cap.textContent = s.cap; photo.style.opacity = 1; });
    }
  }
  function setGrow(rect, p) { const h = (groundY - topY) * p; rect.setAttribute('y', String(groundY - h)); rect.setAttribute('height', String(h + (H - groundY))); }
  let raf = 0, playing = false;
  function stop() { playing = false; cancelAnimationFrame(raf); play.setAttribute('aria-pressed', 'false'); play.setAttribute('aria-label', 'Воспроизвести схему'); }
  function go() {
    if (reduced()) { render(100); return; }
    playing = true; play.setAttribute('aria-pressed', 'true'); play.setAttribute('aria-label', 'Пауза');
    let v = +range.value >= 100 ? 0 : +range.value, t0 = performance.now() - v / 100 * 20000;
    const step = now => { if (!playing) return; v = Math.min(100, (now - t0) / 200); render(v); if (v >= 100) { stop(); return; } raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
  }
  play.addEventListener('click', () => playing ? stop() : go());
  range.addEventListener('input', () => { stop(); render(+range.value); });
  $$('.tr-stage-buttons button', root).forEach(b => b.addEventListener('click', () => { stop(); animateTo(+b.dataset.at); }));
  function animateTo(to) {
    if (reduced()) { render(to); return; }
    const from = +range.value, t0 = performance.now(), d = 600;
    const step = now => { const t = Math.min(1, (now - t0) / d), q = 1 - Math.pow(1 - t, 3); render(from + (to - from) * q); if (t < 1) raf = requestAnimationFrame(step); };
    cancelAnimationFrame(raf); raf = requestAnimationFrame(step);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  new IntersectionObserver(es => { if (!es[0].isIntersecting) stop(); }).observe(root);
  render(0);
})();

/* ---------- Chapter 06: hotspots ---------- */
(function hotspots() {
  const root = $('[data-hotspots]'); if (!root) return;
  const pins = $$('.hs-pin', root), items = $$('.hs-list li', root);
  function select(n, focusItem) {
    pins.forEach(p => p.setAttribute('aria-pressed', String(p.dataset.hs === n)));
    items.forEach(li => li.classList.toggle('is-active', li.dataset.hs === n));
    if (focusItem) document.getElementById('hs-' + n)?.scrollIntoView({block: 'nearest', behavior: reduced() ? 'auto' : 'smooth'});
  }
  pins.forEach(p => p.addEventListener('click', () => select(p.dataset.hs, matchMedia('(max-width: 1100px)').matches)));
  items.forEach(li => li.addEventListener('click', e => { if (!e.target.closest('button')) select(li.dataset.hs); }));
  root.querySelectorAll('[data-hs-3d]').forEach(b => b.addEventListener('click', async () => {
    const preset = JSON.parse(b.dataset.hs3d);
    document.getElementById('viewer').scrollIntoView({behavior: reduced() ? 'auto' : 'smooth', block: 'start'});
    const v = await viewer(); v?.applyPreset(preset);
  }));
  select('1');
})();

/* ---------- Chapter 06: 3D viewer (module loaded on demand) ---------- */
let viewerMod = null, modelsAvailable = null;
async function viewer() {
  if (!viewerMod) { viewerMod = await import('./viewer/app.js'); viewerMod.init(); }
  return viewerMod;
}
(async function checkModels() {
  try { const r = await fetch('models/manifest.json', {cache: 'no-cache'}); modelsAvailable = r.ok; const m = r.ok ? await r.json() : null;
    if (m) { const mb = Math.round(Object.values(m.files).reduce((a, f) => a + f.encoded, 0) / 1048576); $('#load-state').textContent = `Та же модель, что в главе 05: до ${mb} МБ данных, сначала дом и двор, затем интерьеры и детали фасада.`; }
    else { $('#load-state').textContent = 'Файлы 3D-модели в этой публикации не подключены. Показаны иллюстрации предыдущей версии.'; }
  } catch { modelsAvailable = false; }
  // Wire the viewer UI immediately so buttons work before loading (they trigger the load).
  const start = () => viewer();
  $('#viewer').addEventListener('pointerenter', start, {once: true});
  $('#viewer').addEventListener('focusin', start, {once: true});
  $('#start').addEventListener('click', async e => { if (!viewerMod) { e.stopImmediatePropagation(); const v = await viewer(); v.start(); } }, {capture: true});
})();

/* ---------- Chapter 07: plans ---------- */
(async function plans() {
  const root = $('[data-plans]'); if (!root) return;
  const img = $('#plan-img'), svg = $('#plan-svg'), tags = $('#plan-tags'), sel = $('#apt-select'), card = $('#apt-card'), cap = $('#plan-cap'), table = $('#ground-table'), stage = $('#plan-stage');
  let data, guide, plan = 'typical', base = 'pdf', active = null;
  try { [data, guide] = await Promise.all([fetch('assets/apartments.json').then(r => r.json()), fetch('assets/plan-guide.json').then(r => r.json())]); }
  catch { card.innerHTML = '<p class="small">Не удалось загрузить данные плана. Чертёж доступен в материалах проекта в конце статьи.</p>'; return; }
  const ratio = 469.6 / 1000;
  const TYPE = {'C': 'Однокомнатная квартира, тип «С»', '2E': 'Двухкомнатная квартира, тип «2Е»', '3E': 'Трёхкомнатная квартира, тип «3Е»'};
  const uses = {'Кухня': 'еда и общение', 'Столовая': 'общий стол', 'Спальное место': 'отдых', 'Хранение': 'хранение', 'Ванная': '', 'Санузел': ''};
  function inside(l, a) { const x = (l.x - 230) / 758, y = (l.y - 200) / 356; return a.rects.some(([rx, ry, rw, rh]) => x >= rx && x <= rx + rw && y >= ry && y <= ry + rh); }
  function draw() {
    const apts = data[plan];
    svg.innerHTML = apts.map((a, i) => `<g class="apt" data-i="${i}">${a.rects.map(([x, y, w, h]) => `<rect class="r" x="${x * 1000}" y="${y * 1000 * ratio}" width="${w * 1000}" height="${h * 1000 * ratio}"/>`).join('')}${a.rects.map(([x, y, w, h]) => `<rect class="apt-hit" x="${x * 1000}" y="${y * 1000 * ratio}" width="${w * 1000}" height="${h * 1000 * ratio}"/>`).join('')}</g>`).join('');
    svg.classList.toggle('no-apts', !$('[data-layer="apts"]', root).checked);
    sel.replaceChildren(new Option('Выберите квартиру', ''), ...apts.map((a, i) => new Option(a.text, String(i))));
    drawTags(); select(null);
    table.hidden = plan !== 'ground';
    img.src = base === 'pdf' ? `assets/img/pdf-${plan}.webp` : (plan === 'ground' ? 'assets/img/v7-plan1.webp' : 'assets/img/rec-plan2.webp');
    img.alt = base === 'pdf' ? (plan === 'ground' ? 'План первого этажа после реконструкции, лист АР4' : 'План типового этажа после реконструкции, лист АР5') : (plan === 'ground' ? 'Меблированный план первого этажа в модели предыдущей версии' : 'Горизонтальный разрез модели v10 на уровне второго этажа, рендер Blender');
    stage.classList.toggle('plan-model', base === 'model');
    cap.textContent = base === 'model' ? (plan === 'ground' ? 'Вид сверху на первый этаж в модели предыдущей версии (v7).' : 'Модель v10, разрез в Blender на 1,6 м выше пола второго этажа.') + ' Кадр не совмещён с чертежом, поэтому выделение квартир в этом режиме отключено.'
      : plan === 'ground' ? 'План первого этажа после реконструкции. Лист АР4, М 1:200. Цифры в кружках соответствуют экспликации.'
      : 'План типового этажа (2–5) после реконструкции. Лист АР5, М 1:200. Цветом выделены квартиры по типам.';
  }
  function drawTags() {
    const show = $('[data-layer="rooms"]', root).checked;
    tags.innerHTML = guide[plan].filter(l => l.kind === 'common' || (show && l.kind === 'room')).map(l => `<span class="plan-tag ${l.kind}" style="left:${(l.x - 230) / 758 * 100}%;top:${(l.y - 200) / 356 * 100}%">${l.text}</span>`).join('');
  }
  function select(i) {
    active = i; $$('.apt', svg).forEach(g => g.classList.toggle('is-sel', g.dataset.i === String(i)));
    sel.value = i === null ? '' : String(i);
    if (i === null) { card.innerHTML = '<p class="small">Выберите квартиру на плане или в списке, чтобы увидеть её тип, площадь и помещения.</p>'; return; }
    const a = data[plan][i], rooms = guide[plan].filter(l => l.kind === 'room' && inside(l, a)).map(l => l.text);
    const uniq = [...new Set(rooms)], id = a.text.split(' ')[0], area = a.text.split('·')[1].trim();
    const note = (id === 'Т05' || id === 'Т10') ? '<p class="apt-note">В модели здесь столовая вместо кровати, отмеченной на чертеже: последнее указание автора.</p>' : '';
    const scen = uniq.map(r => uses[r]).filter(Boolean);
    card.innerHTML = `<h3>${id}</h3><p class="apt-area">${TYPE[a.cls]}, ${area}. Проектная площадь после реконструкции по альбому.</p>${uniq.length ? `<p class="tool-label">Помещения по подписям плана</p><ul>${uniq.map(r => `<li>${r}</li>`).join('')}</ul>` : ''}${scen.length ? `<p class="apt-note">Сценарии: ${[...new Set(scen)].join(', ')}.</p>` : ''}${note}`;
  }
  svg.addEventListener('click', e => { const g = e.target.closest('.apt'); if (g) select(+g.dataset.i); });
  sel.addEventListener('change', () => select(sel.value === '' ? null : +sel.value));
  $$('[data-plan]', root).forEach(b => b.addEventListener('click', () => { plan = b.dataset.plan; $$('[data-plan]', root).forEach(x => x.setAttribute('aria-pressed', String(x === b))); draw(); }));
  $$('[data-base]', root).forEach(b => b.addEventListener('click', () => { base = b.dataset.base; $$('[data-base]', root).forEach(x => x.setAttribute('aria-pressed', String(x === b))); draw(); }));
  $('[data-layer="apts"]', root).addEventListener('change', e => svg.classList.toggle('no-apts', !e.target.checked));
  $('[data-layer="rooms"]', root).addEventListener('change', drawTags);
  draw(); select(4);
})();

/* ---------- Chapter 08: lift stops ---------- */
(function lift() {
  const root = $('[data-lift]'); if (!root) return;
  const cab = $('.lift-cab', root), note = $('#lift-note');
  // Floor slab tops on sheet AR6 (drawing coordinates): ground 1220, then 1055, 890, 725, 560; roof terrace 270.
  const Y = {'1': 1220, '2': 1055, '3': 890, '4': 725, '5': 560, 'roof': 270};
  const N = {'1': 'Первый этаж: вход, лобби и консьерж.', '2': 'Второй этаж: квартиры типового плана.', '3': 'Третий этаж: квартиры типового плана.', '4': 'Четвёртый этаж: квартиры типового плана.', '5': 'Пятый этаж: квартиры типового плана.', 'roof': 'Общая крыша: терраса, перголы и места отдыха. Технический уровень ниже обслуживается отдельно.'};
  $$('[data-stop]', root).forEach(b => b.addEventListener('click', () => {
    $$('[data-stop]', root).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    cab.style.transform = `translateY(${Y[b.dataset.stop] - 1220}px)`; note.textContent = N[b.dataset.stop];
  }));
})();

/* ---------- Chapter 09: yard routes ---------- */
(function routes() {
  const root = $('[data-routes]'); if (!root) return;
  const T = {
    walk: 'Пешком: от тротуара вдоль фасада к входам в порталы. Проход отделён от парковочных мест.',
    pram: 'С коляской: тот же путь к входу, где в лобби предусмотрена колясочная. Уклоны и пандусы нужно проверять по проекту; линия их не подтверждает.',
    car: 'Автомобиль: с улицы по проезду к парковке вдоль фасада. Отмечена контейнерная площадка у въезда.'
  };
  function set(r) {
    $$('[data-route]', root).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.route === r)));
    $$('.route', root).forEach(g => { g.classList.remove('is-on'); if (g.dataset.r === r) { void g.getBoundingClientRect(); g.classList.add('is-on'); } });
    $('#route-text').textContent = T[r];
  }
  $$('[data-route]', root).forEach(b => b.addEventListener('click', () => set(b.dataset.route)));
  set('walk');
})();

/* ---------- Lightbox for drawings and the board ---------- */
(function lightbox() {
  const dlg = $('#lightbox'), img = $('#lb-img'), title = $('#lb-title'), scroller = $('.lb-scroll');
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-zoom]'); if (!b) return;
    const inner = b.querySelector('img'); if (!b.dataset.zoom) return;
    const label = b.dataset.title || inner?.alt || b.textContent.replace('↗', '').trim();
    img.src = b.dataset.zoom; img.alt = label; title.textContent = label;
    scroller.classList.add('fit'); dlg.showModal();
  });
  img.addEventListener('click', () => scroller.classList.toggle('fit'));
  $('#lb-close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  document.addEventListener('click', e => {
    const v = e.target.closest('[data-video]'); if (!v) return;
    const video = $('.film video'); video.querySelector('source').src = v.dataset.video; video.load(); video.scrollIntoView({block: 'center'});
  });
})();

/* ---------- Chapter 05: the model story (loaded when the chapter approaches) ---------- */
(function story() {
  const el = $('#story'); if (!el) return;
  const io = new IntersectionObserver(async es => {
    if (!es[0].isIntersecting) return; io.disconnect();
    try { const m = await import('./viewer/story.js'); m.init(); await viewer(); }
    catch (e) { console.warn(e); const st = $('#story-load'); if (st) st.textContent = 'Модель не загрузилась в этом браузере: ' + (e && e.message || e); }
  }, {rootMargin: '2500px 0px'});
  io.observe(el);
})();

/* ---------- Chapter 06: Blender animation, plays only while visible ---------- */
(function parts() {
  const v = $('#parts-video'), b = $('#parts-play'); if (!v) return;
  const set = on => { b.setAttribute('aria-pressed', String(on)); b.textContent = on ? 'Пауза' : 'Воспроизвести'; };
  b.addEventListener('click', () => { if (v.paused) { v.play().catch(() => {}); set(true); } else { v.pause(); set(false); } });
  new IntersectionObserver(es => {
    if (es[0].isIntersecting && !reduced()) { v.play().then(() => set(true)).catch(() => {}); }
    else if (!es[0].isIntersecting) { v.pause(); set(false); }
  }, {threshold: .35}).observe(v);
})();

/* ---------- Reveal on entry (headings draw in like a line, figures rise) ---------- */
(function reveal() {
  if (reduced()) return;
  const els = $$('.chapter-head, .sheet .node, .parts, .facts, .strategies, .case-panels, .timeline, .fig, .interior-grid .fig, .tr-photo');
  els.forEach(el => el.classList.add('reveal'));
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), {rootMargin: '0px 0px -8% 0px'});
  els.forEach(el => io.observe(el));
})();

/* ---------- Cover fit: REC. emerges from behind the roofs; the dot and the subtitle stay clear ----------
   PROFILE = top of the building silhouette in rec-photo.webp (fraction of image height) per 1% of width.
   REC. keeps its CSS size and the picture is never cropped: we only choose how high it rises, so the roofs
   cut about a third into the letters, the dot stays at least 60% visible and the subtitle stays clear. Positions come from offset* (layout, not transforms),
   so the intro animation does not disturb the measurement. */
(function coverFit() {
  const PROFILE = [0.646, 0.408, 0.404, 0.404, 0.399, 0.39, 0.402, 0.402, 0.428, 0.43, 0.191, 0.189, 0.186, 0.184, 0.183, 0.183, 0.185, 0.19, 0.193, 0.198, 0.201, 0.205, 0.209, 0.213, 0.221, 0.225, 0.229, 0.232, 0.236, 0.235, 0.211, 0.208, 0.207, 0.205, 0.134, 0.132, 0.129, 0.126, 0.125, 0.121, 0.12, 0.12, 0.126, 0.132, 0.137, 0.143, 0.149, 0.154, 0.161, 0.173, 0.18, 0.184, 0.191, 0.193, 0.191, 0.19, 0.188, 0.159, 0.157, 0.156, 0.153, 0.151, 0.149, 0.148, 0.145, 0.144, 0.142, 0.143, 0.152, 0.049, 0.047, 0.045, 0.042, 0.04, 0.038, 0.035, 0.033, 0.031, 0.03, 0.034, 0.047, 0.062, 0.076, 0.09, 0.11, 0.125, 0.132, 0.13, 0.128, 0.127, 0.125, 0.124, 0.121, 0.119, 0.118, 0.118, 0.127, 0.145, 0.166, 0.185, 0.206];
  const DOT_ADV = .252, DOT_X0 = .03, DOT_X1 = .242, CAP = .726;   // Dela Gothic One, letter-spacing -.02em
  const pos = el => { let x = 0, y = 0; for (let e = el; e; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; } return {x, y}; };
  function fit() {
    const mark = document.querySelector('.hero-title .rec-mark'), probe = document.querySelector('.hero-title .rec-probe');
    const fig = document.getElementById('hero-fig'), img = document.getElementById('hero-img'), rest = document.querySelector('.hero-rest');
    if (!mark || !probe || !img || !mark.offsetWidth) return;
    fig.style.marginTop = '';
    if (innerWidth < 1024) { requestAnimationFrame(skyBand); }
    const iw = img.offsetWidth, ih = img.offsetHeight, ix = pos(img).x; if (!iw || !ih) return;
    const f = parseFloat(getComputedStyle(mark).fontSize), p = pos(probe), base = p.y;
    const dotL = p.x - DOT_ADV * f, d0 = dotL + DOT_X0 * f, d1 = dotL + DOT_X1 * f, m0 = pos(mark).x + .05 * f;
    const gap = Math.max(8, f * .04), cap = CAP * f, dotH = .213 * f;
    const r = pos(rest), rb = r.y + rest.offsetHeight, rw = rest.offsetWidth;
    // The whole picture, never cropped: only its height changes.
    const sil = (x0, x1) => { let m = Infinity; for (let x = x0; x <= x1; x += 3) { const u = (x - ix) / iw; if (u >= 0 && u <= 1) m = Math.min(m, PROFILE[Math.round(u * 100)] * ih); } return m; };
    const under = sil(m0, dotL); if (!isFinite(under)) return;
    let top = base - .36 * cap - under;                                  // roofs cut about a third into REC
    top = Math.max(top, base - .45 * cap - under);                       // letters stay readable
    const sd = sil(d0, d1); if (isFinite(sd)) top = Math.max(top, base + .01 * f - .4 * dotH - sd);   // the dot peeks out: at most 40% hidden
    const sr = sil(r.x, r.x + rw); if (isFinite(sr)) top = Math.max(top, rb + gap - sr);           // subtitle never touched
    fig.style.marginTop = (parseFloat(getComputedStyle(fig).marginTop) + top - pos(img).y).toFixed(1) + 'px';
    skyBand();
  }
  // sky behind the roofs and REC, the colour of the ground under the picture, fading back to paper
  function skyBand() {
    const hero = document.querySelector('.view.is-active .hero'), img = hero?.querySelector('#hero-img'); if (!img || !img.offsetHeight) return;
    const t = pos(img).y - pos(hero).y;
    hero.style.setProperty('--img-top', t.toFixed(0) + 'px');
    hero.style.setProperty('--img-bot', (t + img.offsetHeight).toFixed(0) + 'px');
    hero.style.setProperty('--roof', (img.offsetHeight * .2).toFixed(0) + 'px');
  }
  let t = 0; const later = () => { clearTimeout(t); t = setTimeout(fit, 60); };
  addEventListener('resize', later); document.addEventListener('rec:view', later);
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(fit); fit();
  document.getElementById('hero-img')?.addEventListener('load', fit);
})();

/* ---------- Running words: a fixed layer UNDER the article ----------
   Plain text leaves it visible; pictures, scenes and wide blocks pass over it, so the words dive under the
   images and come back out. Several tracks run in opposite directions at different speeds:
   wide screens: grey in the left margin, burgundy in the right one (when there is room);
   narrow screens: three pale tracks behind the text - one bleeding off the left edge, one in the middle,
   one closer to the right. */
(function edges() {
  const root = document.getElementById('edges'); if (!root) return;
  const T = [...root.querySelectorAll('.mq')];
  const REC_TEXT = [
    'СОХРАНИТЬ · ПРИСТРОИТЬ · <em>REC.</em> · ОБНОВИТЬ · ',
    'КОНДРАТЮКА 10 · ВТОРАЯ ЖИЗНЬ · 1-510 · ',
    'ПОРТАЛ · ЛИФТ · КРЫША · ДВОР · '];
  let wordsFor = null;   // each article may bring its own words (data-edges, built from journal.json)
  function words(art) {
    if (wordsFor === art) return; wordsFor = art;
    let text = REC_TEXT; try { const own = JSON.parse(art.dataset.edges || 'null'); if (own?.length === 3) text = own; } catch {}
    T.forEach((t, i) => { t.innerHTML = text[i].repeat(14); t.drift = i * 300; });
  }
  let lastY = scrollY, raf = 0, geo = {};
  const place = (t, x, size) => { t.hidden = !size; if (size) { t.style.left = x + 'px'; t.style.fontSize = size + 'px'; } };
  function geometry(art) {
    if (geo.w === innerWidth && geo.art === art) return true;
    const body = art.querySelector('.chapter-body'); if (!body) return false;
    let right = 0; art.querySelectorAll('.chapter-body > p, .chapter-body > .lead').forEach(p => { if (p.offsetWidth) right = Math.max(right, p.getBoundingClientRect().right); });
    const W = innerWidth, L = body.getBoundingClientRect().left - 20, R = W - right - 28, narrow = L < 110;
    geo = {w: W, art}; root.classList.toggle('narrow', narrow);
    if (narrow) {
      place(T[0], W * .03, Math.min(W * .34, 230));
      place(T[1], W * .47, Math.min(W * .2, 140));
      place(T[2], W * .8, Math.min(W * .26, 180));
    } else {
      place(T[0], L / 2, Math.min(150, Math.max(60, L * .6)));
      place(T[1], 0, 0);
      place(T[2], W - R / 2 - 6, R >= 130 ? Math.min(140, R * .5) : 0);
    }
    return true;
  }
  function update() {
    raf = 0;
    const art = document.querySelector('.view-article.is-active');
    if (!art || !geometry(art)) { root.classList.remove('on'); return; }
    words(art);
    const hero = art.querySelector('.hero, .d-cover'), end = art.querySelector('.art-end');
    root.classList.toggle('on', hero.getBoundingClientRect().bottom < innerHeight * .6 && (!end || end.getBoundingClientRect().top > innerHeight * .3));
    const dy = scrollY - lastY; lastY = scrollY;
    if (reduced()) return;
    for (const t of T) {
      if (t.hidden) continue;
      t.drift += dy * +t.dataset.speed;
      const h = t.scrollHeight / 2 || 1, m = ((t.drift % h) + h) % h;
      // dir 1: moves up as you read; dir -1: moves down
      t.style.transform = `translateX(-50%) translateY(${t.dataset.dir === '1' ? -m : m - h}px)`;
    }
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(update); };
  addEventListener('scroll', kick, {passive: true}); addEventListener('resize', kick); document.addEventListener('rec:view', kick);
  // a slow drift so the words breathe even when the reader stops
  setInterval(() => { if (root.classList.contains('on') && !reduced() && !document.hidden) { T.forEach(t => t.drift += .45 * t.dataset.speed); kick(); } }, 40);
  update();
})();

/* ---------- Scroll scenes: pinned images that play like a film as you scroll ----------
   Each [data-scene] gets --p (0..1 through its pinned length) and named eased phases from
   data-phases="name:start,end,ease;…" (ease: out | io | lin), e.g. --wipe, --open. Pins with
   data-at switch on at that progress. The hero gets --hp for a light parallax. */
(function scenes() {
  const S = $$('[data-scene]'), hero = document.querySelector('[data-parallax]');
  const E = {out: x => 1 - Math.pow(1 - x, 3), io: x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2, lin: x => x};
  const cfg = S.map(s => ({el: s, pins: [...s.querySelectorAll('[data-at]')], ph: (s.dataset.phases || '').split(';').filter(Boolean).map(t => { const [n, r] = t.split(':'); const [a, b, e] = r.split(','); return {n, a: +a, b: +b, e: E[e] || E.out}; })}));
  const clamp = x => Math.max(0, Math.min(1, x));
  let raf = 0;
  function update() {
    raf = 0; const rm = reduced(), vh = innerHeight, top = (document.querySelector('.site-head')?.offsetHeight || 0);
    for (const c of cfg) {
      const r = c.el.getBoundingClientRect(); if (!r.height) continue;
      const p = rm ? 1 : clamp((top - r.top) / Math.max(1, r.height - (vh - top)));
      c.el.style.setProperty('--p', p.toFixed(4));
      for (const f of c.ph) c.el.style.setProperty('--' + f.n, f.e(clamp((p - f.a) / (f.b - f.a))).toFixed(4));
      for (const pin of c.pins) pin.classList.toggle('on', p >= +pin.dataset.at);
    }
    if (hero && !rm) { const r = hero.getBoundingClientRect(); hero.style.setProperty('--hp', clamp(-r.top / (r.height + vh)).toFixed(4)); }
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(update); };
  addEventListener('scroll', kick, {passive: true}); addEventListener('resize', kick); document.addEventListener('rec:view', kick);
  update(); setTimeout(update, 400);
})();

/* ---------- No zoom, external links ----------
   iOS Safari ignores user-scalable=no, so pinch and double-tap zoom are blocked here too.
   The 3D canvas uses pointer events (touch-action: none) and keeps its own pinch-to-zoom. */
(function noZoom() {
  const stop = e => e.preventDefault();
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, stop, {passive: false}));
  document.addEventListener('touchmove', e => { if (e.touches.length > 1 && !e.target.closest('canvas')) e.preventDefault(); }, {passive: false});
  let last = 0;
  document.addEventListener('touchend', e => { const now = Date.now(); if (now - last < 300 && !e.target.closest('a, button, input, select, canvas, [role="tab"]')) e.preventDefault(); last = now; }, {passive: false});
  // links to other sites open in a new tab (the journal may live inside an iframe on Tilda)
  document.querySelectorAll('a[href^="http"]').forEach(a => { if (a.host !== location.host) { a.target = '_blank'; a.rel = 'noopener'; } });
})();

/* ---------- Boot ---------- */
const first = viewFor(location.hash);
show(first.view, {anchor: first.anchor});
