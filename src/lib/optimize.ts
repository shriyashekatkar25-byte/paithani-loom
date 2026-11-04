/**
 * Loomability optimiser.
 *
 * Fewer colour runs per pick means fewer bobbins to pass, fewer joins to
 * interlock and less chance of error. But merging runs changes the picture.
 * For each pick we solve, exactly, the 1-D labelling problem
 *
 *   minimise  Σᵢ D(orig_i, ℓᵢ)  +  λ · #{i : ℓᵢ ≠ ℓᵢ₋₁}  +  μ · Σᵢ V_i(ℓᵢ)
 *
 * where D is perceptual colour distance (CIELAB ΔE, plus a penalty for
 * swapping silk with metal), λ prices one extra bobbin, and V_i keeps the
 * figure vertically coherent: it charges μ when cell i matched the cell
 * above in the original design but its new label differs from the
 * already-chosen label above. This is a 1-D Potts model; dynamic
 * programming over (position × label) solves it in O(n·K) with the
 * "min over all previous labels + λ" trick. Rows are solved top to bottom,
 * so the whole-cloth solution is greedy across rows but exact within each.
 *
 * Borders are structural (kadiyal selvedge) and are never altered.
 */
import { swapCost } from './palette';
import { Sari, ZONE } from './layout';
import { cloneGrid } from './grid';

export interface OptimizeResult {
  sari: Sari;
  changed: number;
  runsBefore: number;
  runsAfter: number;
  meanDeltaE: number;
}

/** Solve one row. `orig` and `above*` are aligned slices; returns new labels. */
export function solveRow(
  orig: ArrayLike<number>,
  lambda: number,
  mu = 0,
  aboveOrig?: ArrayLike<number>,
  aboveNew?: ArrayLike<number>,
): number[] {
  const n = orig.length;
  if (n === 0) return [];
  const labels = [...new Set(Array.from(orig))];
  const K = labels.length;
  const cost = (i: number, k: number) => {
    let c = swapCost(orig[i], labels[k]);
    if (mu > 0 && aboveOrig && aboveNew && aboveOrig[i] === orig[i] && aboveNew[i] !== labels[k]) c += mu;
    return c;
  };
  const best = new Float64Array(n * K);
  const back = new Int32Array(n * K); // previous label index
  for (let k = 0; k < K; k++) best[k] = cost(0, k);
  for (let i = 1; i < n; i++) {
    let minK = 0;
    for (let k = 1; k < K; k++) if (best[(i - 1) * K + k] < best[(i - 1) * K + minK]) minK = k;
    const minAll = best[(i - 1) * K + minK];
    for (let k = 0; k < K; k++) {
      const stay = best[(i - 1) * K + k];
      const jump = minAll + lambda;
      const c = cost(i, k);
      if (stay <= jump) { best[i * K + k] = stay + c; back[i * K + k] = k; }
      else { best[i * K + k] = jump + c; back[i * K + k] = minK; }
    }
  }
  let k = 0;
  for (let j = 1; j < K; j++) if (best[(n - 1) * K + j] < best[(n - 1) * K + k]) k = j;
  const out = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) {
    out[i] = labels[k];
    k = back[i * K + k];
  }
  return out;
}

/** Number of runs in a sequence. */
export const countRuns = (a: ArrayLike<number>) => {
  let r = a.length ? 1 : 0;
  for (let i = 1; i < a.length; i++) if (a[i] !== a[i - 1]) r++;
  return r;
};

/** Objective value of a labelling (used by tests to check optimality). */
export function rowObjective(orig: ArrayLike<number>, out: ArrayLike<number>, lambda: number): number {
  let c = 0;
  for (let i = 0; i < orig.length; i++) c += swapCost(orig[i], out[i]);
  return c + lambda * (countRuns(out) - 1);
}

export function optimizeSari(sari: Sari, lambda: number, mu: number): OptimizeResult {
  const { w, h } = sari;
  const weft = cloneGrid(sari.weft);
  const zone = sari.zone.slice();
  let changed = 0, runsBefore = 0, runsAfter = 0, dE = 0;
  let prevOrig: number[] | undefined, prevNew: number[] | undefined;
  for (let y = 0; y < h; y++) {
    // Find interior span (non-border cells) of this pick.
    let x0 = 0, x1 = w;
    while (x0 < w && sari.zone[y * w + x0] === ZONE.BORDER) x0++;
    while (x1 > x0 && sari.zone[y * w + x1 - 1] === ZONE.BORDER) x1--;
    const orig = Array.from(sari.weft.data.subarray(y * w + x0, y * w + x1));
    const out = solveRow(orig, lambda, mu, prevOrig, prevNew);
    runsBefore += countRuns(orig);
    runsAfter += countRuns(out);
    for (let i = 0; i < out.length; i++) {
      if (out[i] !== orig[i]) { changed++; dE += swapCost(orig[i], out[i]); }
      const k = y * w + x0 + i;
      weft.data[k] = out[i];
      // Keep body/butti zoning consistent with the new colours.
      if (zone[k] === ZONE.BUTTI && out[i] === sari.ground) zone[k] = ZONE.BODY;
      else if (zone[k] === ZONE.BODY && out[i] !== sari.ground) zone[k] = ZONE.BUTTI;
    }
    prevOrig = orig;
    prevNew = out;
  }
  return {
    sari: { ...sari, weft, zone },
    changed,
    runsBefore,
    runsAfter,
    meanDeltaE: changed ? dE / changed : 0,
  };
}
