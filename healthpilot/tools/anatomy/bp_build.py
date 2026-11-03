"""Stage 2: simplify, skin and pack the anatomy for the web.

Input: parts.npz + joints.json from bp_extract.py (app axes, millimetres).
Output: anatomy.bin + anatomy.json for the HealthPilot 3-D trainer.

Units: scaled so hip-centre -> shoulder-centre = 66 (the app's torso length).
Skinning: each vertex is bound to up to 4 of 14 rigid bones, chosen per part
(e.g. biceps -> upper arm + forearm) and weighted by inverse distance.
"""
import argparse, json, re, sys
import numpy as np
import fast_simplification

ap = argparse.ArgumentParser()
ap.add_argument('--src', required=True)
ap.add_argument('--out', required=True)
ap.add_argument('--budget', type=int, default=90000, help='total triangles')
args = ap.parse_args()

meta = json.load(open(args.src + '/joints.json'))
data = np.load(args.src + '/parts.npz')
Jmm = {k: np.array(v) for k, v in meta['joints'].items()}
TORSO = 66.0
s = TORSO / np.linalg.norm(Jmm['neck'] - Jmm['hip'])
origin = Jmm['hip'].copy()
J = {k: (v - origin) * s for k, v in Jmm.items()}
floor = min(data[f'{pid}__v'][:, 1].min() for pid in meta['parts'])
floor_y = (floor - origin[1]) * s

BONES = ['torso', 'head']
for sd in (1, -1):
    BONES += [f'ua{sd}', f'fa{sd}', f'hand{sd}', f'th{sd}', f'sh{sd}', f'foot{sd}']
BI = {b: i for i, b in enumerate(BONES)}

def seg(b):
    if b == 'torso': return J['hip'], J['neck']
    if b == 'head': return J['neck'], J['head']
    k, sd = re.match(r'([a-z]+)(-?1)', b).groups()
    a, z = {'ua': ('shoulder', 'elbow'), 'fa': ('elbow', 'wrist'), 'hand': ('wrist', 'hand'), 'th': ('hip', 'knee'), 'sh': ('knee', 'ankle'), 'foot': ('ankle', 'toe')}[k]
    a = 'hip' + sd if a == 'hip' else a + sd
    return J[a], J[z + sd]

def frame(b):
    if b.startswith('hand'):
        # The hand rides rigidly on the forearm: same axes, origin at the wrist.
        fr = frame('fa' + b[4:])
        return dict(fr, a=seg(b)[0].tolist(), len=float(np.linalg.norm(seg(b)[1] - seg(b)[0])))
    a, z = seg(b)
    u = (z - a) / np.linalg.norm(z - a)
    hint = np.array([0, 1.0, 0]) if b.startswith('foot') else np.array([1.0, 0, 0])
    f = hint - u * (hint @ u); f /= np.linalg.norm(f)
    l = np.cross(u, f)
    return dict(a=a.tolist(), u=u.tolist(), f=f.tolist(), l=l.tolist(), len=float(np.linalg.norm(z - a)))

def allowed(name, group, side):
    S = '1' if side >= 0 else '-1'
    n = name
    if group == 'bone':
        if re.search(r'humerus', n): return [f'ua{S}']
        if re.search(r'radius|ulna', n): return [f'fa{S}']
        if re.search(r'carpal|phalanx of (?:hand|finger|thumb)|scaphoid|lunate|triquetral|pisiform|trapezium|trapezoid|capitate|hamate', n): return [f'hand{S}']
        if re.search(r'femur', n): return [f'th{S}']
        if re.search(r'patella', n): return [f'th{S}', f'sh{S}']
        if re.search(r'tibia|fibula', n): return [f'sh{S}']
        if re.search(r'metatarsal|phalanx|cuneiform|calcaneus|talus|navicular|cuboid', n): return [f'foot{S}']
        if re.search(r'clavicle|scapula', n): return ['torso', f'ua{S}']
        return ['head']
    if re.search(r'masseter|temporalis|platysma', n): return ['head']
    if re.search(r'sternocleidomastoid|splenius|levator scapulae', n): return ['torso', 'head']
    if group in ('chest', 'shoulders') or re.search(r'latissimus|teres|infraspinatus|supraspinatus|coracobrachialis|pectoralis minor', n): return ['torso', f'ua{S}']
    if group in ('traps',) or re.search(r'rhomboid|serratus', n): return ['torso', f'ua{S}'] if re.search(r'serratus', n) else ['torso', 'head']
    if group in ('abs', 'lowerback'): return ['torso']
    if group in ('biceps', 'triceps'): return [f'ua{S}', f'fa{S}']
    if group == 'forearms': return [f'fa{S}', f'ua{S}', f'hand{S}']
    if group == 'glutes' or re.search(r'tensor fasciae', n): return ['torso', f'th{S}']
    if group in ('quads', 'hamstrings') or re.search(r'sartorius|gracilis|adductor', n): return [f'th{S}', f'sh{S}', 'torso']
    if group == 'calves' or re.search(r'tibialis|fibularis|peroneus|extensor digitorum longus|extensor hallucis longus', n): return [f'sh{S}', f'th{S}', f'foot{S}']
    return ['torso']

def seg_dist(p, a, b):
    ab = b - a
    t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(p - (a + t[:, None] * ab), axis=1)

total = sum(meta['parts'][pid]['nf'] for pid in meta['parts'])
ratio = min(1.0, args.budget / total)
print(f'source triangles {total}, keep ratio {ratio:.3f}', file=sys.stderr)

ORDER = ['chest', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'lats', 'traps', 'lowerback', 'glutes', 'quads', 'hamstrings', 'calves', 'muscle', 'bone']
items = sorted(meta['parts'].items(), key=lambda kv: (ORDER.index(kv[1]['group']), kv[0]))
P, I, SI, SW, groups = [], [], [], [], []
base = 0
for pid, info in items:
    v = (data[f'{pid}__v'] - origin) * s
    f = data[f'{pid}__f']
    # Weld duplicate vertices along seams so the surface is smooth and can be simplified.
    v, inv = np.unique(np.round(v, 4), axis=0, return_inverse=True)
    f = inv.reshape(-1)[f]
    f = f[(f[:, 0] != f[:, 1]) & (f[:, 1] != f[:, 2]) & (f[:, 0] != f[:, 2])]
    keep = max(ratio, min(1.0, 80 / max(1, len(f))))
    if keep < 0.98 and len(f) > 120:
        v, f = fast_simplification.simplify(v.astype(np.float32), f.astype(np.int32), target_reduction=1 - keep)
        v = v.astype(np.float64)
    if len(f) == 0:
        continue
    bones = allowed(info['name'], info['group'], info['side'])
    d = np.stack([seg_dist(v, *seg(b)) for b in bones], axis=1)
    w = 1.0 / (d + 1.5) ** 6
    w /= w.sum(axis=1, keepdims=True)
    idx = np.zeros((len(v), 4), np.uint8); wt = np.zeros((len(v), 4), np.float64)
    for k, b in enumerate(bones[:4]):
        idx[:, k] = BI[b]; wt[:, k] = w[:, k]
    wq = np.round(wt * 255).astype(np.int32)
    wq[:, 0] += 255 - wq.sum(axis=1)
    if groups and groups[-1]['group'] == info['group']:
        groups[-1]['count'] += len(f) * 3
    else:
        groups.append({'group': info['group'], 'start': sum(len(x) for x in I) * 3, 'count': len(f) * 3})
    P.append(v); I.append(f + base); SI.append(idx); SW.append(wq.astype(np.uint8))
    base += len(v)

P = np.concatenate(P); I = np.concatenate(I); SI = np.concatenate(SI); SW = np.concatenate(SW)
Q = 50.0
pos = np.round(P * Q).astype(np.int16)
index_type = 'u16' if len(P) < 65536 else 'u32'
ind = I.astype(np.uint16 if index_type == 'u16' else np.uint32)
with open(args.out + '/anatomy.bin', 'wb') as fh:
    fh.write(pos.tobytes()); fh.write(SI.tobytes()); fh.write(SW.tobytes())
    if (pos.nbytes + SI.nbytes + SW.nbytes) % 4: fh.write(b'\0' * (4 - (pos.nbytes + SI.nbytes + SW.nbytes) % 4))
    fh.write(ind.tobytes())

L = lambda a, b: float(np.linalg.norm(J[a] - J[b]))
manifest = {
    'credit': 'BodyParts3D, Copyright© The Database Center for Life Science licensed by CC Attribution-Share Alike 2.1 Japan',
    'vertexCount': int(len(P)), 'indexCount': int(I.size), 'indexType': index_type, 'quant': Q,
    'groups': groups, 'bones': BONES, 'rest': {b: frame(b) for b in BONES},
    'joints': {k: v.tolist() for k, v in J.items()}, 'floorY': floor_y,
    'lengths': {'torso': TORSO, 'upperArm': L('shoulder1', 'elbow1'), 'forearm': L('elbow1', 'wrist1'), 'hand': L('wrist1', 'hand1'),
                'thigh': L('hip1', 'knee1'), 'shin': L('knee1', 'ankle1'), 'foot': L('ankle1', 'toe1'), 'head': L('neck', 'head'),
                'shoulderZ': abs(J['shoulder1'][2]), 'hipZ': abs(J['hip1'][2]), 'kneeZ': abs(J['knee1'][2]), 'ankleZ': abs(J['ankle1'][2])},
}
json.dump(manifest, open(args.out + '/anatomy.json', 'w'), indent=1)
print(json.dumps(manifest['lengths'], indent=1), file=sys.stderr)
print(f'vertices {len(P)}, triangles {len(I)}, bin {pos.nbytes + SI.nbytes + SW.nbytes + ind.nbytes} bytes', file=sys.stderr)
