"""Stage 1: pull the parts we need out of the BodyParts3D zip and measure the skeleton.

Reads the zip as data only. Writes parts.npz (vertices/faces per part, in app world
units) and joints.json (rest-pose joint centres) next to --out.

BodyParts3D axes: x = body's left (+), y = posterior (+), z = up, millimetres.
App world axes:   X = anterior,   Y = up,   Z = body's right.
"""
import argparse, json, re, sys, zipfile
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('--zip', required=True)
ap.add_argument('--parts', required=True)
ap.add_argument('--out', required=True)
args = ap.parse_args()

names = {}
for line in open(args.parts, encoding='utf-8'):
    cols = line.rstrip('\n').split('\t')
    if len(cols) >= 2 and cols[0].startswith(('FMA', 'BP')):
        names[cols[0]] = cols[1]

zf = zipfile.ZipFile(args.zip)
members = {}
for n in zf.namelist():
    m = re.search(r'((?:FMA|BP)\d+)\.obj$', n)
    if m:
        members[m.group(1)] = n
print('obj files in zip:', len(members), file=sys.stderr)

def load(pid):
    verts, faces = [], []
    with zf.open(members[pid]) as fh:
        for raw in fh:
            line = raw.decode('latin-1')
            if line.startswith('v '):
                verts.append([float(t) for t in line.split()[1:4]])
            elif line.startswith('f '):
                idx = [int(t.split('/')[0]) for t in line.split()[1:]]
                for k in range(1, len(idx) - 1):
                    faces.append([idx[0] - 1, idx[k] - 1, idx[k + 1] - 1])
    v = np.array(verts, dtype=np.float64)
    # to app axes (still mm)
    v = np.stack([-v[:, 1], v[:, 2], -v[:, 0]], axis=1)
    return v, np.array(faces, dtype=np.int64)

# Leaf parts available in the zip, matched by name. Group = the app's muscle id
# (or 'muscle' for neutral muscles, 'bone' for bones).
RULES = [
    (r'pectoralis major', 'chest'), (r'pectoralis minor', 'muscle'),
    (r'deltoid', 'shoulders'),
    (r'biceps brachii', 'biceps'), (r'brachialis$', 'biceps'), (r'coracobrachialis', 'muscle'),
    (r'triceps brachii', 'triceps'), (r'anconeus', 'triceps'),
    (r'brachioradialis|flexor carpi|extensor carpi|palmaris longus|pronator teres|flexor digitorum superficialis|extensor digitorum(?! (?:brevis|longus))|extensor digiti minimi|abductor pollicis longus|extensor pollicis', 'forearms'),
    (r'rectus abdominis', 'abs'), (r'external oblique', 'abs'),
    (r'latissimus dorsi', 'lats'), (r'rhomboid', 'lats'), (r'teres major', 'lats'), (r'infraspinatus', 'lats'), (r'teres minor', 'lats'),
    (r'trapezius', 'traps'), (r'levator scapulae', 'traps'),
    (r'iliocostalis|longissimus thoracis|spinalis thoracis', 'lowerback'),
    (r'gluteus maximus|gluteus medius', 'glutes'),
    (r'rectus femoris|vastus lateralis|vastus medialis', 'quads'),
    (r'biceps femoris|semitendinosus|semimembranosus', 'hamstrings'),
    (r'gastrocnemius|soleus', 'calves'),
    (r'serratus anterior|sternocleidomastoid|tensor fasciae latae|sartorius|gracilis|adductor longus|adductor magnus|tibialis anterior|fibularis longus|peroneus longus|extensor digitorum longus|extensor hallucis longus|supraspinatus|splenius capitis|platysma|masseter|temporalis', 'muscle'),
]
BONES = r'^(?:skull|mandible|frontal bone|parietal bone|occipital bone|temporal bone|sphenoid bone|zygomatic bone|maxilla|nasal bone|right |left )?(?:.*)?$'
BONE_RULES = [
    r'(right|left) (clavicle|scapula|humerus|radius|ulna|femur|patella|tibia|fibula|calcaneus|talus|navicular bone|cuboid bone)$',
    r'(right|left) .*(carpal|metacarpal|phalanx of (?:hand|finger|thumb|index|middle|ring|little)|scaphoid|lunate|triquetral|pisiform|trapezium|trapezoid|capitate|hamate)',
    r'(right|left) .*(metatarsal|phalanx of (?:foot|toe|great toe|big toe|second|third|fourth|fifth)|cuneiform)',
    r'^(frontal bone|occipital bone|mandible|sphenoid bone|vomer)$', r'(right|left) (parietal bone|temporal bone|zygomatic bone|maxilla|nasal bone)$',
]

picked = {}
for pid, name in names.items():
    if pid not in members:
        continue
    # the side can sit mid-name: 'medial head of left gastrocnemius'
    side = 1 if re.search(r'(?:^| )right(?: |$)', name) else -1 if re.search(r'(?:^| )left(?: |$)', name) else 0
    grp = None
    for rx, g in RULES:
        if re.search(rx, name):
            grp = g
            break
    if grp is None and any(re.search(rx, name) for rx in BONE_RULES):
        grp = 'bone'
    if grp:
        picked[pid] = (name, grp, side)

print('picked parts:', len(picked), file=sys.stderr)
from collections import Counter
print(Counter(g for _, g, _ in picked.values()), file=sys.stderr)

parts = {}
for pid, (name, grp, side) in picked.items():
    v, f = load(pid)
    if len(f) == 0:
        continue
    parts[pid] = dict(name=name, group=grp, side=side, v=v, f=f)

def bone(name):
    for p in parts.values():
        if p['name'] == name:
            return p['v']
    raise SystemExit(f'missing bone: {name}')

def end_mean(v, top, frac=0.06, pick=None):
    z = v[:, 1]
    lo, hi = z.min(), z.max()
    cut = hi - (hi - lo) * frac if top else lo + (hi - lo) * frac
    sel = v[z >= cut] if top else v[z <= cut]
    if pick is not None:
        sel = pick(sel)
    return sel.mean(axis=0)

J = {}
for s, sname in ((1, 'right'), (-1, 'left')):
    hum = bone(f'{sname} humerus')
    J[f'shoulder{s}'] = end_mean(hum, True, 0.07)
    J[f'elbow{s}'] = end_mean(hum, False, 0.05)
    rad = bone(f'{sname} radius'); uln = bone(f'{sname} ulna')
    J[f'wrist{s}'] = (end_mean(rad, False, 0.04) + end_mean(uln, False, 0.04)) / 2
    fem = bone(f'{sname} femur')
    # the femoral head is the most medial part of the top of the femur
    J[f'hip{s}'] = end_mean(fem, True, 0.08, pick=lambda q: q[np.argsort(np.abs(q[:, 2]))[: max(10, len(q) // 3)]])
    J[f'knee{s}'] = end_mean(fem, False, 0.05)
    tib = bone(f'{sname} tibia')
    J[f'ankle{s}'] = end_mean(tib, False, 0.05)
    foot = np.concatenate([p['v'] for p in parts.values() if p['group'] == 'bone' and p['side'] == s and re.search(r'metatarsal|phalanx|toe', p['name'])])
    J[f'toe{s}'] = foot[np.argmax(foot[:, 0])]
    hand = np.concatenate([p['v'] for p in parts.values() if p['group'] == 'bone' and p['side'] == s and re.search(r'metacarpal|phalanx|carpal|capitate|hamate|scaphoid|lunate', p['name'])])
    J[f'hand{s}'] = hand.mean(axis=0)
skull = np.concatenate([p['v'] for p in parts.values() if p['group'] == 'bone' and re.search(r'frontal|parietal|occipital|temporal bone|mandible|maxilla|zygomatic|sphenoid', p['name'])])
J['head'] = skull.mean(axis=0)
J['neck'] = (J['shoulder1'] + J['shoulder-1']) / 2
J['hip'] = (J['hip1'] + J['hip-1']) / 2

L = lambda a, b: float(np.linalg.norm(J[a] - J[b]))
print('lengths mm: torso %.0f  ua %.0f  fa %.0f  thigh %.0f  shin %.0f  foot %.0f  shoulderW %.0f  hipW %.0f' % (
    L('hip', 'neck'), L('shoulder1', 'elbow1'), L('elbow1', 'wrist1'), L('hip1', 'knee1'), L('knee1', 'ankle1'), L('ankle1', 'toe1'),
    L('shoulder1', 'shoulder-1'), L('hip1', 'hip-1')), file=sys.stderr)
print('floor (min y) mm:', min(p['v'][:, 1].min() for p in parts.values()), file=sys.stderr)

np.savez_compressed(args.out + '/parts.npz', **{f'{pid}__v': p['v'] for pid, p in parts.items()}, **{f'{pid}__f': p['f'] for pid, p in parts.items()})
json.dump({'joints': {k: v.tolist() for k, v in J.items()}, 'parts': {pid: dict(name=p['name'], group=p['group'], side=p['side'], nv=len(p['v']), nf=len(p['f'])) for pid, p in parts.items()}},
          open(args.out + '/joints.json', 'w'), indent=1)
print('done', file=sys.stderr)
