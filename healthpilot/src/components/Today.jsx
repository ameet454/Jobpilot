import { MealIcon } from './icons.jsx';
import { useMemo } from 'react';
import { useStore } from '../lib/store.jsx';
import { dayTotals, entryTotals } from '../lib/nutrition.js';
import { MEALS } from '../lib/entries.js';
import { buildInsights } from '../lib/insights.js';
import { Card, MacroBar, Ring, fmt } from './ui.jsx';

export default function Today({ date, onAddFood, goTo }) {
  const { state, dispatch, targets } = useStore();
  const day = state.days[date] || { entries: [] };
  const totals = dayTotals(day);
  const left = targets.kcal - totals.kcal;
  const insight = useMemo(() => buildInsights(state, targets, date)[0], [state, targets, date]);
  const glasses = Math.round((day.water || 0) / 250);

  return (
    <div className="stack">
      <Card className="hero">
        <div className="hero-grid">
          <Ring value={totals.kcal} max={targets.kcal} label={`${Math.round(totals.kcal)} of ${targets.kcal} kcal`}>
            <b className="big">{fmt(Math.abs(left))}</b>
            <span className="muted small">{left >= 0 ? 'kcal left' : 'kcal over'}</span>
          </Ring>
          <div className="hero-side">
            <div className="kv"><span>Goal</span><b>{fmt(targets.kcal)}</b></div>
            <div className="kv"><span>Eaten</span><b>{fmt(totals.kcal)}</b></div>
            <div className="kv"><span>Steps</span><b>{fmt(day.steps || 0)}</b></div>
          </div>
        </div>
        <div className="macros">
          <MacroBar label="Protein" value={totals.p} target={targets.p} color="var(--protein)" />
          <MacroBar label="Carbs" value={totals.c} target={targets.c} color="var(--carbs)" />
          <MacroBar label="Fat" value={totals.f} target={targets.f} color="var(--fat)" />
          <MacroBar label="Fibre" value={totals.fib} target={targets.fib} color="var(--fibre)" />
        </div>
      </Card>

      {insight && (
        <button className={`insight tone-${insight.tone}`} onClick={() => goTo('coach')}>
          <span className="insight-icon">{insight.icon}</span>
          <span><b>{insight.title}</b><span className="small">{insight.body}</span></span>
        </button>
      )}

      {MEALS.map((m) => {
        const items = day.entries.filter((e) => e.meal === m.id);
        const kcal = items.reduce((a, e) => a + entryTotals(e).kcal, 0);
        return (
          <Card key={m.id} title={<><MealIcon id={m.id} /> {m.label} {kcal > 0 && <span className="muted small">· {fmt(kcal)} kcal</span>}</>}
            action={<button className="btn ghost sm" onClick={() => onAddFood(m.id)}>+ Add</button>}>
            {items.length === 0 ? (
              <p className="muted small">Nothing yet.</p>
            ) : (
              <ul className="entries">
                {items.map((e) => {
                  const t = entryTotals(e);
                  return (
                    <li key={e.id}>
                      <div>
                        <b>{e.name}</b>
                        <span className="muted small"> {e.qty} × {e.serving} · P {fmt(t.p)}g</span>
                      </div>
                      <div className="entry-right">
                        <span>{fmt(t.kcal)}</span>
                        <button className="icon-btn" aria-label={`Remove ${e.name}`} onClick={() => dispatch({ type: 'REMOVE_ENTRY', date, id: e.id })}>✕</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        );
      })}

      <Card title="💧 Water" action={<span className="muted small">{fmt(day.water || 0)} / {fmt(targets.water)} ml</span>}>
        <div className="glasses">
          {Array.from({ length: Math.max(8, Math.ceil(targets.water / 250)) }, (_, i) => (
            <button key={i} className={`glass ${i < glasses ? 'full' : ''}`} aria-label={`Set water to ${(i + 1) * 250} ml`}
              onClick={() => dispatch({ type: 'SET_METRIC', date, key: 'water', value: (i + 1 === glasses ? i : i + 1) * 250 })} />
          ))}
        </div>
      </Card>
    </div>
  );
}
