import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { buildInsights, averages } from '../lib/insights.js';
import { dayTotals } from '../lib/nutrition.js';
import { askCoach } from '../lib/ai.js';
import { FOODS } from '../data/foods.js';
import { Card, fmt } from './ui.jsx';

const SUGGESTIONS = ['What should I eat for dinner?', 'How do I get more protein as a vegetarian?', 'Why is my weight not dropping?', 'Healthy snacks under 150 kcal'];

/** Offline answers from the user's own numbers, used when AI isn't configured. */
function localReply(q, { totals, targets, profile }) {
  const s = q.toLowerCase();
  const left = Math.round(targets.kcal - totals.kcal);
  const pLeft = Math.max(0, Math.round(targets.p - totals.p));
  const ok = (f) => ({ v: 0, e: 1, n: 2 })[f.diet] <= ({ v: 0, e: 1, n: 2 })[profile.diet];
  const proteinPicks = FOODS.filter((f) => ok(f) && f.kcal > 40 && f.p / f.kcal > 0.08).sort((a, b) => b.p / b.kcal - a.p / a.kcal).slice(0, 5);
  if (/protein/.test(s)) {
    return `You need about ${pLeft} g more protein today (target ${targets.p} g). Best protein-per-calorie picks for your diet:\n${proteinPicks.map((f) => `• ${f.name} — ${f.p} g protein / ${f.kcal} kcal (${f.serving})`).join('\n')}`;
  }
  if (/snack|hungry|craving/.test(s)) {
    const snacks = FOODS.filter((f) => ok(f) && ['Snacks', 'Fruits', 'Protein'].includes(f.cat) && f.kcal <= 150).sort((a, b) => b.p - a.p).slice(0, 6);
    return `Filling snacks under 150 kcal:\n${snacks.map((f) => `• ${f.name} (${f.serving}) — ${f.kcal} kcal, ${f.p} g protein`).join('\n')}\nTip: drink a glass of water first — thirst often feels like hunger.`;
  }
  if (/dinner|lunch|breakfast|eat|meal/.test(s)) {
    if (left < 150) return `You have ${Math.max(left, 0)} kcal left today. Keep it light: a bowl of vegetable soup (70 kcal), salad (35 kcal) or a glass of chaas (40 kcal). Try "Plan my day" on the Food tab for full meal ideas.`;
    return `You have ${left} kcal and ${pLeft} g protein left. A balanced plate: ½ vegetables/salad, ¼ protein (dal, paneer, egg or chicken), ¼ roti or rice. Open Food → "Plan my day" for a meal plan sized exactly to what's left.`;
  }
  if (/weight|plateau|not (losing|dropping)|stuck/.test(s)) {
    return 'Common reasons for a stall: (1) untracked oil/ghee — 1 tbsp is ~120 kcal; (2) weekend meals; (3) water retention after salty food or a hard workout; (4) your maintenance drops as you get lighter. Check your weight *trend* on Progress, not daily readings — 2 flat weeks is normal. Update your weight weekly so your targets recalculate.';
  }
  return `Today: ${Math.round(totals.kcal)} of ${targets.kcal} kcal, ${Math.round(totals.p)} of ${targets.p} g protein. Ask me about meals, protein, snacks or weight plateaus. (For open-ended AI answers, the server's OPENROUTER_API_KEY needs to be set.)`;
}

export default function Coach({ date }) {
  const { state, targets } = useStore();
  const insights = useMemo(() => buildInsights(state, targets, date), [state, targets, date]);
  const [msgs, setMsgs] = useState([{ role: 'assistant', content: `Hi ${state.profile.name || 'there'} 👋 I'm your HealthPilot coach. I can see today's log and your targets — ask me anything about food, protein or progress.` }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [msgs]);

  const send = async (text) => {
    const q = text.trim();
    if (!q || busy) return;
    const next = [...msgs, { role: 'user', content: q }];
    setMsgs(next);
    setInput('');
    setBusy(true);
    const totals = dayTotals(state.days[date]);
    const week = averages(state.days, 7, date);
    const context = {
      profile: { ...state.profile, name: undefined },
      targets: { kcal: targets.kcal, protein: targets.p, carbs: targets.c, fat: targets.f, water: targets.water },
      today: { ...Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Math.round(v)])), water: state.days[date]?.water || 0, foods: (state.days[date]?.entries || []).map((e) => `${e.qty}× ${e.name}`) },
      week: week && { avgKcal: Math.round(week.kcal), avgProtein: Math.round(week.p), loggedDays: week.loggedDays },
    };
    let reply;
    try {
      reply = await askCoach(next.slice(-8), context);
    } catch {
      reply = localReply(q, { totals, targets, profile: state.profile });
    }
    setMsgs((m) => [...m, { role: 'assistant', content: reply }]);
    setBusy(false);
  };

  return (
    <div className="stack">
      <Card title="Today's insights">
        <div className="insights">
          {insights.map((i) => (
            <div key={i.title} className={`insight static tone-${i.tone}`}>
              <span className="insight-icon">{i.icon}</span>
              <span><b>{i.title}</b><span className="small">{i.body}</span></span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Ask your coach" className="chat-card">
        <div className="chat" aria-live="polite">
          {msgs.map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.content}</div>)}
          {busy && <div className="msg assistant typing">…</div>}
          <div ref={endRef} />
        </div>
        <div className="chips">
          {SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}
        </div>
        <form className="smart-row" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask anything…" aria-label="Message the coach" />
          <button className="btn primary" disabled={!input.trim() || busy}>Send</button>
        </form>
        <p className="muted small">General wellness guidance, not medical advice. Talk to a doctor about medical conditions.</p>
      </Card>
    </div>
  );
}
