/**
 * Day meal-plan generator built from real Indian thalis.
 * Splits the calorie target across meals, picks combos that match the user's
 * diet, scales portions to the meal budget in practical ½-serving steps and
 * prefers the most protein-dense option among a few random candidates.
 */
import { FOOD_BY_ID } from '../data/foods.js';

export const MEAL_SPLIT = { breakfast: 0.25, lunch: 0.35, snacks: 0.1, dinner: 0.3 };

const COMBOS = {
  breakfast: [
    ['idli', 'sambar', 'coconut-chutney'], ['poha', 'curd'], ['besan-chilla', 'curd'], ['oats', 'banana', 'almonds'],
    ['moong-chilla', 'hung-curd'], ['upma', 'chai'], ['dosa', 'sambar'], ['aloo-paratha', 'curd'],
    ['dalia', 'milk'], ['sprouts', 'skim-milk', 'apple'], ['omelette', 'brown-bread', 'orange'],
    ['egg-bhurji', 'roti'], ['uttapam', 'sambar'], ['thepla', 'curd'], ['brown-bread', 'peanut-butter', 'banana'],
  ],
  lunch: [
    ['roti', 'dal', 'mix-veg', 'salad'], ['rice', 'rajma', 'salad'], ['rice', 'chole', 'salad'],
    ['roti', 'palak-paneer', 'salad'], ['rice', 'sambar', 'bhindi', 'curd'], ['khichdi', 'curd', 'salad'],
    ['roti', 'soya-curry', 'salad'], ['jowar-roti', 'moong-dal', 'aloo-gobi'], ['brown-rice', 'dal-tadka', 'raita'],
    ['roti', 'chicken-curry', 'salad'], ['rice', 'fish-curry', 'salad'], ['roti', 'egg-curry', 'salad'],
    ['quinoa', 'chole', 'salad'], ['bajra-roti', 'kadhi', 'baingan-bharta'],
  ],
  snacks: [
    ['roasted-chana', 'green-tea'], ['makhana', 'chai'], ['apple', 'peanuts'], ['sprouts'], ['chaas', 'almonds'],
    ['guava', 'walnuts'], ['papaya'], ['hung-curd', 'pomegranate'], ['dhokla', 'green-tea'], ['coconut-water', 'almonds'],
    ['whey', 'banana'], ['egg', 'black-coffee'],
  ],
  dinner: [
    ['roti', 'moong-dal', 'mix-veg'], ['roti', 'paneer-tikka', 'salad'], ['veg-soup', 'tofu', 'salad', 'roti'],
    ['khichdi', 'raita'], ['roti', 'matar-paneer', 'salad'], ['jowar-roti', 'dal', 'bhindi'],
    ['roti', 'tandoori-chicken', 'salad'], ['brown-rice', 'chicken-curry', 'salad'], ['roti', 'fish-fry', 'dal'],
    ['roti', 'egg-bhurji', 'salad'], ['ragi-roti', 'sambar', 'aloo-gobi'], ['tomato-soup', 'paneer-tikka', 'salad'],
    ['chicken-breast', 'quinoa', 'salad'],
  ],
};

const BOOSTERS = ['chicken-breast', 'hung-curd', 'soya-chunks', 'tofu', 'egg-white', 'sprouts', 'paneer', 'whey'];

const RANK = { v: 0, e: 1, n: 2 };
const allowed = (diet, food) => RANK[food.diet] <= RANK[diet ?? 'n'];

/** Deterministic PRNG so a "seed" reproduces the same plan. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const halfStep = (x) => Math.max(0.5, Math.round(x * 2) / 2);

function buildMeal(ids, budget) {
  const foods = ids.map((id) => FOOD_BY_ID[id]);
  // The first item is the staple and absorbs the scaling; sides stay ~1 serving.
  const sidesKcal = foods.slice(1).reduce((a, f) => a + f.kcal, 0);
  let stapleQty = halfStep((budget - sidesKcal) / foods[0].kcal);
  stapleQty = Math.min(stapleQty, foods[0].id === 'roti' || foods[0].id.endsWith('roti') ? 4 : 3);
  const items = foods.map((f, i) => ({ food: f, qty: i === 0 ? stapleQty : 1 }));
  let total = items.reduce((a, it) => a + it.food.kcal * it.qty, 0);
  // If sides alone blow the budget, shrink everything uniformly.
  if (total > budget * 1.25) {
    const k = budget / total;
    items.forEach((it) => { it.qty = halfStep(it.qty * k); });
    total = items.reduce((a, it) => a + it.food.kcal * it.qty, 0);
  }
  const protein = items.reduce((a, it) => a + it.food.p * it.qty, 0);
  return { items, kcal: Math.round(total), p: Math.round(protein) };
}

// Saved profiles use 'v' | 'e' | 'n'; accept spelled-out values too.
const DIET_CODE = { veg: 'v', vegetarian: 'v', egg: 'e', eggetarian: 'e', nonveg: 'n', 'non-veg': 'n' };
export const dietCode = (d) => (['v', 'e', 'n'].includes(d) ? d : DIET_CODE[String(d || '').toLowerCase()] || 'v');

export function generatePlan({ kcal, p: proteinTarget }, dietIn = 'v', seed = Date.now()) {
  const diet = dietCode(dietIn);
  const rand = mulberry32(seed);
  const plan = {};
  for (const [meal, share] of Object.entries(MEAL_SPLIT)) {
    const budget = kcal * share;
    const options = COMBOS[meal].filter((ids) => ids.every((id) => FOOD_BY_ID[id] && allowed(diet, FOOD_BY_ID[id])));
    if (!options.length) continue;
    const picks = Array.from({ length: Math.min(3, options.length) }, () => options[Math.floor(rand() * options.length)]);
    const built = picks.map((ids) => buildMeal(ids, budget));
    // Score: closeness to budget + protein density, weighted toward the protein goal.
    const proteinShare = (proteinTarget || 60) * share;
    built.sort((a, b) => {
      const s = (m) => Math.abs(m.kcal - budget) / budget - Math.min(m.p / proteinShare, 1.3) * 0.6;
      return s(a) - s(b);
    });
    plan[meal] = built[0];
  }
  // Protein top-up: Indian thalis run carb-heavy, so swap staple calories for
  // diet-appropriate protein sides until the day reaches ~90% of the target.
  const boosters = BOOSTERS.filter((id) => allowed(diet, FOOD_BY_ID[id]));
  const dayProtein = () => Object.values(plan).reduce((a, m) => a + (m?.p || 0), 0);
  let guard = 0;
  while (proteinTarget && dayProtein() < proteinTarget * 0.9 && guard++ < 6) {
    const [meal, m] = Object.entries(plan).filter(([k]) => k !== 'snacks').sort((a, b) => a[1].p - b[1].p)[0]
      ?? Object.entries(plan)[0];
    const used = new Set(m.items.map((it) => it.food.id));
    const id = boosters.find((b) => !used.has(b));
    if (!id) break;
    const food = FOOD_BY_ID[id];
    const staple = m.items[0];
    const cut = halfStep(food.kcal / staple.food.kcal);
    if (staple.qty - cut >= 0.5) staple.qty -= cut;
    m.items.push({ food, qty: 1 });
    // Keep the meal near its budget by trimming the most caloric non-protein item.
    const budget = kcal * MEAL_SPLIT[meal];
    const kcalOf = () => m.items.reduce((a, it) => a + it.food.kcal * it.qty, 0);
    for (let i = 0; i < 6 && kcalOf() > budget * 1.08; i++) {
      const trimmable = m.items.filter((it) => !BOOSTERS.includes(it.food.id) && it.qty > 0.5)
        .sort((a, b) => b.food.kcal * b.qty - a.food.kcal * a.qty)[0];
      if (!trimmable) break;
      trimmable.qty -= 0.5;
    }
    m.kcal = Math.round(m.items.reduce((a, it) => a + it.food.kcal * it.qty, 0));
    m.p = Math.round(m.items.reduce((a, it) => a + it.food.p * it.qty, 0));
    plan[meal] = m;
  }

  const total = Object.values(plan).reduce((a, m) => ({ kcal: a.kcal + m.kcal, p: a.p + m.p }), { kcal: 0, p: 0 });
  return { meals: plan, total, seed };
}
