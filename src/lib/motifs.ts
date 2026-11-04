/**
 * Procedural motif library. Each motif is an implicit drawing: a function
 * (u, v) ∈ [0,1]² → role, evaluated at cell centres and rasterised to a Grid.
 * Roles (primary / secondary / accent) are mapped to threads by the caller,
 * then an optional outline pass rings the figure.
 *
 * The names are traditional Paithani motif names (mor, popat/muniya, kamal,
 * asavali, bangdi mor, rui phool, chandrakor). The drawings themselves are
 * original geometric constructions, not traced from any textile.
 */
import { EMPTY } from './palette';
import { Grid, makeGrid } from './grid';

export type Role = 'p' | 's' | 'a';
export type Shape = (u: number, v: number) => Role | null;

export interface MotifDef {
  key: string;
  name: string;
  marathi: string;
  blurb: string;
  shape: Shape;
}

// ── implicit-geometry helpers ────────────────────────────────────────────
const inEllipse = (u: number, v: number, cx: number, cy: number, rx: number, ry: number, rot = 0) => {
  const c = Math.cos(rot), s = Math.sin(rot);
  const dx = u - cx, dy = v - cy;
  const x = dx * c + dy * s, y = -dx * s + dy * c;
  return (x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1;
};
const inCircle = (u: number, v: number, cx: number, cy: number, r: number) => (u - cx) ** 2 + (v - cy) ** 2 <= r * r;
/** Distance from p to segment ab ≤ r. */
const inCapsule = (u: number, v: number, ax: number, ay: number, bx: number, by: number, r: number) => {
  const pax = u - ax, pay = v - ay, bax = bx - ax, bay = by - ay;
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return Math.hypot(pax - bax * h, pay - bay * h) <= r;
};
const inTriangle = (u: number, v: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
  const s = (x1: number, y1: number, x2: number, y2: number) => (u - x2) * (y1 - y2) - (x1 - x2) * (v - y2);
  const d1 = s(ax, ay, bx, by), d2 = s(bx, by, cx, cy), d3 = s(cx, cy, ax, ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};

/** Layer shapes: later layers paint over earlier ones (like a weaver finishing a figure). */
const layers = (...ls: Array<[Role, (u: number, v: number) => boolean]>): Shape => (u, v) => {
  let out: Role | null = null;
  for (const [role, test] of ls) if (test(u, v)) out = role;
  return out;
};

/** Scale a shape about the centre (k < 1 shrinks). */
const scaled = (shape: Shape, k: number, dy = 0): Shape => (u, v) => {
  const su = (u - 0.5) / k + 0.5, sv = (v - 0.5 - dy) / k + 0.5;
  return su < 0 || su > 1 || sv < 0 || sv > 1 ? null : shape(su, sv);
};

/** Fold across the vertical axis: guarantees exact bilateral symmetry despite float error. */
const symmetric = (shape: Shape): Shape => (u, v) => shape(0.5 + Math.abs(u - 0.5), v);

// ── motifs ───────────────────────────────────────────────────────────────
/** Peacock in profile facing left; a long train of feathers with eyes sweeps down behind it. */
const mor: Shape = (u, v) => {
  const tcx = 0.5, tcy = 0.56;
  const ang = Math.atan2(v - tcy, u - tcx), rad = Math.hypot(u - tcx, v - tcy);
  const a0 = -0.55, a1 = 1.35, step = (a1 - a0) / 5;
  const reach = 0.44 - 0.1 * Math.abs((ang - 0.4) / 0.95); // longest feathers in the middle of the train
  const inTrain = ang > a0 && ang < a1 && rad > 0.06 && rad < reach;
  const feather = Math.floor((ang - a0) / step);
  const eyeAng = a0 + (feather + 0.5) * step;
  const er = reach - 0.07;
  const eye = inCircle(u, v, tcx + Math.cos(eyeAng) * er, tcy + Math.sin(eyeAng) * er, 0.05);
  const eyeCore = inCircle(u, v, tcx + Math.cos(eyeAng) * er, tcy + Math.sin(eyeAng) * er, 0.022);
  return layers(
    ['s', () => inTrain && feather % 2 === 0],
    ['p', () => inTrain && feather % 2 === 1],
    ['a', () => inTrain && eye],
    ['p', () => inTrain && eyeCore],
    ['p', (x, y) => inEllipse(x, y, 0.4, 0.56, 0.17, 0.115, -0.25)],
    ['s', (x, y) => inEllipse(x, y, 0.45, 0.55, 0.1, 0.06, -0.25)],
    ['p', (x, y) => inCapsule(x, y, 0.3, 0.5, 0.25, 0.3, 0.045)],
    ['p', (x, y) => inCapsule(x, y, 0.25, 0.3, 0.24, 0.22, 0.04)],
    ['p', (x, y) => inCircle(x, y, 0.235, 0.19, 0.055)],
    ['a', (x, y) => inTriangle(x, y, 0.2, 0.16, 0.1, 0.21, 0.2, 0.23)],
    ['a', (x, y) => inCapsule(x, y, 0.24, 0.14, 0.19, 0.05, 0.02) || inCapsule(x, y, 0.25, 0.14, 0.29, 0.05, 0.02)],
    ['a', (x, y) => inCircle(x, y, 0.19, 0.045, 0.03) || inCircle(x, y, 0.29, 0.045, 0.03)],
    ['a', (x, y) => inCapsule(x, y, 0.37, 0.66, 0.35, 0.86, 0.022) || inCapsule(x, y, 0.44, 0.65, 0.46, 0.86, 0.022)],
    ['a', (x, y) => inCapsule(x, y, 0.3, 0.87, 0.38, 0.87, 0.02) || inCapsule(x, y, 0.42, 0.87, 0.5, 0.87, 0.02)],
  )(u, v);
};

/** Parrot (popat / muniya): green with a red touch at the beak, on a perch. */
const popat: Shape = layers(
  ['s', (x, y) => inCapsule(x, y, 0.56, 0.62, 0.84, 0.93, 0.055)],
  ['p', (x, y) => inEllipse(x, y, 0.48, 0.52, 0.13, 0.21, 0.5)],
  ['s', (x, y) => inEllipse(x, y, 0.54, 0.55, 0.075, 0.16, 0.5)],
  ['p', (x, y) => inCircle(x, y, 0.36, 0.29, 0.11)],
  ['a', (x, y) => inCircle(x, y, 0.255, 0.34, 0.055)],
  ['s', (x, y) => inCircle(x, y, 0.34, 0.26, 0.025)],
  ['a', (x, y) => inCapsule(x, y, 0.12, 0.8, 0.82, 0.8, 0.028)],
);

/** Lotus (kamal): five petals rising from a shallow bowl. Mirror-symmetric. */
const kamal: Shape = (u, v) => {
  const bx = 0.5, by = 0.74;
  const petals: Array<[number, Role]> = [[-1.05, 's'], [1.05, 's'], [-0.55, 'p'], [0.55, 'p'], [0, 'p']];
  return layers(
    ...petals.map(([a, role]): [Role, (x: number, y: number) => boolean] => [
      role,
      (x, y) => inEllipse(x, y, bx + Math.sin(a) * 0.24, by - Math.cos(a) * 0.24, 0.075, 0.23, a),
    ]),
    ['s', (x, y) => inEllipse(x, y, 0.5, 0.77, 0.3, 0.07)],
    ['a', (x, y) => inCapsule(x, y, 0.5, 0.82, 0.5, 0.98, 0.035)],
    ['a', (x, y) => inCircle(x, y, 0.5, 0.62, 0.035)],
  )(u, v);
};

/** Asavali: flowering plant in a pot, branches paired left/right. Mirror-symmetric. */
const asavali: Shape = (u, v) => {
  const tests: Array<[Role, (x: number, y: number) => boolean]> = [
    ['s', (x, y) => inCapsule(x, y, 0.5, 0.86, 0.5, 0.16, 0.026)],
  ];
  for (let k = 0; k < 3; k++) {
    const y0 = 0.72 - k * 0.19, dx = 0.3 - k * 0.04, ey = y0 - 0.12;
    for (const side of [-1, 1]) {
      const ex = 0.5 + side * dx;
      tests.push(['s', (x, y) => inCapsule(x, y, 0.5, y0, ex, ey, 0.022)]);
      tests.push(['s', (x, y) => inEllipse(x, y, 0.5 + side * dx * 0.45, y0 + 0.02, 0.07, 0.03, side * 0.5)]);
      tests.push(['p', (x, y) => inCircle(x, y, ex, ey, 0.068)]);
      tests.push(['a', (x, y) => inCircle(x, y, ex, ey, 0.026)]);
    }
  }
  tests.push(['p', (x, y) => inCircle(x, y, 0.5, 0.12, 0.085)]);
  tests.push(['a', (x, y) => inCircle(x, y, 0.5, 0.12, 0.03)]);
  tests.push(['a', (x, y) => y > 0.82 && y < 0.97 && Math.abs(x - 0.5) < 0.12 + (y - 0.82) * 0.55]);
  return layers(...tests)(u, v);
};

/** Bangdi mor: a peacock inside a bangle. */
const bangdiMor: Shape = (u, v) => {
  const r = Math.hypot(u - 0.5, v - 0.5);
  if (r > 0.41 && r < 0.48) return 'a';
  return r <= 0.41 ? scaled(mor, 0.74)(u, v) : null;
};

/** Rui phool: eight-petalled flower butti. Mirror-symmetric. */
const ruiPhool: Shape = (u, v) => {
  if (inCircle(u, v, 0.5, 0.5, 0.13)) return 'a';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    if (inEllipse(u, v, 0.5 + Math.sin(a) * 0.27, 0.5 - Math.cos(a) * 0.27, 0.11, 0.2, a)) return i % 2 ? 's' : 'p';
  }
  return null;
};

/** Chandrakor: crescent moon butti. */
const chandrakor: Shape = (u, v) =>
  inCircle(u, v, 0.5, 0.5, 0.42) && !inCircle(u, v, 0.64, 0.4, 0.36) ? 'p' : null;

/** Tara: eight-pointed star, the union of two squares. Mirror-symmetric. */
const tara: Shape = (u, v) => {
  const x = u - 0.5, y = v - 0.5;
  if (Math.abs(x) + Math.abs(y) < 0.14) return 'a';
  return Math.abs(x) + Math.abs(y) < 0.46 || Math.max(Math.abs(x), Math.abs(y)) < 0.33 ? 'p' : null;
};

export const MOTIFS: MotifDef[] = [
  { key: 'mor', name: 'Mor', marathi: 'मोर', blurb: 'peacock in profile', shape: mor },
  { key: 'popat', name: 'Popat', marathi: 'पोपट', blurb: 'parrot on a perch', shape: popat },
  { key: 'kamal', name: 'Kamal', marathi: 'कमळ', blurb: 'lotus', shape: symmetric(kamal) },
  { key: 'asavali', name: 'Asavali', marathi: '', blurb: 'flowering vine in a pot', shape: symmetric(asavali) },
  { key: 'bangdi', name: 'Bangdi mor', marathi: 'बांगडी मोर', blurb: 'peacock in a bangle', shape: bangdiMor },
  { key: 'rui', name: 'Rui phool', marathi: 'रुई फूल', blurb: 'small flower butti', shape: symmetric(ruiPhool) },
  { key: 'chandrakor', name: 'Chandrakor', marathi: 'चंद्रकोर', blurb: 'crescent butti', shape: chandrakor },
  { key: 'tara', name: 'Tara', marathi: 'तारा', blurb: 'star butti', shape: symmetric(tara) },
];

export const motifByKey = (k: string) => MOTIFS.find((m) => m.key === k) ?? MOTIFS[0];

export interface RoleMap { p: number; s: number; a: number; outline: number }

/** Rasterise a shape at cell centres, then (optionally) add a 4-neighbour outline. */
export function rasterize(shape: Shape, w: number, h: number, roles: RoleMap): Grid {
  const g = makeGrid(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const r = shape((x + 0.5) / w, (y + 0.5) / h);
      if (r) g.data[y * w + x] = roles[r];
    }
  if (roles.outline !== EMPTY) {
    const src = g.data.slice();
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (src[i] !== EMPTY) continue;
        const n =
          (x > 0 && src[i - 1] !== EMPTY) || (x < w - 1 && src[i + 1] !== EMPTY) ||
          (y > 0 && src[i - w] !== EMPTY) || (y < h - 1 && src[i + w] !== EMPTY);
        if (n) g.data[i] = roles.outline;
      }
  }
  return g;
}
