/** File exports: the naksha (design) as SVG, and the full draft as JSON. */
import { THREADS } from './palette';
import { Sari } from './layout';
import { Ledger, runsOfPick } from './weave';

/** One <rect> per weft run, so the SVG stays small and editable in a vector tool. */
export function sariSVG(sari: Sari, cell = 4): string {
  const parts: string[] = [];
  for (let y = 0; y < sari.h; y++)
    for (const r of runsOfPick(sari, y))
      parts.push(`<rect x="${r.start * cell}" y="${y * cell}" width="${r.len * cell}" height="${cell}" fill="${THREADS[r.color]?.hex ?? '#000'}"/>`);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sari.w * cell}" height="${sari.h * cell}" viewBox="0 0 ${sari.w * cell} ${sari.h * cell}" shape-rendering="crispEdges">` +
    `<title>Paithani Loom naksha — original design, SHRIYA.EXE</title>${parts.join('')}</svg>`
  );
}

export function draftJSON(sari: Sari, ledger: Ledger, meta: Record<string, unknown>): string {
  const picks = [];
  for (let y = 0; y < sari.h; y++) picks.push(runsOfPick(sari, y).map((r) => [THREADS[r.color]?.key ?? r.color, r.start, r.len]));
  return JSON.stringify(
    {
      format: 'paithani-loom/draft@1',
      note: 'Original design made in PAITHANI LOOM (SHRIYA.EXE). One cell = a bundle of threads, not a single thread.',
      meta,
      ends: sari.w,
      picks: sari.h,
      warp: Array.from(sari.warp).map((id) => THREADS[id]?.key ?? id),
      summary: {
        maxBobbinsPerPick: ledger.maxRuns,
        meanBobbinsPerPick: +ledger.meanRuns.toFixed(2),
        interlocks: ledger.totalJoins,
        slitsAtLeast6: ledger.slits,
        effortIndex: +ledger.effortIndex.toFixed(3),
      },
      weftRuns: picks,
    },
    null,
    0,
  );
}

export function download(name: string, content: string | Blob, type = 'text/plain'): void {
  const blob = typeof content === 'string' ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
