/**
 * The weave compiler: reads a composed sari pick by pick, the way a
 * tapestry weaver meets it at the loom, and produces a ledger.
 *
 * In tapestry weave every maximal run of one colour within a pick is woven
 * by its own small bobbin, so the number of runs in a pick is the number of
 * bobbins the weaver must pass. Where two runs meet, Paithani weavers
 * interlock the wefts (kadiyal) so no slit opens; with simple split tapestry
 * a boundary that stays at the same end for many picks opens a slit.
 */
import { THREADS } from './palette';
import { Sari, ZONE } from './layout';

export interface Run { color: number; start: number; len: number }

export interface Ledger {
  picks: number;
  ends: number;
  /** Runs (bobbins) per pick. */
  runs: Uint16Array;
  /** Distinct colours per pick. */
  colors: Uint8Array;
  /** Runs of a single end (fragile under beating) per pick. */
  fragile: Uint16Array;
  maxRuns: number;
  meanRuns: number;
  totalJoins: number;
  /** Vertical boundaries that persist ≥ SLIT_MIN picks at the same end. */
  slits: number;
  longestSlit: number;
  zariCells: number;
  colorUse: Array<{ id: number; cells: number }>;
  /** Illustrative relative effort: 1.0 = a plain one-shuttle pick. */
  effortIndex: number;
}

export const SLIT_MIN = 6;
/** Illustrative extra effort of each additional bobbin in a pick. An assumption, not a measurement. */
export const BOBBIN_WEIGHT = 0.5;

/** Run-length encode one pick (row) of the weft grid. */
export function runsOfPick(sari: Sari, y: number): Run[] {
  const { w } = sari;
  const row = sari.weft.data.subarray(y * w, y * w + w);
  const out: Run[] = [];
  let start = 0;
  for (let x = 1; x <= w; x++) {
    if (x === w || row[x] !== row[start]) {
      out.push({ color: row[start], start, len: x - start });
      start = x;
    }
  }
  return out;
}

export function compile(sari: Sari): Ledger {
  const { w, h, weft } = sari;
  const runs = new Uint16Array(h);
  const colors = new Uint8Array(h);
  const fragile = new Uint16Array(h);
  const use = new Map<number, number>();
  let totalJoins = 0, zari = 0, effort = 0;

  // boundaryRun[x] = consecutive picks so far with a colour boundary between end x-1 and x.
  const boundaryRun = new Uint16Array(w);
  let slits = 0, longest = 0;

  for (let y = 0; y < h; y++) {
    const rs = runsOfPick(sari, y);
    runs[y] = rs.length;
    colors[y] = new Set(rs.map((r) => r.color)).size;
    fragile[y] = rs.filter((r) => r.len === 1).length;
    totalJoins += rs.length - 1;
    effort += 1 + BOBBIN_WEIGHT * (rs.length - 1);
    for (const r of rs) {
      use.set(r.color, (use.get(r.color) ?? 0) + r.len);
      if (THREADS[r.color]?.metal) zari += r.len;
    }
    const row = weft.data.subarray(y * w, y * w + w);
    for (let x = 1; x < w; x++) {
      if (row[x] !== row[x - 1]) {
        boundaryRun[x]++;
        if (boundaryRun[x] === SLIT_MIN) slits++;
        if (boundaryRun[x] > longest) longest = boundaryRun[x];
      } else boundaryRun[x] = 0;
    }
  }
  let maxRuns = 0, sum = 0;
  for (const r of runs) { sum += r; if (r > maxRuns) maxRuns = r; }
  return {
    picks: h,
    ends: w,
    runs,
    colors,
    fragile,
    maxRuns,
    meanRuns: sum / h,
    totalJoins,
    slits,
    longestSlit: longest,
    zariCells: zari,
    colorUse: [...use.entries()].map(([id, cells]) => ({ id, cells })).sort((a, b) => b.cells - a.cells),
    effortIndex: effort / h,
  };
}

/** Is this cell woven as balanced plain weave (warp visible) or weft-faced tapestry? */
export const isBalanced = (sari: Sari, x: number, y: number) => sari.zone[y * sari.w + x] === ZONE.BODY;

/** Plain-weave interlacement: true where the warp end lies over the pick. */
export const warpUp = (x: number, y: number) => ((x + y) & 1) === 0;

/** Ledger rows as CSV for export. */
export function ledgerCSV(sari: Sari, ledger: Ledger): string {
  const lines = ['pick,bobbins,colours,single_end_runs,runs'];
  for (let y = 0; y < sari.h; y++) {
    const rs = runsOfPick(sari, y)
      .map((r) => `${THREADS[r.color]?.key ?? r.color}:${r.len}`)
      .join(' ');
    lines.push(`${y + 1},${ledger.runs[y]},${ledger.colors[y]},${ledger.fragile[y]},${rs}`);
  }
  return lines.join('\n');
}
