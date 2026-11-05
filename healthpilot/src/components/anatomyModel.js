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
import { boneFrames, CLAY, HP_GLSL } from './bodyModel.js';

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

/** Shared contraction amount (0..1) for the working muscles in the anatomy. */
export const anatomyPump = { value: 0 };

/**
 * Muscle shading, as in anatomy atlases: fine fibre striations running along each
 * muscle's long axis (colour and relief), glossy white tendon at the ends of long
 * muscles, and a swell along the normals as the working muscles contract.
 */
function muscleShader(mat, { swell = 0, fibre = 1, tendon = 1, key }) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.pump = anatomyPump;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float pump; attribute vec4 aFibre; varying vec4 vFib; varying vec3 vRestA;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vFib = aFibre; vRestA = position;
        transformed += normal * pump * ${swell.toFixed(2)} * (1.0 - aFibre.w);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vFib; varying vec3 vRestA;
        ${HP_GLSL}
        float hp_fibre() {
          vec3 d = vFib.xyz; float l = length(d);
          if (l < 0.2) return hp_noise(vRestA * 1.4) * 0.5;
          d /= l;
          float along = dot(vRestA, d); vec3 across = vRestA - d * along;
          return hp_noise(across * 2.6 + d * along * 0.16) * 0.6 + hp_noise(across * 7.0 + d * along * 0.4 + 11.0) * 0.4;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float fib = hp_fibre();
        float ten = smoothstep(0.05, 0.85, vFib.w) * ${tendon.toFixed(2)};
        diffuseColor.rgb *= 1.0 + ${(0.22 * fibre).toFixed(3)} * fib;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.9, 0.85), ten);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.3, ten);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = hp_bump(-vViewPosition, normal, fib * ${(0.06 * fibre).toFixed(3)} * (1.0 - ten), faceDirection);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance *= 1.0 - ten * 0.8;`);
  };
  mat.customProgramCacheKey = () => `hp-muscle-${key}`;
  return mat;
}

/**
 * Atlas-style colours on the dark stage: the figure in pale clay (muscles with their
 * fibres, ivory bone), the target muscle in vivid red, helpers in amber.
 */
export function anatomyMaterials() {
  return {
    muscle: muscleShader(new THREE.MeshPhysicalMaterial({ color: CLAY, roughness: 0.55, sheen: 0.35, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ffffff') }), { key: 'rest', fibre: 0.8 }),
    bone: new THREE.MeshPhysicalMaterial({ color: '#efe4cf', roughness: 0.45, clearcoat: 0.25, clearcoatRoughness: 0.5 }),
    primary: muscleShader(new THREE.MeshPhysicalMaterial({ color: '#b8160f', emissive: '#e8140a', emissiveIntensity: 0.5, roughness: 0.38, sheen: 0.5, sheenRoughness: 0.4, sheenColor: new THREE.Color('#ffb4a6'), clearcoat: 0.3, clearcoatRoughness: 0.45 }), { key: 'primary', swell: 0.8, fibre: 1.2 }),
    secondary: muscleShader(new THREE.MeshPhysicalMaterial({ color: '#e8862c', emissive: '#ff7a00', emissiveIntensity: 0.15, roughness: 0.45, sheen: 0.4, sheenColor: new THREE.Color('#ffe0b0') }), { key: 'secondary', swell: 0.3 }),
    // Core muscles that only brace get a faint warm tint.
    stabiliser: muscleShader(new THREE.MeshPhysicalMaterial({ color: '#e3c3a3', roughness: 0.5 }), { key: 'stab', fibre: 0.8 }),
    veil: new THREE.MeshStandardMaterial({ color: CLAY, roughness: 0.5, transparent: true, opacity: 0.14, depthWrite: false }),
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
  // Fibre direction (int8 ×3) and tendon amount (uint8) per vertex, from bp_finish.py.
  const fibre = meta.fibre ? new Int8Array(buf, off, n * 4) : null;
  if (fibre) off += n * 4;
  off += (4 - (off % 4)) % 4;
  const index = meta.indexType === 'u16' ? new Uint16Array(buf, off, meta.indexCount) : new Uint32Array(buf, off, meta.indexCount);
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < pos.length; i += 1) pos[i] = pos16[i] / meta.quant;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('skinIndex', new THREE.Uint8BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4, true));
  if (fibre) {
    const fb = new Float32Array(n * 4);
    for (let i = 0; i < n; i += 1) {
      fb[i * 4] = fibre[i * 4] / 127; fb[i * 4 + 1] = fibre[i * 4 + 1] / 127; fb[i * 4 + 2] = fibre[i * 4 + 2] / 127;
      fb[i * 4 + 3] = (fibre[i * 4 + 3] & 255) / 255;
    }
    geo.setAttribute('aFibre', new THREE.BufferAttribute(fb, 4));
  }
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
export function poseAnatomy({ skeleton, meta }, R, breath = 0) {
  boneFrames(meta, R).forEach(({ fr, stretch }, i) => {
    tmp.makeBasis(new THREE.Vector3(...fr.l), new THREE.Vector3(...fr.u), new THREE.Vector3(...fr.f)).setPosition(...fr.a);
    if (stretch !== 1) tmp.multiply(sc.makeScale(1, stretch, 1));
    if (breath && meta.bones[i] === 'chest') tmp.multiply(sc.makeScale(1 + 0.012 * breath, 1, 1 + 0.03 * breath));
    skeleton.bones[i].matrixWorld.copy(tmp);
  });
}

/**
 * A halo around the working muscles: the same skinned geometry drawn again, pushed out
 * along the normals, additive and strongest at the silhouette — the muscle looks lit
 * from inside. Only the target (red) and helper (amber) heads are drawn.
 */
export const haloLevel = { value: 0.6 };
function haloMaterial(color, k) {
  const m = new THREE.MeshStandardMaterial({ color: '#000000', emissive: color, roughness: 1, metalness: 0, envMapIntensity: 0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.halo = haloLevel; sh.uniforms.pump = anatomyPump;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float pump;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normal * (1.1 + pump * 0.8);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float halo;')
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.0);
        gl_FragColor.rgb *= rim * halo * ${k.toFixed(2)};`);
  };
  m.customProgramCacheKey = () => `hp-halo-${k}`;
  return m;
}
export function buildHalo(anatomy, roleOfGroup) {
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  const red = haloMaterial('#ff2a14', 1.6); const amber = haloMaterial('#ff9a1f', 0.6);
  const mats = anatomy.meta.groups.map((g) => { const r = roleOfGroup(g.group); return r === 'primary' ? red : r === 'secondary' ? amber : hidden; });
  const mesh = new THREE.SkinnedMesh(anatomy.mesh.geometry, mats);
  mesh.bind(anatomy.skeleton, new THREE.Matrix4());
  mesh.frustumCulled = false; mesh.renderOrder = 5;
  return { mesh, dispose: () => { red.dispose(); amber.dispose(); hidden.dispose(); } };
}
