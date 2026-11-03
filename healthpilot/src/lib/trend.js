/**
 * Weight trend smoothing.
 * Daily scale weight swings ±1 kg from water and salt; showing the raw number
 * demotivates people. We use an exponentially-smoothed moving average (α = 0.1,
 * the "Hacker's Diet" method) and a least-squares slope over the trend line to
 * report a true rate of change per week.
 */
import { daysBetween } from './dates.js';

export function weightSeries(days) {
  return Object.entries(days)
    .filter(([, d]) => Number(d.weight) > 0)
    .map(([date, d]) => ({ date, weight: Number(d.weight) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function smoothTrend(series, alpha = 0.1) {
  let trend = null;
  let prevDate = null;
  return series.map((pt) => {
    if (trend === null) trend = pt.weight;
    else {
      // Missing days: apply decay for each elapsed day so gaps don't over-weight one reading.
      const gap = Math.max(1, daysBetween(prevDate, pt.date));
      const a = 1 - (1 - alpha) ** gap;
      trend += a * (pt.weight - trend);
    }
    prevDate = pt.date;
    return { ...pt, trend: Math.round(trend * 100) / 100 };
  });
}

/** kg per week, from the trend over the last `windowDays` days. */
export function weeklyRate(trendSeries, windowDays = 21) {
  if (trendSeries.length < 2) return null;
  const last = trendSeries[trendSeries.length - 1].date;
  const pts = trendSeries.filter((p) => daysBetween(p.date, last) <= windowDays);
  if (pts.length < 2) return null;
  const xs = pts.map((p) => daysBetween(pts[0].date, p.date));
  const ys = pts.map((p) => p.trend);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  if (den === 0) return null;
  return Math.round((num / den) * 7 * 100) / 100;
}

export function latestWeight(days, fallback) {
  const s = weightSeries(days);
  return s.length ? s[s.length - 1].weight : fallback;
}
