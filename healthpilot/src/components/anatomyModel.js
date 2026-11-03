/**
 * Real human anatomy for the 3-D trainer.
 *
 * Muscles and bones come from BodyParts3D (scanned from a real human body),
 * pre-processed by the build script into one skinned mesh: Int16 positions,
 * 4 bone indices + 4 weights per vertex, and index ranges per muscle group so
 * each group can get its own material (red = target, orange = helpers).
 *
 * BodyParts3D, Copyright© The Database Center for Life Science licensed by
 * CC Attribution-Share Alike 2.1 Japan.
 */
import * as THREE from 'three';
import { v } from '../lib/rig3d.js';

export const ANATOMY_CREDIT = 'BodyParts3D, Copyright© The Database Center for Life Science licensed by CC Attribution-Share Alike 2.1 Japan';

let cache = null;
export function loadAnatomy() {
  if (!cache) {
    const base = `${import.meta.env.BASE_URL}anatomy/`;
    cache = Promise.all([
      fetch(`${base}anatomy.json`).then((r) => { if (!r.ok) throw new Error('anatomy.json'); return r.json(); }),
      fetch(`${base}anatomy.bin`).then((r) => { if (!r.ok) throw new Error('anatomy.bin'); return r.arrayBuffer(); }),
    ]).catch((e) => { cache = null; throw e; });
  }
  return cache;
}

const restMatrix = (fr) => new THREE.Matrix4().makeBasis(
  new THREE.Vector3(...fr.l), new THREE.Vector3(...fr.u), new THREE.Vector3(...fr.f),
).setPosition(...fr.a);

/** Build the skinned mesh. `materialFor(group)` returns the material for a muscle group id. */
export function buildAnatomy([meta, buf], materialFor) {
  const n = meta.vertexCount;
  let off = 0;
  const pos16 = new Int16Array(buf, off, n * 3); off += n * 6;
  const skinIndex = new Uint8Array(buf, off, n * 4); off += n * 4;
  const skinWeight = new Uint8Array(buf, off, n * 4); off += n * 4;
  off += (4 - (off % 4)) % 4;
  const index = meta.indexType === 'u16' ? new Uint16Array(buf, off, meta.indexCount) : new Uint32Array(buf, off, meta.indexCount);

  const pos = new Float32Array(n * 3);
  for (let i = 0; i < pos.length; i += 1) pos[i] = pos16[i] / meta.quant;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4, true));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeVertexNormals();
  const materials = [];
  meta.groups.forEach((g, i) => { geo.addGroup(g.start, g.count, i); materials.push(materialFor(g.group)); });

  const bones = meta.bones.map((name) => {
    const b = new THREE.Bone(); b.name = name;
    b.matrixAutoUpdate = false; b.matrixWorldAutoUpdate = false;
    return b;
  });
  const inverses = meta.bones.map((name) => restMatrix(meta.rest[name]).invert());
  const skeleton = new THREE.Skeleton(bones, inverses);
  const mesh = new THREE.SkinnedMesh(geo, materials);
  mesh.bind(skeleton, new THREE.Matrix4());
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, skeleton, meta };
}

const tmp = new THREE.Matrix4();
const sc = new THREE.Matrix4();

/** Move the anatomy's bones to a rigged pose (from rig3d.rig). */
export function poseAnatomy({ skeleton, meta }, R) {
  const byKey = {};
  for (const b of R.bones) byKey[b.side ? `${b.key}${b.side}` : b.key] = b;
  for (const bone of skeleton.bones) {
    const name = bone.name;
    let fr;
    let stretch = 1;
    if (name === 'head') {
      const t = byKey.torso;
      const u = v.norm(v.sub(R.J.head, R.J.neck));
      let f = v.sub(t.f, v.mul(u, v.dot(t.f, u))); f = v.norm(f);
      fr = { a: R.J.neck, u, f, l: v.norm(v.cross(u, f)) };
    } else if (name.startsWith('hand')) {
      const fa = byKey[`fa${name.slice(4)}`];
      fr = { ...fa, a: fa.b };
    } else {
      fr = byKey[name];
      const rest = meta.rest[name];
      if (!/^foot/.test(name)) stretch = v.len(v.sub(fr.b, fr.a)) / rest.len;
    }
    tmp.makeBasis(new THREE.Vector3(...fr.l), new THREE.Vector3(...fr.u), new THREE.Vector3(...fr.f)).setPosition(...fr.a);
    if (stretch !== 1) tmp.multiply(sc.makeScale(1, stretch, 1));
    bone.matrixWorld.copy(tmp);
  }
}
