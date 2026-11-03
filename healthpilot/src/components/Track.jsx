import { useEffect, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { fmtDuration } from '../lib/dates.js';
import { Card, Ring, Segmented, fmt } from './ui.jsx';

const FAST_STAGES = [
  { h: 0, label: 'Digesting', body: 'Blood sugar rises and falls after your last meal.' },
  { h: 4, label: 'Post-absorptive', body: 'Insulin drops; the body starts drawing on stored glycogen.' },
  { h: 12, label: 'Fat-burning ramps up', body: 'Glycogen runs low and fat becomes a bigger fuel source.' },
  { h: 16, label: 'Deeper fast', body: 'Ketone levels begin to rise for most people.' },
  { h: 24, label: 'Extended fast', body: 'Check with a doctor before routinely fasting this long.' },
];

function MetricInput({ label, value, unit, step, onSave, placeholder }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => { setV(value ?? ''); }, [value]);
  const dirty = String(v) !== String(value ?? '');
  return (
    <form className="metric" onSubmit={(e) => { e.preventDefault(); onSave(v === '' ? null : Number(v)); }}>
      <label>
        <span className="muted small">{label}</span>
        <span className="metric-row">
          <input type="number" inputMode="decimal" step={step} min="0" value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} />
          <span className="muted">{unit}</span>
        </span>
      </label>
      <button className="btn sm" disabled={!dirty}>Save</button>
    </form>
  );
}

export default function Track({ date }) {
  const { state, dispatch, targets } = useStore();
  const day = state.days[date] || {};
  const setMetric = (key) => (value) => dispatch({ type: 'SET_METRIC', date, key, value });

  return (
    <div className="stack">
      <Card title="⚖️ Weight">
        <MetricInput label="Morning weight, after the loo, before food — most consistent" value={day.weight} unit="kg" step="0.1" onSave={setMetric('weight')} placeholder="e.g. 68.4" />
      </Card>

      <Card title="👟 Steps" action={<span className="muted small">goal {fmt(targets.steps)}</span>}>
        <div className="bar big"><div style={{ width: `${Math.min(100, ((day.steps || 0) / targets.steps) * 100)}%`, background: 'var(--accent)' }} /></div>
        <MetricInput label="Copy today's count from your phone or watch" value={day.steps || null} unit="steps" step="100" onSave={(v) => setMetric('steps')(v || 0)} />
        <p className="muted small">≈ {fmt(((day.steps || 0) * 0.04 * (state.profile.weight / 70)))} kcal burned walking. Your calorie goal already assumes your chosen activity level.</p>
      </Card>

      <Card title="😴 Sleep">
        <MetricInput label="Hours slept last night" value={day.sleep} unit="h" step="0.25" onSave={setMetric('sleep')} placeholder="7.5" />
      </Card>

      <Card title="💧 Water" action={<span className="muted small">{fmt(day.water || 0)} / {fmt(targets.water)} ml</span>}>
        <div className="row wrap">
          {[150, 250, 500].map((ml) => <button key={ml} className="btn sm" onClick={() => dispatch({ type: 'ADD_WATER', date, ml })}>+{ml} ml</button>)}
          <button className="btn ghost sm" onClick={() => dispatch({ type: 'ADD_WATER', date, ml: -250 })}>−250</button>
        </div>
      </Card>

      <FastingCard />
    </div>
  );
}

function FastingCard() {
  const { state, dispatch } = useStore();
  const { active, history } = state.fasting;
  const [target, setTarget] = useState(active?.target ?? 16);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    setNow(Date.now());
    return () => clearInterval(id);
  }, [active]);

  const elapsed = active ? now - active.start : 0;
  const hours = elapsed / 3_600_000;
  const stage = [...FAST_STAGES].reverse().find((s) => hours >= s.h) ?? FAST_STAGES[0];
  const completed = history.filter((h) => h.end - h.start >= h.target * 3_600_000).length;

  return (
    <Card title="⏱️ Intermittent fasting" action={<span className="muted small">{completed} completed</span>}>
      {active ? (
        <div className="fast">
          <Ring value={hours} max={active.target} size={150} stroke={12} label={`Fasting ${fmtDuration(elapsed)}`}>
            <b>{fmtDuration(elapsed)}</b>
            <span className="muted small">of {active.target} h</span>
          </Ring>
          <div className="grow">
            <b>{stage.label}</b>
            <p className="muted small">{stage.body}</p>
            <p className="small">Ends {new Date(active.start + active.target * 3_600_000).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', weekday: 'short' })}</p>
            <div className="row">
              <button className="btn primary sm" onClick={() => dispatch({ type: 'FAST_END' })}>End fast</button>
              <button className="btn ghost sm" onClick={() => dispatch({ type: 'FAST_CANCEL' })}>Cancel</button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <Segmented small value={target} onChange={setTarget} options={[12, 14, 16, 18, 20].map((h) => ({ value: h, label: `${h}:${24 - h}` }))} />
          <button className="btn primary block" onClick={() => dispatch({ type: 'FAST_START', target })}>Start {target}-hour fast</button>
          <p className="muted small">Fasting is optional — total calories matter most. Not advised if pregnant, diabetic on medication, or with a history of eating disorders.</p>
        </>
      )}
      {history.length > 0 && (
        <ul className="plain small fast-history">
          {history.slice(0, 5).map((h) => {
            const dur = h.end - h.start;
            const ok = dur >= h.target * 3_600_000;
            return <li key={h.start}>{ok ? '✅' : '◻️'} {new Date(h.start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {fmtDuration(dur)} <span className="muted">/ {h.target} h</span></li>;
          })}
        </ul>
      )}
    </Card>
  );
}
