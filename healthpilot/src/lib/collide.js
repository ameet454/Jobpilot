/**
 * Rough body volumes for catching poses where body parts pass through each
 * other (arm through torso, leg through leg, bar through the chest…).
 * Capsules = a segment plus a radius, sized from the BodyParts3D anatomy.
 */
import { v } from './rig3d.js';

/** Closest distance between segments p1-q1 and p2-q2. */
export function segDist(p1, q1, p2, q2) {
  const d1 = v.sub(q1, p1); const d2 = v.sub(q2, p2); const r = v.sub(p1, p2);
  const a = v.dot(d1, d1); const e = v.dot(d2, d2); const f = v.dot(d2, r);
  let s; let t;
  if (a <= 1e-9 && e <= 1e-9) return v.len(r);
  if (a <= 1e-9) { s = 0; t = Math.max(0, Math.min(1, f / e)); } else {
    const c = v.dot(d1, r);
    if (e <= 1e-9) { t = 0; s = Math.max(0, Math.min(1, -c / a)); } else {
      const b = v.dot(d1, d2); const den = a * e - b * b;
      s = den > 1e-9 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); } else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
    }
  }
  return v.len(v.sub(v.add(p1, v.mul(d1, s)), v.add(p2, v.mul(d2, t))));
}

/** Body capsules for a rigged pose. Shortened at joints so neighbours may touch. */
export function capsules({ J }) {
  const shrink = (a, b, k0, k1) => [v.lerp(a, b, k0), v.lerp(a, b, k1)];
  const C = [
    { id: 'torso', seg: shrink(J.hip, J.neck, 0.05, 0.9), r: 12 },
    { id: 'head', seg: [J.head, J.head], r: 10 },
  ];
  for (const s of [1, -1]) {
    C.push({ id: `ua${s}`, seg: shrink(J[`shoulder${s}`], J[`elbow${s}`], 0.3, 0.85), r: 5 });
    C.push({ id: `fa${s}`, seg: shrink(J[`elbow${s}`], J[`hand${s}`], 0.2, 1), r: 4.2 });
    C.push({ id: `th${s}`, seg: shrink(J[`hip${s}`], J[`knee${s}`], 0.25, 0.85), r: 7 });
    C.push({ id: `sh${s}`, seg: shrink(J[`knee${s}`], J[`ankle${s}`], 0.15, 0.9), r: 5 });
  }
  return C;
}

// Pairs that are allowed to touch: same chain neighbours, and the two thighs/shins of one person.
const ALLOWED = new Set(['torso|ua1', 'torso|ua-1', 'torso|th1', 'torso|th-1', 'ua1|fa1', 'ua-1|fa-1', 'th1|sh1', 'th-1|sh-1', 'th1|th-1', 'head|torso']);

/** Penetrations deeper than `tol` between body capsules: [{ a, b, depth }]. */
export function bodyClashes(R, tol = 1.5) {
  const C = capsules(R);
  const out = [];
  for (let i = 0; i < C.length; i += 1) {
    for (let j = i + 1; j < C.length; j += 1) {
      const key = [C[i].id, C[j].id].join('|');
      if (ALLOWED.has(key) || ALLOWED.has([C[j].id, C[i].id].join('|'))) continue;
      const depth = C[i].r + C[j].r - segDist(...C[i].seg, ...C[j].seg);
      if (depth > tol) out.push({ a: C[i].id, b: C[j].id, depth: +depth.toFixed(1) });
    }
  }
  return out;
}
