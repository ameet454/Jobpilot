import { useEffect, useState } from 'react';
import { useStore } from './lib/store.jsx';
import { addDays, dateKey, mealForHour, prettyDay } from './lib/dates.js';
import ProfileForm from './components/Onboarding.jsx';
import Today from './components/Today.jsx';
import Food from './components/Food.jsx';
import Track from './components/Track.jsx';
import Progress from './components/Progress.jsx';
import Coach from './components/Coach.jsx';
import Settings from './components/Settings.jsx';
import { Sheet } from './components/ui.jsx';
import { FOODS } from './data/foods.js';

const TABS = [
  { id: 'today', label: 'Today', icon: '🏠' },
  { id: 'food', label: 'Log food', icon: '🍽️' },
  { id: 'track', label: 'Track', icon: '📊' },
  { id: 'progress', label: 'Progress', icon: '📈' },
  { id: 'coach', label: 'Coach', icon: '💬' },
];

export default function App() {
  const { state, dispatch } = useStore();
  const [tab, setTab] = useState('today');
  const [date, setDate] = useState(dateKey());
  const [meal, setMeal] = useState(mealForHour());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const today = dateKey();

  useEffect(() => {
    const t = state.settings.theme;
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }, [state.settings.theme]);

  // Roll the selected day over at midnight if the app is left open.
  useEffect(() => {
    const id = setInterval(() => setDate((d) => (d === addDays(dateKey(), -1) ? dateKey() : d)), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { window.scrollTo(0, 0); }, [tab]);

  if (!state.profile) {
    return (
      <main className="onboarding">
        <div className="brand-hero">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width="56" height="56" />
          <h1>HealthPilot</h1>
          <p>Calorie, protein & habit tracking built for Indian food. Free, private, and fast — log a meal by typing it like a text.</p>
          <ul className="usp">
            <li>⚡ Type “2 roti, dal, salad” — logged in one tap</li>
            <li>🇮🇳 {FOODS.length} Indian dishes with real portion sizes</li>
            <li>🔒 No sign-up. Your data never leaves your phone</li>
            <li>📉 Smoothed weight trend that ignores water-weight noise</li>
          </ul>
        </div>
        <div className="card">
          <h2>Let's set your targets</h2>
          <ProfileForm onSave={(profile) => dispatch({ type: 'SET_PROFILE', profile })} />
        </div>
      </main>
    );
  }

  const openFood = (m) => { setMeal(m); setTab('food'); };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width="28" height="28" /><span>HealthPilot</span></div>
        <div className="date-nav">
          <button className="icon-btn" aria-label="Previous day" onClick={() => setDate((d) => addDays(d, -1))}>‹</button>
          <button className="date-label" onClick={() => setDate(today)} title="Jump to today">{prettyDay(date, today)}</button>
          <button className="icon-btn" aria-label="Next day" disabled={date >= today} onClick={() => setDate((d) => addDays(d, 1))}>›</button>
        </div>
        <button className="icon-btn" aria-label="Settings" onClick={() => setSettingsOpen(true)}>⚙️</button>
      </header>

      <main className="content">
        {tab === 'today' && <Today date={date} onAddFood={openFood} goTo={setTab} />}
        {tab === 'food' && <Food date={date} meal={meal} setMeal={setMeal} onDone={() => setTab('today')} />}
        {tab === 'track' && <Track date={date} />}
        {tab === 'progress' && <Progress date={date} />}
        {tab === 'coach' && <Coach date={date} />}
      </main>

      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
            <span aria-hidden="true">{t.icon}</span>
            <small>{t.label}</small>
          </button>
        ))}
      </nav>

      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Settings" wide>
        <Settings onClose={() => setSettingsOpen(false)} />
      </Sheet>
    </div>
  );
}
