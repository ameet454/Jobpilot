# Muscle atlas (build-time only)

The 3-D body the app shows is the MakeHuman base mesh (see `tools/body/`). To know which muscle
lies under each patch of skin, `tools/body/build_body.py` reads a muscle atlas built from
BodyParts3D (release 3.0, 99 % reduced OBJ set). That atlas lives in `tools/body/atlas/` and is
**not** shipped to users.

```bash
python -m venv .venv && .venv/bin/pip install numpy==2.3.4 fast-simplification==0.1.12
# download BodyParts3D_3.0_obj_99.zip and parts_list_e.txt from
# https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20110915/
.venv/bin/python bp_extract.py --zip BodyParts3D_3.0_obj_99.zip --parts parts_list_e.txt --out work
.venv/bin/python bp_build.py --src work --out work --budget 90000
cp work/anatomy.bin work/anatomy.json ../body/atlas/
```

Licence of the atlas and of the muscle labels derived from it: CC BY-SA 2.1 JP —
"BodyParts3D, Copyright© The Database Center for Life Science licensed by CC Attribution-Share Alike 2.1 Japan".
