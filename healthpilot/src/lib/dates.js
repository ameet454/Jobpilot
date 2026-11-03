const pad = (n) => String(n).padStart(2, '0');

/** Local-time YYYY-MM-DD key (never UTC — avoids IST midnight bugs). */
export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/** Last n day keys ending at `end` (inclusive), oldest first. */
export function lastNDays(n, end = dateKey()) {
  return Array.from({ length: n }, (_, i) => addDays(end, i - (n - 1)));
}

export function daysBetween(a, b) {
  return Math.round((parseKey(b) - parseKey(a)) / 86_400_000);
}

export function prettyDay(key, today = dateKey()) {
  if (key === today) return 'Today';
  if (key === addDays(today, -1)) return 'Yesterday';
  if (key === addDays(today, 1)) return 'Tomorrow';
  return parseKey(key).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function shortDay(key) {
  return parseKey(key).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function mealForHour(h = new Date().getHours()) {
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 19) return 'snacks';
  return 'dinner';
}

export function fmtDuration(ms) {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${pad(m)}m`;
}
