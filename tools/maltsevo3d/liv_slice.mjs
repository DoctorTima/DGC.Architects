import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import fs from 'fs';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
const Y = +process.argv[4] || 1.2;
const SKIP = /curtain|Blinds|LightGray|Snow|Concrete|Ribbl|boucle|Wabi|Linvud|Mila|Hoster|Nevil|Organic|Rogozhka|Zendi|cordon|_9$|Color|Brass|Gold|Metal|Iron|Steel|Zinc|Grace|Contact|Earth|Screw|Felt|Bulb|Lamp|Pine|Walnut|Cotton|emit|Light spot/i;
const segs = [];
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const grp = node.getName();
  if (!/^(BASE|KITCHEN_A|KITCHEN_B)$/.test(grp)) continue;
  const M = node.getWorldMatrix();
  for (const p of mesh.listPrimitives()) {
    const mat = p.getMaterial(); const mn = mat ? mat.getName() : '';
    if (SKIP.test(mn)) continue;
    const pos = p.getAttribute('POSITION'); const idx = p.getIndices();
    const n = idx ? idx.getCount() : pos.getCount();
    const a = [0, 0, 0], v = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    const tf = (q) => [M[0] * q[0] + M[4] * q[1] + M[8] * q[2] + M[12], M[1] * q[0] + M[5] * q[1] + M[9] * q[2] + M[13], M[2] * q[0] + M[6] * q[1] + M[10] * q[2] + M[14]];
    for (let t = 0; t < n; t += 3) {
      for (let k = 0; k < 3; k++) { pos.getElement(idx ? idx.getScalar(t + k) : t + k, a); v[k] = tf(a); }
      const pts = [];
      for (let k = 0; k < 3; k++) {
        const P = v[k], Qv = v[(k + 1) % 3];
        if ((P[1] - Y) * (Qv[1] - Y) < 0) { const s = (Y - P[1]) / (Qv[1] - P[1]); pts.push([P[0] + s * (Qv[0] - P[0]), P[2] + s * (Qv[2] - P[2])]); }
      }
      if (pts.length === 2) segs.push([grp, mn, pts[0][0], pts[0][1], pts[1][0], pts[1][1]]);
    }
  }
}
fs.writeFileSync(process.argv[3], JSON.stringify(segs));
const by = {}; for (const s of segs) by[s[1]] = (by[s[1]] || 0) + 1;
console.log(segs.length, JSON.stringify(by));
