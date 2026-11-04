/**
 * Biomechanics overlays for the 3-D coach: where the load is, which way the
 * resistance pulls, which joint it loads, and how hard each point of the rep is.
 *
 *   loadPoint      the bar, dumbbell, handle, pad — or for body-weight moves the
 *                  body point that travels furthest (chin in a pull-up, ankles in a leg raise)
 *   forceDir       gravity for free weights and body weight, along the cable for
 *                  cables, against the direction of travel for machines
 *   lever arm      perpendicular distance from the working joint to the line of force.
 *                  Torque = load × lever arm, so a longer lever means more stress on the
 *                  muscles that move that joint.
 *   stressCurve    the lever arm through the rep (0 = start of the lift, 1 = end),
 *                  normalised to its peak: the exercise's resistance profile.
 *
 * Plain arrays only, so it is unit-tested without WebGL.
 */
import { backBarPoint, FLOOR_Y, rig, v, workingJoints } from './rig3d.js';

const GRAVITY = [0, -1, 0];
const mid = (R, a, b) => v.lerp(R.J[a], R.J[b], 0.5);

/** Body points a body-weight exercise could be "carrying" its load at. */
const BODY_POINTS = {
  chin: (R) => R.J.neck,
  hips: (R) => R.J.hip,
  knees: (R) => mid(R, 'knee1', 'knee-1'),
  ankles: (R) => mid(R, 'ankle1', 'ankle-1'),
  hands: (R) => mid(R, 'grip1', 'grip-1'),
};

/** How to find the load point for an exercise: a function of the rigged pose. */
export function loadPointFn(ex, ox = 0) {
  const props = ex.props || [];
  const bar = props.find((p) => p.t === 'barbell');
  if (bar?.at === 'back') return (R) => backBarPoint(R.J, R.bones.find((b) => b.key === 'chest'));
  if (bar?.at === 'neck') return (R) => R.J.neck;
  if (bar?.at === 'hip') return (R) => R.J.hip;
  const held = props.find((p) => ['barbell', 'dumbbell', 'grip', 'cable'].includes(p.t));
  if (held) {
    if (ex.view === 'front' || held.one) return (R) => R.J.grip1;
    return (R) => mid(R, 'grip1', 'grip-1');
  }
  if (props.some((p) => p.t === 'sled')) return (R) => mid(R, 'toe1', 'toe-1');
  const pad = props.find((p) => p.t === 'pad');
  if (pad) return pad.at === 'knee' ? (R) => mid(R, 'knee1', 'knee-1') : (R) => mid(R, 'ankle1', 'ankle-1');
  // Body weight: the point that travels furthest between the two key poses.
  const A = rig(ex, 0, ox); const B = rig(ex, 1, ox);
  let best = 'hips'; let far = -1;
  for (const [k, f] of Object.entries(BODY_POINTS)) {
    const d = v.len(v.sub(f(A), f(B)));
    if (d > far) { far = d; best = k; }
  }
  return BODY_POINTS[best];
}

/** Hands or feet fixed to a bar, the floor or handles: the body moves around them. */
export function closedChain(ex) {
  return ex.hands === 'flat' || (ex.props || []).some((p) => p.kind === 'bar' || p.kind === 'dipbars') || ex.A.anchor === 'hand';
}

/** Which way the resistance pulls on the load point at pose R. */
export function forceDirFn(ex, ox = 0) {
  const props = ex.props || [];
  const cable = props.find((p) => p.t === 'cable');
  const lp = loadPointFn(ex, ox);
  if (cable) {
    const from = ex.view === 'front' ? [0, FLOOR_Y - cable.from[1], cable.from[0] - 150] : [cable.from[0] - ox, FLOOR_Y - cable.from[1], 0];
    return (R) => v.norm(v.sub(from, lp(R)));
  }
  const machine = props.some((p) => p.t === 'sled' || p.t === 'pad' || p.t === 'grip');
  if (machine) {
    // The machine pushes back against the direction the lift travels.
    const concentric = ex.lift === 'BA' ? v.sub(lp(rig(ex, 0, ox)), lp(rig(ex, 1, ox))) : v.sub(lp(rig(ex, 1, ox)), lp(rig(ex, 0, ox)));
    const d = v.norm(v.mul(concentric, -1));
    return () => d;
  }
  return () => GRAVITY;
}

// The joint each muscle group moves (in order of preference).
const MUSCLE_JOINTS = {
  chest: ['shoulder'], shoulders: ['shoulder'], lats: ['shoulder'], traps: ['shoulder'],
  biceps: ['elbow'], triceps: ['elbow'], forearms: ['elbow'],
  quads: ['knee', 'hip'], glutes: ['hip', 'knee'], hamstrings: ['hip', 'knee'], lowerback: ['hip'],
  calves: ['ankle'], abs: ['hip', 'shoulder'],
};

/**
 * The joint the target muscle acts on, on the near side: of the joints that
 * muscle moves, the one that bends most in this exercise (falls back to the
 * joint that bends most overall).
 */
export function mainJoint(ex) {
  const moving = workingJoints(ex, 8);
  const want = MUSCLE_JOINTS[ex.focus[0].split('.')[0]] || [];
  const j = moving.filter((m) => want.includes(m.name)).sort((a, b) => b.range - a.range)[0]
    || workingJoints(ex, 15)[0];
  return j ? { name: j.name, key: `${j.name}1` } : null;
}

/** Perpendicular from joint J to the line through P along unit d: { foot, arm (vector J→foot), length }. */
export function leverArm(J, P, d) {
  const jp = v.sub(J, P);
  const foot = v.add(P, v.mul(d, v.dot(jp, d)));
  const arm = v.sub(foot, J);
  return { foot, arm, length: v.len(arm) };
}

/** Everything the overlay needs at blend t. */
export function biomechAt(ex, t, ox = 0, cache = {}) {
  cache.lp ||= loadPointFn(ex, ox);
  cache.fd ||= forceDirFn(ex, ox);
  if (cache.joint === undefined) cache.joint = mainJoint(ex);
  const R = rig(ex, t, ox);
  const P = cache.lp(R);
  const d = cache.fd(R);
  const out = { R, P, d, joint: cache.joint, lever: null };
  if (cache.joint && !closedChain(ex)) out.lever = leverArm(R.J[cache.joint.key], P, d);
  return out;
}

/** Load-point path through the rep, from pose A (t = 0) to pose B (t = 1). */
export function trajectory(ex, ox = 0, n = 40) {
  const lp = loadPointFn(ex, ox);
  return Array.from({ length: n + 1 }, (_, i) => lp(rig(ex, i / n, ox)));
}

/**
 * Resistance profile: lever arm through the lift, sampled from the start of the
 * lift (s = 0) to its end (s = 1), normalised to the peak. Null for closed-chain
 * body-weight moves, where the whole body is the lever.
 */
export function stressCurve(ex, n = 32) {
  if (closedChain(ex) || !mainJoint(ex)) return null;
  const cache = {};
  const raw = Array.from({ length: n + 1 }, (_, i) => {
    const s = i / n;
    const t = ex.lift === 'BA' ? 1 - s : s;
    return biomechAt(ex, t, 0, cache).lever.length;
  });
  const peak = Math.max(...raw);
  if (peak < 1e-6) return null;
  return raw.map((x) => x / peak);
}

/** Plain-language summary of where the rep is hardest. */
export function stressSummary(ex) {
  const c = stressCurve(ex);
  if (!c) return null;
  const n = c.length - 1;
  const iMax = c.indexOf(Math.max(...c));
  const s = iMax / n;
  const min = Math.min(...c);
  const where = s < 0.3 ? 'at the start of the lift' : s > 0.7 ? 'at the end of the lift' : 'in the middle of the lift';
  const flat = min > 0.75;
  const joint = mainJoint(ex);
  const jointName = { shoulder: 'shoulder', elbow: 'elbow', hip: 'hip', knee: 'knee', ankle: 'ankle' }[joint.name];
  return {
    peakAt: s,
    text: flat
      ? `Tension stays high through the whole rep — the lever at the ${jointName} barely changes.`
      : `Hardest ${where}: the lever arm at the ${jointName} is longest there, so slow down and stay tight at that point.`,
    joint: jointName,
  };
}
