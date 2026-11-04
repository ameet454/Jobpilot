/**
 * Lifts the 2-D exercise poses into a 3-D muscled body.
 *
 * World axes: X = the way the athlete faces, Y = up (floor at 0), Z = the
 * athlete's right. Side-view poses (most exercises) put both arms and legs in
 * the X-Y plane at ±Z; front-view poses (lateral raise, cable fly) map the 2-D
 * x axis onto Z instead. The result is plain arrays so it can be unit-tested
 * without WebGL.
 */
import { blendPose, frontJoints, LEN, solvePose, WAIST } from './pose.js';

export const FLOOR_Y = 241;
// Fist centre relative to the wrist, in the forearm's frame [along, front, side], from tools/body/build_body.py.
export const GRIP = [11.5, 1.3, -3];
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

const unit2 = (a, b) => { const dx = b[0] - a[0]; const dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
const dot2 = (a, b) => a[0] * b[0] + a[1] * b[1];

/** Where a bar resting on the upper back sits, given the chest frame. */
export function backBarPoint(J, chest) {
  return v.add(v.add(J.neck, v.mul(chest.f, -9)), v.mul(chest.u, 3));
}

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
// Sternoclavicular joint (the shoulder girdle's pivot) relative to the centre of
// the shoulder line: forward, up and sideways, measured from the BodyParts3D clavicles.
const SC_OFFSET = [6.7, 0.8, 1.5];
// Scapulohumeral rhythm, simplified: past 30° of arm elevation the collarbone and
// shoulder blade turn upward by ~0.18° per degree, up to 22°.
const girdleAngle = (armElevation) => Math.max(0, Math.min(22, (armElevation - 30) * 0.18));
// How far a bone of length `len` must point toward the viewer when its 2-D projection runs a → b.
const depth = (a, b, len) => Math.sqrt(Math.max(0, len * len - (a[0] - b[0]) ** 2 - (a[1] - b[1]) ** 2));

/** Rotate vector p about unit axis k by `deg` degrees (Rodrigues). */
function rotateAbout(p, k, deg) {
  const a = (deg * Math.PI) / 180; const c = Math.cos(a); const sn = Math.sin(a);
  return v.add(v.add(v.mul(p, c), v.mul(v.cross(k, p), sn)), v.mul(k, v.dot(k, p) * (1 - c)));
}

/**
 * Joint positions and bone frames for exercise `ex` at blend `t` (0 = pose A, 1 = pose B).
 * `ox` re-centres the athlete on the X axis.
 */
export function rig(ex, t, ox = 150) {
  const p = blendPose(ex.A, ex.B, t);
  const W = (pt, z) => [pt[0] - ox, FLOOR_Y - pt[1], z];
  const J = {};
  const hint = {}; // front direction per limb bone, e.g. hint['ua1']
  let lowerF; let upperF;

  if (ex.view === 'front') {
    const j = frontJoints(p);
    const reach = p.reach ?? 0;
    const F = (pt, x = 0) => [x, FLOOR_Y - pt[1], pt[0] - j.cx];
    J.hip = F(j.hip); J.neck = F(j.neck); J.head = F(j.head);
    J.waist = v.lerp(J.hip, J.neck, WAIST);
    const knee = p.seated ? LEN.thigh : 0;
    for (const [s, k] of [[1, 'R'], [-1, 'L']]) {
      // `arc`: whatever length the 2-D drawing loses is depth toward the viewer (pec deck, Arnold press).
      const ez = p.arc ? depth(j[`sh${k}`], j[`elbow${k}`], LEN.upperArm) : 0;
      const hz = p.arc ? ez + depth(j[`elbow${k}`], j[`hand${k}`], LEN.forearm) : 0;
      J[`shoulder${s}`] = F(j[`sh${k}`]);
      J[`elbow${s}`] = F(j[`elbow${k}`], reach * 0.6 + ez);
      J[`hand${s}`] = F(j[`hand${k}`], reach + hz);
      J[`hip${s}`] = F(j[`hip${k}`]);
      J[`knee${s}`] = F(j[`knee${k}`], knee);
      J[`ankle${s}`] = F(j[`ankle${k}`], knee);
      J[`toe${s}`] = v.add(F(j[`ankle${k}`], knee), [13, -3, 0]);
      for (const b of ['ua', 'fa', 'th', 'sh']) hint[`${b}${s}`] = [1, 0, 0];
      if (p.seated) hint[`th${s}`] = [0, 1, 0];
    }
    lowerF = [1, 0, 0]; upperF = [1, 0, 0];
  } else {
    const j = solvePose(p);
    J.hip = W(j.hip, 0); J.waist = W(j.waist, 0); J.neck = W(j.neck, 0); J.head = W(j.head, 0);
    lowerF = front2d('torso', j.hip, j.waist, ex.prone);
    upperF = front2d('torso', j.waist, j.neck, ex.prone);
    // +1 = the athlete's right side (nearest the default camera), -1 = left.
    const wide = p.wide ?? 1; // sumo / goblet stance: knees and feet further apart
    for (const [s, src] of [[1, j], [-1, j.far]]) {
      // Arms hang slightly out from the ribs (the elbow's carrying angle), and the
      // knees track out over the toes as the hip bends — both keep limbs off the trunk.
      const hipFlex = (Math.acos(Math.max(-1, Math.min(1, dot2(unit2(j.hip, src.knee), unit2(j.waist, j.hip))))) * 180) / Math.PI;
      const kneesOut = Math.max(0, Math.min(1, (hipFlex - 40) / 60)) * 9;
      J[`shoulder${s}`] = W(j.neck, s * Z_SHOULDER);
      // `grip` overrides the hand half-width (sumo deadlift: hands inside the knees).
      J[`elbow${s}`] = W(src.elbow, s * (((s < 0 ? p.grip2 : null) ?? p.grip) ? (Z_SHOULDER + ((s < 0 ? p.grip2 : null) ?? p.grip)) / 2 : Z_SHOULDER + 4));
      J[`hand${s}`] = W(src.hand, s * ((s < 0 ? p.grip2 : null) ?? p.grip ?? Z_SHOULDER + 7));
      J[`hip${s}`] = W(j.hip, s * Z_HIP);
      J[`knee${s}`] = W(src.knee, s * (Z_KNEE * wide + kneesOut));
      J[`ankle${s}`] = W(src.ankle, s * Z_ANKLE * wide * (wide > 1 ? 1.15 : 1));
      J[`toe${s}`] = W(src.toe, s * Z_ANKLE * wide * (wide > 1 ? 1.3 : 1));
      hint[`ua${s}`] = front2d('ua', j.neck, src.elbow, ex.prone);
      hint[`fa${s}`] = front2d('fa', src.elbow, src.hand, ex.prone);
      hint[`th${s}`] = front2d('th', j.hip, src.knee, ex.prone);
      hint[`sh${s}`] = front2d('sh', src.knee, src.ankle, ex.prone);
    }
  }

  // Shoulder girdle: the collarbone pivots at the sternum and lifts the shoulder as the arm rises.
  const chest = frame(J.waist, J.neck, upperF);
  const delta = {};
  for (const s of [1, -1]) {
    const sc = v.add(v.add(v.add(J.neck, v.mul(chest.f, SC_OFFSET[0])), v.mul(chest.u, SC_OFFSET[1])), [0, 0, s * SC_OFFSET[2]]);
    const sh0 = J[`shoulder${s}`];
    const arm = v.norm(v.sub(J[`elbow${s}`], sh0));
    const elevation = (Math.acos(Math.max(-1, Math.min(1, -v.dot(arm, chest.u)))) * 180) / Math.PI;
    const sh1 = v.add(sc, rotateAbout(v.sub(sh0, sc), chest.f, -s * (girdleAngle(elevation) + (p.shrug ?? 0))));
    J[`sc${s}`] = sc;
    delta[s] = v.sub(sh1, sh0);
  }
  // Bar across the upper back (squat, good morning): the hands reach back to it.
  const backBar = ex.props?.find((pr) => pr.t === 'barbell' && pr.at === 'back');
  if (backBar && ex.view !== 'front') {
    const c = frame(J.waist, J.neck, upperF);
    const bar = backBarPoint(J, c);
    const L1 = LEN.upperArm; const L2 = LEN.forearm + GRIP[0];
    for (const s of [1, -1]) {
      const S = J[`shoulder${s}`];
      const dx = bar[0] - S[0]; const dy = bar[1] - S[1];
      const d = Math.min(L1 + L2 - 0.01, Math.max(Math.abs(L1 - L2) + 0.01, Math.hypot(dx, dy)));
      const base = Math.atan2(dy, dx);
      const k = Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d));
      // Of the two elbow solutions take the lower one (elbows point down and back).
      const e1 = [S[0] + L1 * Math.cos(base + k), S[1] + L1 * Math.sin(base + k)];
      const e2 = [S[0] + L1 * Math.cos(base - k), S[1] + L1 * Math.sin(base - k)];
      const e = e1[1] < e2[1] ? e1 : e2;
      const fd = v.norm([bar[0] - e[0], bar[1] - e[1], 0]);
      J[`elbow${s}`] = [e[0], e[1], s * (Z_SHOULDER + 5)];
      J[`hand${s}`] = [e[0] + fd[0] * LEN.forearm, e[1] + fd[1] * LEN.forearm, s * (Z_SHOULDER + 9)];
      hint[`ua${s}`] = v.norm(v.cross([0, 0, 1], v.sub(J[`elbow${s}`], S)));
      hint[`fa${s}`] = v.norm(v.cross([0, 0, 1], v.sub(J[`hand${s}`], J[`elbow${s}`])));
    }
  }

  if (p.anchor === 'hand' && ex.view !== 'front') {
    // Hands stay on the bar: the body hangs lower instead of the hands rising.
    const m = v.mul(v.add(delta[1], delta[-1]), 0.5);
    for (const k of Object.keys(J)) if (!/^(elbow|hand)/.test(k)) J[k] = v.sub(J[k], m);
    for (const s of [1, -1]) J[`shoulder${s}`] = v.add(J[`shoulder${s}`], delta[s]);
  } else {
    for (const s of [1, -1]) for (const k of ['shoulder', 'elbow', 'hand']) J[`${k}${s}`] = v.add(J[`${k}${s}`], delta[s]);
  }

  const bones = [
    { key: 'torso', side: 0, a: J.hip, b: J.neck, ...frame(J.hip, J.neck, upperF) },
    { key: 'pelvis', side: 0, a: J.hip, b: J.waist, ...frame(J.hip, J.waist, lowerF) },
    { key: 'chest', side: 0, a: J.waist, b: J.neck, ...frame(J.waist, J.neck, upperF) },
  ];
  const fc = frame(J.waist, J.neck, upperF).f;
  for (const s of [1, -1]) {
    const add = (key, a, b, h) => bones.push({ key, side: s, a, b, ...frame(a, b, h) });
    add('girdle', J[`sc${s}`], J[`shoulder${s}`], fc);
    add('ua', J[`shoulder${s}`], J[`elbow${s}`], hint[`ua${s}`]);
    add('fa', J[`elbow${s}`], J[`hand${s}`], hint[`fa${s}`]);
    add('th', J[`hip${s}`], J[`knee${s}`], hint[`th${s}`]);
    add('sh', J[`knee${s}`], J[`ankle${s}`], hint[`sh${s}`]);
    // The top of the foot faces back up the shin.
    add('foot', J[`ankle${s}`], J[`toe${s}`], ex.view === 'front' ? [0, 1, 0] : v.sub(J[`knee${s}`], J[`ankle${s}`]));
  }
  // Centre of the closed fist: where bars, dumbbells and handles sit.
  const axes = {};
  for (const s of [1, -1]) {
    const fa = bones.find((b) => b.key === 'fa' && b.side === s);
    J[`grip${s}`] = v.add(v.add(v.add(fa.b, v.mul(fa.u, GRIP[0])), v.mul(fa.f, GRIP[1])), v.mul(fa.l, GRIP[2] * s));
    axes[`grip${s}`] = fa.l;
  }
  return { J, bones, axes };
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
