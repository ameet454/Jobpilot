import { describe, expect, it } from 'vitest';
import { EXERCISE_BY_ID, EXERCISES } from '../src/data/exercises.js';
import { closedChain, mainJoint, stressCurve, stressSummary, trajectory } from '../src/lib/biomech.js';

const peakAt = (id) => { const c = stressCurve(EXERCISE_BY_ID[id]); return c.indexOf(Math.max(...c)) / (c.length - 1); };

describe('biomechanics overlays', () => {
  it('loads the joint the target muscle acts on', () => {
    expect(mainJoint(EXERCISE_BY_ID['bench-press']).name).toBe('shoulder');
    expect(mainJoint(EXERCISE_BY_ID['barbell-curl']).name).toBe('elbow');
    expect(mainJoint(EXERCISE_BY_ID['back-squat']).name).toBe('hip');
    expect(mainJoint(EXERCISE_BY_ID['leg-extension']).name).toBe('knee');
    expect(mainJoint(EXERCISE_BY_ID['lateral-raise']).name).toBe('shoulder');
  });

  it('matches the textbook resistance profiles', () => {
    // Curls are hardest with the forearm horizontal, mid-rep.
    expect(peakAt('barbell-curl')).toBeGreaterThan(0.3);
    expect(peakAt('barbell-curl')).toBeLessThan(0.7);
    // Lateral and front raises are hardest at the top.
    expect(peakAt('lateral-raise')).toBeGreaterThan(0.7);
    expect(peakAt('front-raise')).toBeGreaterThan(0.7);
    // Squats, deadlifts and RDLs are hardest out of the bottom.
    for (const id of ['back-squat', 'deadlift', 'romanian-deadlift']) expect(peakAt(id), id).toBeLessThan(0.3);
    // Rows are hardest at the squeeze.
    expect(peakAt('one-arm-db-row')).toBeGreaterThan(0.7);
  });

  it('gives every exercise a path, and a resistance profile unless the body is the lever', () => {
    for (const ex of EXERCISES) {
      const path = trajectory(ex, 0, 10);
      expect(path.every((p) => p.every(Number.isFinite)), ex.id).toBe(true);
      const c = stressCurve(ex);
      if (c) {
        expect(c.every((x) => x >= 0 && x <= 1.0001), ex.id).toBe(true);
        expect(stressSummary(ex).text.length).toBeGreaterThan(20);
      } else {
        expect(closedChain(ex) || !mainJoint(ex), ex.id).toBe(true);
      }
    }
  });
});

describe('natural lifting speed', async () => {
  const { liftTiming } = await import('../src/lib/biomech.js');
  it('moves monotonically from start to end and slows where the resistance peaks', () => {
    const curve = stressCurve(EXERCISE_BY_ID['barbell-curl']); // hardest mid-rep
    const timing = liftTiming(curve);
    let prev = -1;
    for (let i = 0; i <= 20; i += 1) { const sPos = timing(i / 20); expect(sPos).toBeGreaterThanOrEqual(prev); prev = sPos; }
    expect(timing(0)).toBeCloseTo(0, 5);
    expect(timing(1)).toBeCloseTo(1, 2);
    // Equal slices of time cover less ground in the middle (sticking point) than at the ends.
    const span = (a, b) => timing(b) - timing(a);
    expect(span(0.45, 0.55)).toBeLessThan(span(0, 0.1));
  });
});
