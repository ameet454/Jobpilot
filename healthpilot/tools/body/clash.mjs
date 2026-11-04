// Finds poses where body parts pass through each other, through equipment or
// through the floor, using the skinned body mesh (same maths as the app's
// SkinnedMesh). Used by tests/body-clash.test.js and clash-report.mjs.
import { readFileSync } from 'node:fs';
import { EXERCISE_BY_ID } from '../../src/data/exercises.js';
import { FLOOR_Y, rig, v } from '../../src/lib/rig3d.js';
import { boneFrames, unpackBody } from '../../src/components/bodyModel.js';

const meta = JSON.parse(readFileSync(new URL('../../public/body/body.json', import.meta.url)));
const raw = readFileSync(new URL('../../public/body/body.bin', import.meta.url));
const D = unpackBody(meta, raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
const n = meta.vertexCount;
const P = D.position;

const regionOfBone = (b) => (/^(pelvis|chest|girdle)/.test(b) ? 'trunk' : b === 'head' ? 'head' : /^(ua|fa|hand)/.test(b) ? `arm${b.endsWith('-1') ? '-1' : '1'}` : `leg${b.endsWith('-1') ? '-1' : '1'}`);
const region = new Array(n);
const isEye = new Uint8Array(n);
for (let i = 0; i < n; i += 1) {
  let best = 0; for (let k = 1; k < 4; k += 1) if (D.skinWeight[i * 4 + k] > D.skinWeight[i * 4 + best]) best = k;
  region[i] = regionOfBone(meta.bones[D.skinIndex[i * 4 + best]]);
  isEye[i] = D.attr[i * 2];
}
const rest = meta.bones.map((b) => meta.rest[b]);
const local = (fr, p) => { const d = v.sub(p, fr.a); return [v.dot(d, fr.l), v.dot(d, fr.u), v.dot(d, fr.f)]; };
const world = (fr, q, k) => v.add(fr.a, v.add(v.add(v.mul(fr.l, q[0]), v.mul(fr.u, q[1] * k)), v.mul(fr.f, q[2])));

/** Posed vertex positions for rig R (`flat`: palms-flat hand morph). */
export function skin(R, flat = false) {
  const F = boneFrames(meta, R);
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    const p = [P[i * 3] + (flat ? D.flat[i * 3] : 0), P[i * 3 + 1] + (flat ? D.flat[i * 3 + 1] : 0), P[i * 3 + 2] + (flat ? D.flat[i * 3 + 2] : 0)];
    let x = 0; let y = 0; let z = 0;
    for (let k = 0; k < 4; k += 1) {
      const w = D.skinWeight[i * 4 + k] / 255; if (!w) continue;
      const bi = D.skinIndex[i * 4 + k];
      const q = world(F[bi].fr, local(rest[bi], p), F[bi].stretch);
      x += q[0] * w; y += q[1] * w; z += q[2] * w;
    }
    out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
  }
  return out;
}

const VOX = 2.5;
const key = (x, y, z) => `${Math.floor(x / VOX)},${Math.floor(y / VOX)},${Math.floor(z / VOX)}`;
/** Voxels shared by regions that should not overlap, ignoring the joints where they attach. */
export function clashes(R, S) {
  const occ = {};
  for (let i = 0; i < n; i += 1) {
    if (isEye[i]) continue;
    const p = [S[i * 3], S[i * 3 + 1], S[i * 3 + 2]];
    const r = region[i];
    if (r.startsWith('arm') && v.len(v.sub(p, R.J[`shoulder${r.slice(3)}`])) < 15) continue;
    if (r.startsWith('leg') && v.len(v.sub(p, R.J[`hip${r.slice(3)}`])) < 17) continue;
    if (r === 'trunk' && (v.len(v.sub(p, R.J.shoulder1)) < 11 || v.len(v.sub(p, R.J['shoulder-1'])) < 11)) continue;
    (occ[key(...p)] ||= new Set()).add(r);
  }
  const pairs = {};
  for (const set of Object.values(occ)) {
    if (set.size < 2) continue;
    const rs = [...set].sort();
    for (let a = 0; a < rs.length; a += 1) for (let b = a + 1; b < rs.length; b += 1) {
      const pk = `${rs[a]}×${rs[b]}`;
      if (pk === 'head×trunk' || pk === 'leg-1×leg1') continue;
      pairs[pk] = (pairs[pk] || 0) + 1;
    }
  }
  return pairs;
}

/** How far the lowest vertex sinks below the floor. */
export function floorDepth(S) {
  let y = Infinity;
  for (let i = 1; i < S.length; i += 3) y = Math.min(y, S[i]);
  return Math.max(0, -y);
}

function propBoxes(ex, ox) {
  const boxes = [];
  ex.props.forEach((pr, pi) => {
    if (pr.t !== 'line' || pr.kind === 'bar' || pr.kind === 'dipbars') return; // bars are held in the fists
    const pts = pr.pts.map(([x, y]) => [x - ox, FLOOR_Y - y, 0]);
    for (let i = 0; i < pts.length - 1; i += 1) {
      const zs = pr.kind === 'dipbars' ? [-26, 26] : [pr.z || 0];
      const depth = pr.d || (pr.kind === 'dipbars' || pr.w <= 6 ? 5 : 30);
      for (const z of zs) boxes.push({ pi, seg: i, a: pts[i], b: pts[i + 1], z, half: [v.len(v.sub(pts[i + 1], pts[i])) / 2, pr.w / 2, depth / 2] });
    }
  });
  return boxes;
}
/** Equipment boxes the body cuts into: [{ prop, seg, depth, push }] (push = 2-D move, y down, that clears it). */
export function propClashes(ex, S, ox) {
  const out = [];
  for (const bx of propBoxes(ex, ox)) {
    const c = v.lerp(bx.a, bx.b, 0.5); c[2] = bx.z;
    const ux = v.norm(v.sub(bx.b, bx.a)); const uy = [-ux[1], ux[0], 0];
    let deepPos = 0; let deepNeg = 0; let count = 0;
    for (let i = 0; i < n; i += 1) {
      const d = [S[i * 3] - c[0], S[i * 3 + 1] - c[1], S[i * 3 + 2] - c[2]];
      if (Math.abs(v.dot(d, ux)) > bx.half[0] || Math.abs(d[2]) > bx.half[2]) continue;
      const y = v.dot(d, uy);
      if (Math.abs(y) >= bx.half[1]) continue;
      count += 1;
      if (y >= 0) deepPos = Math.max(deepPos, y + bx.half[1]); else deepNeg = Math.max(deepNeg, bx.half[1] - y);
    }
    if (count < 15) continue;
    const moveAlong = deepPos >= deepNeg ? -deepPos : deepNeg;
    const push = [uy[0] * moveAlong, -uy[1] * moveAlong];
    out.push({ prop: bx.pi, seg: bx.seg, count, depth: +Math.max(deepPos, deepNeg).toFixed(1), push: push.map((q) => +q.toFixed(1)) });
  }
  return out;
}

export function centreX(ex) {
  if (ex.view === 'front') return 150;
  const xs = []; for (const t of [0, 0.5, 1]) xs.push(...Object.values(rig(ex, t, 0).J).map((p) => p[0]));
  return (Math.min(...xs) + Math.max(...xs)) / 2;
}

// Arms resting against the ribs while standing is normal skin contact: measure above that.
const STANDING = (() => { const ex = EXERCISE_BY_ID['barbell-curl']; const R = rig(ex, 0, centreX(ex)); return clashes(R, skin(R)); })();
export const BASE = STANDING;

/** Worst body overlap above baseline, deepest equipment cut and floor sink over one rep. */
export function analyse(ex, steps = 10) {
  const ox = centreX(ex);
  const worst = {}; const props = {}; let floor = { depth: 0, t: 0 };
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps; const R = rig(ex, t, ox); const S = skin(R, ex.hands === 'flat');
    for (const [k, c] of Object.entries(clashes(R, S))) { const x = c - (BASE[k] || 0); if (!worst[k] || worst[k].c < x) worst[k] = { c: x, t }; }
    for (const pc of propClashes(ex, S, ox)) { const k = `${pc.prop}.${pc.seg}`; if (!props[k] || props[k].depth < pc.depth) props[k] = { ...pc, t }; }
    if (!ex.noFloor) { const d = floorDepth(S); if (d > floor.depth) floor = { depth: +d.toFixed(1), t }; }
  }
  return { body: worst, props, floor };
}
export { meta };
