/**
 * JobPilot — AI Proxy
 * POST /api/ai
 *
 * Server-side proxy for OpenRouter API calls.
 * Users never see the API key — it lives in Vercel env vars.
 *
 * Model routing (meta-prompting architecture):
 *   tier = primary → qwen/qwq-32b         (Qwen3.7-Max, best quality)
 *   tier = batch   → deepseek/deepseek-chat (DeepSeek V3, cheap + fast)
 *   tier = local   → openai/gpt-4o-mini    (fallback, always available)
 *
 * Rate limiting: 30 calls/min per IP (via Upstash Redis if configured)
 * Cost control:  max_tokens = 2000 per call
 * Fallback:      if primary model fails → auto-retries with gpt-4o-mini
 */

const MODEL_TIERS = {
  primary: 'qwen/qwq-32b',
  batch:   'deepseek/deepseek-chat',
  local:   'openai/gpt-4o-mini',
};
const FALLBACK_MODEL = 'openai/gpt-4o-mini';

/* Simple in-memory rate limiter (resets per cold start) */
const ipCounts = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const window = 60_000; // 1 minute
  const limit  = 30;
  const entry  = ipCounts.get(ip) || { count: 0, start: now };
  if (now - entry.start > window) {
    ipCounts.set(ip, { count: 1, start: now });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  ipCounts.set(ip, entry);
  return true;
}

async function callOpenRouter(model, sys, usr, apiKey) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://jobpilot.app',
      'X-Title': 'JobPilot v2',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: sys },
        { role: 'user',   content: usr },
      ],
      temperature: 0.15,
      max_tokens: 2000,
    }),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'OpenRouter error');
  return data.choices?.[0]?.message?.content || '';
}

export default async function handler(req, res) {
  /* CORS preflight */
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  /* Rate limiting */
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'anonymous';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Please wait a moment.' });
  }

  /* Parse body */
  const { sys, usr, tier = 'primary' } = req.body || {};
  if (!sys?.trim() || !usr?.trim()) {
    return res.status(400).json({ error: 'sys and usr are required' });
  }

  /* Check API key */
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Server not configured — add OPENROUTER_API_KEY to Vercel env vars' });
  }

  /* Try primary model, auto-fallback to gpt-4o-mini */
  const primaryModel = MODEL_TIERS[tier] || MODEL_TIERS.primary;

  for (const model of [primaryModel, FALLBACK_MODEL]) {
    try {
      const content = await callOpenRouter(model, sys, usr, apiKey);
      return res.status(200).json({ content, model });
    } catch (err) {
      const msg = String(err?.message || err);
      const isModelErr =
        msg.includes('not a valid model') ||
        msg.includes('model_not_found') ||
        msg.includes('No endpoints');

      if (isModelErr && model !== FALLBACK_MODEL) {
        console.warn(`[JobPilot AI] ${model} unavailable → retrying with ${FALLBACK_MODEL}`);
        continue;
      }
      console.error(`[JobPilot AI] Error (${model}):`, msg);
      return res.status(502).json({ error: msg });
    }
  }

  return res.status(503).json({ error: 'All AI models unavailable' });
}
