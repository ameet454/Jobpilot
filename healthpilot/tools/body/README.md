# 3-D body

`public/body/body.{bin,json}` is the athlete in the exercise viewer: the MakeHuman base mesh
(CC0 1.0, https://github.com/makehumancommunity/makehuman) shaped into a young athletic man,
skinned to the exercise rig's 17 bones, with closed fists, a palms-flat morph for push-ups,
painted shorts/hair/eyes, baked cavity shading, and the muscle head under each skin vertex
(from the atlas in `atlas/`, see `../anatomy/README.md`).

```bash
python -m venv .venv && .venv/bin/pip install numpy scipy
# MakeHuman assets (CC0): makehuman/data/3dobjs/base.obj, rigs/default.mhskel, rigs/default_weights.mhw,
# and these targets into <mh>/t/: macrodetails/{african,asian,caucasian}-male-young.target,
# macrodetails/universal-male-young-maxmuscle-averageweight.target
.venv/bin/python build_body.py --mh <mh> --atlas atlas --out ../../public/body
```

Then regenerate the exercise thumbnails and body-map images:

```bash
node tools/body/save-server.mjs             # writes into public/thumbs and public/body
npm run dev                                  # then open /tools/body/render-assets.html
```

Bump `CACHE` in `public/sw.js` afterwards (these files are not content-hashed).

Checks: `node tools/body/clash-report.mjs [id…]` lists limbs crossing the body, equipment
cutting into it and anything sinking through the floor; `tests/body-clash.test.js` enforces it.
`/tools/body/preview.html?ex=all` renders a contact sheet of every exercise.
