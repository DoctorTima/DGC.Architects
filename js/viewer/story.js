// Scroll-driven story on the real REC v10 model.
// The text steps scroll over a pinned stage; scroll position interpolates the camera
// and the v10 construction stages (reconstruction-stages.js). Retained walls and terrain
// stay visible in every step; separation and section cuts are analytical views.
import * as V from './app.js';
import {constructionState, buildPhase, sideOf} from './reconstruction-stages.js';
import {meshVisible, clippingFor, LEVELS, ROOF_LEVEL} from './model-visibility.js';

const $ = id => document.getElementById(id);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Camera poses are in model metres (x along the house, y up, z towards the entrance side).
const STEPS = [
  {id: 'before',  t: 0,    cam: [36, 7, 54],    at: [0, 6.5, 0],  fov: 30},
  {id: 'keep',    t: .05,  cam: [-32, 25, 50],  at: [0, 7, 0],    fov: 30, edges: 1},
  {id: 'open',    t: .18,  cam: [12, 11, 50],   at: [0, 7.5, 0],  fov: 32, edges: 1},
  {id: 'volumes', t: .45,  cam: [50, 30, 48],   at: [0, 8, 0],    fov: 30},
  {id: 'facade',  t: .70,  cam: [34, 11, 60],   at: [0, 8.5, 0],  fov: 30},
  {id: 'roof',    t: .88,  cam: [-24, 54, 34],  at: [0, 13, 0],   fov: 32},
  {id: 'yard',    t: 1,    cam: [-38, 42, -54], at: [2, 3, -4],   fov: 32},
  {id: 'parts',   t: 1,    cam: [-66, 50, 78],  at: [4, 12, 0],   fov: 32, explode: 1, sweep: .5},
  {id: 'lift0',   t: 1,    cam: [38, 8, 4],     at: [0, 7, 4],    fov: 32, section: 50, lift: 0},
  {id: 'lift1',   t: 1,    cam: [38, 14, 4],    at: [0, 12, 4],   fov: 32, section: 50, lift: 1},
  {id: 'floor',   t: 1,    cam: [0, 50, 26],    at: [0, 3, 0],    fov: 30, floor: 2}
];
const FALLBACK = {before: 'v7-before', keep: 'v7-before', open: 'v7-before', volumes: 'rec-hero', facade: 'rec-hero', roof: 'rec-roof', yard: 'v7-courtyard', parts: 'rec-exploded', lift0: 'rec-xsection', lift1: 'rec-xsection', floor: 'rec-plan2'};

let stage, steps, host, cam, THREE, C, active = false, ready = false, current = -1, mode = '', edges = null;
let pose = null, raf = 0, wantRender = true, lastKey = '';

function smooth(x) { return x * x * (3 - 2 * x); }
function lerp(a, b, k) { return a + (b - a) * k; }

// Where are we? i + fraction between the centres of consecutive steps.
function progress() {
  const vc = innerHeight * .55, cs = steps.map(s => { const r = s.getBoundingClientRect(); return r.top + r.height / 2; });
  if (vc <= cs[0]) return 0;
  for (let i = 0; i < cs.length - 1; i++) if (vc < cs[i + 1]) return i + (vc - cs[i]) / (cs[i + 1] - cs[i]);
  return cs.length - 1;
}

function poseAt(p) {
  const i = Math.min(STEPS.length - 1, Math.floor(p)), j = Math.min(STEPS.length - 1, i + 1), k = smooth(p - i), a = STEPS[i], b = STEPS[j];
  const near = (p - i) < .5 ? a : b;
  return {
    i: Math.round(p), cam: a.cam.map((v, n) => lerp(v, b.cam[n], k)), at: a.at.map((v, n) => lerp(v, b.at[n], k)), fov: lerp(a.fov, b.fov, k),
    t: lerp(a.t, b.t, k), sweep: lerp(a.sweep ?? 1, b.sweep ?? 1, k), explode: lerp(a.explode || 0, b.explode || 0, k), lift: lerp(a.lift ?? (b.lift ?? 0), b.lift ?? (a.lift ?? 0), k),
    edges: lerp(a.edges || 0, b.edges || 0, k), section: near.section ?? null, floor: near.floor || 0
  };
}

// Mesh states for a pose. Discrete parts (section, floor) only change at step midpoints.
// Analytical separation: additions move sideways away from the retained house (never up).
const EXPLODE = {cores: [0, 0, 10], annex_walls: [0, 0, 10], roof: [18, 0, 0]};
function applyMeshes(P) {
  const key = `${P.section}|${P.floor}`, discreteChanged = key !== lastKey; lastKey = key;
  const after = P.section !== null || P.floor;
  for (const o of C.meshes) {
    const m = o.userData; let vis, planes, slide = null, side = 1;
    if (after) {
      const c = {state: 'after', floor: P.floor, mode: P.section !== null ? 'x' : 'none', slice: P.section ?? 50, flip: 1, roof: true, yard: !P.floor, glass: true, slabs: true, stairs: true, furniture: true};
      vis = meshVisible(m, c); planes = clippingFor(m, c);
      if (P.section !== null && m.stage === 'before') vis = false;
    } else if (m.storySplit) { vis = false; planes = []; }
    else {
      const s = constructionState(m, o.name, P.t, {sweep: P.sweep}); vis = s.visible; planes = s.planes; slide = s.slide || null;
    }
    o.visible = vis;
    if (planes.length !== (o.material.clippingPlanes?.length || 0) || planes.length) {
      o.material.clippingPlanes = planes.map(v => new THREE.Plane(new THREE.Vector3(v[0], v[1], v[2]), v[3]));
      o.castShadow = !planes.length && m.castShadowBase; o.receiveShadow = !planes.length;
    }
    if (!m.base) m.base = o.position.clone();
    const ph = (slide || P.explode > .001) && !after ? buildPhase(m, o.name) : '';
    if (ph === 'cores' || ph === 'annex_walls') side = sideOf(m, m.centreZ ?? (m.centreZ = centreZ(o)));
    const e = (!after && EXPLODE[ph]) || [0, 0, 0], sl = slide || [0, 0, 0], ex = P.explode;
    // The middle lift cab rides from where the model places it up to the roof terrace level.
    let lift = 0;
    if (/^lift_2_cab_/.test(o.name) && P.section !== null) { if (cabMin === null) cabMin = cabBottom(); lift = (LEVELS[1] - .09 + P.lift * (ROOF_LEVEL - LEVELS[1] + .09)) - cabMin; }
    const sz = ph === 'roof' ? 1 : side;
    o.position.set(m.base.x + sl[0] + e[0] * ex, m.base.y + lift, m.base.z + (sl[2] + e[2] * ex) * sz);
  }
  if (discreteChanged) { C.caps.update(); }
  if (edges) { edges.visible = P.edges > .02; edges.children.forEach(l => l.material.opacity = Math.min(1, P.edges)); }
}
let cabMin = null;
function cabBottom() { let y = Infinity; for (const o of C.meshes) if (/^lift_2_cab_floor/.test(o.name)) { const b = new THREE.Box3().setFromObject(o); y = Math.min(y, b.min.y); } return isFinite(y) ? y : LEVELS[1]; }
function centreZ(o) { const b = new THREE.Box3().setFromObject(o); return (b.min.z + b.max.z) / 2; }

function resetMeshes() {
  for (const o of C.meshes) if (o.userData.base) o.position.copy(o.userData.base);
  if (edges) edges.visible = false; lastKey = '';
}

// Drawing lines on the retained shell: the walls that stay.
function buildEdges() {
  edges = new THREE.Group(); edges.visible = false;
  for (const o of C.meshes) {
    if (!/^transition_retained_(core|bearing)/.test(o.name)) continue;
    const g = new THREE.EdgesGeometry(o.geometry, 25);
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({color: 0x8c2d3e, transparent: true, opacity: 1, depthTest: true}));
    o.updateWorldMatrix(true, false); l.applyMatrix4(o.matrixWorld); edges.add(l);
  }
  C.scene.add(edges);
}

// A few source meshes carry the front AND rear portal cladding; for the sideways
// attachment they are split into a front and a rear half (story only).
function splitBothSides() {
  for (const o of [...C.meshes]) {
    const m = o.userData; if (m.storySplit || m.storyPart || buildPhase(m, o.name) !== 'cores') continue;
    const b = new THREE.Box3().setFromObject(o); if (!(b.min.z < -3 && b.max.z > 3)) continue;
    const g = o.geometry, pos = g.attributes.position, idx = g.index ? g.index.array : [...Array(pos.count).keys()];
    o.updateWorldMatrix(true, false); const v = new THREE.Vector3(), parts = {front: [], rear: []};
    for (let i = 0; i < idx.length; i += 3) {
      let z = 0; for (let k = 0; k < 3; k++) { v.fromBufferAttribute(pos, idx[i + k]).applyMatrix4(o.matrixWorld); z += v.z; }
      (z > 0 ? parts.front : parts.rear).push(idx[i], idx[i + 1], idx[i + 2]);
    }
    for (const side of ['front', 'rear']) {
      if (!parts[side].length) continue;
      const h = new THREE.BufferGeometry();
      for (const [k, a] of Object.entries(g.attributes)) h.setAttribute(k, a);
      h.setIndex(parts[side]); h.boundingBox = null; h.boundingSphere = null;
      const mesh = new THREE.Mesh(h, o.material.clone());
      mesh.name = o.name + '_' + side; mesh.position.copy(o.position); mesh.quaternion.copy(o.quaternion); mesh.scale.copy(o.scale);
      mesh.userData = {...m, transitionOnly: true, storyPart: side, base: undefined, centreZ: undefined};
      mesh.castShadow = o.castShadow; mesh.receiveShadow = o.receiveShadow; o.parent.add(mesh); C.meshes.push(mesh);
    }
    m.storySplit = true;
  }
}

function render() {
  if (!active || !ready) return false;
  const P = poseAt(progress()); pose = P;
  cam.fov = P.fov; cam.position.set(...P.cam); cam.lookAt(...P.at);
  const sz = C.renderer.getSize(new THREE.Vector2()), aspect = sz.x / Math.max(1, sz.y);
  // Keep the horizontal field of a wide screen on tall phone screens.
  if (aspect < 1.4) { const h = 2 * Math.atan(Math.tan(P.fov * Math.PI / 360) * 1.6); cam.fov = Math.min(70, 2 * Math.atan(Math.tan(h / 2) / aspect) * 180 / Math.PI); }
  if (sz.x >= 900) cam.setViewOffset(sz.x, sz.y, -sz.x * .17, 0, sz.x, sz.y);
  else cam.setViewOffset(sz.x, sz.y, 0, sz.y * .16, sz.x, sz.y);
  cam.updateProjectionMatrix();
  applyMeshes(P); C.renderer.render(C.scene, cam);
  setStep(P.i);
  return true;
}

function setStep(i) {
  if (i === current) return; current = i;
  steps.forEach((s, n) => s.classList.toggle('is-active', n === i));
  $('story-count').textContent = String(i + 1).padStart(2, '0');
  $('story-rail').style.setProperty('--k', (i / (STEPS.length - 1)).toFixed(3));
  if (!ready) showFallback(STEPS[i].id);
}
function showFallback(id) {
  const img = $('story-img'), n = FALLBACK[id]; if (!img || img.dataset.k === n) return;
  img.dataset.k = n; img.style.opacity = 0;
  const src = `assets/img/${n}-900.webp`, big = `assets/img/${n}.webp`;
  const im = new Image(); im.src = innerWidth > 900 ? big : src;
  im.decode().catch(() => {}).finally(() => { img.src = im.src; img.style.opacity = 1; });
}

function onScroll() {
  if (!active) return;
  if (!ready) { const p = progress(); setStep(Math.round(p)); return; }
  C.kick();
}

export function init() {
  stage = $('story-stage'); host = $('story-host'); steps = [...document.querySelectorAll('.story-step')];
  if (!stage || !steps.length) return;
  setStep(0); showFallback('before');
  document.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; onScroll(); }); }, {passive: true});
  // Load when the story is near the screen; attach the shared canvas while it is in view.
  const near = new IntersectionObserver(es => { if (es[0].isIntersecting) { near.disconnect(); load(); } }, {rootMargin: '1200px 0px'});
  near.observe($('story'));
  new IntersectionObserver(es => {
    active = es[0].isIntersecting;
    if (active && ready) V.attach(host, 'story');
  }, {rootMargin: '0px', threshold: 0}).observe(stage.parentElement);
  document.addEventListener('rec:attach', e => { if (e.detail !== 'story' && C) resetMeshes(); });
  document.addEventListener('rec:resize', () => { if (cam && host.contains(C.renderer.domElement)) { const r = host.getBoundingClientRect(); cam.aspect = r.width / r.height; cam.updateProjectionMatrix(); } });
}

async function load() {
  const st = $('story-load');
  try {
    const mb = b => (b / 1048576).toFixed(0);
    await V.loadGroup('story', (n, total) => { st.textContent = `Загружаем модель v10: ${mb(n)} из ${mb(total)} МБ`; });
    ({THREE} = V.core()); C = V.core();
    cam = new THREE.PerspectiveCamera(30, 1, .5, 400);
    splitBothSides(); buildEdges();
    V.setStoryHook(render);
    ready = true; stage.classList.add('is-live'); st.textContent = 'Живая модель v10';
    if (active) V.attach(host, 'story');
    const r = host.getBoundingClientRect(); cam.aspect = r.width / Math.max(1, r.height); cam.updateProjectionMatrix();
    V.loadGroup('life').then(() => C.kick()).then(() => V.loadGroup('details')).then(() => C.kick()).catch(() => {});
  } catch (e) {
    console.warn('story model unavailable', e);
    st.textContent = e.message === 'no-webgl' ? 'Браузер не поддерживает WebGL: показаны рендеры модели.' : 'Модель не загрузилась (' + (e && e.message || e) + '): показаны рендеры модели.';
  }
}
