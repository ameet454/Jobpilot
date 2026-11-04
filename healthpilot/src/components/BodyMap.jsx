import { useCallback, useEffect, useRef, useState } from 'react';
import { MUSCLES } from '../data/exercises.js';
import { MUSCLE_COLOR } from './ExerciseFigure.jsx';

/*
 * Front and back views of the 3-D body, pre-rendered by
 * tools/body/render-assets.html as two images per view:
 *   map-<view>-shade.webp  the lit body
 *   map-<view>-id.png      each muscle head painted a flat code colour (red channel = index × step)
 * Here every pixel is recoloured by what that muscle head means right now.
 *
 * Modes:
 *   roles(key) => 'primary' | 'secondary' | …  red / orange, like the 3-D trainer
 *   heat       { chest: 0..2 }                  weekly training heat map (sets ÷ 10)
 *   selected + onPick(muscle)                   tap a muscle to filter
 */
const BASE = `${import.meta.env.BASE_URL}body/`;
let assets = null;

function loadImage(src) {
  return new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; });
}
function pixels(img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  return g.getImageData(0, 0, c.width, c.height);
}
function loadAssets() {
  if (!assets) {
    assets = Promise.all([
      fetch(`${BASE}map.json`).then((r) => r.json()),
      ...['front', 'back'].flatMap((v) => [loadImage(`${BASE}map-${v}-shade.webp`), loadImage(`${BASE}map-${v}-id.png`)]),
    ]).then(([meta, fs, fi, bs, bi]) => ({ meta, front: { shade: pixels(fs), id: pixels(fi) }, back: { shade: pixels(bs), id: pixels(bi) } }))
      .catch((e) => { assets = null; throw e; });
  }
  return assets;
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const RED = hex(MUSCLE_COLOR.primary);
const ORANGE = hex(MUSCLE_COLOR.secondary);

/**
 * Heat colour for v = weekly sets ÷ 10: none (untrained) → blue (under 5 sets)
 * → green (5–20 sets, deeper as it nears 10+) → red (over 20 sets).
 */
export function heatColor(v) {
  if (!v) return null;
  if (v < 0.5) return { rgb: [96, 165, 250], a: 0.55 + v };
  if (v <= 2) return { rgb: [34, 197, 94], a: Math.min(1, 0.6 + 0.4 * v) };
  return { rgb: [239, 68, 68], a: 0.9 };
}

function keyAt(view, meta, x, y) {
  const { id } = view;
  const i = (Math.floor(y) * id.width + Math.floor(x)) * 4;
  if (id.data[i + 3] < 128) return null;
  const k = Math.round(id.data[i] / meta.step) - 1;
  return meta.keys[k] || null;
}

function View({ name, data, colorFor, onPick, label }) {
  const canvas = useRef(null);
  const [hover, setHover] = useState(null);
  const view = data[name];

  useEffect(() => {
    const { shade, id } = view;
    const W = shade.width; const H = shade.height; const n = W * H;
    // 1. Tint layer from the muscle-ID image.
    const tint = new Float32Array(n * 4); // r, g, b, alpha
    const cache = new Map();
    for (let p = 0; p < n; p += 1) {
      const i = p * 4;
      if (!shade.data[i + 3] || id.data[i + 3] < 128) continue;
      const key = data.meta.keys[Math.round(id.data[i] / data.meta.step) - 1];
      if (!key) continue;
      if (!cache.has(key)) cache.set(key, colorFor(key, key.split('.')[0] === hover));
      const c = cache.get(key);
      if (!c) continue;
      tint[i] = c.rgb[0] * c.a; tint[i + 1] = c.rgb[1] * c.a; tint[i + 2] = c.rgb[2] * c.a; tint[i + 3] = c.a;
    }
    // 2. Soften the edges (two passes of a 5-px box blur, premultiplied), so regions read as smooth
    //    patches of colour on the skin instead of jagged pixel islands.
    const tmp = new Float32Array(n * 4);
    const blur = (src, dst, dx, dy) => {
      const R = 2;
      for (let y = 0; y < H; y += 1) {
        for (let x = 0; x < W; x += 1) {
          let r = 0; let g = 0; let b = 0; let a = 0; let cnt = 0;
          for (let k = -R; k <= R; k += 1) {
            const xx = x + k * dx; const yy = y + k * dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const j = (yy * W + xx) * 4;
            r += src[j]; g += src[j + 1]; b += src[j + 2]; a += src[j + 3]; cnt += 1;
          }
          const o = (y * W + x) * 4;
          dst[o] = r / cnt; dst[o + 1] = g / cnt; dst[o + 2] = b / cnt; dst[o + 3] = a / cnt;
        }
      }
    };
    if (cache.size) for (let pass = 0; pass < 2; pass += 1) { blur(tint, tmp, 1, 0); blur(tmp, tint, 0, 1); }
    // 3. Composite: tint keeps the skin's shading (blend shade with shade × colour).
    const out = new ImageData(W, H);
    for (let p = 0; p < n; p += 1) {
      const i = p * 4;
      const a0 = shade.data[i + 3];
      let r = shade.data[i]; let g = shade.data[i + 1]; let b = shade.data[i + 2];
      const ta = a0 ? Math.min(1, tint[i + 3]) : 0;
      if (ta > 0.01) {
        const L = ((r + g + b) / 765) * 1.3;
        const cr = tint[i] / tint[i + 3]; const cg = tint[i + 1] / tint[i + 3]; const cb = tint[i + 2] / tint[i + 3];
        r += (Math.min(255, cr * L) - r) * ta;
        g += (Math.min(255, cg * L) - g) * ta;
        b += (Math.min(255, cb * L) - b) * ta;
      }
      out.data[i] = r; out.data[i + 1] = g; out.data[i + 2] = b; out.data[i + 3] = a0;
    }
    const cv = canvas.current;
    cv.width = shade.width; cv.height = shade.height;
    cv.getContext('2d').putImageData(out, 0, 0);
  }, [view, colorFor, hover, data.meta]);

  const at = (e) => {
    const rect = canvas.current.getBoundingClientRect();
    return keyAt(view, data.meta, ((e.clientX - rect.left) / rect.width) * view.id.width, ((e.clientY - rect.top) / rect.height) * view.id.height);
  };
  return (
    <figure className="bm-view">
      <canvas
        ref={canvas}
        className={onPick ? 'pickable' : undefined}
        role="img"
        aria-label={`${label} view of the body`}
        onClick={onPick ? (e) => { const k = at(e); if (k) onPick(k.split('.')[0]); } : undefined}
        onPointerMove={onPick ? (e) => { const k = at(e); setHover(k ? k.split('.')[0] : null); } : undefined}
        onPointerLeave={onPick ? () => setHover(null) : undefined}
      />
      <figcaption>{hover ? MUSCLES[hover]?.label : label}</figcaption>
    </figure>
  );
}

export default function BodyMap({ roles, heat, selected, onPick }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { let live = true; loadAssets().then((d) => live && setData(d), () => live && setFailed(true)); return () => { live = false; }; }, []);

  const colorFor = useCallback((key, hovered) => {
    const m = key.split('.')[0];
    if (roles) {
      const r = roles(key);
      return r === 'primary' ? { rgb: RED, a: 0.92 } : r === 'secondary' ? { rgb: ORANGE, a: 0.85 } : null;
    }
    if (heat) return heatColor(heat[m]) || (hovered ? { rgb: RED, a: 0.35 } : null);
    if (selected === m) return { rgb: RED, a: 0.9 };
    return hovered ? { rgb: RED, a: 0.4 } : null;
  }, [roles, heat, selected]);

  if (failed) return null;
  if (!data) return <div className="bodymap loading" aria-busy="true" />;
  return (
    <div className="bodymap">
      <View name="front" label="Front" data={data} colorFor={colorFor} onPick={onPick} />
      <View name="back" label="Back" data={data} colorFor={colorFor} onPick={onPick} />
    </div>
  );
}
