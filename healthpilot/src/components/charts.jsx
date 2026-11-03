import { shortDay } from '../lib/dates.js';

/** Bar chart with a dashed target line. Empty days render as a faint stub. */
export function BarChart({ data, target, height = 160, unit = 'kcal', color = 'var(--accent)', warnOver = false }) {
  const w = 320;
  const pad = { t: 12, b: 22, l: 4, r: 4 };
  const max = Math.max(target || 0, ...data.map((d) => d.value)) * 1.1 || 1;
  const bw = (w - pad.l - pad.r) / data.length;
  const y = (v) => pad.t + (height - pad.t - pad.b) * (1 - v / max);
  const every = Math.ceil(data.length / 7);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="chart" role="img" aria-label={`Bar chart of ${unit}`}>
      {data.map((d, i) => {
        const x = pad.l + i * bw + bw * 0.18;
        const v = d.value || 0;
        const over = warnOver && target && v > target * 1.05;
        return (
          <g key={d.date}>
            <rect x={x} y={v ? y(v) : height - pad.b - 2} width={bw * 0.64} height={v ? height - pad.b - y(v) : 2}
              rx={Math.min(4, bw * 0.2)} fill={v ? (over ? 'var(--warn)' : color) : 'var(--track)'}>
              <title>{`${shortDay(d.date)}: ${Math.round(v)} ${unit}`}</title>
            </rect>
            {i % every === 0 && <text x={x + bw * 0.32} y={height - 6} textAnchor="middle" className="axis">{shortDay(d.date).split(' ')[0]}</text>}
          </g>
        );
      })}
      {target ? (
        <g>
          <line x1={pad.l} x2={w - pad.r} y1={y(target)} y2={y(target)} stroke="var(--muted)" strokeDasharray="4 4" strokeWidth="1" />
          <text x={w - pad.r} y={y(target) - 4} textAnchor="end" className="axis">target {Math.round(target)}</text>
        </g>
      ) : null}
    </svg>
  );
}

/** Weight chart: raw readings as dots, smoothed trend as a line, goal as dashed line. */
export function WeightChart({ points, goal, height = 180 }) {
  if (points.length < 2) return <p className="muted center pad">Log your weight on at least 2 days to see your trend.</p>;
  const w = 320;
  const pad = { t: 14, b: 22, l: 30, r: 8 };
  const vals = points.flatMap((p) => [p.weight, p.trend]).concat(goal ? [goal] : []);
  const lo = Math.floor(Math.min(...vals) - 0.5);
  const hi = Math.ceil(Math.max(...vals) + 0.5);
  const t0 = new Date(points[0].date).getTime();
  const t1 = new Date(points[points.length - 1].date).getTime();
  const x = (d) => pad.l + ((new Date(d).getTime() - t0) / Math.max(1, t1 - t0)) * (w - pad.l - pad.r);
  const y = (v) => pad.t + (height - pad.t - pad.b) * (1 - (v - lo) / Math.max(0.1, hi - lo));
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.trend).toFixed(1)}`).join('');
  const ticks = [lo, (lo + hi) / 2, hi];
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="chart" role="img" aria-label="Weight trend chart">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--track)" />
          <text x={pad.l - 4} y={y(t) + 3} textAnchor="end" className="axis">{t.toFixed(t % 1 ? 1 : 0)}</text>
        </g>
      ))}
      {goal && goal >= lo && goal <= hi && (
        <line x1={pad.l} x2={w - pad.r} y1={y(goal)} y2={y(goal)} stroke="var(--accent)" strokeDasharray="5 4" opacity=".6" />
      )}
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
      {points.map((p) => (
        <circle key={p.date} cx={x(p.date)} cy={y(p.weight)} r="3" fill="var(--surface)" stroke="var(--muted)" strokeWidth="1.5">
          <title>{`${shortDay(p.date)}: ${p.weight} kg (trend ${p.trend})`}</title>
        </circle>
      ))}
      <text x={pad.l} y={height - 6} className="axis">{shortDay(points[0].date)}</text>
      <text x={w - pad.r} y={height - 6} textAnchor="end" className="axis">{shortDay(points[points.length - 1].date)}</text>
    </svg>
  );
}
