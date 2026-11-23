// REC v10 model viewer, ported from the existing project (app.js v10).
// Geometry, visibility rules, section caps, stages and comparison are the v10 modules unchanged;
// this file adapts loading (on demand, two phases), the journal UI and mobile behaviour.
import {SectionCaps} from './section-caps.js';
import {meshVisible, clippingFor, LEVELS, ROOF_LEVEL, TECH_LEVEL} from './model-visibility.js';
import * as THREE from './vendor/three.module.js';
import {RoomEnvironment} from './vendor/RoomEnvironment.js';
import {OrbitControls} from './vendor/OrbitControls.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {MeshoptDecoder} from './vendor/meshopt_decoder.module.js';

const $ = id => document.getElementById(id), meshes = [], roots = {};
const levels = [...LEVELS, ROOF_LEVEL, TECH_LEVEL];
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const representation = name => ['retained-shell','transition-before','bearing-walls'].includes(name) ? 'transition' : name.startsWith('exterior') || ['rear-base','entries','lifts','portal-details'].includes(name) ? 'exterior' : name === 'technical' ? 'technical' : name === 'rooftop' ? 'roof' : ['structure','interiors','doors','glassblocks','common','apartment-fitout','interior-additions'].includes(name) ? 'interior' : 'context';

let manifest = null, sectionCaps, renderer, scene, camera, controls, pdfOverlay, guideData, comparison;
let driver = 'explore', storyHook = null, onLoadedCbs = [], groupsLoaded = new Set();
export const GROUPS = {story: ['exterior','retained-shell','bearing-walls','transition-before','portal-details','lifts','entries','rear-base','rooftop','technical','courtyard','structure','before'], life: ['interiors','doors','glassblocks','common','apartment-fitout'], details: ['exterior-details']};
let loading = false, loaded = false, fallback = false, flip = 1, transition = null, state = 'after', selectedView = 'perspective', mode = 'house';
let inView = true, running = false, pendingPreset = null, busy = false;
const target = new THREE.Vector3(0, 8, 0);
let focusPoints = {};

const gx = [235.082626,319.997986,355.612518,472.913147,590.182678,625.800049,743.095032,860.245422,895.865601,981.075256], mx = [-26.4,-20.4,-18,-9.6,-1.2,1.2,9.6,18,20.4,26.4], gy = [272.403931,356.264496,441.408844], mz = [-7.55,-1.55,4.45];
function mapAxis(v, a, b) { let i = 0; while (i < a.length - 2 && v > a[i + 1]) i++; return b[i] + (v - a[i]) * (b[i + 1] - b[i]) / (a[i + 1] - a[i]); }

function floorNo() { return Number($('floor').value); }
function isSection() { return $('section-mode').value !== 'none'; }
function label() {
  return state === 'before' ? 'До: приближённый облик по фотографиям'
    : floorNo() === 7 ? 'Технический уровень: инженерное пространство'
    : floorNo() === 6 ? 'Крыша: концепция общей террасы'
    : floorNo() ? `${floorNo()} этаж: ${floorNo() === 1 ? 'квартиры и общие помещения' : 'жилой план'}`
    : isSection() ? 'Разрез: единая модель фасада и интерьеров' : 'После: фасады SketchUp, интерьеры по PDF';
}
function populateFocus() {
  const el = $('focus'); el.replaceChildren(new Option('Весь этаж', 'all')); focusPoints = {};
  const f = floorNo(); if (!guideData || !f || f >= 6) return;
  for (const [i, l] of guideData[f === 1 ? 'ground' : 'typical'].filter(l => l.kind === 'apartment').entries()) {
    const id = 'apt_' + i; focusPoints[id] = [mapAxis(l.x, gx, mx), mapAxis(l.y, gy, mz)]; el.add(new Option(l.text.replace('{f}', f), id));
  }
}
// Illustrations of the previous version when WebGL is unavailable.
function showFallback() {
  const f = floorNo(), img = $('cover-img');
  let key = 'after-front';
  if ($('plan-overlay').checked && f && f < 6) { img.src = 'assets/img/pdf-' + (f === 1 ? 'ground' : 'typical') + '.webp'; img.srcset = ''; $('view-label').textContent = 'Исходный PDF: ' + f + ' этаж'; return; }
  if (state === 'before') key = 'before'; else if (f === 6 || f === 7) key = 'roof'; else if (f) key = 'plan' + (f === 1 ? '1' : '2'); else if (selectedView === 'back') key = 'courtyard'; else if (selectedView === 'top' || selectedView === 'perspective') key = 'after';
  img.srcset = `assets/img/v7-${key}-900.webp 900w, assets/img/v7-${key}.webp 1800w`; img.src = `assets/img/v7-${key}.webp`; img.alt = label();
  $('view-label').textContent = label() + ' (иллюстрация v7)';
}
function resize() {
  if (!renderer) return; const r = hostOf().getBoundingClientRect(); if (!r.width || !r.height) return;
  renderer.setSize(r.width, r.height); camera.aspect = r.width / r.height;
  const h = Math.max(camera.userData.span || 60, (camera.userData.minWidth || 100) / camera.aspect);
  camera.left = -h * camera.aspect / 2; camera.right = h * camera.aspect / 2; camera.top = h / 2; camera.bottom = -h / 2;
  camera.updateProjectionMatrix(); document.dispatchEvent(new CustomEvent('rec:resize', {detail: r})); kick();
}
function setView(name, animate = true) {
  selectedView = name; document.querySelectorAll('[data-cam]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cam === name)));
  if (fallback) { showFallback(); return; } if (!camera) return;
  const f = floorNo(), fp = focusPoints[$('focus').value], focused = f && fp;
  target.set(focused ? fp[0] : 0, f ? levels[f] + .5 : 7, focused ? fp[1] : -1);
  const dist = focused ? 13 : f ? 58 : 82;
  const offsets = {perspective: [.72, .55, .88], front: [0, .04, 1.15], back: [-.5, .42, -1], top: [0, 1.25, .001]};
  camera.userData.span = focused ? 12 : f ? 43 : 64; camera.userData.minWidth = focused ? 14 : f ? 60 : 100; camera.zoom = 1; resize();
  const dest = new THREE.Vector3(...offsets[name]).multiplyScalar(dist).add(target);
  if (camera.aspect < .9 && !focused) dest.sub(target).multiplyScalar(1.5).add(target);
  controls.autoRotate = false; $('rotate').setAttribute('aria-pressed', 'false');
  if (animate && !reduced()) transition = {from: camera.position.clone(), to: dest, oldTarget: controls.target.clone(), toTarget: target.clone(), start: performance.now()};
  else { camera.position.copy(dest); controls.target.copy(target); controls.update(); }
  kick();
}
function applyVisibility() {
  const c = {state, floor: floorNo(), mode: $('section-mode').value, roof: $('roof').checked, yard: $('yard').checked, glass: $('glass').checked, slabs: $('slabs').checked, stairs: $('stairs').checked, furniture: $('furniture').checked};
  for (const o of meshes) o.visible = meshVisible(o.userData, c);
  kick();
}
function applySlice() {
  $('view-label').textContent = label(); if (fallback) { showFallback(); return; }
  const f = floorNo(), sm = $('section-mode').value, value = +$('slice').value / 100;
  $('slice-controls').hidden = sm === 'none' || state === 'before'; $('slice-value').value = Math.round(value * 100) + '%';
  $('slice').style.setProperty('--p', Math.round(value * 100) + '%'); $('slice-tick').style.left = Math.round(value * 100) + '%';
  if (!meshes.length) return;
  busy = true; $('view-label').textContent = 'Обновляем модель…';
  const c = {state, floor: f, mode: sm, slice: +$('slice').value, flip};
  for (const o of meshes) {
    const p = clippingFor(o.userData, c).map(v => new THREE.Plane(new THREE.Vector3(...v.slice(0, 3)), v[3]));
    o.material.clippingPlanes = p; o.material.clipShadows = true; o.material.side = o.userData.originalSide; o.material.shadowSide = THREE.FrontSide; o.material.needsUpdate = true;
    const sectioned = p.length > 0; o.castShadow = !sectioned && o.userData.castShadowBase; o.receiveShadow = !sectioned;
  }
  sectionCaps?.update(); setTimeout(kick, 60);
}
function syncModeUI() {
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  $('grp-floor').hidden = mode !== 'floor'; $('grp-section').hidden = mode !== 'section';
}
function updateState() {
  const old = state === 'before';
  document.querySelectorAll('[data-state]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.state === state)));
  $('state-note').textContent = old ? 'Облик по фотографиям Кондратюка, 10, приближённо' : 'Единый фасад во всех режимах, планировки по PDF';
  for (const id of ['floor','focus','section-mode','furniture','glass','slabs','stairs','yard','roof','labels','plan-overlay']) $(id).disabled = old || (fallback && ['furniture','glass','slabs','stairs','yard','roof','focus','section-mode','labels'].includes(id));
  document.querySelectorAll('[data-mode]').forEach(b => b.disabled = old && b.dataset.mode !== 'house');
  syncModeUI(); applyVisibility(); applySlice(); updatePDF();
}
function setMode(m) {
  mode = m;
  if (m === 'house') { $('floor').value = '0'; $('section-mode').value = 'none'; populateFocus(); }
  if (m === 'floor') { if (!floorNo()) $('floor').value = '2'; $('section-mode').value = 'none'; populateFocus(); }
  if (m === 'section') { $('floor').value = '0'; populateFocus(); if (!isSection()) { $('section-mode').value = 'x'; $('slice').value = 50; } flip = 1; }
  syncModeUI(); applyVisibility(); applySlice(); updatePDF();
  setView(m === 'floor' ? 'top' : 'perspective');
}

// Rendering only while the viewer is on screen and something changes.
let idleFrames = 0;
function kick() { idleFrames = 0; if (!running && renderer && inView && !document.hidden) { running = true; requestAnimationFrame(loop); } }
function loop(now) {
  if (!renderer) { running = false; return; }
  if (transition) { const t = Math.min((now - transition.start) / 850, 1), q = 1 - Math.pow(1 - t, 3); camera.position.lerpVectors(transition.from, transition.to, q); controls.target.lerpVectors(transition.oldTarget, transition.toTarget, q); if (t === 1) transition = null; idleFrames = 0; }
  if (driver === 'story' && storyHook) { if (storyHook(now)) idleFrames = 0; if (busy) busy = false; if (++idleFrames > 90 || !inView || document.hidden) { running = false; return; } requestAnimationFrame(loop); return; }
  const moved = controls.update(); if (moved || controls.autoRotate) idleFrames = 0;
  updateLabels(); renderer.render(scene, camera);
  if (busy) { busy = false; setTimeout(() => { if (!busy) $('view-label').textContent = label(); }, 120); }
  if (++idleFrames > 90 || !inView || document.hidden) { running = false; return; }
  requestAnimationFrame(loop);
}

function setProgress(text) { $('load-state').textContent = text; }
function prepareMeshes(name, gltf) {
  roots[name] = gltf.scene; scene.add(gltf.scene);
  gltf.scene.traverse(o => {
    if (!o.isMesh) return; const cat = o.userData.category || o.name.split('_')[0];
    o.userData.category = (name === 'rooftop' && o.material.transparent) ? 'roof_glass' : cat; o.userData.asset = name; o.userData.representation = representation(name);
    o.castShadow = !cat.includes('glass'); o.userData.castShadowBase = o.castShadow; o.receiveShadow = true; o.userData.stage = name === 'before' ? 'before' : 'after';
    o.material = o.material.clone(); o.userData.originalSide = o.material.side;
    if (o.material.transparent) { o.material.depthWrite = false; o.material.forceSinglePass = true; }
    if (o.material.map) o.material.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    meshes.push(o);
  });
}


// The artifact host does not serve .glb, so each model is stored as base64 text parts.
// They are decoded here back to the original GLB bytes (length checked against the manifest).
async function readText(url, onBytes) {
  const r = await fetch(url); if (!r.ok) throw new Error('model-fetch ' + r.status);
  if (!r.body || !onBytes) return r.text();
  const reader = r.body.getReader(), parts = []; let n = 0;
  for (;;) { const {done, value} = await reader.read(); if (done) break; parts.push(value); n += value.length; onBytes(n); }
  return new TextDecoder().decode(await new Blob(parts).arrayBuffer());
}
function decodeInto(out, offset, b64) {
  if (Uint8Array.fromBase64) { const u = Uint8Array.fromBase64(b64); out.set(u, offset); return u.length; }
  const bin = atob(b64), len = bin.length; for (let i = 0; i < len; i++) out[offset + i] = bin.charCodeAt(i); return len;
}
async function fetchModel(info, onBytes) {
  const seen = info.chunks.map(() => 0);
  const texts = await Promise.all(info.chunks.map((c, i) => readText('models/' + c, onBytes && (n => { seen[i] = n; onBytes(seen.reduce((a, b) => a + b, 0)); }))));
  const out = new Uint8Array(info.bytes); let off = 0;
  for (const t of texts) off += decodeInto(out, off, t.trim());
  if (off !== info.bytes) throw new Error('model-size ' + info.file);
  return out.buffer;
}

// ---------- Shared core: one renderer, one scene, models loaded in groups ----------
let rendererReady = null, loadPromises = {};
const hostOf = () => renderer?.domElement.parentElement || $('canvas');
async function ensureRenderer() {
  if (rendererReady) return rendererReady;
  rendererReady = (async () => {
    if (!manifest) manifest = await fetch('models/manifest.json').then(r => { if (!r.ok) throw new Error('no-models'); return r.json(); });
    const canvas = document.createElement('canvas');
    if (!(canvas.getContext('webgl2') || canvas.getContext('webgl'))) throw new Error('no-webgl');
    renderer = new THREE.WebGLRenderer({antialias: true, powerPreference: 'high-performance', canvas});
    // iPhone may drop the 3D context under memory pressure: the story goes back to its frames
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); document.dispatchEvent(new Event('rec:gl-lost')); });
    renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2)); renderer.setClearColor(0xe7e6e1, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.03;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.localClippingEnabled = true;
    $('canvas').appendChild(renderer.domElement);
    scene = new THREE.Scene(); camera = new THREE.OrthographicCamera(-40, 40, 30, -30, .35, 250); camera.userData.span = 60;
    controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = .07; controls.minDistance = 3; controls.maxDistance = 200; controls.minZoom = .5; controls.maxZoom = 12; controls.maxPolarAngle = Math.PI * .94; controls.autoRotateSpeed = .45;
    controls.addEventListener('start', () => { transition = null; kick(); }); controls.addEventListener('change', kick);
    const pmrem = new THREE.PMREMGenerator(renderer), env = new RoomEnvironment(); scene.environment = pmrem.fromScene(env, .08).texture; scene.environmentIntensity = .32; env.dispose(); pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xfff7e9, 0x8c8c7d, 1.65));
    const sun = new THREE.DirectionalLight(0xfff0d8, 3.1); sun.position.set(-25, 55, 40); sun.castShadow = true; sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
    Object.assign(sun.shadow.camera, {left: -60, right: 60, top: 52, bottom: -52, near: 1, far: 150}); sun.shadow.bias = -.00015; sun.shadow.normalBias = .025; sun.shadow.camera.updateProjectionMatrix(); scene.add(sun);
    const fill = new THREE.DirectionalLight(0xcfdff3, .75); fill.position.set(35, 20, -30); scene.add(fill);
    await MeshoptDecoder.ready; if (!MeshoptDecoder.supported) throw new Error('no-meshopt');
    sectionCaps = new SectionCaps(scene, meshes);
    new IntersectionObserver(es => { inView = es.some(e => e.isIntersecting); if (inView) kick(); }, {rootMargin: '200px'}).observe(document.getElementById('art-body') || document.body);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
    new ResizeObserver(resize).observe($('canvas')); resize();
  })();
  return rendererReady;
}
export function loadGroup(group, onBytes) {
  if (loadPromises[group]) return loadPromises[group];
  loadPromises[group] = (async () => {
    await ensureRenderer();
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    const names = GROUPS[group].filter(n => manifest.files[n]), got = {};
    const total = names.reduce((a, n) => a + manifest.files[n].encoded, 0);
    await Promise.all(names.map(async name => {
      const buf = await fetchModel(manifest.files[name], onBytes && (n => { got[name] = n; onBytes(Object.values(got).reduce((a, b) => a + b, 0), total); }));
      prepareMeshes(name, await loader.parseAsync(buf, 'models/'));
    }));
    groupsLoaded.add(group);
    window.recModelStatus = {version: 10, meshCount: meshes.length, groups: [...groupsLoaded]};
    document.dispatchEvent(new CustomEvent('rec:group', {detail: group}));
  })();
  return loadPromises[group];
}
export function loadAll(onBytes) { return loadGroup('story', onBytes).then(() => loadGroup('life')).then(() => loadGroup('details')); }
export function core() { return {THREE, renderer, scene, meshes, caps: sectionCaps, controls, kick, LEVELS, ROOF_LEVEL, TECH_LEVEL}; }
export function setStoryHook(fn) { storyHook = fn; }
export function attach(host, mode) {
  if (!renderer) return;
  if (renderer.domElement.parentElement !== host) host.appendChild(renderer.domElement);
  document.dispatchEvent(new CustomEvent('rec:attach', {detail: mode}));
  driver = mode; controls.enabled = mode === 'explore' && !(coarse && $('touch-lock') && !$('touch-lock').hidden);
  if (mode === 'explore' && loaded) { updateState(); setView(selectedView, false); }
  resize(); kick();
}
export const driverMode = () => driver;

export async function start() {
  if (loading || loaded || fallback) return; loading = true;
  const btn = $('start'); btn.disabled = true; btn.textContent = 'Загрузка модели…';
  try {
    await ensureRenderer();
    attach($('canvas'), 'explore');
    const mb = b => (b / 1048576).toFixed(0);
    await loadGroup('story', (n, total) => setProgress(`Загружено ${mb(n)} из ${mb(total)} МБ: дом и двор`));
    guideData = await fetch('assets/plan-guide.json').then(r => r.json()); populateFocus(); await setupPDF();
    loaded = true; loading = false; $('cover').hidden = true; $('hint').textContent = coarse ? 'Один палец: вращение. Два: масштаб и сдвиг.' : 'Мышь: вращение, колесо: масштаб, правая кнопка: сдвиг.';
    attach($('canvas'), 'explore');
    new IntersectionObserver(es => { if (es[0].isIntersecting && driverMode() !== 'explore') attach($('canvas'), 'explore'); }, {threshold: .25}).observe($('canvas-wrap'));
    if (coarse) touchLock(true);
    if (pendingPreset) { applyPreset(pendingPreset); pendingPreset = null; }
    const note = document.createElement('span'); note.className = 'small'; note.id = 'late-note'; note.textContent = ' Интерьеры и детали фасада догружаются…'; $('viewer-sub').append(note);
    await loadGroup('life'); if (driver === 'explore') { applyVisibility(); applySlice(); }
    await loadGroup('details'); note.remove(); if (driver === 'explore') { applyVisibility(); applySlice(); }
  } catch (e) {
    console.error(e); loading = false; loaded = false;
    const noWebGL = e.message === 'no-webgl';
    if (e.message === 'no-models') { setProgress('Файлы модели не найдены в этой публикации. Показаны иллюстрации.'); btn.hidden = true; fallback = true; }
    else if (noWebGL || e.message === 'no-meshopt') {
      fallback = true; btn.hidden = true;
      setProgress(noWebGL ? 'Этот браузер не поддерживает WebGL. Показаны иллюстрации; статья полностью читается и без 3D.' : 'Браузер не смог распаковать модель. Показаны иллюстрации.');
    } else { btn.disabled = false; btn.textContent = 'Повторить загрузку'; setProgress('Не удалось загрузить модель. Проверьте соединение и попробуйте ещё раз.'); }
    if (fallback) { $('hint').textContent = 'Иллюстрации предыдущей версии. Выберите состояние и этаж.'; ['rotate', 'flip'].forEach(id => $(id).disabled = true); updateState(); }
  }
}

// On touch screens the model does not capture the page scroll until the reader asks for it.
function touchLock(on) {
  const wrap = $('canvas-wrap'); let lock = $('touch-lock');
  if (on) {
    if (!lock) { lock = document.createElement('button'); lock.id = 'touch-lock'; lock.className = 'touch-lock'; lock.innerHTML = '<span>Нажмите, чтобы вращать модель</span>'; lock.addEventListener('click', () => touchLock(false)); wrap.append(lock); }
    lock.hidden = false; controls.enabled = false;
  } else { if (lock) lock.hidden = true; controls.enabled = true; }
}

export function applyPreset(p) {
  if (!loaded) { pendingPreset = p; start(); return; }
  state = 'after';
  if (p.section && p.section !== 'none') { mode = 'section'; $('floor').value = '0'; $('section-mode').value = p.section; $('slice').value = p.slice ?? 50; flip = 1; }
  else if (p.floor) { mode = 'floor'; $('floor').value = String(p.floor); $('section-mode').value = 'none'; }
  else { mode = 'house'; $('floor').value = '0'; $('section-mode').value = 'none'; }
  populateFocus(); updateState(); setView(p.view || 'perspective');
}

async function setupPDF() {
  const xs = [230, ...gx, 988], zs = [200, ...gy, 556], pos = [], uv = [], ix = [];
  for (const y of zs) for (const x of xs) { pos.push(mapAxis(x, gx, mx), 0, mapAxis(y, gy, mz)); uv.push((x - 230) / 758, 1 - (y - 200) / 356); }
  for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) { const a = j * xs.length + i; ix.push(a, a + xs.length, a + 1, a + 1, a + xs.length, a + xs.length + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ix); g.computeVertexNormals();
  const textures = await Promise.all(['ground', 'typical'].map(n => new THREE.TextureLoader().loadAsync('assets/img/pdf-' + n + '.webp')));
  textures.forEach(t => t.colorSpace = THREE.SRGBColorSpace);
  pdfOverlay = new THREE.Mesh(g, new THREE.MeshBasicMaterial({map: textures[0], side: THREE.DoubleSide, transparent: true, opacity: .66, depthTest: false, depthWrite: false}));
  pdfOverlay.userData.textures = textures; pdfOverlay.renderOrder = 20; scene.add(pdfOverlay); updatePDF();
}
function updatePDF() {
  if (!pdfOverlay) return; const f = floorNo();
  pdfOverlay.visible = $('plan-overlay').checked && f > 0 && f < 6 && state === 'after';
  pdfOverlay.position.y = levels[f] + 1.14; pdfOverlay.material.map = pdfOverlay.userData.textures[f === 1 ? 0 : 1]; kick();
}
let labelTime = 0;
function updateLabels() {
  const now = performance.now(); if (now - labelTime < 100) return; labelTime = now; const host = $('room-labels');
  if (driver !== 'explore' || !guideData || !loaded || !floorNo() || floorNo() >= 6 || state === 'before' || !$('labels').checked || $('plan-overlay').checked) { host.replaceChildren(); return; }
  const f = floorNo(), arr = guideData[f === 1 ? 'ground' : 'typical'] || [], r = $('canvas').getBoundingClientRect(); host.replaceChildren();
  for (const l of arr) {
    if (l.kind === 'room' && controls.object.zoom < 1.7 && $('focus').value === 'all') continue;
    const pt = new THREE.Vector3((l.world_x ?? mapAxis(l.x, gx, mx)), levels[f] + .2, (l.world_z ?? mapAxis(l.y, gy, mz))).project(camera);
    if (Math.abs(pt.x) > 1 || Math.abs(pt.y) > 1 || pt.z > 1) continue;
    const el = document.createElement('span'); el.className = 'room-tag ' + (l.kind || 'apartment'); el.textContent = l.text.replace('{f}', f);
    el.style.left = (pt.x + 1) * r.width / 2 + 'px'; el.style.top = (1 - pt.y) * r.height / 2 + 'px'; host.appendChild(el);
  }
}

// ---------- UI wiring ----------
export function init() {
  $('start').addEventListener('click', start);
  document.querySelectorAll('[data-cam]').forEach(b => b.addEventListener('click', () => { setView(b.dataset.cam); if (!loaded && !fallback) start(); }));
  document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => { setMode(b.dataset.mode); if (!loaded && !fallback) start(); }));
  document.querySelectorAll('[data-state]').forEach(b => b.addEventListener('click', () => {
    const hadFloor = floorNo(); state = b.dataset.state;
    if (state === 'before') { mode = 'house'; $('floor').value = '0'; $('focus').value = 'all'; $('section-mode').value = 'none'; }
    updateState(); if (state === 'before' && hadFloor) setView('perspective'); if (!loaded && !fallback) start();
  }));
  $('floor').addEventListener('change', () => { populateFocus(); if (floorNo() >= 6) $('plan-overlay').checked = false; $('section-mode').value = 'none'; applyVisibility(); applySlice(); updatePDF(); setView(floorNo() ? 'top' : 'perspective'); });
  $('focus').addEventListener('change', () => { $('section-mode').value = 'none'; applyVisibility(); applySlice(); updatePDF(); setView('perspective'); });
  $('section-mode').addEventListener('change', () => { flip = 1; $('slice').value = $('section-mode').value === 'y' ? 45 : 50; applyVisibility(); applySlice(); });
  $('slice').addEventListener('input', applySlice);
  $('flip').addEventListener('click', () => { flip *= -1; applySlice(); });
  ['glass','slabs','stairs','furniture','yard','roof'].forEach(id => $(id).addEventListener('change', () => { applyVisibility(); applySlice(); }));
  $('labels').addEventListener('change', () => { labelTime = 0; kick(); });
  $('plan-overlay').addEventListener('change', () => {
    if ($('plan-overlay').checked) { if (!floorNo() || floorNo() >= 6) { $('floor').value = '2'; populateFocus(); } mode = 'floor'; $('section-mode').value = 'none'; setView('top'); }
    syncModeUI(); applyVisibility(); applySlice(); updatePDF(); if (!loaded && !fallback) start();
  });
  $('rotate').addEventListener('click', async () => {
    if (!loaded) await start(); if (!loaded) return;
    transition = null; controls.autoRotate = !controls.autoRotate && !reduced(); $('rotate').setAttribute('aria-pressed', String(controls.autoRotate)); kick();
  });
  $('reset').addEventListener('click', () => {
    state = 'after'; mode = 'house'; $('floor').value = '0'; populateFocus(); $('plan-overlay').checked = false; $('labels').checked = true; $('section-mode').value = 'none'; $('slice').value = 50; flip = 1;
    ['glass','slabs','stairs','furniture','yard','roof'].forEach(id => $(id).checked = true); updateState(); setView('perspective');
  });
  $('fullscreen').addEventListener('click', async () => {
    const el = $('canvas-wrap');
    try { if (document.fullscreenElement) await document.exitFullscreen(); else if (el.requestFullscreen) await el.requestFullscreen(); else throw 0; }
    catch { el.classList.toggle('is-expanded'); document.body.style.overflow = el.classList.contains('is-expanded') ? 'hidden' : ''; }
    setTimeout(resize, 50);
  });
  document.addEventListener('fullscreenchange', () => setTimeout(resize, 50));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('canvas-wrap').classList.contains('is-expanded')) { $('canvas-wrap').classList.remove('is-expanded'); document.body.style.overflow = ''; setTimeout(resize, 50); } });
  $('tools-toggle').addEventListener('click', () => { const t = $('tools-toggle'); t.setAttribute('aria-expanded', String(t.getAttribute('aria-expanded') !== 'true')); });
  syncModeUI(); $('slice').style.setProperty('--p', '50%');
}
