/**
 * Daily habit scoring for the dashboard. Six habits, each 0..1 progress;
 * a habit counts as "hit" at 1. The day score is the share of habits hit.
 */
import { dayTotals } from './nutrition.js';
import { lastNDays } from './dates.js';
import { trainingConsistency } from './workout.js';

export const SLEEP_TARGET = 7;
export const WORKOUTS_PER_WEEK = 5;

export const HABITS = [
  { id: 'kcal', label: 'Calories on target', icon: '🔥' },
  { id: 'protein', label: 'Protein goal', icon: '🥚' },
  { id: 'water', label: 'Water', icon: '💧' },
  { id: 'steps', label: 'Steps', icon: '👟' },
  { id: 'sleep', label: 'Sleep 7 h+', icon: '😴' },
  { id: 'workout', label: 'Workout', icon: '🏋️' },
];

const clamp01 = (v) => Math.max(0, Math.min(1, v || 0));

/**
 * Calories count as hit when eaten is within 90–110 % of the target;
 * eating far over the target scores lower again.
 */
function kcalProgress(eaten, target) {
  if (!target || !eaten) return 0;
  const r = eaten / target;
  if (r >= 0.9 && r <= 1.1) return 1;
  return r < 0.9 ? clamp01(r / 0.9) * 0.95 : clamp01(1 - (r - 1.1) * 2);
}

export function habitProgress(state, targets, date) {
  const day = state.days[date] || { entries: [] };
  const t = dayTotals(day);
  const w = state.workouts?.[date];
  const { thisWeek } = trainingConsistency(state.workouts, date);
  const trained = !!w?.finishedAt;
  // A rest day is a win once the weekly workouts are already done.
  const restOk = !trained && thisWeek >= WORKOUTS_PER_WEEK;
  return {
    kcal: kcalProgress(t.kcal, targets.kcal),
    protein: clamp01(t.p / targets.p),
    water: clamp01((day.water || 0) / targets.water),
    steps: clamp01((day.steps || 0) / targets.steps),
    sleep: clamp01((day.sleep || 0) / SLEEP_TARGET),
    workout: trained || restOk ? 1 : w?.sets?.some((s) => s.done) ? 0.5 : 0,
    meta: { totals: t, day, trained, restOk, inProgress: !!w && !w.finishedAt },
  };
}

export function dayScore(progress) {
  return HABITS.filter((h) => progress[h.id] >= 1).length / HABITS.length;
}

/** Habit grid for the last `n` days (oldest first). */
export function habitHistory(state, targets, end, n = 7) {
  return lastNDays(n, end).map((date) => {
    const p = habitProgress(state, targets, date);
    return { date, progress: p, score: dayScore(p) };
  });
}
