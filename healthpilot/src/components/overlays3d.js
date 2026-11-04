/**
 * Coaching overlays drawn into the 3-D scene:
 *   • bar path    the load's trajectory through the whole rep, with a marker riding on it
 *                 and an arrow showing which way it is moving right now
 *   • force line  dashed line through the load, along the resistance (gravity / cable)
 *   • lever arm   from the working joint, square to the force line; thicker and
 *                 brighter as the stress on the target muscle rises
 * Overlays are drawn on top of the body (no depth test) with a faint "ghost" so the
 * part of a path that runs behind the body still reads.
 */
import * as THREE from 'three';
import { v } from '../lib/rig3d.js';
import { biomechAt, trajectory } from '../lib/biomech.js';

export const OVERLAY_COLOR = { path: '#0ea5e9', lever: '#ff3b30', force: '#334155', lift: '#ff3b30', lower: '#ff9f0a' };

const Y = new THREE.Vector3(0, 1, 0);
const tq = new THREE.Quaternion();
const tv = new THREE.Vector3();
function between(mesh, a, b) {
  const d = v.sub(b, a); const len = v.len(d) || 1e-3;
  mesh.position.set(...v.lerp(a, b, 0.5));
  mesh.quaternion.copy(tq.setFromUnitVectors(Y, tv.set(...v.mul(d, 1 / len))));
  mesh.scale.set(1, len, 1);
  return len;
}

function dashTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 32;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 4, 18);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  return t;
}

const onTop = (m, order) => { m.renderOrder = order; return m; };

/**
 * Builds the overlay meshes for an exercise. Returns
 *   update(t, stage, stress) → { lever, P } per frame
 *   setVisible({ path, forces })
 *   dispose()
 */
export function buildOverlays(scene, ex, ox, { dark = false, markers = true } = {}) {
  const group = new THREE.Group(); scene.add(group);
  const mats = [];
  const mk = (opts) => { const m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, ...opts }); mats.push(m); return m; };

  // Bar path: solid where visible, faint ghost where the body is in front of it.
  const pts = trajectory(ex, ox, 48).map((p) => new THREE.Vector3(...p));
  const travel = pts[0].distanceTo(pts[pts.length - 1]);
  const pathGroup = new THREE.Group(); group.add(pathGroup);
  if (travel > 4) {
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.TubeGeometry(curve, 96, 0.85, 10, false);
    pathGroup.add(onTop(new THREE.Mesh(tube, mk({ color: OVERLAY_COLOR.path, opacity: 0.95 })), 8));
    pathGroup.add(onTop(new THREE.Mesh(tube, mk({ color: OVERLAY_COLOR.path, opacity: 0.28, depthTest: false })), 9));
    for (const end of [pts[0], pts[pts.length - 1]]) {
      const cap = onTop(new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 12), mk({ color: OVERLAY_COLOR.path, opacity: 0.9, depthTest: false })), 9);
      cap.position.copy(end); pathGroup.add(cap);
    }
  }
  // Marker riding the path + direction arrow.
  const marker = onTop(new THREE.Mesh(new THREE.SphereGeometry(2.1, 20, 14), mk({ color: '#ffffff', depthTest: false })), 11);
  const markerRing = onTop(new THREE.Mesh(new THREE.SphereGeometry(3.1, 20, 14), mk({ color: OVERLAY_COLOR.path, opacity: 0.35, depthTest: false })), 10);
  const arrow = onTop(new THREE.Mesh(new THREE.ConeGeometry(2.4, 6, 18), mk({ color: OVERLAY_COLOR.lift, depthTest: false })), 11);
  pathGroup.add(markerRing, marker, arrow);
  if (!markers) { marker.visible = false; markerRing.visible = false; arrow.visible = false; }

  // Force line (dashed) and lever arm.
  const forceGroup = new THREE.Group(); group.add(forceGroup);
  const dash = dashTexture(); dash.repeat.set(1, 9);
  const force = onTop(new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1, 8, 1, true), mk({ color: dark ? '#e2e8f0' : OVERLAY_COLOR.force, map: dash, opacity: 0.95, depthTest: false })), 7);
  const forceTip = onTop(new THREE.Mesh(new THREE.ConeGeometry(2.4, 6, 14), mk({ color: dark ? '#e2e8f0' : OVERLAY_COLOR.force, opacity: 0.95, depthTest: false })), 7);
  const lever = onTop(new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12), mk({ color: OVERLAY_COLOR.lever, depthTest: false })), 12);
  const pivot = onTop(new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.7, 10, 28), mk({ color: OVERLAY_COLOR.lever, depthTest: false })), 12);
  const foot = onTop(new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 10), mk({ color: OVERLAY_COLOR.lever, depthTest: false })), 12);
  forceGroup.add(force, forceTip, lever, pivot, foot);

  const cache = {};
  let prevP = null;
  const camFacing = new THREE.Quaternion();
  return {
    group,
    update(t, stage, stress = 1, camera = null) {
      const bm = biomechAt(ex, t, ox, cache);
      const { P, d } = bm;
      marker.position.set(...P); markerRing.position.set(...P);
      markerRing.scale.setScalar(0.85 + 0.3 * stress);
      // Arrow: along the current direction of travel, just ahead of the marker.
      if (prevP) {
        const vel = v.sub(P, prevP);
        if (markers && v.len(vel) > 0.01) {
          const dir = v.norm(vel);
          arrow.visible = true;
          arrow.position.set(...v.add(P, v.mul(dir, 6.5)));
          arrow.quaternion.copy(tq.setFromUnitVectors(Y, tv.set(...dir)));
          arrow.material.color.set(stage === 'lift' ? OVERLAY_COLOR.lift : OVERLAY_COLOR.lower);
        } else arrow.visible = false;
      }
      prevP = P;

      // Force line through the load: a little behind it, mostly in the direction it pulls.
      const a = v.add(P, v.mul(d, -6)); const b = v.add(P, v.mul(d, 46));
      between(force, a, b);
      forceTip.position.set(...v.add(b, v.mul(d, 2)));
      forceTip.quaternion.copy(tq.setFromUnitVectors(Y, tv.set(...d)));

      if (bm.lever && bm.lever.length > 0.5) {
        const J = bm.R.J[bm.joint.key];
        lever.visible = true; foot.visible = true; pivot.visible = true;
        between(lever, J, bm.lever.foot);
        const r = 0.8 + 1.1 * stress;
        lever.scale.x = r; lever.scale.z = r;
        lever.material.opacity = 0.45 + 0.55 * stress;
        foot.position.set(...bm.lever.foot);
        pivot.position.set(...J);
        if (camera) pivot.quaternion.copy(camFacing.copy(camera.quaternion));
      } else { lever.visible = false; foot.visible = false; pivot.visible = false; }
      return bm;
    },
    setVisible({ path = true, forces = true }) { pathGroup.visible = path; forceGroup.visible = forces; },
    dispose() {
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      mats.forEach((m) => m.dispose()); dash.dispose(); scene.remove(group);
    },
  };
}
