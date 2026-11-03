/**
 * Optional AI layer (served by /api/coach). Every AI feature has an offline
 * fallback, so the app stays fully usable when the key isn't configured.
 */
const post = (url, body) => fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

async function call(body) {
  const base = import.meta.env.BASE_URL;
  // api/coach → Vercel function or .htaccess rewrite; api/coach.php → plain PHP hosting.
  let res = await post(`${base}api/coach`, body);
  if (res.status === 404 || res.status === 405) res = await post(`${base}api/coach.php`, body);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `AI unavailable (${res.status})`);
  return data;
}

/** Photo → [{name, serving, qty, kcal, p, c, f, fib}] (per-serving values). */
export const analysePhoto = (image, hint = '') => call({ mode: 'photo', image, hint }).then((d) => d.items || []);

/** Free-text foods the offline DB didn't recognise → estimated nutrients. */
export const estimateFoods = (text) => call({ mode: 'parse', text }).then((d) => d.items || []);

export const askCoach = (messages, context) => call({ mode: 'chat', messages, context }).then((d) => d.reply);

/** Downscale a photo client-side so uploads stay small (~100 KB). */
export function fileToDataUrl(file, maxSide = 768) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = reject;
    img.src = url;
  });
}
