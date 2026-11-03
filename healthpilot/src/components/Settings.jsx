import { useRef, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import ProfileForm from './Onboarding.jsx';
import { Card, Segmented } from './ui.jsx';

export default function Settings({ onClose }) {
  const { state, dispatch } = useStore();
  const fileRef = useRef(null);
  const [msg, setMsg] = useState('');

  const exportData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `healthpilot-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportCsv = () => {
    const rows = [['date', 'meal', 'food', 'qty', 'serving', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g']];
    for (const [date, d] of Object.entries(state.days).sort()) {
      for (const e of d.entries || []) {
        rows.push([date, e.meal, e.name, e.qty, e.serving, ...['kcal', 'p', 'c', 'f', 'fib'].map((k) => Math.round((e.n[k] || 0) * e.qty * 10) / 10)]);
      }
    }
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'healthpilot-food-log.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importData = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || typeof data !== 'object' || !data.days) throw new Error('Not a HealthPilot backup');
      dispatch({ type: 'IMPORT', state: data });
      setMsg('✅ Backup restored.');
    } catch (err) {
      setMsg(`⚠️ ${err.message}`);
    }
  };

  return (
    <div className="stack">
      <Card title="Profile & goals">
        <ProfileForm initial={state.profile} submitLabel="Save changes" onSave={(profile) => { dispatch({ type: 'SET_PROFILE', profile }); onClose(); }} />
      </Card>
      <Card title="Appearance">
        <Segmented value={state.settings.theme} onChange={(theme) => dispatch({ type: 'SET_THEME', theme })}
          options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
      </Card>
      <Card title="Your data">
        <p className="muted small">Everything is stored only on this device. No account, no tracking, no ads. Back it up or move it to another phone any time.</p>
        <div className="row wrap">
          <button className="btn sm" onClick={exportData}>⬇️ Backup (JSON)</button>
          <button className="btn sm" onClick={exportCsv}>📄 Export food log (CSV)</button>
          <button className="btn sm" onClick={() => fileRef.current?.click()}>⬆️ Restore backup</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={importData} />
        </div>
        {msg && <p className="small">{msg}</p>}
        <button className="btn danger sm" onClick={() => { if (confirm('Delete all HealthPilot data on this device? This cannot be undone.')) dispatch({ type: 'RESET' }); }}>
          Delete all data
        </button>
      </Card>
    </div>
  );
}
