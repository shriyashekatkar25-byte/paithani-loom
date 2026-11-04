import { composeSari, DEFAULT_PARAMS, ZONE, sanitizeParams, Sari } from '../src/lib/layout';
import { compile, runsOfPick, ledgerCSV, SLIT_MIN } from '../src/lib/weave';
import { makeGrid } from '../src/lib/grid';

function tiny(rows: number[][]): Sari {
  const h = rows.length, w = rows[0].length;
  const weft = makeGrid(w, h);
  rows.flat().forEach((v, i) => (weft.data[i] = v));
  return { w, h, weft, warp: new Uint8Array(w), zone: new Uint8Array(w * h), palluStart: h, ground: 0 };
}

describe('sari composer', () => {
  const s = composeSari(DEFAULT_PARAMS);
  it('produces the requested dimensions and zones', () => {
    expect(s.weft.data.length).toBe(DEFAULT_PARAMS.w * DEFAULT_PARAMS.h);
    expect(s.palluStart).toBe(DEFAULT_PARAMS.h - DEFAULT_PARAMS.palluLength);
    expect(s.zone[0]).toBe(ZONE.BORDER);
    expect(s.zone[s.w * (s.h - 1) + Math.floor(s.w / 2)]).toBe(ZONE.PALLU);
    expect([...s.zone].some((z) => z === ZONE.BUTTI)).toBe(true);
  });
  it('borders are kadiyal: warp colour equals border colour on both selvedges', () => {
    expect(s.warp[0]).toBe(DEFAULT_PARAMS.borderColor);
    expect(s.warp[s.w - 1]).toBe(DEFAULT_PARAMS.borderColor);
    expect(s.warp[Math.floor(s.w / 2)]).toBe(DEFAULT_PARAMS.bodyWarp);
  });
  it('is deterministic for a seed', () => {
    expect(Array.from(composeSari(DEFAULT_PARAMS).weft.data)).toEqual(Array.from(s.weft.data));
  });
  it('sanitises hostile params', () => {
    const p = sanitizeParams({ w: 99999, bodyWarp: 77, palluRows: -3, borderWidth: NaN } as never);
    expect(p.w).toBe(256);
    expect(p.bodyWarp).toBe(DEFAULT_PARAMS.bodyWarp);
    expect(p.palluRows).toBe(1);
    expect(p.borderWidth).toBeGreaterThanOrEqual(6);
  });
});

describe('weave compiler', () => {
  it('counts runs (bobbins) per pick', () => {
    const t = tiny([[1, 1, 2, 2, 1], [3, 3, 3, 3, 3]]);
    expect(runsOfPick(t, 0)).toEqual([
      { color: 1, start: 0, len: 2 },
      { color: 2, start: 2, len: 2 },
      { color: 1, start: 4, len: 1 },
    ]);
    const l = compile(t);
    expect(Array.from(l.runs)).toEqual([3, 1]);
    expect(Array.from(l.colors)).toEqual([2, 1]);
    expect(Array.from(l.fragile)).toEqual([1, 0]);
    expect(l.totalJoins).toBe(2);
    expect(l.maxRuns).toBe(3);
    expect(l.effortIndex).toBeCloseTo((1 + 0.5 * 2 + 1) / 2);
  });
  it('detects slits: a boundary held at the same end for ≥ SLIT_MIN picks', () => {
    const rows = Array.from({ length: SLIT_MIN + 2 }, () => [1, 1, 2, 2]);
    const l = compile(tiny(rows));
    expect(l.slits).toBe(1);
    expect(l.longestSlit).toBe(SLIT_MIN + 2);
    const stair = Array.from({ length: 10 }, (_, y) => [0, 1, 2, 3].map((x) => (x < 1 + (y % 3) ? 1 : 2)));
    expect(compile(tiny(stair)).slits).toBe(0);
  });
  it('counts zari cells', () => {
    expect(compile(tiny([[12, 12, 1]])).zariCells).toBe(2);
  });
  it('exports one CSV line per pick', () => {
    const t = tiny([[1, 2], [2, 2]]);
    const csv = ledgerCSV(t, compile(t)).split('\n');
    expect(csv).toHaveLength(3);
    expect(csv[1]).toBe('1,2,2,2,kalichandrakala:1 vangi:1');
  });
});
