// Finds poses where body parts pass through each other or through equipment,
// using the real skinned anatomy mesh (same maths as the app's SkinnedMesh).
// Imported by clash-report.mjs (CLI) and fit-props.mjs.
import { readFileSync } from 'node:fs';
import { EXERCISES } from '../../src/data/exercises.js';
import { rig, v } from '../../src/lib/rig3d.js';

const meta = JSON.parse(readFileSync(new URL('../../public/anatomy/anatomy.json', import.meta.url)));
const buf = readFileSync(new URL('../../public/anatomy/anatomy.bin', import.meta.url));
const n = meta.vertexCount;
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const pos16 = new Int16Array(ab, 0, n * 3);
const sIdx = new Uint8Array(ab, n * 6, n * 4);
const sW = new Uint8Array(ab, n * 10, n * 4);
const P = Float32Array.from(pos16, (x) => x / meta.quant);

// Region of each vertex = region of its strongest bone.
const regionOfBone = (b) => (/^(pelvis|chest|girdle)/.test(b) ? 'trunk' : b === 'head' ? 'head' : /^(ua|fa|hand)/.test(b) ? `arm${b.endsWith('-1') ? '-1' : '1'}` : `leg${b.endsWith('-1') ? '-1' : '1'}`);
const region = new Array(n);
for (let i = 0; i < n; i += 1) {
  let best = 0; for (let k = 1; k < 4; k += 1) if (sW[i * 4 + k] > sW[i * 4 + best]) best = k;
  region[i] = regionOfBone(meta.bones[sIdx[i * 4 + best]]);
}

// 3x4 matrices as [l, u, f, a] columns.
const restInv = meta.bones.map((b) => meta.rest[b]);
function localOf(fr, p) { const d = v.sub(p, fr.a); return [v.dot(d, fr.l), v.dot(d, fr.u), v.dot(d, fr.f)]; }
function worldOf(fr, q, stretch = 1) { return v.add(fr.a, v.add(v.add(v.mul(fr.l, q[0]), v.mul(fr.u, q[1] * stretch)), v.mul(fr.f, q[2]))); }

function posedFrames(R) {
  const by = {}; for (const b of R.bones) by[b.side ? `${b.key}${b.side}` : b.key] = b;
  return meta.bones.map((name) => {
    if (name === 'head') {
      const t = by.chest; const u = v.norm(v.sub(R.J.head, R.J.neck));
      const f = v.norm(v.sub(t.f, v.mul(u, v.dot(t.f, u))));
      return { fr: { a: R.J.neck, u, f, l: v.norm(v.cross(u, f)) }, k: 1 };
    }
    if (name.startsWith('hand')) { const fa = by[`fa${name.slice(4)}`]; return { fr: { ...fa, a: fa.b }, k: 1 }; }
    const fr = by[name];
    return { fr, k: /^foot/.test(name) ? 1 : v.len(v.sub(fr.b, fr.a)) / meta.rest[name].len };
  });
}

export function skin(R) {
  const F = posedFrames(R);
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    const p = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
    let x = 0; let y = 0; let z = 0;
    for (let k = 0; k < 4; k += 1) {
      const w = sW[i * 4 + k] / 255; if (!w) continue;
      const bi = sIdx[i * 4 + k];
      const q = worldOf(F[bi].fr, localOf(restInv[bi], p), F[bi].k);
      x += q[0] * w; y += q[1] * w; z += q[2] * w;
    }
    out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
  }
  return out;
}

const VOX = 2.5;
const key = (x, y, z) => `${Math.floor(x / VOX)},${Math.floor(y / VOX)},${Math.floor(z / VOX)}`;

/** Count voxels shared by regions that should not overlap, ignoring the joints where they meet. */
export function clashes(R, S) {
  const occ = {};
  for (let i = 0; i < n; i += 1) {
    const p = [S[i * 3], S[i * 3 + 1], S[i * 3 + 2]];
    const r = region[i];
    // Ignore the attachment zones (shoulder, hip) where limbs legitimately meet the trunk.
    if (r.startsWith('arm') && v.len(v.sub(p, R.J[`shoulder${r.slice(3)}`])) < 14) continue;
    if (r.startsWith('leg') && v.len(v.sub(p, R.J[`hip${r.slice(3)}`])) < 16) continue;
    if (r === 'trunk' && (v.len(v.sub(p, R.J.shoulder1)) < 10 || v.len(v.sub(p, R.J['shoulder-1'])) < 10)) continue;
    const k = key(...p);
    (occ[k] ||= new Set()).add(r);
  }
  const pairs = {};
  for (const set of Object.values(occ)) {
    if (set.size < 2) continue;
    const rs = [...set].sort();
    for (let a = 0; a < rs.length; a += 1) for (let b = a + 1; b < rs.length; b += 1) {
      const pk = `${rs[a]}×${rs[b]}`;
      if (pk === 'head×trunk' || pk === 'leg-1×leg1') continue; // neck; thighs touch at the groin
      pairs[pk] = (pairs[pk] || 0) + 1;
    }
  }
  return pairs;
}

/**
 * Equipment boxes (benches, seats, pads) and how deep the body cuts into each:
 * [{ prop, seg, depth, push }] where push is the 2-D direction (in the app's
 * 2-D coordinates, y down) to move that box so it just touches the body.
 */
function propBoxes(ex, ox) {
  const boxes = [];
  ex.props.forEach((pr, pi) => {
    if (pr.t !== 'line' || pr.kind === 'bar') return;
    const pts = pr.pts.map(([x, y]) => [x - ox, 241 - y, 0]);
    for (let i = 0; i < pts.length - 1; i += 1) {
      const zs = pr.kind === 'dipbars' ? [-22, 22] : [pr.z || 0];
      const depth = pr.d || (pr.kind === 'dipbars' || pr.w <= 6 ? 5 : 30);
      for (const z of zs) boxes.push({ pi, seg: i, a: pts[i], b: pts[i + 1], z, half: [v.len(v.sub(pts[i + 1], pts[i])) / 2, pr.w / 2, depth / 2] });
    }
  });
  return boxes;
}
export function propClashes(ex, R, S, ox) {
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
      // depth needed to clear the vertex by moving the box along -uy (vertex above) or +uy (below)
      if (y >= 0) deepPos = Math.max(deepPos, y + bx.half[1]); else deepNeg = Math.max(deepNeg, bx.half[1] - y);
    }
    if (count < 15) continue;
    // Move the box away from the side most of the body is on, by the depth on that side.
    const moveAlong = deepPos >= deepNeg ? -deepPos : deepNeg; // along uy (world, y up)
    const push = [uy[0] * moveAlong, -uy[1] * moveAlong]; // to 2-D (y down)
    out.push({ prop: bx.pi, seg: bx.seg, count, depth: +Math.max(deepPos, deepNeg).toFixed(1), push: push.map((q) => +q.toFixed(1)) });
  }
  return out;
}

export const BASE = { 'arm1×trunk': 69, 'arm-1×trunk': 64, 'leg1×trunk': 1, 'leg-1×trunk': 1 };

export function centreX(ex) {
  if (ex.view === 'front') return 150;
  const xs = []; for (const t of [0, 0.5, 1]) xs.push(...Object.values(rig(ex, t, 0).J).map((p) => p[0]));
  return (Math.min(...xs) + Math.max(...xs)) / 2;
}

/** Worst body-on-body overlap (above the untouched baseline) and deepest equipment cut over one rep. */
export function analyse(ex, steps = 10) {
  const ox = centreX(ex);
  const worst = {}; const props = {};
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps; const R = rig(ex, t, ox); const S = skin(R);
    for (const [k, c] of Object.entries(clashes(R, S))) { const x = c - (BASE[k] || 0); if (!worst[k] || worst[k].c < x) worst[k] = { c: x, t }; }
    for (const pc of propClashes(ex, R, S, ox)) { const k = `${pc.prop}.${pc.seg}`; if (!props[k] || props[k].depth < pc.depth) props[k] = { ...pc, t }; }
  }
  return { body: worst, props };
}
export { meta, P };
