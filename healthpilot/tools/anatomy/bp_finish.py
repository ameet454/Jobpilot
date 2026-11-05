"""Stage 3: finish the anatomy for the 3-D coach.

Input:  the packed atlas (tools/body/atlas/anatomy.{bin,json}, from bp_build.py) and the
        packed MakeHuman body (public/body/body.{bin,json}, from build_body.py).
Output: public/body/anatomy.{bin,json}, which the app loads.

1. Smoother working muscles. The 99 %-reduced BodyParts3D set leaves the chest and
   shoulder heads with only a few hundred triangles; Loop subdivision rounds them out.
2. Skin weights from the body. The muscles take their bone weights from the nearest
   skin of the MakeHuman body (whose weights were made by hand for clean deformation),
   so they bend the way the skin does: no web between arm and torso when the arms lift,
   and the muscles stay inside the skin. Bones keep their rigid weights.
3. Fibre direction and tendon ends per vertex, for the muscle shader: each muscle's
   long axis (PCA of its connected piece) and how close the vertex is to either end.

Binary layout (all little-endian):
  Int16  position * quant      n*3
  Uint8  skin index            n*4
  Uint8  skin weight           n*4
  Int8   fibre x,y,z (×127) + Uint8 tendon (0..255)   n*4
  (pad to 4)  index (u16 or u32)
"""
import argparse, json, os, sys
import numpy as np
from scipy.spatial import cKDTree

ap = argparse.ArgumentParser()
ap.add_argument('--atlas', required=True, help='dir with the packed anatomy.{json,bin} from bp_build.py')
ap.add_argument('--body', required=True, help='dir with body.{json,bin} from build_body.py')
ap.add_argument('--out', required=True)
args = ap.parse_args()

# ── load ──────────────────────────────────────────────────────────────────
am = json.load(open(os.path.join(args.atlas, 'anatomy.json')))
ab = open(os.path.join(args.atlas, 'anatomy.bin'), 'rb').read()
n = am['vertexCount']; off = 0
P = np.frombuffer(ab, np.int16, n * 3, off).reshape(-1, 3) / am['quant']; off += n * 6
SI = np.frombuffer(ab, np.uint8, n * 4, off).reshape(-1, 4).copy(); off += n * 4
SW = np.frombuffer(ab, np.uint8, n * 4, off).reshape(-1, 4).copy(); off += n * 4
off += (4 - off % 4) % 4
IDX = np.frombuffer(ab, np.uint16 if am['indexType'] == 'u16' else np.uint32, am['indexCount'], off).reshape(-1, 3).astype(np.int64)

bm = json.load(open(os.path.join(args.body, 'body.json')))
bb = open(os.path.join(args.body, 'body.bin'), 'rb').read()
m = bm['vertexCount']; off = 0
BP = np.frombuffer(bb, np.int16, m * 3, off).reshape(-1, 3) / bm['quant']; off += m * 6
BSI = np.frombuffer(bb, np.uint8, m * 4, off).reshape(-1, 4); off += m * 4
BSW = np.frombuffer(bb, np.uint8, m * 4, off).reshape(-1, 4) / 255.0; off += m * 4
off += m * 4  # muscle ids + weights
battr = np.frombuffer(bb, np.uint8, m * 2, off).reshape(-1, 2)
skin = battr[:, 0] == 0  # not the eyeballs

BONES = am['bones']; NB = len(BONES)
assert BONES == bm['bones'], 'body and anatomy rigs differ'

def rest(fr):
    M = np.eye(4)
    M[:3, 0], M[:3, 1], M[:3, 2], M[:3, 3] = fr['l'], fr['u'], fr['f'], fr['a']
    return M

# Body rest -> anatomy rest, per bone (same stretch rule as boneFrames at run time).
X = []
for b in BONES:
    S = np.eye(4)
    if not (b == 'head' or b.startswith('hand') or b.startswith('foot')):
        S[1, 1] = am['rest'][b]['len'] / bm['rest'][b]['len']
    X.append(rest(am['rest'][b]) @ S @ np.linalg.inv(rest(bm['rest'][b])))
X = np.stack(X)

# ── 1. subdivide the small working muscles ────────────────────────────────
def loop_subdivide(V, F, W):
    """One step of Loop subdivision. W: per-vertex attributes interpolated linearly."""
    e = np.sort(np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]), axis=1)
    opp = np.concatenate([F[:, 2], F[:, 0], F[:, 1]])
    ue, inv = np.unique(e, axis=0, return_inverse=True)
    inv = inv.reshape(-1)
    cnt = np.bincount(inv, minlength=len(ue))
    osum = np.zeros((len(ue), 3)); np.add.at(osum, inv, V[opp])
    mid = (V[ue[:, 0]] + V[ue[:, 1]]) / 2
    inner = cnt == 2
    E = mid.copy()
    E[inner] = 0.375 * (V[ue[inner, 0]] + V[ue[inner, 1]]) + 0.125 * osum[inner]
    # Even vertices.
    nb = np.zeros_like(V); val = np.zeros(len(V))
    np.add.at(nb, ue[:, 0], V[ue[:, 1]]); np.add.at(nb, ue[:, 1], V[ue[:, 0]])
    np.add.at(val, ue[:, 0], 1); np.add.at(val, ue[:, 1], 1)
    boundary = np.zeros(len(V), bool); boundary[ue[~inner].ravel()] = True
    beta = np.where(val > 3, 3 / (8 * np.maximum(val, 1)), 3 / 16)
    Vn = (1 - val * beta)[:, None] * V + beta[:, None] * nb
    Vn[boundary | (val == 0)] = V[boundary | (val == 0)]
    k = len(V)
    a, b, c = F[:, 0], F[:, 1], F[:, 2]
    eab, ebc, eca = inv[:len(F)] + k, inv[len(F):2 * len(F)] + k, inv[2 * len(F):] + k
    F2 = np.concatenate([np.stack([a, eab, eca], 1), np.stack([b, ebc, eab], 1), np.stack([c, eca, ebc], 1), np.stack([eab, ebc, eca], 1)])
    W2 = np.concatenate([W, (W[ue[:, 0]] + W[ue[:, 1]]) / 2])
    return np.concatenate([Vn, E]), F2, W2

def levels(group, tris):
    if group in ('bone', 'muscle'): return 0
    if tris < 250: return 2
    if tris < 1200: return 1
    return 0

newP, newF, newW, groups = [], [], [], []
base = 0; tri_base = 0
for g in am['groups']:
    F = IDX[g['start'] // 3:(g['start'] + g['count']) // 3]
    used, local = np.unique(F, return_inverse=True)
    V = P[used]; Fl = local.reshape(-1, 3)
    Wv = np.concatenate([SI[used].astype(float), SW[used].astype(float)], 1)  # carried for bones only
    for _ in range(levels(g['group'], len(Fl))):
        V, Fl, Wv = loop_subdivide(V, Fl, Wv)
    newP.append(V); newF.append(Fl + base); newW.append(Wv)
    groups.append({'group': g['group'], 'start': tri_base * 3, 'count': len(Fl) * 3})
    base += len(V); tri_base += len(Fl)
P2 = np.concatenate(newP); F2 = np.concatenate(newF); W2 = np.concatenate(newW)
is_bone = np.zeros(len(P2), bool)
for g in groups:
    if g['group'] == 'bone':
        is_bone[np.unique(F2[g['start'] // 3:(g['start'] + g['count']) // 3])] = True
print(f'vertices {n} -> {len(P2)}, triangles {len(IDX)} -> {len(F2)}', file=sys.stderr)

# ── 2. skin weights from the body ─────────────────────────────────────────
# Body skin into the anatomy's rest space, with the body's own weights.
Bh = np.concatenate([BP, np.ones((m, 1))], 1)
Wd = np.zeros((m, NB))
for k in range(4): np.add.at(Wd, (np.arange(m), BSI[:, k]), BSW[:, k])
Wd /= Wd.sum(1, keepdims=True)
BPa = np.zeros((m, 3))
for b in range(NB):
    sel = Wd[:, b] > 0
    BPa[sel] += Wd[sel, b, None] * (Bh[sel] @ X[b].T)[:, :3]
tree = cKDTree(BPa[skin]); Wskin = Wd[skin]
d, nn = tree.query(P2, k=8)
w = 1.0 / (d ** 2 + 1.0)
Wm = (Wskin[nn] * w[:, :, None]).sum(1) / w.sum(1, keepdims=True)
# Smooth the weights over each muscle's surface so thin sheets (serratus, lats) bend as one
# piece instead of tearing into strips where the skin weights change quickly.
from scipy.sparse import coo_matrix, diags
ii = np.concatenate([F2[:, 0], F2[:, 1], F2[:, 2], F2[:, 1], F2[:, 2], F2[:, 0]])
jj = np.concatenate([F2[:, 1], F2[:, 2], F2[:, 0], F2[:, 0], F2[:, 1], F2[:, 2]])
A = coo_matrix((np.ones(len(ii)), (ii, jj)), shape=(len(P2), len(P2))).tocsr()
A.data[:] = 1.0
deg = np.asarray(A.sum(1)).ravel()
Avg = diags(1.0 / np.maximum(deg, 1)) @ A
for _ in range(10):
    Wm = np.where(is_bone[:, None], Wm, 0.5 * Wm + 0.5 * (Avg @ Wm))
order = np.argsort(-Wm, axis=1)[:, :4]
top = np.take_along_axis(Wm, order, 1); top /= top.sum(1, keepdims=True)
SI2 = order.astype(np.uint8)
SW2 = np.round(top * 255).astype(np.int32); SW2[:, 0] += 255 - SW2.sum(1)
# Bones: keep the rigid weights from bp_build.
SI2[is_bone] = np.round(W2[is_bone, :4]).astype(np.uint8)
SW2[is_bone] = np.round(W2[is_bone, 4:]).astype(np.int32)
SW2[is_bone, 0] += 255 - SW2[is_bone].sum(1)
SW2 = SW2.astype(np.uint8)
print(f'median distance muscle -> skin {np.median(d[~is_bone, 0]):.2f}', file=sys.stderr)

# ── 3. fibre direction and tendon ends ────────────────────────────────────
parent = np.arange(len(P2))
def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]; x = parent[x]
    return x
for a, b, c in F2:
    for u, v in ((a, b), (b, c)):
        ru, rv = find(u), find(v)
        if ru != rv: parent[ru] = rv
root = np.array([find(i) for i in range(len(P2))])
FIB = np.zeros((len(P2), 3)); TEN = np.zeros(len(P2))
for r in np.unique(root):
    ids = np.where(root == r)[0]
    if is_bone[ids[0]] or len(ids) < 12:
        continue
    Q = P2[ids]; c = Q.mean(0)
    _, s, vt = np.linalg.svd(Q - c, full_matrices=False)
    ax = vt[0] * (1 if vt[0][1] >= 0 else -1)
    FIB[ids] = ax
    t = (Q - c) @ ax
    half = max(np.abs(t).max(), 1e-6)
    elong = s[0] / max(s[1], 1e-6)
    # Long, slender muscles end in tendons; broad sheets (lats, obliques) mostly don't.
    if elong > 2.2:
        x = np.abs(t) / half
        TEN[ids] = np.clip((x - 0.78) / 0.2, 0, 1) ** 1.5 * min(1.0, (elong - 2.2) / 1.5)
fib8 = np.round(FIB * 127).astype(np.int8)
ten8 = np.round(TEN * 255).astype(np.uint8)

# ── pack ──────────────────────────────────────────────────────────────────
Q = am['quant']
pos = np.round(P2 * Q).astype(np.int16)
nv = len(P2)
index_type = 'u16' if nv < 65536 else 'u32'
os.makedirs(args.out, exist_ok=True)
with open(os.path.join(args.out, 'anatomy.bin'), 'wb') as fh:
    fh.write(pos.tobytes()); fh.write(SI2.tobytes()); fh.write(SW2.tobytes())
    fv = np.concatenate([fib8.view(np.uint8), ten8[:, None]], 1)
    fh.write(fv.tobytes())
    sz = pos.nbytes + SI2.nbytes + SW2.nbytes + fv.nbytes
    if sz % 4: fh.write(b'\0' * (4 - sz % 4))
    fh.write(F2.astype(np.uint16 if index_type == 'u16' else np.uint32).tobytes())
out = dict(am, vertexCount=int(nv), indexCount=int(F2.size), indexType=index_type, groups=groups, fibre=True)
json.dump(out, open(os.path.join(args.out, 'anatomy.json'), 'w'), indent=1)
print(f'wrote {os.path.join(args.out, "anatomy.bin")} ({os.path.getsize(os.path.join(args.out, "anatomy.bin"))} bytes)', file=sys.stderr)
