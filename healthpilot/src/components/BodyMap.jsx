import { useCallback, useEffect, useRef, useState } from 'react';
import { MUSCLES } from '../data/exercises.js';
import { MUSCLE_COLOR } from './ExerciseFigure.jsx';

/*
 * Front and back views of the real anatomy (BodyParts3D), pre-rendered by
 * tools/anatomy/render-assets.html as two images per view:
 *   map-<view>-shade.webp  the lit body
 *   map-<view>-id.png      each muscle head painted a flat code colour (red channel = index × step)
 * Here every pixel is recoloured by what that muscle head means right now.
 *
 * Modes:
 *   roles(key) => 'primary' | 'secondary' | …  red / orange, like the 3-D trainer
 *   heat       { chest: 0..2 }                  weekly training heat map (sets ÷ 10)
 *   selected + onPick(muscle)                   tap a muscle to filter
 */
const BASE = `${import.meta.env.BASE_URL}anatomy/`;
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
    const out = new ImageData(shade.width, shade.height);
    const cache = new Map();
    for (let i = 0; i < shade.data.length; i += 4) {
      const a = shade.data[i + 3];
      out.data[i + 3] = a;
      let r = shade.data[i]; let g = shade.data[i + 1]; let b = shade.data[i + 2];
      if (a > 0 && id.data[i + 3] > 128) {
        const k = Math.round(id.data[i] / data.meta.step) - 1;
        const key = data.meta.keys[k];
        if (key) {
          if (!cache.has(key)) cache.set(key, colorFor(key, key.split('.')[0] === hover));
          const c = cache.get(key);
          if (c) {
            // Tint keeps the muscle's shading: blend shade with (shade × colour).
            const L = (r + g + b) / 765 * 1.25;
            r += (Math.min(255, c.rgb[0] * L) - r) * c.a;
            g += (Math.min(255, c.rgb[1] * L) - g) * c.a;
            b += (Math.min(255, c.rgb[2] * L) - b) * c.a;
          }
        }
      }
      out.data[i] = r; out.data[i + 1] = g; out.data[i + 2] = b;
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
