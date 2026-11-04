import { makeGrid, set, get, paint, line, floodFill, isMirrorSymmetric, encodeGrid, decodeGrid, histogram } from '../src/lib/grid';
import { EMPTY } from '../src/lib/palette';

describe('grid', () => {
  it('get/set respect bounds', () => {
    const g = makeGrid(4, 3);
    set(g, 1, 2, 7);
    set(g, 9, 9, 7);
    expect(get(g, 1, 2)).toBe(7);
    expect(get(g, -1, 0)).toBe(EMPTY);
  });
  it('mirror painting keeps bilateral symmetry', () => {
    const g = makeGrid(9, 9);
    paint(g, 1, 4, 3, true);
    line(g, 0, 0, 3, 8, 5, true);
    expect(isMirrorSymmetric(g)).toBe(true);
    expect(get(g, 7, 4)).toBe(3);
  });
  it('flood fill fills a bounded region only', () => {
    const g = makeGrid(5, 5, 0);
    for (let i = 0; i < 5; i++) set(g, 2, i, 1); // wall
    expect(floodFill(g, 0, 0, 2)).toBe(10);
    expect(get(g, 4, 4)).toBe(0);
    expect(floodFill(g, 0, 0, 2)).toBe(0);
  });
  it('round-trips through encode/decode and rejects junk', () => {
    const g = makeGrid(6, 4);
    set(g, 5, 3, 12);
    const d = decodeGrid(encodeGrid(g))!;
    expect(Array.from(d.data)).toEqual(Array.from(g.data));
    expect(decodeGrid('nope')).toBeNull();
    expect(decodeGrid('3x3:AAAA')).toBeNull();
    expect(histogram(g).get(12)).toBe(1);
  });
});
