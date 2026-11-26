import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, quantize, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { spawnSync } from 'child_process';
import fs from 'fs';

const [,, src, dst] = process.argv;
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(src);
const root = doc.getRoot();
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const rgb = (r, g, b, a = 1) => [lin(r), lin(g), lin(b), a];
function img(buf, max, q, fmt) {
  const r = spawnSync('python3', ['/home/claude/liv/tools/imgtool.py', String(max), String(q), fmt], { input: Buffer.from(buf), maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(r.stderr.toString());
  return new Uint8Array(r.stdout);
}
// тонировка SketchUp (материалы type=2): как в окне SketchUp, а не исходная картинка
const SKP = JSON.parse(fs.readFileSync('/home/claude/liv/skp_materials.json', 'utf8'));
const colorized = new Set();
for (const m of root.listMaterials()) {
  const base = m.getName().replace(/\.\d{3}$/, '');
  const info = SKP[base];
  const t = m.getBaseColorTexture();
  if (!info || info.type !== 2 || !t || colorized.has(t)) continue;
  const a = info.avg; const avg = [a & 255, (a >>> 8) & 255, (a >>> 16) & 255];
  const r = spawnSync('python3', ['/home/claude/liv/tools/colorize.py', ...info.color.map(String), String(info.colorize), ...avg.map(String)], { input: Buffer.from(t.getImage()), maxBuffer: 128 << 20 });
  if (r.status !== 0) throw new Error(r.stderr.toString());
  t.setImage(new Uint8Array(r.stdout)).setMimeType('image/png');
  colorized.add(t);
  m.setBaseColorFactor([1, 1, 1, m.getBaseColorFactor()[3]]);
  console.log('colorize', base, info.color, info.colorize ? 'tint' : 'shift');
}
// барные стулья — коричневые (просьба Тимофея 27.11)
for (const m of root.listMaterials()) if (m.getName().replace(/\.\d{3}$/, '') === '_15') { m.setBaseColorTexture(null).setBaseColorFactor(rgb(84, 56, 40)).setRoughnessFactor(0.88).setMetallicFactor(0); console.log('stools brown'); }
// какие текстуры нужны с прозрачностью
function probe(buf) {
  const r = spawnSync('python3', ['/home/claude/liv/tools/probe.py'], { input: Buffer.from(buf), maxBuffer: 64 << 20 });
  return parseFloat(r.stdout.toString());
}
const needAlpha = new Set();
const texAlpha = new Map();
for (const t of root.listTextures()) texAlpha.set(t, probe(t.getImage()));
for (const m of root.listMaterials()) {
  const t = m.getBaseColorTexture();
  const fa = m.getBaseColorFactor()[3];
  const ta = t ? texAlpha.get(t) : 0;
  if (fa > 0.95 && ta < 0.01) m.setAlphaMode('OPAQUE');
  else if (fa > 0.95 && ta >= 0.01) { m.setAlphaMode('MASK'); m.setAlphaCutoff(0.5); if (t) needAlpha.add(t); }
  else { m.setAlphaMode('BLEND'); if (t && ta >= 0.01) needAlpha.add(t); }
  console.log('mat', m.getName().slice(0, 34).padEnd(34), m.getAlphaMode(), fa.toFixed(2), t ? ta.toFixed(3) : '-');
}
const BIG = /(Chevron|Altea|boucle|Картина|панно|ковер)/i;
for (const t of root.listTextures()) {
  const before = t.getImage().byteLength;
  const alpha = needAlpha.has(t);
  const max = alpha ? 384 : (BIG.test(t.getName() || t.getURI()) ? 1024 : 512);
  t.setImage(img(t.getImage(), max, 80, alpha ? 'png' : 'jpg')).setMimeType(alpha ? 'image/png' : 'image/jpeg');
  console.log('tex', (t.getName() || '').slice(0, 30).padEnd(30), before, '->', t.getImage().byteLength, alpha ? 'PNG' : '');
}
for (const m of root.listMaterials()) {
  const n = m.getName();
  const ti = m.getBaseColorTextureInfo();
  if (ti && ti.getTexCoord() < 0) ti.setTexCoord(0);
  if (m.getEmissiveFactor().some((v) => v > 0)) m.setEmissiveFactor([1, 0.93, 0.82]);
  if (m.getAlphaMode() === 'BLEND' && m.getBaseColorFactor()[3] > 0.95 && !m.getBaseColorTexture()) m.setAlphaMode('OPAQUE');
}
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
  const mt = p.getMaterial();
  for (const sem of p.listSemantics()) if (/^TEXCOORD_[1-9]/.test(sem) || (/^COLOR_/.test(sem) && !(mt && /^Relief/.test(mt.getName()))) || (sem === 'TEXCOORD_0' && !(mt && mt.getBaseColorTexture()))) p.setAttribute(sem, null);
  if (mt && mt.getBaseColorTexture() && !p.getAttribute('TEXCOORD_0')) console.log('NO UV', mesh.getName(), mt.getName());
}
await doc.transform(dedup(), weld({ tolerance: 0.0001 }), prune({ keepAttributes: false }), quantize());
let tris = 0, prims = 0;
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) { prims++; tris += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3; }
await io.write(dst, doc);
console.log('prims', prims, 'tris', Math.round(tris), 'bytes', fs.statSync(dst).size);
for (const n of root.listNodes()) console.log('node', n.getName(), n.getMesh() ? n.getMesh().listPrimitives().length : 0);
