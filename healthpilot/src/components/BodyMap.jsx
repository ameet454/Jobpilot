import { MUSCLES } from '../data/exercises.js';
import { MUSCLE_COLOR } from './ExerciseFigure.jsx';

/*
 * Front and back body outlines made of simple shapes, one group per muscle.
 * Three modes:
 *   roles   { chest: 'primary', triceps: 'secondary' }  → red / orange like the animation
 *   heat    { chest: 0..1 }                              → weekly training heat map
 *   onPick  (muscle) => void                             → tap a muscle to filter
 */
const E = (cx, cy, rx, ry, rot = 0) => ({ cx, cy, rx, ry, rot });
const pair = (cx, cy, rx, ry, rot = 0) => [E(60 - cx, cy, rx, ry, -rot), E(60 + cx, cy, rx, ry, rot)];

const FRONT = {
  shoulders: pair(23, 52, 9, 10),
  chest: pair(11, 63, 11, 8.5),
  biceps: pair(29, 79, 5.5, 12, 8),
  forearms: pair(34, 106, 5, 13, 10),
  abs: [E(60, 92, 9, 20)],
  quads: pair(10, 150, 8.5, 24, -3),
  calves: pair(11, 201, 5.5, 15, -2),
};
const BACK = {
  traps: [E(60, 54, 15, 8)],
  shoulders: pair(23, 52, 9, 10),
  lats: pair(12, 78, 9, 17, -12),
  triceps: pair(29, 79, 5.5, 12, 8),
  forearms: pair(34, 106, 5, 13, 10),
  lowerback: [E(60, 104, 8, 9)],
  glutes: pair(9, 128, 10, 10),
  hamstrings: pair(10, 160, 8, 22, -3),
  calves: pair(11, 199, 6.5, 15, -2),
};

function Silhouette() {
  return (
    <g className="bm-base">
      <circle cx="60" cy="20" r="12" />
      <rect x="54" y="30" width="12" height="10" rx="3" />
      <path d="M36 44 Q60 36 84 44 L82 118 Q60 128 38 118 Z" />
      {[-1, 1].map((s) => (
        <g key={s} transform={s < 0 ? 'translate(120 0) scale(-1 1)' : undefined}>
          <path d="M80 46 Q92 50 92 64 L96 120 Q94 124 88 122 L80 70 Z" />
          <path d="M60 120 L82 118 L76 226 L66 226 Z" />
        </g>
      ))}
    </g>
  );
}

function View({ shapes, label, colorFor, onPick }) {
  return (
    <figure className="bm-view">
      <svg viewBox="0 0 120 232" role="img" aria-label={`${label} view`}>
        <Silhouette />
        {Object.entries(shapes).map(([id, ells]) => {
          const fill = colorFor(id);
          return (
            <g key={id} className={`bm-muscle ${onPick ? 'pickable' : ''}`} onClick={onPick ? () => onPick(id) : undefined}
              role={onPick ? 'button' : undefined} aria-label={onPick ? MUSCLES[id].label : undefined} tabIndex={onPick ? 0 : undefined}
              onKeyDown={onPick ? (e) => (e.key === 'Enter' || e.key === ' ') && onPick(id) : undefined}>
              <title>{MUSCLES[id].label}</title>
              {ells.map((e, i) => (
                <ellipse key={i} cx={e.cx} cy={e.cy} rx={e.rx} ry={e.ry} transform={`rotate(${e.rot} ${e.cx} ${e.cy})`} style={{ fill: fill.color, opacity: fill.opacity }} />
              ))}
            </g>
          );
        })}
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

/**
 * Heat colour for v = weekly sets ÷ 10: grey (untrained) → blue (under 5 sets)
 * → green (5–20 sets, deeper green as it nears 10+) → red (over 20 sets).
 */
export function heatColor(v) {
  if (!v) return { color: 'var(--track)', opacity: 1 };
  if (v < 0.5) return { color: '#60a5fa', opacity: 0.55 + v };
  if (v <= 2) return { color: '#22c55e', opacity: Math.min(1, 0.6 + 0.4 * v) };
  return { color: '#ef4444', opacity: 0.9 };
}

export default function BodyMap({ roles, heat, selected, onPick }) {
  const colorFor = (id) => {
    if (roles) return roles[id] ? { color: MUSCLE_COLOR[roles[id]], opacity: 0.9 } : { color: 'var(--track)', opacity: 1 };
    if (heat) return heatColor(heat[id]);
    if (selected) return id === selected ? { color: MUSCLE_COLOR.primary, opacity: 0.9 } : { color: 'var(--track)', opacity: 1 };
    return { color: 'var(--track)', opacity: 1 };
  };
  return (
    <div className="bodymap">
      <View shapes={FRONT} label="Front" colorFor={colorFor} onPick={onPick} />
      <View shapes={BACK} label="Back" colorFor={colorFor} onPick={onPick} />
    </div>
  );
}
