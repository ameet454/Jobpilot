import { describe, expect, it } from 'vitest';
import { EXERCISES } from '../src/data/exercises.js';
import { analyse } from '../tools/body/clash.mjs';

/*
 * No exercise may show body parts passing through each other, through
 * equipment or through the floor. Uses the real skinned body (tools/body/clash.mjs):
 *   - limb/trunk overlap is measured above a standing pose where the arms rest on the
 *     ribs; up to ~20 shared voxels is skin contact (thighs on the belly in a deep squat).
 *   - benches, seats and pads must not cut into the body by 1 unit or more.
 *   - nothing sinks more than 4 units into the floor.
 */
const CONTACT = 20;

describe('no body parts crossing', () => {
  for (const ex of EXERCISES) {
    it(ex.id, () => {
      const r = analyse(ex, 8);
      const body = Object.entries(r.body).filter(([, w]) => w.c > CONTACT).map(([k, w]) => `${k} +${w.c} at t=${w.t}`);
      const props = Object.entries(r.props).filter(([, p]) => p.depth >= 1).map(([k, p]) => `equipment ${k} ${p.depth} deep at t=${p.t}`);
      const floor = r.floor.depth > 4 ? [`${r.floor.depth} below the floor at t=${r.floor.t}`] : [];
      expect([...body, ...props, ...floor], 'run: node tools/body/clash-report.mjs ' + ex.id).toEqual([]);
    });
  }
}, 120000);
