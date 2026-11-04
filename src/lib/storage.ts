/**
 * Local-first persistence: the working design autosaves, and named designs
 * live in a small library — all in this browser's localStorage. Everything
 * read back is validated, so corrupted or hand-edited storage cannot crash
 * the app.
 */
import { SariParams, sanitizeParams } from './layout';
import { decodeGrid, encodeGrid, Grid } from './grid';

export interface SavedDesign {
  id: string;
  name: string;
  created: number;
  params: SariParams;
  custom: string | null;
  optimized: { lambda: number; mu: number } | null;
}

export interface Prefs { sound: boolean; motion: 'auto' | 'reduced'; quality: 'auto' | 'high' | 'low' }

const KEY_LIB = 'paithani-loom:library:v1';
const KEY_WORK = 'paithani-loom:working:v1';
const KEY_PREFS = 'paithani-loom:prefs:v1';
export const MAX_DESIGNS = 40;

export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

/** Memory fallback when localStorage throws (private mode, blocked storage). */
export function memoryKV(): KV {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

export function safeKV(): KV {
  try {
    const t = '__pl_probe__';
    localStorage.setItem(t, '1');
    localStorage.removeItem(t);
    return localStorage;
  } catch {
    return memoryKV();
  }
}

function parse(raw: string | null): unknown {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function validDesign(d: unknown): SavedDesign | null {
  if (!d || typeof d !== 'object') return null;
  const o = d as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.name !== 'string') return null;
  const custom = typeof o.custom === 'string' && decodeGrid(o.custom) ? o.custom : null;
  const opt = o.optimized as Record<string, unknown> | null | undefined;
  return {
    id: o.id,
    name: o.name.slice(0, 60) || 'Untitled',
    created: typeof o.created === 'number' ? o.created : Date.now(),
    params: sanitizeParams((o.params ?? {}) as Partial<SariParams>),
    custom,
    optimized:
      opt && typeof opt.lambda === 'number' && typeof opt.mu === 'number'
        ? { lambda: Math.max(0, Math.min(200, opt.lambda)), mu: Math.max(0, Math.min(200, opt.mu)) }
        : null,
  };
}

export class Store {
  constructor(private kv: KV = safeKV()) {}

  list(): SavedDesign[] {
    const raw = parse(this.kv.getItem(KEY_LIB));
    if (!Array.isArray(raw)) return [];
    return raw.map(validDesign).filter((d): d is SavedDesign => d !== null).sort((a, b) => b.created - a.created);
  }

  save(name: string, params: SariParams, custom: Grid | null, optimized: SavedDesign['optimized']): SavedDesign {
    const d: SavedDesign = {
      id: `d${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
      name: name.trim().slice(0, 60) || 'Untitled',
      created: Date.now(),
      params: sanitizeParams(params),
      custom: custom ? encodeGrid(custom) : null,
      optimized,
    };
    const all = [d, ...this.list()].slice(0, MAX_DESIGNS);
    this.kv.setItem(KEY_LIB, JSON.stringify(all));
    return d;
  }

  remove(id: string): void {
    this.kv.setItem(KEY_LIB, JSON.stringify(this.list().filter((d) => d.id !== id)));
  }

  saveWorking(params: SariParams, custom: Grid | null, optimized: SavedDesign['optimized']): void {
    this.kv.setItem(KEY_WORK, JSON.stringify({ id: 'working', name: 'working', params, custom: custom ? encodeGrid(custom) : null, optimized }));
  }

  loadWorking(): SavedDesign | null {
    return validDesign(parse(this.kv.getItem(KEY_WORK)));
  }

  prefs(): Prefs {
    const p = parse(this.kv.getItem(KEY_PREFS)) as Partial<Prefs> | null;
    return {
      sound: p?.sound === true,
      motion: p?.motion === 'reduced' ? 'reduced' : 'auto',
      quality: p?.quality === 'high' || p?.quality === 'low' ? p.quality : 'auto',
    };
  }

  setPrefs(p: Prefs): void {
    this.kv.setItem(KEY_PREFS, JSON.stringify(p));
  }
}
