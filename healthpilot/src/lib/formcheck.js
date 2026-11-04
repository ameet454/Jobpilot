/**
 * Live form check: turns pose-model landmarks into a rep count and form faults.
 *
 * Input is one frame of MediaPipe Pose landmarks (33 points, x/y normalised to
 * the frame, y pointing down, plus `visibility`). Everything here is plain
 * maths on arrays, so recorded landmark sequences can be replayed in unit tests
 * without a camera or the model.
 */
import { EXERCISE_BY_ID } from '../data/exercises.js';
import { CUES } from '../data/coaching.js';
import { FORM_CHECK_IDS } from '../data/formcheckIds.js';
import { JOINT_LABEL, workingJoints } from './rig3d.js';

/** MediaPipe Pose landmark indices (the athlete's own left/right). */
export const LM = {
  earL: 7, earR: 8, shL: 11, shR: 12, elL: 13, elR: 14, wrL: 15, wrR: 16,
  hipL: 23, hipR: 24, kneeL: 25, kneeR: 26, ankL: 27, ankR: 28, heelL: 29, heelR: 30, toeL: 31, toeR: 32,
};

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const deg = (r) => (r * 180) / Math.PI;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/** Interior angle at b, in degrees (2-D, image plane). */
export function angle(a, b, c) {
  const ux = a[0] - b[0]; const uy = a[1] - b[1]; const wx = c[0] - b[0]; const wy = c[1] - b[1];
  const l = Math.hypot(ux, uy) * Math.hypot(wx, wy) || 1;
  return deg(Math.acos(clamp((ux * wx + uy * wy) / l, -1, 1)));
}

/** How far segment a→b leans away from straight up, in degrees (0 = b directly above a). */
export function leanFromUp(a, b) {
  return deg(Math.atan2(Math.abs(b[0] - a[0]), a[1] - b[1]));
}

const MIN_VIS = 0.5;
const SMOOTH = 0.55; // weight of the new frame in the landmark moving average
const HOLD = 3; // frames a fault must persist before it is shown

/*
 * Per-exercise rules. `measure` gets named 2-D points for the chosen side (or
 * both sides for front-view checks) and returns the rep signal `v` plus the
 * faults seen in this frame. A rep starts when `enter(v)` and is counted when
 * `exit(v)`; `deeper` keeps the extreme value reached, which `end` judges.
 */
const RULES = {
  'back-squat': {
    camera: 'front',
    setup: 'Face the camera, whole body in view, phone at hip height.',
    need: ['hipL', 'hipR', 'kneeL', 'kneeR', 'ankL', 'ankR'],
    // Hip height above the knee, in shin lengths: about 1 standing, 0 at parallel.
    measure(p, ctx) {
      const shin = (dist(p.kneeL, p.ankL) + dist(p.kneeR, p.ankR)) / 2 || 1;
      const hip = mid(p.hipL, p.hipR); const knee = mid(p.kneeL, p.kneeR);
      const v = (knee[1] - hip[1]) / shin;
      const faults = [];
      const kneeW = Math.abs(p.kneeL[0] - p.kneeR[0]); const ankW = Math.abs(p.ankL[0] - p.ankR[0]);
      if (v < 0.6 && kneeW < ankW * 0.8) faults.push('kneesIn');
      // Heel lift = toe-to-heel height (in shin lengths) growing from its standing value.
      if (p.heelL && p.toeL && p.heelR && p.toeR) {
        const rise = ((p.toeL[1] - p.heelL[1]) + (p.toeR[1] - p.heelR[1])) / 2 / shin;
        if (v > 0.85) ctx.heel0 = ctx.heel0 == null ? rise : ctx.heel0 * 0.9 + rise * 0.1;
        else if (ctx.heel0 != null && rise - ctx.heel0 > 0.07) faults.push('heels');
      }
      return { v, faults };
    },
    enter: (v) => v < 0.65,
    exit: (v) => v > 0.85,
    deeper: Math.min,
    end: (ext) => (ext > 0.25 ? ['shallow'] : []),
  },
  'push-up': {
    camera: 'side',
    setup: 'Side-on to the camera, phone on the floor about 2 m away.',
    need: ['sh', 'el', 'wr', 'hip', 'ank'],
    measure(p) {
      // Only judge a plank: body closer to horizontal than vertical.
      if (Math.abs(p.ank[1] - p.sh[1]) > Math.abs(p.ank[0] - p.sh[0]) * 0.7) return { v: null, faults: [], hint: 'Get into a plank, side-on to the camera.' };
      const v = angle(p.sh, p.el, p.wr);
      const faults = [];
      if (angle(p.sh, p.hip, p.ank) < 160) {
        const lineY = p.sh[1] + ((p.ank[1] - p.sh[1]) * (p.hip[0] - p.sh[0])) / ((p.ank[0] - p.sh[0]) || 1e-6);
        faults.push(p.hip[1] > lineY ? 'sag' : 'pike');
      }
      return { v, faults };
    },
    enter: (v) => v < 140,
    exit: (v) => v > 155,
    deeper: Math.min,
    end: (ext) => (ext > 105 ? ['partial'] : []),
  },
  'barbell-curl': {
    camera: 'side',
    setup: 'Stand side-on to the camera, whole upper body and hips in view.',
    need: ['sh', 'el', 'wr', 'hip'],
    measure(p, ctx, inRep) {
      const v = angle(p.sh, p.el, p.wr);
      const faults = [];
      // Both checks compare with the athlete's own resting stance, so camera angle
      // and where the model puts the shoulder point cancel out.
      const arm = angle(p.hip, p.sh, p.el);
      const lean = leanFromUp(p.hip, p.sh);
      if (!inRep) {
        if (v > 145) { ctx.arm0 = ctx.arm0 == null ? arm : ctx.arm0 * 0.8 + arm * 0.2; ctx.lean0 = lean; }
      } else {
        // Judged in the top half of the curl: mid-way, a side camera often loses the
        // elbow behind the plates and the point jumps forward.
        if (v < 100 && arm - ctx.arm0 > 40) faults.push('elbows');
        if (Math.abs(lean - ctx.lean0) > 10) faults.push('swing');
      }
      return { v, faults };
    },
    enter: (v) => v < 125,
    exit: (v) => v > 145,
    deeper: Math.min,
  },
  'lateral-raise': {
    camera: 'front',
    setup: 'Face the camera, head to hips in view.',
    need: ['shL', 'shR', 'elL', 'elR', 'hipL', 'hipR', 'earL', 'earR'],
    measure(p, ctx, inRep) {
      const v = (angle(p.hipL, p.shL, p.elL) + angle(p.hipR, p.shR, p.elR)) / 2;
      const faults = [];
      if (v > 105) faults.push('high');
      // Neck height = ear line above shoulder line, in shoulder widths. Shrugging shortens it.
      const neck = (mid(p.shL, p.shR)[1] - mid(p.earL, p.earR)[1]) / (dist(p.shL, p.shR) || 1);
      if (!inRep && v < 30) ctx.neck0 = ctx.neck0 == null ? neck : ctx.neck0 * 0.9 + neck * 0.1;
      else if (inRep && ctx.neck0 != null && neck < ctx.neck0 * 0.75) faults.push('shrug');
      return { v, faults };
    },
    enter: (v) => v > 45,
    exit: (v) => v < 30,
    deeper: Math.max,
  },
};

/** Label = the mistake as written in the exercise library; cue = the trainer's line for it. */
function faultText(ex) {
  const c = CUES[ex.id]; const m = ex.mistakes;
  return {
    'back-squat': {
      kneesIn: { label: m[0], cue: c.tips[0] },
      heels: { label: m[1], cue: 'Heels down. Push through the whole foot.' },
      shallow: { label: 'Not reaching parallel', cue: c.lower },
    },
    'push-up': {
      sag: { label: 'Hips sagging', cue: c.tips[0] },
      pike: { label: 'Hips piking up', cue: 'Hips down. One straight line, head to heels.' },
      partial: { label: m[1], cue: c.lower },
    },
    'barbell-curl': {
      elbows: { label: m[1], cue: c.tips[0] },
      swing: { label: m[0], cue: c.tips[1] },
    },
    'lateral-raise': {
      high: { label: m[2], cue: c.tips[0] },
      shrug: { label: m[1], cue: c.tips[1] },
    },
  }[ex.id];
}

export { FORM_CHECK_IDS };
export const hasFormCheck = (id) => id in RULES;
if (FORM_CHECK_IDS.some((id) => !(id in RULES))) throw new Error('formcheckIds.js lists an exercise without form-check rules');

// Landmark triples for the working-joint angle readout (side views only).
const JOINT_POINTS = { shoulder: ['hip', 'sh', 'el'], elbow: ['sh', 'el', 'wr'], hip: ['sh', 'hip', 'knee'], knee: ['hip', 'knee', 'ank'] };
const SIDE_KEYS = { sh: 'sh', el: 'el', wr: 'wr', hip: 'hip', knee: 'knee', ank: 'ank', heel: 'heel', toe: 'toe', ear: 'ear' };

/** Camera placement and what the check watches, for the intro screen. */
export function formCheckInfo(id) {
  const ex = EXERCISE_BY_ID[id]; const r = RULES[id];
  const joint = workingJoints(ex)[0]?.name;
  const text = faultText(ex);
  return {
    camera: r.camera,
    setup: r.setup,
    joint, jointLabel: JOINT_LABEL[joint],
    faults: Object.values(text).map((f) => f.label),
    faultText: text,
  };
}

/** Landmark indices the overlay should ring for the working joint on side `s` ('L'/'R'). */
export function jointLandmarks(id, side) {
  const joint = workingJoints(EXERCISE_BY_ID[id])[0]?.name;
  const key = { shoulder: 'sh', elbow: 'el', hip: 'hip', knee: 'knee', ankle: 'ank' }[joint];
  if (!key) return [];
  const sides = RULES[id].camera === 'front' ? ['L', 'R'] : [side];
  return sides.map((s) => LM[`${key}${s}`]);
}

/**
 * Stateful tracker for one set. Call `update(landmarks, aspect)` once per video
 * frame; `aspect` is frame width / height so angles are measured in true proportions.
 */
export function createTracker(id) {
  const ex = EXERCISE_BY_ID[id]; const rule = RULES[id]; const text = faultText(ex);
  const joint = workingJoints(ex)[0]?.name;
  let smooth = null; let inRep = false; let ext = null; let repFaults = new Set();
  let ready = false; // a rep only starts after the athlete has been seen at rest
  const streak = {}; const ctx = {}; const reps = [];

  function points(lms, aspect) {
    const raw = lms.map((l) => [l.x * aspect, l.y, l.visibility ?? 1]);
    smooth = smooth && smooth.length === raw.length
      ? raw.map((r, i) => [smooth[i][0] + (r[0] - smooth[i][0]) * SMOOTH, smooth[i][1] + (r[1] - smooth[i][1]) * SMOOTH, r[2]])
      : raw;
    return smooth;
  }

  function update(lms, aspect = 1) {
    if (!lms || lms.length < 33) return snapshot(false, 'Step back so your whole body is in view.');
    const pts = points(lms, aspect);
    const at = (k) => pts[LM[k]];
    let p;
    let side = null;
    if (rule.camera === 'side') {
      const score = (s) => ['sh', 'el', 'wr', 'hip', 'knee', 'ank'].reduce((a, k) => a + at(`${k}${s}`)[2], 0);
      side = score('L') >= score('R') ? 'L' : 'R';
      p = Object.fromEntries(Object.keys(SIDE_KEYS).map((k) => [k, at(`${k}${side}`)]));
    } else {
      p = Object.fromEntries(Object.keys(LM).map((k) => [k, at(k)]));
    }
    if (rule.need.some((k) => p[k][2] < MIN_VIS)) return snapshot(false, rule.setup, side);

    const m = rule.measure(p, ctx, inRep);
    if (m.v == null) return snapshot(true, m.hint, side);
    for (const k of Object.keys(text)) streak[k] = m.faults.includes(k) ? (streak[k] || 0) + 1 : 0;
    const live = Object.keys(text).filter((k) => streak[k] >= HOLD);

    if (!inRep && rule.exit(m.v)) ready = true;
    if (!inRep && ready && rule.enter(m.v)) { inRep = true; ext = m.v; repFaults = new Set(); }
    if (inRep) {
      ext = rule.deeper(ext, m.v);
      live.forEach((k) => repFaults.add(k));
      if (rule.exit(m.v)) {
        inRep = false;
        (rule.end?.(ext) || []).forEach((k) => repFaults.add(k));
        reps.push({ n: reps.length + 1, faults: [...repFaults], extreme: Math.round(ext * 100) / 100 });
      }
    }
    const angleDeg = rule.camera === 'side' && JOINT_POINTS[joint] ? Math.round(angle(...JOINT_POINTS[joint].map((k) => p[k]))) : null;
    return snapshot(true, null, side, live, m.v, angleDeg);
  }

  function snapshot(visible, hint, side = null, live = [], value = null, angleDeg = null) {
    const last = reps[reps.length - 1];
    return {
      visible,
      hint,
      side,
      reps: reps.length,
      good: reps.filter((r) => !r.faults.length).length,
      phase: inRep ? 'rep' : 'rest',
      value,
      joint: joint && { name: joint, label: JOINT_LABEL[joint], deg: angleDeg },
      live: live.map((k) => ({ id: k, ...text[k] })),
      lastRep: last && { ...last, faults: last.faults.map((k) => ({ id: k, ...text[k] })) },
    };
  }

  return { update, reps: () => reps.map((r) => ({ ...r })) };
}
