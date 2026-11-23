import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureTransform, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { prune, dedup, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import { spawnSync } from 'child_process';
import fs from 'fs';

const [,, src, dst, room] = process.argv;
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(src);
const root = doc.getRoot();
const TT = doc.createExtension(KHRTextureTransform);
for (const e of root.listExtensionsUsed()) if (e.extensionName === 'KHR_draco_mesh_compression') e.dispose();

const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const rgb = (r, g, b, a = 1) => [lin(r), lin(g), lin(b), a];
const TEX = '/home/claude/ws/web_tex/';
const texCache = {};
function img(name) {
  if (!texCache[name]) {
    const t = doc.createTexture(name).setImage(fs.readFileSync(TEX + name + '.jpg')).setMimeType('image/jpeg').setURI(name + '.jpg');
    texCache[name] = t;
  }
  return texCache[name];
}
function py(buf, args) {
  const r = spawnSync('python3', ['' + new URL('./wabi_imgtool.py', import.meta.url).pathname + '', ...args.map(String)], { input: Buffer.from(buf), maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(r.stderr.toString());
  return new Uint8Array(r.stdout);
}
function tiled(mat, tex, metres, rough, factor = [1, 1, 1, 1]) {
  mat.setBaseColorTexture(img(tex)).setBaseColorFactor(factor).setRoughnessFactor(rough).setMetallicFactor(0);
  const s = 1 / metres;
  mat.getBaseColorTextureInfo().setExtension('KHR_texture_transform', TT.createTransform().setScale([s, s]));
}
function solid(mat, c, rough, metal = 0) {
  mat.setBaseColorTexture(null).setBaseColorFactor(c).setRoughnessFactor(rough).setMetallicFactor(metal);
}
const doneTex = new Set();
function resizeTex(tex, maxside, q = 80, tint) {
  if (!tex || doneTex.has(tex)) return; doneTex.add(tex);
  const before = tex.getImage().byteLength;
  tex.setImage(py(tex.getImage(), tint ? [maxside, q, ...tint] : [maxside, q])).setMimeType('image/jpeg');
  console.log('  tex', tex.getName().slice(0, 12), before, '->', tex.getImage().byteLength);
}

const BLACK = rgb(22, 21, 20);
for (const mat of root.listMaterials()) {
  const n = mat.getName().replace(/^WEB::/, '');
  const base = n.replace(/\.\d{3}$/, '');
  mat.setName(n);
  if (/^(_5|_\.|_5\.001)$/.test(n) || n === '_.001') tiled(mat, 'plaster', 1.6, 0.95);
  else if (base === '_4') tiled(mat, 'acrylic', 0.7, 0.42);
  else if (base === '_1' || n === '_1.001') tiled(mat, 'stone', 1.2, 0.6);
  else if (/^(Oak Veneer|Wood Veneer|prop_oak)/.test(n)) tiled(mat, 'oak', 1.1, 0.62);
  else if (/^prop_walnut/.test(n)) tiled(mat, 'oak', 1.1, 0.62, rgb(150, 120, 100));
  else if (base === '_15') solid(mat, rgb(74, 48, 33), 0.95);
  else if (/^Creative 4230/.test(n)) { resizeTex(mat.getBaseColorTexture(), 1024, 82, [126, 96, 70, 0.95]); mat.setRoughnessFactor(0.6); }
  else if (base === 'rubberRed') solid(mat, rgb(34, 28, 24), 0.8);
  else if (base === 'prop_ceramic_charcoal') solid(mat, rgb(62, 58, 54), 0.55);
  else if (base === 'prop_ceramic_white') solid(mat, rgb(226, 219, 206), 0.4);
  else if (base === 'prop_ceramic_clay') solid(mat, rgb(176, 130, 98), 0.8);
  else if (/^(Metal_Black_Iron|Support_Black_Steel|Organic_Metal_Black|Metal_Black_Graphite|Organic_Socket_Black)/.test(n)) solid(mat, BLACK, 0.5, 0.6);
  else if (base === '[0059_DarkOliveGreen]') solid(mat, rgb(92, 94, 64), 0.8);
  else if (/^(Organic_Piping_Chenille)/.test(n)) solid(mat, rgb(214, 200, 180), 0.95);
  else if (/^(Organic_Bulb_White|Bulb_Opal)/.test(n)) solid(mat, rgb(242, 238, 228), 0.4);
  else if (/^SKP Default/.test(n)) solid(mat, rgb(224, 216, 204), 0.7);
  else if (/^Zendi - Logo/.test(n)) solid(mat, BLACK, 0.6, 0.5);
  // большие текстуры — ужать
  const t = mat.getBaseColorTexture();
  if (t && !Object.values(texCache).includes(t)) {
    const sz = t.getImage().byteLength;
    if (/Rattan/.test(n)) resizeTex(t, 512, 78);
    else if (/HSG636/.test(n)) resizeTex(t, 768, 80);
    else if (sz > 90000) resizeTex(t, 512, 80);
  }
  const ti0 = mat.getBaseColorTextureInfo();
  if (ti0 && ti0.getTexCoord() < 0) ti0.setTexCoord(0);
  if (mat.getEmissiveFactor().some((v) => v > 0)) mat.setEmissiveFactor([1, 0.93, 0.82]);
}
// пол «ёлочкой»: у коробки пола нет UV — плоская развёртка в метрах (текстура ≈ 1,3 × 0,98 м)
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
  const m = p.getMaterial();
  if (!m || !/^Creative 4230/.test(m.getName())) continue; console.log('  chevron had uv:', !!p.getAttribute('TEXCOORD_0'));
  const pos = p.getAttribute('POSITION'), n = pos.getCount(), uv = new Float32Array(n * 2), v = [0, 0, 0];
  for (let i = 0; i < n; i++) { pos.getElement(i, v); uv[i * 2] = v[0] / 1.3; uv[i * 2 + 1] = v[2] / 0.98; }
  p.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(uv).setBuffer(root.listBuffers()[0]));
  console.log('  chevron UV', mesh.getName(), n);
}
// проверка UV у плиточных материалов
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
  const m = p.getMaterial();
  if (m && m.getBaseColorTexture() && !p.getAttribute('TEXCOORD_0')) console.log('  NO UV:', mesh.getName(), m.getName());
}
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
  for (const sem of p.listSemantics()) if (/^TEXCOORD_[1-9]/.test(sem) || (sem === 'TEXCOORD_0' && !(p.getMaterial() && p.getMaterial().getBaseColorTexture()))) p.setAttribute(sem, null);
}
await doc.transform(dedup(), prune({ keepAttributes: true }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
let tris = 0, prims = 0;
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) { prims++; tris += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3; }
await io.write(dst, doc);
console.log(room, 'prims', prims, 'tris', Math.round(tris), 'bytes', fs.statSync(dst).size);
for (const n of root.listNodes()) console.log('  node', n.getName(), n.getTranslation().map(v=>+v.toFixed(3)), n.getScale().map(v=>+v.toFixed(3)));
