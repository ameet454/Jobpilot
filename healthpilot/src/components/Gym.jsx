import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { EXERCISES, EXERCISE_BY_ID, headLabel, headRole, MUSCLES, videoSearchUrl } from '../data/exercises.js';
import {
  buildSession, isRecord, lastPerformance, LEVELS, nextPlanDay, personalRecords, PLANS, planDays, sessionStats, SET_TYPES, suggestNext,
} from '../lib/workout.js';
import { dateKey, shortDay } from '../lib/dates.js';
import { FORM_CHECK_IDS } from '../data/formcheckIds.js';
import ExerciseFigure, { FigureSvg, MUSCLE_COLOR } from './ExerciseFigure.jsx';
import BodyMap from './BodyMap.jsx';
import { Card, Segmented, Sheet, fmt } from './ui.jsx';

// The 3-D trainer pulls in WebGL code, so it loads only when an exercise is opened.
const Exercise3D = lazy(() => import('./Exercise3D.jsx'));
// The camera form check carries the pose model, so it loads only when its button is tapped.
const FormCheck = lazy(() => import('./FormCheck.jsx'));

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, '0')}`;
const repsLabel = (ex, [lo, hi]) => (ex.unit === 'time' ? `${lo}–${hi} s` : `${lo}–${hi} reps`);

function Thumb({ ex }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="thumb">
      {broken
        ? <FigureSvg ex={ex} t={ex.lift === 'AB' ? 1 : 0.85} compact />
        : <img src={`${import.meta.env.BASE_URL}thumbs/${ex.id}.webp`} alt="" loading="lazy" width="240" height="180" onError={() => setBroken(true)} />}
    </div>
  );
}

function MusclePills({ ex, all = false }) {
  return (
    <span className="pills">
      {ex.focus.map((m) => <span key={m} className="mpill" style={{ '--c': MUSCLE_COLOR.primary }}>{headLabel(m)}</span>)}
      {ex.helpers.slice(0, all ? undefined : 2).map((m) => <span key={m} className="mpill soft" style={{ '--c': MUSCLE_COLOR.secondary }}>{headLabel(m)}</span>)}
    </span>
  );
}

/* ── Exercise detail: animation + where to feel it + how to ─────────── */
export function ExerciseSheet({ id, onClose, onOpen }) {
  const { state } = useStore();
  const ex = id && EXERCISE_BY_ID[id];
  const pr = ex ? personalRecords(state.workouts)[ex.id] : null;
  const last = ex ? lastPerformance(state.workouts, ex.id, '9999-12-31') : null;
  const [checking, setChecking] = useState(false);
  useEffect(() => setChecking(false), [id]);
  return (
    <Sheet open={!!ex} onClose={onClose} title={ex?.name || ''} wide>
      {ex && (
        <div className="stack">
          {/* Pause the 3-D trainer while the camera runs: phones cannot drive both smoothly. */}
          {checking ? <ExerciseFigure ex={ex} /> : (
            <Suspense fallback={<ExerciseFigure ex={ex} />}>
              <Exercise3D key={ex.id} ex={ex} />
            </Suspense>
          )}
          {FORM_CHECK_IDS.includes(ex.id) && (
            <>
              <button type="button" className="btn primary block" onClick={() => setChecking(true)}>📷 Form check — count reps and spot mistakes</button>
              {checking && (
                <Suspense fallback={<div className="fc-loading muted small center">Opening the camera coach…</div>}>
                  <FormCheck ex={ex} onClose={() => setChecking(false)} />
                </Suspense>
              )}
            </>
          )}
          <div className="feel">
            <b>🎯 Where you should feel it</b>
            <p>{ex.feel}</p>
          </div>
          <Card title="Muscles worked">
            <BodyMap roles={(k) => headRole(ex, k)} />
            <MusclePills ex={ex} all />
          </Card>
          <Card title="How to do it">
            <ol className="how">{ex.steps.map((s) => <li key={s}>{s}</li>)}</ol>
            <p className="small"><b>Breathing:</b> {ex.breathe}</p>
            <p className="small"><b>Tempo:</b> {ex.tempo.lift}s lift · {ex.tempo.squeeze}s squeeze · {ex.tempo.lower}s lower — the animation moves at this speed.</p>
          </Card>
          <Card title="⚠️ Common mistakes">
            <ul className="mistakes">{ex.mistakes.map((m) => <li key={m}>{m}</li>)}</ul>
          </Card>
          <a className="btn block video" href={videoSearchUrl(ex)} target="_blank" rel="noopener noreferrer">▶ Watch form videos on YouTube</a>
          <p className="muted small center">Opens a YouTube search for this exercise so you can compare a few coaches.</p>
          {(pr || last) && (
            <Card title="Your numbers">
              <div className="kv-grid">
                {pr && <div className="kv"><span>Best {ex.unit === 'time' ? 'hold' : 'est. 1-rep max'}</span><b>{ex.unit === 'time' ? `${pr.reps} s` : `${fmt(pr.value, 1)} kg`}</b><span>{pr.kg ? `${pr.kg} kg × ${pr.reps}` : ''} · {shortDay(pr.date)}</span></div>}
                {last && <div className="kv"><span>Last session · {shortDay(last.date)}</span><b>{last.sets.map((s) => (s.kg ? `${s.kg}×${s.reps}` : `${s.reps}`)).join(', ')}</b></div>}
              </div>
            </Card>
          )}
          {ex.alts.length > 0 && (
            <Card title="Alternatives">
              <div className="chips">{ex.alts.map((a) => <button key={a} type="button" className="chip" onClick={() => onOpen(a)}>{EXERCISE_BY_ID[a].name}</button>)}</div>
            </Card>
          )}
          <p className="muted small">General guidance, not medical advice. Stop if you feel sharp pain, and ask a trainer to check your form in person.</p>
        </div>
      )}
    </Sheet>
  );
}

/* ── 5-day plan ─────────────────────────────────────────────────────── */
function PlanView({ date, onStart, onOpen }) {
  const { state, dispatch } = useStore();
  const days = planDays(state.gym);
  const next = nextPlanDay(state.workouts, days, date);
  const [open, setOpen] = useState(next.id);
  const plan = PLANS[state.gym.plan] || PLANS.ppl;
  return (
    <div className="stack">
      <Card title="Your 5-day plan">
        <Segmented small value={state.gym.plan} onChange={(v) => dispatch({ type: 'GYM_SETTINGS', patch: { plan: v } })}
          options={[{ value: 'ppl', label: 'Push/Pull/Legs + U/L' }, { value: 'bro', label: 'Body-part split' }]} />
        <p className="muted small">{plan.blurb}</p>
        <label className="field">
          <span>Your level</span>
          <select value={state.gym.level} onChange={(e) => dispatch({ type: 'GYM_SETTINGS', patch: { level: e.target.value } })}>
            {Object.entries(LEVELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <p className="muted small">Train Mon–Fri and rest at the weekend, or do the days in order with a rest day whenever you need one. The app always starts the next day in the cycle.</p>
      </Card>

      {days.map((d, i) => {
        const isNext = d.id === next.id;
        return (
          <section key={d.id} className={`card day ${isNext ? 'next' : ''}`}>
            <button type="button" className="day-head" onClick={() => setOpen(open === d.id ? null : d.id)} aria-expanded={open === d.id}>
              <span className="day-num">Day {i + 1}<small>{WEEK[i]}</small></span>
              <span className="grow"><b>{d.icon} {d.name}</b><span className="muted small">{d.focus} · {d.exercises.length} exercises</span></span>
              {isNext && <span className="badge">Next</span>}
              <span aria-hidden="true">{open === d.id ? '▴' : '▾'}</span>
            </button>
            {open === d.id && (
              <>
                <ul className="ex-list">
                  {d.exercises.map((item) => {
                    const ex = EXERCISE_BY_ID[item.id];
                    return (
                      <li key={item.id}>
                        <button type="button" onClick={() => onOpen(item.id)}>
                          <Thumb ex={ex} />
                          <span className="grow"><b>{ex.name}</b><span className="muted small">{item.sets} sets × {repsLabel(ex, item.reps)} · rest {mmss(item.rest)}</span><MusclePills ex={ex} /></span>
                          <span className="muted" aria-hidden="true">›</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <button type="button" className="btn primary block" onClick={() => onStart(d)}>Start {d.name} workout</button>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ── Live workout log ───────────────────────────────────────────────── */
function RestBar({ rest, setRest }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!rest) return undefined;
    const t = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [rest]);
  const left = rest ? Math.ceil((rest.endsAt - Date.now()) / 1000) : 0;
  useEffect(() => {
    if (rest && left <= 0 && !rest.buzzed) {
      try { navigator.vibrate?.([200, 100, 200]); } catch { /* not supported */ }
      setRest({ ...rest, buzzed: true });
    }
  }, [rest, left, setRest]);
  if (!rest) return null;
  const pct = Math.max(0, Math.min(100, (left / rest.total) * 100));
  return (
    <div className={`rest-bar ${left <= 0 ? 'over' : ''}`} role="timer" aria-live="polite">
      <div className="rest-fill" style={{ width: `${100 - pct}%` }} />
      <span className="rest-time">{left > 0 ? `Rest ${mmss(left)}` : 'Rest over — next set!'}</span>
      <button type="button" className="btn sm" onClick={() => setRest({ ...rest, endsAt: rest.endsAt - 15000, total: Math.max(15, rest.total - 15) })}>−15</button>
      <button type="button" className="btn sm" onClick={() => setRest({ ...rest, endsAt: rest.endsAt + 15000, total: rest.total + 15 })}>+15</button>
      <button type="button" className="btn sm" onClick={() => setRest(null)}>{left > 0 ? 'Skip' : 'OK'}</button>
    </div>
  );
}

function WorkoutView({ date, onOpen, goPlan, onStart }) {
  const { state, dispatch } = useStore();
  const w = state.workouts[date];
  const days = planDays(state.gym);
  const day = w && days.find((d) => d.id === w.dayId);
  const [rest, setRest] = useState(null);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!w || w.finishedAt) return undefined;
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, [w]);

  if (!w) {
    const next = nextPlanDay(state.workouts, days, date);
    return (
      <Card className="empty-workout">
        <p className="big-emoji" aria-hidden="true">{next.icon}</p>
        <h2>Today: {next.name}</h2>
        <p className="muted">{next.focus} · {next.exercises.length} exercises · about {Math.round(next.exercises.reduce((a, e) => a + e.sets * (45 + e.rest), 0) / 60)} min</p>
        <button type="button" className="btn primary block" onClick={() => onStart(next)}>Start workout</button>
        <button type="button" className="btn ghost block" onClick={goPlan}>Pick a different day</button>
      </Card>
    );
  }

  const stats = sessionStats(w);
  const order = [...new Set(w.sets.map((s) => s.exId))];
  const planItem = (exId) => day?.exercises.find((e) => e.id === exId) || { reps: [8, 12], rest: 90, sets: 3 };
  const prsToday = w.sets.filter((s) => isRecord(state.workouts, date, s));
  const update = (id, patch) => dispatch({ type: 'WORKOUT_SET_UPDATE', date, id, patch });

  if (w.finishedAt) {
    return (
      <div className="stack">
        <Card className="summary">
          <p className="big-emoji" aria-hidden="true">🏆</p>
          <h2>{day?.name || 'Workout'} done!</h2>
          <div className="stats">
            <div className="stat"><b>{stats.sets}</b><span>sets</span></div>
            <div className="stat"><b>{fmt(stats.volume)}</b><span>kg lifted</span></div>
            <div className="stat"><b>{stats.exercises}</b><span>exercises</span></div>
            <div className="stat"><b>{stats.minutes ?? '–'}</b><span>minutes</span></div>
          </div>
          {prsToday.length > 0 && (
            <div className="prs">
              <b>New personal records</b>
              <ul className="plain">{prsToday.map((s) => <li key={s.id}>🥇 {EXERCISE_BY_ID[s.exId].name}: {s.kg ? `${s.kg} kg × ${s.reps}` : `${s.reps}`}</li>)}</ul>
            </div>
          )}
        </Card>
        {order.map((exId) => (
          <Card key={exId} title={EXERCISE_BY_ID[exId].name}>
            <p className="small">{w.sets.filter((s) => s.exId === exId).map((s) => (s.kg ? `${s.kg} kg × ${s.reps}` : `${s.reps}${EXERCISE_BY_ID[exId].unit === 'time' ? ' s' : ''}`)).join(' · ')}</p>
          </Card>
        ))}
        <button type="button" className="btn danger" onClick={() => confirm('Delete this workout?') && dispatch({ type: 'WORKOUT_DISCARD', date })}>Delete workout</button>
      </div>
    );
  }

  return (
    <div className="stack with-rest">
      <Card className="session-head">
        <div className="row between">
          <div><h2>{day?.icon} {day?.name || 'Workout'}</h2><span className="muted small">{Math.round((Date.now() - w.startedAt) / 60000)} min · {stats.sets}/{w.sets.length} sets · {fmt(stats.volume)} kg</span></div>
          <button type="button" className="btn primary" disabled={!stats.sets} onClick={() => { setRest(null); dispatch({ type: 'WORKOUT_FINISH', date }); }}>Finish</button>
        </div>
        <div className="bar"><div style={{ width: `${(stats.sets / Math.max(1, w.sets.length)) * 100}%`, background: 'var(--accent)' }} /></div>
      </Card>

      {order.map((exId) => {
        const ex = EXERCISE_BY_ID[exId];
        const item = planItem(exId);
        const last = lastPerformance(state.workouts, exId, date);
        const next = suggestNext(last, item, ex);
        const sets = w.sets.filter((s) => s.exId === exId);
        const timed = ex.unit === 'time';
        return (
          <section key={exId} className="card ex-card">
            <button type="button" className="ex-card-head" onClick={() => onOpen(exId)}>
              <Thumb ex={ex} />
              <span className="grow">
                <b>{ex.name}</b>
                <span className="muted small">Target {item.sets} × {repsLabel(ex, item.reps)} · rest {mmss(item.rest)}</span>
                <span className="small feel-line">🎯 {ex.feel.split('.')[0]}.</span>
              </span>
              <span className="how-link">How?</span>
            </button>
            {next && <p className="tip small">📈 {next.why}</p>}
            <table className="sets">
              <thead><tr><th>Set</th><th>Last</th>{!timed && <th>kg</th>}<th>{timed ? 'sec' : 'reps'}</th><th aria-label="Done" /></tr></thead>
              <tbody>
                {sets.map((s, i) => {
                  const prev = last?.sets[i];
                  const pr = isRecord(state.workouts, date, s);
                  return (
                    <tr key={s.id} className={s.done ? 'done' : ''}>
                      <td>
                        <button type="button" className={`set-type t-${s.type}`} title={`${SET_TYPES[s.type].label} — tap to change`}
                          onClick={() => { const keys = Object.keys(SET_TYPES); update(s.id, { type: keys[(keys.indexOf(s.type) + 1) % keys.length] }); }}>
                          {SET_TYPES[s.type].short || i + 1}
                        </button>
                      </td>
                      <td className="muted small">{prev ? (prev.kg ? `${prev.kg}×${prev.reps}` : prev.reps) : '–'}</td>
                      {!timed && <td><input type="number" inputMode="decimal" step="0.5" min="0" value={s.kg} aria-label={`Set ${i + 1} weight in kg`} onChange={(e) => update(s.id, { kg: e.target.value === '' ? '' : Number(e.target.value) })} /></td>}
                      <td><input type="number" inputMode="numeric" min="0" value={s.reps} aria-label={`Set ${i + 1} ${timed ? 'seconds' : 'reps'}`} onChange={(e) => update(s.id, { reps: e.target.value === '' ? '' : Number(e.target.value) })} /></td>
                      <td>
                        <button type="button" className={`tick ${s.done ? 'on' : ''}`} aria-pressed={s.done} aria-label={`Mark set ${i + 1} done`}
                          onClick={() => {
                            update(s.id, { done: !s.done });
                            if (!s.done) setRest({ endsAt: Date.now() + item.rest * 1000, total: item.rest });
                          }}>✓</button>
                        {pr && <span className="pr-badge" title="New personal record">PR</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="row between">
              <button type="button" className="btn ghost sm" onClick={() => dispatch({ type: 'WORKOUT_SET_ADD', date, exId })}>+ Add set</button>
              {sets.length > 1 && <button type="button" className="btn ghost sm" onClick={() => dispatch({ type: 'WORKOUT_SET_REMOVE', date, id: sets[sets.length - 1].id })}>− Remove set</button>}
            </div>
          </section>
        );
      })}
      <button type="button" className="btn danger" onClick={() => confirm('Discard this workout? Logged sets will be lost.') && dispatch({ type: 'WORKOUT_DISCARD', date })}>Discard workout</button>
      <RestBar rest={rest} setRest={setRest} />
    </div>
  );
}

/* ── Exercise library ───────────────────────────────────────────────── */
function LibraryView({ onOpen }) {
  const [muscle, setMuscle] = useState(null);
  const [q, setQ] = useState('');
  const list = useMemo(() => EXERCISES.filter((e) => (!muscle || e.primary.includes(muscle) || e.secondary.includes(muscle))
    && (!q || `${e.name} ${e.equipment}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (muscle ? Number(b.primary.includes(muscle)) - Number(a.primary.includes(muscle)) : 0)), [muscle, q]);
  return (
    <div className="stack">
      <Card title="Tap a muscle">
        <BodyMap selected={muscle} onPick={(m) => setMuscle(muscle === m ? null : m)} />
        <div className="chips scroll">
          <button type="button" className={`chip ${!muscle ? 'on' : ''}`} onClick={() => setMuscle(null)}>All</button>
          {Object.entries(MUSCLES).map(([id, m]) => <button key={id} type="button" className={`chip ${muscle === id ? 'on' : ''}`} onClick={() => setMuscle(id)}>{m.label}</button>)}
        </div>
      </Card>
      <input className="search" type="search" placeholder="Search exercises or equipment" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search exercises" />
      <Card>
        <ul className="ex-list">
          {list.map((ex) => (
            <li key={ex.id}>
              <button type="button" onClick={() => onOpen(ex.id)}>
                <Thumb ex={ex} />
                <span className="grow"><b>{ex.name}</b><span className="muted small">{ex.equipment} · {ex.level}</span><MusclePills ex={ex} /></span>
                <span className="muted" aria-hidden="true">›</span>
              </button>
            </li>
          ))}
          {!list.length && <p className="muted small">No exercise matches.</p>}
        </ul>
      </Card>
    </div>
  );
}

export default function Gym({ date }) {
  const { state, dispatch } = useStore();
  const active = state.workouts[date];
  const [view, setView] = useState(active && !active.finishedAt ? 'workout' : 'plan');
  const [detail, setDetail] = useState(null);
  const start = (day) => {
    if (active && !active.finishedAt && !confirm('Replace the workout already in progress?')) return;
    dispatch({ type: 'WORKOUT_START', date, session: buildSession(day, state.workouts, date) });
    setView('workout');
  };
  return (
    <div className="stack">
      <Segmented value={view} onChange={setView} options={[
        { value: 'plan', label: '🗓️ 5-day plan' },
        { value: 'workout', label: active && !active.finishedAt ? '🔴 Workout' : '🏋️ Workout' },
        { value: 'library', label: '📚 Exercises' },
      ]} />
      {view === 'plan' && <PlanView date={date} onStart={start} onOpen={setDetail} />}
      {view === 'workout' && <WorkoutView date={date} onOpen={setDetail} goPlan={() => setView('plan')} onStart={start} />}
      {view === 'library' && <LibraryView onOpen={setDetail} />}
      {date !== dateKey() && <p className="muted small center">You are viewing {shortDay(date)}. Workouts are saved to that day.</p>}
      <ExerciseSheet id={detail} onClose={() => setDetail(null)} onOpen={setDetail} />
    </div>
  );
}
