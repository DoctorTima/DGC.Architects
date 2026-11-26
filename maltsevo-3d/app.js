// Мальцево · гостиная, коридор, прихожая и две кухни — просмотрщик.
// Режимы: «3D» (облёт сверху), «План», «Внутри» (точки обзора на высоте глаз).
// Рисует только по необходимости: движение камеры, переключатели, размер окна.
import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { MeshoptDecoder } from './vendor/meshopt_decoder.module.js';

const CFG = window.MALTSEVO;
const CEIL = 3.2;
const EYE = 1.6;
const COARSE = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const Q = new URLSearchParams(location.search);

// координаты SketchUp (м) → сцена three.js (Y вверх, центр квартиры в нуле)
const toScene = (x, y, h) => new THREE.Vector3(x - CFG.center[0], h, -(y - CFG.center[1]));

export function createApp(root) {
  const $ = (s) => root.querySelector(s);
  const $$ = (s) => Array.prototype.slice.call(root.querySelectorAll(s));
  const stage = $('.stage');
  const glBox = $('.stage-gl');
  const pinLayer = $('.pins');
  const loaderEl = $('.loader');
  const hud = $('.hud');
  const mini = $('.minimap');
  const cone = $('.mm-cone');

  // ---------- рендер ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: Q.has('shot') });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, COARSE ? 1.75 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  glBox.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xE6E2DA);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const hemi = new THREE.HemisphereLight(0xfffaf3, 0xc9bdac, 1.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff5e8, 1.7);
  sun.castShadow = true;
  const sm = COARSE ? 2048 : 4096;
  sun.shadow.mapSize.set(sm, sm);
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.025;
  scene.add(sun); scene.add(sun.target);
  // два освещения: сверху для облёта, низкое солнце через окна для вида изнутри
  const LIGHT = {
    top: { dir: [3, 10, 5], sun: 1.6, hemi: 1.25, env: 0.55, exp: 1.0 },
    inside: { dir: [-2.2, 2.0, 5.2], sun: 2.6, hemi: 0.95, env: 0.6, exp: 1.12 },
  };
  function setLight(kind) {
    const L = LIGHT[kind];
    const d = new THREE.Vector3(L.dir[0], L.dir[1], L.dir[2]).normalize();
    sun.position.copy(d.multiplyScalar(14));
    sun.target.position.set(0, 0, 0);
    sun.intensity = L.sun; hemi.intensity = L.hemi; scene.environmentIntensity = L.env;
    renderer.toneMappingExposure = L.exp;
    const sc = sun.shadow.camera;
    sc.left = -CFG.half[0] - 1; sc.right = CFG.half[0] + 1; sc.top = CFG.half[1] + 3; sc.bottom = -CFG.half[1] - 3;
    sc.near = 0.5; sc.far = 34; sc.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate = true;
  }

  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 120);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.screenSpacePanning = true;
  controls.zoomToCursor = true;
  // колесо над моделью не перехватывает прокрутку страницы, пока по модели не щёлкнули
  let engaged = false;
  renderer.domElement.addEventListener('pointerdown', () => { engaged = true; if (state.mode !== 'inside') controls.enableZoom = true; });
  renderer.domElement.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !root.classList.contains('is-full')) { engaged = false; controls.enableZoom = false; } });

  // срез стен: всё выше плоскости не рисуется, разрез стен закрашен тёмным (пошé)
  const CUT_H = 1.35;
  const cutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), CUT_H);
  const poche = { value: 0 };

  const state = {
    mode: 'orbit', view: 'iso', stop: null, kitchen: CFG.kitchenDefault || 'A', ceiling: false, cut: false, shelf: true,
    ceilBeforeInside: false, raf: 0, anim: null, ready: false, nodes: {}, pickables: [],
  };

  // ---------- размеры ----------
  let W = 1, H = 1;
  function resize() {
    const r = glBox.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    if (state.mode === 'inside') camera.fov = insideFov();
    camera.updateProjectionMatrix();
    requestRender();
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(glBox); else window.addEventListener('resize', resize);

  // ---------- точки обзора ----------
  const stops = CFG.stops.map((s, i) => {
    const pos = toScene(s.at[0], s.at[1], EYE);
    const look = toScene(s.look[0], s.look[1], s.lookH != null ? s.lookH : 1.25);
    const floor = toScene(s.at[0], s.at[1], 0.04);
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'vp';
    el.innerHTML = '<span class="vp-n">' + String(i + 1).padStart(2, '0') + '</span><span class="vp-t">' + s.room + '</span>';
    el.setAttribute('aria-label', 'Точка обзора ' + (i + 1) + ': ' + s.room + ', ' + s.title);
    el.addEventListener('click', (e) => { e.stopPropagation(); goStop(s.id); });
    pinLayer.appendChild(el);
    return { s, i, pos, look, floor, el, mm: null };
  });
  const stopById = (id) => stops.find((x) => x.s.id === id);

  // мини-план: точки и конус взгляда
  if (mini) {
    const svg = mini.querySelector('svg');
    svg.setAttribute('viewBox', '0 0 100 ' + (100 * CFG.planAspect).toFixed(2));
    stops.forEach((st) => {
      const p = mmXY(st.pos);
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', p[0].toFixed(1)); c.setAttribute('cy', p[1].toFixed(1)); c.setAttribute('r', '2.6');
      c.setAttribute('class', 'mm-dot');
      svg.appendChild(c);
      st.mm = c;
    });
    svg.appendChild(cone);
  }
  function mmXY(v) {
    const b = CFG.planBounds; // [x0, x1, z0, z1] в координатах сцены
    return [((v.x - b[0]) / (b[1] - b[0])) * 100, ((v.z - b[2]) / (b[3] - b[2])) * 100 * CFG.planAspect];
  }

  // ---------- кадр ----------
  function requestRender() {
    if (state.raf) return;
    state.raf = requestAnimationFrame(frame);
  }
  const v = new THREE.Vector3();
  function frame(t) {
    state.raf = 0;
    if (state.anim && !state.anim(t)) state.anim = null;
    if (state.anim) requestRender();
    if (state.nodes.CEIL) state.nodes.CEIL.visible = state.ceiling;
    renderer.render(scene, camera);
    placePins();
    if (state.mode === 'inside') updateCone();
  }
  controls.addEventListener('change', requestRender);
  controls.addEventListener('start', () => { state.anim = null; root.classList.add('is-touched'); });

  function placePins() {
    const halfW = W / 2, halfH = H / 2;
    const closed = state.ceiling && camera.position.y > CEIL && state.mode !== 'inside';
    const vis = state.mode === 'inside' && state.stop ? (CFG.links[state.kitchen][state.stop] || []) : null;
    for (const st of stops) {
      let show = state.ready && !closed && !state.anim;
      if (show && state.mode === 'inside') show = st.s.id !== state.stop && vis.indexOf(st.s.id) >= 0 && st.pos.distanceTo(camera.position) < 11;
      if (show) {
        v.copy(st.floor).project(camera);
        if (v.z > 1 || v.z < -1) show = false;
        else {
          const x = (v.x + 1) * halfW, y = (1 - v.y) * halfH;
          if (x < 10 || y < 10 || x > W - 10 || y > H - 10) show = false;
          else st.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
        }
      }
      st.el.hidden = !show;
      st.el.classList.toggle('vp-near', state.mode === 'inside');
    }
  }
  function updateCone() {
    if (!mini || !state.stop) return;
    const st = stopById(state.stop);
    const p = mmXY(st.pos);
    camera.getWorldDirection(v);
    const ang = Math.atan2(v.z, v.x) * 180 / Math.PI;
    const hf = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect) * 180 / Math.PI;
    cone.setAttribute('transform', 'translate(' + p[0].toFixed(2) + ' ' + p[1].toFixed(2) + ') rotate(' + ang.toFixed(1) + ')');
    const r = 16, a = Math.min(70, hf / 2) * Math.PI / 180;
    cone.querySelector('path').setAttribute('d', 'M0 0 L' + (r * Math.cos(a)).toFixed(2) + ' ' + (-r * Math.sin(a)).toFixed(2) + ' A' + r + ' ' + r + ' 0 0 1 ' + (r * Math.cos(a)).toFixed(2) + ' ' + (r * Math.sin(a)).toFixed(2) + ' Z');
  }

  // ---------- позы камеры ----------
  function fitDistance(radius, fov) {
    const vf = THREE.MathUtils.degToRad(fov);
    const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    return radius / Math.sin(Math.min(vf, hf) / 2);
  }
  function orbitPose(name) {
    const hx = CFG.half[0], hz = CFG.half[1];
    if (name === 'plan') {
      const fov = 16;
      const d = Math.max(fitDistance(hz + 0.2, fov), fitDistance(hx + 0.2, fov)) * 0.72;
      return { pos: new THREE.Vector3(0, d, 0.001), target: new THREE.Vector3(0, 0, 0), fov };
    }
    const fov = 32;
    const r = Math.sqrt(hx * hx + hz * hz) * (camera.aspect < 1 ? 0.98 : 0.8);
    const dir = new THREE.Vector3(CFG.iso[0], CFG.iso[1], CFG.iso[2]).normalize();
    const c = new THREE.Vector3(0, 1.1, 0.35);
    return { pos: dir.multiplyScalar(fitDistance(r, fov)).add(c), target: c.clone(), fov };
  }
  function insideFov() {
    // по горизонтали не меньше 74°, по вертикали 58–96°
    const need = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(74) / 2) / camera.aspect) * 180 / Math.PI;
    return Math.min(96, Math.max(58, need));
  }

  function setOrbitControls() {
    controls.enablePan = true; controls.enableZoom = engaged || root.classList.contains('is-full'); controls.enableRotate = true;
    controls.rotateSpeed = 1; controls.zoomSpeed = 1;
    controls.minDistance = 2; controls.maxDistance = 46;
    controls.minPolarAngle = 0; controls.maxPolarAngle = Math.PI * 0.49;
  }
  function setInsideControls() {
    controls.enablePan = false; controls.enableZoom = false; controls.enableRotate = true;
    controls.rotateSpeed = -0.32;
    controls.minDistance = 0.001; controls.maxDistance = 0.5;
    controls.minPolarAngle = Math.PI * 0.2; controls.maxPolarAngle = Math.PI * 0.8;
  }

  function fly(to, ms, done) {
    // to: { pos, look (точка, куда смотреть), fov, after: (target) }
    const p0 = camera.position.clone();
    const l0 = controls.target.clone();
    const f0 = camera.fov;
    if (REDUCED || ms === 0) {
      camera.position.copy(to.pos); camera.fov = to.fov; camera.updateProjectionMatrix();
      controls.target.copy(to.target); camera.lookAt(to.look); controls.update();
      state.anim = null; if (done) done(); requestRender(); return;
    }
    const lookFrom = l0.clone();
    let start = 0;
    const mid = to.arc ? new THREE.Vector3().lerpVectors(p0, to.pos, 0.5).add(new THREE.Vector3(0, to.arc, 0)) : null;
    state.anim = (t) => {
      if (!start) start = t;
      const k = Math.min(1, (t - start) / ms);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      if (mid) {
        // квадратичная кривая: из облёта плавно опускаемся в комнату
        const a = p0.clone().multiplyScalar((1 - e) * (1 - e));
        const b = mid.clone().multiplyScalar(2 * (1 - e) * e);
        const c = to.pos.clone().multiplyScalar(e * e);
        camera.position.copy(a.add(b).add(c));
      } else camera.position.lerpVectors(p0, to.pos, e);
      const lk = new THREE.Vector3().lerpVectors(lookFrom, to.look, e);
      camera.fov = f0 + (to.fov - f0) * e; camera.updateProjectionMatrix();
      camera.lookAt(lk);
      if (k >= 1) {
        controls.target.copy(to.target);
        camera.lookAt(to.look);
        controls.update();
        if (done) done();
      }
      return k < 1;
    };
    requestRender();
  }

  // ---------- режимы ----------
  function goOrbit(name, instant) {
    const wasInside = state.mode === 'inside';
    state.mode = 'orbit'; state.view = name; state.stop = null;
    root.dataset.mode = name === 'plan' ? 'plan' : 'orbit';
    setOrbitControls();
    if (wasInside) { setCeiling(state.ceilBeforeInside, true); setLight('top'); applyCut(); }
    if (name === 'plan' && state.ceiling) setCeiling(false, true);
    const p = orbitPose(name);
    fly({ pos: p.pos, look: p.target, target: p.target, fov: p.fov }, instant ? 0 : (wasInside ? 1100 : 750));
    syncUI();
    writeHash();
  }
  function goStop(id, instant) {
    const st = stopById(id);
    if (!st) return;
    const fromOrbit = state.mode !== 'inside';
    if (fromOrbit) state.ceilBeforeInside = state.ceiling;
    state.mode = 'inside'; state.stop = id;
    root.dataset.mode = 'inside';
    setInsideControls();
    setCeiling(true, true);
    applyCut();
    setLight('inside');
    const dir = st.look.clone().sub(st.pos).normalize();
    const target = st.pos.clone().add(dir.clone().multiplyScalar(0.01));
    const lookFar = st.pos.clone().add(dir.multiplyScalar(4));
    const fov = insideFov();
    fly({ pos: st.pos, look: lookFar, target, fov, arc: fromOrbit ? 1.2 : 0 }, instant ? 0 : (fromOrbit ? 1500 : 900));
    if (hud) {
      hud.querySelector('.hud-n').textContent = String(st.i + 1).padStart(2, '0') + ' / ' + String(stops.length).padStart(2, '0');
      hud.querySelector('.hud-room').textContent = st.s.room;
      hud.querySelector('.hud-title').textContent = st.s.title;
    }
    stops.forEach((x) => x.mm && x.mm.classList.toggle('is-on', x.s.id === id));
    syncUI();
    writeHash();
  }
  function stepStop(d) {
    const i = state.stop ? stopById(state.stop).i : -1;
    const n = (i + d + stops.length) % stops.length;
    goStop(stops[n].s.id);
  }

  function setCeiling(on, quiet) {
    state.ceiling = on;
    if (!quiet) writeHash();
    syncUI();
    requestRender();
  }
  function applyCut() {
    const on = state.cut && state.mode !== 'inside';
    renderer.clippingPlanes = on ? [cutPlane] : [];
    poche.value = on ? 1 : 0;
    requestRender();
  }
  const KNUM = { A: 1, B: 2, C: 3 };
  function setKitchen(k) {
    if (!KNUM[k]) k = 'A';
    state.kitchen = k;
    const N = state.nodes;
    if (N.KITCHEN_A) N.KITCHEN_A.visible = k === 'A';
    if (N.KITCHEN_B) N.KITCHEN_B.visible = k !== 'A';       // общая часть вариантов 2 и 3
    if (N.KB_COLUMN) N.KB_COLUMN.visible = k === 'B';       // встроенная колонна с холодильниками
    if (N.KC_FRIDGE) N.KC_FRIDGE.visible = k === 'C';       // отдельно стоящий двойной холодильник
    renderer.shadowMap.needsUpdate = true;
    const mmi = $('.mm-img');
    if (mmi) mmi.src = 'img/plan-k' + KNUM[k] + '.webp';
    const note = $('.kitchen-note');
    if (note) note.textContent = CFG.kitchens[k].note;
    syncUI();
    writeHash();
    requestRender();
  }

  function setShelf(on, quiet) {
    state.shelf = on;
    if (state.nodes.SHELF) state.nodes.SHELF.visible = on;
    renderer.shadowMap.needsUpdate = true;
    if (!quiet) writeHash();
    syncUI();
    requestRender();
  }
  function syncUI() {
    $$('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(state.mode !== 'inside' && b.dataset.view === state.view)));
    $$('[data-kitchen]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kitchen === state.kitchen)));
    $$('[data-stop]').forEach((b) => b.setAttribute('aria-current', String(state.mode === 'inside' && b.dataset.stop === state.stop)));
    const cb = $('[data-act="ceiling"]');
    if (cb) { cb.setAttribute('aria-pressed', String(state.ceiling)); cb.querySelector('span').textContent = state.ceiling ? 'Снять потолок' : 'Вернуть потолок'; }
    const cu = $('[data-act="cut"]');
    if (cu) { cu.setAttribute('aria-pressed', String(state.cut)); cu.disabled = state.mode === 'inside'; }
    const sh = $('[data-act="shelf"]');
    if (sh) sh.setAttribute('aria-pressed', String(state.shelf));
    const act = state.stop ? $('[data-stop="' + state.stop + '"]') : null;
    if (act && state.ready) {
      const strip = act.parentElement;
      if (strip.scrollWidth > strip.clientWidth + 4) {
        const l = act.offsetLeft - (strip.clientWidth - act.offsetWidth) / 2;
        strip.scrollTo({ left: Math.max(0, l), behavior: REDUCED ? 'auto' : 'smooth' });
      }
    }
  }

  // ---------- адрес ----------
  function writeHash() {
    if (!state.ready || Q.has('shot')) return;
    const parts = ['k' + KNUM[state.kitchen]];
    if (state.mode === 'inside') parts.push(state.stop);
    else if (state.view === 'plan') parts.push('plan');
    if (state.cut && state.mode !== 'inside') parts.push('cut');
    if (!state.shelf) parts.push('noshelf');
    const h = '#' + parts.join('-');
    try { history.replaceState(null, '', h); } catch (e) {}
  }
  function readHash() {
    const h = (location.hash || '').slice(1);
    const out = {};
    if (!h) return out;
    const m = /^k([123])/.exec(h); if (m) out.kitchen = { 1: 'A', 2: 'B', 3: 'C' }[m[1]];
    if (/noshelf/.test(h)) out.noshelf = true;
    for (const st of stops) if (h.indexOf(st.s.id) >= 0) out.stop = st.s.id;
    if (/plan/.test(h)) out.view = 'plan';
    if (/cut/.test(h)) out.cut = true;
    return out;
  }

  // ---------- кнопки ----------
  $$('[data-view]').forEach((b) => b.addEventListener('click', () => goOrbit(b.dataset.view)));
  $$('[data-kitchen]').forEach((b) => b.addEventListener('click', () => setKitchen(b.dataset.kitchen)));
  $$('[data-stop]').forEach((b) => b.addEventListener('click', () => {
    const r = stage.getBoundingClientRect();
    const vh = window.innerHeight || 800;
    if (!root.classList.contains('is-full') && (r.top < 0 || r.bottom > vh)) stage.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' });
    goStop(b.dataset.stop);
  }));
  // во весь экран: своя раскладка (работает и на iPhone) + системный полноэкранный режим, где он есть
  const fb = $('[data-act="full"]');
  function setFull(on) {
    root.classList.toggle('is-full', on);
    document.documentElement.classList.toggle('has-full', on);
    if (fb) { fb.setAttribute('aria-pressed', String(on)); fb.querySelector('.full-t').textContent = on ? 'Свернуть' : 'Во весь экран'; }
    controls.enableZoom = state.mode !== 'inside' && (on || engaged);
    try {
      if (on && root.requestFullscreen && !document.fullscreenElement) root.requestFullscreen().catch(() => {});
      else if (on && root.webkitRequestFullscreen && !document.webkitFullscreenElement) root.webkitRequestFullscreen();
      else if (!on && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
      else if (!on && document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (e) {}
    setTimeout(resize, 60);
  }
  if (fb) fb.addEventListener('click', () => setFull(!root.classList.contains('is-full')));
  const onFs = () => { if (!document.fullscreenElement && !document.webkitFullscreenElement && root.classList.contains('is-full')) setFull(false); };
  document.addEventListener('fullscreenchange', onFs);
  document.addEventListener('webkitfullscreenchange', onFs);
  const cb = $('[data-act="ceiling"]');
  if (cb) cb.addEventListener('click', () => setCeiling(!state.ceiling));
  const shb = $('[data-act="shelf"]');
  if (shb) shb.addEventListener('click', () => setShelf(!state.shelf));
  const cu = $('[data-act="cut"]');
  if (cu) cu.addEventListener('click', () => { state.cut = !state.cut; if (state.cut && state.ceiling) setCeiling(false, true); applyCut(); syncUI(); writeHash(); });
  $$('[data-act="exit"]').forEach((b) => b.addEventListener('click', () => goOrbit('iso')));
  $$('[data-act="prev"]').forEach((b) => b.addEventListener('click', () => stepStop(-1)));
  $$('[data-act="next"]').forEach((b) => b.addEventListener('click', () => stepStop(1)));
  document.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'Escape' && root.classList.contains('is-full') && state.mode !== 'inside') { setFull(false); return; }
    if (state.mode === 'inside') {
      if (e.key === 'ArrowRight') { stepStop(1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft') { stepStop(-1); e.preventDefault(); }
      else if (e.key === 'Escape') goOrbit('iso');
    }
  });
  // колесо внутри комнаты — приближение (угол обзора)
  renderer.domElement.addEventListener('wheel', (e) => {
    if (state.mode !== 'inside' || !(engaged || root.classList.contains('is-full'))) return;
    e.preventDefault();
    camera.fov = Math.min(insideFov() + 6, Math.max(34, camera.fov + e.deltaY * 0.03));
    camera.updateProjectionMatrix(); requestRender();
  }, { passive: false });
  // двойной щелчок по полу в облёте — встать в ближайшую точку обзора
  renderer.domElement.addEventListener('dblclick', (e) => {
    if (state.mode === 'inside' || !state.ready) return;
    const r = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, camera);
    const p = new THREE.Vector3();
    if (!rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) return;
    let best = null, bd = 1e9;
    for (const st of stops) { const d = Math.hypot(st.pos.x - p.x, st.pos.z - p.z); if (d < bd) { bd = d; best = st; } }
    if (best && bd < 2.5) goStop(best.s.id);
  });

  // ---------- загрузка ----------
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  function progress(p) {
    if (!loaderEl) return;
    loaderEl.style.setProperty('--p', p.toFixed(3));
    const n = loaderEl.querySelector('.ld-n'); if (n) n.textContent = Math.round(p * 100) + '%';
  }

  // если WebAssembly недоступен (политика страницы), берём модель без meshopt-сжатия
  const pickModel = () => MeshoptDecoder.ready.then(() => CFG.model, () => {
    loader.setMeshoptDecoder(null);
    return CFG.modelPlain || CFG.model;
  });
  return new Promise((resolve, reject) => {
    pickModel().then((url) => loader.load(url, (gltf) => {
      const model = gltf.scene;
      const mats = new Set();
      model.traverse((o) => {
        if (!o.isMesh) return;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
      });
      mats.forEach((mt) => {
        if (mt.map) mt.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        if (mt.transparent) { mt.depthWrite = false; }
        if (/зеркало|Mirror|^_23$/i.test(mt.name)) { mt.map = null; mt.color.set(0xd5d8d4); mt.metalness = 0.62; mt.roughness = 0.14; mt.envMapIntensity = 1.3; }
        if (/Glass|стекло|G02/i.test(mt.name) && mt.transparent) { mt.roughness = 0.05; mt.envMapIntensity = 1.4; }
        mt.side = THREE.DoubleSide;
        mt.onBeforeCompile = (sh) => {
          sh.uniforms.uPoche = poche;
          sh.fragmentShader = 'uniform float uPoche;\n' + sh.fragmentShader.replace('#include <dithering_fragment>',
            '#include <dithering_fragment>\n if (uPoche > 0.5 && !gl_FrontFacing) gl_FragColor = vec4(0.17, 0.16, 0.15, 1.0);');
        };
        mt.customProgramCacheKey = () => 'poche';
        mt.needsUpdate = true;
      });
      model.children.slice().forEach((n) => {
        state.nodes[n.name] = n;
        const isCeil = n.name === 'CEIL';
        n.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = !isCeil; } });
      });
      scene.add(model);
      resize();
      setLight('top');
      const h = readHash();
      if (h.cut) state.cut = true;
      setKitchen({ 1: 'A', 2: 'B', 3: 'C' }[Q.get('k')] || h.kitchen || state.kitchen);
      setShelf(!(h.noshelf || Q.get('shelf') === '0'), true);
      setOrbitControls();
      state.ready = true;
      root.classList.add('is-live');
      if (Q.get('stop') || h.stop) goStop(Q.get('stop') || h.stop, true);
      else goOrbit(Q.get('view') || h.view || 'iso', true);
      applyCut();
      // первое появление — короткий облёт
      if (!Q.has('shot') && state.mode === 'orbit' && !REDUCED) {
        const p = camera.position.clone();
        const off = new THREE.Vector3(3.2, 1.6, 2.2);
        camera.position.add(off);
        camera.lookAt(controls.target);
        fly({ pos: p, look: controls.target.clone(), target: controls.target.clone(), fov: camera.fov }, 1600);
      }
      requestRender();
      if (Q.has('bare')) root.classList.add('is-bare');
      if (Q.has('ortho')) {
        const b = CFG.planBounds;
        const oc = new THREE.OrthographicCamera(b[0], b[1], -b[2], -b[3], 0.1, 60);
        oc.position.set(0, 30, 0); oc.up.set(0, 0, -1); oc.lookAt(0, 0, 0);
        state.cut = true; state.ceiling = false; applyCut();
        setLight('top');
        renderer.render(scene, oc);
        state.ortho = oc;
        renderer.render = ((r) => (sc, cam) => r.call(renderer, sc, state.ortho || cam))(renderer.render);
      }
      const computeLinks = () => {
        const rc = new THREE.Raycaster();
        const out = {};
        for (const k of ['A', 'B', 'C']) {
          setKitchen(k);
          const targets = ['BASE', 'SHELF', 'KITCHEN_A', 'KITCHEN_B', 'KB_COLUMN', 'KC_FRIDGE'].map((n) => state.nodes[n]).filter((n) => n && n.visible);
          out[k] = {};
          for (const a of stops) {
            out[k][a.s.id] = [];
            for (const b of stops) {
              if (a === b) continue;
              const to = b.floor.clone().add(new THREE.Vector3(0, 0.9, 0));
              const d = to.clone().sub(a.pos); const len = d.length(); d.normalize();
              rc.set(a.pos, d); rc.far = len;
              const hit = rc.intersectObjects(targets, true).filter((h) => h.object.material && !h.object.material.transparent && h.object.material.alphaTest === 0);
              if (!hit.length || hit[0].distance > len - 0.3) out[k][a.s.id].push(b.s.id);
            }
          }
        }
        setKitchen(CFG.kitchenDefault || 'A');
        return out;
      };
      const api = { setKitchen, setShelf, goStop, goOrbit };
      window.__app = { computeLinks, setShelf, state, goStop, goOrbit, setKitchen, setCeiling, renderer, camera, scene, controls, stops, applyCut, requestRender, THREE };
      resolve(api);
    }, (e) => {
      if (e && e.total) progress(e.loaded / e.total);
      else if (e && e.loaded && CFG.modelBytes) progress(Math.min(0.99, e.loaded / CFG.modelBytes));
    }, (err) => reject(err)));
    renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); reject(new Error('context lost')); }, false);
  });
}
