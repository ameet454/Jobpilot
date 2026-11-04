import { describe, expect, it } from 'vitest';
import { parseMeal, searchFoods } from '../src/lib/parser.js';
import { bmr, computeTargets, bmiCategory, bmi } from '../src/lib/nutrition.js';
import { smoothTrend, weeklyRate } from '../src/lib/trend.js';
import { generatePlan } from '../src/lib/planner.js';
import { reducer, initialState } from '../src/lib/store.jsx';
import { FOODS } from '../src/data/foods.js';

const ids = (items) => items.map((i) => [i.food?.id, i.qty]);

describe('meal parser', () => {
  it('parses a typical Indian lunch', () => {
    expect(ids(parseMeal('2 roti, 1 bowl dal and half plate rice + chai'))).toEqual([
      ['roti', 2], ['dal', 1], ['rice', 0.5], ['chai', 1],
    ]);
  });
  it('handles plurals, fractions and Hindi numbers', () => {
    expect(ids(parseMeal('3 idlis, 1/2 bowl sambar, do eggs'))).toEqual([['idli', 3], ['sambar', 0.5], ['egg', 2]]);
    expect(ids(parseMeal('1 1/2 katori rajma'))).toEqual([['rajma', 1.5]]);
  });
  it('scales gram amounts by serving weight', () => {
    expect(ids(parseMeal('200g paneer'))).toEqual([['paneer', 2]]);
    expect(ids(parseMeal('500 ml milk'))).toEqual([['milk', 2]]);
  });
  it('matches aliases and multi-word dishes', () => {
    expect(parseMeal('golgappa')[0].food.id).toBe('pani-puri');
    expect(parseMeal('dal makhani')[0].food.id).toBe('dal-makhani');
    expect(parseMeal('aloo paratha with curd').map((i) => i.food.id)).toEqual(['aloo-paratha', 'curd']);
    expect(parseMeal('masala dosa')[0].food.id).toBe('masala-dosa');
    expect(parseMeal('a banana')[0].food.id).toBe('banana');
  });
  it('flags unknown foods instead of guessing wildly', () => {
    expect(parseMeal('zxqv')[0].food).toBeNull();
  });
  it('search ranks exact names first', () => {
    expect(searchFoods('rice')[0].food.id).toBe('rice');
    expect(searchFoods('chicken')[0].food.name).toMatch(/Chicken/);
  });
});

describe('food database', () => {
  it('has unique ids and sane macro energy', () => {
    expect(new Set(FOODS.map((f) => f.id)).size).toBe(FOODS.length);
    for (const f of FOODS) {
      const fromMacros = f.p * 4 + f.c * 4 + f.f * 9;
      if (f.kcal > 30 && f.id !== 'beer') expect(Math.abs(fromMacros - f.kcal) / f.kcal, f.id).toBeLessThan(0.25);
    }
  });
});

describe('targets', () => {
  const profile = { sex: 'male', age: 30, height: 175, weight: 80, activity: 'light', goal: 'lose', pace: 0.5 };
  it('computes Mifflin-St Jeor BMR', () => {
    expect(bmr(profile)).toBe(1749);
  });
  it('creates a deficit and macros that add up', () => {
    const t = computeTargets(profile);
    expect(t.kcal).toBeLessThan(t.tdee);
    expect(Math.abs(t.p * 4 + t.c * 4 + t.f * 9 - t.kcal)).toBeLessThan(10);
  });
  it('never goes below a safe floor', () => {
    const t = computeTargets({ sex: 'female', age: 50, height: 150, weight: 48, activity: 'sedentary', goal: 'lose', pace: 1 });
    expect(t.kcal).toBe(1200);
    expect(t.floorApplied).toBe(true);
  });
  it('uses Asian BMI cut-offs', () => {
    expect(bmiCategory(bmi(72, 172)).label).toBe('Overweight'); // 24.3
  });
});

describe('weight trend', () => {
  it('smooths noise and detects a downward rate', () => {
    const series = Array.from({ length: 28 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      weight: 80 - i * 0.07 + (i % 2 ? 0.6 : -0.6),
    }));
    const tr = smoothTrend(series);
    const rate = weeklyRate(tr);
    expect(rate).toBeLessThan(0);
    expect(rate).toBeGreaterThan(-1);
  });
});

describe('meal planner', () => {
  it('stays near the calorie target and respects vegetarian diet', () => {
    for (let seed = 1; seed < 30; seed++) {
      const plan = generatePlan({ kcal: 1800, p: 100 }, 'v', seed);
      expect(Math.abs(plan.total.kcal - 1800) / 1800).toBeLessThan(0.2);
      for (const m of Object.values(plan.meals)) for (const it of m.items) expect(it.food.diet).toBe('v');
      expect(plan.total.p).toBeGreaterThanOrEqual(80);
    }
  });
});

describe('store reducer', () => {
  it('adds and removes entries and tracks recents', () => {
    let s = reducer(initialState, { type: 'ADD_ENTRIES', date: '2026-01-01', entries: [{ foodId: 'roti', qty: 2, meal: 'lunch', name: 'Roti', n: { kcal: 104, p: 3, c: 18, f: 2.5, fib: 2.7 } }] });
    expect(s.days['2026-01-01'].entries).toHaveLength(1);
    expect(s.recents).toEqual(['roti']);
    const id = s.days['2026-01-01'].entries[0].id;
    s = reducer(s, { type: 'REMOVE_ENTRY', date: '2026-01-01', id });
    expect(s.days['2026-01-01'].entries).toHaveLength(0);
  });
  it('records fasting history', () => {
    let s = reducer(initialState, { type: 'FAST_START', start: 0, target: 16 });
    s = reducer(s, { type: 'FAST_END', end: 16 * 3600e3 });
    expect(s.fasting.active).toBeNull();
    expect(s.fasting.history[0]).toMatchObject({ start: 0, target: 16 });
  });
});

describe('count-based servings', () => {
  it('divides by the count in the serving label', () => {
    expect(ids(parseMeal('10 almonds, 12 pani puri'))).toEqual([['almonds', 1], ['pani-puri', 2]]);
    expect(ids(parseMeal('1 plate pani puri'))).toEqual([['pani-puri', 1]]);
    expect(parseMeal('sabzi')[0].food.id).toBe('mix-veg');
  });
});

describe('meal planner robustness', async () => {
  const { generatePlan, dietCode } = await import('../src/lib/planner.js');
  it('accepts spelled-out diet values and never returns an empty meal', () => {
    expect(dietCode('nonveg')).toBe('n');
    expect(dietCode('veg')).toBe('v');
    expect(dietCode(undefined)).toBe('v');
    for (const diet of ['v', 'e', 'n', 'nonveg', 'veg', 'unknown', undefined]) {
      const plan = generatePlan({ kcal: 2000, p: 120 }, diet, 42);
      expect(Object.values(plan.meals).every((m) => m && m.items.length > 0), String(diet)).toBe(true);
      expect(plan.total.kcal).toBeGreaterThan(1000);
    }
  });
});
