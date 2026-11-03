/**
 * HealthPilot — optional AI endpoint (Vercel serverless)
 * POST /api/coach  { mode: 'chat' | 'parse' | 'photo', ... }
 *
 *  chat  → { messages: [{role, content}], context } → { reply }
 *  parse → { text }                                  → { items }
 *  photo → { image: dataURL, hint? }                 → { items }
 *
 * The OpenRouter key stays server-side (OPENROUTER_API_KEY). If it's not set
 * this returns 503 and the app falls back to its offline engine.
 */

const MODEL = process.env.HEALTHPILOT_MODEL || 'openai/gpt-4o-mini';
const MAX_IMAGE_CHARS = 1_500_000; // ~1.1 MB JPEG after base64

const hits = new Map();
function rateLimited(ip, limit = 20, windowMs = 60_000) {
  const now = Date.now();
  const e = hits.get(ip);
  if (!e || now - e.start > windowMs) { hits.set(ip, { start: now, count: 1 }); return false; }
  e.count += 1;
  return e.count > limit;
}

const ITEM_SCHEMA = `Return ONLY JSON: {"items":[{"name":string,"serving":string,"qty":number,"kcal":number,"p":number,"c":number,"f":number,"fib":number}]}
- kcal/p/c/f/fib are for ONE serving (grams for macros); qty = number of servings eaten.
- Use typical Indian home-cooked recipes and portion sizes (katori ≈ 150 g, roti ≈ 40 g) unless told otherwise.
- Include visible oil/ghee in the dish values. Be realistic, not optimistic.`;

const COACH_SYSTEM = `You are HealthPilot Coach, a friendly, evidence-based nutrition and fitness coach for Indian users.
- Use the user's data in CONTEXT (targets, today's log, weekly averages). Quote their real numbers.
- Recommend everyday Indian foods with portions and approximate kcal/protein.
- Be concise: ≤ 120 words, short bullets when listing. Plain text, no markdown headers.
- No crash diets, no supplements beyond basics (whey, vitamin D/B12 if relevant), no diagnosis.
- For medical conditions (diabetes, thyroid, pregnancy, PCOS, kidney disease, eating disorders) advise consulting a doctor/dietitian.`;

async function openrouter(messages, { json = false, maxTokens = 700 } = {}) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'X-Title': 'HealthPilot',
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.3,
      max_tokens: maxTokens,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Upstream ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

const num = (v, max) => Math.min(max, Math.max(0, Number(v) || 0));

function cleanItems(raw) {
  let parsed;
  try { parsed = JSON.parse(raw.replace(/^```(?:json)?|```$/g, '').trim()); } catch { return []; }
  return (parsed.items || []).slice(0, 15).map((it) => ({
    name: String(it.name || 'Food').slice(0, 60),
    serving: String(it.serving || '1 serving').slice(0, 40),
    qty: num(it.qty, 20) || 1,
    kcal: Math.round(num(it.kcal, 3000)),
    p: num(it.p, 300), c: num(it.c, 500), f: num(it.f, 300), fib: num(it.fib, 100),
  }));
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.OPENROUTER_API_KEY) return res.status(503).json({ error: 'AI is not configured on this server' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'anon';
  if (rateLimited(ip)) return res.status(429).json({ error: 'Too many requests — try again in a minute' });

  const body = req.body || {};
  try {
    if (body.mode === 'chat') {
      const history = (Array.isArray(body.messages) ? body.messages : [])
        .filter((m) => ['user', 'assistant'].includes(m.role))
        .slice(-8)
        .map((m) => ({ role: m.role, content: String(m.content).slice(0, 1500) }));
      if (!history.length) return res.status(400).json({ error: 'messages required' });
      const context = JSON.stringify(body.context || {}).slice(0, 4000);
      const reply = await openrouter([{ role: 'system', content: `${COACH_SYSTEM}\n\nCONTEXT: ${context}` }, ...history]);
      return res.status(200).json({ reply: reply.trim() });
    }

    if (body.mode === 'parse') {
      const text = String(body.text || '').slice(0, 500).trim();
      if (!text) return res.status(400).json({ error: 'text required' });
      const out = await openrouter([
        { role: 'system', content: `Estimate nutrition for foods the user describes. ${ITEM_SCHEMA}` },
        { role: 'user', content: text },
      ], { json: true });
      return res.status(200).json({ items: cleanItems(out) });
    }

    if (body.mode === 'photo') {
      const image = String(body.image || '');
      if (!/^data:image\/(jpeg|png|webp);base64,/.test(image) || image.length > MAX_IMAGE_CHARS) {
        return res.status(400).json({ error: 'Send a JPEG/PNG/WebP under ~1 MB' });
      }
      const hint = String(body.hint || '').slice(0, 200);
      const out = await openrouter([
        { role: 'system', content: `Identify every food and drink in the photo and estimate portions. If nothing edible is visible return {"items":[]}. ${ITEM_SCHEMA}` },
        {
          role: 'user',
          content: [
            { type: 'text', text: hint ? `User note: ${hint}` : 'What is on this plate?' },
            { type: 'image_url', image_url: { url: image } },
          ],
        },
      ], { json: true, maxTokens: 900 });
      return res.status(200).json({ items: cleanItems(out) });
    }

    return res.status(400).json({ error: 'Unknown mode' });
  } catch (err) {
    return res.status(502).json({ error: 'AI request failed' });
  }
}
