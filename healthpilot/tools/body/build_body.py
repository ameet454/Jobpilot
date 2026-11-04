"""
Builds the 3-D trainer's human body (public/body/body.{bin,json}) from the
MakeHuman base mesh — CC0 1.0 (https://github.com/makehumancommunity/makehuman).

  * Shapes an athletic young male from the MakeHuman macro targets.
  * Converts axes to the app's (X = the way the athlete faces, Y = up, Z = athlete's right)
    and scales so hip-to-shoulder height matches the exercise rig (66 units).
  * Re-binds MakeHuman's own skin weights onto the rig's 17 bones.
  * Paints shorts, hair and eyes, and bakes a soft cavity term that brings out muscle definition.
  * Tags every skin vertex with the muscle head underneath it (31 heads), so the app can
    make the target muscle glow through the skin. Muscle positions come from a muscle atlas:
    `--atlas` (packed like the old anatomy.bin) — only used at build time.

Usage (numpy + scipy):
  python build_body.py --mh <dir with base.obj, default.mhskel, default_weights.mhw, t/*.target>
                       --atlas <dir with anatomy.json/anatomy.bin> --out ../../public/body
"""
import argparse
import json
import math
import os
from collections import defaultdict

import numpy as np
from scipy.spatial import cKDTree

ap = argparse.ArgumentParser()
ap.add_argument('--mh', required=True)
ap.add_argument('--atlas', required=True)
ap.add_argument('--out', required=True)
ap.add_argument('--muscle', type=float, default=1.0, help='0..1 share of the max-muscle target')
ap.add_argument('--athlete', type=float, default=1.0, help='0..1 strength of the per-muscle athletic shaping')
ap.add_argument('--lean', type=float, default=0.55, help='0..1 move from average toward minimum body fat (more definition)')
ap.add_argument('--flip-palm', action='store_true')
args = ap.parse_args()
MH = args.mh

# ── 1. Base mesh ────────────────────────────────────────────────────────
verts, groups, cur = [], defaultdict(list), None
with open(os.path.join(MH, 'base.obj')) as fh:
    for line in fh:
        if line.startswith('v '):
            verts.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('g '):
            cur = line.split()[1]
        elif line.startswith('f '):
            groups[cur].append([int(t.split('/')[0]) - 1 for t in line.split()[1:]])
V = np.array(verts)

def apply_target(name, w):
    with open(os.path.join(MH, 't', name + '.target')) as fh:
        for line in fh:
            if line[0] in '#\n':
                continue
            i, dx, dy, dz = line.split()
            V[int(i)] += w * np.array([float(dx), float(dy), float(dz)])

for race in ('african', 'asian', 'caucasian'):
    apply_target(f'{race}-male-young', 1 / 3)
apply_target('universal-male-young-maxmuscle-averageweight', args.muscle * (1 - args.lean))
apply_target('universal-male-young-maxmuscle-minweight', args.muscle * args.lean)
# Athletic V-taper: fuller chest, lats, shoulders and limbs, flat toned stomach.
ATHLETE = {
    'torso-muscle-pectoral-incr': 0.75, 'torso-muscle-dorsi-incr': 0.85, 'stomach-tone-incr': 1.0,
    'r-upperarm-shoulder-muscle-incr': 0.8, 'l-upperarm-shoulder-muscle-incr': 0.8,
    'r-upperarm-muscle-incr': 0.65, 'l-upperarm-muscle-incr': 0.65,
    'r-lowerarm-muscle-incr': 0.45, 'l-lowerarm-muscle-incr': 0.45,
    'r-upperleg-muscle-incr': 0.6, 'l-upperleg-muscle-incr': 0.6,
    'r-lowerleg-muscle-incr': 0.45, 'l-lowerleg-muscle-incr': 0.45, 'neck-scale-horiz-incr': 0.25,
}
for name, w in ATHLETE.items():
    if os.path.exists(os.path.join(MH, 't', name + '.target')):
        apply_target(name, w * args.athlete)

# ── 2. MakeHuman joints & axes ──────────────────────────────────────────
skel = json.load(open(os.path.join(MH, 'default.mhskel')))
mhw = json.load(open(os.path.join(MH, 'default_weights.mhw')))['weights']
joint = {k: V[idx].mean(0) for k, idx in skel['joints'].items()}
def head(b): return joint[skel['bones'][b]['head']]
def tail(b): return joint[skel['bones'][b]['tail']]
def unit(a): return a / (np.linalg.norm(a) + 1e-12)

# Close the hands into a grip (they hold bars, dumbbells and handles in every exercise).
def rot4(h, axis, deg):
    a = unit(axis); t = math.radians(deg); c, s_ = math.cos(t), math.sin(t)
    K = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
    R = np.eye(3) + s_ * K + (1 - c) * K @ K
    M = np.eye(4); M[:3, :3] = R; M[:3, 3] = h - R @ h
    return M
CURL = {1: (18, 32, 30), 2: (52, 84, 52), 3: (56, 86, 54), 4: (60, 86, 54), 5: (64, 84, 52)}
G = {}
grip_center = {}
for k in ('L', 'R'):
    across = head(f'finger5-1.{k}') - head(f'finger2-1.{k}')
    fdir = unit(tail(f'finger3-1.{k}') - head(f'finger3-1.{k}'))
    n = unit(np.cross(fdir, across)) if k == 'R' else unit(np.cross(across, fdir))
    n = -n if args.flip_palm else n
    for f, angs in CURL.items():
        parent = np.eye(4)
        for seg in (1, 2, 3):
            b = f'finger{f}-{seg}.{k}'
            h = head(b); d = unit(tail(b) - h)
            if f == 1:
                axis = np.cross(d, unit(n + 0.6 * unit(across)))
            else:
                axis = np.cross(d, n)
            hp = (parent @ np.r_[h, 1])[:3]
            ap = parent[:3, :3] @ axis
            parent = rot4(hp, ap, angs[seg - 1]) @ parent
            G[b] = parent
    k3 = head(f'finger3-1.{k}')
    tip = (G[f'finger3-2.{k}'] @ np.r_[tail(f'finger3-2.{k}'), 1])[:3]
    grip_center[k] = (k3 + tip) / 2
def lbs(V0, G):
    """Pose MakeHuman vertices with per-bone 4x4 transforms G (missing bones stay put)."""
    acc = np.zeros_like(V0); wsum = np.zeros(len(V0))
    for b, pairs in mhw.items():
        M = G.get(b)
        for vi, w in pairs:
            acc[vi] += w * ((M[:3, :3] @ V0[vi] + M[:3, 3]) if M is not None else V0[vi])
            wsum[vi] += w
    out = V0.copy(); has = wsum > 0
    out[has] = acc[has] / wsum[has, None]
    return out

def descendants(root):
    out = []
    for b in skel['bones']:
        x = b
        while x is not None:
            if x == root:
                out.append(b); break
            x = skel['bones'][x]['parent']
    return out

# Second hand shape, stored as a morph: palm flat on the floor (push-ups, mountain climbers).
# The hand turns palm-back about the forearm, then the wrist bends back ~85°.
G_flat = {}
for k in ('L', 'R'):
    across = head(f'finger5-1.{k}') - head(f'finger2-1.{k}')
    fdir = unit(tail(f'finger3-1.{k}') - head(f'finger3-1.{k}'))
    n = unit(np.cross(fdir, across)) if k == 'R' else unit(np.cross(across, fdir))
    n = -n if args.flip_palm else n
    wr = head(f'wrist.{k}')
    a = unit(wr - head(f'lowerarm01.{k}'))
    want = np.array([0.0, 0.0, -1.0])  # palm faces backward (MakeHuman -z)
    np_ = unit(n - a * np.dot(n, a)); wp = unit(want - a * np.dot(want, a))
    th = math.degrees(math.atan2(np.dot(np.cross(np_, wp), a), np.dot(np_, wp)))
    tw = rot4(wr, a, th)
    n2 = tw[:3, :3] @ n
    ext = rot4(wr, np.cross(a, -n2), 85)
    G_flat[f'lowerarm02.{k}'] = rot4(wr, a, th * 0.5)
    for b in descendants(f'wrist.{k}'):
        G_flat[b] = ext @ tw
V_flat = lbs(V, G_flat)
V = lbs(V, G)

def to_app(p):  # MakeHuman: x = character's left, y = up, z = front
    p = np.asarray(p)
    return np.stack([p[..., 2], p[..., 1], -p[..., 0]], -1)

# MakeHuman's upper-leg and upper-arm bone heads sit a little high and low for the real joint
# centres (hip ≈ 0.52 H, shoulder ≈ 0.81 H); move them so the torso/limb split matches the rig.
H_MH = V[:, 1].max() - V[:, 1].min()
def hip_j(k): return head(f'upperleg01.{k}') + np.array([0, -0.015 * H_MH, 0])
def sh_j(k): return head(f'upperarm01.{k}') + np.array([0, 0.014 * H_MH, 0])
hipC_mh = (hip_j('L') + hip_j('R')) / 2
neck_mh = (sh_j('L') + sh_j('R')) / 2
SCALE = 66.0 / np.linalg.norm(neck_mh - hipC_mh)
ORIGIN = hipC_mh
def app(p): return to_app((np.asarray(p) - ORIGIN) * SCALE)

P = app(V)
# Natural skin colouring landmarks (MakeHuman space → app space):
#   lips from the orbicularis-oris bone weights, nipples at the most forward point
#   of each pec (breast bone region), navel from the navel target's vertices.
def wsum(prefixes):
    acc = np.zeros(len(V))
    for b, pairs in mhw.items():
        if b.startswith(prefixes):
            for vi, w_ in pairs: acc[vi] += w_
    return acc
LIPS_W = wsum(('oris01', 'oris03', 'oris05', 'oris07'))
NIPPLES = []
BODY_VERTS = np.unique(np.array([i for f in groups['body'] for i in f]))  # skin only, not helper shells
for k in ('L', 'R'):
    bw = wsum((f'breast.{k}',))
    cand = np.intersect1d(np.where(bw > 0.5)[0], BODY_VERTS)
    NIPPLES.append(app(V[cand[np.argmax(V[cand, 2])]]))
nav_idx = [i for i in (int(l.split()[0]) for l in open(os.path.join(MH, 't', 'stomach-navel-in.target')) if l[0] not in '#\n') if i in set(BODY_VERTS.tolist())]
NAVEL = app(V[nav_idx].mean(0)) if nav_idx else None
P_flat = app(V_flat)
J = {}
J['hip'] = app(hipC_mh); J['neck'] = app(neck_mh)
for s, k in ((1, 'R'), (-1, 'L')):
    J[f'shoulder{s}'] = app(sh_j(k))
    J[f'elbow{s}'] = app(head(f'lowerarm01.{k}'))
    J[f'wrist{s}'] = app(head(f'wrist.{k}'))
    J[f'hip{s}'] = app(hip_j(k))
    J[f'grip{s}'] = app(grip_center[k])
    J[f'knee{s}'] = app(head(f'lowerleg01.{k}'))
    J[f'ankle{s}'] = app(head(f'foot.{k}'))
    J[f'toe{s}'] = app(tail(f'foot.{k}'))
J['headTop'] = app(tail('head'))

atlas_meta = json.load(open(os.path.join(args.atlas, 'anatomy.json')))
WAIST = atlas_meta['waist']
J['waist'] = J['hip'] + (J['neck'] - J['hip']) * WAIST

def norm(a): return a / (np.linalg.norm(a) + 1e-12)
def frame(a, b, fh):
    u = norm(b - a)
    f = fh - u * np.dot(fh, u)
    f = norm(f)
    return {'a': a, 'u': u, 'f': f, 'l': norm(np.cross(u, f)), 'len': float(np.linalg.norm(b - a))}

FWD = np.array([1.0, 0, 0])
rest = {}
rest['pelvis'] = frame(J['hip'], J['waist'], FWD)
rest['chest'] = frame(J['waist'], J['neck'], FWD)
chest = rest['chest']
# The head points like the atlas head does relative to its chest (slight forward tilt).
ar = atlas_meta['rest']
def rel_dir(src_bone, ref_bone, ref_frame):
    s, r = np.array(ar[src_bone]['u']), ar[ref_bone]
    c = [np.dot(s, r['l']), np.dot(s, r['u']), np.dot(s, r['f'])]
    return norm(c[0] * ref_frame['l'] + c[1] * ref_frame['u'] + c[2] * ref_frame['f'])
hu = rel_dir('head', 'chest', chest)
rest['head'] = frame(J['neck'], J['neck'] + hu * np.linalg.norm(J['headTop'] - J['neck']), chest['f'])
SC = atlas_meta['sc']  # sternoclavicular offset: forward, up, sideways (same scale)
SC_OFF = [6.7, 0.8, 1.5]
for s in (1, -1):
    sc = J['neck'] + chest['f'] * SC_OFF[0] + chest['u'] * SC_OFF[1] + np.array([0, 0, s * SC_OFF[2]])
    J[f'sc{s}'] = sc
    rest[f'girdle{s}'] = frame(sc, J[f'shoulder{s}'], chest['f'])
    rest[f'ua{s}'] = frame(J[f'shoulder{s}'], J[f'elbow{s}'], FWD)
    rest[f'fa{s}'] = frame(J[f'elbow{s}'], J[f'wrist{s}'], FWD)
    rest[f'hand{s}'] = {**rest[f'fa{s}'], 'a': J[f'wrist{s}'], 'len': 5.0}
    rest[f'th{s}'] = frame(J[f'hip{s}'], J[f'knee{s}'], FWD)
    rest[f'sh{s}'] = frame(J[f'knee{s}'], J[f'ankle{s}'], FWD)
    rest[f'foot{s}'] = frame(J[f'ankle{s}'], J[f'toe{s}'], J[f'knee{s}'] - J[f'ankle{s}'])

BONES = atlas_meta['bones']

# ── 3. Skin weights: MakeHuman bones → rig bones ────────────────────────
DIRECT = {
    'root': {'pelvis': 1}, 'pelvis.L': {'pelvis': 1}, 'pelvis.R': {'pelvis': 1},
    'spine05': {'pelvis': 1}, 'spine04': {'pelvis': 1}, 'spine03': {'pelvis': 0.35, 'chest': 0.65},
    'spine02': {'chest': 1}, 'spine01': {'chest': 1}, 'breast.L': {'chest': 1}, 'breast.R': {'chest': 1},
    'neck01': {'chest': 0.45, 'head': 0.55}, 'neck02': {'head': 1}, 'neck03': {'head': 1}, 'head': {'head': 1},
}
for s, k in ((1, 'R'), (-1, 'L')):
    DIRECT.update({
        f'clavicle.{k}': {f'girdle{s}': 1}, f'shoulder01.{k}': {f'girdle{s}': 1},
        f'upperarm01.{k}': {f'ua{s}': 1}, f'upperarm02.{k}': {f'ua{s}': 1},
        f'lowerarm01.{k}': {f'fa{s}': 1}, f'lowerarm02.{k}': {f'fa{s}': 1}, f'wrist.{k}': {f'hand{s}': 1},
        f'upperleg01.{k}': {f'th{s}': 1}, f'upperleg02.{k}': {f'th{s}': 1},
        f'lowerleg01.{k}': {f'sh{s}': 1}, f'lowerleg02.{k}': {f'sh{s}': 1}, f'foot.{k}': {f'foot{s}': 1},
    })
def mapped(b):
    while b not in DIRECT:
        b = skel['bones'][b]['parent']
    return DIRECT[b]

W = np.zeros((len(V), len(BONES)))
mhw = json.load(open(os.path.join(MH, 'default_weights.mhw')))['weights']
for b, pairs in mhw.items():
    for tgt, frac in mapped(b).items():
        bi = BONES.index(tgt)
        for vi, w in pairs:
            W[vi, bi] += w * frac

# ── 4. Keep the skin and eyes ───────────────────────────────────────────
def tris(gs):
    out = []
    for g in gs:
        for f in groups[g]:
            out += [[f[0], f[1], f[2]]] + ([[f[0], f[2], f[3]]] if len(f) == 4 else [])
    return np.array(out)
body_t = tris(['body'])
eye_t = tris(['helper-r-eye', 'helper-l-eye'])
used = np.unique(np.concatenate([body_t.ravel(), eye_t.ravel()]))
remap = -np.ones(len(V), int); remap[used] = np.arange(len(used))
T = remap[np.concatenate([body_t, eye_t])]
P = P[used]; W = W[used]; P_flat = P_flat[used]; LIPS_W = LIPS_W[used]
is_eye = np.zeros(len(used), bool); is_eye[remap[np.unique(eye_t)]] = True
nb = len(used)
W[W.sum(1) == 0, BONES.index('head')] = 1  # eyes ride the head
# Eyes: copy the weights of the nearest skin vertex.
skin_idx = np.where(~is_eye)[0]
kd_skin = cKDTree(P[skin_idx])
_, nn = kd_skin.query(P[is_eye]); W[is_eye] = W[skin_idx[nn]]

# Top-4 influences, normalised.
order = np.argsort(-W, 1)[:, :4]
w4 = np.take_along_axis(W, order, 1)
w4 /= w4.sum(1, keepdims=True)

# ── 5. Rest-pose normals, adjacency, cavity ─────────────────────────────
def vnormals(P, T):
    n = np.zeros_like(P)
    fn = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
    for k in range(3): np.add.at(n, T[:, k], fn)
    return n / (np.linalg.norm(n, axis=1, keepdims=True) + 1e-12)
N = vnormals(P, T)
edges = np.concatenate([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]])
edges = np.unique(np.sort(edges, 1), axis=0)
deg = np.bincount(edges.ravel(), minlength=nb).astype(float)
def smooth(X, it):
    X = X.copy()
    for _ in range(it):
        acc = np.zeros_like(X)
        np.add.at(acc, edges[:, 0], X[edges[:, 1]]); np.add.at(acc, edges[:, 1], X[edges[:, 0]])
        X = 0.5 * X + 0.5 * acc / np.maximum(deg, 1)[:, None]
    return X
cav = np.zeros(nb)
for it, wgt in ((4, 0.6), (16, 0.4)):
    d = np.einsum('ij,ij->i', smooth(P, it) - P, N)
    cav += wgt * d
cav = smooth(cav[:, None], 2)[:, 0]
ao = np.clip(1.0 - np.maximum(cav, 0) * 0.85, 0.4, 1.0)
ao = np.clip(ao + np.minimum(cav, 0) * -0.08, 0, 1.06)  # ridges catch a touch more light

# ── 6. Muscle heads from the atlas ──────────────────────────────────────
am = atlas_meta
abuf = open(os.path.join(args.atlas, 'anatomy.bin'), 'rb').read()
an = am['vertexCount']; off = 0
apos = np.frombuffer(abuf, np.int16, an * 3, off).reshape(-1, 3) / am['quant']; off += an * 6
aidx_s = np.frombuffer(abuf, np.uint8, an * 4, off).reshape(-1, 4); off += an * 4
aw_s = np.frombuffer(abuf, np.uint8, an * 4, off).reshape(-1, 4) / 255.0; off += an * 4
off += (4 - off % 4) % 4
aidx = np.frombuffer(abuf, np.uint16 if am['indexType'] == 'u16' else np.uint32, am['indexCount'], off)
HEADS = [g['group'] for g in am['groups'] if g['group'] not in ('muscle', 'bone')]
vgroup = -np.ones(an, int)
for gi, g in enumerate(am['groups']):
    if g['group'] in HEADS:
        vgroup[aidx[g['start']:g['start'] + g['count']]] = HEADS.index(g['group'])

def mat_of(fr, stretch=1.0):
    M = np.eye(4)
    M[:3, 0] = fr['l']; M[:3, 1] = np.array(fr['u']) * stretch; M[:3, 2] = fr['f']; M[:3, 3] = fr['a']
    return M
# Carry the skin into the atlas' rest skeleton (linear blend skinning), then look up the
# nearest muscle surface.
Mx = []
for b in BONES:
    A = {k: np.array(v) if isinstance(v, list) else v for k, v in ar[b].items()}
    k = 1.0 if b.startswith(('foot', 'hand')) else ar[b]['len'] / rest[b]['len']
    Mx.append(mat_of(A, k) @ np.linalg.inv(mat_of(rest[b])))
Mx = np.array(Mx)
Ph = np.c_[P, np.ones(nb)]
Pa = np.zeros((nb, 3))
for j in range(4):
    Pa += w4[:, j:j + 1] * np.einsum('nij,nj->ni', Mx[order[:, j]], Ph)[:, :3]

mus = vgroup >= 0
kd = cKDTree(apos[mus])
dist, nn = kd.query(Pa, k=6)
lab = vgroup[mus][nn]
onehot = np.zeros((nb, len(HEADS)))
for j in range(6):
    ok = (dist[:, j] < 9.0) & ~is_eye
    np.add.at(onehot, (np.where(ok)[0], lab[ok, j]), 1.0 / 6)
# Hands, feet, head and neck carry no highlighted muscle.
dom = order[:, 0]
for b in ('head', 'hand1', 'hand-1', 'foot1', 'foot-1'):
    onehot[(dom == BONES.index(b)) & (w4[:, 0] > 0.6)] = 0
onehot = smooth(onehot, 3)
mid = np.argsort(-onehot, 1)[:, :2]
mw = np.take_along_axis(onehot, mid, 1)
mw = np.clip(mw / 0.55, 0, 1)  # full strength well inside a muscle, soft at its border

# Muscle definition: shade the grooves where one muscle meets the next (from the atlas
# labels), plus the linea alba and three tendinous lines of a six-pack.
tot = onehot.sum(1); peak = onehot.max(1)
border = np.clip((0.8 - peak / np.maximum(tot, 1e-6)) / 0.35, 0, 1) * np.clip(tot / 0.6, 0, 1)
groove = smooth(border[:, None], 1)[:, 0]
if 'abs.rectus' in HEADS:
    ra = (onehot[:, HEADS.index('abs.rectus')] / np.maximum(tot, 1e-6) > 0.5) & (tot > 0.4) & ~is_eye
    if ra.sum() > 20:
        ys = P[ra, 1]; y0, y1 = np.percentile(ys, 4), np.percentile(ys, 96)
        zc = np.median(P[ra, 2]); h = y1 - y0
        six = np.exp(-((P[:, 2] - zc) / 1.1) ** 2) * 1.0
        for f in (0.38, 0.6, 0.8):
            six = np.maximum(six, np.exp(-((P[:, 1] - (y0 + f * h)) / (0.03 * h + 0.6)) ** 2) * 0.9)
        groove = np.where(ra, np.maximum(groove, six), groove)
groove = np.clip(groove, 0, 1)
ao = np.clip(ao * (1 - 0.3 * groove) + 0.04 * (1 - groove) * (tot > 0.4), 0, 1.06)

# ── 7. Paint: shorts, hair, eyes ───────────────────────────────────────
# Stored as signed distances (positive = inside) so the shader can cut crisp,
# straight edges across triangles instead of blotchy per-vertex colours.
y = P[:, 1]
legw = sum(W[:, BONES.index(b)] for b in ('pelvis', 'th1', 'th-1'))
knee_y = (J['knee1'][1] + J['knee-1'][1]) / 2
hem_y = knee_y + 0.48 * (J['hip'][1] - knee_y)
top_y_sh = J['hip'][1] + 0.30 * (J['waist'][1] - J['hip'][1]) + 9
hem = np.where((legw > 0.5) & ~is_eye, y - hem_y + 0.04 * np.abs(P[:, 0] - J['hip'][0]), -20.0)
top = np.where(~is_eye, top_y_sh - y, -20.0)
headw = W[:, BONES.index('head')]
eyes_y = P[is_eye, 1].mean(); htop = P[(headw > 0.9) & ~is_eye, 1].max(); span = htop - eyes_y
head_c = P[(headw > 0.9) & ~is_eye].mean(0)
front = P[:, 0] - head_c[0]
side = np.abs(P[:, 2] - head_c[2])
# Short hair: above a hairline that rises at the temples and drops behind the ears.
hair = np.maximum.reduce([
    y - (eyes_y + 0.56 * span) - 0.10 * np.maximum(side - 4, 0) * 3,
    # Back of the head: the hairline dips to the nape in the middle and rises behind the ears.
    np.minimum(-front - 1.0, y - (eyes_y - 0.42 * span) - 0.06 * span * (side / 4.5) ** 2),
    # Temples: the hairline slopes back towards the sideburn instead of a vertical edge.
    np.minimum(np.minimum(-front + 2.2 + 0.45 * (y - eyes_y), side - 6.2), y - (eyes_y + 0.22 * span)),
])
ear = (side > 6.6) & (y < eyes_y + 0.18 * span) & (front > -3.5) & (front < 0.8)
hair = np.where((headw > 0.45) & ~is_eye & (y > eyes_y - 0.75 * span) & ~ear, hair, -20.0)
iris = np.full(nb, -1.0)
for sd in (1, -1):
    m = is_eye & (np.sign(P[:, 2]) == sd)
    c = P[m].mean(0)
    dd = P[m] - c; dd /= np.linalg.norm(dd, axis=1, keepdims=True)
    iris[m] = (dd @ norm(np.array([1.0, -0.05, 0.04 * sd]))) - 0.86
# Brows: two soft bands above the eyes.
brow = np.full(nb, -20.0)
for sd in (1, -1):
    c = P[is_eye & (np.sign(P[:, 2]) == sd)].mean(0)
    dz = (P[:, 2] - c[2]) * sd
    arch = c[1] + 0.21 * span + 0.35 - 0.045 * (dz - 0.3) ** 2   # arched, highest just outside the pupil
    dy = y - arch
    val = np.minimum(1.0 - np.abs(dy) / (0.62 - 0.05 * np.clip(dz, 0, 3)), 1.0 - np.abs(dz - 0.3) / 3.3)
    ok = (front > 2) & (headw > 0.9) & ~is_eye
    brow = np.where(ok, np.maximum(brow, val), brow)

# ── 8. Pack ──────────────────────────────────────────────────────────────
QUANT = 100.0
assert np.abs(P).max() * QUANT < 32767
pos16 = np.round(P * QUANT).astype('<i2')
sidx = order.astype(np.uint8)
sw = np.round(w4 * 255).astype(int)
sw[:, 0] += 255 - sw.sum(1)
mid8 = mid.astype(np.uint8)
mw8 = np.round(mw * 255).astype(np.uint8)
ao8 = np.round(np.clip(ao, 0, 1.06) / 1.06 * 255).astype(np.uint8)
eye8 = is_eye.astype(np.uint8)
# Lips: strongest orbicularis-oris weights, kept to the front of the face.
lips = np.where(~is_eye & (front > 3.0), (LIPS_W - 0.72) / 0.18, -20.0)
# Areolas (radius ~1.5 units) and the navel (~0.8).
areola = np.full(nb, -20.0)
for c in NIPPLES:
    d_ = np.linalg.norm(P - c, axis=1)
    areola = np.maximum(areola, 1.0 - d_ / 2.3)
navel = np.full(nb, -20.0) if NAVEL is None else 1.0 - np.linalg.norm(P - NAVEL, axis=1) / 0.9
cuts = np.stack([hem, top, hair, iris, brow, lips, areola, navel], 1)
cut16 = np.round(np.clip(cuts, -20, 20) * 1000).astype('<i2')
blob = (pos16.tobytes() + sidx.tobytes() + sw.astype(np.uint8).tobytes() + mid8.tobytes() + mw8.tobytes()
        + np.stack([eye8, ao8], 1).tobytes())
blob += b'\0' * ((4 - len(blob) % 4) % 4)
blob += cut16.tobytes()
blob += b'\0' * ((4 - len(blob) % 4) % 4)
flat = P_flat - P
moved = np.where(np.abs(flat).max(1) > 1e-3)[0].astype('<u2')
blob += moved.tobytes()
blob += b'\0' * ((4 - len(blob) % 4) % 4)
blob += np.round(flat[moved] * QUANT).astype('<i2').tobytes()
blob += b'\0' * ((4 - len(blob) % 4) % 4)
idx = T.astype('<u2' if nb < 65536 else '<u4')
blob += idx.tobytes()
os.makedirs(args.out, exist_ok=True)
open(os.path.join(args.out, 'body.bin'), 'wb').write(blob)

anchors = {}
for hi, h in enumerate(HEADS):
    sel = (mid[:, 0] == hi) & (mw[:, 0] > 0.6) & (P[:, 2] > 0)
    if sel.sum() < 3:
        continue
    c = P[sel].mean(0)
    # Pin the label to the skin: the selected vertex nearest the centroid.
    c = P[np.where(sel)[0][np.argmin(np.linalg.norm(P[sel] - c, axis=1))]]
    b = BONES[np.bincount(order[sel, 0]).argmax()]
    anchors[h] = {'c': c.tolist(), 'bone': b}

# Grip centre (inside the closed fist) in the forearm's rest frame: [along, front, side·s].
fr = rest['fa1']
g = J['grip1'] - J['wrist1']
grip = [float(np.dot(g, fr['u'])), float(np.dot(g, fr['f'])), float(np.dot(g, fr['l']))]

def jl(fr): return {k: (v.tolist() if isinstance(v, np.ndarray) else v) for k, v in fr.items()}
meta = {
    'credit': 'Human body: MakeHuman base mesh (CC0 1.0)',
    'vertexCount': int(nb), 'indexCount': int(T.size), 'indexType': 'u16' if nb < 65536 else 'u32',
    'quant': QUANT, 'bones': BONES, 'rest': {b: jl(rest[b]) for b in BONES},
    'heads': HEADS, 'anchors': anchors, 'floorY': float(P[:, 1].min()),
    'joints': {k: v.tolist() for k, v in J.items()}, 'waist': WAIST,
    'flatCount': int(len(moved)), 'grip': grip, 'cuts': ['hem', 'top', 'hair', 'iris', 'brow', 'lips', 'areola', 'navel'], 'cutScale': 1000,
}
json.dump(meta, open(os.path.join(args.out, 'body.json'), 'w'), separators=(',', ':'))
print('verts', nb, 'tris', len(T), 'bytes', len(blob), 'scale', SCALE)
print('shoulderZ', J['shoulder1'][2], 'hipZ', J['hip1'][2], 'kneeZ', J['knee1'][2], 'ankleZ', J['ankle1'][2])
print('lens', {b: round(rest[b]['len'], 1) for b in BONES})
print('atlas', {b: round(ar[b]['len'], 1) for b in BONES})
print('floor', P[:, 1].min(), 'top', P[:, 1].max(), 'heads tagged', len(anchors), '/', len(HEADS))
print('muscle-tagged verts', int((mw[:, 0] > 0.3).sum()), 'grip', grip)
