/**
 * Gym plans and the maths behind the workout log: what to lift next time,
 * personal records, and how many hard sets each muscle got this week.
 */
import { EXERCISE_BY_ID, MUSCLES } from '../data/exercises.js';
import { addDays, dateKey, lastNDays } from './dates.js';

const X = (id, sets, lo, hi, rest = 90) => ({ id, sets, reps: [lo, hi], rest });

/** Two 5-day weekly splits. Rest days are the 2 days the user skips. */
export const PLANS = {
  ppl: {
    label: 'Push · Pull · Legs · Upper · Lower',
    blurb: 'Every muscle twice a week — the split most studies favour for building muscle.',
    days: [
      { id: 'push', name: 'Push', focus: 'Chest, shoulders, triceps', icon: '🫸', exercises: [X('bench-press', 4, 6, 10, 150), X('incline-db-press', 3, 8, 12, 120), X('overhead-press', 3, 6, 10, 120), X('lateral-raise', 3, 12, 15, 60), X('triceps-pushdown', 3, 10, 15, 60), X('overhead-triceps', 2, 10, 15, 60)] },
      { id: 'pull', name: 'Pull', focus: 'Back, rear shoulders, biceps', icon: '🫷', exercises: [X('lat-pulldown', 4, 6, 10, 120), X('barbell-row', 4, 6, 10, 150), X('seated-cable-row', 3, 10, 12, 90), X('face-pull', 3, 12, 15, 60), X('barbell-curl', 3, 8, 12, 60), X('hammer-curl', 2, 10, 12, 60)] },
      { id: 'legs', name: 'Legs', focus: 'Quads, hamstrings, glutes, calves', icon: '🦵', exercises: [X('back-squat', 4, 5, 8, 180), X('romanian-deadlift', 3, 8, 10, 150), X('leg-press', 3, 10, 12, 120), X('leg-curl', 3, 10, 12, 60), X('calf-raise', 4, 10, 15, 60), X('plank', 3, 30, 60, 45)] },
      { id: 'upper', name: 'Upper', focus: 'Chest, back, shoulders, arms', icon: '💪', exercises: [X('incline-db-press', 4, 8, 10, 120), X('pull-up', 4, 5, 10, 150), X('dips', 3, 8, 12, 90), X('seated-cable-row', 3, 10, 12, 90), X('lateral-raise', 3, 12, 15, 60), X('cable-fly', 3, 12, 15, 60)] },
      { id: 'lower', name: 'Lower + core', focus: 'Posterior chain, glutes, abs', icon: '🍑', exercises: [X('deadlift', 3, 4, 6, 180), X('walking-lunge', 3, 10, 12, 90), X('hip-thrust', 3, 8, 12, 120), X('leg-extension', 3, 12, 15, 60), X('hanging-leg-raise', 3, 10, 15, 60), X('crunch', 3, 15, 20, 45)] },
    ],
  },
  bro: {
    label: 'Body-part split',
    blurb: 'One main muscle group per day — the classic Indian-gym routine, easy to follow.',
    days: [
      { id: 'chest', name: 'Chest', focus: 'Chest + triceps finisher', icon: '🫁', exercises: [X('bench-press', 4, 6, 10, 150), X('incline-db-press', 4, 8, 12, 120), X('dips', 3, 8, 12, 90), X('cable-fly', 3, 12, 15, 60), X('push-up', 2, 10, 20, 60)] },
      { id: 'back', name: 'Back', focus: 'Lats, mid-back, lower back', icon: '🔙', exercises: [X('deadlift', 3, 4, 6, 180), X('pull-up', 4, 5, 10, 150), X('barbell-row', 4, 6, 10, 120), X('lat-pulldown', 3, 10, 12, 90), X('seated-cable-row', 3, 10, 12, 90)] },
      { id: 'legs', name: 'Legs', focus: 'Quads, hamstrings, glutes, calves', icon: '🦵', exercises: [X('back-squat', 4, 5, 8, 180), X('leg-press', 3, 10, 12, 120), X('romanian-deadlift', 3, 8, 10, 120), X('leg-curl', 3, 10, 12, 60), X('leg-extension', 3, 12, 15, 60), X('calf-raise', 4, 10, 15, 60)] },
      { id: 'shoulders', name: 'Shoulders', focus: 'All three heads + traps', icon: '🏋️', exercises: [X('overhead-press', 4, 6, 10, 150), X('lateral-raise', 4, 12, 15, 60), X('face-pull', 3, 12, 15, 60), X('hanging-leg-raise', 3, 10, 15, 60), X('plank', 3, 30, 60, 45)] },
      { id: 'arms', name: 'Arms + abs', focus: 'Biceps, triceps, forearms, core', icon: '💪', exercises: [X('barbell-curl', 4, 8, 12, 75), X('triceps-pushdown', 4, 10, 15, 60), X('hammer-curl', 3, 10, 12, 60), X('overhead-triceps', 3, 10, 15, 60), X('crunch', 3, 15, 20, 45), X('hip-thrust', 3, 8, 12, 90)] },
    ],
  },
};

export const LEVELS = {
  beginner: { label: 'Beginner (0–6 months)', setDelta: -1 },
  intermediate: { label: 'Intermediate (6 months–2 years)', setDelta: 0 },
  advanced: { label: 'Advanced (2+ years)', setDelta: 1 },
};

export const SET_TYPES = {
  normal: { label: 'Normal', short: '' },
  warmup: { label: 'Warm-up', short: 'W' },
  drop: { label: 'Drop set', short: 'D' },
  failure: { label: 'To failure', short: 'F' },
};

/** Plan days adjusted for the user's level (beginners do one set fewer). */
export function planDays(gym) {
  const plan = PLANS[gym?.plan] || PLANS.ppl;
  const delta = LEVELS[gym?.level]?.setDelta ?? 0;
  return plan.days.map((d) => ({ ...d, exercises: d.exercises.map((e) => ({ ...e, sets: Math.max(2, e.sets + delta) })) }));
}

/** Estimated one-rep max (Epley). Only meaningful up to ~12 reps. */
export const e1rm = (kg, reps) => (kg > 0 && reps > 0 ? (reps === 1 ? kg : kg * (1 + reps / 30)) : 0);

const workingSets = (sets) => sets.filter((s) => s.done && s.type !== 'warmup');

/** Sessions in date order (oldest first). */
export function sessions(workouts) {
  return Object.entries(workouts || {}).sort(([a], [b]) => a.localeCompare(b)).map(([date, w]) => ({ date, ...w }));
}

/** The most recent session (before `date`) that included this exercise. */
export function lastPerformance(workouts, exId, date = dateKey()) {
  const past = sessions(workouts).filter((s) => s.date < date).reverse();
  for (const s of past) {
    const sets = workingSets(s.sets || []).filter((x) => x.exId === exId);
    if (sets.length) return { date: s.date, sets };
  }
  return null;
}

/**
 * Double progression: stay at a weight until every working set reaches the
 * top of the rep range, then add the exercise's increment and drop to the
 * bottom of the range. Bodyweight / timed moves progress by reps.
 */
export function suggestNext(last, { reps: [lo, hi] }, ex) {
  if (!last?.sets?.length) return null;
  const top = last.sets.reduce((a, s) => (s.kg > a.kg || (s.kg === a.kg && s.reps > a.reps) ? s : a), last.sets[0]);
  const allHitTop = last.sets.every((s) => s.reps >= hi);
  if (!ex.inc || !top.kg) return { kg: top.kg || 0, reps: Math.min(hi + (allHitTop ? 2 : 0), Math.max(lo, top.reps + 1)), why: allHitTop ? 'You hit the top of the range — add reps or a harder variation.' : 'Beat last time by one rep.' };
  if (allHitTop) return { kg: +(top.kg + ex.inc).toFixed(2), reps: lo, why: `All sets reached ${hi} reps — add ${ex.inc} kg.` };
  return { kg: top.kg, reps: Math.min(hi, top.reps + 1), why: `Same weight, aim for ${Math.min(hi, top.reps + 1)} reps.` };
}

/** Best estimated 1RM per exercise across all history, with the date it was set. */
export function personalRecords(workouts) {
  const best = {};
  for (const s of sessions(workouts)) {
    for (const set of workingSets(s.sets || [])) {
      const v = EXERCISE_BY_ID[set.exId]?.unit === 'time' ? set.reps : e1rm(set.kg, set.reps);
      if (!v) continue;
      if (!best[set.exId] || v > best[set.exId].value) best[set.exId] = { value: v, kg: set.kg, reps: set.reps, date: s.date };
    }
  }
  return best;
}

/** Is this set a new record compared with everything before `date`? */
export function isRecord(workouts, date, set) {
  if (!set.done || set.type === 'warmup') return false;
  const before = Object.fromEntries(Object.entries(workouts || {}).filter(([d]) => d < date));
  const prev = personalRecords(before)[set.exId];
  const timed = EXERCISE_BY_ID[set.exId]?.unit === 'time';
  const v = timed ? set.reps : e1rm(set.kg, set.reps);
  return v > 0 && prev != null && v > prev.value + 1e-9;
}

/** Hard sets per muscle over the last 7 days. Primary muscles count 1, helpers ½. */
export function weeklyMuscleSets(workouts, end = dateKey()) {
  const days = new Set(lastNDays(7, end));
  const out = Object.fromEntries(Object.keys(MUSCLES).map((m) => [m, 0]));
  for (const s of sessions(workouts)) {
    if (!days.has(s.date)) continue;
    for (const set of workingSets(s.sets || [])) {
      const ex = EXERCISE_BY_ID[set.exId]; if (!ex) continue;
      ex.primary.forEach((m) => { out[m] += 1; });
      ex.secondary.forEach((m) => { out[m] += 0.5; });
    }
  }
  return out;
}

/** 10–20 hard sets per muscle per week is the commonly used range for muscle growth. */
export const WEEKLY_SET_TARGET = [10, 20];

export function sessionStats(w) {
  const sets = workingSets(w?.sets || []);
  const volume = sets.reduce((a, s) => a + (EXERCISE_BY_ID[s.exId]?.unit === 'time' ? 0 : (s.kg || 0) * (s.reps || 0)), 0);
  const exercises = new Set(sets.map((s) => s.exId)).size;
  const minutes = w?.startedAt && w?.finishedAt ? Math.round((w.finishedAt - w.startedAt) / 60000) : null;
  return { sets: sets.length, volume: Math.round(volume), exercises, minutes };
}

/** Which plan day comes next: the one after the last finished session. */
export function nextPlanDay(workouts, days, date = dateKey()) {
  const done = sessions(workouts).filter((s) => s.finishedAt && s.date < date && days.some((d) => d.id === s.dayId));
  if (!done.length) return days[0];
  const i = days.findIndex((d) => d.id === done[done.length - 1].dayId);
  return days[(i + 1) % days.length];
}

/** Workouts finished in the 7 days ending `end` and the current weekly streak. */
export function trainingConsistency(workouts, end = dateKey()) {
  const finished = new Set(sessions(workouts).filter((s) => s.finishedAt).map((s) => s.date));
  const thisWeek = lastNDays(7, end).filter((d) => finished.has(d)).length;
  // Weeks in a row (counting back from this one) with at least 3 workouts.
  let weeks = 0;
  for (let w = 0; w < 52; w += 1) {
    const n = lastNDays(7, addDays(end, -7 * w)).filter((d) => finished.has(d)).length;
    if (n >= 3) weeks += 1; else if (w > 0 || n === 0) break;
  }
  return { thisWeek, weeks, finished };
}

/** Pre-filled sets for a plan day, using last time's numbers and the progression rule. */
export function buildSession(day, workouts, date = dateKey()) {
  let n = 0;
  const id = () => `${Date.now().toString(36)}${(n += 1)}`;
  const sets = [];
  for (const item of day.exercises) {
    const ex = EXERCISE_BY_ID[item.id];
    const next = suggestNext(lastPerformance(workouts, item.id, date), item, ex);
    for (let i = 0; i < item.sets; i += 1) {
      sets.push({ id: id(), exId: item.id, kg: next?.kg ?? '', reps: next?.reps ?? item.reps[0], type: 'normal', done: false });
    }
  }
  return { dayId: day.id, startedAt: Date.now(), finishedAt: null, sets };
}
