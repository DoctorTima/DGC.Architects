// One architectural shell in every mode. Floors are cut from that same mesh.
export const LEVELS = [0, 1, 3.8, 6.6, 9.4, 12.2];
export const ROOF_LEVEL = 16.9;
export const TECH_LEVEL = 15;
export function meshVisible(meta, c) {
  if (meta.transitionRole || meta.transitionOnly || meta.representation === 'transition') return false;
  if (meta.stage === 'before') return c.state === 'before';
  if (c.state !== 'after') return false;
  const cat = meta.category;
  if (cat === 'courtyard') return c.yard && !c.floor;
  if (meta.representation === 'technical' && c.floor && c.floor !== 7) return false;
  if (meta.representation === 'roof') {
    if (!c.roof || (c.floor && c.floor !== 6 && c.floor !== 7)) return false;
    if (meta.group === 'roof_stair_extension' && !c.stairs) return false;
  }
  if (cat === 'curtains' && (!c.glass || (c.floor > 0 && c.floor < 6))) return false;
  if (meta.representation === 'interior') {
    if (c.floor >= 6 || (c.floor && meta.floor !== c.floor)) return false;
    if (c.floor && cat === 'wall_high') return false;
  }
  if (cat?.includes('glass') && !c.glass) return false;
  if ((cat === 'slabs' || cat === 'exterior_slabs' || cat === 'roof' || cat === 'finish') && !c.slabs) return false;
  if (cat === 'door_swing' && !c.floor && (!c.mode || c.mode==='none')) return false;
  if ((cat === 'stairs' || meta.requiresStairs) && !c.stairs) return false;
  if (meta.requiresStairs && meta.floor === 6 && !c.roof) return false;
  if ((cat === 'furniture' || cat === 'finish') && !c.furniture) return false;
  return true;
}
// [nx, ny, nz, constant], with positive signed distance kept, as in Three.js.
export function clippingFor(meta, c) {
  if (meta.stage === 'before' || meta.category === 'courtyard' || c.state !== 'after') return [];
  const planes = [];
  if (c.floor > 0 && c.floor < 6) {
    const base = LEVELS[c.floor];
    planes.push([0, 1, 0, -(base - .2)], [0, -1, 0, base + 1.12]);
  } else if (c.floor === 6) planes.push([0, 1, 0, -(ROOF_LEVEL - .32)]);
  else if (c.floor === 7) planes.push([0, 1, 0, -(TECH_LEVEL - .18)], [0, -1, 0, TECH_LEVEL + 1.12]);
  const t = c.slice / 100, sign = c.flip || 1;
  // Full retained side: identical material sides and zero redundant clip shader.
  if ((t >= 1 && sign === 1) || (t <= 0 && sign === -1)) return planes;
  if (c.mode === 'x') planes.push([-sign, 0, 0, sign * (-27 + 54 * t)]);
  if (c.mode === 'z') planes.push([0, 0, -sign, sign * (-13 + 26 * t)]);
  if (c.mode === 'y') planes.push([0, -sign, 0, sign * (-1 + 24 * t)]);
  return planes;
}
