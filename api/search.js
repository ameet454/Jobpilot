/**
 * JobPilot — Job Search Proxy
 * POST /api/search
 *
 * Server-side proxy for JSearch (RapidAPI).
 * Aggregates real jobs from LinkedIn, Indeed, Glassdoor.
 * RapidAPI key is server-side — users never see it.
 *
 * Graceful degradation: returns [] if JSEARCH_API_KEY not set.
 * Rate limiting: 10 searches/min per IP
 */

const ipCounts = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const window = 60_000;
  const limit  = 10;
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

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'anonymous';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ jobs: [], error: 'Rate limit exceeded' });
  }

  const { query, location = 'India', page = 1 } = req.body || {};
  if (!query?.trim()) {
    return res.status(400).json({ jobs: [], error: 'query is required' });
  }

  /* Graceful degradation — no key = only company board jobs (Greenhouse) */
  const apiKey = process.env.JSEARCH_API_KEY;
  if (!apiKey) {
    return res.status(200).json({ jobs: [], source: 'no_key', message: 'Add JSEARCH_API_KEY for LinkedIn/Indeed jobs' });
  }

  const searchQuery = `${query} ${location} India`.trim();
  const url =
    `https://jsearch.p.rapidapi.com/search?` +
    `query=${encodeURIComponent(searchQuery)}` +
    `&num_pages=2&date_posted=month&country=in&page=${page}`;

  try {
    const r = await fetch(url, {
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
      },
    });

    if (r.status === 429) {
      return res.status(429).json({ jobs: [], error: 'JSearch rate limit — try again shortly' });
    }
    if (!r.ok) {
      return res.status(200).json({ jobs: [], error: `JSearch HTTP ${r.status}` });
    }

    const data = await r.json();
    return res.status(200).json({
      jobs: data.data || [],
      total: data.status?.total_count || 0,
    });
  } catch (err) {
    console.error('[JobPilot Search]', err?.message || err);
    return res.status(200).json({ jobs: [], error: String(err?.message || 'Search unavailable') });
  }
}
