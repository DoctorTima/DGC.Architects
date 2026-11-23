// Chapter 05 without the live scene: pre-rendered frames of the same REC v10 model (6 or 3 per step),
// scrubbed by scroll exactly like the 3D (same progress formula as story.js). Two neighbouring frames
// are cross-faded, so the move between frames stays smooth. No three.js here: this module must run
// on old iPhones and in in-app browsers even when the 3D library cannot. When the live model is ready
// story.js adds .is-live to the stage and the frames fade out.
const $ = id => document.getElementById(id);
// wide stages: 6 frames per step (61); narrow (phones): 3 per step (31)
const SETS = {land: {dir: 'assets/frames/rec-story/l', per: 6}, port: {dir: 'assets/frames/rec-story/p', per: 3}};
const STEPS = 10;

let stage, box, a, b, steps, set = '', lastP = 0, raf = 0, current = -1, queue = null;
const cache = new Map();

function progress() {
  const vc = innerHeight * .55, cs = steps.map(s => { const r = s.getBoundingClientRect(); return r.top + r.height / 2; });
  if (vc <= cs[0]) return 0;
  for (let i = 0; i < cs.length - 1; i++) if (vc < cs[i + 1]) return i + (vc - cs[i]) / (cs[i + 1] - cs[i]);
  return cs.length - 1;
}
const url = (s, k) => `${SETS[s].dir}/f${String(k).padStart(3, '0')}.webp`;
function get(s, k) {
  const key = s + k; let e = cache.get(key);
  if (!e) {
    const im = new Image(); e = {im, ok: false};
    im.onload = () => { e.ok = true; if (s === set && !live()) draw(lastP); };
    im.src = url(s, k); cache.set(key, e);
  }
  return e;
}
const live = () => stage.classList.contains('is-live');
// the camera of the live story frames wide stages from the side and narrow ones from below: two sets
const pick = () => stage.clientWidth >= 900 ? 'land' : 'port';

function draw(p) {
  lastP = p;
  const s = pick();
  if (s !== set) { set = s; box.dataset.set = s; preloadAll(); }
  const per = SETS[s].per, N = STEPS * per + 1;
  const x = Math.max(0, Math.min(N - 1, p * per)), k0 = Math.floor(x), k1 = Math.min(N - 1, k0 + 1), f = x - k0;
  for (let d = -2; d <= 5; d++) if (k0 + d >= 0 && k0 + d < N) get(s, k0 + d);
  const e0 = get(s, k0), e1 = get(s, k1);
  if (e0.ok && a.src !== e0.im.src) a.src = e0.im.src;
  // a short blend in the middle of the move between two frames: crisp frames most of the time, no hard jump
  const blend = Math.max(0, Math.min(1, (f - .3) / .4)), o = blend * blend * (3 - 2 * blend);
  if (e1.ok) { if (b.src !== e1.im.src) b.src = e1.im.src; b.style.opacity = e0.ok ? o.toFixed(3) : 1; }
  else b.style.opacity = 0;
}
// after the frames near the reader, the rest of the set loads one by one in the background
function preloadAll() {
  const s = set; if (queue === s) return; queue = s;
  const N = STEPS * SETS[s].per + 1; let k = 0;
  const next = () => {
    if (queue !== s || k >= N) return;
    const e = get(s, k++);
    if (e.ok) next(); else { e.im.addEventListener('load', next, {once: true}); e.im.addEventListener('error', next, {once: true}); }
  };
  next();
}
function setStep(i) {
  if (i === current || live()) return; current = i;
  steps.forEach((s, n) => s.classList.toggle('is-active', n === i));
  const c = $('story-count'); if (c) c.textContent = String(i + 1).padStart(2, '0');
  const r = $('story-rail'); if (r) r.style.setProperty('--k', (i / (steps.length - 1)).toFixed(3));
}
function onScroll() {
  raf = 0; if (live()) return;
  const p = progress(); setStep(Math.round(p)); draw(p);
}

export function init() {
  stage = $('story-stage'); box = $('story-frames'); steps = [...document.querySelectorAll('.story-step')];
  if (!stage || !box || !steps.length) return false;
  [a, b] = box.querySelectorAll('img');
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(onScroll); }, {passive: true});
  addEventListener('resize', () => { if (!raf) raf = requestAnimationFrame(onScroll); });
  onScroll();
  return true;
}
