import { describe, expect, it } from 'vitest';
import { EXERCISES } from '../src/data/exercises.js';
import { analyse } from '../tools/anatomy/clash.mjs';

/*
 * No exercise may show body parts passing through each other or through
 * equipment. Uses the real skinned anatomy (tools/anatomy/clash.mjs):
 *   - limb/trunk overlap is measured above the untouched standing anatomy, where
 *     the arms already rest on the ribs; up to ~22 shared voxels is skin contact.
 *   - benches, seats and pads must not cut into the body by 1 unit or more.
 */
const CONTACT = 22;

describe('no body parts crossing', () => {
  for (const ex of EXERCISES) {
    it(ex.id, () => {
      const r = analyse(ex, 8);
      const body = Object.entries(r.body).filter(([, w]) => w.c > CONTACT).map(([k, w]) => `${k} +${w.c} at t=${w.t}`);
      const props = Object.entries(r.props).filter(([, p]) => p.depth >= 1).map(([k, p]) => `equipment ${k} ${p.depth} deep at t=${p.t}`);
      expect([...body, ...props], 'run: node tools/anatomy/clash-report.mjs ' + ex.id).toEqual([]);
    });
  }
}, 120000);
