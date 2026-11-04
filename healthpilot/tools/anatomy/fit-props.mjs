// Moves benches, seats and pads just clear of the real anatomy.
// Each box moves along its own normal, away from the body's centre, one unit at a
// time until nothing cuts into it. Prints { exerciseId: newPropsArray } for the
// exercises whose equipment moved. Usage: node tools/anatomy/fit-props.mjs [ids…]
import { EXERCISES } from '../../src/data/exercises.js';
import { rig, v } from '../../src/lib/rig3d.js';
import { analyse, centreX, skin } from './clash.mjs';

const round = (q) => Math.round(q * 10) / 10;
const only = process.argv.slice(2);
const out = {};
for (const ex of EXERCISES.filter((e) => (!only.length || only.includes(e.id)) && e.props.some((p) => p.t === 'line' && p.kind !== 'bar'))) {
  const props = JSON.parse(JSON.stringify(ex.props));
  const probe = { ...ex, props };
  const ox = centreX(ex);
  // Body centre (2-D app coordinates) over the rep.
  let cx = 0; let cy = 0; let m = 0;
  for (const t of [0, 0.5, 1]) {
    const S = skin(rig(ex, t, ox));
    for (let i = 0; i < S.length; i += 3) { cx += S[i] + ox; cy += 241 - S[i + 1]; m += 1; }
  }
  cx /= m; cy /= m;
  const dirOf = {};
  for (let pass = 0; pass < 40; pass += 1) {
    const hits = Object.values(analyse(probe, 6).props).filter((h) => h.depth >= 0.8);
    if (!hits.length) break;
    for (const h of new Map(hits.map((x) => [x.prop, x])).values()) {
      const pr = props[h.prop];
      if (!dirOf[h.prop]) {
        const [a, b] = [pr.pts[0], pr.pts[pr.pts.length - 1]];
        const ux = v.norm([b[0] - a[0], b[1] - a[1], 0]); const n2 = [-ux[1], ux[0]];
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const away = (mid[0] - cx) * n2[0] + (mid[1] - cy) * n2[1];
        dirOf[h.prop] = away >= 0 ? n2 : [-n2[0], -n2[1]];
      }
      const [dx, dy] = dirOf[h.prop];
      const xs = pr.pts.map((q) => q[0]); const ys = pr.pts.map((q) => q[1]);
      pr.pts = pr.pts.map(([x, y]) => [round(x + dx), round(y + dy)]);
      // Keep legs attached: thin posts whose top end touched the box follow it.
      props.forEach((o, oi) => {
        if (oi === h.prop || o.t !== 'line' || o.w > 6 || o.kind) return;
        o.pts = o.pts.map(([x, y], k) => (k === 0 && x >= Math.min(...xs) - 2 && x <= Math.max(...xs) + 2 && y >= Math.min(...ys) - 8 && y <= Math.max(...ys) + 8 ? [round(x + dx), round(y + dy)] : [x, y]));
      });
    }
  }
  if (JSON.stringify(props) !== JSON.stringify(ex.props)) out[ex.id] = props;
}
console.log(JSON.stringify(out));
