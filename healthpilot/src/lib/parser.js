/**
 * Offline natural-language meal parser.
 *
 *   "2 roti, 1 bowl dal and half plate rice + chai"
 *   → [{food: roti, qty: 2}, {food: dal, qty: 1}, {food: rice, qty: 0.5}, {food: chai, qty: 1}]
 *
 * Works with no network and no AI cost. Understands digits, fractions
 * ("1/2", "1.5", "½"), number words (English + common Hindi), Indian portion
 * units (katori, plate, glass…) and gram / ml amounts, which are scaled
 * against each food's serving weight.
 */
import { FOODS } from '../data/foods.js';

const NUMBER_WORDS = {
  a: 1, an: 1, one: 1, ek: 1, two: 2, do: 2, three: 3, teen: 3, four: 4, char: 4, chaar: 4,
  five: 5, paanch: 5, panch: 5, six: 6, chhe: 6, seven: 7, saat: 7, eight: 8, aath: 8,
  nine: 9, ten: 10, das: 10, half: 0.5, aadha: 0.5, adha: 0.5, quarter: 0.25,
  couple: 2, few: 3, dozen: 12, double: 2,
};
const UNICODE_FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

const MASS_UNITS = { g: 1, gm: 1, gms: 1, gram: 1, grams: 1, kg: 1000, ml: 1, l: 1000, litre: 1000, liter: 1000 };
const SERVING_UNITS = new Set([
  'piece', 'pieces', 'pc', 'pcs', 'bowl', 'bowls', 'katori', 'katoris', 'plate', 'plates', 'glass', 'glasses',
  'cup', 'cups', 'slice', 'slices', 'scoop', 'scoops', 'serving', 'servings', 'portion', 'portions', 'tsp',
  'tbsp', 'spoon', 'spoons', 'teaspoon', 'tablespoon', 'medium', 'large', 'small', 'big', 'roll', 'rolls',
  'packet', 'packets', 'can', 'cans', 'bottle', 'bottles', 'mug', 'mugs', 'handful', 'of', 'x',
]);
const SIZE_MULT = { small: 0.75, large: 1.3, big: 1.3 };
const FILLER = new Set(['with', 'some', 'had', 'ate', 'i', 'my', 'little', 'bit', 'the', 'also', 'then', 'for', 'in', 'thoda', 'aur']);

const normalize = (s) =>
  s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s./½¼¾⅓⅔-]/gu, ' ').replace(/\s+/g, ' ').trim();

/** Light singularisation so "rotis", "idlis", "eggs", "samosas" match. */
const singular = (w) => (w.length > 3 && w.endsWith('es') && !w.endsWith('ses') ? w.slice(0, -2)
  : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);

function buildIndex(foods) {
  return foods.map((f) => {
    // "Roti / Chapati" → ["roti", "chapati"]; "(2 eggs)" style notes are dropped.
    const variants = f.name.replace(/\(.*?\)/g, '').split('/').map(normalize).filter(Boolean);
    const aliasNorm = normalize(f.aliases || '');
    const terms = new Set(`${variants.join(' ')} ${aliasNorm}`.split(' ').filter((t) => t.length > 1).map(singular));
    return { food: f, variants, aliasText: ` ${aliasNorm} `, terms };
  });
}

let DEFAULT_INDEX = null;
const defaultIndex = () => (DEFAULT_INDEX ??= buildIndex(FOODS));

function scoreFood(entry, query, qTokens) {
  if (!qTokens.length) return 0;
  if (entry.variants.some((v) => v === query || v.split(' ').map(singular).join(' ') === query)) return 200;
  let score = 0;
  // Multi-word phrase found in aliases ("pani puri", "dal fry") is a strong signal.
  if (qTokens.length > 1 && entry.aliasText.includes(` ${query} `)) score += 60;
  if (entry.variants.some((v) => v.includes(query))) score += 40;
  let hits = 0;
  for (const t of qTokens) {
    if (entry.terms.has(t)) hits += 1;
    else if ([...entry.terms].some((term) => term.length > 3 && (term.startsWith(t) || t.startsWith(term)))) hits += 0.6;
  }
  score += (hits / qTokens.length) * 50;
  // Prefer foods whose name isn't much longer than the query ("paneer" → Paneer, not Palak Paneer).
  const extra = Math.min(...entry.variants.map((v) => v.split(' ').length)) - qTokens.length;
  score -= Math.max(0, extra) * 6;
  return hits === 0 && score < 40 ? 0 : score;
}

/** Ranked fuzzy search; used by both the parser and the search box. */
export function searchFoods(query, foods = FOODS, limit = 20) {
  const q = normalize(query);
  if (!q) return [];
  const index = foods === FOODS ? defaultIndex() : buildIndex(foods);
  const tokens = q.split(' ').filter((t) => !FILLER.has(t)).map(singular);
  return index
    .map((e) => ({ food: e.food, score: scoreFood(e, tokens.join(' '), tokens) }))
    .filter((r) => r.score > 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function readNumber(tok) {
  if (tok in UNICODE_FRACTIONS) return UNICODE_FRACTIONS[tok];
  if (tok in NUMBER_WORDS) return NUMBER_WORDS[tok];
  if (/^\d+\/\d+$/.test(tok)) {
    const [a, b] = tok.split('/').map(Number);
    return b ? a / b : null;
  }
  if (/^\d*\.?\d+$/.test(tok)) return Number(tok);
  return null;
}

/** Parse one chunk such as "1.5 bowl rajma" or "200g paneer". */
export function parseChunk(chunk, foods = FOODS) {
  let text = normalize(chunk).replace(/(\d)(g|gm|gms|ml|kg|l)\b/g, '$1 $2');
  if (!text) return null;
  const tokens = text.split(' ');
  let qty = null;
  let mass = null;
  let mult = 1;
  let unitGiven = false;
  const rest = [];

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const n = readNumber(tok);
    if (n !== null && qty === null && !(tok === 'a' && rest.length)) {
      // "1 1/2" → 1.5
      const next = readNumber(tokens[i + 1] ?? '');
      if (next !== null && next < 1 && /\//.test(tokens[i + 1])) { qty = n + next; i++; } else qty = n;
      continue;
    }
    if (tok in MASS_UNITS && qty !== null && mass === null) { mass = qty * MASS_UNITS[tok]; continue; }
    if (tok in SIZE_MULT) { mult *= SIZE_MULT[tok]; continue; }
    if (SERVING_UNITS.has(tok)) { unitGiven = unitGiven || !['of', 'x'].includes(tok); continue; }
    if (FILLER.has(tok)) continue;
    rest.push(tok);
  }

  const query = rest.join(' ').trim();
  if (!query) return null;
  const [best] = searchFoods(query, foods, 1);
  if (!best) return { raw: chunk.trim(), query, food: null, qty: qty ?? 1 };

  const food = best.food;
  let servings = qty ?? 1;
  if (mass !== null && food.g) servings = mass / food.g;
  else if (qty !== null && !unitGiven) {
    // Count-based servings: "10 almonds" when one serving is "10 almonds" → 1 serving.
    const m = /^(\d+)\s+(?!g\b|ml\b)/.exec(food.serving || '');
    if (m && Number(m[1]) > 1) servings = qty / Number(m[1]);
  }
  servings = Math.round(servings * mult * 100) / 100;
  return { raw: chunk.trim(), query, food, qty: servings, confidence: Math.min(1, best.score / 100) };
}

/** Split a free-text meal description into items. */
export function parseMeal(text, foods = FOODS) {
  return text
    .split(/,|;|\n|\+|&|\band\b|\bwith\b|\baur\b|\bplus\b/i)
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => parseChunk(c, foods))
    .filter(Boolean);
}
