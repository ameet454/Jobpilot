import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BACK_MUSCLES, JOINT_LABEL, muscleAnchor, muscles, rig, v, workingJoints } from '../lib/rig3d.js';
import { ANATOMY_CREDIT, anatomyAnchor, buildAnatomy, loadAnatomy, poseAnatomy } from './anatomyModel.js';
import { repPhase, STAGE_LOAD } from '../lib/pose.js';
import { headLabel, headRole, seeThrough } from '../data/exercises.js';
import { cuesFor } from '../data/coaching.js';
import ExerciseFigure, { MUSCLE_COLOR } from './ExerciseFigure.jsx';

const REPS = 10;
const STAGE_TITLE = { lift: 'LIFT', squeeze: 'SQUEEZE', lower: 'LOWER', stretch: 'STRETCH' };
const VIEWS = { front: 0, side: 90, back: 180 };

/* ── Scene building ──────────────────────────────────────────────────── */
const SPHERE = new THREE.SphereGeometry(1, 28, 20);
const UNIT_CYL = (r0, r1) => new THREE.CylinderGeometry(r1, r0, 1, 20, 1);


export function makeMaterials(dark) {
  return {
    // Resting muscles in a soft anatomical tone, bones in ivory; only the
    // working muscles get strong colour.
    muscle: new THREE.MeshStandardMaterial({ color: dark ? '#9c8580' : '#d3bdb5', roughness: 0.55 }),
    bone: new THREE.MeshStandardMaterial({ color: '#ece4d2', roughness: 0.7 }),
    primary: new THREE.MeshStandardMaterial({ color: '#ff2b2b', emissive: '#ff0000', emissiveIntensity: 0.5, roughness: 0.4 }),
    secondary: new THREE.MeshStandardMaterial({ color: '#ff9f1c', emissive: '#ff7300', emissiveIntensity: 0.25, roughness: 0.45 }),
    veil: new THREE.MeshStandardMaterial({ color: '#ffb35c', roughness: 0.5, transparent: true, opacity: 0.22, depthWrite: false }),
    iron: new THREE.MeshStandardMaterial({ color: '#2b3038', roughness: 0.35, metalness: 0.6 }),
    steel: new THREE.MeshStandardMaterial({ color: '#c9ced6', roughness: 0.25, metalness: 0.9 }),
    pad: new THREE.MeshStandardMaterial({ color: dark ? '#3c4552' : '#4a5563', roughness: 0.8 }),
    floor: new THREE.MeshStandardMaterial({ color: dark ? '#1c2925' : '#e9efec', roughness: 1 }),
  };
}

/** Equipment. Returns an update(R) function that moves the pieces that follow the body. */
export function buildProps(group, ex, mat, ox) {
  const updates = [];
  const zOf = (R) => Math.abs(R.J.hand1[2]);
  for (const p of ex.props) {
    if (p.t === 'line') {
      const pts = p.pts.map(([x, y]) => [x - ox, 241 - y, 0]);
      if (p.kind === 'bar') {
        const bar = new THREE.Mesh(UNIT_CYL(1.6, 1.6), mat.steel);
        bar.rotation.x = Math.PI / 2; bar.scale.y = 90;
        bar.position.set(ex.A.at[0] - ox, pts[0][1], 0); group.add(bar);
        continue;
      }
      for (let i = 0; i < pts.length - 1; i += 1) {
        const a = pts[i]; const b = pts[i + 1];
        const len = v.len(v.sub(b, a));
        const zs = p.kind === 'dipbars' ? [-22, 22] : [0];
        for (const z of zs) {
          const depth = p.kind === 'dipbars' || p.w <= 6 ? 5 : 30;
          const box = new THREE.Mesh(new THREE.BoxGeometry(len, p.w, depth), p.w <= 6 ? mat.iron : mat.pad);
          box.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z);
          box.rotation.z = Math.atan2(b[1] - a[1], b[0] - a[0]);
          box.castShadow = true; box.receiveShadow = true; group.add(box);
        }
      }
      continue;
    }
    if (p.t === 'barbell') {
      const g = new THREE.Group();
      const bar = new THREE.Mesh(UNIT_CYL(1.3, 1.3), mat.steel); bar.rotation.x = Math.PI / 2; bar.scale.y = 120; g.add(bar);
      const r = p.r || 17;
      for (const z of [-1, 1]) {
        for (const k of [0, 1]) {
          const plate = new THREE.Mesh(new THREE.CylinderGeometry(r - k * 3, r - k * 3, 4, 32), mat.iron);
          plate.rotation.x = Math.PI / 2; plate.position.z = z * (38 + k * 4.5); plate.castShadow = true; g.add(plate);
        }
      }
      group.add(g);
      updates.push((R) => {
        const base = p.at === 'neck' ? R.J.neck : p.at === 'hip' ? R.J.hip : v.lerp(R.J.hand1, R.J['hand-1'], 0.5);
        g.position.set(base[0] + (p.dx || 0), base[1] - (p.dy || 0), 0);
      });
    } else if (p.t === 'dumbbell') {
      const sides = ex.view === 'front' ? [p.at === 'handL' ? -1 : 1] : [1, -1];
      for (const s of sides) {
        const g = new THREE.Group();
        const h = new THREE.Mesh(UNIT_CYL(1.2, 1.2), mat.steel); h.rotation.x = Math.PI / 2; h.scale.y = 16; g.add(h);
        for (const z of [-7, 7]) { const pl = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 4, 20), mat.iron); pl.rotation.x = Math.PI / 2; pl.position.z = z; g.add(pl); }
        if (ex.view === 'front') g.rotation.y = Math.PI / 2;
        group.add(g);
        updates.push((R) => g.position.set(...R.J[`hand${s}`]));
      }
    } else if (p.t === 'grip') {
      const g = new THREE.Mesh(UNIT_CYL(1.4, 1.4), mat.iron); g.rotation.x = Math.PI / 2; group.add(g);
      updates.push((R) => { const c = v.lerp(R.J.hand1, R.J['hand-1'], 0.5); g.position.set(c[0], c[1], 0); g.scale.y = 2 * zOf(R) + 10; });
    } else if (p.t === 'cable') {
      const from = ex.view === 'front' ? [0, 241 - p.from[1], p.from[0] - 150] : [p.from[0] - ox, 241 - p.from[1], 0];
      const pulley = new THREE.Mesh(SPHERE, mat.iron); pulley.scale.setScalar(4); pulley.position.set(...from); group.add(pulley);
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...from), new THREE.Vector3()]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#7b8794' })); group.add(line);
      updates.push((R) => {
        const to = ex.view === 'front' ? R.J[p.to === 'handL' ? 'hand-1' : 'hand1'] : v.lerp(R.J.hand1, R.J['hand-1'], 0.5);
        geo.attributes.position.setXYZ(1, ...to); geo.attributes.position.needsUpdate = true;
      });
    } else if (p.t === 'pad') {
      const pad = new THREE.Mesh(UNIT_CYL(6, 6), mat.pad); pad.rotation.x = Math.PI / 2; pad.scale.y = 30; group.add(pad);
      updates.push((R) => { const c = v.lerp(R.J.ankle1, R.J['ankle-1'], 0.5); pad.position.set(c[0], c[1], 0); });
    } else if (p.t === 'sled') {
      const sled = new THREE.Mesh(new THREE.BoxGeometry(3, 36, 34), mat.iron); group.add(sled);
      updates.push((R) => { const c = v.lerp(R.J.toe1, R.J['toe-1'], 0.5); sled.position.set(c[0] + 2, c[1], 0); sled.rotation.z = -((p.angle - 90) * Math.PI) / 180; });
    }
  }
  return (R) => updates.forEach((u) => u(R));
}

/** Where the load is: the point we draw the movement arrow from. */
function loadPoint(ex, R) {
  const pr = ex.props.find((p) => ['barbell', 'dumbbell', 'grip'].includes(p.t));
  if (pr?.at === 'neck') return R.J.neck;
  if (pr?.at === 'hip') return R.J.hip;
  if (ex.view === 'front') return R.J.hand1;
  if (['back-squat', 'leg-press', 'leg-extension', 'leg-curl', 'calf-raise', 'walking-lunge'].includes(ex.id)) return v.lerp(R.J.hip, R.J.ankle1, ex.id === 'leg-extension' || ex.id === 'leg-curl' ? 1 : 0.15);
  return v.lerp(R.J.hand1, R.J['hand-1'], 0.5);
}

export function framing(ex) {
  const pts = [];
  for (const t of [0, 0.5, 1]) { const R = rig(ex, t, 0); pts.push(...Object.values(R.J)); }
  const min = [0, 1, 2].map((i) => Math.min(...pts.map((p) => p[i])));
  const max = [0, 1, 2].map((i) => Math.max(...pts.map((p) => p[i])));
  const ox = ex.view === 'front' ? 150 : (min[0] + max[0]) / 2;
  return { ox, cy: (min[1] + max[1]) / 2, size: Math.max(max[0] - min[0], max[1] - min[1], 90) };
}

export function defaultView(ex) {
  const lying = Math.abs(Math.sin((ex.A.torso * Math.PI) / 180)) < 0.6;
  const f0 = ex.focus[0];
  const back = BACK_MUSCLES.has(f0.split('.')[0]) || f0 === 'shoulders.rear';
  if (lying) return { az: back ? 120 : 60, el: 52 };
  return { az: ex.view === 'front' ? 20 : back ? 140 : 42, el: 12 };
}

// Phones with few cores or little memory get no antialiasing, no soft shadows and a lower resolution.
const LOW_END = typeof navigator !== 'undefined'
  && ((navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3);

function webglOk() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

/* ── Component ───────────────────────────────────────────────────────── */
export default function Exercise3D({ ex }) {
  const mount = useRef(null);
  const label = useRef(null);
  const ctl = useRef({ playing: true, speed: 1, voice: false, setView: null });
  const [ui, setUi] = useState({ stage: null, left: 0, rep: 0, cue: '', done: false });
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [voice, setVoice] = useState(false);
  const [failed, setFailed] = useState(() => typeof window !== 'undefined' && !webglOk());
  const [loading, setLoading] = useState(true);
  const cues = cuesFor(ex);
  const joints = workingJoints(ex).slice(0, 3);

  useEffect(() => { ctl.current.playing = playing; }, [playing]);
  useEffect(() => { ctl.current.speed = speed; }, [speed]);
  useEffect(() => {
    ctl.current.voice = voice;
    if (!voice) window.speechSynthesis?.cancel();
  }, [voice]);

  useEffect(() => {
    if (failed) return undefined;
    const el = mount.current;
    const dark = document.documentElement.dataset.theme === 'dark'
      || (document.documentElement.dataset.theme !== 'light' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: !LOW_END, alpha: true, powerPreference: LOW_END ? 'low-power' : 'default' });
    } catch {
      setFailed(true);
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LOW_END ? 1.25 : 2));
    renderer.shadowMap.enabled = !LOW_END;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.prepend(renderer.domElement);

    const scene = new THREE.Scene();
    const mat = makeMaterials(dark);
    const { ox, cy, size } = framing(ex);
    const camera = new THREE.PerspectiveCamera(32, 1, 1, 4000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.minDistance = size * 1.2;
    controls.maxDistance = size * 4;
    controls.target.set(0, cy, 0);

    scene.add(new THREE.HemisphereLight('#ffffff', dark ? '#202830' : '#8a96a3', dark ? 1.1 : 1.3));
    const key = new THREE.DirectionalLight('#ffffff', 2.2);
    key.position.set(140, 300, 220); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -200, right: 200, top: 300, bottom: -100, near: 10, far: 900 });
    key.shadow.camera.updateProjectionMatrix();
    scene.add(key);
    const rim = new THREE.DirectionalLight('#9fc3ff', 0.9); rim.position.set(-200, 120, -180); scene.add(rim);

    if (!ex.noFloor) {
      const floor = new THREE.Mesh(new THREE.CircleGeometry(size * 1.1, 64), mat.floor);
      floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    }

    const group = new THREE.Group(); scene.add(group);
    let anatomy = null;
    let disposed = false;
    loadAnatomy()
      .then((data) => {
        if (disposed) return;
        anatomy = buildAnatomy(data, (g) => (seeThrough(ex, g) ? mat.veil : mat[headRole(ex, g)]));
        group.add(anatomy.mesh);
        setLoading(false);
      })
      .catch(() => { if (!disposed) setFailed(true); });
    const updateProps = buildProps(group, ex, mat, ox);
    // Rings on the joints that bend in this exercise (both sides), visible through the body.
    const ringMat = new THREE.MeshBasicMaterial({ color: '#22d3ee', transparent: true, opacity: 0.9, depthTest: false });
    const ringGeo = new THREE.TorusGeometry(5.5, 0.9, 10, 36);
    const rings = workingJoints(ex).slice(0, 3).flatMap((j) => [1, -1].map((s) => {
      const m = new THREE.Mesh(ringGeo, ringMat); m.renderOrder = 10; scene.add(m);
      return { m, key: `${j.name}${s}` };
    }));
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 30, 0xff2b2b, 10, 7);
    scene.add(arrow);

    // Camera: spherical around the target, with an animated move between views.
    const view = { ...defaultView(ex), dist: size * 2.7 };
    const placeCam = (az, el) => {
      const a = (az * Math.PI) / 180; const e = (el * Math.PI) / 180;
      camera.position.set(Math.cos(e) * Math.cos(a) * view.dist, cy + Math.sin(e) * view.dist, Math.cos(e) * Math.sin(a) * view.dist);
      camera.lookAt(controls.target);
    };
    placeCam(view.az, view.el);
    let camAnim = null;
    ctl.current.setView = (name) => {
      const from = camera.position.clone().sub(controls.target);
      const fromAz = (Math.atan2(from.z, from.x) * 180) / Math.PI;
      const toAz = name === 'auto' ? defaultView(ex).az : VIEWS[name];
      let d = toAz - fromAz; while (d > 180) d -= 360; while (d < -180) d += 360;
      camAnim = { start: performance.now(), fromAz, d, el: name === 'auto' ? defaultView(ex).el : 10, fromEl: (Math.asin(from.y / from.length()) * 180) / Math.PI };
    };

    const resize = () => {
      const w = el.clientWidth; const h = Math.min(420, Math.max(260, w * 0.82));
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
    const st = { clock: 0, last: null, rep: 0, prev: null, tip: 0, lastUi: 0, prevLoad: null, banner: 0 };
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
      const R = rig(ex, ph.t, ox);
      if (anatomy) poseAnatomy(anatomy, R);
      updateProps(R);

      for (const r of rings) {
        r.m.position.set(...R.J[r.key]);
        r.m.quaternion.copy(camera.quaternion);
        r.m.scale.setScalar(1 + 0.12 * Math.sin(now / 220));
      }

      // Glow: the target muscle pulses with effort.
      const load = STAGE_LOAD[ph.stage] ?? 0.8;
      const pulse = (Math.sin(now / 170) + 1) / 2;
      mat.primary.emissiveIntensity = 0.25 + 0.85 * load * (0.7 + 0.3 * pulse);
      mat.secondary.emissiveIntensity = 0.12 + 0.3 * load;

      // Arrow: which way the weight is travelling right now.
      const lp = loadPoint(ex, R);
      if (st.prevLoad && (ph.stage === 'lift' || ph.stage === 'lower')) {
        const d = v.sub(lp, st.prevLoad);
        if (v.len(d) > 0.02) {
          arrow.visible = true;
          // Nudge the arrow towards the camera so the body never hides it.
          const toCam = v.norm(v.sub(camera.position.toArray(), lp));
          arrow.position.set(...v.add(lp, v.mul(toCam, 22)));
          arrow.setDirection(new THREE.Vector3(...v.norm(d)));
          arrow.setColor(ph.stage === 'lift' ? 0xff2b2b : 0xf59e0b);
        }
      } else arrow.visible = false;
      st.prevLoad = lp;

      // Trainer: count reps, speak cues, update the overlay a few times a second.
      if (ph.stage !== st.prev) {
        if (st.prev === 'lift') {
          st.rep += 1;
          if (st.rep > REPS) { st.rep = 1; }
          if (st.rep === REPS) { st.banner = now + 2600; say(`Ten! Great set. Rest, then go again.`, true); }
        }
        if (ph.stage === 'lift') say(cues.lift, true);
        else if (ph.stage === 'lower') say(cues.lower);
        else if (ph.stage === 'stretch' && st.rep % 3 === 2) { say(cues.tips[st.tip % cues.tips.length]); st.tip += 1; }
        st.prev = ph.stage;
      }
      const durations = { lift: ex.tempo.lift, squeeze: ex.tempo.squeeze, lower: ex.tempo.lower, stretch: ex.tempo.rest };
      if (now - st.lastUi > 200) {
        st.lastUi = now;
        const cueText = ph.stage === 'lift' ? cues.lift : ph.stage === 'lower' ? cues.lower : ph.stage === 'squeeze' ? 'Squeeze and hold.' : cues.tips[st.tip % cues.tips.length];
        setUi({ stage: ph.stage, left: Math.max(0, durations[ph.stage] * (1 - ph.progress)), rep: st.rep, cue: cueText, done: now < st.banner });
      }

      if (camAnim) {
        const k = Math.min(1, (now - camAnim.start) / 450); const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        placeCam(camAnim.fromAz + camAnim.d * e, camAnim.fromEl + (camAnim.el - camAnim.fromEl) * e);
        if (k >= 1) camAnim = null;
      }
      controls.update();
      renderer.render(scene, camera);

      // Pin the "feel it here" label to the working muscle.
      const a = (anatomy && anatomyAnchor(anatomy, anchorHead)) || muscleAnchor(muscles(R), anchorHead.split('.')[0]);
      if (a && label.current) {
        proj.set(...a).project(camera);
        const w = renderer.domElement.clientWidth; const h = renderer.domElement.clientHeight;
        const x = (proj.x * 0.5 + 0.5) * w; const y = (-proj.y * 0.5 + 0.5) * h;
        label.current.style.transform = `translate(${x}px, ${y}px)`;
        label.current.style.opacity = proj.z < 1 ? '1' : '0';
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
      scene.traverse((o) => { if (o.geometry && o.geometry !== SPHERE) o.geometry.dispose(); });
      Object.values(mat).forEach((m) => m.dispose());
      ringMat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      ctl.current.setView = null;
    };
  }, [ex, failed]);

  if (failed) return <ExerciseFigure ex={ex} />;

  const stageCls = ui.stage === 'lift' || ui.stage === 'squeeze' ? 'hot' : ui.stage === 'lower' ? 'warm' : '';
  return (
    <div className="trainer">
      <div className="stage3d" ref={mount}>
        <div className="t-rep">REP <b>{ui.rep || '–'}</b>/{REPS}</div>
        {ui.stage && <div className={`t-stage ${stageCls}`}>{STAGE_TITLE[ui.stage]} <span>{ui.left.toFixed(1)}s</span></div>}
        <div className="t-label" ref={label} aria-hidden="true">
          <span className="t-dot" />
          <span className="t-tag">Feel it here · {headLabel(ex.focus[0])}</span>
        </div>
        {ui.done && <div className="t-banner">💪 Set complete! Rest 60–90 s</div>}
        {loading && <div className="t-loading">Loading anatomy…</div>}
        <div className="t-hint">Drag to rotate</div>
      </div>
      <div className={`t-cue ${stageCls}`} aria-live="off">🗣️ {ui.cue || 'Get into position…'}</div>
      <div className="t-controls">
        <button type="button" className="btn sm" onClick={() => setPlaying((p) => !p)}>{playing ? '⏸ Pause' : '▶ Play'}</button>
        <button type="button" className={`btn sm ${speed === 0.5 ? 'primary' : ''}`} onClick={() => setSpeed((s) => (s === 1 ? 0.5 : 1))}>🐢 Slow-mo</button>
        <button type="button" className={`btn sm ${voice ? 'primary' : ''}`} aria-pressed={voice} onClick={() => setVoice((x) => !x)}>{voice ? '🔊 Coach on' : '🔈 Coach voice'}</button>
      </div>
      <div className="t-views segmented small" role="group" aria-label="Camera angle">
        {['auto', 'front', 'side', 'back'].map((n) => (
          <button key={n} type="button" onClick={() => ctl.current.setView?.(n)}>{n === 'auto' ? 'Best view' : n[0].toUpperCase() + n.slice(1)}</button>
        ))}
      </div>
      <div className="legend">
        <span><i style={{ background: MUSCLE_COLOR.primary }} /> Main muscle — the stress should be here</span>
        <span><i style={{ background: MUSCLE_COLOR.secondary }} /> Helping muscles</span>
        <span><i style={{ background: '#ff2b2b', borderRadius: 0, height: 3, verticalAlign: 3 }} /> Arrow = direction of the weight</span>
        {joints.length > 0 && <span><i style={{ background: 'transparent', border: '2px solid #22d3ee', borderRadius: '50%' }} /> Rings = working joints: {joints.map((j) => JOINT_LABEL[j.name]).join(', ')}</span>}
      </div>
      <p className="credit">3-D anatomy: {ANATOMY_CREDIT}</p>
    </div>
  );
}
