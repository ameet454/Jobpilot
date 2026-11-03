export const MEALS = [
  { id: 'breakfast', label: 'Breakfast', icon: '🌅' },
  { id: 'lunch', label: 'Lunch', icon: '🍛' },
  { id: 'snacks', label: 'Snacks', icon: '🍎' },
  { id: 'dinner', label: 'Dinner', icon: '🌙' },
];

export function makeEntry(food, qty, meal, source = 'db') {
  return {
    foodId: food.id ?? null,
    name: food.name,
    serving: food.serving,
    qty: Number(qty) || 1,
    meal,
    source,
    n: { kcal: +food.kcal || 0, p: +food.p || 0, c: +food.c || 0, f: +food.f || 0, fib: +food.fib || 0 },
  };
}
