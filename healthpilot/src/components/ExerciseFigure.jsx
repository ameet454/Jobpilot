import { useEffect, useRef, useState } from 'react';
import { blendPose, repPhase, solvePose, STAGE_LABEL, STAGE_LOAD } from '../lib/pose.js';

export const MUSCLE_COLOR = { primary: '#ef4444', secondary: '#f59e0b' };

const W = { torso: 28, ua: 13, fa: 11, th: 19, sh: 14, foot: 7 };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (v) => Math.hypot(v[0], v[1]) || 1;
const at = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const mirrorX = (p, cx) => [2 * cx - p[0], p[1]];
const mirrorA = (a) => 180 - a;

/* Where each muscle sits on a side-view segment: which side (front/back), how far along, how thick. */
const SIDE_MAP = {
  chest: { seg: 'torso', side: 1, t: [0.62, 0.88], w: 12 },
  abs: { seg: 'torso', side: 1, t: [0.12, 0.55], w: 9 },
  lats: { seg: 'torso', side: -1, t: [0.42, 0.82], w: 13 },
  traps: { seg: 'torso', side: -1, t: [0.86, 1.0], w: 9 },
  lowerback: { seg: 'torso', side: -1, t: [0.05, 0.38], w: 9 },
  biceps: { seg: 'ua', side: 1, t: [0.15, 0.8], w: 7 },
  triceps: { seg: 'ua', side: -1, t: [0.15, 0.85], w: 7 },
  forearms: { seg: 'fa', side: 0, t: [0.08, 0.65], w: 8 },
  quads: { seg: 'th', side: 1, t: [0.1, 0.85], w: 10 },
  hamstrings: { seg: 'th', side: -1, t: [0.15, 0.85], w: 9 },
  calves: { seg: 'sh', side: -1, t: [0.08, 0.55], w: 9 },
};

function segments(j, far = false) {
  const s = far ? j.far : j;
  return { torso: [j.hip, j.neck], ua: [j.neck, s.elbow], fa: [s.elbow, s.hand], th: [j.hip, s.knee], sh: [s.knee, s.ankle], foot: [s.ankle, s.toe] };
}

/** Normal pointing to the "front" of a segment (chest side of torso, quad side of thigh). */
function frontNormal(seg, a, b, prone) {
  const v = sub(b, a); const l = len(v);
  const n = seg === 'torso' ? [-v[1] / l, v[0] / l] : [v[1] / l, -v[0] / l];
  return prone ? [-n[0], -n[1]] : n;
}

function sideMuscle(id, segs, prone) {
  if (id === 'shoulders') return { kind: 'circle', c: segs.ua[0], r: 9 };
  if (id === 'glutes') {
    const [a, b] = segs.torso; const n = frontNormal('torso', a, b, prone);
    return { kind: 'circle', c: [a[0] - n[0] * 8, a[1] - n[1] * 8], r: 10.5 };
  }
  const m = SIDE_MAP[id]; if (!m) return null;
  const [a, b] = segs[m.seg];
  const n = frontNormal(m.seg, a, b, prone);
  const off = m.side * (W[m.seg] / 2 - m.w / 2 + 1);
  const p0 = at(a, b, m.t[0]); const p1 = at(a, b, m.t[1]);
  return { kind: 'line', a: [p0[0] + n[0] * off, p0[1] + n[1] * off], b: [p1[0] + n[0] * off, p1[1] + n[1] * off], w: m.w };
}

const centre = (m) => (m.kind === 'line' ? at(m.a, m.b, 0.5) : m.c);

function Muscle({ m, color, opacity }) {
  if (!m) return null;
  if (m.kind === 'circle') return <circle cx={m.c[0]} cy={m.c[1]} r={m.r} fill={color} opacity={opacity} />;
  if (m.kind === 'ellipse') return <ellipse cx={m.c[0]} cy={m.c[1]} rx={m.rx} ry={m.ry} fill={color} opacity={opacity} />;
  return <line x1={m.a[0]} y1={m.a[1]} x2={m.b[0]} y2={m.b[1]} stroke={color} strokeWidth={m.w} strokeLinecap="round" opacity={opacity} />;
}

const Seg = ({ a, b, w, cls = 'fig-body' }) => (
  <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} strokeWidth={w} strokeLinecap="round" className={cls} />
);

/* ── Front view (lateral raise, cable fly) ───────────────────────────── */
function frontJoints(p) {
  const j = solvePose(p);
  const cx = j.hip[0];
  const shR = [j.neck[0] + 20, j.neck[1] + 6];
  const hipR = [j.hip[0] + 10, j.hip[1]];
  const armR = solvePose({ ...p, anchor: 'hip', at: shR, torso: 0 });
  const elbow = armR.elbow && [shR[0] + (armR.elbow[0] - armR.neck[0]), shR[1] + (armR.elbow[1] - armR.neck[1])];
  const hand = [elbow[0] + (armR.hand[0] - armR.elbow[0]), elbow[1] + (armR.hand[1] - armR.elbow[1])];
  const legR = solvePose({ ...p, anchor: 'hip', at: hipR });
  return {
    cx, neck: j.neck, hip: j.hip, head: [j.neck[0], j.neck[1] - 21],
    shR, elbowR: elbow, handR: hand, hipR, kneeR: legR.knee, ankleR: legR.ankle,
    shL: mirrorX(shR, cx), elbowL: mirrorX(elbow, cx), handL: mirrorX(hand, cx), hipL: mirrorX(hipR, cx), kneeL: mirrorX(legR.knee, cx), ankleL: mirrorX(legR.ankle, cx),
  };
}

function frontMuscles(id, j) {
  const { cx, neck, hip } = j;
  const both = (fn) => [fn('R'), fn('L')];
  switch (id) {
    case 'chest': return [{ kind: 'ellipse', c: [cx + 10, neck[1] + 17], rx: 10, ry: 8 }, { kind: 'ellipse', c: [cx - 10, neck[1] + 17], rx: 10, ry: 8 }];
    case 'abs': return [{ kind: 'line', a: [cx, neck[1] + 32], b: [cx, hip[1] - 8], w: 14 }];
    case 'lats': return [{ kind: 'ellipse', c: [cx + 18, neck[1] + 30], rx: 5, ry: 13 }, { kind: 'ellipse', c: [cx - 18, neck[1] + 30], rx: 5, ry: 13 }];
    case 'traps': return [{ kind: 'ellipse', c: [cx + 10, neck[1] + 1], rx: 8, ry: 4 }, { kind: 'ellipse', c: [cx - 10, neck[1] + 1], rx: 8, ry: 4 }];
    case 'shoulders': return both((s) => ({ kind: 'circle', c: j[`sh${s}`], r: 9 }));
    case 'biceps': case 'triceps': return both((s) => ({ kind: 'line', a: at(j[`sh${s}`], j[`elbow${s}`], 0.2), b: at(j[`sh${s}`], j[`elbow${s}`], 0.8), w: 8 }));
    case 'forearms': return both((s) => ({ kind: 'line', a: at(j[`elbow${s}`], j[`hand${s}`], 0.1), b: at(j[`elbow${s}`], j[`hand${s}`], 0.65), w: 8 }));
    case 'quads': return both((s) => ({ kind: 'line', a: at(j[`hip${s}`], j[`knee${s}`], 0.15), b: at(j[`hip${s}`], j[`knee${s}`], 0.85), w: 12 }));
    case 'calves': return both((s) => ({ kind: 'line', a: at(j[`knee${s}`], j[`ankle${s}`], 0.1), b: at(j[`knee${s}`], j[`ankle${s}`], 0.55), w: 9 }));
    default: return [];
  }
}

/* ── Props (barbell, bench, cable…) ──────────────────────────────────── */
function propPoint(j, name, front) {
  if (front) return { hand: j.handR, handL: j.handL, neck: j.neck, hip: j.hip }[name];
  return { hand: j.hand, neck: j.neck, hip: j.hip, ankle: j.ankle, toe: j.toe }[name];
}

function Prop({ p, j, front }) {
  if (p.t === 'line') return <polyline points={p.pts.map((q) => q.join(',')).join(' ')} strokeWidth={p.w} className="fig-prop" strokeLinecap="round" fill="none" />;
  const pt = propPoint(j, p.at, front) || (p.to && propPoint(j, p.to, front));
  if (!pt) return null;
  const x = pt[0] + (p.dx || 0); const y = pt[1] + (p.dy || 0);
  switch (p.t) {
    case 'barbell': return <g><circle cx={x} cy={y} r={p.r || 17} className="fig-plate" /><circle cx={x} cy={y} r={3.5} className="fig-hub" /></g>;
    case 'dumbbell': return <rect x={x - 9} y={y - 5} width={18} height={10} rx={3} className="fig-plate" />;
    case 'grip': return <circle cx={x} cy={y} r={4} className="fig-plate" />;
    case 'pad': return <circle cx={x} cy={y} r={8} className="fig-pad" />;
    case 'sled': {
      const a = (p.angle * Math.PI) / 180; const dx = Math.cos(a) * 24; const dy = Math.sin(a) * 24;
      return <line x1={x - dx} y1={y - dy} x2={x + dx} y2={y + dy} strokeWidth={8} strokeLinecap="round" className="fig-prop" />;
    }
    case 'cable': return <g><line x1={p.from[0]} y1={p.from[1]} x2={x} y2={y} className="fig-cable" /><circle cx={p.from[0]} cy={p.from[1]} r={5} className="fig-prop-fill" /></g>;
    default: return null;
  }
}

/* ── Framing: crop the view to where the body and equipment actually go ── */
const boundsCache = new WeakMap();
function figureBox(ex) {
  if (boundsCache.has(ex)) return boundsCache.get(ex);
  const pts = [];
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const p = blendPose(ex.A, ex.B, t);
    if (ex.view === 'front') pts.push(...Object.values(frontJoints(p)).filter(Array.isArray));
    else { const j = solvePose(p); pts.push(j.hip, j.neck, j.head, j.elbow, j.hand, j.knee, j.ankle, j.toe, ...Object.values(j.far)); }
  }
  for (const pr of ex.props) {
    if (pr.pts) pts.push(...pr.pts);
    if (pr.from) pts.push(pr.from);
  }
  if (!ex.noFloor) pts.push([pts[0][0], 241]);
  const pad = 24;
  let x0 = Math.min(...pts.map((q) => q[0])) - pad; let x1 = Math.max(...pts.map((q) => q[0])) + pad;
  let y0 = Math.min(...pts.map((q) => q[1])) - pad; let y1 = Math.max(...pts.map((q) => q[1])) + (ex.noFloor ? pad : 6);
  // Keep a landscape frame so tall and wide exercises look similar in size.
  const minW = (y1 - y0) * 1.15; if (x1 - x0 < minW) { const g = (minW - (x1 - x0)) / 2; x0 -= g; x1 += g; }
  const minH = (x1 - x0) * 0.62; if (y1 - y0 < minH) { y0 -= minH - (y1 - y0); }
  const box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  boundsCache.set(ex, box);
  return box;
}

/* ── The animated figure ─────────────────────────────────────────────── */
export function FigureSvg({ ex, t, load = 1, pulse = 0, compact = false }) {
  const pose = blendPose(ex.A, ex.B, t);
  const front = ex.view === 'front';
  const roles = [...ex.secondary.map((m) => [m, 'secondary']), ...ex.primary.map((m) => [m, 'primary'])];
  const glow = (role) => (role === 'primary' ? 0.45 + 0.55 * load * (0.85 + 0.15 * pulse) : 0.35 + 0.35 * load);
  const trace = ex.props.find((p) => ['barbell', 'dumbbell', 'grip'].includes(p.t));

  let body; let stress;
  if (front) {
    const j = frontJoints(pose);
    const torso = `M${j.cx - 24},${j.neck[1] + 2} L${j.cx + 24},${j.neck[1] + 2} L${j.cx + 15},${j.hip[1] + 6} L${j.cx - 15},${j.hip[1] + 6} Z`;
    const limbs = (s) => (
      <g key={s}>
        <Seg a={j[`hip${s}`]} b={j[`knee${s}`]} w={W.th} /><Seg a={j[`knee${s}`]} b={j[`ankle${s}`]} w={W.sh} />
        <Seg a={j[`sh${s}`]} b={j[`elbow${s}`]} w={W.ua} /><Seg a={j[`elbow${s}`]} b={j[`hand${s}`]} w={W.fa} />
      </g>
    );
    const ms = roles.flatMap(([id, role]) => frontMuscles(id, j).map((m, i) => ({ m, role, key: `${id}${i}` })));
    stress = ms.filter((x) => x.role === 'primary').map((x) => centre(x.m));
    body = (
      <g>
        <path d={torso} className="fig-body-fill" strokeLinejoin="round" />
        {limbs('R')}{limbs('L')}
        <circle cx={j.head[0]} cy={j.head[1]} r={12} className="fig-body-fill" />
        {ms.map(({ m, role, key }) => <Muscle key={key} m={m} color={MUSCLE_COLOR[role]} opacity={glow(role)} />)}
        {ex.props.map((p, i) => <Prop key={i} p={p} j={j} front />)}
      </g>
    );
  } else {
    const j = solvePose(pose);
    const near = segments(j); const far = segments(j, true);
    const nearMs = roles.map(([id, role]) => ({ m: sideMuscle(id, near, ex.prone), role, id }));
    const farMs = roles.filter(([id]) => !['chest', 'abs', 'lats', 'traps', 'lowerback', 'glutes'].includes(id)).map(([id, role]) => ({ m: sideMuscle(id, far, ex.prone), role, id }));
    stress = nearMs.filter((x) => x.role === 'primary' && x.m).map((x) => centre(x.m));
    const traceFrom = trace && propPoint(solvePose(ex.A), trace.at); const traceTo = trace && propPoint(solvePose(ex.B), trace.at);
    body = (
      <g>
        {trace && traceFrom && <line x1={traceFrom[0]} y1={traceFrom[1]} x2={traceTo[0]} y2={traceTo[1]} className="fig-trace" />}
        <g className="fig-far">
          <Seg a={far.th[0]} b={far.th[1]} w={W.th} /><Seg a={far.sh[0]} b={far.sh[1]} w={W.sh} /><Seg a={far.foot[0]} b={far.foot[1]} w={W.foot} />
          <Seg a={far.ua[0]} b={far.ua[1]} w={W.ua} /><Seg a={far.fa[0]} b={far.fa[1]} w={W.fa} />
          {farMs.map(({ m, role, id }) => <Muscle key={id} m={m} color={MUSCLE_COLOR[role]} opacity={glow(role) * 0.7} />)}
        </g>
        <Seg a={j.neck} b={j.head} w={9} />
        <circle cx={j.head[0]} cy={j.head[1]} r={12} className="fig-body-fill" />
        <Seg a={near.torso[0]} b={near.torso[1]} w={W.torso} />
        <Seg a={near.th[0]} b={near.th[1]} w={W.th} /><Seg a={near.sh[0]} b={near.sh[1]} w={W.sh} /><Seg a={near.foot[0]} b={near.foot[1]} w={W.foot} />
        {nearMs.filter((x) => SIDE_MAP[x.id]?.seg === 'torso' || ['glutes', 'quads', 'hamstrings', 'calves'].includes(x.id))
          .map(({ m, role, id }) => <Muscle key={id} m={m} color={MUSCLE_COLOR[role]} opacity={glow(role)} />)}
        <Seg a={near.ua[0]} b={near.ua[1]} w={W.ua} /><Seg a={near.fa[0]} b={near.fa[1]} w={W.fa} />
        {nearMs.filter((x) => ['shoulders', 'biceps', 'triceps', 'forearms'].includes(x.id))
          .map(({ m, role, id }) => <Muscle key={id} m={m} color={MUSCLE_COLOR[role]} opacity={glow(role)} />)}
        {ex.props.map((p, i) => <Prop key={i} p={p} j={j} />)}
      </g>
    );
  }

  const box = figureBox(ex);
  return (
    <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} className={`figure ${compact ? 'compact' : ''}`} role="img"
      aria-label={`${ex.name}: animated demonstration. Red shows ${ex.primary.join(', ')}.`}>
      {!ex.noFloor && <line x1={box.x} y1="241" x2={box.x + box.w} y2="241" className="fig-floor" />}
      {body}
      {!compact && stress.slice(0, 2).map((c, i) => (
        <circle key={i} cx={c[0]} cy={c[1]} r={13 + pulse * 5} className="fig-stress" opacity={0.25 + 0.5 * load} />
      ))}
    </svg>
  );
}

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Looping demo with play/pause, speed and a scrubber. */
export default function ExerciseFigure({ ex, compact = false }) {
  const [playing, setPlaying] = useState(() => !reduceMotion());
  const [speed, setSpeed] = useState(1);
  const [clock, setClock] = useState(0);
  const [scrub, setScrub] = useState(0.5);
  const last = useRef(null);

  useEffect(() => {
    if (!playing) return undefined;
    let raf;
    const tick = (now) => {
      if (last.current != null) setClock((c) => c + (now - last.current) * speed);
      last.current = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); last.current = null; };
  }, [playing, speed]);

  const phase = playing ? repPhase(clock, ex.tempo, ex.lift) : { t: scrub, stage: null };
  const load = phase.stage ? STAGE_LOAD[phase.stage] : 0.9;
  const pulse = (Math.sin(clock / 160) + 1) / 2;

  if (compact) return <FigureSvg ex={ex} t={phase.t} load={load} pulse={pulse} compact />;

  return (
    <div className="figure-wrap">
      <FigureSvg ex={ex} t={phase.t} load={load} pulse={pulse} />
      <div className={`stage ${phase.stage || ''}`} aria-live="off">
        {phase.stage ? STAGE_LABEL[phase.stage] : 'Paused — drag the slider to move through the rep'}
      </div>
      <div className="figure-controls">
        <button type="button" className="btn sm" onClick={() => setPlaying((p) => !p)}>{playing ? '⏸ Pause' : '▶ Play'}</button>
        {playing ? (
          <div className="segmented small">
            {[0.5, 1].map((s) => (
              <button key={s} type="button" className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>{s === 1 ? 'Normal' : 'Slow-mo'}</button>
            ))}
          </div>
        ) : (
          <input type="range" min="0" max="1" step="0.01" value={scrub} onChange={(e) => setScrub(Number(e.target.value))} aria-label="Move through the rep" className="grow" />
        )}
      </div>
      <div className="legend">
        <span><i style={{ background: MUSCLE_COLOR.primary }} /> Main muscle — feel the stress here</span>
        <span><i style={{ background: MUSCLE_COLOR.secondary }} /> Helping muscles</span>
      </div>
    </div>
  );
}
