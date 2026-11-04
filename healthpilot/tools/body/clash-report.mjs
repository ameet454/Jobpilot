// Usage: node tools/body/clash-report.mjs [exercise-id ...]
import { EXERCISES } from '../../src/data/exercises.js';
import { analyse, BASE } from './clash.mjs';

const only = process.argv.slice(2);
console.log('baseline (arms resting on the ribs):', BASE);
for (const ex of EXERCISES.filter((e) => !only.length || only.includes(e.id))) {
  const r = analyse(ex);
  const bad = Object.entries(r.body).filter(([, w]) => w.c >= 12).map(([k, w]) => `${k} +${w.c}@${w.t}`);
  for (const [k, p] of Object.entries(r.props)) if (p.depth >= 1) bad.push(`prop${k} depth ${p.depth} push ${p.push.join(',')} @${p.t}`);
  if (r.floor.depth >= 1.5) bad.push(`floor ${r.floor.depth}@${r.floor.t}`);
  console.log(`${ex.id.padEnd(22)} ${bad.length ? bad.join(', ') : 'ok'}`);
}
