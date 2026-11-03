import { useMemo, useState } from 'react';
import { ACTIVITY, GOALS, bmi, bmiCategory, computeTargets, weeksToGoal } from '../lib/nutrition.js';
import { Segmented, fmt } from './ui.jsx';

const DEFAULTS = {
  name: '', sex: 'female', age: 28, height: 162, weight: 68, targetWeight: 60,
  activity: 'light', goal: 'lose', pace: 0.5, diet: 'v', stepGoal: 8000,
};

/** Profile form — used for first-run onboarding and for editing later. */
export default function ProfileForm({ initial, onSave, submitLabel = 'Start tracking' }) {
  const [p, setP] = useState({ ...DEFAULTS, ...initial });
  const set = (k) => (e) => setP((s) => ({ ...s, [k]: e?.target ? (e.target.type === 'number' ? Number(e.target.value) : e.target.value) : e }));

  const valid = p.age >= 13 && p.age <= 100 && p.height >= 120 && p.height <= 230 && p.weight >= 30 && p.weight <= 300;
  const targets = useMemo(() => (valid ? computeTargets(p) : null), [p, valid]);
  const b = valid ? bmi(p.weight, p.height) : null;
  const cat = b ? bmiCategory(b) : null;
  const weeks = valid ? weeksToGoal(p, p.weight) : null;

  const submit = (e) => {
    e.preventDefault();
    if (!valid) return;
    onSave({ ...p, name: p.name.trim(), targetWeight: p.goal === 'maintain' ? p.weight : Number(p.targetWeight) });
  };

  return (
    <form className="profile-form" onSubmit={submit}>
      <label className="field">
        <span>Your name</span>
        <input value={p.name} onChange={set('name')} placeholder="e.g. Priya" autoComplete="given-name" />
      </label>

      <div className="field">
        <span>Sex (for metabolism maths)</span>
        <Segmented value={p.sex} onChange={set('sex')} options={[{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }]} />
      </div>

      <div className="grid3">
        <label className="field"><span>Age</span><input type="number" value={p.age} onChange={set('age')} min="13" max="100" /></label>
        <label className="field"><span>Height (cm)</span><input type="number" value={p.height} onChange={set('height')} min="120" max="230" /></label>
        <label className="field"><span>Weight (kg)</span><input type="number" step="0.1" value={p.weight} onChange={set('weight')} min="30" max="300" /></label>
      </div>

      {cat && (
        <p className={`note tone-${cat.tone}`}>
          BMI {b.toFixed(1)} · <b>{cat.label}</b> <span className="muted">(Asia-Pacific cut-offs, better suited to Indian bodies)</span>
        </p>
      )}

      <div className="field">
        <span>Goal</span>
        <Segmented value={p.goal} onChange={set('goal')} options={Object.entries(GOALS).map(([value, label]) => ({ value, label: label.split(' ')[0] }))} />
      </div>

      {p.goal !== 'maintain' && (
        <div className="grid2">
          <label className="field"><span>Target weight (kg)</span><input type="number" step="0.1" value={p.targetWeight} onChange={set('targetWeight')} /></label>
          <label className="field">
            <span>Pace</span>
            <select value={p.pace} onChange={(e) => setP((s) => ({ ...s, pace: Number(e.target.value) }))}>
              <option value={0.25}>Relaxed · 0.25 kg/wk</option>
              <option value={0.5}>Steady · 0.5 kg/wk</option>
              <option value={0.75}>Fast · 0.75 kg/wk</option>
              {p.goal === 'lose' && <option value={1}>Aggressive · 1 kg/wk</option>}
            </select>
          </label>
        </div>
      )}

      <label className="field">
        <span>Activity level</span>
        <select value={p.activity} onChange={set('activity')}>
          {Object.entries(ACTIVITY).map(([k, a]) => <option key={k} value={k}>{a.label} — {a.hint}</option>)}
        </select>
      </label>

      <div className="grid2">
        <div className="field">
          <span>Diet</span>
          <Segmented small value={p.diet} onChange={set('diet')} options={[{ value: 'v', label: 'Veg' }, { value: 'e', label: 'Egg' }, { value: 'n', label: 'Non-veg' }]} />
        </div>
        <label className="field"><span>Daily step goal</span><input type="number" step="500" value={p.stepGoal} onChange={set('stepGoal')} /></label>
      </div>

      {targets && (
        <div className="plan-preview">
          <div><b>{fmt(targets.kcal)}</b><span>kcal / day</span></div>
          <div><b>{targets.p} g</b><span>protein</span></div>
          <div><b>{(targets.water / 1000).toFixed(1)} L</b><span>water</span></div>
          <p className="muted small">
            Maintenance ≈ {fmt(targets.tdee)} kcal.{' '}
            {targets.deficit < 0 ? `Daily deficit ${-targets.deficit} kcal.` : targets.deficit > 0 ? `Daily surplus ${targets.deficit} kcal.` : ''}
            {weeks ? ` Goal in ~${weeks} weeks.` : ''}
            {targets.floorApplied ? ' Calories held at a safe minimum — consider a slower pace.' : ''}
          </p>
        </div>
      )}

      <button className="btn primary block" disabled={!valid} type="submit">{submitLabel}</button>
    </form>
  );
}
