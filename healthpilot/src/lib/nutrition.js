/**
 * Energy & macro target engine.
 *  - BMR: Mifflin–St Jeor (most accurate general-population equation)
 *  - BMI: WHO Asia-Pacific cut-offs (23 / 25), which fit Indian bodies
 *    better than the global 25 / 30 thresholds most apps use.
 */

export const ACTIVITY = {
  sedentary: { label: 'Sedentary', hint: 'Desk job, little exercise', factor: 1.2 },
  light: { label: 'Lightly active', hint: 'Walks / workouts 1–3×/week', factor: 1.375 },
  moderate: { label: 'Moderately active', hint: 'Workouts 3–5×/week', factor: 1.55 },
  active: { label: 'Very active', hint: 'Hard training 6–7×/week', factor: 1.725 },
  athlete: { label: 'Athlete', hint: 'Physical job + daily training', factor: 1.9 },
};

export const GOALS = {
  lose: 'Lose weight',
  maintain: 'Maintain weight',
  gain: 'Gain muscle / weight',
};

export const KCAL_PER_KG = 7700;

export function bmr({ sex, weight, height, age }) {
  const base = 10 * weight + 6.25 * height - 5 * age;
  return Math.round(sex === 'female' ? base - 161 : base + 5);
}

export function tdee(profile) {
  return Math.round(bmr(profile) * (ACTIVITY[profile.activity]?.factor ?? 1.2));
}

export function bmi(weight, height) {
  const m = height / 100;
  return weight / (m * m);
}

export function bmiCategory(value) {
  if (value < 18.5) return { label: 'Underweight', tone: 'warn' };
  if (value < 23) return { label: 'Healthy', tone: 'good' };
  if (value < 25) return { label: 'Overweight', tone: 'warn' };
  return { label: 'Obese', tone: 'bad' };
}

const round5 = (n) => Math.round(n / 5) * 5;

/**
 * Daily targets from a profile. Safe floors prevent crash-diet targets.
 * @returns {{kcal,p,c,f,fib,water,steps,sleep,tdee,bmr,deficit,floorApplied}}
 */
export function computeTargets(profile, currentWeight = profile.weight) {
  const p = { ...profile, weight: currentWeight };
  const maintenance = tdee(p);
  const pace = profile.goal === 'maintain' ? 0 : Number(profile.pace || 0.5);
  const sign = profile.goal === 'lose' ? -1 : profile.goal === 'gain' ? 1 : 0;
  // Muscle gain is slower than fat loss — cap the surplus.
  const delta = sign === 1 ? Math.min((pace * KCAL_PER_KG) / 7, 500) : sign * (pace * KCAL_PER_KG) / 7;
  const floor = profile.sex === 'female' ? 1200 : 1500;
  let kcal = maintenance + delta;
  const floorApplied = kcal < floor;
  kcal = round5(Math.max(kcal, floor));

  // Protein on a "reference" weight (weight at BMI 25) so obese users don't get absurd targets.
  const refWeight = Math.min(currentWeight, 25 * (profile.height / 100) ** 2);
  const perKg = profile.goal === 'maintain' ? 1.4 : 1.8;
  const protein = Math.round(refWeight * perKg);
  const fat = Math.round((kcal * 0.27) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  const fibre = Math.round((kcal / 1000) * 14);
  const water = Math.max(2000, Math.round((currentWeight * 35) / 250) * 250);

  return {
    kcal, p: protein, c: carbs, f: fat, fib: fibre, water,
    steps: Number(profile.stepGoal || 8000), sleep: 7.5,
    tdee: maintenance, bmr: bmr(p), deficit: Math.round(kcal - maintenance), floorApplied,
  };
}

/** Rough ETA to goal weight at the chosen pace (weeks). */
export function weeksToGoal(profile, currentWeight) {
  if (profile.goal === 'maintain' || !profile.targetWeight) return null;
  const diff = Math.abs(currentWeight - profile.targetWeight);
  const pace = Number(profile.pace || 0.5);
  if (pace <= 0) return null;
  return Math.ceil(diff / pace);
}

export const sumNutrients = (items) =>
  items.reduce(
    (a, e) => ({
      kcal: a.kcal + e.kcal, p: a.p + e.p, c: a.c + e.c, f: a.f + e.f, fib: a.fib + e.fib,
    }),
    { kcal: 0, p: 0, c: 0, f: 0, fib: 0 },
  );

/** Nutrient totals for one logged entry (per-serving values × quantity). */
export function entryTotals(e) {
  const q = Number(e.qty) || 0;
  return { kcal: e.n.kcal * q, p: e.n.p * q, c: e.n.c * q, f: e.n.f * q, fib: (e.n.fib || 0) * q };
}

export function dayTotals(day) {
  return sumNutrients((day?.entries || []).map(entryTotals));
}
