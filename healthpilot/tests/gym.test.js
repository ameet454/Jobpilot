import { describe, expect, it } from 'vitest';
import { EXERCISES, EXERCISE_BY_ID, MUSCLES } from '../src/data/exercises.js';
import { blendPose, LEN, repPhase, solvePose } from '../src/lib/pose.js';
import {
  buildSession, e1rm, isRecord, lastPerformance, nextPlanDay, personalRecords, PLANS, planDays, suggestNext, trainingConsistency, weeklyMuscleSets,
} from '../src/lib/workout.js';
import { dayScore, habitProgress } from '../src/lib/dashboard.js';
import { reducer, initialState } from '../src/lib/store.jsx';
import { addDays } from '../src/lib/dates.js';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe('exercise library', () => {
  it('has unique ids and valid muscles, alternatives and poses', () => {
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
    for (const ex of EXERCISES) {
      expect(ex.primary.length, ex.id).toBeGreaterThan(0);
      for (const m of [...ex.primary, ...ex.secondary]) expect(MUSCLES[m], `${ex.id}:${m}`).toBeTruthy();
      for (const a of ex.alts) expect(EXERCISE_BY_ID[a], `${ex.id} alt ${a}`).toBeTruthy();
      expect(ex.steps.length).toBeGreaterThanOrEqual(3);
      expect(['AB', 'BA']).toContain(ex.lift);
    }
  });

  it('every frame of every animation stays on screen', () => {
    for (const ex of EXERCISES) {
      for (let t = 0; t <= 1; t += 0.1) {
        const j = solvePose(blendPose(ex.A, ex.B, t));
        for (const p of [j.hip, j.neck, j.head, j.elbow, j.hand, j.knee, j.ankle, j.toe]) {
          expect(Number.isFinite(p[0]) && Number.isFinite(p[1]), ex.id).toBe(true);
          expect(p[0], `${ex.id} x @${t.toFixed(1)}`).toBeGreaterThan(-5);
          expect(p[0], `${ex.id} x @${t.toFixed(1)}`).toBeLessThan(305);
          expect(p[1], `${ex.id} y @${t.toFixed(1)}`).toBeGreaterThan(-15);
          expect(p[1], `${ex.id} y @${t.toFixed(1)}`).toBeLessThan(262);
        }
      }
    }
  });

  it('keeps limb lengths fixed while animating', () => {
    const j = solvePose(blendPose(EXERCISE_BY_ID['back-squat'].A, EXERCISE_BY_ID['back-squat'].B, 0.37));
    expect(dist(j.hip, j.knee)).toBeCloseTo(LEN.thigh, 5);
    expect(dist(j.knee, j.ankle)).toBeCloseTo(LEN.shin, 5);
    expect(dist(j.hip, j.neck)).toBeCloseTo(LEN.torso, 5);
  });

  it('keeps planted feet planted', () => {
    const sq = EXERCISE_BY_ID['back-squat'];
    expect(dist(solvePose(blendPose(sq.A, sq.B, 0)).ankle, solvePose(blendPose(sq.A, sq.B, 1)).ankle)).toBeLessThan(1e-9);
  });

  it('rep phases: squat lowers first, curl lifts first', () => {
    expect(repPhase(100, EXERCISE_BY_ID['back-squat'].tempo, 'BA').stage).toBe('lower');
    expect(repPhase(100, EXERCISE_BY_ID['barbell-curl'].tempo, 'AB').stage).toBe('lift');
  });
});

const D = '2026-11-03';
const sess = (dayId, sets, finishedAt = 1) => ({ dayId, startedAt: 0, finishedAt, sets });
const S = (exId, kg, reps, extra = {}) => ({ id: Math.random().toString(36), exId, kg, reps, type: 'normal', done: true, ...extra });

describe('workout maths', () => {
  it('Epley 1RM', () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(100, 10)).toBeCloseTo(133.33, 1);
  });

  it('double progression adds weight only when every set hits the top of the range', () => {
    const item = { reps: [6, 10] };
    const ex = EXERCISE_BY_ID['bench-press'];
    expect(suggestNext({ sets: [S('bench-press', 60, 10), S('bench-press', 60, 10)] }, item, ex)).toMatchObject({ kg: 62.5, reps: 6 });
    expect(suggestNext({ sets: [S('bench-press', 60, 10), S('bench-press', 60, 8)] }, item, ex)).toMatchObject({ kg: 60, reps: 10 });
    expect(suggestNext({ sets: [S('bench-press', 60, 7)] }, item, ex)).toMatchObject({ kg: 60, reps: 8 });
  });

  it('finds last performance and ignores warm-ups', () => {
    const workouts = {
      [addDays(D, -7)]: sess('push', [S('bench-press', 50, 8)]),
      [addDays(D, -3)]: sess('push', [S('bench-press', 40, 10, { type: 'warmup' }), S('bench-press', 55, 8)]),
    };
    const last = lastPerformance(workouts, 'bench-press', D);
    expect(last.date).toBe(addDays(D, -3));
    expect(last.sets.map((s) => s.kg)).toEqual([55]);
  });

  it('detects personal records against earlier days only', () => {
    const workouts = { [addDays(D, -3)]: sess('push', [S('bench-press', 60, 8)]), [D]: sess('push', [S('bench-press', 62.5, 8)], null) };
    expect(isRecord(workouts, D, workouts[D].sets[0])).toBe(true);
    expect(isRecord(workouts, D, S('bench-press', 55, 8))).toBe(false);
    expect(personalRecords(workouts)['bench-press'].kg).toBe(62.5);
  });

  it('counts weekly sets per muscle (primary 1, helper ½)', () => {
    const workouts = { [D]: sess('push', [S('bench-press', 60, 8), S('bench-press', 60, 8), S('bench-press', 40, 8, { done: false })]) };
    const m = weeklyMuscleSets(workouts, D);
    expect(m.chest).toBe(2);
    expect(m.triceps).toBe(1);
    expect(m.quads).toBe(0);
  });

  it('rotates through the 5 plan days and scales sets by level', () => {
    const days = planDays({ plan: 'ppl', level: 'intermediate' });
    expect(days).toHaveLength(5);
    expect(nextPlanDay({}, days, D).id).toBe('push');
    expect(nextPlanDay({ [addDays(D, -1)]: sess('legs', []) }, days, D).id).toBe('upper');
    expect(nextPlanDay({ [addDays(D, -1)]: sess('lower', []) }, days, D).id).toBe('push');
    const beginner = planDays({ plan: 'ppl', level: 'beginner' });
    expect(beginner[0].exercises[0].sets).toBe(days[0].exercises[0].sets - 1);
    expect(PLANS.bro.days).toHaveLength(5);
  });

  it('pre-fills a new session from the progression rule', () => {
    const days = planDays({ plan: 'ppl', level: 'intermediate' });
    const workouts = { [addDays(D, -2)]: sess('push', Array.from({ length: 4 }, () => S('bench-press', 60, 10))) };
    const s = buildSession(days[0], workouts, D);
    const bench = s.sets.filter((x) => x.exId === 'bench-press');
    expect(bench).toHaveLength(4);
    expect(bench[0]).toMatchObject({ kg: 62.5, reps: 6, done: false });
  });

  it('weekly consistency', () => {
    const workouts = Object.fromEntries([0, 1, 2].map((i) => [addDays(D, -i), sess('push', [])]));
    expect(trainingConsistency(workouts, D).thisWeek).toBe(3);
  });
});

describe('store + dashboard', () => {
  it('starts, logs, finishes and discards a workout', () => {
    let s = { ...initialState };
    s = reducer(s, { type: 'WORKOUT_START', date: D, session: { dayId: 'push', startedAt: 1, finishedAt: null, sets: [S('bench-press', 60, 8, { done: false, id: 'a' })] } });
    s = reducer(s, { type: 'WORKOUT_SET_ADD', date: D, exId: 'bench-press' });
    expect(s.workouts[D].sets).toHaveLength(2);
    s = reducer(s, { type: 'WORKOUT_SET_UPDATE', date: D, id: 'a', patch: { done: true, reps: 9 } });
    s = reducer(s, { type: 'WORKOUT_FINISH', date: D, at: 5 });
    expect(s.workouts[D].sets).toHaveLength(1);
    expect(s.workouts[D].finishedAt).toBe(5);
    s = reducer(s, { type: 'WORKOUT_DISCARD', date: D });
    expect(s.workouts[D]).toBeUndefined();
  });

  it('scores the day across six habits', () => {
    const targets = { kcal: 2000, p: 100, water: 2000, steps: 8000 };
    const state = {
      ...initialState,
      days: { [D]: { entries: [{ qty: 1, n: { kcal: 2000, p: 100, c: 0, f: 0, fib: 0 } }], water: 2000, steps: 9000, sleep: 7.5 } },
      workouts: { [D]: sess('push', [S('bench-press', 60, 8)]) },
    };
    const p = habitProgress(state, targets, D);
    expect(p.water).toBe(1);
    expect(p.workout).toBe(1);
    expect(dayScore(p)).toBeGreaterThan(0.6);
  });
});

describe('3-D anatomy rig', async () => {
  const { readFileSync } = await import('node:fs');
  const { rig, workingJoints, muscles } = await import('../src/lib/rig3d.js');
  const anatomy = JSON.parse(readFileSync(new URL('../public/anatomy/anatomy.json', import.meta.url)));

  it('the packed anatomy matches the rig bones and carries the licence credit', () => {
    const rigBones = new Set(rig(EXERCISE_BY_ID['bench-press'], 0.5).bones.map((b) => (b.side ? `${b.key}${b.side}` : b.key)));
    for (const b of anatomy.bones) {
      if (b === 'head' || b.startsWith('hand')) continue; // derived from torso / forearm
      expect(rigBones.has(b), b).toBe(true);
    }
    expect(anatomy.credit).toMatch(/BodyParts3D.*Database Center for Life Science.*Share Alike 2\.1 Japan/);
    const groups = new Set(anatomy.groups.map((g) => g.group));
    for (const m of Object.keys(MUSCLES)) expect(groups.has(m), m).toBe(true);
  });

  it('every bone frame is orthonormal in every frame of every exercise', () => {
    for (const ex of EXERCISES) {
      for (const t of [0, 0.5, 1]) {
        for (const b of rig(ex, t).bones) {
          const dot = (a, c) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
          expect(Math.abs(dot(b.u, b.f)), `${ex.id} ${b.key}`).toBeLessThan(1e-6);
          expect(Math.abs(dot(b.u, b.u) - 1), `${ex.id} ${b.key}`).toBeLessThan(1e-6);
        }
        expect(muscles(rig(ex, t)).length).toBeGreaterThan(20);
      }
    }
  });

  it('finds the joints each exercise works', () => {
    expect(workingJoints(EXERCISE_BY_ID['barbell-curl']).map((j) => j.name)).toEqual(['elbow']);
    expect(workingJoints(EXERCISE_BY_ID['back-squat']).map((j) => j.name).slice(0, 2).sort()).toEqual(['hip', 'knee']);
    expect(workingJoints(EXERCISE_BY_ID['lateral-raise'])[0].name).toBe('shoulder');
  });
});
