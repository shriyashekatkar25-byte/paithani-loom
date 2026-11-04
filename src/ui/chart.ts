/**
 * Loom chart: the composed cloth as graph paper on the left, bobbins per
 * pick as a horizontal bar on the right, rows aligned. Pointer or keyboard
 * selects a pick.
 */
import { THREADS } from '../lib/palette';
import type { Sari } from '../lib/layout';
import type { Ledger } from '../lib/weave';

export const DEMANDING = 24; // illustrative threshold for a "demanding" pick

export class LoomChart {
  private ctx: CanvasRenderingContext2D;
  private sari: Sari | null = null;
  private ledger: Ledger | null = null;
  private img: HTMLCanvasElement = document.createElement('canvas');
  pick = 0;
  onPick?: (y: number) => void;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    const sel = (e: PointerEvent) => {
      if (!this.sari) return;
      const r = canvas.getBoundingClientRect();
      this.select(Math.floor(((e.clientY - r.top) / r.height) * this.sari.h));
    };
    canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); sel(e); });
    canvas.addEventListener('pointermove', (e) => { if (e.buttons) sel(e); });
    canvas.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowUp') { this.select(this.pick - step); e.preventDefault(); }
      if (e.key === 'ArrowDown') { this.select(this.pick + step); e.preventDefault(); }
      if (e.key === 'Home') { this.select(0); e.preventDefault(); }
      if (e.key === 'End' && this.sari) { this.select(this.sari.h - 1); e.preventDefault(); }
    });
    new ResizeObserver(() => this.draw()).observe(canvas);
  }

  select(y: number) {
    if (!this.sari) return;
    this.pick = Math.max(0, Math.min(this.sari.h - 1, y));
    this.draw();
    this.onPick?.(this.pick);
  }

  set(sari: Sari, ledger: Ledger) {
    this.sari = sari;
    this.ledger = ledger;
    // one pixel per cell, scaled with nearest-neighbour later
    this.img.width = sari.w;
    this.img.height = sari.h;
    const ictx = this.img.getContext('2d')!;
    const id = ictx.createImageData(sari.w, sari.h);
    const rgb = THREADS.map((t) => [1, 3, 5].map((i) => parseInt(t.hex.slice(i, i + 2), 16)));
    for (let i = 0; i < sari.w * sari.h; i++) {
      const c = rgb[sari.weft.data[i]] ?? [0, 0, 0];
      id.data.set([c[0], c[1], c[2], 255], i * 4);
    }
    ictx.putImageData(id, 0, 0);
    this.pick = Math.min(this.pick, sari.h - 1);
    this.draw();
  }

  draw() {
    const s = this.sari, l = this.ledger;
    if (!s || !l) return;
    const c = this.canvas, ctx = this.ctx;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = c.clientWidth || 320;
    const designW = cw * 0.64;
    const ch = Math.round((designW * s.h) / s.w);
    c.style.height = `${ch}px`;
    c.width = Math.round(cw * dpr);
    c.height = Math.round(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.img, 0, 0, designW, ch);
    // decimetre grid
    const sx = designW / s.w, sy = ch / s.h;
    ctx.strokeStyle = 'rgba(10,29,26,.35)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= s.w; x += 10) { ctx.beginPath(); ctx.moveTo(x * sx + 0.5, 0); ctx.lineTo(x * sx + 0.5, ch); ctx.stroke(); }
    for (let y = 0; y <= s.h; y += 10) { ctx.beginPath(); ctx.moveTo(0, y * sy + 0.5); ctx.lineTo(designW, y * sy + 0.5); ctx.stroke(); }
    // bars
    const bx = designW + 10, bw = cw - bx - 4;
    const max = Math.max(l.maxRuns, DEMANDING + 4);
    for (let y = 0; y < s.h; y++) {
      const r = l.runs[y];
      ctx.fillStyle = r > DEMANDING ? '#F06A9A' : r > 3 ? '#D9B45E' : 'rgba(197,188,166,.45)';
      ctx.fillRect(bx, y * sy, (r / max) * bw, Math.max(1, sy - 0.3));
    }
    const tx = bx + (DEMANDING / max) * bw;
    ctx.strokeStyle = 'rgba(240,106,154,.6)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(tx, 0); ctx.lineTo(tx, ch); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#C5BCA6';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(`${DEMANDING}`, tx + 3, 11);
    // pallu marker
    ctx.fillStyle = 'rgba(244,235,216,.8)';
    ctx.fillText('pallu ↓', bx, s.palluStart * sy - 4);
    // selected pick
    const py = this.pick * sy;
    ctx.strokeStyle = '#F4EBD8';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0.75, py - 0.75, cw - 1.5, sy + 1.5);
  }
}
