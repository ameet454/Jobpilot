import { describe, expect, it } from 'vitest';
import { EXERCISE_BY_ID, EXERCISES } from '../src/data/exercises.js';
import { trajectory } from '../src/lib/biomech.js';
import { blendPose, motionPlan, motionPose } from '../src/lib/pose.js';
import { rig, v } from '../src/lib/rig3d.js';

/** Largest distance of the load from the straight line between its start and end, as a share of the travel. */
function bend(ex) {
  const tr = trajectory(ex, 0, 40);
  const a = tr[0]; const b = tr[tr.length - 1];
  const u = v.norm(v.sub(b, a)); const L = v.len(v.sub(b, a));
  return Math.max(...tr.map((p) => { const d = v.sub(p, a); return v.len(v.sub(d, v.mul(u, v.dot(d, u)))); })) / L;
}

describe('natural motion', () => {
  it('keeps the key poses exactly', () => {
    for (const ex of EXERCISES) {
      for (const t of [0, 1]) {
        const p = motionPose(ex, t); const q = blendPose(ex.A, ex.B, t);
        for (const k of ['torso', 'ua', 'fa', 'th', 'sh']) if (q[k] != null) expect(p[k], `${ex.id} ${k} at t=${t}`).toBeCloseTo(q[k], 6);
      }
    }
  });

  it('moves the bar in a straight line in squats, deadlifts, pull-ups and dips', () => {
    for (const ex of EXERCISES.filter((e) => ['balance', 'hang'].includes(motionPlan(e).mode))) {
      expect(bend(ex), ex.id).toBeLessThan(0.05);
    }
  });

  it('keeps presses and rows close to a straight line', () => {
    for (const ex of EXERCISES.filter((e) => motionPlan(e).mode === 'reach')) {
      expect(bend(ex), ex.id).toBeLessThan(0.25);
    }
  });

  it('straightens the knees before the hips when pulling from the floor', () => {
    const ex = EXERCISE_BY_ID.deadlift;
    const p = motionPose(ex, 0.3);
    const knee = (p.th - ex.A.th) / (ex.B.th - ex.A.th);
    const hip = (p.torso - ex.A.torso) / (ex.B.torso - ex.A.torso);
    expect(knee).toBeGreaterThan(hip + 0.1);
  });

  it('keeps a hand-held bar in front of the thighs, not through them', () => {
    for (const [id, t] of [['barbell-curl', 0], ['deadlift', 1], ['romanian-deadlift', 0]]) {
      const R = rig(EXERCISE_BY_ID[id], t, 0);
      const bar = v.lerp(R.J.grip1, R.J['grip-1'], 0.5);
      // The front of the thigh sits ~12 in front of the hip joint line at the top of the leg.
      expect(bar[0] - R.J.hip[0], id).toBeGreaterThan(11);
    }
  });

  it('slides the shoulder blades back at the end of a row and forward on a reach', () => {
    const row = EXERCISE_BY_ID['barbell-row'];
    const back = (R) => { const c = R.bones.find((b) => b.key === 'chest'); return v.dot(v.sub(R.J.shoulder1, R.J.neck), c.f); };
    expect(back(rig(row, 1, 0))).toBeLessThan(back(rig(row, 0, 0)) - 2);
  });
});
