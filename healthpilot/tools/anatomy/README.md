# Anatomy build

Turns BodyParts3D (release 3.0, 99 % reduced OBJ set) into `public/anatomy/anatomy.{bin,json}`.

```bash
python -m venv .venv && .venv/bin/pip install numpy==2.3.4 fast-simplification==0.1.12
# download BodyParts3D_3.0_obj_99.zip and parts_list_e.txt from
# https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20110915/
.venv/bin/python bp_extract.py --zip BodyParts3D_3.0_obj_99.zip --parts parts_list_e.txt --out work
.venv/bin/python bp_build.py --src work --out work --budget 90000
cp work/anatomy.bin work/anatomy.json ../../public/anatomy/
```

`bp_extract.py` picks the muscles and bones, converts axes (BodyParts3D: x = left, y = posterior,
z = up, mm → app: X = anterior, Y = up, Z = right) and measures the joint centres.
`bp_build.py` scales to the app's torso length (66), welds and simplifies each part, binds every
vertex to up to 4 of the rig's 14 bones and writes the packed mesh.

Licence of the derived data: CC BY-SA 2.1 JP — credit line
"BodyParts3D, Copyright© The Database Center for Life Science licensed by CC Attribution-Share Alike 2.1 Japan".
