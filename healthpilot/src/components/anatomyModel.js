/**
 * The anatomy layer under the skin: 158 muscles and the skeleton, scanned from a
 * real human body (BodyParts3D), skinned to the same 17-bone rig as the body so
 * both move together. When the skin turns to glass, this is what you see.
 *
 * Packed by tools/anatomy (bp_build.py): Int16 positions, 4 bone indices +
 * weights per vertex, and index ranges per muscle head ('chest.upper', …,
 * 'muscle' = every other muscle, 'bone' = skeleton).
 *
 * BodyParts3D, Copyright© The Database Center for Life Science licensed by
 * CC Attribution-Share Alike 2.1 Japan.
 */
import * as THREE from 'three';
import { boneFrames } from './bodyModel.js';

export const ANATOMY_CREDIT = 'Muscles and skeleton: BodyParts3D © The Database Center for Life Science, CC BY-SA 2.1 JP';

let cache = null;
export function loadAnatomy() {
  if (!cache) {
    const base = `${import.meta.env.BASE_URL}body/`;
    cache = Promise.all([
      fetch(`${base}anatomy.json`).then((r) => { if (!r.ok) throw new Error('anatomy.json'); return r.json(); }),
      fetch(`${base}anatomy.bin`).then((r) => { if (!r.ok) throw new Error('anatomy.bin'); return r.arrayBuffer(); }),
    ]).catch((e) => { cache = null; throw e; });
  }
  return cache;
}

/**
 * Materials: resting muscle in a natural red-brown, bone in ivory, the target
 * muscle in hot red and helpers in amber; their glow is driven per frame.
 */
export function anatomyMaterials(dark) {
  return {
    // Resting muscle pale, so only the working muscles carry strong colour.
    muscle: new THREE.MeshPhysicalMaterial({ color: dark ? '#b48478' : '#d6a597', roughness: 0.5, sheen: 0.5, sheenColor: new THREE.Color('#fff0ea'), sheenRoughness: 0.6 }),
    bone: new THREE.MeshStandardMaterial({ color: '#f2ebdd', roughness: 0.6 }),
    primary: new THREE.MeshPhysicalMaterial({ color: '#ff2414', emissive: '#ff1200', emissiveIntensity: 0.7, roughness: 0.35, sheen: 0.4, sheenColor: new THREE.Color('#ffd6cf') }),
    secondary: new THREE.MeshPhysicalMaterial({ color: '#ffad42', emissive: '#ff8400', emissiveIntensity: 0.15, roughness: 0.45 }),
    // Core muscles that only brace get a faint tint.
    stabiliser: new THREE.MeshPhysicalMaterial({ color: '#efc39a', roughness: 0.5 }),
    veil: new THREE.MeshStandardMaterial({ color: '#e6c2b6', roughness: 0.5, transparent: true, opacity: 0.16, depthWrite: false }),
  };
}

/** Material key for an anatomy group in an exercise. */
export function anatomyRole(ex, group, headRole, seeThrough) {
  if (group === 'bone') return 'bone';
  if (seeThrough(ex, group)) return 'veil';
  const r = headRole(ex, group);
  if (r === 'secondary' && /^(abs|lowerback)/.test(group)) return 'stabiliser';
  return r === 'primary' || r === 'secondary' ? r : 'muscle';
}

const restMatrix = (fr) => new THREE.Matrix4().makeBasis(
  new THREE.Vector3(...fr.l), new THREE.Vector3(...fr.u), new THREE.Vector3(...fr.f),
).setPosition(...fr.a);

/** Build the skinned anatomy mesh. `materialFor(group)` picks the material for a muscle head / 'muscle' / 'bone'. */
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
  const skeleton = new THREE.Skeleton(bones, meta.bones.map((name) => restMatrix(meta.rest[name]).invert()));
  const mesh = new THREE.SkinnedMesh(geo, materials);
  mesh.bind(skeleton, new THREE.Matrix4());
  mesh.frustumCulled = false;
  return { mesh, skeleton, meta };
}

const tmp = new THREE.Matrix4();
const sc = new THREE.Matrix4();
/** Move the anatomy to a rigged pose (same maths as the body). */
export function poseAnatomy({ skeleton, meta }, R) {
  boneFrames(meta, R).forEach(({ fr, stretch }, i) => {
    tmp.makeBasis(new THREE.Vector3(...fr.l), new THREE.Vector3(...fr.u), new THREE.Vector3(...fr.f)).setPosition(...fr.a);
    if (stretch !== 1) tmp.multiply(sc.makeScale(1, stretch, 1));
    skeleton.bones[i].matrixWorld.copy(tmp);
  });
}
