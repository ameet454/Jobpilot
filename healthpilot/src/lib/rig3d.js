/**
 * Lifts the 2-D exercise poses into a 3-D muscled body.
 *
 * World axes: X = the way the athlete faces, Y = up (floor at 0), Z = the
 * athlete's right. Side-view poses (most exercises) put both arms and legs in
 * the X-Y plane at ±Z; front-view poses (lateral raise, cable fly) map the 2-D
 * x axis onto Z instead. The result is plain arrays so it can be unit-tested
 * without WebGL.
 */
import { blendPose, frontJoints, solvePose } from './pose.js';

export const FLOOR_Y = 241;
// Half-widths measured from the BodyParts3D skeleton (same scale as pose.js LEN).
const Z_SHOULDER = 22;
const Z_HIP = 9;
const Z_KNEE = 10;
const Z_ANKLE = 9;

/* tiny vector helpers on [x, y, z] */
export const v = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};

/** Orthonormal frame for a bone: u along it, f its "front" (chest / quad side), l = u × f. */
function frame(a, b, fHint) {
  const u = v.norm(v.sub(b, a));
  let f = v.sub(fHint, v.mul(u, v.dot(fHint, u)));
  if (v.len(f) < 1e-6) f = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  f = v.norm(f);
  return { u, f, l: v.norm(v.cross(u, f)) };
}

/** 2-D front normal of a segment (same rule as the flat figure). */
function front2d(seg, a, b, prone) {
  const dx = b[0] - a[0]; const dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1;
  const n = seg === 'torso' ? [-dy / l, dx / l] : [dy / l, -dx / l];
  const out = [n[0], -n[1], 0]; // 2-D y points down; world Y points up
  return prone ? v.mul(out, -1) : out;
}

/**
 * Joint positions and bone frames for exercise `ex` at blend `t` (0 = pose A, 1 = pose B).
 * `ox` re-centres the athlete on the X axis.
 */
export function rig(ex, t, ox = 150) {
  const p = blendPose(ex.A, ex.B, t);
  const W = (pt, z) => [pt[0] - ox, FLOOR_Y - pt[1], z];
  const bones = [];
  const J = {};

  if (ex.view === 'front') {
    const j = frontJoints(p);
    const reach = p.reach ?? 0;
    const F = (pt, x = 0) => [x, FLOOR_Y - pt[1], pt[0] - j.cx];
    J.hip = F(j.hip); J.neck = F(j.neck); J.head = F(j.head);
    for (const [s, k] of [[1, 'R'], [-1, 'L']]) {
      J[`shoulder${s}`] = F(j[`sh${k}`]);
      J[`elbow${s}`] = F(j[`elbow${k}`], reach * 0.6);
      J[`hand${s}`] = F(j[`hand${k}`], reach);
      J[`hip${s}`] = F(j[`hip${k}`]);
      J[`knee${s}`] = F(j[`knee${k}`]);
      J[`ankle${s}`] = F(j[`ankle${k}`]);
      J[`toe${s}`] = v.add(F(j[`ankle${k}`]), [13, -3, 0]);
    }
    const fwd = [1, 0, 0];
    bones.push({ key: 'torso', side: 0, a: J.hip, b: J.neck, ...frame(J.hip, J.neck, fwd) });
    for (const s of [1, -1]) {
      bones.push({ key: 'ua', side: s, a: J[`shoulder${s}`], b: J[`elbow${s}`], ...frame(J[`shoulder${s}`], J[`elbow${s}`], fwd) });
      bones.push({ key: 'fa', side: s, a: J[`elbow${s}`], b: J[`hand${s}`], ...frame(J[`elbow${s}`], J[`hand${s}`], fwd) });
      bones.push({ key: 'th', side: s, a: J[`hip${s}`], b: J[`knee${s}`], ...frame(J[`hip${s}`], J[`knee${s}`], fwd) });
      bones.push({ key: 'sh', side: s, a: J[`knee${s}`], b: J[`ankle${s}`], ...frame(J[`knee${s}`], J[`ankle${s}`], fwd) });
      bones.push({ key: 'foot', side: s, a: J[`ankle${s}`], b: J[`toe${s}`], ...frame(J[`ankle${s}`], J[`toe${s}`], [0, 1, 0]) });
    }
    return { J, bones };
  }

  const j = solvePose(p);
  J.hip = W(j.hip, 0); J.neck = W(j.neck, 0); J.head = W(j.head, 0);
  const tf = front2d('torso', j.hip, j.neck, ex.prone);
  bones.push({ key: 'torso', side: 0, a: J.hip, b: J.neck, ...frame(J.hip, J.neck, tf) });
  // +1 = the athlete's right side (nearest the default camera), -1 = left.
  for (const [s, src] of [[1, j], [-1, j.far]]) {
    J[`shoulder${s}`] = W(j.neck, s * Z_SHOULDER);
    J[`elbow${s}`] = W(src.elbow, s * Z_SHOULDER);
    J[`hand${s}`] = W(src.hand, s * (Z_SHOULDER + 1));
    J[`hip${s}`] = W(j.hip, s * Z_HIP);
    J[`knee${s}`] = W(src.knee, s * Z_KNEE);
    J[`ankle${s}`] = W(src.ankle, s * Z_ANKLE);
    J[`toe${s}`] = W(src.toe, s * Z_ANKLE);
    const seg = (key, a2, b2, a3, b3) => bones.push({ key, side: s, a: a3, b: b3, ...frame(a3, b3, front2d(key, a2, b2, ex.prone)) });
    seg('ua', j.neck, src.elbow, J[`shoulder${s}`], J[`elbow${s}`]);
    seg('fa', src.elbow, src.hand, J[`elbow${s}`], J[`hand${s}`]);
    seg('th', j.hip, src.knee, J[`hip${s}`], J[`knee${s}`]);
    seg('sh', src.knee, src.ankle, J[`knee${s}`], J[`ankle${s}`]);
    // The top of the foot faces back up the shin.
    bones.push({ key: 'foot', side: s, a: J[`ankle${s}`], b: J[`toe${s}`], ...frame(J[`ankle${s}`], J[`toe${s}`], v.sub(J[`knee${s}`], J[`ankle${s}`])) });
  }
  return { J, bones };
}

/*
 * Muscle bellies as ellipsoids placed on a bone.
 *   t   position along the bone (0 = start joint, 1 = end joint)
 *   fo  offset towards the bone's front (negative = back), world units
 *   lo  sideways offset in world Z (torso only; mirrored for left/right)
 *   r   radii [along bone, front-back, side-side]
 */
const TORSO_PARTS = {
  chest: [{ t: 0.77, fo: 8.6, lo: 7.8, r: [10.5, 5, 9.6] }],
  abs: [0.56, 0.44, 0.32, 0.2].map((t) => ({ t, fo: 8.4, lo: 3.4, r: [5, 2.4, 3.4] })),
  obliques: [{ t: 0.38, fo: 5, lo: 12.5, r: [12, 3.4, 3.6] }],
  lats: [{ t: 0.6, fo: -4, lo: 12.5, r: [16, 5, 5] }],
  traps: [{ t: 0.93, fo: -6.5, lo: 6, r: [10, 3.6, 7.5] }],
  midback: [{ t: 0.72, fo: -9, lo: 5, r: [9, 2.8, 5] }],
  lowerback: [{ t: 0.24, fo: -9.6, lo: 3.8, r: [12, 3, 3.4] }],
  glutes: [{ t: -0.04, fo: -7.5, lo: 6.8, r: [9, 7, 8] }],
};
const LIMB_PARTS = {
  biceps: { bone: 'ua', parts: [{ t: 0.56, fo: 3.4, r: [11, 3.6, 3.6] }] },
  triceps: { bone: 'ua', parts: [{ t: 0.48, fo: -3.4, r: [13, 4.2, 4] }] },
  forearms: { bone: 'fa', parts: [{ t: 0.3, fo: 0.6, r: [9.5, 4, 4.4] }] },
  quads: { bone: 'th', parts: [{ t: 0.52, fo: 4.6, r: [18, 5.2, 5.4] }, { t: 0.66, fo: 3, r: [10, 4.4, 6.8] }] },
  hamstrings: { bone: 'th', parts: [{ t: 0.5, fo: -4.4, r: [17, 4.6, 5.6] }] },
  calves: { bone: 'sh', parts: [{ t: 0.3, fo: -3.6, r: [10.5, 4.2, 4.8] }] },
};
/** Every muscle the body shows, mapped to the library's muscle ids (obliques/mid-back fold into abs/lats). */
export const MUSCLE_OF = { obliques: 'abs', midback: 'lats' };

/** All muscle ellipsoids for a rigged pose: [{ muscle, id, center, basis: {u,f,l}, r }]. */
export function muscles({ J, bones }) {
  const out = [];
  const torso = bones.find((b) => b.key === 'torso');
  for (const [id, parts] of Object.entries(TORSO_PARTS)) {
    for (const s of [1, -1]) {
      parts.forEach((p, i) => {
        const c = v.add(v.add(v.lerp(torso.a, torso.b, p.t), v.mul(torso.f, p.fo)), [0, 0, s * p.lo]);
        out.push({ muscle: MUSCLE_OF[id] || id, id: `${id}${i}${s}`, center: c, basis: torso, r: p.r });
      });
    }
  }
  for (const s of [1, -1]) {
    const sh = J[`shoulder${s}`];
    const ua = bones.find((b) => b.key === 'ua' && b.side === s);
    out.push({ muscle: 'shoulders', id: `delt${s}`, center: v.add(v.add(sh, v.mul(ua.u, 3)), [0, 0, s * 2.5]), basis: ua, r: [8, 7.2, 7.2] });
    for (const [id, { bone, parts }] of Object.entries(LIMB_PARTS)) {
      const b = bones.find((x) => x.key === bone && x.side === s);
      parts.forEach((p, i) => {
        out.push({ muscle: id, id: `${id}${i}${s}`, center: v.add(v.lerp(b.a, b.b, p.t), v.mul(b.f, p.fo)), basis: b, r: p.r });
      });
    }
  }
  return out;
}

/** Centre of the first part of a muscle — where the "feel it here" label points. */
export function muscleAnchor(list, muscle) {
  const parts = list.filter((m) => m.muscle === muscle && m.id.endsWith('1') && !m.id.endsWith('-1'));
  const pick = parts[0] || list.find((m) => m.muscle === muscle);
  return pick?.center || null;
}

/* Interior angle at a joint, in degrees. */
function angleAt(J, a, j, b) {
  const u = v.norm(v.sub(J[a], J[j])); const w = v.norm(v.sub(J[b], J[j]));
  return (Math.acos(Math.max(-1, Math.min(1, v.dot(u, w)))) * 180) / Math.PI;
}
const JOINT_CHAINS = {
  shoulder: (s) => ['hip', `shoulder${s}`, `elbow${s}`],
  elbow: (s) => [`shoulder${s}`, `elbow${s}`, `hand${s}`],
  hip: (s) => ['neck', `hip${s}`, `knee${s}`],
  knee: (s) => [`hip${s}`, `knee${s}`, `ankle${s}`],
  ankle: (s) => [`knee${s}`, `ankle${s}`, `toe${s}`],
};
export const JOINT_LABEL = { shoulder: 'Shoulder', elbow: 'Elbow', hip: 'Hip', knee: 'Knee', ankle: 'Ankle' };

/** Joints that bend by more than `min` degrees during the rep, biggest movement first. */
export function workingJoints(ex, min = 25) {
  const A = rig(ex, 0).J; const B = rig(ex, 1).J;
  return Object.entries(JOINT_CHAINS)
    .map(([name, chain]) => ({ name, range: Math.abs(angleAt(A, ...chain(1)) - angleAt(B, ...chain(1))) }))
    .filter((j) => j.range >= min)
    .sort((a, b) => b.range - a.range);
}

/** Muscles that face the back of the body — the camera starts behind the athlete for these. */
export const BACK_MUSCLES = new Set(['lats', 'traps', 'lowerback', 'glutes', 'hamstrings', 'triceps', 'calves']);
