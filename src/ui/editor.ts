/**
 * The naksha editor: a 40×40 graph-paper canvas with pen, line, fill,
 * erase and eyedropper, bilateral mirror, undo, and a full keyboard path.
 */
import { EMPTY, THREADS } from '../lib/palette';
import { Grid, cloneGrid, floodFill, get, line, makeGrid, paint } from '../lib/grid';

export type Tool = 'pen' | 'line' | 'fill' | 'erase' | 'pick';

export class MotifEditor {
  grid: Grid;
  tool: Tool = 'pen';
  ink = 5;
  mirror = true;
  private undo: Uint8Array[] = [];
  private cursor = { x: 20, y: 20 };
  private drag: { x: number; y: number } | null = null;
  private hover: { x: number; y: number } | null = null;
  private ctx: CanvasRenderingContext2D;
  onChange?: () => void;
  onPick?: (id: number) => void;

  constructor(private canvas: HTMLCanvasElement, size = 40) {
    this.grid = makeGrid(size, size);
    this.ctx = canvas.getContext('2d')!;
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointerleave', () => { this.hover = null; this.draw(); });
    canvas.addEventListener('keydown', (e) => this.key(e));
    new ResizeObserver(() => this.draw()).observe(canvas);
  }

  load(g: Grid) {
    this.snapshot();
    this.grid = cloneGrid(g);
    this.changed();
  }

  clear() {
    this.snapshot();
    this.grid.data.fill(EMPTY);
    this.changed();
  }

  undoLast() {
    const prev = this.undo.pop();
    if (prev) { this.grid.data.set(prev); this.changed(); }
  }

  private snapshot() {
    this.undo.push(this.grid.data.slice());
    if (this.undo.length > 40) this.undo.shift();
  }

  private changed() {
    this.draw();
    this.onChange?.();
  }

  private cellAt(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * this.grid.w);
    const y = Math.floor(((e.clientY - r.top) / r.height) * this.grid.h);
    return { x: Math.max(0, Math.min(this.grid.w - 1, x)), y: Math.max(0, Math.min(this.grid.h - 1, y)) };
  }

  private value() { return this.tool === 'erase' ? EMPTY : this.ink; }

  private apply(x: number, y: number, first: boolean) {
    if (this.tool === 'pick') {
      const v = get(this.grid, x, y);
      if (v !== EMPTY) { this.ink = v; this.onPick?.(v); }
      return;
    }
    if (first) this.snapshot();
    if (this.tool === 'fill') {
      floodFill(this.grid, x, y, this.ink);
      if (this.mirror) floodFill(this.grid, this.grid.w - 1 - x, y, this.ink);
    } else if (this.tool === 'pen' || this.tool === 'erase') paint(this.grid, x, y, this.value(), this.mirror);
    this.changed();
  }

  private down(e: PointerEvent) {
    this.canvas.setPointerCapture(e.pointerId);
    this.canvas.focus({ preventScroll: true });
    const c = this.cellAt(e);
    this.cursor = c;
    this.drag = c;
    if (this.tool !== 'line') this.apply(c.x, c.y, true);
    e.preventDefault();
  }

  private move(e: PointerEvent) {
    const c = this.cellAt(e);
    this.hover = c;
    if (this.drag && (this.tool === 'pen' || this.tool === 'erase')) {
      line(this.grid, this.drag.x, this.drag.y, c.x, c.y, this.value(), this.mirror);
      this.drag = c;
      this.changed();
    } else this.draw();
  }

  private up(e: PointerEvent) {
    if (this.drag && this.tool === 'line') {
      const c = this.cellAt(e);
      this.snapshot();
      line(this.grid, this.drag.x, this.drag.y, c.x, c.y, this.ink, this.mirror);
      this.changed();
    }
    this.drag = null;
  }

  private key(e: KeyboardEvent) {
    const k = e.key;
    const mv: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (mv[k]) {
      this.cursor.x = Math.max(0, Math.min(this.grid.w - 1, this.cursor.x + mv[k][0]));
      this.cursor.y = Math.max(0, Math.min(this.grid.h - 1, this.cursor.y + mv[k][1]));
      if (e.shiftKey && (this.tool === 'pen' || this.tool === 'erase')) this.apply(this.cursor.x, this.cursor.y, false);
      this.hover = { ...this.cursor };
      this.draw();
      e.preventDefault();
    } else if (k === ' ' || k === 'Enter') {
      this.apply(this.cursor.x, this.cursor.y, true);
      e.preventDefault();
    } else if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') {
      this.undoLast();
      e.preventDefault();
    }
  }

  draw() {
    const c = this.canvas;
    const css = c.clientWidth || 320;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.round(css * dpr);
    if (c.width !== px) { c.width = px; c.height = px; }
    const ctx = this.ctx, g = this.grid;
    const s = px / g.w;
    ctx.fillStyle = '#0C2421';
    ctx.fillRect(0, 0, px, px);
    for (let y = 0; y < g.h; y++)
      for (let x = 0; x < g.w; x++) {
        const v = g.data[y * g.w + x];
        if (v === EMPTY) continue;
        ctx.fillStyle = THREADS[v].hex;
        ctx.fillRect(Math.floor(x * s), Math.floor(y * s), Math.ceil(s), Math.ceil(s));
      }
    // graph paper: fine lines every cell, stronger every 10 (as on a weaver's naksha)
    ctx.lineWidth = 1;
    for (let i = 0; i <= g.w; i++) {
      ctx.strokeStyle = i % 10 === 0 ? 'rgba(217,180,94,.55)' : 'rgba(217,180,94,.12)';
      const p = Math.round(i * s) + 0.5;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, px); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(px, p); ctx.stroke();
    }
    if (this.mirror) {
      ctx.strokeStyle = 'rgba(240,106,154,.7)';
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      ctx.beginPath(); ctx.moveTo(px / 2, 0); ctx.lineTo(px / 2, px); ctx.stroke();
      ctx.setLineDash([]);
    }
    const h = this.hover ?? (document.activeElement === c ? this.cursor : null);
    if (h) {
      ctx.strokeStyle = '#F4EBD8';
      ctx.lineWidth = 2 * dpr;
      ctx.strokeRect(h.x * s + 1, h.y * s + 1, s - 2, s - 2);
      if (this.mirror) { ctx.globalAlpha = 0.45; ctx.strokeRect((g.w - 1 - h.x) * s + 1, h.y * s + 1, s - 2, s - 2); ctx.globalAlpha = 1; }
    }
  }
}
