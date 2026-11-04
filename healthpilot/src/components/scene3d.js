/**
 * Shared 3-D scene pieces for the exercise viewer and the thumbnail renderer:
 * studio lighting, gym equipment and camera framing.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BACK_MUSCLES, backBarPoint, FLOOR_Y, rig, v } from '../lib/rig3d.js';

/* ── Materials ────────────────────────────────────────────────────────── */
export function makeMaterials(dark) {
  return {
    chrome: new THREE.MeshStandardMaterial({ color: '#d9dde3', roughness: 0.22, metalness: 1 }),
    knurl: new THREE.MeshStandardMaterial({ color: '#9aa1ab', roughness: 0.55, metalness: 1 }),
    plate: new THREE.MeshStandardMaterial({ color: '#1e2228', roughness: 0.62, metalness: 0.1 }),
    plateRim: new THREE.MeshStandardMaterial({ color: '#2b3038', roughness: 0.45, metalness: 0.2 }),
    frame: new THREE.MeshStandardMaterial({ color: dark ? '#3a414c' : '#2f353e', roughness: 0.4, metalness: 0.75 }),
    pad: new THREE.MeshStandardMaterial({ color: dark ? '#353c47' : '#2a3039', roughness: 0.72 }),
    foam: new THREE.MeshStandardMaterial({ color: '#1f242b', roughness: 0.9 }),
    cable: new THREE.MeshStandardMaterial({ color: '#1b1f24', roughness: 0.5 }),
    shadow: new THREE.ShadowMaterial({ opacity: dark ? 0.35 : 0.16 }),
  };
}

let envCache = null;
/** Soft studio light: an environment map plus one shadow-casting key light. */
export function addStudio(renderer, scene, { shadows = true, dark = false } = {}) {
  if (!envCache || envCache.renderer !== renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    envCache = { renderer, tex: pmrem.fromScene(new RoomEnvironment(), 0.04).texture };
    pmrem.dispose();
  }
  scene.environment = envCache.tex;
  scene.environmentIntensity = dark ? 0.55 : 0.7;
  const key = new THREE.DirectionalLight('#fff4ea', dark ? 1.6 : 1.9);
  key.position.set(120, 320, 180);
  if (shadows) {
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.radius = 6;
    key.shadow.bias = -0.0004;
    Object.assign(key.shadow.camera, { left: -170, right: 170, top: 260, bottom: -60, near: 50, far: 800 });
    key.shadow.camera.updateProjectionMatrix();
  }
  scene.add(key);
  const rim = new THREE.DirectionalLight('#cfe0ff', dark ? 1.1 : 0.8);
  rim.position.set(-220, 160, -160);
  scene.add(rim);
  return { key, rim };
}

/** A floor that only shows the shadow, so the athlete sits in a seamless studio backdrop. */
export function addFloor(scene, mat) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), mat.shadow);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  return floor;
}

/* ── Geometry helpers ─────────────────────────────────────────────────── */
const Y = new THREE.Vector3(0, 1, 0);
const tmpQ = new THREE.Quaternion();
/** Place a unit-height Y-cylinder between points a and b. */
function stretchBetween(mesh, a, b) {
  const d = v.sub(b, a);
  const len = v.len(d) || 1e-3;
  mesh.position.set(...v.lerp(a, b, 0.5));
  mesh.quaternion.copy(tmpQ.setFromUnitVectors(Y, new THREE.Vector3(...v.mul(d, 1 / len))));
  mesh.scale.set(1, len, 1);
}
const cyl = (r, segs = 24) => new THREE.CylinderGeometry(r, r, 1, segs, 1);

/** A weight plate turned on a lathe: raised rim, recessed face, hub. Axis = Y. */
function plateGeometry(r, thick) {
  const h = thick / 2;
  const pts = [
    [2.6, -h * 0.55], [r * 0.32, -h * 0.55], [r * 0.36, -h * 0.4], [r * 0.82, -h * 0.4], [r * 0.88, -h],
    [r * 0.97, -h], [r, -h * 0.75], [r, h * 0.75], [r * 0.97, h], [r * 0.88, h], [r * 0.82, h * 0.4],
    [r * 0.36, h * 0.4], [r * 0.32, h * 0.55], [2.6, h * 0.55],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 48);
  g.computeVertexNormals();
  return g;
}

/** Olympic barbell along Z: knurled shaft, sleeves, collars and plates. */
function barbell(mat, plateR, halfLen = 82) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(cyl(1.25), mat.knurl); shaft.rotation.x = Math.PI / 2; shaft.scale.y = 2 * 50; g.add(shaft);
  for (const z of [-1, 1]) {
    const collar = new THREE.Mesh(cyl(2.6), mat.chrome); collar.rotation.x = Math.PI / 2; collar.scale.y = 2.2; collar.position.z = z * 51; g.add(collar);
    const sleeve = new THREE.Mesh(cyl(2.1), mat.chrome); sleeve.rotation.x = Math.PI / 2; sleeve.scale.y = halfLen - 52; sleeve.position.z = z * (52 + (halfLen - 52) / 2); g.add(sleeve);
    if (plateR > 0) {
      const big = new THREE.Mesh(plateGeometry(plateR, 5.5), mat.plate); big.rotation.x = Math.PI / 2; big.position.z = z * 56; g.add(big);
      const small = new THREE.Mesh(plateGeometry(plateR * 0.72, 4), mat.plateRim); small.rotation.x = Math.PI / 2; small.position.z = z * 61; g.add(small);
      const clip = new THREE.Mesh(cyl(3), mat.chrome); clip.rotation.x = Math.PI / 2; clip.scale.y = 2; clip.position.z = z * 64.5; g.add(clip);
    }
  }
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

/** Dumbbell along local Z (the handle runs through the fist). */
function dumbbell(mat) {
  const g = new THREE.Group();
  const h = new THREE.Mesh(cyl(1.25), mat.knurl); h.rotation.x = Math.PI / 2; h.scale.y = 12; g.add(h);
  for (const z of [-1, 1]) {
    for (const [k, r] of [[0, 6.2], [1, 5.4]]) {
      const p = new THREE.Mesh(plateGeometry(r, 2.6), mat.plate); p.rotation.x = Math.PI / 2; p.position.z = z * (7.4 + k * 2.6); g.add(p);
    }
    const cap = new THREE.Mesh(cyl(1.8), mat.chrome); cap.rotation.x = Math.PI / 2; cap.scale.y = 1.6; cap.position.z = z * 11.8; g.add(cap);
  }
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

const Z = new THREE.Vector3(0, 0, 1);
const tmpV = new THREE.Vector3();
/** Point a group's local Z along `axis`. */
function alignZ(obj, axis) { obj.quaternion.setFromUnitVectors(Z, tmpV.set(...axis).normalize()); }

const mid = (R) => v.lerp(R.J.grip1, R.J['grip-1'], 0.5);

/** Lowest grip height over the rep (keeps plates from sinking into the floor). */
function lowestGrip(ex, ox) {
  let y = Infinity;
  for (let i = 0; i <= 8; i += 1) { const R = rig(ex, i / 8, ox); y = Math.min(y, R.J.grip1[1], R.J['grip-1'][1]); }
  return y;
}

/** Equipment. Returns update(R), which moves the pieces that follow the body. */
export function buildProps(group, ex, mat, ox) {
  const updates = [];
  const add = (m) => { m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); group.add(m); return m; };
  const R0 = rig(ex, 0, ox);
  for (const p of ex.props) {
    if (p.t === 'line') {
      const pts = p.pts.map(([x, y]) => [x - ox, FLOOR_Y - y, 0]);
      if (p.kind === 'bar') {
        // Pull-up bar: sits in the athlete's fists.
        const bar = add(new THREE.Mesh(cyl(1.6), mat.chrome));
        bar.rotation.x = Math.PI / 2; bar.scale.y = 110;
        const c = mid(R0); bar.position.set(c[0], c[1], 0);
        for (const z of [-55, 55]) {
          const post = add(new THREE.Mesh(cyl(2.2), mat.frame));
          post.scale.y = c[1] + 8; post.position.set(c[0], (c[1] + 8) / 2, z);
        }
        continue;
      }
      for (let i = 0; i < pts.length - 1; i += 1) {
        const a = pts[i]; const b = pts[i + 1];
        const len = v.len(v.sub(b, a));
        const zs = p.kind === 'dipbars' ? [-26, 26] : [p.z || 0];
        for (const z of zs) {
          const thin = p.kind === 'dipbars' || p.w <= 6;
          const depth = p.d || (thin ? 5 : 30);
          let m;
          if (p.kind === 'dipbars') {
            m = new THREE.Mesh(cyl(2.2), mat.chrome); m.scale.y = len; m.rotation.z = Math.PI / 2;
          } else if (thin) {
            m = new THREE.Mesh(new RoundedBoxGeometry(len, p.w * 0.7, Math.min(depth, 5), 2, 1), mat.frame);
          } else {
            m = new THREE.Mesh(new RoundedBoxGeometry(len, p.w, depth, 4, Math.min(3, p.w / 2 - 0.2)), mat.pad);
          }
          m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z);
          m.rotation.z = Math.atan2(b[1] - a[1], b[0] - a[0]) + (p.kind === 'dipbars' ? Math.PI / 2 : 0);
          add(m);
        }
      }
      continue;
    }
    if (p.t === 'barbell') {
      const want = p.r || 22;
      const fromFloor = p.at === 'hand' || !p.at ? lowestGrip(ex, ox) : p.at === 'hip' ? Infinity : Infinity;
      const g = add(barbell(mat, Math.max(8, Math.min(want, fromFloor))));
      updates.push((R) => {
        let base = p.at === 'neck' ? R.J.neck : p.at === 'hip' ? R.J.hip : mid(R);
        if (p.at === 'back') base = backBarPoint(R.J, R.bones.find((x) => x.key === 'chest'));
        g.position.set(base[0] + (p.dx || 0), base[1] - (p.dy || 0), 0);
      });
    } else if (p.t === 'dumbbell') {
      // `one`: only the near hand holds it (one-arm row); `mid`: one dumbbell in both hands (goblet squat).
      const sides = ex.view === 'front' ? [p.at === 'handL' ? -1 : 1] : p.one ? [1] : p.mid ? [0] : [1, -1];
      for (const s of sides) {
        const g = add(dumbbell(mat));
        if (s === 0) g.rotation.x = Math.PI / 2; // goblet: held upright against the chest
        updates.push((R) => {
          if (s === 0) { g.position.set(...mid(R)); return; }
          g.position.set(...R.J[`grip${s}`]);
          alignZ(g, R.axes[`grip${s}`]);
        });
      }
    } else if (p.t === 'grip') {
      const g = add(new THREE.Mesh(cyl(1.4), mat.chrome)); g.rotation.x = Math.PI / 2;
      updates.push((R) => { const c = mid(R); g.position.set(c[0], c[1], 0); g.scale.y = Math.abs(R.J.grip1[2] - R.J['grip-1'][2]) + 14; });
    } else if (p.t === 'cable') {
      const from = ex.view === 'front' ? [0, FLOOR_Y - p.from[1], p.from[0] - 150] : [p.from[0] - ox, FLOOR_Y - p.from[1], 0];
      const pulley = add(new THREE.Mesh(new THREE.TorusGeometry(4, 1.6, 12, 32), mat.frame)); pulley.position.set(...from);
      const hub = add(new THREE.Mesh(cyl(1.4), mat.chrome)); hub.rotation.x = Math.PI / 2; hub.scale.y = 4; hub.position.set(...from);
      const wire = add(new THREE.Mesh(cyl(0.55, 8), mat.cable));
      updates.push((R) => {
        const to = ex.view === 'front' ? R.J[p.to === 'handL' ? 'grip-1' : 'grip1'] : p.one ? R.J.grip1 : mid(R);
        stretchBetween(wire, from, to);
      });
    } else if (p.t === 'pad') {
      const pad = add(new THREE.Mesh(new THREE.CapsuleGeometry(5.5, 22, 6, 16), mat.foam)); pad.rotation.x = Math.PI / 2;
      updates.push((R) => {
        const c = p.at === 'knee' ? v.lerp(R.J.knee1, R.J['knee-1'], 0.5) : v.lerp(R.J.ankle1, R.J['ankle-1'], 0.5);
        pad.position.set(c[0], c[1] - (p.dy || 0), 0);
      });
    } else if (p.t === 'seat') {
      const seat = add(new THREE.Mesh(new RoundedBoxGeometry(1, 1, 1, 3, 0.06), mat.pad));
      const back = p.back && add(new THREE.Mesh(new RoundedBoxGeometry(1, 1, 1, 3, 0.1), mat.pad));
      updates.push((R) => {
        const h = Math.max(4, R.J.hip[1] - 8);
        seat.scale.set(p.depth || 34, h, 34); seat.position.set(R.J.hip[0] + (p.dx || 0), h / 2, 0);
        if (back) { const top = R.J.neck[1] - 4; back.scale.set(6, top - h, 30); back.position.set(R.J.hip[0] - 13, (top + h) / 2, 0); }
      });
    } else if (p.t === 'sled') {
      const sled = add(new THREE.Mesh(new RoundedBoxGeometry(3, 36, 40, 2, 1), mat.frame));
      updates.push((R) => { const c = v.lerp(R.J.toe1, R.J['toe-1'], 0.5); sled.position.set(c[0] + 2, c[1], 0); sled.rotation.z = -((p.angle - 90) * Math.PI) / 180; });
    }
  }
  return (R) => updates.forEach((u) => u(R));
}

/* ── Camera ───────────────────────────────────────────────────────────── */
export function framing(ex) {
  const pts = [];
  for (const t of [0, 0.5, 1]) { const R = rig(ex, t, 0); pts.push(...Object.values(R.J)); }
  const min = [0, 1, 2].map((i) => Math.min(...pts.map((p) => p[i])));
  const max = [0, 1, 2].map((i) => Math.max(...pts.map((p) => p[i])));
  const ox = ex.view === 'front' ? 150 : (min[0] + max[0]) / 2;
  // Head top sits ~20 above the head joint; keep it in frame.
  // Head top sits ~22 above the head joint: keep it, and the chips over it, in frame.
  return { ox, cy: (min[1] + max[1] + 22) / 2, size: Math.max(max[0] - min[0], max[1] - min[1] + 34, 100) };
}

export function defaultView(ex) {
  if (ex.cam) return ex.cam;
  const lying = Math.abs(Math.sin((ex.A.torso * Math.PI) / 180)) < 0.6;
  const f0 = ex.focus[0];
  const back = BACK_MUSCLES.has(f0.split('.')[0]) || f0 === 'shoulders.rear';
  if (lying) return { az: back ? 115 : 65, el: 34 };
  return { az: ex.view === 'front' ? 14 : back ? 130 : 58, el: 8 };
}
