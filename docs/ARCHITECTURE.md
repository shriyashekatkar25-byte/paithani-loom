# PAITHANI LOOM — architecture

## Overview
A static single-page app (Vite build into `docs/` for GitHub Pages). It has no backend and no runtime dependencies, and all computation happens in the browser.

```
params + custom motif ──► composeSari ──► (optimizeSari) ──► compile ──► ledger
        ▲                     │                 │                 │
   UI controls            Sari {weft, warp,   Sari'            stats, chart,
   editor, presets        zone, palluStart}                    exports
        │                     └────────► SilkRenderer.setSari (RGBA8UI texture)
   Store (localStorage) ◄── autosave (debounced 400ms)
```

`main.ts` holds three pieces of state: `params: SariParams`, `custom: Grid | null` and `opt: {on, λ, μ}`. Any change calls `rebuild()`, which recomposes (about 50k cells in a few ms), optionally optimises, compiles, and pushes results to the renderer, the chart and the panels. There is no framework, because the derived state is small and every view has a single update function.

## Modules
| Module | Responsibility |
|---|---|
| `lib/palette.ts` | 14 threads (name, Marathi where certain, hex, metal flag), precomputed ΔE matrix, `swapCost` |
| `lib/color.ts` | sRGB→linear, relative luminance, WCAG contrast, sRGB→CIELAB, ΔE76 |
| `lib/grid.ts` | `Grid` (Uint8Array, 255 = empty), mirror paint, Bresenham, flood fill, stamp, symmetry test, base64 codec |
| `lib/motifs.ts` | Implicit shapes `(u,v) → role`, layered; `symmetric()` domain fold; `rasterize()` + outline pass |
| `lib/layout.ts` | `sanitizeParams` (all untrusted input passes here) and `composeSari`: buttis (half-drop), barwa band, pallu rows with facing pairs, kadiyal borders with narali teeth |
| `lib/weave.ts` | `runsOfPick`, `compile` → `Ledger` (runs, colours, fragile, joins, held boundaries, zari, effort), CSV |
| `lib/optimize.ts` | `solveRow` (exact 1-D Potts DP), `optimizeSari` (row-greedy with vertical term; borders fixed; zones kept consistent) |
| `lib/storage.ts` | `Store` over a `KV` interface (localStorage or in-memory fallback); validation on every read |
| `lib/exporters.ts` | SVG (one rect per run), draft JSON, download helper |
| `gl/shaders.ts` | Vertex: analytic folds and normals. Fragment: interlacement, thread profiles, Kajiya–Kay, zari, LOD, playback |
| `gl/renderer.ts` | WebGL2 setup, 110×180 mesh, integer design texture, linear palette texture, orbit camera, on-demand loop, adaptive DPR |
| `ui/editor.ts` | Naksha canvas editor with tools, mirror, undo (40 steps) and keyboard |
| `ui/chart.ts` | Loom chart (nearest-neighbour design + bobbin bars), pick selection |
| `ui/sound.ts` | Web Audio synthesis; lazily created on first gesture |

## Data model
- `Sari.weft: Grid` holds the visible weft thread per cell. `Sari.warp: Uint8Array(w)` holds the warp thread per end. `Sari.zone: Uint8Array` is 0 for body (balanced plain weave) and 1, 2 or 3 for border, pallu and butti (weft-faced).
- On the GPU the design texture is `RGBA8UI` with `r = weft id`, `g = warp id` and `b = zone`, fetched with `texelFetch` (no filtering of ids). The palette is a 16×1 `RGBA8` texture holding **linear** colour plus a metal flag, so lighting is done in linear light and gamma is applied at the end.

## Rendering
- **Cloth**: `z(s,t) = Σᵢ aᵢ sin(2π fᵢ s + φᵢ + ωᵢ t + kᵢ t)` scaled by an envelope `(0.18 + 0.82 t)`, plus a belly term. Normals come from the analytic ∂z/∂s and ∂z/∂t.
- **Threads**: in balanced cells `warpOver = (x + y) mod 2 = 0`. The visible thread has a circular cross-section `√(1 − x²)` and dives at the cell ends; the normal is tilted across and along the thread. The highlight follows Kajiya–Kay, `sin(T,H)^n`. Silk uses a fibre-tinted 90-exponent lobe plus a broad 14-exponent sheen; zari uses 220/600 lobes tinted by the metal.
- **LOD**: `lod = smoothstep(0.1, 0.4, fwidth(cell))` blends to the analytic mean of warp and weft shading, which removes moiré at distance.
- **Adaptive quality**: the renderer averages 40 frame times. Above 24ms it drops the render scale by 0.15 (minimum 0.55); below 14ms it raises it again. A manual High/Low setting overrides this.
- **On demand**: the loop runs only while something animates (breeze, lamp, camera tween or playback).

## Optimiser maths
For labels `ℓ ∈ L` (the colours present in the pick), `best[i][k] = cost(i,k) + min(best[i−1][k], minⱼ best[i−1][j] + λ)`, followed by a backtrack. Complexity is O(n·K) per pick. `cost` = ΔE with a metal-swap penalty, plus μ if the cell matched the cell above in the design but its label differs from the label already chosen above.

## Persistence
Keys `paithani-loom:library:v1`, `:working:v1` and `:prefs:v1`. Writes are wrapped; if storage is blocked, an in-memory KV keeps the session working. Reads are validated: params are clamped, grids decoded and checked for size, and junk entries are dropped.

## Tests
`tests/*.test.ts` (Vitest, jsdom) cover the grid, motifs (coverage, exact symmetry, outlines), composer (dimensions, zones, kadiyal warp, determinism, sanitising), compiler (runs, fragile, joins, effort, slits, zari, CSV), optimiser (identity at λ = 0, exactness against brute force, collapse at huge λ, border safety, reduction on the default design), storage (CRUD, corruption repair, prefs) and colour-token contrast. End-to-end checks run with Python Playwright against the built site (see README).

## Deployment
`vite.config.ts` sets `base: '/paithani-loom/'` and `outDir: 'docs'` (with `emptyOutDir: false` so docs/*.md and screenshots survive). GitHub Pages serves `main` from `/docs`.
