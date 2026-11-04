// Finds poses where body parts pass through each other or through equipment,
// using the real skinned anatomy mesh (same maths as the app's SkinnedMesh).
// Usage: node tools/anatomy/clash-report.mjs [exercise-id ...] [--json]
import { EXERCISES } from '../../src/data/exercises.js';
import { analyse, clashes, meta, P } from './clash.mjs';

if (process.env.BASELINE) {
  console.log('baseline (untouched anatomy):', clashes({ J: meta.joints }, P));
  process.exit(0);
}
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const json = process.argv.includes('--json');
const report = {};
for (const ex of EXERCISES.filter((e) => !only.length || only.includes(e.id))) {
  const r = analyse(ex);
  report[ex.id] = r;
  const bad = Object.entries(r.body).filter(([, w]) => w.c >= 12).map(([k, w]) => `${k} +${w.c}@${w.t}`);
  for (const [k, p] of Object.entries(r.props)) if (p.depth >= 1) bad.push(`prop${k} depth ${p.depth} push ${p.push.join(',')} @${p.t}`);
  if (!json) console.log(`${ex.id.padEnd(20)} ${bad.length ? bad.join(', ') : 'ok'}`);
}
if (json) console.log(JSON.stringify(report));
