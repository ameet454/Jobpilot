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
function leg(hip, th, sh, foot) {
  const knee = move(hip, th, LEN.thigh);
  const ankle = move(knee, sh, LEN.shin);
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
    const knee = move(p.at, p.sh + 180, LEN.shin);
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
  const near = { ...arm(neck, p.ua, p.fa, p.uaLen), ...leg(hip, p.th, p.sh, p.foot ?? 0) };
  const farArm = arm(neck, p.ua2 ?? p.ua, p.fa2 ?? p.fa, p.uaLen);
  const farLeg = leg(hip, p.th2 ?? p.th, p.sh2 ?? p.sh, p.foot2 ?? p.foot ?? 0);
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
    ? { knee: [hipR[0] + 2, hipR[1] + 4], ankle: [hipR[0] + 3, hipR[1] + 4 + LEN.shin], toe: [hipR[0] + 3, hipR[1] + 8 + LEN.shin] }
    : solvePose({ ...p, anchor: 'hip', at: hipR });
  return {
    cx, neck: j.neck, hip: j.hip, head: [j.neck[0], j.neck[1] - 21],
    shR, elbowR: elbow, handR: hand, hipR, kneeR: legR.knee, ankleR: legR.ankle, toeR: legR.toe,
    shL: mirrorX(shR, cx), elbowL: mirrorX(elbow, cx), handL: mirrorX(hand, cx), hipL: mirrorX(hipR, cx),
    kneeL: mirrorX(legR.knee, cx), ankleL: mirrorX(legR.ankle, cx), toeL: mirrorX(legR.toe, cx),
  };
}

const lerp = (a, b, t) => a + (b - a) * t;
const ANGLES = ['torso', 'spine', 'head', 'ua', 'fa', 'th', 'sh', 'foot', 'ua2', 'fa2', 'th2', 'sh2', 'foot2', 'uaLen', 'reach', 'shrug', 'wide', 'grip'];

/** Blend two key poses (t = 0 → a, t = 1 → b). */
export function blendPose(a, b, t) {
  const out = { ...a, at: [lerp(a.at[0], b.at[0], t), lerp(a.at[1], b.at[1], t)] };
  for (const k of ANGLES) {
    if (a[k] == null && b[k] == null) continue;
    if (k === 'grip' && (a[k] == null || b[k] == null)) continue; // no neutral value to blend from
    const fallback = k.endsWith('2') ? k.slice(0, -1) : null;
    const base = k === 'uaLen' || k === 'wide' ? 1 : 0;
    const va = a[k] ?? (fallback ? a[fallback] : base) ?? base;
    const vb = b[k] ?? (fallback ? b[fallback] : base) ?? base;
    out[k] = lerp(va, vb, t);
  }
  return out;
}

export const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

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
  if (s < first) return { t: ease(s / first), stage: lift === 'AB' ? 'lift' : 'lower', progress: s / first };
  s -= first;
  if (s < holdB) return { t: 1, stage: lift === 'AB' ? 'squeeze' : 'stretch', progress: s / holdB };
  s -= holdB;
  if (s < second) return { t: 1 - ease(s / second), stage: lift === 'AB' ? 'lower' : 'lift', progress: s / second };
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
