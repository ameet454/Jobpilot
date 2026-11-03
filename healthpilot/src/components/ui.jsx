import { useEffect } from 'react';

export function Ring({ value, max, size = 168, stroke = 14, color = 'var(--accent)', children, label }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const over = max > 0 && value > max;
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeLinecap="round" strokeWidth={stroke}
          stroke={over ? 'var(--bad)' : color} strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset .6s ease' }}
        />
      </svg>
      <div className="ring-inner">{children}</div>
    </div>
  );
}

export function MacroBar({ label, value, target, unit = 'g', color }) {
  const pct = target ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div className="macro">
      <div className="macro-head">
        <span>{label}</span>
        <span className="muted"><b>{Math.round(value)}</b> / {Math.round(target)} {unit}</span>
      </div>
      <div className="bar"><div style={{ width: `${pct}%`, background: color }} /></div>
    </div>
  );
}

export function Sheet({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className={`sheet ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Stepper({ value, onChange, step = 0.5, min = 0.25, label }) {
  const fix = (v) => Math.max(min, Math.round(v * 100) / 100);
  return (
    <div className="stepper" aria-label={label}>
      <button type="button" onClick={() => onChange(fix(value - step))} aria-label="Decrease">−</button>
      <input
        type="number" inputMode="decimal" step={step} min={min} value={value}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        onBlur={() => onChange(fix(Number(value) || min))}
      />
      <button type="button" onClick={() => onChange(fix(Number(value) + step))} aria-label="Increase">+</button>
    </div>
  );
}

export function Card({ title, action, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="card-head">
          {title && <h3>{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Segmented({ options, value, onChange, small }) {
  return (
    <div className={`segmented ${small ? 'small' : ''}`} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)} type="button">
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const DietDot = ({ diet }) => (
  <span className={`diet diet-${diet}`} title={{ v: 'Vegetarian', e: 'Contains egg', n: 'Non-vegetarian' }[diet]} />
);

export const fmt = (n, d = 0) => (Number.isFinite(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: d }) : '–');
