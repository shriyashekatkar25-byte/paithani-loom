/**
 * A Grid is a w×h raster of thread ids (Uint8, 255 = empty).
 * x runs across the warp (ends), y runs along the weft (picks).
 */
import { EMPTY } from './palette';

export interface Grid {
  w: number;
  h: number;
  data: Uint8Array;
}

export function makeGrid(w: number, h: number, fill = EMPTY): Grid {
  const data = new Uint8Array(w * h);
  data.fill(fill);
  return { w, h, data };
}

export const cloneGrid = (g: Grid): Grid => ({ w: g.w, h: g.h, data: g.data.slice() });

export const inBounds = (g: Grid, x: number, y: number) => x >= 0 && y >= 0 && x < g.w && y < g.h;

export function get(g: Grid, x: number, y: number): number {
  return inBounds(g, x, y) ? g.data[y * g.w + x] : EMPTY;
}

export function set(g: Grid, x: number, y: number, v: number): void {
  if (inBounds(g, x, y)) g.data[y * g.w + x] = v;
}

/** Set a cell and, if `mirror`, its bilateral twin across the vertical axis. */
export function paint(g: Grid, x: number, y: number, v: number, mirror: boolean): void {
  set(g, x, y, v);
  if (mirror) set(g, g.w - 1 - x, y, v);
}

/** Bresenham line. */
export function line(g: Grid, x0: number, y0: number, x1: number, y1: number, v: number, mirror = false): void {
  let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    paint(g, x0, y0, v, mirror);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** 4-connected flood fill (iterative). Returns number of cells changed. */
export function floodFill(g: Grid, x: number, y: number, v: number): number {
  const target = get(g, x, y);
  if (!inBounds(g, x, y) || target === v) return 0;
  const stack = [y * g.w + x];
  let n = 0;
  while (stack.length) {
    const i = stack.pop()!;
    if (g.data[i] !== target) continue;
    g.data[i] = v;
    n++;
    const cx = i % g.w, cy = (i / g.w) | 0;
    if (cx > 0) stack.push(i - 1);
    if (cx < g.w - 1) stack.push(i + 1);
    if (cy > 0) stack.push(i - g.w);
    if (cy < g.h - 1) stack.push(i + g.w);
  }
  return n;
}

/** Copy `src` onto `dst` at (ox, oy), skipping EMPTY cells; optionally flipped horizontally. */
export function stamp(dst: Grid, src: Grid, ox: number, oy: number, flip = false, recolor?: (v: number) => number): void {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const v = src.data[y * src.w + (flip ? src.w - 1 - x : x)];
      if (v !== EMPTY) set(dst, ox + x, oy + y, recolor ? recolor(v) : v);
    }
  }
}

/** True if the grid equals its own horizontal mirror. */
export function isMirrorSymmetric(g: Grid): boolean {
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w >> 1; x++) if (g.data[y * g.w + x] !== g.data[y * g.w + g.w - 1 - x]) return false;
  return true;
}

/** Fill-count per value (EMPTY excluded). */
export function histogram(g: Grid): Map<number, number> {
  const m = new Map<number, number>();
  for (const v of g.data) if (v !== EMPTY) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}

/** Compact, URL-safe serialisation (base64 of raw bytes). */
export function encodeGrid(g: Grid): string {
  let s = '';
  for (let i = 0; i < g.data.length; i++) s += String.fromCharCode(g.data[i]);
  return `${g.w}x${g.h}:${btoa(s)}`;
}

export function decodeGrid(s: string): Grid | null {
  const m = /^(\d+)x(\d+):(.*)$/.exec(s);
  if (!m) return null;
  const w = +m[1], h = +m[2];
  if (!w || !h || w > 512 || h > 512) return null;
  try {
    const bin = atob(m[3]);
    if (bin.length !== w * h) return null;
    const g = makeGrid(w, h);
    for (let i = 0; i < bin.length; i++) g.data[i] = bin.charCodeAt(i);
    return g;
  } catch {
    return null;
  }
}
