/**
 * PAITHANI LOOM — app shell. Holds the design state, derives the cloth
 * (compose → optional optimise → compile), and keeps the renderer, editor,
 * chart and panels in sync. All computation runs in the browser.
 */
import './styles/main.css';
import { THREADS, EMPTY } from './lib/palette';
import { DEFAULT_PARAMS, SariParams, composeSari, sanitizeParams, Sari } from './lib/layout';
import { MOTIFS, motifByKey, rasterize } from './lib/motifs';
import { compile, Ledger, runsOfPick, ledgerCSV } from './lib/weave';
import { optimizeSari, OptimizeResult } from './lib/optimize';
import { Store, SavedDesign } from './lib/storage';
import { Grid, decodeGrid, histogram } from './lib/grid';
import { sariSVG, draftJSON, download } from './lib/exporters';
import { mulberry32 } from './lib/rng';
import { SilkRenderer, View } from './gl/renderer';
import { MotifEditor, Tool } from './ui/editor';
import { LoomChart, DEMANDING } from './ui/chart';
import { LoomSound } from './ui/sound';

const $ = <T extends HTMLElement = HTMLElement>(s: string, root: ParentNode = document) => root.querySelector(s) as T;
const $$ = <T extends HTMLElement = HTMLElement>(s: string, root: ParentNode = document) => [...root.querySelectorAll(s)] as T[];

// ── state ────────────────────────────────────────────────────────────────
const store = new Store();
const prefs = store.prefs();
const osReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const reduced = () => prefs.motion === 'reduced' || osReduced.matches;

const working = store.loadWorking();
let params: SariParams = working?.params ?? { ...DEFAULT_PARAMS };
let custom: Grid | null = working?.custom ? decodeGrid(working.custom) : null;
let opt = { on: !!working?.optimized, lambda: working?.optimized?.lambda ?? 60, mu: working?.optimized?.mu ?? 12 };
let base: Sari = composeSari(params, custom);
let sari: Sari = base;
let ledger: Ledger = compile(sari);
let optResult: OptimizeResult | null = null;

const sound = new LoomSound();
sound.enabled = prefs.sound;

// ── renderer ─────────────────────────────────────────────────────────────
const canvas = $<HTMLCanvasElement>('#silk');
let renderer: SilkRenderer | null = null;
try {
  renderer = new SilkRenderer(canvas);
  renderer.opts = { wind: 1, lampSweep: true, reducedMotion: reduced(), quality: prefs.quality };
} catch (err) {
  showFallback(String((err as Error).message ?? err));
}

function showFallback(msg: string) {
  canvas.hidden = true;
  const fb = $('#silkFallback');
  fb.hidden = false;
  fb.innerHTML = `<p><strong>The silk renderer needs WebGL2.</strong> ${msg.replace(/[<>&]/g, '')} Showing the flat naksha instead; every other tool still works.</p>`;
  const c = document.createElement('canvas');
  c.className = 'flat';
  fb.appendChild(c);
}

function drawFallback() {
  const c = $('#silkFallback canvas') as HTMLCanvasElement | null;
  if (!c) return;
  c.width = sari.w; c.height = sari.h;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < sari.h; y++)
    for (const r of runsOfPick(sari, y)) { ctx.fillStyle = THREADS[r.color].hex; ctx.fillRect(r.start, y, r.len, 1); }
}

// ── derive ───────────────────────────────────────────────────────────────
let saveTimer = 0;
function rebuild(recompose = true) {
  if (recompose) base = composeSari(params, custom);
  optResult = opt.on ? optimizeSari(base, opt.lambda, opt.mu) : null;
  sari = optResult ? optResult.sari : base;
  ledger = compile(sari);
  renderer?.setSari(sari);
  drawFallback();
  chart.set(sari, ledger);
  renderStats();
  renderLedgerRow(chart.pick);
  renderOptStat();
  describe();
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try { store.saveWorking(params, custom, opt.on ? { lambda: opt.lambda, mu: opt.mu } : null); } catch { /* storage full or blocked: keep working */ }
  }, 400);
}

function describe() {
  const t = (id: number) => THREADS[id].name;
  const fig = params.palluMotif === 'custom' ? 'your own figure' : motifByKey(params.palluMotif).name;
  $('#silkDesc').textContent =
    `${t(params.bodyWarp)} warp with ${t(params.bodyWeft)} weft body, ${t(params.borderColor)} borders, ` +
    `${t(params.palluGround)} pallu with ${params.palluRows} row(s) of ${fig}. Up to ${ledger.maxRuns} bobbins in one pick.`;
}

// ── stats & ledger ───────────────────────────────────────────────────────
function renderStats() {
  const zariShare = (ledger.zariCells / (sari.w * sari.h)) * 100;
  const demanding = Array.from(ledger.runs).filter((r) => r > DEMANDING).length;
  const tiles: Array<[string, string, string]> = [
    ['Most bobbins in one pick', `${ledger.maxRuns}`, `${demanding} picks above ${DEMANDING}`],
    ['Bobbins per pick, mean', ledger.meanRuns.toFixed(1), `${ledger.picks} picks × ${ledger.ends} ends`],
    ['Interlocks (kadiyal joins)', ledger.totalJoins.toLocaleString(), 'colour boundaries woven'],
    ['Held boundaries ≥ 6 picks', `${ledger.slits}`, `would open as slits without interlocking · longest ${ledger.longestSlit}`],
    ['Zari share', `${zariShare.toFixed(0)}%`, 'of the cells are metal'],
    ['Effort index', `${ledger.effortIndex.toFixed(2)}×`, 'illustrative model · plain pick = 1'],
  ];
  $('#stats').innerHTML = tiles
    .map(([k, v, s]) => `<div class="stat"><p class="k">${k}</p><p class="v mono">${v}</p><p class="s">${s}</p></div>`)
    .join('');
}

function renderLedgerRow(y: number) {
  const rs = runsOfPick(sari, y);
  const zone = y >= sari.palluStart ? 'pallu' : 'body';
  $('#ledgerRow').innerHTML =
    `<p class="mono">Pick ${y + 1} / ${sari.h} · ${zone} · <strong>${rs.length}</strong> bobbins · ${new Set(rs.map((r) => r.color)).size} colours</p>` +
    `<div class="runs">${rs
      .map((r) => `<span class="run" title="${THREADS[r.color].name}: ${r.len} ends" style="--c:${THREADS[r.color].hex};flex-grow:${r.len}"></span>`)
      .join('')}</div>` +
    `<p class="note">${rs.map((r) => `${THREADS[r.color].name} ${r.len}`).join(' · ')}</p>`;
}

function renderOptStat() {
  $('#lamOut').textContent = String(opt.lambda);
  $('#muOut').textContent = String(opt.mu);
  const preview = optResult ?? optimizeSari(base, opt.lambda, opt.mu);
  const pct = preview.runsBefore ? (1 - preview.runsAfter / preview.runsBefore) * 100 : 0;
  $('#optStat').textContent =
    `${opt.on ? 'Applied' : 'Preview'}: ${preview.runsBefore.toLocaleString()} → ${preview.runsAfter.toLocaleString()} interior runs ` +
    `(−${pct.toFixed(1)}%), ${preview.changed} cells recoloured, mean ΔE ${preview.meanDeltaE.toFixed(1)}.`;
}

// ── chart ────────────────────────────────────────────────────────────────
const chart = new LoomChart($<HTMLCanvasElement>('#chart'));
chart.onPick = (y) => renderLedgerRow(y);

// ── swatches & controls ──────────────────────────────────────────────────
function swatchButton(id: number, checked: boolean) {
  const t = THREADS[id];
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `sw${t.metal ? ' metal' : ''}`;
  b.style.setProperty('--c', t.hex);
  b.setAttribute('role', 'radio');
  b.setAttribute('aria-checked', String(checked));
  b.setAttribute('aria-label', `${t.name}, ${t.note}`);
  b.title = `${t.name}${t.marathi ? ' · ' + t.marathi : ''} — ${t.note}`;
  b.dataset.id = String(id);
  b.tabIndex = checked ? 0 : -1;
  return b;
}

function buildSwatches(host: HTMLElement, value: number, only: number[] | null, onPick: (id: number) => void) {
  host.innerHTML = '';
  const ids = only ?? THREADS.map((t) => t.id);
  for (const id of ids) host.appendChild(swatchButton(id, id === value));
  const btns = () => $$<HTMLButtonElement>('.sw', host);
  host.onclick = (e) => {
    const b = (e.target as HTMLElement).closest('.sw') as HTMLButtonElement | null;
    if (!b) return;
    choose(b);
  };
  const choose = (b: HTMLButtonElement) => {
    btns().forEach((x) => { x.setAttribute('aria-checked', String(x === b)); x.tabIndex = x === b ? 0 : -1; });
    onPick(+b.dataset.id!);
    sound.tick();
  };
  host.onkeydown = (e) => {
    const list = btns();
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    const n = list[(i + d + list.length) % list.length];
    n.focus();
    choose(n);
    e.preventDefault();
  };
}

function syncControls() {
  for (const host of $$('.swatches[data-param]')) {
    const key = host.dataset.param as keyof SariParams;
    const only = host.dataset.only ? host.dataset.only.split(',').map(Number) : null;
    buildSwatches(host, params[key] as number, only, (id) => { (params as unknown as Record<string, number>)[key] = id; rebuild(); });
  }
  for (const el of $$<HTMLInputElement | HTMLSelectElement>('[data-param]:not(.swatches)')) {
    const key = el.dataset.param as keyof SariParams;
    if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = !!params[key];
    else el.value = String(params[key]);
    const out = $(`output[data-for="${key}"]`);
    if (out) out.textContent = String(params[key]);
  }
}

function fillMotifSelects() {
  for (const sel of $$<HTMLSelectElement>('select[data-motifs]')) {
    const small = sel.dataset.motifs === 'small';
    const list = small ? MOTIFS.filter((m) => ['rui', 'chandrakor', 'tara', 'kamal'].includes(m.key)) : MOTIFS;
    sel.innerHTML =
      list.map((m) => `<option value="${m.key}">${m.name}${m.marathi ? ' · ' + m.marathi : ''} — ${m.blurb}</option>`).join('') +
      (small ? '' : '<option value="custom">Your figure from the naksha</option>');
  }
  $<HTMLSelectElement>('#seedMotif').innerHTML = MOTIFS.map((m) => `<option value="${m.key}">${m.name} — ${m.blurb}</option>`).join('');
}

for (const el of $$<HTMLInputElement | HTMLSelectElement>('[data-param]:not(.swatches)')) {
  el.addEventListener('input', () => {
    const key = el.dataset.param as keyof SariParams;
    const v = el instanceof HTMLInputElement && el.type === 'checkbox' ? el.checked : el instanceof HTMLInputElement && el.type === 'range' ? +el.value : el.value;
    if (key === 'palluMotif' && v === 'custom' && !custom) {
      toast('Draw a figure in the Motif tab first, then choose “Weave this into the pallu”.');
      (el as HTMLSelectElement).value = params.palluMotif;
      return;
    }
    (params as unknown as Record<string, unknown>)[key] = v;
    params = sanitizeParams(params);
    const out = $(`output[data-for="${key}"]`);
    if (out) out.textContent = String(params[key]);
    rebuild();
  });
}

// presets
const PRESETS: Array<Partial<SariParams>> = [
  { ...DEFAULT_PARAMS },
  { bodyWarp: 1, bodyWeft: 2, borderColor: 10, naraliColor: 12, butti: 'chandrakor', buttiColor: 12, buttiSize: 8, buttiSpacing: 20, palluGround: 12, palluMotif: 'asavali', palluRows: 2, palluP: 9, palluS: 3, palluA: 10, facing: false },
  { bodyWarp: 6, bodyWeft: 9, borderColor: 3, naraliColor: 12, butti: 'tara', buttiColor: 12, buttiSize: 7, buttiSpacing: 18, palluGround: 12, palluMotif: 'bangdi', palluRows: 2, palluP: 2, palluS: 3, palluA: 10, facing: true },
  { bodyWarp: 4, bodyWeft: 5, borderColor: 2, naraliColor: 13, butti: 'rui', buttiColor: 13, buttiSize: 9, buttiSpacing: 24, palluGround: 13, palluMotif: 'kamal', palluRows: 3, palluP: 9, palluS: 3, palluA: 6, facing: false },
];
$$('[data-preset]').forEach((b) =>
  b.addEventListener('click', () => {
    params = sanitizeParams({ ...params, ...PRESETS[+b.dataset.preset!] });
    syncControls();
    rebuild();
    sound.tick();
  }),
);
$('#btnSurprise').addEventListener('click', () => {
  const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
  const r = mulberry32(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const silks = [1, 2, 3, 4, 5, 6, 9, 10];
  const warp = pick(silks);
  const weft = pick(silks.filter((s) => s !== warp));
  params = sanitizeParams({
    ...params,
    seed,
    bodyWarp: warp,
    bodyWeft: weft,
    borderColor: pick(silks.filter((s) => s !== weft)),
    naraliColor: pick([12, 12, 13]),
    butti: pick(['rui', 'chandrakor', 'tara', 'kamal']),
    buttiColor: pick([12, 12, 13, 6]),
    buttiSize: 6 + Math.floor(r() * 7),
    buttiSpacing: 16 + Math.floor(r() * 16),
    palluGround: pick([12, 12, 13]),
    palluMotif: pick(['mor', 'popat', 'kamal', 'asavali', 'bangdi']),
    palluRows: 1 + Math.floor(r() * 3),
    palluP: pick(silks),
    palluS: pick(silks),
    palluA: pick([9, 10, 6, 7]),
    palluLength: 110 + Math.floor(r() * 70),
    facing: r() > 0.3,
  });
  syncControls();
  rebuild();
  sound.tick();
});

// optimiser
const optOn = $<HTMLInputElement>('#optOn');
const optLambda = $<HTMLInputElement>('#optLambda');
const optMu = $<HTMLInputElement>('#optMu');
optOn.checked = opt.on;
optLambda.value = String(opt.lambda);
optMu.value = String(opt.mu);
let optTimer = 0;
const optChanged = () => {
  opt = { on: optOn.checked, lambda: +optLambda.value, mu: +optMu.value };
  $('#lamOut').textContent = String(opt.lambda);
  $('#muOut').textContent = String(opt.mu);
  clearTimeout(optTimer);
  optTimer = window.setTimeout(() => rebuild(false), 60);
};
[optOn, optLambda, optMu].forEach((el) => el.addEventListener('input', optChanged));

// ── editor ───────────────────────────────────────────────────────────────
const editor = new MotifEditor($<HTMLCanvasElement>('#editor'));
if (custom && custom.w === 40) editor.grid = custom;
else editor.load(rasterize(motifByKey('mor').shape, 40, 40, { p: 5, s: 3, a: 9, outline: 1 }));
editor.mirror = false; // the peacock faces one way; mirror is for symmetric figures
const inkHost = $('#inkSwatches');
const setInkUI = () => {
  buildSwatches(inkHost, editor.ink, null, (id) => { editor.ink = id; setInkName(); });
  setInkName();
};
const setInkName = () => {
  const t = THREADS[editor.ink];
  $('#inkName').innerHTML = `<span>${t.name}</span>${t.marathi ? ` <span class="dev">${t.marathi}</span>` : ''} — ${t.note}`;
};
setInkUI();
editor.onPick = () => setInkUI();
const editorStat = () => {
  const h = histogram(editor.grid);
  const cells = [...h.values()].reduce((a, b) => a + b, 0);
  let maxRuns = 0;
  for (let y = 0; y < editor.grid.h; y++) {
    let r = 0, prev = -1;
    for (let x = 0; x < editor.grid.w; x++) { const v = editor.grid.data[y * editor.grid.w + x]; if (v !== EMPTY && v !== prev) r++; prev = v; }
    maxRuns = Math.max(maxRuns, r);
  }
  $('#editorStat').textContent = `${cells} cells · ${h.size} threads · up to ${maxRuns} figure bobbins in one pick`;
};
editor.onChange = () => {
  editorStat();
  if (params.palluMotif === 'custom') { custom = editor.grid; rebuild(); }
};
editorStat();
editor.draw();

const setTool = (t: Tool) => {
  editor.tool = t;
  $$('#tools [data-tool]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.tool === t)));
};
$('#tools').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('[data-tool]') as HTMLElement | null;
  if (b) { setTool(b.dataset.tool as Tool); sound.tick(); }
});
const mirrorBtn = $('#btnMirror');
const setMirror = (m: boolean) => { editor.mirror = m; mirrorBtn.setAttribute('aria-pressed', String(m)); editor.draw(); };
mirrorBtn.addEventListener('click', () => setMirror(!editor.mirror));
$('#btnUndo').addEventListener('click', () => editor.undoLast());
$('#btnClear').addEventListener('click', () => editor.clear());
$('#btnSeed').addEventListener('click', () => {
  const key = $<HTMLSelectElement>('#seedMotif').value;
  editor.load(rasterize(motifByKey(key).shape, 40, 40, { p: params.palluP, s: params.palluS, a: params.palluA, outline: 1 }));
  setMirror(['kamal', 'asavali', 'rui', 'tara'].includes(key));
});
$('#btnUseMotif').addEventListener('click', () => {
  const filled = editor.grid.data.some((v) => v !== EMPTY);
  if (!filled) { toast('The naksha is empty. Draw a figure first.'); return; }
  custom = editor.grid;
  params.palluMotif = 'custom';
  syncControls();
  rebuild();
  toast('Your figure is now woven into the pallu.');
  goView('pallu');
});
$('#editor').addEventListener('keydown', (e) => {
  const map: Record<string, Tool> = { p: 'pen', l: 'line', f: 'fill', e: 'erase', i: 'pick' };
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = map[e.key.toLowerCase()];
  if (t) setTool(t);
  if (e.key.toLowerCase() === 'm') setMirror(!editor.mirror);
});

// ── tabs ─────────────────────────────────────────────────────────────────
const tabs = $$<HTMLButtonElement>('[role="tab"]');
function selectTab(t: HTMLButtonElement) {
  tabs.forEach((x) => {
    const on = x === t;
    x.setAttribute('aria-selected', String(on));
    x.tabIndex = on ? 0 : -1;
    $(`#${x.getAttribute('aria-controls')}`).hidden = !on;
  });
  if (t.id === 'tab-loom') chart.draw();
  if (t.id === 'tab-naksha') editor.draw();
  if (t.id === 'tab-library') renderLibrary();
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => { selectTab(t); sound.tick(); });
  t.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    const n = tabs[(i + d + tabs.length) % tabs.length];
    n.focus();
    selectTab(n);
  });
});

// ── library & exports ────────────────────────────────────────────────────
function renderLibrary() {
  const list = store.list();
  const ul = $('#library');
  if (!list.length) {
    ul.innerHTML = '<li class="empty">Nothing kept yet. Name the cloth above and press Keep. Designs stay in this browser only.</li>';
    return;
  }
  ul.innerHTML = list
    .map((d) => {
      const p = d.params;
      const sw = [p.bodyWarp, p.bodyWeft, p.borderColor, p.palluGround, p.palluP].map((id) => `<i style="--c:${THREADS[id].hex}"></i>`).join('');
      return `<li data-id="${d.id}"><span class="lib-sw" aria-hidden="true">${sw}</span><span class="lib-name">${escapeHtml(d.name)}<small>${new Date(d.created).toLocaleString()}</small></span>
        <button class="chip" data-act="load">Load</button><button class="chip danger" data-act="del" aria-label="Delete ${escapeHtml(d.name)}">Delete</button></li>`;
    })
    .join('');
}
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function loadDesign(d: SavedDesign) {
  params = d.params;
  custom = d.custom ? decodeGrid(d.custom) : null;
  if (custom) editor.load(custom);
  opt = { on: !!d.optimized, lambda: d.optimized?.lambda ?? opt.lambda, mu: d.optimized?.mu ?? opt.mu };
  optOn.checked = opt.on; optLambda.value = String(opt.lambda); optMu.value = String(opt.mu);
  syncControls();
  rebuild();
  toast(`Loaded “${d.name}”.`);
}

$('#library').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button[data-act]') as HTMLButtonElement | null;
  if (!b) return;
  const id = b.closest('li')!.dataset.id!;
  const d = store.list().find((x) => x.id === id);
  if (!d) return;
  if (b.dataset.act === 'load') loadDesign(d);
  if (b.dataset.act === 'del') {
    if (b.dataset.armed !== '1') {
      b.dataset.armed = '1';
      b.textContent = 'Sure?';
      setTimeout(() => { if (b.isConnected) { b.dataset.armed = ''; b.textContent = 'Delete'; } }, 3000);
      return;
    }
    store.remove(id);
    renderLibrary();
    toast('Deleted.');
  }
});
$('#saveForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $<HTMLInputElement>('#saveName').value;
  try {
    const d = store.save(name, params, params.palluMotif === 'custom' ? custom : null, opt.on ? { lambda: opt.lambda, mu: opt.mu } : null);
    $('#saveStat').textContent = `Kept “${d.name}” in this browser.`;
    $<HTMLInputElement>('#saveName').value = '';
    renderLibrary();
  } catch {
    $('#saveStat').textContent = 'Could not save: browser storage is full or blocked.';
  }
});
$$('[data-export]').forEach((b) =>
  b.addEventListener('click', () => {
    const kind = b.dataset.export!;
    const stamp = new Date().toISOString().slice(0, 10);
    if (kind === 'png') {
      if (!renderer) { toast('The renderer is unavailable here; try the SVG naksha.'); return; }
      fetch(renderer.snapshot()).then((r) => r.blob()).then((blob) => download(`paithani-loom-${stamp}.png`, blob));
    }
    if (kind === 'svg') download(`paithani-naksha-${stamp}.svg`, sariSVG(sari), 'image/svg+xml');
    if (kind === 'csv') download(`paithani-ledger-${stamp}.csv`, ledgerCSV(sari, ledger), 'text/csv');
    if (kind === 'json') download(`paithani-draft-${stamp}.json`, draftJSON(sari, ledger, { params, optimized: opt.on ? opt : null }), 'application/json');
  }),
);
const qSel = $<HTMLSelectElement>('#quality');
qSel.value = prefs.quality;
qSel.addEventListener('change', () => {
  prefs.quality = qSel.value as typeof prefs.quality;
  store.setPrefs(prefs);
  if (renderer) { renderer.opts.quality = prefs.quality; renderer.request(); }
});

// ── camera & stage ───────────────────────────────────────────────────────
let camAnim = 0;
function viewFor(kind: string): View {
  const sizeY = sari.h / sari.w;
  // world-space y of a point 55% of the way into the pallu (cloth spans +sizeY/2 … −sizeY/2)
  const palluMid = (0.5 - (sari.palluStart + (sari.h - sari.palluStart) * 0.55) / sari.h) * sizeY;
  if (kind === 'pallu') return { yaw: -0.18, pitch: 0.04, dist: 1.35, targetY: palluMid };
  if (kind === 'macro') return { yaw: -0.5, pitch: 0.12, dist: 0.32, targetY: palluMid + 0.05 };
  return { yaw: -0.32, pitch: 0.06, dist: 3.35, targetY: -0.12 };
}
function goView(kind: string) {
  $$('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === kind)));
  if (!renderer) return;
  const r = renderer;
  const from = { ...r.view }, to = viewFor(kind);
  cancelAnimationFrame(camAnim);
  if (reduced()) { r.view = to; r.request(); return; }
  const t0 = performance.now(), dur = 900;
  const ease = (x: number) => 1 - Math.pow(1 - x, 3);
  const step = (now: number) => {
    const k = ease(Math.min(1, (now - t0) / dur));
    r.view = {
      yaw: from.yaw + (to.yaw - from.yaw) * k,
      pitch: from.pitch + (to.pitch - from.pitch) * k,
      dist: from.dist * Math.pow(to.dist / from.dist, k), // log-space zoom feels even
      targetY: from.targetY + (to.targetY - from.targetY) * k,
    };
    r.request();
    if (k < 1) camAnim = requestAnimationFrame(step);
  };
  camAnim = requestAnimationFrame(step);
}
$$('[data-view]').forEach((b) => b.addEventListener('click', () => goView(b.dataset.view!)));

if (renderer) {
  const r = renderer;
  canvas.tabIndex = 0;
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch = 0;
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d0 = Math.hypot(a.x - b.x, a.y - b.y);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [c, d] = [...pointers.values()];
      const d1 = Math.hypot(c.x - d.x, c.y - d.y);
      if (pinch && d0 > 0) r.view.dist = Math.max(0.22, Math.min(4.5, r.view.dist * (d0 / d1)));
      pinch = 1;
    } else {
      r.view.yaw -= (e.clientX - p.x) * 0.006;
      r.view.pitch = Math.max(-0.8, Math.min(0.9, r.view.pitch + (e.clientY - p.y) * 0.004));
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    r.request();
  });
  const end = (e: PointerEvent) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = 0; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); r.view.dist = Math.max(0.22, Math.min(4.5, r.view.dist * Math.exp(e.deltaY * 0.0012))); r.request(); }, { passive: false });
  canvas.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft') r.view.yaw += 0.08;
    else if (k === 'ArrowRight') r.view.yaw -= 0.08;
    else if (k === 'ArrowUp') r.view.pitch = Math.min(0.9, r.view.pitch + 0.06);
    else if (k === 'ArrowDown') r.view.pitch = Math.max(-0.8, r.view.pitch - 0.06);
    else if (k === '+' || k === '=') r.view.dist = Math.max(0.22, r.view.dist * 0.9);
    else if (k === '-') r.view.dist = Math.min(4.5, r.view.dist * 1.1);
    else return;
    e.preventDefault();
    r.request();
  });
  $<HTMLInputElement>('#wind').addEventListener('input', (e) => { r.opts.wind = +(e.target as HTMLInputElement).value; r.request(); });
  const lamp = $('#btnLamp');
  lamp.addEventListener('click', () => { r.opts.lampSweep = !r.opts.lampSweep; lamp.setAttribute('aria-pressed', String(r.opts.lampSweep)); r.request(); });
  new ResizeObserver(() => r.request()).observe(canvas);
}

// weaving playback
let weaving = 0;
const weaveBtn = $('#btnWeave');
function stopWeave() {
  cancelAnimationFrame(weaving);
  weaving = 0;
  if (renderer) { renderer.reveal = Infinity; renderer.request(); }
  weaveBtn.textContent = '▶ Weave it';
}
weaveBtn.addEventListener('click', () => {
  if (!renderer) { toast('Weaving playback needs the WebGL renderer.'); return; }
  if (weaving) { stopWeave(); return; }
  const r = renderer;
  goView('drape');
  weaveBtn.textContent = '■ Stop';
  const t0 = performance.now(), dur = Math.max(7000, sari.h * 34);
  let lastPick = -1;
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / dur);
    const pick = k * sari.h;
    r.reveal = pick;
    const ip = Math.floor(pick);
    if (ip !== lastPick) {
      if (ip % 3 === 0) sound.shuttle();
      if (ip % 3 === 2) sound.beat(Math.min(1, 0.4 + ledger.runs[Math.min(ip, sari.h - 1)] / 30));
      lastPick = ip;
    }
    r.draw(now);
    if (k < 1) weaving = requestAnimationFrame(step);
    else stopWeave();
  };
  weaving = requestAnimationFrame(step);
});

// ── prefs: sound & motion ────────────────────────────────────────────────
const sBtn = $('#btnSound');
const mBtn = $('#btnMotion');
const syncPrefsUI = () => {
  sBtn.textContent = prefs.sound ? 'Sound on' : 'Sound off';
  sBtn.setAttribute('aria-pressed', String(prefs.sound));
  mBtn.textContent = prefs.motion === 'reduced' ? 'Motion: reduced' : osReduced.matches ? 'Motion: reduced (system)' : 'Motion: auto';
  mBtn.setAttribute('aria-pressed', String(reduced()));
  document.documentElement.classList.toggle('reduce', reduced());
  if (renderer) { renderer.opts.reducedMotion = reduced(); renderer.request(); }
};
sBtn.addEventListener('click', () => { prefs.sound = !prefs.sound; sound.enabled = prefs.sound; store.setPrefs(prefs); syncPrefsUI(); sound.tick(); });
mBtn.addEventListener('click', () => { prefs.motion = prefs.motion === 'reduced' ? 'auto' : 'reduced'; store.setPrefs(prefs); syncPrefsUI(); });
osReduced.addEventListener?.('change', syncPrefsUI);

// ── toast ────────────────────────────────────────────────────────────────
let toastTimer = 0;
function toast(msg: string) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('on'), 2600);
}

// The stage fills the first screen exactly, below the header.
const setHead = () => document.documentElement.style.setProperty('--head', `${$('.top').getBoundingClientRect().height}px`);
setHead();
window.addEventListener('resize', setHead);

// ── boot ─────────────────────────────────────────────────────────────────
fillMotifSelects();
syncControls();
syncPrefsUI();
rebuild();
const boot = $('#boot');
const hideBoot = () => { boot.classList.add('done'); setTimeout(() => boot.remove(), 900); };
// Lift the curtain once the first frame of cloth exists (or at most after 1.6 s).
let booted = false;
const lift = () => { if (!booted) { booted = true; hideBoot(); } };
if (reduced() || !renderer) lift();
else {
  const r = renderer;
  const prev = r.onFrame;
  r.onFrame = () => { prev?.(); setTimeout(lift, 700); r.onFrame = prev; };
  setTimeout(lift, 1600);
}
