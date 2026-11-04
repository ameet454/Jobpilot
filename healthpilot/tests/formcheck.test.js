import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { angle, createTracker, FORM_CHECK_IDS, formCheckInfo, hasFormCheck, jointLandmarks, LM, leanFromUp } from '../src/lib/formcheck.js';
import { EXERCISE_BY_ID } from '../src/data/exercises.js';
import { curl, frame, fromTrainer, lateralRaise, pushUp, squat } from './fixtures/poseSequences.js';

function replay(id, frames) {
  const tr = createTracker(id);
  let last;
  for (const f of frames) last = tr.update(f, 1);
  return { last, reps: tr.reps() };
}
const faultIds = (reps) => [...new Set(reps.flatMap((r) => r.faults))].sort();

describe('geometry', () => {
  it('measures interior angles and lean', () => {
    expect(angle([0, 0], [1, 0], [1, 1])).toBeCloseTo(90);
    expect(angle([0, 0], [1, 0], [2, 0])).toBeCloseTo(180);
    expect(leanFromUp([0, 1], [0, 0])).toBeCloseTo(0);
    expect(leanFromUp([0, 1], [1, 1])).toBeCloseTo(90);
  });
});

describe('form check catalogue', () => {
  it('covers the four launch exercises, all real library entries', () => {
    expect([...FORM_CHECK_IDS].sort()).toEqual(['back-squat', 'barbell-curl', 'lateral-raise', 'push-up']);
    for (const id of FORM_CHECK_IDS) expect(EXERCISE_BY_ID[id]).toBeTruthy();
    expect(hasFormCheck('deadlift')).toBe(false);
  });
  it('labels faults with the library mistakes and picks the working joint', () => {
    expect(formCheckInfo('barbell-curl').faults).toContain('Elbows moving forward');
    expect(formCheckInfo('barbell-curl').joint).toBe('elbow');
    expect(formCheckInfo('lateral-raise').joint).toBe('shoulder');
    expect(jointLandmarks('barbell-curl', 'L')).toEqual([LM.elL]);
    expect(jointLandmarks('lateral-raise', 'L')).toEqual([LM.shL, LM.shR]);
  });
});

describe('back squat', () => {
  it('counts clean deep reps with no faults', () => {
    const { last, reps } = replay('back-squat', squat({ reps: 4 }));
    expect(last.reps).toBe(4);
    expect(last.good).toBe(4);
    expect(faultIds(reps)).toEqual([]);
  });
  it('flags shallow squats', () => {
    const { reps } = replay('back-squat', squat({ reps: 2, depth: 0.55 }));
    expect(reps).toHaveLength(2);
    expect(faultIds(reps)).toEqual(['shallow']);
  });
  it('flags knees caving in', () => {
    const { reps, last } = replay('back-squat', squat({ reps: 2, kneeCave: 0.6 }));
    expect(faultIds(reps)).toEqual(['kneesIn']);
    expect(last.lastRep.faults[0].cue).toBe('Knees follow your toes.');
  });
  it('flags heels lifting', () => {
    expect(faultIds(replay('back-squat', squat({ reps: 2, heelLift: 1 })).reps)).toEqual(['heels']);
  });
  it('ignores half-squats that never start a rep', () => {
    expect(replay('back-squat', squat({ reps: 3, depth: 0.2 })).last.reps).toBe(0);
  });
});

describe('push-up', () => {
  it('counts full reps on the visible side', () => {
    const { last, reps } = replay('push-up', pushUp({ reps: 5 }));
    expect(last.side).toBe('L');
    expect(last.reps).toBe(5);
    expect(faultIds(reps)).toEqual([]);
    expect(last.joint.label).toBe('Elbow');
  });
  it('flags partial range', () => {
    expect(faultIds(replay('push-up', pushUp({ reps: 2, bottom: 120 })).reps)).toEqual(['partial']);
  });
  it('tells hip sag from piking', () => {
    expect(faultIds(replay('push-up', pushUp({ reps: 2, sag: 0.07 })).reps)).toEqual(['sag']);
    expect(faultIds(replay('push-up', pushUp({ reps: 2, sag: -0.07 })).reps)).toEqual(['pike']);
  });
  it('does not count while standing up', () => {
    const { last } = replay('push-up', curl({ reps: 3 }));
    expect(last.reps).toBe(0);
    expect(last.hint).toMatch(/plank/);
  });
});

describe('barbell curl', () => {
  it('counts strict reps', () => {
    const { last, reps } = replay('barbell-curl', curl({ reps: 3 }));
    expect(last.reps).toBe(3);
    expect(faultIds(reps)).toEqual([]);
  });
  it('flags elbows drifting forward', () => {
    expect(faultIds(replay('barbell-curl', curl({ reps: 2, drift: 60 })).reps)).toEqual(['elbows']);
  });
  it('allows a little natural elbow travel', () => {
    expect(faultIds(replay('barbell-curl', curl({ reps: 2, drift: 30 })).reps)).toEqual([]);
  });
  it('counts reps on real pose-model output (the 3-D trainer filmed side-on)', () => {
    // 14 s of the app's curl animation run through MediaPipe Pose Landmarker lite at 15 fps.
    const rec = JSON.parse(readFileSync(new URL('./fixtures/curl-trainer-side.json', import.meta.url), 'utf8'));
    const tr = createTracker('barbell-curl');
    let st;
    for (const f of rec.frames) st = tr.update(f && f.map(([x, y, visibility]) => ({ x, y, visibility })), rec.aspect);
    expect(st.side).toBe('R');
    expect(tr.reps()).toHaveLength(4);
    expect(faultIds(tr.reps())).toEqual([]);
  });
  it('flags swinging the torso', () => {
    expect(faultIds(replay('barbell-curl', curl({ reps: 2, lean: 18 })).reps)).toContain('swing');
  });
});

describe('lateral raise', () => {
  it('counts reps to shoulder height', () => {
    const { last, reps } = replay('lateral-raise', lateralRaise({ reps: 4 }));
    expect(last.reps).toBe(4);
    expect(faultIds(reps)).toEqual([]);
  });
  it('flags raising above shoulder height', () => {
    expect(faultIds(replay('lateral-raise', lateralRaise({ reps: 2, top: 130 })).reps)).toEqual(['high']);
  });
  it('flags shrugging', () => {
    expect(faultIds(replay('lateral-raise', lateralRaise({ reps: 2, shrug: 0.035 })).reps)).toEqual(['shrug']);
  });
});

describe('the 3-D trainer animation passes its own form check', () => {
  for (const [id, view] of [['back-squat', 'front'], ['push-up', 'side'], ['barbell-curl', 'side'], ['lateral-raise', 'front']]) {
    it(id, () => {
      const { last, reps } = replay(id, fromTrainer(EXERCISE_BY_ID[id], view, 3));
      expect(last.reps).toBe(3);
      expect(faultIds(reps)).toEqual([]);
    });
  }
});

describe('visibility', () => {
  it('asks the athlete to get in frame when key joints are hidden', () => {
    const f = squat({ reps: 1 })[0];
    f[LM.kneeL].visibility = 0.1;
    const s = createTracker('back-squat').update(f, 1);
    expect(s.visible).toBe(false);
    expect(s.hint).toMatch(/camera/);
    expect(createTracker('back-squat').update(null).visible).toBe(false);
  });
  it('fills missing points so a frame always has 33 landmarks', () => {
    expect(frame({ shL: [0.1, 0.2] })).toHaveLength(33);
  });
});
