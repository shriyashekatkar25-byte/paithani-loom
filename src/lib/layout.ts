/**
 * The sari composer: turns a small set of design parameters into a full
 * cell-level textile. x = warp ends across the width, y = picks along the
 * length. We model the padar (pallu) end of a sari: a shot-silk body with
 * buttis, kadiyal borders running along both selvedges with narali teeth,
 * a barwa stripe band, then a zari-ground pallu with rows of tapestry motifs.
 *
 * One cell stands for a bundle of threads (≈ 1 cm² at the default size),
 * not a single thread: a real sari has thousands of ends.
 */
import { EMPTY, ZARI } from './palette';
import { Grid, makeGrid } from './grid';
import { motifByKey, rasterize, RoleMap } from './motifs';
import { mulberry32 } from './rng';

export const ZONE = { BODY: 0, BORDER: 1, PALLU: 2, BUTTI: 3 } as const;

export interface SariParams {
  seed: number;
  w: number;
  h: number;
  bodyWarp: number;
  bodyWeft: number;
  borderWidth: number;
  borderColor: number;
  naraliColor: number;
  butti: string;
  buttiColor: number;
  buttiSize: number;
  buttiSpacing: number;
  palluLength: number;
  palluGround: number;
  palluMotif: string;
  palluRows: number;
  palluP: number;
  palluS: number;
  palluA: number;
  facing: boolean;
}

export interface Sari {
  w: number;
  h: number;
  /** Weft (visible tapestry) colour of each cell. */
  weft: Grid;
  /** Warp colour of each end (constant along the length). */
  warp: Uint8Array;
  /** Zone of each cell (see ZONE). Body cells are balanced plain weave; others are weft-faced. */
  zone: Uint8Array;
  /** Pick index where the pallu begins. */
  palluStart: number;
  /** Body ground weft colour. */
  ground: number;
}

export const DEFAULT_PARAMS: SariParams = {
  seed: 2004,
  w: 168,
  h: 300,
  bodyWarp: 2, // vangi
  bodyWeft: 3, // morpankhi → purple/green dhoop-chhaon
  borderWidth: 18,
  borderColor: 9, // rani
  naraliColor: ZARI,
  butti: 'rui',
  buttiColor: ZARI,
  buttiSize: 9,
  buttiSpacing: 22,
  palluLength: 150,
  palluGround: ZARI,
  palluMotif: 'mor',
  palluRows: 2,
  palluP: 5,
  palluS: 3,
  palluA: 9,
  facing: true,
};

const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number.isFinite(v) ? v : lo)));

/** Coerce untrusted (e.g. stored) params into a valid design. */
export function sanitizeParams(p: Partial<SariParams>): SariParams {
  const d = DEFAULT_PARAMS;
  const t = (v: unknown, fb: number) => (typeof v === 'number' && v >= 0 && v <= 13 ? Math.round(v) : fb);
  const w = clampInt(p.w ?? d.w, 64, 256);
  const h = clampInt(p.h ?? d.h, 120, 400);
  return {
    seed: clampInt(p.seed ?? d.seed, 0, 2 ** 31 - 1),
    w,
    h,
    bodyWarp: t(p.bodyWarp, d.bodyWarp),
    bodyWeft: t(p.bodyWeft, d.bodyWeft),
    borderWidth: clampInt(p.borderWidth ?? d.borderWidth, 6, Math.floor(w / 5)),
    borderColor: t(p.borderColor, d.borderColor),
    naraliColor: t(p.naraliColor, d.naraliColor),
    butti: typeof p.butti === 'string' ? p.butti : d.butti,
    buttiColor: t(p.buttiColor, d.buttiColor),
    buttiSize: clampInt(p.buttiSize ?? d.buttiSize, 5, 15),
    buttiSpacing: clampInt(p.buttiSpacing ?? d.buttiSpacing, 12, 40),
    palluLength: clampInt(p.palluLength ?? d.palluLength, 40, Math.floor(h * 0.7)),
    palluGround: t(p.palluGround, d.palluGround),
    palluMotif: typeof p.palluMotif === 'string' ? p.palluMotif : d.palluMotif,
    palluRows: clampInt(p.palluRows ?? d.palluRows, 1, 3),
    palluP: t(p.palluP, d.palluP),
    palluS: t(p.palluS, d.palluS),
    palluA: t(p.palluA, d.palluA),
    facing: typeof p.facing === 'boolean' ? p.facing : d.facing,
  };
}

/**
 * Compose the textile. `custom` replaces the pallu motif when palluMotif === 'custom'.
 */
export function composeSari(params: SariParams, custom: Grid | null = null): Sari {
  const p = sanitizeParams(params);
  const { w, h, borderWidth: bw } = p;
  const weft = makeGrid(w, h, p.bodyWeft);
  const zone = new Uint8Array(w * h);
  const warp = new Uint8Array(w).fill(p.bodyWarp);
  const palluStart = h - p.palluLength;
  const rnd = mulberry32(p.seed);
  const setCell = (x: number, y: number, v: number, z: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    weft.data[y * w + x] = v;
    zone[y * w + x] = z;
  };

  // Body buttis on a half-drop grid, kept clear of borders and pallu.
  const bm = motifByKey(p.butti);
  const bs = p.buttiSize;
  const butti = rasterize(bm.shape, bs, bs, { p: p.buttiColor, s: p.buttiColor, a: p.buttiColor, outline: EMPTY });
  const sp = p.buttiSpacing;
  const jitter = Math.floor(rnd() * sp);
  for (let j = 0, y = 6 + (jitter % 6); y + bs < palluStart - 14; j++, y += sp) {
    for (let x = bw + 4 + ((j % 2) * sp) / 2; x + bs < w - bw - 3; x += sp) {
      const ox = Math.round(x), oy = Math.round(y);
      for (let yy = 0; yy < bs; yy++)
        for (let xx = 0; xx < bs; xx++) {
          const v = butti.data[yy * bs + xx];
          if (v !== EMPTY) setCell(ox + xx, oy + yy, v, ZONE.BUTTI);
        }
    }
  }

  // Pallu: barwa stripe band then zari ground with motif rows.
  const band = 20;
  const stripes = [p.borderColor, p.palluGround, p.bodyWeft, p.palluGround];
  for (let y = palluStart; y < h; y++)
    for (let x = bw; x < w - bw; x++) {
      const dy = y - palluStart;
      const v = dy < band ? stripes[Math.floor(dy / 2.5) % stripes.length] : p.palluGround;
      setCell(x, y, v, ZONE.PALLU);
    }
  const innerW = w - 2 * bw - 6;
  const rowH = Math.floor((p.palluLength - band - 6) / p.palluRows);
  const m = Math.max(12, Math.min(44, rowH - 6));
  const roles: RoleMap = { p: p.palluP, s: p.palluS, a: p.palluA, outline: 1 };
  const motif = p.palluMotif === 'custom' && custom ? custom : rasterize(motifByKey(p.palluMotif).shape, m, m, roles);
  const mw = motif.w, mh = motif.h;
  const count = Math.max(1, Math.floor((innerW + 6) / (mw + 6)));
  const gap = (innerW - count * mw) / (count + 1);
  for (let r = 0; r < p.palluRows; r++) {
    const oy = palluStart + band + 4 + r * rowH + Math.floor((rowH - mh) / 2);
    for (let i = 0; i < count; i++) {
      const ox = Math.round(bw + 3 + gap + i * (mw + gap));
      // Paired figures face each other: flip every even one (motifs are drawn facing left).
      const flip = p.facing && i % 2 === 0 && i < count - (count % 2);
      for (let yy = 0; yy < mh; yy++)
        for (let xx = 0; xx < mw; xx++) {
          const v = motif.data[yy * mw + (flip ? mw - 1 - xx : xx)];
          if (v !== EMPTY) setCell(ox + xx, oy + yy, v, ZONE.PALLU);
        }
    }
  }

  // Kadiyal borders along both selvedges: warp = weft = border colour,
  // with zari lines and narali (coconut-tooth) triangles pointing inward.
  const period = 8, teeth = Math.max(3, Math.floor(bw * 0.4));
  for (let x = 0; x < bw; x++) {
    warp[x] = p.borderColor;
    warp[w - 1 - x] = p.borderColor;
  }
  for (let y = 0; y < h; y++) {
    const t = y % period;
    const reach = Math.round(teeth * (1 - Math.abs(t - period / 2) / (period / 2)));
    for (let x = 0; x < bw; x++) {
      let v = p.borderColor;
      if (x === 1 || x === bw - 3) v = p.naraliColor;
      if (x >= bw - 3 - reach && x < bw - 3) v = p.naraliColor;
      if (x === 3 && t < 2) v = p.naraliColor;
      setCell(x, y, v, ZONE.BORDER);
      setCell(w - 1 - x, y, v, ZONE.BORDER);
    }
  }
  return { w, h, weft, warp, zone, palluStart, ground: p.bodyWeft };
}
