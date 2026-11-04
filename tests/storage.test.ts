import { Store, memoryKV } from '../src/lib/storage';
import { DEFAULT_PARAMS } from '../src/lib/layout';
import { makeGrid, set } from '../src/lib/grid';
import { contrastRatio } from '../src/lib/color';

describe('storage', () => {
  it('saves, lists newest first, and removes designs', async () => {
    const st = new Store(memoryKV());
    const a = st.save('Aai’s padar', DEFAULT_PARAMS, null, null);
    await new Promise((r) => setTimeout(r, 2));
    const g = makeGrid(8, 8); set(g, 1, 1, 12);
    const b = st.save('', { ...DEFAULT_PARAMS, bodyWeft: 6 }, g, { lambda: 30, mu: 5 });
    const list = st.list();
    expect(list.map((d) => d.id)).toEqual([b.id, a.id]);
    expect(list[0].name).toBe('Untitled');
    expect(list[0].custom).toBeTruthy();
    st.remove(a.id);
    expect(st.list()).toHaveLength(1);
  });
  it('repairs corrupted storage instead of crashing', () => {
    const kv = memoryKV();
    kv.setItem('paithani-loom:library:v1', '{not json');
    kv.setItem('paithani-loom:working:v1', JSON.stringify({ id: 'working', name: 'w', params: { bodyWarp: 999 }, custom: 'garbage' }));
    const st = new Store(kv);
    expect(st.list()).toEqual([]);
    const w = st.loadWorking()!;
    expect(w.params.bodyWarp).toBe(DEFAULT_PARAMS.bodyWarp);
    expect(w.custom).toBeNull();
    kv.setItem('paithani-loom:library:v1', JSON.stringify([{ id: 1 }, { id: 'ok', name: 'fine', params: {} }]));
    expect(st.list().map((d) => d.id)).toEqual(['ok']);
  });
  it('prefs default safely', () => {
    const st = new Store(memoryKV());
    expect(st.prefs()).toEqual({ sound: false, motion: 'auto', quality: 'auto' });
    st.setPrefs({ sound: true, motion: 'reduced', quality: 'low' });
    expect(st.prefs().motion).toBe('reduced');
  });
});

describe('UI colour tokens meet WCAG AA', () => {
  const ground = '#0A1D1A', panel = '#10292A';
  it.each([
    ['ivory on ground', '#F4EBD8', ground, 4.5],
    ['ivory-2 on ground', '#C5BCA6', ground, 4.5],
    ['zari text on ground', '#D9B45E', ground, 4.5],
    ['rani-ink on ground', '#F06A9A', ground, 4.5],
    ['ivory on panel', '#F4EBD8', panel, 4.5],
    ['ground on zari button', ground, '#D9B45E', 4.5],
  ])('%s', (_n, fg, bg, min) => expect(contrastRatio(fg as string, bg as string)).toBeGreaterThanOrEqual(min as number));
});
