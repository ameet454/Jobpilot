import { useMemo, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { dayTotals, bmi, bmiCategory, weeksToGoal } from '../lib/nutrition.js';
import { lastNDays, addDays, parseKey } from '../lib/dates.js';
import { smoothTrend, weeklyRate, weightSeries } from '../lib/trend.js';
import { averages, loggingStreak } from '../lib/insights.js';
import { BarChart, WeightChart } from './charts.jsx';
import { Card, Segmented, fmt } from './ui.jsx';

export default function Progress({ date }) {
  const { state, targets } = useStore();
  const [range, setRange] = useState(7);
  const keys = lastNDays(range, date);
  const cal = keys.map((k) => ({ date: k, value: dayTotals(state.days[k]).kcal }));
  const prot = keys.map((k) => ({ date: k, value: dayTotals(state.days[k]).p }));
  const water = keys.map((k) => ({ date: k, value: state.days[k]?.water || 0 }));
  const avg = averages(state.days, range, date);
  const streak = loggingStreak(state.days, date);

  const trend = useMemo(() => smoothTrend(weightSeries(state.days)), [state.days]);
  const cutoff = addDays(date, -Math.max(range, 30));
  const visible = trend.filter((p) => p.date >= cutoff && p.date <= date);
  const rate = weeklyRate(trend);
  const latest = trend[trend.length - 1];
  const p = state.profile;
  const b = latest ? bmi(latest.trend, p.height) : null;
  const toGo = latest && p.goal !== 'maintain' ? latest.trend - p.targetWeight : null;
  const weeks = latest ? weeksToGoal(p, latest.trend) : null;
  const eta = (() => {
    if (!latest || toGo === null || !rate) return null;
    const movingRightWay = (p.goal === 'lose' && rate < 0) || (p.goal === 'gain' && rate > 0);
    if (!movingRightWay) return null;
    const d = parseKey(latest.date);
    d.setDate(d.getDate() + Math.round((Math.abs(toGo) / Math.abs(rate)) * 7));
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  })();

  return (
    <div className="stack">
      <Segmented value={range} onChange={setRange} options={[{ value: 7, label: '7 days' }, { value: 14, label: '14 days' }, { value: 30, label: '30 days' }]} />

      <div className="stats">
        <div className="stat"><b>{avg ? fmt(avg.kcal) : '–'}</b><span>avg kcal</span></div>
        <div className="stat"><b>{avg ? `${fmt(avg.p)} g` : '–'}</b><span>avg protein</span></div>
        <div className="stat"><b>{streak}🔥</b><span>day streak</span></div>
        <div className="stat"><b>{avg ? `${avg.loggedDays}/${range}` : '–'}</b><span>days logged</span></div>
      </div>

      <Card title="⚖️ Weight trend" action={rate !== null && <span className={`pill ${((p.goal === 'lose' && rate < 0) || (p.goal === 'gain' && rate > 0) || (p.goal === 'maintain' && Math.abs(rate) < 0.2)) ? 'good' : 'warn'}`}>{rate > 0 ? '+' : ''}{rate} kg/wk</span>}>
        <WeightChart points={visible} goal={p.goal !== 'maintain' ? p.targetWeight : null} />
        {latest && (
          <div className="kv-grid">
            <div className="kv"><span>Trend weight</span><b>{latest.trend} kg</b></div>
            <div className="kv"><span>BMI</span><b>{b.toFixed(1)} <small className={`tone-${bmiCategory(b).tone}`}>{bmiCategory(b).label}</small></b></div>
            {toGo !== null && <div className="kv"><span>To goal</span><b>{Math.abs(toGo).toFixed(1)} kg</b></div>}
            {(eta || weeks) && <div className="kv"><span>Projected</span><b>{eta ?? `~${weeks} wks at plan pace`}</b></div>}
          </div>
        )}
        <p className="muted small">Dots are daily scale readings; the line is your smoothed trend. Water and salt swing the scale ±1 kg — the trend shows real fat change.</p>
      </Card>

      <Card title="🔥 Calories"><BarChart data={cal} target={targets.kcal} warnOver /></Card>
      <Card title="💪 Protein"><BarChart data={prot} target={targets.p} unit="g" color="var(--protein)" /></Card>
      <Card title="💧 Water"><BarChart data={water} target={targets.water} unit="ml" color="var(--water)" /></Card>

      {avg && (
        <Card title="🥧 Average macro split">
          <MacroSplit p={avg.p} c={avg.c} f={avg.f} />
        </Card>
      )}
    </div>
  );
}

function MacroSplit({ p, c, f }) {
  const kp = p * 4; const kc = c * 4; const kf = f * 9;
  const total = kp + kc + kf || 1;
  const parts = [
    { label: 'Protein', v: kp, color: 'var(--protein)', ideal: '20–30%' },
    { label: 'Carbs', v: kc, color: 'var(--carbs)', ideal: '45–55%' },
    { label: 'Fat', v: kf, color: 'var(--fat)', ideal: '20–30%' },
  ];
  return (
    <>
      <div className="split">{parts.map((x) => <div key={x.label} style={{ flex: x.v / total, background: x.color }} title={x.label} />)}</div>
      <div className="kv-grid">
        {parts.map((x) => <div key={x.label} className="kv"><span>{x.label}</span><b>{Math.round((x.v / total) * 100)}% <small className="muted">ideal {x.ideal}</small></b></div>)}
      </div>
    </>
  );
}
