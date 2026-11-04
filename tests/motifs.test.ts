import { MOTIFS, rasterize, motifByKey } from '../src/lib/motifs';
import { isMirrorSymmetric, histogram } from '../src/lib/grid';
import { EMPTY } from '../src/lib/palette';

const roles = { p: 2, s: 3, a: 9, outline: EMPTY };

describe('motifs', () => {
  it('every motif draws something with sensible coverage', () => {
    for (const m of MOTIFS) {
      const g = rasterize(m.shape, 32, 32, roles);
      const filled = [...histogram(g).values()].reduce((a, b) => a + b, 0);
      expect(filled, m.key).toBeGreaterThan(32 * 32 * 0.08);
      expect(filled, m.key).toBeLessThan(32 * 32 * 0.85);
    }
  });
  it('symmetric motifs are exactly mirror-symmetric at several sizes', () => {
    for (const key of ['kamal', 'asavali', 'rui', 'tara'])
      for (const n of [9, 16, 33, 40]) expect(isMirrorSymmetric(rasterize(motifByKey(key).shape, n, n, roles)), `${key}@${n}`).toBe(true);
  });
  it('the peacock uses all three roles and is not symmetric (it faces left)', () => {
    const g = rasterize(motifByKey('mor').shape, 40, 40, roles);
    const h = histogram(g);
    expect(h.get(2)).toBeGreaterThan(0);
    expect(h.get(3)).toBeGreaterThan(0);
    expect(h.get(9)).toBeGreaterThan(0);
    expect(isMirrorSymmetric(g)).toBe(false);
  });
  it('outline pass rings the figure without touching filled cells', () => {
    const plain = rasterize(motifByKey('tara').shape, 20, 20, roles);
    const ringed = rasterize(motifByKey('tara').shape, 20, 20, { ...roles, outline: 1 });
    for (let i = 0; i < plain.data.length; i++) if (plain.data[i] !== EMPTY) expect(ringed.data[i]).toBe(plain.data[i]);
    expect(histogram(ringed).get(1)).toBeGreaterThan(0);
  });
});
