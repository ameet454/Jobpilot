// Receives images rendered by render-assets.html and writes them into public/.
// Usage: node tools/body/save-server.mjs   (listens on 127.0.0.1:5174)
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = resolve(dirname(fileURLToPath(import.meta.url)), '../../public');
const SAFE = /^(thumbs|body)\/[a-z0-9-]+\.(webp|png|json)$/;

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Headers', '*'); res.end(); return; }
  const name = new URL(req.url, 'http://x').searchParams.get('name') || '';
  if (req.method !== 'POST' || !SAFE.test(name)) { res.statusCode = 400; res.end('bad name'); return; }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString();
    const data = body.startsWith('data:') ? Buffer.from(body.split(',')[1], 'base64') : Buffer.from(body);
    const out = join(PUBLIC, name);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, data);
    console.log('saved', name, data.length);
    res.end('ok');
  });
}).listen(5174, '127.0.0.1', () => console.log('save server on http://127.0.0.1:5174'));
