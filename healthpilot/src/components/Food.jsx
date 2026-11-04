import { CalendarDays, Camera } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { CATEGORIES, FOODS, getFood } from '../data/foods.js';
import { parseMeal, searchFoods } from '../lib/parser.js';
import { MEALS, makeEntry } from '../lib/entries.js';
import { generatePlan, dietCode } from '../lib/planner.js';
import { analysePhoto, estimateFoods, fileToDataUrl } from '../lib/ai.js';
import { Card, DietDot, Segmented, Sheet, Stepper, fmt } from './ui.jsx';

let keySeq = 0;
const basketItem = (food, qty = 1, source = 'db') => ({ key: ++keySeq, food, qty, source });

const EXAMPLES = ['2 roti, 1 bowl dal, salad', '3 idli + sambar + chai', 'poha and 1 cup chai', '200g paneer tikka, 1 naan'];

export default function Food({ date, meal, setMeal, onDone }) {
  const { state, dispatch, targets } = useStore();
  const [text, setText] = useState('');
  const [basket, setBasket] = useState([]);
  const [unknown, setUnknown] = useState([]);
  const [tab, setTab] = useState(state.recents.length ? 'recent' : 'all');
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('All');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [limit, setLimit] = useState(30);
  const fileRef = useRef(null);

  const allFoods = useMemo(() => [...state.customFoods, ...FOODS], [state.customFoods]);
  const dietOk = (f) => ({ v: 0, e: 1, n: 2 })[f.diet ?? 'v'] <= ({ v: 0, e: 1, n: 2 })[dietCode(state.profile.diet ?? 'n')];

  const list = useMemo(() => {
    if (query.trim()) return searchFoods(query, allFoods, 40).map((r) => r.food);
    if (tab === 'recent') return state.recents.map((id) => getFood(id, state.customFoods)).filter(Boolean);
    if (tab === 'fav') return state.favorites.map((id) => getFood(id, state.customFoods)).filter(Boolean);
    if (tab === 'mine') return state.customFoods;
    return FOODS.filter((f) => (cat === 'All' || f.cat === cat) && dietOk(f));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, tab, cat, allFoods, state.recents, state.favorites, state.customFoods]);

  const parse = () => {
    if (!text.trim()) return;
    const parsed = parseMeal(text, allFoods);
    setBasket((b) => [...b, ...parsed.filter((p) => p.food).map((p) => basketItem(p.food, p.qty))]);
    setUnknown((u) => [...u, ...parsed.filter((p) => !p.food).map((p) => p.raw)]);
    setText('');
  };

  const runAi = async (label, fn) => {
    setBusy(label);
    setError('');
    try { await fn(); } catch (e) { setError(`${e.message}. You can still add it as a custom food.`); } finally { setBusy(''); }
  };

  const estimateUnknown = () => runAi('Estimating…', async () => {
    const items = await estimateFoods(unknown.join(', '));
    setBasket((b) => [...b, ...items.map((it) => basketItem({ ...it, id: null }, it.qty || 1, 'ai'))]);
    setUnknown([]);
  });

  const onPhoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    runAi('Analysing photo…', async () => {
      const items = await analysePhoto(await fileToDataUrl(file), text);
      if (!items.length) throw new Error('No food recognised in that photo');
      setBasket((b) => [...b, ...items.map((it) => basketItem({ ...it, id: null }, it.qty || 1, 'ai'))]);
    });
  };

  const basketKcal = basket.reduce((a, it) => a + it.food.kcal * (Number(it.qty) || 0), 0);
  const commit = () => {
    if (!basket.length) return;
    dispatch({ type: 'ADD_ENTRIES', date, entries: basket.map((it) => makeEntry(it.food, it.qty, meal, it.source)) });
    setBasket([]);
    onDone();
  };

  return (
    <div className="stack with-footer">
      <Segmented value={meal} onChange={setMeal} options={MEALS.map((m) => ({ value: m.id, label: m.label }))} small />

      <Card className="smart">
        <label htmlFor="smart" className="smart-label">Type it like a text message</label>
        <div className="smart-row">
          <input
            id="smart" value={text} onChange={(e) => setText(e.target.value)} placeholder="2 roti, 1 katori dal, salad"
            onKeyDown={(e) => e.key === 'Enter' && parse()} autoComplete="off"
          />
          <button className="btn primary" onClick={parse} disabled={!text.trim()}>Add</button>
          <button className="btn icon" title="Log from a photo (AI)" aria-label="Log from a photo" onClick={() => fileRef.current?.click()}><Camera size={18} /></button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />
        </div>
        {!basket.length && !text && (
          <div className="chips">
            {EXAMPLES.map((ex) => <button key={ex} className="chip" onClick={() => setText(ex)}>{ex}</button>)}
          </div>
        )}
        {busy && <p className="muted small">⏳ {busy}</p>}
        {error && <p className="tone-warn small">{error}</p>}
        {unknown.length > 0 && (
          <div className="unknown">
            <span className="small">Not in database: <b>{unknown.join(', ')}</b></span>
            <div className="row">
              <button className="btn sm" onClick={estimateUnknown} disabled={!!busy}>✨ Estimate with AI</button>
              <button className="btn ghost sm" onClick={() => setCustomOpen(true)}>Create food</button>
              <button className="btn ghost sm" onClick={() => setUnknown([])}>Dismiss</button>
            </div>
          </div>
        )}
        {basket.length > 0 && (
          <ul className="basket">
            {basket.map((it) => (
              <li key={it.key}>
                <div className="grow">
                  <b>{it.food.name}</b> {it.source === 'ai' && <span className="badge">AI est.</span>}
                  <span className="muted small"> {it.food.serving} · {fmt(it.food.kcal * (Number(it.qty) || 0))} kcal</span>
                </div>
                <Stepper value={it.qty} label={`Servings of ${it.food.name}`}
                  onChange={(qty) => setBasket((b) => b.map((x) => (x.key === it.key ? { ...x, qty } : x)))} />
                <button className="icon-btn" aria-label={`Remove ${it.food.name}`} onClick={() => setBasket((b) => b.filter((x) => x.key !== it.key))}>✕</button>
              </li>
            ))}
          </ul>
        )}
        {list.length > limit && <button className="btn ghost sm block" onClick={() => setLimit((l) => l + 50)}>Show {Math.min(50, list.length - limit)} more</button>}
      </Card>

      <div className="row between">
        <button className="btn ghost sm" onClick={() => setPlanOpen(true)}><CalendarDays size={16} />Plan my day</button>
        <button className="btn ghost sm" onClick={() => setCustomOpen(true)}>＋ Custom food</button>
      </div>

      <Card>
        <input className="search" type="search" placeholder={`Search ${FOODS.length}+ Indian foods…`} value={query} onChange={(e) => setQuery(e.target.value)} />
        {!query && (
          <>
            <Segmented small value={tab} onChange={setTab} options={[
              { value: 'recent', label: 'Recent' }, { value: 'fav', label: '★ Saved' }, { value: 'all', label: 'Browse' }, { value: 'mine', label: 'Mine' },
            ]} />
            {tab === 'all' && (
              <div className="chips scroll">
                {['All', ...CATEGORIES].map((c) => <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
              </div>
            )}
          </>
        )}
        {list.length === 0 ? (
          <p className="muted small center pad">
            {tab === 'recent' ? 'Foods you log will show up here.' : tab === 'fav' ? 'Tap ☆ on any food to save it.' : tab === 'mine' ? 'Create foods for home recipes or packaged items.' : 'No matches — try another spelling, or create a custom food.'}
          </p>
        ) : (
          <ul className="food-list">
            {list.slice(0, limit).map((f) => {
              const fav = state.favorites.includes(f.id);
              return (
                <li key={f.id}>
                  <button className="food-main" onClick={() => setBasket((b) => [...b, basketItem(f, 1)])}>
                    <DietDot diet={f.diet || 'v'} />
                    <span className="grow">
                      <b>{f.name}</b>
                      <span className="muted small">{f.serving} · P {fmt(f.p, 1)} · C {fmt(f.c, 1)} · F {fmt(f.f, 1)}</span>
                    </span>
                    <span className="kcal">{fmt(f.kcal)}<small> kcal</small></span>
                  </button>
                  <button className={`icon-btn star ${fav ? 'on' : ''}`} aria-label={fav ? 'Unsave' : 'Save'} onClick={() => dispatch({ type: 'TOGGLE_FAV', id: f.id })}>{fav ? '★' : '☆'}</button>
                </li>
              );
            })}
          </ul>
        )}
        {list.length > limit && <button className="btn ghost sm block" onClick={() => setLimit((l) => l + 50)}>Show {Math.min(50, list.length - limit)} more</button>}
      </Card>

      {basket.length > 0 && (
        <div className="footer-bar">
          <button className="btn primary block" onClick={commit}>
            Log {basket.length} item{basket.length > 1 ? 's' : ''} · {fmt(basketKcal)} kcal to {MEALS.find((m) => m.id === meal).label}
          </button>
        </div>
      )}

      <CustomFoodSheet open={customOpen} onClose={() => setCustomOpen(false)} initialName={unknown[0] || ''}
        onSave={(food) => { dispatch({ type: 'ADD_CUSTOM_FOOD', food }); setCustomOpen(false); setUnknown((u) => u.slice(1)); }} />
      <PlanSheet open={planOpen} onClose={() => setPlanOpen(false)} targets={targets} diet={state.profile.diet}
        onLog={(m, items) => dispatch({ type: 'ADD_ENTRIES', date, entries: items.map((it) => makeEntry(it.food, it.qty, m, 'plan')) })} />
    </div>
  );
}

function CustomFoodSheet({ open, onClose, onSave, initialName }) {
  const blank = { name: initialName, serving: '1 serving', kcal: '', p: '', c: '', f: '', fib: '', diet: 'v' };
  const [f, setF] = useState(blank);
  const [lastName, setLastName] = useState(initialName);
  if (open && initialName !== lastName) { setLastName(initialName); setF({ ...blank, name: initialName }); }
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const valid = f.name.trim() && Number(f.kcal) >= 0 && f.kcal !== '';
  return (
    <Sheet open={open} onClose={onClose} title="Create a food">
      <form className="profile-form" onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onSave({ name: f.name.trim(), serving: f.serving || '1 serving', kcal: +f.kcal, p: +f.p || 0, c: +f.c || 0, f: +f.f || 0, fib: +f.fib || 0, diet: f.diet, cat: 'Mine' });
        setF(blank);
      }}>
        <label className="field"><span>Name</span><input value={f.name} onChange={set('name')} placeholder="Mom's aloo paratha" required /></label>
        <label className="field"><span>Serving</span><input value={f.serving} onChange={set('serving')} placeholder="1 piece" /></label>
        <div className="grid3">
          <label className="field"><span>kcal</span><input type="number" min="0" value={f.kcal} onChange={set('kcal')} required /></label>
          <label className="field"><span>Protein g</span><input type="number" min="0" step="0.1" value={f.p} onChange={set('p')} /></label>
          <label className="field"><span>Carbs g</span><input type="number" min="0" step="0.1" value={f.c} onChange={set('c')} /></label>
          <label className="field"><span>Fat g</span><input type="number" min="0" step="0.1" value={f.f} onChange={set('f')} /></label>
          <label className="field"><span>Fibre g</span><input type="number" min="0" step="0.1" value={f.fib} onChange={set('fib')} /></label>
          <label className="field"><span>Diet</span>
            <select value={f.diet} onChange={set('diet')}><option value="v">Veg</option><option value="e">Egg</option><option value="n">Non-veg</option></select>
          </label>
        </div>
        <button className="btn primary block" disabled={!valid}>Save food</button>
      </form>
    </Sheet>
  );
}

function PlanSheet({ open, onClose, targets, diet, onLog }) {
  const [seed, setSeed] = useState(() => Date.now());
  const [logged, setLogged] = useState({});
  const plan = useMemo(() => generatePlan(targets, diet, seed), [targets, diet, seed]);
  return (
    <Sheet open={open} onClose={onClose} title="Your plan for the day" wide>
      <p className="muted small">
        Built for <b>{fmt(targets.kcal)} kcal</b> and <b>{targets.p} g protein</b> from everyday Indian meals.
        This plan: {fmt(plan.total.kcal)} kcal · {plan.total.p} g protein.
      </p>
      {MEALS.map((m) => {
        const pm = plan.meals[m.id];
        return (
          <div key={m.id} className="plan-meal">
            <div className="row between">
              <b>{m.label} <span className="muted small">· {fmt(pm.kcal)} kcal · P {pm.p} g</span></b>
              <button className="btn sm" disabled={logged[`${seed}-${m.id}`]}
                onClick={() => { onLog(m.id, pm.items); setLogged((l) => ({ ...l, [`${seed}-${m.id}`]: true })); }}>
                {logged[`${seed}-${m.id}`] ? '✓ Logged' : 'Log'}
              </button>
            </div>
            <ul className="plain">
              {pm.items.map((it) => <li key={it.food.id}>{it.qty} × {it.food.name} <span className="muted small">({it.food.serving})</span></li>)}
            </ul>
          </div>
        );
      })}
      <button className="btn block" onClick={() => setSeed(Date.now())}>🔀 Shuffle plan</button>
    </Sheet>
  );
}
