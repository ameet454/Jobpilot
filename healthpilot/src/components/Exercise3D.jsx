import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Pause, Play, Rabbit, Route, Snail, Volume2, VolumeX, Weight } from 'lucide-react';
import { repPhase, STAGE_LOAD } from '../lib/pose.js';
import { headLabel, headRole } from '../data/exercises.js';
import { cuesFor } from '../data/coaching.js';
import ExerciseFigure from './ExerciseFigure.jsx';
import { BODY_CREDIT, bodyAnchor, buildBody, GLOW, loadBody, poseBody, setHands, setRoles } from './bodyModel.js';
import { addFloor, addStudio, buildProps, defaultView, framing, makeMaterials } from './scene3d.js';
import { buildOverlays, OVERLAY_COLOR } from './overlays3d.js';
import { stressCurve, stressSummary } from '../lib/biomech.js';
import { JOINT_LABEL } from '../lib/rig3d.js';

const REPS = 10;
const STAGE_TITLE = { lift: 'Lift', squeeze: 'Squeeze', lower: 'Lower', stretch: 'Stretch' };
const VIEWS = { front: 0, side: 90, back: 180 };

// Phones with few cores or little memory get no antialiasing, no soft shadows and a lower resolution.
const LOW_END = typeof navigator !== 'undefined'
  && ((navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3);

function webglOk() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
const v3mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const isDark = () => document.documentElement.dataset.theme === 'dark'
  || (document.documentElement.dataset.theme !== 'light' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);

export default function Exercise3D({ ex }) {
  const mount = useRef(null);
  const label = useRef(null);
  const leverTag = useRef(null);
  const ctl = useRef({ playing: true, speed: 1, voice: false, setView: null, path: true, forces: true });
  const [ui, setUi] = useState({ stage: null, left: 0, progress: 0, rep: 0, cue: '', done: false });
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [voice, setVoice] = useState(false);
  const [view, setView] = useState('auto');
  const [showPath, setShowPath] = useState(true);
  const [showForces, setShowForces] = useState(true);
  const [failed, setFailed] = useState(() => typeof window !== 'undefined' && !webglOk());
  const [loading, setLoading] = useState(true);
  const cues = cuesFor(ex);
  const curve = stressCurve(ex);
  const summary = stressSummary(ex);

  useEffect(() => { ctl.current.playing = playing; }, [playing]);
  useEffect(() => { ctl.current.speed = speed; }, [speed]);
  useEffect(() => {
    ctl.current.voice = voice;
    if (!voice) window.speechSynthesis?.cancel();
  }, [voice]);
  useEffect(() => { ctl.current.setView?.(view); }, [view]);
  useEffect(() => { ctl.current.path = showPath; ctl.current.forces = showForces; }, [showPath, showForces]);

  useEffect(() => {
    if (failed) return undefined;
    const el = mount.current;
    const dark = isDark();
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: LOW_END ? 'low-power' : 'default' });
    } catch {
      setFailed(true);
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LOW_END ? 1.25 : 2));
    renderer.shadowMap.enabled = !LOW_END;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = dark ? 1.05 : 1;
    el.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    addStudio(renderer, scene, { shadows: !LOW_END, dark });
    const mat = makeMaterials(dark);
    const { ox, cy, size } = framing(ex);
    if (!ex.noFloor) addFloor(scene, mat);

    const camera = new THREE.PerspectiveCamera(30, 1, 1, 5000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.minDistance = size * 1.3;
    controls.maxDistance = size * 4;
    controls.target.set(0, cy, 0);

    const group = new THREE.Group(); scene.add(group);
    let body = null;
    let disposed = false;
    loadBody()
      .then((data) => {
        if (disposed) return;
        body = buildBody(data, { dark });
        setRoles(body, (h) => headRole(ex, h));
        setHands(body, ex.hands);
        group.add(body.mesh);
        setLoading(false);
      })
      .catch(() => { if (!disposed) setFailed(true); });
    const updateProps = buildProps(group, ex, mat, ox);
    const overlays = buildOverlays(scene, ex, ox, { dark });
    const curveAt = (t) => {
      if (!curve) return 1;
      const sProg = ex.lift === 'BA' ? 1 - t : t;
      const x = sProg * (curve.length - 1); const i = Math.min(curve.length - 2, Math.floor(x));
      return curve[i] + (curve[i + 1] - curve[i]) * (x - i);
    };

    // Camera: spherical around the target, with an eased move between views.
    const dist = size * 2.55;
    const placeCam = (az, el2) => {
      const a = (az * Math.PI) / 180; const e = (el2 * Math.PI) / 180;
      camera.position.set(Math.cos(e) * Math.cos(a) * dist, cy + Math.sin(e) * dist, Math.cos(e) * Math.sin(a) * dist);
      camera.lookAt(controls.target);
    };
    const dv = defaultView(ex);
    placeCam(dv.az, dv.el);
    let camAnim = null;
    ctl.current.setView = (name) => {
      const from = camera.position.clone().sub(controls.target);
      const fromAz = (Math.atan2(from.z, from.x) * 180) / Math.PI;
      const toAz = name === 'auto' ? dv.az : VIEWS[name];
      let d = toAz - fromAz; while (d > 180) d -= 360; while (d < -180) d += 360;
      camAnim = { start: performance.now(), fromAz, d, el: name === 'auto' ? dv.el : 8, fromEl: (Math.asin(from.y / from.length()) * 180) / Math.PI };
    };

    const resize = () => {
      const w = el.clientWidth; const h = Math.min(460, Math.max(300, w * 0.95));
      renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(el);

    const voices = () => window.speechSynthesis?.getVoices() || [];
    const say = (text, urgent = false) => {
      if (!ctl.current.voice || !window.speechSynthesis) return;
      if (window.speechSynthesis.speaking && !urgent) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const vIN = voices().find((x) => x.lang === 'en-IN') || voices().find((x) => x.lang?.startsWith('en'));
      if (vIN) u.voice = vIN;
      u.rate = 1.05;
      window.speechSynthesis.speak(u);
    };

    const anchorHead = ex.focus[0];
    const st = { clock: 0, last: null, rep: 0, prev: null, tip: 0, lastUi: 0, banner: 0, glow: 0.5 };
    const proj = new THREE.Vector3();
    let raf;
    // Skip work while the viewer is scrolled away or the tab is hidden.
    let onScreen = true;
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; });
    io.observe(el);
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (!onScreen || document.hidden) { st.last = null; return; }
      const dt = st.last == null ? 0 : Math.min(100, now - st.last);
      st.last = now;
      if (ctl.current.playing) st.clock += dt * ctl.current.speed;
      const ph = repPhase(st.clock, ex.tempo, ex.lift);
      const stress = curveAt(ph.t);
      overlays.setVisible({ path: ctl.current.path, forces: ctl.current.forces });
      const bm = overlays.update(ph.t, ph.stage, stress, camera);
      const R = bm.R;
      if (body) poseBody(body, R);
      updateProps(R);

      // The target muscle warms up with effort: brightest while lifting and squeezing.
      // Glow follows the effort of the phase and the resistance profile at this point of the rep.
      const load = (STAGE_LOAD[ph.stage] ?? 0.8) * (curve ? 0.45 + 0.55 * stress : 1);
      st.glow += (load - st.glow) * Math.min(1, dt / 180);
      if (body) body.uniforms.glow.value = st.glow * (0.85 + 0.15 * Math.sin(now / 260));

      if (ph.stage !== st.prev) {
        if (st.prev === 'lift') {
          st.rep += 1;
          if (st.rep > REPS) st.rep = 1;
          if (st.rep === REPS) { st.banner = now + 2600; say('Ten! Great set. Rest, then go again.', true); }
        }
        if (ph.stage === 'lift') say(cues.lift, true);
        else if (ph.stage === 'lower') say(cues.lower);
        else if (ph.stage === 'stretch' && st.rep % 3 === 2) { say(cues.tips[st.tip % cues.tips.length]); st.tip += 1; }
        st.prev = ph.stage;
      }
      const durations = { lift: ex.tempo.lift, squeeze: ex.tempo.squeeze, lower: ex.tempo.lower, stretch: ex.tempo.rest };
      if (now - st.lastUi > 120) {
        st.lastUi = now;
        const cueText = ph.stage === 'lift' ? cues.lift : ph.stage === 'lower' ? cues.lower : ph.stage === 'squeeze' ? 'Squeeze and hold.' : cues.tips[st.tip % cues.tips.length];
        setUi({ stage: ph.stage, left: Math.max(0, durations[ph.stage] * (1 - ph.progress)), progress: ph.progress, rep: st.rep, cue: cueText, done: now < st.banner, s: ex.lift === 'BA' ? 1 - ph.t : ph.t, stress });
      }

      if (camAnim) {
        const k = Math.min(1, (now - camAnim.start) / 520); const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        placeCam(camAnim.fromAz + camAnim.d * e, camAnim.fromEl + (camAnim.el - camAnim.fromEl) * e);
        if (k >= 1) camAnim = null;
      }
      controls.update();
      renderer.render(scene, camera);

      // Pin the "feel it here" marker to the skin over the working muscle.
      const a = body && bodyAnchor(body, anchorHead);
      if (a && label.current) {
        proj.set(...a).project(camera);
        const w = renderer.domElement.clientWidth; const h = renderer.domElement.clientHeight;
        const x = (proj.x * 0.5 + 0.5) * w; const y = (-proj.y * 0.5 + 0.5) * h;
        label.current.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        label.current.style.opacity = proj.z < 1 ? '1' : '0';
        label.current.classList.toggle('flip', x > w * 0.62);
      }
      // Name the lever arm next to it.
      if (leverTag.current) {
        if (bm.lever && bm.lever.length > 4 && ctl.current.forces) {
          const J = R.J[bm.joint.key];
          proj.set(...v3mid(J, bm.lever.foot)).project(camera);
          const w = renderer.domElement.clientWidth; const h = renderer.domElement.clientHeight;
          leverTag.current.style.transform = `translate(${((proj.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-proj.y * 0.5 + 0.5) * h).toFixed(1)}px)`;
          leverTag.current.style.opacity = '1';
        } else leverTag.current.style.opacity = '0';
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      controls.dispose();
      window.speechSynthesis?.cancel();
      overlays.dispose();
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      Object.values(mat).forEach((m) => m.dispose());
      body?.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      ctl.current.setView = null;
    };
  }, [ex, failed]);

  if (failed) return <ExerciseFigure ex={ex} />;

  const hot = ui.stage === 'lift' || ui.stage === 'squeeze';
  const stageCls = hot ? 'hot' : ui.stage === 'lower' ? 'warm' : 'calm';
  return (
    <div className="viewer">
      <div className="v-stage" ref={mount}>
        <div className="v-top">
          <span className="v-chip"><small>Rep</small> <b>{ui.rep || '–'}</b><small>/{REPS}</small></span>
          {ui.stage && (
            <span className={`v-phase ${stageCls}`}>
              {STAGE_TITLE[ui.stage]}<i>{ui.left.toFixed(1)}s</i>
            </span>
          )}
        </div>
        <div className="v-mark" ref={label} aria-hidden="true">
          <span className="v-dot" />
          <span className="v-tag">{headLabel(ex.focus[0])}</span>
        </div>
        <div className="v-lever" ref={leverTag} aria-hidden="true">Lever arm · {JOINT_LABEL[summary?.joint] || ''}</div>
        {ui.done && <div className="v-banner">Set complete — rest 60–90 s</div>}
        {loading && <div className="v-loading"><span className="spinner" />Loading 3-D coach…</div>}
        <div className="v-views" role="group" aria-label="Camera angle">
          {['auto', 'front', 'side', 'back'].map((n) => (
            <button key={n} type="button" className={view === n ? 'on' : ''} aria-pressed={view === n} onClick={() => { setView(n); ctl.current.setView?.(n); }}>
              {n === 'auto' ? 'Best' : n[0].toUpperCase() + n.slice(1)}
            </button>
          ))}
        </div>
        <div className={`v-progress ${stageCls}`}><span style={{ transform: `scaleX(${ui.progress || 0})` }} /></div>
      </div>
      <div className="v-bar">
        <button type="button" className="v-btn" aria-label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying((p) => !p)}>
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button type="button" className={`v-btn ${speed === 0.5 ? 'on' : ''}`} aria-pressed={speed === 0.5} aria-label="Slow motion" onClick={() => setSpeed((s) => (s === 1 ? 0.5 : 1))}>
          {speed === 0.5 ? <Snail size={18} /> : <Rabbit size={18} />}<span>{speed === 0.5 ? '0.5×' : '1×'}</span>
        </button>
        <button type="button" className={`v-btn ${voice ? 'on' : ''}`} aria-pressed={voice} aria-label="Voice coaching" onClick={() => setVoice((x) => !x)}>
          {voice ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
        <span className="grow" />
        <button type="button" className={`v-btn ${showPath ? 'on' : ''}`} aria-pressed={showPath} onClick={() => setShowPath((x) => !x)}>
          <Route size={17} /><span>Path</span>
        </button>
        <button type="button" className={`v-btn ${showForces ? 'on' : ''}`} aria-pressed={showForces} onClick={() => setShowForces((x) => !x)}>
          <Weight size={17} /><span>Forces</span>
        </button>
      </div>
      <p className={`v-cue ${stageCls}`} aria-live="off">{ui.cue || 'Get into position…'}</p>
      <div className="v-legend">
        <span><i style={{ background: GLOW.primary }} />Target muscle</span>
        <span><i style={{ background: GLOW.secondary }} />Supporting</span>
        {showPath && <span><i className="line" style={{ background: OVERLAY_COLOR.path }} />Bar path</span>}
        {showForces && curve && <span><i className="line thick" style={{ background: OVERLAY_COLOR.lever }} />Lever arm (stress)</span>}
        {showForces && <span><i className="line dashed" />Line of force</span>}
      </div>
      {curve && <StressChart curve={curve} s={ui.s ?? 0} summary={summary} lift={ex.lift} />}
      <p className="credit">{BODY_CREDIT}. Muscle map derived from BodyParts3D © DBCLS, CC BY-SA 2.1 JP.</p>
    </div>
  );
}

/** Resistance profile: how hard the target muscle works at each point of the lift. */
function StressChart({ curve, s, summary }) {
  const W = 320; const H = 74; const pad = 6;
  const x = (i) => pad + (i / (curve.length - 1)) * (W - 2 * pad);
  const y = (val) => H - pad - val * (H - 2 * pad - 10);
  const line = curve.map((c, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(c).toFixed(1)}`).join(' ');
  const area = `${line} L${x(curve.length - 1)},${H - pad} L${x(0)},${H - pad} Z`;
  const xi = s * (curve.length - 1); const i0 = Math.min(curve.length - 2, Math.floor(xi));
  const cur = curve[i0] + (curve[i0 + 1] - curve[i0]) * (xi - i0);
  return (
    <figure className="stress">
      <figcaption>
        <b>Resistance through the rep</b>
        <span className="muted small">{Math.round(cur * 100)}% of peak right now</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary?.text || 'Resistance profile'}>
        <defs>
          <linearGradient id="stress-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#ff3b30" stopOpacity="0.45" />
            <stop offset="1" stopColor="#ff9f0a" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#stress-fill)" />
        <path d={line} fill="none" stroke="#ff3b30" strokeWidth="2.2" strokeLinejoin="round" />
        <line x1={x(xi)} x2={x(xi)} y1={pad} y2={H - pad} stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.2" strokeDasharray="3 3" />
        <circle cx={x(xi)} cy={y(cur)} r="4.5" fill="#fff" stroke="#ff3b30" strokeWidth="2.5" />
      </svg>
      <div className="stress-axis muted small"><span>Start of lift</span><span>End of lift</span></div>
      {summary && <p className="small">{summary.text}</p>}
    </figure>
  );
}
