/**
 * Tiny 2-D skeleton for the exercise animations.
 *
 * A pose is a set of absolute segment angles in degrees (SVG coordinates, so
 * 0 = pointing right, 90 = pointing down) plus one anchored joint. Segment
 * lengths are fixed, so interpolating angles between two key poses always
 * gives a body that keeps its proportions — no stretching limbs.
 *
 *   torso  hip → neck        ua / fa   shoulder → elbow → hand
 *   th     hip → knee        sh        knee → ankle      foot  ankle → toe
 *   ua2/fa2/th2/sh2/foot2    optional far-side limbs (default: same as near side)
 *
 * anchor: 'hip' (default) | 'ankle' (feet planted) | 'hand' (hanging / pushing)
 *
 * 3-D only (see lib/rig3d.js): shrug (extra collarbone lift, degrees), wide
 * (stance width, 1 = hip width), grip (hand half-width). Front view only: seated (thighs point at the
 * viewer), arc (elbows and hands swing forward so arm bones keep their length).
 */
// Proportions measured from the BodyParts3D skeleton, scaled to a torso of 66.
export const LEN = { torso: 66, upperArm: 37, forearm: 31, thigh: 53, shin: 45, foot: 17, head: 24 };

const rad = (d) => (d * Math.PI) / 180;
const dir = (a) => [Math.cos(rad(a)), Math.sin(rad(a))];
const move = (p, a, l) => { const [x, y] = dir(a); return [p[0] + x * l, p[1] + y * l]; };

// uaLen < 1 foreshortens the upper arm when the elbow travels toward or away
// from the viewer (face pull); a negative value puts the elbow behind the shoulder.
function arm(neck, ua, fa, uaLen = 1) {
  const elbow = move(neck, ua, LEN.upperArm * uaLen);
  return { elbow, hand: move(elbow, fa, LEN.forearm) };
}
// The floor (2-D y) and how high the ankle joint sits above the sole of a flat foot.
export const FLOOR_2D = 241;
export const ANKLE_H = 10;
const ANKLE_FLOOR = FLOOR_2D - ANKLE_H;

function leg(hip, th, sh, foot, plant) {
  const knee = move(hip, th, LEN.thigh);
  let shin = sh;
  // A flat foot near the floor stays planted on it: swing the shin about the knee so
  // the ankle sits exactly one ankle-height above the floor.
  if (plant && Math.abs(Math.sin(rad(foot))) < 0.5) {
    const a0 = move(knee, sh, LEN.shin);
    const dy = ANKLE_FLOOR - knee[1];
    if (a0[1] > ANKLE_FLOOR - 6 && Math.abs(dy) < LEN.shin) {
      const base = Math.asin(dy / LEN.shin) * (180 / Math.PI);
      const c1 = base; const c2 = 180 - base;
      const diff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
      shin = diff(c1, sh) < diff(c2, sh) ? c1 : c2;
    }
  }
  const ankle = move(knee, shin, LEN.shin);
  return { knee, ankle, toe: move(ankle, foot, LEN.foot) };
}

// The spine bends at the waist: `torso` aims the lower back (hip → waist) and
// `torso + spine` the upper back (waist → neck). Positive spine curls forward.
export const WAIST = 0.42;
const LOWER = LEN.torso * WAIST;
const UPPER = LEN.torso - LOWER;

export function solvePose(p) {
  const upper = p.torso + (p.spine ?? 0);
  let hip;
  if (p.anchor === 'ankle') {
    // Standing: the ankle joint is one ankle-height above the floor.
    const at = [p.at[0], Math.min(p.at[1], ANKLE_FLOOR)];
    const knee = move(at, p.sh + 180, LEN.shin);
    hip = move(knee, p.th + 180, LEN.thigh);
  } else if (p.anchor === 'hand') {
    const elbow = move(p.at, p.fa + 180, LEN.forearm);
    const neck = move(elbow, p.ua + 180, LEN.upperArm);
    hip = move(move(neck, upper + 180, UPPER), p.torso + 180, LOWER);
  } else {
    hip = p.at;
  }
  const waist = move(hip, p.torso, LOWER);
  const neck = move(waist, upper, UPPER);
  const plant = p.anchor !== 'ankle' && !p.free;
  const near = { ...arm(neck, p.ua, p.fa, p.uaLen), ...leg(hip, p.th, p.sh, p.foot ?? 0, plant) };
  const farArm = arm(neck, p.ua2 ?? p.ua, p.fa2 ?? p.fa, p.uaLen);
  const farLeg = leg(hip, p.th2 ?? p.th, p.sh2 ?? p.sh, p.foot2 ?? p.foot ?? 0, plant);
  return {
    hip, waist, neck, ...near,
    head: move(neck, upper + (p.head ?? 0), LEN.head),
    far: { elbow: farArm.elbow, hand: farArm.hand, knee: farLeg.knee, ankle: farLeg.ankle, toe: farLeg.toe },
  };
}

const mirrorX = (p, cx) => [2 * cx - p[0], p[1]];

/**
 * Front-view joints (lateral raise, cable fly): the pose's arm and leg angles
 * drive the figure's right side and the left side is its mirror image.
 */
export function frontJoints(p) {
  const j = solvePose(p);
  const cx = j.hip[0];
  const shR = [j.neck[0] + 20, j.neck[1] + 6];
  const hipR = [j.hip[0] + 10, j.hip[1]];
  const armR = solvePose({ ...p, anchor: 'hip', at: shR, torso: 0 });
  const elbow = [shR[0] + (armR.elbow[0] - armR.neck[0]), shR[1] + (armR.elbow[1] - armR.neck[1])];
  const hand = [elbow[0] + (armR.hand[0] - armR.elbow[0]), elbow[1] + (armR.hand[1] - armR.elbow[1])];
  // Seated: the thighs point at the viewer, so the knees sit just below the hips.
  const legR = p.seated
    ? { knee: [hipR[0] + 2, hipR[1] + 4], ankle: [hipR[0] + 3, ANKLE_FLOOR], toe: [hipR[0] + 3, ANKLE_FLOOR + 4] }
    : solvePose({ ...p, anchor: 'hip', at: hipR, free: true });
  return {
    cx, neck: j.neck, hip: j.hip, head: [j.neck[0], j.neck[1] - 21],
    shR, elbowR: elbow, handR: hand, hipR, kneeR: legR.knee, ankleR: legR.ankle, toeR: legR.toe,
    shL: mirrorX(shR, cx), elbowL: mirrorX(elbow, cx), handL: mirrorX(hand, cx), hipL: mirrorX(hipR, cx),
    kneeL: mirrorX(legR.knee, cx), ankleL: mirrorX(legR.ankle, cx), toeL: mirrorX(legR.toe, cx),
  };
}

const lerp = (a, b, t) => a + (b - a) * t;
const ANGLES = ['torso', 'spine', 'head', 'ua', 'fa', 'th', 'sh', 'foot', 'ua2', 'fa2', 'th2', 'sh2', 'foot2', 'uaLen', 'reach', 'shrug', 'wide', 'grip', 'grip2'];

/** Blend two key poses (t = 0 → a, t = 1 → b). */
export function blendPose(a, b, t) {
  const out = { ...a, at: [lerp(a.at[0], b.at[0], t), lerp(a.at[1], b.at[1], t)] };
  for (const k of ANGLES) {
    if (a[k] == null && b[k] == null) continue;
    if ((k === 'grip' || k === 'grip2') && (a[k] == null || b[k] == null)) continue; // no neutral value to blend from
    const fallback = k.endsWith('2') ? k.slice(0, -1) : null;
    const base = k === 'uaLen' || k === 'wide' ? 1 : 0;
    const va = a[k] ?? (fallback ? a[fallback] : base) ?? base;
    const vb = b[k] ?? (fallback ? b[fallback] : base) ?? base;
    out[k] = lerp(va, vb, t);
  }
  return out;
}

export const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
// Lowering is controlled: a gentle start and stop around a near-even speed.
const easeLower = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);

/**
 * Where in the rep we are. A rep starts at pose A, moves to B, pauses, comes
 * back to A and pauses. `lift` says which half is the lifting (concentric)
 * part: 'AB' (curl, row, press) or 'BA' (squat, bench — you lower first).
 */
export function repPhase(ms, tempo, lift = 'AB') {
  const { lift: up = 1, squeeze = 0.6, lower = 2, rest = 0.5 } = tempo;
  const first = lift === 'AB' ? up : lower;
  const second = lift === 'AB' ? lower : up;
  const holdB = lift === 'AB' ? squeeze : rest;
  const holdA = lift === 'AB' ? rest : squeeze;
  const total = (first + holdB + second + holdA) * 1000;
  let s = (((ms % total) + total) % total) / 1000;
  if (s < first) return { t: (lift === 'AB' ? ease : easeLower)(s / first), stage: lift === 'AB' ? 'lift' : 'lower', progress: s / first };
  s -= first;
  if (s < holdB) return { t: 1, stage: lift === 'AB' ? 'squeeze' : 'stretch', progress: s / holdB };
  s -= holdB;
  if (s < second) return { t: 1 - (lift === 'AB' ? easeLower : ease)(s / second), stage: lift === 'AB' ? 'lower' : 'lift', progress: s / second };
  return { t: 0, stage: lift === 'AB' ? 'stretch' : 'squeeze', progress: (s - second) / holdA };
}

/** How hard the target muscle is working in each stage (drives the glow). */
export const STAGE_LOAD = { lift: 1, squeeze: 1, lower: 0.72, stretch: 0.45 };

export const STAGE_LABEL = {
  lift: 'Lift — push through the red muscle',
  squeeze: 'Squeeze — hold the contraction',
  lower: 'Lower slowly — keep tension',
  stretch: 'Stretch — control, then go again',
};

/* ─────────────────────────── Natural motion ───────────────────────────
 * Blending two key poses angle by angle moves every joint at the same pace, so a
 * squat's bar drifts off the mid-foot, a press swings the bar out in an arc and a
 * pull-up swings the body. Real lifters move the load in a near-straight line and
 * their joints take turns. `motionPose` adds that on top of `blendPose`:
 *
 *   timing   some joints lead and some follow (deadlift: knees straighten first,
 *            then the hips — and in reverse on the way down: hips back first)
 *   balance  standing lifts with a bar or dumbbells: the trunk leans just enough to
 *            keep the load travelling in a straight line (over the mid-foot)
 *   reach    presses, rows and pulldowns (shoulder and elbow both moving): the hands
 *            travel in a straight line; solved in 3-D by lib/rig3d.js so the elbows
 *            can flare out to the side
 *   hang     pull-ups and dips: the arms are solved so the body rises in a straight line
 *
 * Pose A (t = 0) and pose B (t = 1) are unchanged.
 */
const DEG = 180 / Math.PI;
const angOf = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]) * DEG;
const relElbow = (p, s = '') => (p[`fa${s}`] ?? p.fa) - (p[`ua${s}`] ?? p.ua);
/** Monotonic timing warp: k > 0 leads (moves early), k < 0 follows. |k| ≤ 1. */
const lead = (t, k) => t + k * t * (1 - t);
const smooth = (x) => x * x * (3 - 2 * x);

/** Where the load sits in the 2-D pose: the bar on the upper back or the fist. */
function load2d(ex, j, p) {
  const bar = ex.props?.find((pr) => pr.t === 'barbell');
  const upper = p.torso + (p.spine ?? 0);
  if (bar?.at === 'back') {
    const [ux, uy] = dir(upper);
    return [j.neck[0] + 9 * uy + 3 * ux, j.neck[1] - 9 * ux + 3 * uy];
  }
  return move(j.hand, p.fa, 11.5);
}

/** Two-bone reach in 2-D (used for hanging moves): from `base` put the far end at `target`; returns the middle joint closest to `near`. */
function reach2(base, target, l1, l2, near) {
  const dx = target[0] - base[0]; const dy = target[1] - base[1];
  const d = Math.min(l1 + l2 - 1e-3, Math.max(Math.abs(l1 - l2) + 1e-3, Math.hypot(dx, dy)));
  const a0 = Math.atan2(dy, dx); const k = Math.acos((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d));
  const c1 = [base[0] + l1 * Math.cos(a0 + k), base[1] + l1 * Math.sin(a0 + k)];
  const c2 = [base[0] + l1 * Math.cos(a0 - k), base[1] + l1 * Math.sin(a0 - k)];
  const dd = (c) => (c[0] - near[0]) ** 2 + (c[1] - near[1]) ** 2;
  return dd(c1) <= dd(c2) ? c1 : c2;
}

const PLAN = new WeakMap();
/** How the exercise moves (worked out once per exercise). */
export function motionPlan(ex) {
  if (PLAN.has(ex)) return PLAN.get(ex);
  const A = ex.A; const B = blendPose(ex.A, ex.B, 1);
  const held = (ex.props || []).find((pr) => ['barbell', 'dumbbell', 'grip'].includes(pr.t) && pr.at !== 'hip');
  const dTh = Math.abs((B.th ?? 0) - (A.th ?? 0));
  const dUa = Math.abs(B.ua - A.ua);
  const dEl = Math.abs(relElbow(B) - relElbow(A));
  const multiArm = dUa > 25 && dEl > 25;
  let mode = null;
  if (ex.view !== 'front') {
    if (A.anchor === 'hand' && multiArm) mode = 'hang';
    else if (held && A.anchor === 'ankle' && dTh >= 45) mode = 'balance';
    else if (held && held.t !== 'grip' && held.at !== 'back' && multiArm) mode = 'reach';
    else if (held?.t === 'grip' && multiArm) mode = 'reach';
  }
  // Pulling a bar off the floor: knees straighten first, hips finish (reverses on the way down).
  const floorPull = mode === 'balance' && ex.lift === 'AB' && (B.torso - A.torso) < -30;
  // First pull: the shins come back to vertical by the time the bar reaches the knees.
  const timing = floorPull ? { th: 0.25, th2: 0.25, sh: ['ramp', 0.4], sh2: ['ramp', 0.4] } : {};
  const plan = { mode, timing };
  if (mode) {
    const p0 = blendTimed(ex, 0, timing); const p1 = blendTimed(ex, 1, timing);
    const j0 = solvePose(p0); const j1 = solvePose(p1);
    if (mode === 'balance') { plan.a = load2d(ex, j0, p0); plan.b = load2d(ex, j1, p1); }
    if (mode === 'hang') { plan.a = j0.neck; plan.b = j1.neck; }
  }
  PLAN.set(ex, plan);
  return plan;
}

function blendTimed(ex, t, timing) {
  const p = blendPose(ex.A, ex.B, t);
  for (const [k, kk] of Object.entries(timing)) {
    const a = ex.A[k] ?? ex.A[k.replace(/2$/, '')]; const b = ex.B[k] ?? ex.B[k.replace(/2$/, '')];
    if (a == null || b == null) continue;
    const w = Array.isArray(kk) ? smooth(Math.min(1, t / kk[1])) : lead(t, kk);
    p[k] = a + (b - a) * w;
  }
  return p;
}

/** Signed distance of point q from the line a → b. */
const offLine = (q, a, b) => { const dx = b[0] - a[0]; const dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; return ((q[0] - a[0]) * dy - (q[1] - a[1]) * dx) / l; };
/** Point on the line a → b at progress u. */
const onLine = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];

/** The pose at blend t with natural timing and a straight load path. */
export function motionPose(ex, t) {
  const plan = motionPlan(ex);
  const p = blendTimed(ex, t, plan.timing);
  if (!plan.mode || t <= 0 || t >= 1) return p;
  if (plan.mode === 'balance') {
    // Lean the trunk until the load is back on its line (secant search, a few steps).
    const f = (d) => { const q = { ...p, torso: p.torso + d }; return offLine(load2d(ex, solvePose(q), q), plan.a, plan.b); };
    let d0 = 0; let f0 = f(d0); let d1 = 2; let f1 = f(d1);
    for (let i = 0; i < 8 && Math.abs(f1) > 0.02; i += 1) {
      if (Math.abs(f1 - f0) < 1e-9) break;
      const d2 = Math.max(-25, Math.min(25, d1 - (f1 * (d1 - d0)) / (f1 - f0)));
      d0 = d1; f0 = f1; d1 = d2; f1 = f(d1);
    }
    p.torso += d1;
    return p;
  }
  if (plan.mode !== 'hang') return p; // 'reach' is solved in 3-D (lib/rig3d.js)
  const j = solvePose(p);
  // hang: hands fixed on the bar, the neck rides a straight line.
  const target = onLine(plan.a, plan.b, t);
  const e = reach2(p.at, target, LEN.forearm, LEN.upperArm * (p.uaLen ?? 1), j.elbow);
  const fa = angOf(e, p.at); const ua = angOf(target, e);
  const wrap = (x, ref) => { let y = x; while (y - ref > 180) y -= 360; while (y - ref < -180) y += 360; return y; };
  p.fa = wrap(fa, p.fa); p.ua = wrap(ua, p.ua);
  return p;
}
