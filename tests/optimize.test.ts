import { solveRow, countRuns, rowObjective, optimizeSari } from '../src/lib/optimize';
import { composeSari, DEFAULT_PARAMS, ZONE } from '../src/lib/layout';
import { compile } from '../src/lib/weave';
import { mulberry32 } from '../src/lib/rng';

/** Brute force over all labellings drawn from the row's own colours. */
function brute(orig: number[], lambda: number): number {
  const labels = [...new Set(orig)];
  let best = Infinity;
  const cur: number[] = [];
  const rec = (i: number) => {
    if (i === orig.length) { best = Math.min(best, rowObjective(orig, cur, lambda)); return; }
    for (const l of labels) { cur[i] = l; rec(i + 1); }
  };
  rec(0);
  return best;
}

describe('loomability optimiser', () => {
  it('λ = 0 returns the design unchanged', () => {
    const row = [2, 2, 12, 3, 3, 12, 12, 9];
    expect(solveRow(row, 0)).toEqual(row);
  });
  it('matches brute force on random rows (exactness of the DP)', () => {
    const rnd = mulberry32(7);
    const pal = [2, 3, 9, 12, 6];
    for (let t = 0; t < 40; t++) {
      const n = 3 + Math.floor(rnd() * 5);
      const row = Array.from({ length: n }, () => pal[Math.floor(rnd() * pal.length)]);
      const lambda = rnd() * 80;
      const out = solveRow(row, lambda);
      expect(rowObjective(row, out, lambda)).toBeCloseTo(brute(row, lambda), 6);
    }
  });
  it('very large λ collapses a row to one run', () => {
    expect(countRuns(solveRow([2, 3, 2, 3, 12, 2], 1e6))).toBe(1);
  });
  it('reduces total bobbins on the default design and never touches borders', () => {
    const s = composeSari(DEFAULT_PARAMS);
    const r = optimizeSari(s, 40, 8);
    expect(r.runsAfter).toBeLessThan(r.runsBefore);
    expect(compile(r.sari).meanRuns).toBeLessThan(compile(s).meanRuns);
    for (let i = 0; i < s.zone.length; i++) if (s.zone[i] === ZONE.BORDER) expect(r.sari.weft.data[i]).toBe(s.weft.data[i]);
  });
});
