// Wabi-Sabi: просмотрщик комнат (кухня, прихожая).
// Рисует только по изменению: движение камеры, переключатели, размер окна.
import * as THREE from '../js/viewer/vendor/three.module.js';
import { GLTFLoader } from '../js/viewer/vendor/GLTFLoader.js';
import { OrbitControls } from '../js/viewer/vendor/OrbitControls.js';
import { RoomEnvironment } from '../js/viewer/vendor/RoomEnvironment.js';
import { MeshoptDecoder } from '../js/viewer/vendor/meshopt_decoder.module.js';

const CEIL = 3.2;
const COARSE = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

export function createViewer(root, cfg) {
  const stage = root.querySelector('.stage');
  const canvasBox = root.querySelector('.stage-gl');
  const pinLayer = root.querySelector('.pins');
  const status = root.querySelector('.stage-status');
  const info = root.querySelector('.pin-info');

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, COARSE ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  canvasBox.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xE6E2DA);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  scene.add(new THREE.HemisphereLight(0xfff4e8, 0xb9a58f, 1.25));
  const sun = new THREE.DirectionalLight(0xfff0dc, 1.7);
  sun.position.set(2.5, 9, 4);
  sun.castShadow = true;
  const sm = COARSE ? 1024 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  const sc = sun.shadow.camera;
  sc.left = -4; sc.right = 4; sc.top = 4; sc.bottom = -4; sc.near = 1; sc.far = 20;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 80);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.maxPolarAngle = Math.PI * 0.53;
  controls.minDistance = 0.4;
  controls.maxDistance = 22;
  controls.screenSpacePanning = true;
  controls.zoomToCursor = false;

  const state = { ceiling: false, layers: { socket: true, switch: true, light: true }, walls: {}, ceilNode: null, raf: 0, anim: null, ready: false };

  // ---------- метки ----------
  const LETTER = { socket: 'Р', switch: 'В', light: 'С' };
  const pins = cfg.markers.map((m) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'pin pin-' + m.type;
    el.textContent = m.id;
    el.setAttribute('aria-label', m.id + ': ' + m.what + ', ' + m.where);
    el.addEventListener('click', () => select(m.id));
    pinLayer.appendChild(el);
    return { m, el, p: new THREE.Vector3(m.p[0], m.p[1], m.p[2]) };
  });
  function select(id) {
    pins.forEach((q) => q.el.classList.toggle('is-on', q.m.id === id));
    root.querySelectorAll('tr[data-pin]').forEach((tr) => tr.classList.toggle('is-on', tr.dataset.pin === id));
    const q = pins.find((x) => x.m.id === id);
    if (q && info) info.textContent = q.m.id + ' · ' + q.m.what + ' · ' + q.m.where + (q.m.h ? ' · ' + q.m.h + ' мм от пола' : '');
  }
  root.querySelectorAll('tr[data-pin]').forEach((tr) => {
    tr.addEventListener('click', () => select(tr.dataset.pin));
    tr.addEventListener('mouseenter', () => { const q = pins.find((x) => x.m.id === tr.dataset.pin); if (q) q.el.classList.add('is-hot'); });
    tr.addEventListener('mouseleave', () => pins.forEach((q) => q.el.classList.remove('is-hot')));
  });

  // ---------- размеры ----------
  let W = 1, H = 1;
  function resize() {
    const r = canvasBox.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    requestRender();
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(canvasBox); else window.addEventListener('resize', resize);

  // ---------- рисование по запросу ----------
  function requestRender() {
    if (state.raf) return;
    state.raf = requestAnimationFrame(frame);
  }
  const v = new THREE.Vector3();
  function inside() {
    const c = camera.position;
    return Math.abs(c.x) < cfg.hx && Math.abs(c.z) < cfg.hz && c.y < CEIL && c.y > 0;
  }
  function updateWalls() {
    const c = camera.position;
    const inRoom = inside();
    const hidden = {};
    for (const k in state.walls) {
      const w = state.walls[k];
      let hide = false;
      if (!inRoom) {
        v.copy(c).sub(w.center); v.y = 0;
        hide = v.dot(w.dir) > 0.05;
      }
      w.node.visible = !hide;
      hidden[k] = hide;
    }
    if (state.ceilNode) state.ceilNode.visible = state.ceiling;
    return hidden;
  }
  function placePins(hidden) {
    const half = { x: W / 2, y: H / 2 };
    for (const q of pins) {
      const m = q.m;
      let show = state.layers[m.type] && !(m.wall && hidden[m.wall]);
      if (show) {
        v.copy(q.p).project(camera);
        if (v.z > 1 || v.z < -1) show = false;
        else {
          const x = (v.x + 1) * half.x, y = (1 - v.y) * half.y;
          if (x < -20 || y < -20 || x > W + 20 || y > H + 20) show = false;
          else q.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
        }
      }
      q.el.hidden = !show;
    }
  }
  function frame(t) {
    state.raf = 0;
    if (state.anim && !state.anim(t)) state.anim = null;
    if (state.anim) requestRender();
    const hidden = updateWalls();
    renderer.render(scene, camera);
    placePins(hidden);
  }
  controls.addEventListener('change', requestRender);
  controls.addEventListener('start', () => { state.anim = null; });

  // ---------- камеры ----------
  function fitDistance(radius, fov) {
    const vf = THREE.MathUtils.degToRad(fov);
    const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    return radius / Math.sin(Math.min(vf, hf) / 2);
  }
  function viewPose(name) {
    const r = Math.sqrt(cfg.hx * cfg.hx + cfg.hz * cfg.hz + 1.7 * 1.7);
    if (name === 'iso') {
      const fov = 35, d = fitDistance(r * 0.98, fov);
      const q = /[?&]iso=([-\d.]+),([-\d.]+),([-\d.]+)/.exec(location.search);
      const iso = q ? [+q[1], +q[2], +q[3]] : cfg.iso;
      const dir = new THREE.Vector3(iso[0], iso[1], iso[2]).normalize();
      return { pos: dir.multiplyScalar(d).add(new THREE.Vector3(0, 0.6, 0)), target: new THREE.Vector3(0, 0.9, 0), fov };
    }
    if (name === 'plan') {
      const fov = 35;
      const rr = Math.sqrt(cfg.hx * cfg.hx + cfg.hz * cfg.hz) + 0.3;
      return { pos: new THREE.Vector3(0, CEIL + fitDistance(rr, fov) * 0.92, 0.001), target: new THREE.Vector3(0, 0, 0), fov };
    }
    const vw = cfg.views.find((x) => x.id === name);
    const ax = vw.look[1], sgn = vw.look[0] === '-' ? -1 : 1;
    const half = ax === 'x' ? cfg.hx : cfg.hz;
    const pos = new THREE.Vector3(), target = new THREE.Vector3();
    const lat = vw.at;
    if (ax === 'x') { pos.set(-sgn * (half + vw.back), vw.y || 1.55, lat); target.set(sgn * half * 0.35, 1.35, lat); }
    else { pos.set(lat, vw.y || 1.55, -sgn * (half + vw.back)); target.set(lat, 1.35, sgn * half * 0.35); }
    // на узком экране держим хотя бы 62° по горизонтали
    const minH = THREE.MathUtils.degToRad(62);
    const needV = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(minH / 2) / camera.aspect));
    return { pos, target, fov: Math.min(90, Math.max(vw.fov || 52, needV)) };
  }
  function goTo(name, instant) {
    const p = viewPose(name);
    root.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === name)));
    if (name === 'plan' && state.ceiling) setCeiling(false);
    if (instant || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      camera.position.copy(p.pos); controls.target.copy(p.target); camera.fov = p.fov; camera.updateProjectionMatrix();
      controls.update(); requestRender(); return;
    }
    const p0 = camera.position.clone(), t0 = controls.target.clone(), f0 = camera.fov;
    let start = 0;
    state.anim = (t) => {
      if (!start) start = t;
      const k = Math.min(1, (t - start) / 650);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      camera.position.lerpVectors(p0, p.pos, e);
      controls.target.lerpVectors(t0, p.target, e);
      camera.fov = f0 + (p.fov - f0) * e; camera.updateProjectionMatrix();
      camera.lookAt(controls.target);
      if (k >= 1) controls.update();
      return k < 1;
    };
    requestRender();
  }

  function setCeiling(on) {
    state.ceiling = on;
    const b = root.querySelector('[data-act="ceiling"]');
    if (b) { b.setAttribute('aria-pressed', String(on)); b.querySelector('span').textContent = on ? 'Снять потолок' : 'Вернуть потолок'; }
    requestRender();
  }

  // ---------- кнопки ----------
  root.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => goTo(b.dataset.view)));
  const cb = root.querySelector('[data-act="ceiling"]');
  if (cb) cb.addEventListener('click', () => setCeiling(!state.ceiling));
  root.querySelectorAll('[data-layer]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.layer; state.layers[k] = !state.layers[k];
    b.setAttribute('aria-pressed', String(state.layers[k])); requestRender();
  }));

  // ---------- загрузка ----------
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  function setStatus(t) { if (status) status.textContent = t; }

  return new Promise((resolve, reject) => {
    loader.load(cfg.url, (gltf) => {
      const model = gltf.scene;
      model.traverse((o) => {
        if (!o.isMesh) return;
        o.receiveShadow = true;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((mt) => {
          if (mt.map) mt.map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
          if (mt.transparent) { mt.depthWrite = false; }
          if (/зеркало|Mirror|^_23$/i.test(mt.name)) { mt.envMapIntensity = 1.8; mt.roughness = 0.06; }
        });
      });
      const pre = cfg.prefix + '__';
      model.children.slice().forEach((n) => {
        const key = n.name.replace(pre, '');
        if (key === 'CEIL') { state.ceilNode = n; n.traverse((o) => { o.castShadow = false; }); }
        else if (key.indexOf('WALL_') === 0) {
          const s = key.slice(5);
          const dir = { N: [0, 0, -1], S: [0, 0, 1], E: [1, 0, 0], W: [-1, 0, 0] }[s];
          const center = new THREE.Vector3(dir[0] * cfg.hx, 1.6, dir[2] * cfg.hz);
          state.walls[s] = { node: n, dir: new THREE.Vector3(dir[0], 0, dir[2]), center };
          n.traverse((o) => { o.castShadow = false; });
        } else n.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      });
      scene.add(model);
      resize();
      goTo('iso', true);
      setCeiling(false);
      renderer.shadowMap.needsUpdate = true;
      state.ready = true;
      setStatus('');
      requestRender();
      root.classList.add('is-live');
      resolve();
    }, (e) => {
      if (e && e.total) setStatus('Загрузка модели · ' + Math.round((e.loaded / e.total) * 100) + '%');
    }, (err) => reject(err));
    renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); reject(new Error('context lost')); }, false);
  });
}
