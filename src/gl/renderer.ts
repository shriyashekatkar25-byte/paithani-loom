/**
 * WebGL2 silk renderer. Owns the context, the cloth mesh, two integer/colour
 * textures and an orbit camera. Renders on demand; animates only while the
 * cloth is moving, the lamp is sweeping or playback runs.
 */
import { VERT, FRAG } from './shaders';
import { THREADS } from '../lib/palette';
import { srgbToLinear, hexToRgb } from '../lib/color';
import type { Sari } from '../lib/layout';

type Mat4 = Float32Array;

function perspective(fovy: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

function lookAt(e: number[], c: number[], up: number[]): Mat4 {
  const z = norm([e[0] - c[0], e[1] - c[1], e[2] - c[2]]);
  const x = norm(cross(up, z));
  const y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
    -dot(x, e), -dot(y, e), -dot(z, e), 1,
  ]);
}
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: number[]) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader compile failed');
  return s;
}

export interface View { yaw: number; pitch: number; dist: number; targetY: number }
export interface RenderOpts { wind: number; lampSweep: boolean; reducedMotion: boolean; quality: 'auto' | 'high' | 'low' }

export class SilkRenderer {
  readonly gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private count = 0;
  private tex: WebGLTexture;
  private palTex: WebGLTexture;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private grid: [number, number] = [1, 1];
  private raf = 0;
  private t0 = performance.now();
  private frozenTime = 0;
  private frameMs: number[] = [];
  private dprScale = 1;
  view: View = { yaw: -0.32, pitch: 0.06, dist: 3.35, targetY: -0.12 };
  light = { az: 0.6, el: 0.55 };
  reveal = Infinity;
  opts: RenderOpts = { wind: 1, lampSweep: true, reducedMotion: false, quality: 'auto' };
  onFrame?: () => void;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link failed');
    this.prog = p;
    for (const n of ['uProj', 'uView', 'uSize', 'uTime', 'uWind', 'uDesign', 'uPalette', 'uGrid', 'uEye', 'uLight', 'uReveal', 'uGlint'])
      this.u[n] = gl.getUniformLocation(p, n);
    this.vao = gl.createVertexArray()!;
    this.buildMesh(110, 180);
    this.tex = gl.createTexture()!;
    this.palTex = gl.createTexture()!;
    this.uploadPalette();
  }

  private buildMesh(nx: number, ny: number) {
    const gl = this.gl;
    const v = new Float32Array((nx + 1) * (ny + 1) * 2);
    let k = 0;
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) { v[k++] = i / nx; v[k++] = j / ny; }
    const idx = new Uint32Array(nx * ny * 6);
    k = 0;
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
        idx.set([a, c, b, b, c, d], k);
        k += 6;
      }
    gl.bindVertexArray(this.vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.count = idx.length;
  }

  private uploadPalette() {
    const gl = this.gl;
    const data = new Uint8Array(16 * 4);
    THREADS.forEach((t, i) => {
      // store linear-light colour so the shader can light it physically
      const [r, g, b] = hexToRgb(t.hex).map((c) => Math.round(srgbToLinear(c) * 255));
      data.set([r, g, b, t.metal ? 255 : 0], i * 4);
    });
    gl.bindTexture(gl.TEXTURE_2D, this.palTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 16, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }

  setSari(s: Sari) {
    const gl = this.gl;
    const data = new Uint8Array(s.w * s.h * 4);
    for (let y = 0; y < s.h; y++)
      for (let x = 0; x < s.w; x++) {
        const i = y * s.w + x;
        data.set([s.weft.data[i], s.warp[x], s.zone[i], 255], i * 4);
      }
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8UI, s.w, s.h, 0, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.grid = [s.w, s.h];
    this.request();
  }

  get animating() {
    return !this.opts.reducedMotion && (this.opts.wind > 0 || this.opts.lampSweep);
  }

  /** Ask for a frame; keeps looping while animating. */
  request() {
    if (!this.raf) this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  private resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const q = this.opts.quality === 'high' ? 1 : this.opts.quality === 'low' ? 0.6 : this.dprScale;
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr * q));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr * q));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
  }

  /** Adaptive quality: if frames are slow, render fewer pixels. */
  private adapt(dt: number) {
    if (this.opts.quality !== 'auto') return;
    this.frameMs.push(dt);
    if (this.frameMs.length < 40) return;
    const avg = this.frameMs.reduce((a, b) => a + b, 0) / this.frameMs.length;
    this.frameMs = [];
    if (avg > 24 && this.dprScale > 0.55) this.dprScale -= 0.15;
    else if (avg < 14 && this.dprScale < 1) this.dprScale = Math.min(1, this.dprScale + 0.1);
  }

  private last = 0;
  private frame(now: number) {
    this.raf = 0;
    if (this.last) this.adapt(now - this.last);
    this.last = now;
    this.draw(now);
    this.onFrame?.();
    if (this.animating) this.request();
    else this.last = 0;
  }

  draw(now = performance.now()) {
    const gl = this.gl;
    this.resize();
    const t = this.opts.reducedMotion ? this.frozenTime : (now - this.t0) / 1000;
    if (!this.opts.reducedMotion) this.frozenTime = t;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(this.prog);

    const aspect = this.canvas.width / this.canvas.height;
    const sizeX = 1.0, sizeY = (this.grid[1] / this.grid[0]) * 1.0;
    const { yaw, pitch, dist, targetY } = this.view;
    const fit = aspect < 0.6 ? 0.6 / Math.max(aspect, 0.3) : 1; // pull back only on very tall/narrow screens
    const d = dist * fit;
    const eye = [Math.sin(yaw) * Math.cos(pitch) * d, targetY + Math.sin(pitch) * d, Math.cos(yaw) * Math.cos(pitch) * d];
    const az = this.light.az + (this.opts.lampSweep && !this.opts.reducedMotion ? Math.sin(t * 0.35) * 0.9 : 0);
    const L = [Math.sin(az) * Math.cos(this.light.el), Math.sin(this.light.el), Math.cos(az) * Math.cos(this.light.el)];

    gl.uniformMatrix4fv(this.u.uProj, false, perspective(0.62, aspect, 0.05, 50));
    gl.uniformMatrix4fv(this.u.uView, false, lookAt(eye, [0, targetY, 0], [0, 1, 0]));
    gl.uniform2f(this.u.uSize, sizeX, sizeY);
    gl.uniform1f(this.u.uTime, t);
    gl.uniform1f(this.u.uWind, this.opts.reducedMotion ? 0.5 : this.opts.wind);
    gl.uniform2i(this.u.uGrid, this.grid[0], this.grid[1]);
    gl.uniform3f(this.u.uEye, eye[0], eye[1], eye[2]);
    gl.uniform3f(this.u.uLight, L[0], L[1], L[2]);
    gl.uniform1f(this.u.uReveal, Number.isFinite(this.reveal) ? this.reveal : 1e6);
    gl.uniform1f(this.u.uGlint, this.opts.reducedMotion ? 0 : 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.u.uDesign, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.palTex);
    gl.uniform1i(this.u.uPalette, 1);
    gl.bindVertexArray(this.vao);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }

  snapshot(): string {
    this.draw();
    return this.canvas.toDataURL('image/png');
  }

  dispose() {
    cancelAnimationFrame(this.raf);
  }
}
