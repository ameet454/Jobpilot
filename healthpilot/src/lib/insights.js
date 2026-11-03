/**
 * Rule-based coach. Produces specific, numeric, actionable cards from the
 * user's own data — instantly, offline and free.
 */
import { dayTotals } from './nutrition.js';
import { addDays, dateKey, lastNDays } from './dates.js';
import { smoothTrend, weeklyRate, weightSeries } from './trend.js';

export function loggingStreak(days, today = dateKey()) {
  let streak = 0;
  let key = (days[today]?.entries?.length ? today : addDays(today, -1));
  while (days[key]?.entries?.length) { streak++; key = addDays(key, -1); }
  return streak;
}

export function averages(days, n, today = dateKey()) {
  const keys = lastNDays(n, today).filter((k) => days[k]?.entries?.length);
  if (!keys.length) return null;
  const sum = keys.reduce((a, k) => {
    const t = dayTotals(days[k]);
    return { kcal: a.kcal + t.kcal, p: a.p + t.p, c: a.c + t.c, f: a.f + t.f, fib: a.fib + t.fib };
  }, { kcal: 0, p: 0, c: 0, f: 0, fib: 0 });
  const k = keys.length;
  return { kcal: sum.kcal / k, p: sum.p / k, c: sum.c / k, f: sum.f / k, fib: sum.fib / k, loggedDays: k };
}

export function buildInsights(state, targets, today = dateKey()) {
  const { days, profile } = state;
  const out = [];
  const day = days[today] || {};
  const t = dayTotals(day);
  const hour = new Date().getHours();
  const streak = loggingStreak(days, today);

  if (streak >= 3) out.push({ tone: 'good', icon: '🔥', title: `${streak}-day logging streak`, body: 'Consistent logging is the #1 predictor of reaching your goal. Keep it alive today.' });

  if (day.entries?.length) {
    const left = targets.kcal - t.kcal;
    if (left < -150) out.push({ tone: 'warn', icon: '⚖️', title: `${Math.round(-left)} kcal over today`, body: 'No guilt — one day is noise. A 30-min brisk walk burns ~150 kcal. Balance it out over the week rather than skipping meals tomorrow.' });
    const pGap = targets.p - t.p;
    if (hour >= 15 && pGap > targets.p * 0.4) {
      out.push({ tone: 'warn', icon: '💪', title: `${Math.round(pGap)} g protein still to go`, body: 'Easy Indian fixes: 100 g paneer (18 g), a bowl of soya chunks curry (18 g), 1 cup hung curd (9 g), or a bowl of sprouts (7 g).' });
    }
    if (hour >= 19 && t.fib < targets.fib * 0.5) out.push({ tone: 'info', icon: '🥗', title: 'Fibre is low today', body: `You're at ${Math.round(t.fib)} g of ${targets.fib} g. Add salad, a guava, or swap white rice for jowar/bajra roti.` });
  } else if (hour >= 11) {
    out.push({ tone: 'info', icon: '📝', title: 'Nothing logged yet today', body: 'Type your meal the way you would text a friend — "2 roti, dal, salad" — and HealthPilot does the maths.' });
  }

  const waterTarget = targets.water;
  if (hour >= 14 && (day.water || 0) < waterTarget * 0.4) out.push({ tone: 'info', icon: '💧', title: 'Behind on water', body: `${day.water || 0} ml of ${waterTarget} ml. Thirst is often mistaken for hunger — drink a glass before your next snack.` });

  const sleep = days[today]?.sleep ?? days[addDays(today, -1)]?.sleep;
  if (sleep && sleep < 6.5) out.push({ tone: 'warn', icon: '😴', title: `Only ${sleep} h of sleep`, body: 'Short sleep raises hunger hormones (ghrelin) and next-day cravings by ~20–25%. Aim for 7–8 h tonight.' });

  const week = averages(days, 7, today);
  if (week && week.loggedDays >= 3) {
    const delta = week.kcal - targets.kcal;
    if (Math.abs(delta) <= targets.kcal * 0.07) out.push({ tone: 'good', icon: '🎯', title: 'On target this week', body: `Averaging ${Math.round(week.kcal)} kcal/day vs a ${targets.kcal} target across ${week.loggedDays} logged days.` });
    const carbPct = (week.c * 4) / Math.max(1, week.kcal);
    if (carbPct > 0.6) out.push({ tone: 'info', icon: '🍚', title: `${Math.round(carbPct * 100)}% of calories from carbs`, body: 'Typical for Indian diets. Try half rice + half dal portions, or add a protein side to lunch and dinner to stay fuller.' });
  }

  const trend = smoothTrend(weightSeries(days));
  const rate = weeklyRate(trend);
  if (rate !== null && trend.length >= 4) {
    const goalSign = profile.goal === 'lose' ? -1 : profile.goal === 'gain' ? 1 : 0;
    const aligned = goalSign === 0 ? Math.abs(rate) < 0.2 : Math.sign(rate) === goalSign;
    out.push({
      tone: aligned ? 'good' : 'warn', icon: '📉',
      title: `Trend: ${rate > 0 ? '+' : ''}${rate} kg/week`,
      body: aligned
        ? 'Your smoothed weight trend is moving the right way. Daily scale jumps are mostly water — trust the trend line.'
        : 'The trend is going against your goal. Check portion sizes of oil/ghee and weekend meals — those are the usual hidden calories.',
    });
    if (goalSign === -1 && rate < -1.0) out.push({ tone: 'warn', icon: '⚠️', title: 'Losing very fast', body: 'More than 1 kg/week risks muscle loss. Consider eating ~200 kcal more and keeping protein high.' });
  }

  if (!out.length) out.push({ tone: 'good', icon: '✨', title: 'All good so far', body: 'Log meals, water and weight to unlock personalised insights.' });
  return out;
}
