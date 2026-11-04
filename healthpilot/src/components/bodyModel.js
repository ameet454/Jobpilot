/**
 * The 3-D trainer's human body.
 *
 * A realistic skinned body (MakeHuman base mesh, CC0) built by
 * tools/body/build_body.py: Int16 positions, 4 bone indices + weights, the two
 * muscle heads under each skin vertex (+ strengths), a paint id (skin, shorts,
 * hair, eyes) and a baked cavity term for muscle definition.
 *
 * Muscles are not separate meshes: the shader tints the skin over the working
 * muscle (red = target, amber = helpers), so the body always looks like a
 * person — never like a dissection.
 */
import * as THREE from 'three';
import { v } from '../lib/rig3d.js';

export const BODY_CREDIT = 'Human model based on the MakeHuman base mesh (CC0)';

let cache = null;
export function loadBody() {
  if (!cache) {
    const base = `${import.meta.env.BASE_URL}body/`;
    cache = Promise.all([
      fetch(`${base}body.json`).then((r) => { if (!r.ok) throw new Error('body.json'); return r.json(); }),
      fetch(`${base}body.bin`).then((r) => { if (!r.ok) throw new Error('body.bin'); return r.arrayBuffer(); }),
    ]).catch((e) => { cache = null; throw e; });
  }
  return cache;
}

/** Unpack the binary into typed arrays (also used by the Node clash test). */
export function unpackBody(meta, buf) {
  const n = meta.vertexCount;
  let off = 0;
  const take = (Ctor, count, bytes) => { const a = new Ctor(buf, off, count); off += count * bytes; return a; };
  const pos16 = take(Int16Array, n * 3, 2);
  const skinIndex = take(Uint8Array, n * 4, 1);
  const skinWeight = take(Uint8Array, n * 4, 1);
  const muscle = take(Uint8Array, n * 2, 1);
  const muscleW = take(Uint8Array, n * 2, 1);
  const attr = take(Uint8Array, n * 2, 1);
  off += (4 - (off % 4)) % 4;
  const cut16 = take(Int16Array, n * 5, 2);
  off += (4 - (off % 4)) % 4;
  const fc = meta.flatCount || 0;
  const flatIdx = take(Uint16Array, fc, 2);
  off += (4 - (off % 4)) % 4;
  const flat16 = take(Int16Array, fc * 3, 2);
  off += (4 - (off % 4)) % 4;
  const flat = new Float32Array(n * 3);
  for (let i = 0; i < fc; i += 1) for (let k = 0; k < 3; k += 1) flat[flatIdx[i] * 3 + k] = flat16[i * 3 + k] / meta.quant;
  const index = meta.indexType === 'u16' ? new Uint16Array(buf, off, meta.indexCount) : new Uint32Array(buf, off, meta.indexCount);
  const position = new Float32Array(n * 3);
  for (let i = 0; i < position.length; i += 1) position[i] = pos16[i] / meta.quant;
  const cuts = new Float32Array(cut16.length);
  for (let i = 0; i < cuts.length; i += 1) cuts[i] = cut16[i] / meta.cutScale;
  return { position, skinIndex, skinWeight, muscle, muscleW, attr, cuts, flat, index };
}

const restMatrix = (fr) => new THREE.Matrix4().makeBasis(
  new THREE.Vector3(...fr.l), new THREE.Vector3(...fr.u), new THREE.Vector3(...fr.f),
).setPosition(...fr.a);

export const BODY_PALETTE = {
  light: { skin: '#b98262', shorts: '#1f2933', hair: '#2a211c', sclera: '#eeeae4', iris: '#3b2a20', band: '#e8eef3' },
  dark: { skin: '#b98262', shorts: '#2b3440', hair: '#231b16', sclera: '#e6e2dc', iris: '#3b2a20', band: '#9fb2c4' },
};
export const GLOW = { primary: '#ff3b30', secondary: '#ff9f0a' };

/**
 * The skin material. `uniforms.role[i]` is 2 for a target head, 1 for a helper,
 * 0 otherwise; `uniforms.glow` (0..1) is the effort pulse.
 */
function bodyMaterial(meta, dark) {
  const pal = BODY_PALETTE[dark ? 'dark' : 'light'];
  const uniforms = {
    role: { value: new Float32Array(32) },
    glow: { value: 0.6 },
    idMode: { value: 0 }, idStep: { value: 7 },
    cPrimary: { value: new THREE.Color(GLOW.primary) },
    cSecondary: { value: new THREE.Color(GLOW.secondary) },
    palette: { value: ['skin', 'shorts', 'hair', 'sclera', 'iris', 'band'].map((k) => new THREE.Color(pal[k])) },
  };
  const mat = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', roughness: 0.52, metalness: 0, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffd9c4'),
  });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aMus; attribute vec2 aMusW; attribute vec2 aAttr; attribute vec4 aCut; attribute float aBrow;
        uniform float role[32];
        varying float vAO; varying float vHot; varying float vWarm; varying vec4 vCut; varying float vBrow; varying float vEye;
        flat varying float vId;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vId = (aMusW.x > 0.5 && aAttr.x < 0.5) ? aMus.x + 1.0 : 0.0;
        vEye = aAttr.x; vAO = aAttr.y * 1.06; vCut = aCut; vBrow = aBrow;
        vHot = 0.0; vWarm = 0.0;
        for (int j = 0; j < 2; j++) {
          float r = role[int(aMus[j] + 0.5)];
          float w = aMusW[j];
          vHot += r > 1.5 ? w : 0.0;
          vWarm += (r > 0.01 && r < 1.5) ? w * r : 0.0;
        }
        vHot = clamp(vHot, 0.0, 1.0); vWarm = clamp(vWarm, 0.0, 1.0) * (1.0 - vHot);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float glow; uniform vec3 cPrimary; uniform vec3 cSecondary; uniform vec3 palette[6];
        uniform float idMode; uniform float idStep; flat varying float vId;
        varying float vAO; varying float vHot; varying float vWarm; varying vec4 vCut; varying float vBrow; varying float vEye;
        float edge(float d) { float w = fwidth(d) * 0.75 + 1e-4; return smoothstep(-w, w, d); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float shorts = edge(vCut.x) * edge(vCut.y) * (1.0 - vEye);
        float band = shorts * (1.0 - edge(vCut.y - 2.4));
        float hair = smoothstep(-1.1, 0.9, vCut.z) * (1.0 - vEye) * 0.92;
        float brow = smoothstep(0.0, 0.45, vBrow) * (1.0 - vEye) * 0.8;
        vec3 base = palette[0];
        base = mix(base, palette[2], max(hair, brow));
        base = mix(base, palette[1], shorts);
        base = mix(base, palette[5], band);
        vec3 eye = mix(palette[3], palette[4], edge(vCut.w));
        base = mix(base, eye, vEye);
        float skin = (1.0 - shorts) * (1.0 - vEye) * (1.0 - hair);
        float hot = vHot * (1.0 - shorts * 0.6) * (1.0 - vEye);
        float warm = vWarm * (1.0 - shorts * 0.6) * (1.0 - vEye);
        base = mix(base, cSecondary, warm * 0.38);
        base = mix(base, cPrimary, hot * (0.58 + 0.25 * glow));
        diffuseColor.rgb = base * mix(1.0, vAO, 0.9);
        float vCloth = shorts;
        float vHotOut = hot; float vWarmOut = warm;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.95, vCloth);
        roughnessFactor = mix(roughnessFactor, 0.9, max(hair, brow));
        roughnessFactor = mix(roughnessFactor, 0.25, vEye);`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        if (idMode > 0.5) gl_FragColor = vec4(vId * idStep / 255.0, 0.0, 0.0, 1.0);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += cPrimary * vHotOut * (0.08 + 0.30 * glow) + cSecondary * vWarmOut * 0.05;`);
  };
  mat.customProgramCacheKey = () => 'hp-body-v4';
  return { mat, uniforms };
}

/** Build the skinned body mesh. */
export function buildBody([meta, buf], { dark = false } = {}) {
  const d = unpackBody(meta, buf);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(d.position, 3));
  geo.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(d.skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(d.skinWeight, 4, true));
  geo.setAttribute('aMus', new THREE.BufferAttribute(Float32Array.from(d.muscle), 2));
  geo.setAttribute('aMusW', new THREE.BufferAttribute(d.muscleW, 2, true));
  const attr = new Float32Array(d.attr.length);
  for (let i = 0; i < attr.length; i += 2) { attr[i] = d.attr[i]; attr[i + 1] = d.attr[i + 1] / 255; }
  geo.setAttribute('aAttr', new THREE.BufferAttribute(attr, 2));
  const n = meta.vertexCount;
  const cut = new Float32Array(n * 4); const brow = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    for (let k = 0; k < 4; k += 1) cut[i * 4 + k] = d.cuts[i * 5 + k];
    brow[i] = d.cuts[i * 5 + 4];
  }
  geo.setAttribute('aCut', new THREE.BufferAttribute(cut, 4));
  geo.setAttribute('aBrow', new THREE.BufferAttribute(brow, 1));
  geo.setIndex(new THREE.BufferAttribute(d.index, 1));
  geo.computeVertexNormals();
  // Morph 0: palms flat (push-ups). Normals for the morph come from the morphed shape.
  const flatGeo = new THREE.BufferGeometry();
  const fp = new Float32Array(d.position.length);
  for (let i = 0; i < fp.length; i += 1) fp[i] = d.position[i] + d.flat[i];
  flatGeo.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  flatGeo.setIndex(geo.index);
  flatGeo.computeVertexNormals();
  const dn = new Float32Array(fp.length);
  const n0 = geo.attributes.normal.array; const n1 = flatGeo.attributes.normal.array;
  for (let i = 0; i < dn.length; i += 1) dn[i] = n1[i] - n0[i];
  geo.morphAttributes.position = [new THREE.BufferAttribute(d.flat, 3)];
  geo.morphAttributes.normal = [new THREE.BufferAttribute(dn, 3)];
  geo.morphTargetsRelative = true;
  flatGeo.dispose();

  const bones = meta.bones.map((name) => {
    const b = new THREE.Bone(); b.name = name;
    b.matrixAutoUpdate = false; b.matrixWorldAutoUpdate = false;
    return b;
  });
  const inverses = meta.bones.map((name) => restMatrix(meta.rest[name]).invert());
  const skeleton = new THREE.Skeleton(bones, inverses);
  const { mat, uniforms } = bodyMaterial(meta, dark);
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.bind(skeleton, new THREE.Matrix4());
  mesh.morphTargetInfluences = [0];
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, skeleton, meta, uniforms, material: mat };
}

/** Light up muscle heads: `roleOf(head)` → 'primary' | 'secondary' | anything else. */
export function setRoles(body, roleOf) {
  const r = body.uniforms.role.value;
  r.fill(0);
  body.meta.heads.forEach((h, i) => {
    const role = roleOf(h);
    // Core muscles bracing as helpers get a fainter tint so they don't read as a vest.
    const stabiliser = /^(abs|lowerback)/.test(h);
    r[i] = role === 'primary' ? 2 : role === 'secondary' ? (stabiliser ? 0.4 : 1) : 0;
  });
}

/** 'fist' (default) or 'flat' palms. */
export function setHands(body, shape) {
  body.mesh.morphTargetInfluences[0] = shape === 'flat' ? 1 : 0;
}

/** Bone world matrices for a rigged pose, as plain {fr, stretch} records (shared with tests). */
export function boneFrames(meta, R) {
  const byKey = {};
  for (const b of R.bones) byKey[b.side ? `${b.key}${b.side}` : b.key] = b;
  return meta.bones.map((name) => {
    let fr;
    let stretch = 1;
    if (name === 'head') {
      const t = byKey.chest;
      const u = v.norm(v.sub(R.J.head, R.J.neck));
      let f = v.sub(t.f, v.mul(u, v.dot(t.f, u))); f = v.norm(f);
      fr = { a: R.J.neck, u, f, l: v.norm(v.cross(u, f)) };
    } else if (name.startsWith('hand')) {
      const fa = byKey[`fa${name.slice(4)}`];
      fr = { ...fa, a: fa.b };
    } else {
      fr = byKey[name];
      if (!/^foot/.test(name)) stretch = v.len(v.sub(fr.b, fr.a)) / meta.rest[name].len;
    }
    return { fr, stretch };
  });
}

const tmp = new THREE.Matrix4();
const sc = new THREE.Matrix4();
/** Move the body's bones to a rigged pose (from rig3d.rig). */
export function poseBody({ skeleton, meta }, R) {
  boneFrames(meta, R).forEach(({ fr, stretch }, i) => {
    tmp.makeBasis(new THREE.Vector3(...fr.l), new THREE.Vector3(...fr.u), new THREE.Vector3(...fr.f)).setPosition(...fr.a);
    if (stretch !== 1) tmp.multiply(sc.makeScale(1, stretch, 1));
    skeleton.bones[i].matrixWorld.copy(tmp);
  });
}

const tmpV = new THREE.Vector3();
/** Current world position on the skin over a muscle head (athlete's right side). */
export function bodyAnchor({ skeleton, meta }, key) {
  const k = meta.anchors[key] ? key : Object.keys(meta.anchors).find((a) => a.split('.')[0] === key.split('.')[0]);
  const a = k && meta.anchors[k];
  if (!a) return null;
  const i = meta.bones.indexOf(a.bone);
  tmpV.set(...a.c).applyMatrix4(skeleton.boneInverses[i]).applyMatrix4(skeleton.bones[i].matrixWorld);
  return tmpV.toArray();
}
