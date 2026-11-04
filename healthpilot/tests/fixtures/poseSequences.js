/*
 * Landmark sequences shaped like MediaPipe Pose output, for replaying through
 * the form-check tracker. Each generator returns an array of frames; a frame is
 * 33 { x, y, z, visibility } points in normalised image coordinates (y down).
 * Faults are dialled in with options so each test can isolate one of them.
 */
import { LM } from '../../src/lib/formcheck.js';
import { rig } from '../../src/lib/rig3d.js';

const FPS_PER_REP = 30;

export function frame(points, farVis = 0.99) {
  const out = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.2 }));
  for (const [k, [x, y]] of Object.entries(points)) out[LM[k]] = { x, y, z: 0, visibility: 0.99 };
  if (farVis !== 0.99) for (const [k] of Object.entries(points)) if (k.endsWith('R')) out[LM[k]].visibility = farVis;
  return out;
}

/** 0 → 1 → 0 over one rep, eased like a real lift; `rest` still frames before the first rep. */
function sweep(reps, rest = 10) {
  const ts = Array(rest).fill(0);
  for (let r = 0; r < reps; r++) for (let i = 0; i <= FPS_PER_REP; i++) ts.push((1 - Math.cos((2 * Math.PI * i) / FPS_PER_REP)) / 2);
  return ts.concat(Array(rest).fill(0));
}

/** Front view. depth 1 = hips level with knees. kneeCave / heelLift scale in at the bottom. */
export function squat({ reps = 3, depth = 1.05, kneeCave = 0, heelLift = 0 } = {}) {
  return sweep(reps).map((t) => {
    const d = t * depth; const drop = d * 0.18;
    const kw = 0.065 * (1 - kneeCave * t);
    return frame({
      earL: [0.53, 0.22 + drop], earR: [0.47, 0.22 + drop],
      shL: [0.58, 0.3 + drop], shR: [0.42, 0.3 + drop],
      hipL: [0.56, 0.5 + drop], hipR: [0.44, 0.5 + drop],
      kneeL: [0.5 + kw, 0.68], kneeR: [0.5 - kw, 0.68],
      ankL: [0.56, 0.86], ankR: [0.44, 0.86],
      heelL: [0.56, 0.875 - heelLift * t * 0.03], heelR: [0.44, 0.875 - heelLift * t * 0.03],
      toeL: [0.57, 0.885], toeR: [0.43, 0.885],
    });
  });
}

/** Side view, athlete's left side to the camera. bottom = elbow angle at the bottom. */
export function pushUp({ reps = 3, bottom = 85, sag = 0 } = {}) {
  const a = 0.075;
  return sweep(reps).map((t) => {
    const th = ((170 - (170 - bottom) * t) * Math.PI) / 180;
    const h = 2 * a * Math.sin(th / 2);
    const sh = [0.3, 0.75 - h]; const ank = [0.85, 0.72];
    const hip = [sh[0] + (ank[0] - sh[0]) * 0.45, sh[1] + (ank[1] - sh[1]) * 0.45 + sag];
    return frame({
      earL: [0.25, sh[1] - 0.03], shL: sh, elL: [0.3 + a * Math.cos(th / 2), 0.75 - h / 2], wrL: [0.3, 0.75],
      hipL: hip, kneeL: [(hip[0] + ank[0]) / 2, (hip[1] + ank[1]) / 2], ankL: ank,
      shR: sh, elR: sh, wrR: sh, hipR: hip, kneeR: hip, ankR: ank,
    }, 0.3);
  });
}

/** Side view. drift = degrees the elbow travels forward at the top; lean = torso swing back, degrees. */
export function curl({ reps = 3, drift = 5, lean = 0 } = {}) {
  return sweep(reps).map((t) => {
    const b = ((lean * t) * Math.PI) / 180;
    const hip = [0.5, 0.6]; const sh = [hip[0] - 0.3 * Math.sin(b), hip[1] - 0.3 * Math.cos(b)];
    const al = ((5 + (drift - 5) * t) * Math.PI) / 180;
    const el = [sh[0] + 0.15 * Math.sin(al), sh[1] + 0.15 * Math.cos(al)];
    const phi = al + ((180 - (165 - 125 * t)) * Math.PI) / 180;
    const wr = [el[0] + 0.14 * Math.sin(phi), el[1] + 0.14 * Math.cos(phi)];
    return frame({
      earL: [sh[0], sh[1] - 0.08], shL: sh, elL: el, wrL: wr, hipL: hip, kneeL: [0.5, 0.75], ankL: [0.5, 0.9],
      shR: sh, elR: el, wrR: wr, hipR: hip, kneeR: [0.5, 0.75], ankR: [0.5, 0.9],
    }, 0.3);
  });
}

/** Front view. top = arm elevation from hanging, degrees; shrug = shoulder rise at the top. */
export function lateralRaise({ reps = 3, top = 88, shrug = 0 } = {}) {
  return sweep(reps).map((t) => {
    const e = ((12 + (top - 12) * t) * Math.PI) / 180;
    const shy = 0.35 - shrug * t;
    const arm = (s) => {
      const sh = [0.5 + s * 0.1, shy];
      const el = [sh[0] + s * 0.14 * Math.sin(e), sh[1] + 0.14 * Math.cos(e)];
      return { sh, el, wr: [el[0] + s * 0.13 * Math.sin(e), el[1] + 0.13 * Math.cos(e)] };
    };
    const L = arm(1); const R = arm(-1);
    return frame({
      earL: [0.53, 0.27], earR: [0.47, 0.27],
      shL: L.sh, elL: L.el, wrL: L.wr, shR: R.sh, elR: R.el, wrR: R.wr,
      hipL: [0.57, 0.6], hipR: [0.43, 0.6], kneeL: [0.56, 0.75], kneeR: [0.44, 0.75], ankL: [0.56, 0.9], ankR: [0.44, 0.9],
    });
  });
}

/**
 * The app's own 3-D trainer animation filmed by a virtual camera: `side` looks
 * at the athlete's right flank, `front` faces them. Same joints the trainer draws.
 */
export function fromTrainer(ex, view, reps = 2) {
  const S = 1 / 300;
  return sweep(reps).map((t) => {
    const { J } = rig(ex, t); // pose A is always the resting position
    const P = (p) => (view === 'side' ? [0.5 + p[0] * S, 0.95 - p[1] * S] : [0.5 - p[2] * S, 0.95 - p[1] * S]);
    const pts = {};
    for (const [s, k] of [[1, 'R'], [-1, 'L']]) {
      Object.assign(pts, {
        [`sh${k}`]: P(J[`shoulder${s}`]), [`el${k}`]: P(J[`elbow${s}`]), [`wr${k}`]: P(J[`hand${s}`]),
        [`hip${k}`]: P(J[`hip${s}`]), [`knee${k}`]: P(J[`knee${s}`]), [`ank${k}`]: P(J[`ankle${s}`]),
        [`toe${k}`]: P(J[`toe${s}`]), [`heel${k}`]: P([J[`ankle${s}`][0] - 5, J[`ankle${s}`][1] - 6, J[`ankle${s}`][2]]),
        [`ear${k}`]: P([J.head[0], J.head[1], J.head[2] + s * 7]),
      });
    }
    const f = frame(pts);
    // A side camera sees the near (right) side clearly and the far side poorly.
    if (view === 'side') for (const k of Object.keys(pts)) if (k.endsWith('L')) f[LM[k]].visibility = 0.3;
    return f;
  });
}
