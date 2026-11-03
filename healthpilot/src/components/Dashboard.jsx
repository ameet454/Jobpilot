import { useMemo } from 'react';
import { useStore } from '../lib/store.jsx';
import { HABITS, habitHistory, habitProgress, dayScore, SLEEP_TARGET, WORKOUTS_PER_WEEK } from '../lib/dashboard.js';
import { nextPlanDay, personalRecords, planDays, sessionStats, trainingConsistency, weeklyMuscleSets, WEEKLY_SET_TARGET } from '../lib/workout.js';
import { loggingStreak } from '../lib/insights.js';
import { EXERCISE_BY_ID, MUSCLES } from '../data/exercises.js';
import { parseKey, shortDay } from '../lib/dates.js';
import BodyMap from './BodyMap.jsx';
import { Card, Ring, fmt } from './ui.jsx';

function HabitRow({ h, value, detail, action }) {
  const hit = value >= 1;
  return (
    <li className={`habit ${hit ? 'hit' : ''}`}>
      <span className="habit-icon" aria-hidden="true">{hit ? '✅' : h.icon}</span>
      <span className="grow">
        <span className="row between"><b>{h.label}</b><span className="muted small">{detail}</span></span>
        <span className="bar"><span style={{ width: `${Math.round(value * 100)}%`, background: hit ? 'var(--good)' : 'var(--accent)' }} /></span>
      </span>
      {action}
    </li>
  );
}

export default function Dashboard({ date, goTo }) {
  const { state, dispatch, targets } = useStore();
  const p = habitProgress(state, targets, date);
  const score = dayScore(p);
  const history = useMemo(() => habitHistory(state, targets, date, 7), [state, targets, date]);
  const muscleSets = useMemo(() => weeklyMuscleSets(state.workouts, date), [state.workouts, date]);
  const heat = Object.fromEntries(Object.entries(muscleSets).map(([m, v]) => [m, v / WEEKLY_SET_TARGET[0]]));
  const days = planDays(state.gym);
  const next = nextPlanDay(state.workouts, days, date);
  const w = state.workouts[date];
  const { thisWeek, weeks } = trainingConsistency(state.workouts, date);
  const records = Object.entries(personalRecords(state.workouts)).sort((a, b) => b[1].date.localeCompare(a[1].date)).slice(0, 3);
  const under = Object.entries(muscleSets).filter(([, v]) => v < WEEKLY_SET_TARGET[0]).map(([m]) => MUSCLES[m].label);
  const { totals, day } = p.meta;
  const stats = w ? sessionStats(w) : null;

  return (
    <div className="stack">
      <Card className="hero dash-hero">
        <div className="hero-grid">
          <Ring value={score * 100} max={100} color={score >= 0.83 ? 'var(--good)' : 'var(--accent)'} label={`Day score ${Math.round(score * 100)}%`}>
            <b className="big">{Math.round(score * 100)}%</b>
            <span className="muted small">day score</span>
          </Ring>
          <div className="hero-side">
            <div className="kv"><span>Habits hit</span><b>{HABITS.filter((h) => p[h.id] >= 1).length} / {HABITS.length}</b></div>
            <div className="kv"><span>Workouts this week</span><b>{thisWeek} / {WORKOUTS_PER_WEEK}</b></div>
            <div className="kv"><span>Food-log streak</span><b>{loggingStreak(state.days, date)} days</b></div>
          </div>
        </div>
      </Card>

      <Card title="🏋️ Today's training">
        {w?.finishedAt ? (
          <div className="row between">
            <div><b>{days.find((d) => d.id === w.dayId)?.name || 'Workout'} done ✅</b><p className="muted small">{stats.sets} sets · {fmt(stats.volume)} kg · {stats.minutes ?? '–'} min</p></div>
            <button type="button" className="btn sm" onClick={() => goTo('gym')}>View</button>
          </div>
        ) : w ? (
          <div className="row between">
            <div><b>{days.find((d) => d.id === w.dayId)?.name} in progress</b><p className="muted small">{stats.sets} of {w.sets.length} sets done</p></div>
            <button type="button" className="btn primary sm" onClick={() => goTo('gym')}>Continue</button>
          </div>
        ) : p.meta.restOk ? (
          <p><b>Rest day 😌</b> <span className="muted small">You've done {thisWeek} workouts this week. Recovery is when muscle grows.</span></p>
        ) : (
          <div className="row between">
            <div><b>{next.icon} {next.name}</b><p className="muted small">{next.focus} · {next.exercises.length} exercises</p></div>
            <button type="button" className="btn primary sm" onClick={() => goTo('gym')}>Start</button>
          </div>
        )}
      </Card>

      <Card title="Today's checklist">
        <ul className="habits plain">
          <HabitRow h={HABITS[0]} value={p.kcal} detail={`${fmt(totals.kcal)} / ${fmt(targets.kcal)} kcal`} action={<button type="button" className="btn ghost sm" onClick={() => goTo('food')}>+ Food</button>} />
          <HabitRow h={HABITS[1]} value={p.protein} detail={`${fmt(totals.p)} / ${fmt(targets.p)} g`} />
          <HabitRow h={HABITS[2]} value={p.water} detail={`${fmt(day.water || 0)} / ${fmt(targets.water)} ml`} action={<button type="button" className="btn ghost sm" onClick={() => dispatch({ type: 'ADD_WATER', date, ml: 250 })}>+250</button>} />
          <HabitRow h={HABITS[3]} value={p.steps} detail={`${fmt(day.steps || 0)} / ${fmt(targets.steps)}`} action={<button type="button" className="btn ghost sm" onClick={() => goTo('track')}>Log</button>} />
          <HabitRow h={HABITS[4]} value={p.sleep} detail={day.sleep ? `${day.sleep} / ${SLEEP_TARGET} h` : 'not logged'} action={<button type="button" className="btn ghost sm" onClick={() => goTo('track')}>Log</button>} />
          <HabitRow h={HABITS[5]} value={p.workout} detail={p.meta.trained ? 'done' : p.meta.restOk ? 'rest day' : p.meta.inProgress ? 'in progress' : 'not yet'} />
        </ul>
      </Card>

      <Card title="Last 7 days">
        <div className="habit-grid" role="table" aria-label="Habits over the last 7 days">
          <div role="row" className="hg-row hg-head">
            <span role="columnheader" />
            {history.map((d) => <span role="columnheader" key={d.date}>{parseKey(d.date).toLocaleDateString('en-IN', { weekday: 'narrow' })}</span>)}
          </div>
          {HABITS.map((h) => (
            <div role="row" className="hg-row" key={h.id}>
              <span role="rowheader" title={h.label}>{h.icon}</span>
              {history.map((d) => {
                const v = d.progress[h.id];
                return <span role="cell" key={d.date} className={`hg-cell ${v >= 1 ? 'hit' : v > 0 ? 'part' : ''}`} title={`${shortDay(d.date)} · ${h.label}: ${Math.round(v * 100)}%`} />;
              })}
            </div>
          ))}
          <div role="row" className="hg-row hg-score">
            <span role="rowheader">%</span>
            {history.map((d) => <span role="cell" key={d.date}>{Math.round(d.score * 100)}</span>)}
          </div>
        </div>
      </Card>

      <Card title="Muscles trained this week" action={<span className="muted small">{weeks > 0 ? `🔥 ${weeks}-week streak` : ''}</span>}>
        <BodyMap heat={heat} />
        <div className="legend">
          <span><i style={{ background: 'var(--track)' }} /> Not trained</span>
          <span><i style={{ background: '#60a5fa' }} /> Under 5 sets</span>
          <span><i style={{ background: '#22c55e' }} /> {WEEKLY_SET_TARGET[0] / 2}–{WEEKLY_SET_TARGET[1]} sets</span>
          <span><i style={{ background: '#ef4444' }} /> Over {WEEKLY_SET_TARGET[1]}</span>
        </div>
        {thisWeek > 0 && under.length > 0 && <p className="muted small">Below {WEEKLY_SET_TARGET[0]} hard sets this week: {under.join(', ')}.</p>}
        {thisWeek === 0 && <p className="muted small">Finish a workout and the muscles you trained light up here. 10–20 hard sets per muscle per week is a common target for muscle growth.</p>}
      </Card>

      {records.length > 0 && (
        <Card title="🥇 Recent personal records">
          <ul className="plain records">
            {records.map(([id, r]) => (
              <li key={id} className="row between">
                <span>{EXERCISE_BY_ID[id].name}</span>
                <span className="muted small">{r.kg ? `${r.kg} kg × ${r.reps}` : `${r.reps} s`} · {shortDay(r.date)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
