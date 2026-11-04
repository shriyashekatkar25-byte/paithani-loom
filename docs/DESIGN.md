# PAITHANI LOOM — art direction

## Creative thesis
A loom room at dusk: one length of silk hangs under a slowly sweeping lamp, and everything around it is a weaver's notebook. The cloth is the only spectacle; the interface is graph paper, brass and thread. Beauty and labour are shown side by side, because in a Paithani they are the same thing.

## Moodboard (described, not copied)
- Pallu photographs: a purple body meeting a gold field, peacocks in tapestry colours, rani borders with triangular teeth (Pinterest search).
- Weaving drafts as graphic objects: graph paper, numbered grids, drawdowns (Pinterest search).
- Editorial textile archives: one floating fabric beside large italic serif type (Behance search).
- Flat colour-block prints on deep grounds (Shriya's Pinterest feed).

## Colour tokens (Maharashtrian Heritage family)
| Token | Hex | Use | Contrast |
|---|---|---|---|
| `--ground` | `#0A1D1A` | page (peacock-black) | — |
| `--panel` | `#10292A` | panels, tiles | — |
| `--ivory` | `#F4EBD8` | body text | 14.7:1 on ground |
| `--ivory-2` | `#C5BCA6` | secondary text | 9.2:1 on ground |
| `--zari` | `#D9B45E` | numerals, outputs, primary button | 8.8:1 on ground; ground on zari 8.8:1 |
| `--rani-ink` | `#F06A9A` | kicker, focus ring, active tab | 6.0:1 on ground |
| `--rani` | `#C2185B` | decorative fills only | — |
| `--vangi` | `#4E1A5C` | background glow | — |

Every text pair is checked in `tests/storage.test.ts` with the WCAG 2.1 formula (all ≥ 4.5:1). The **thread palette** (14 threads) is separate and named after the Paithani colour vocabulary; see `src/lib/palette.ts`.

## Typography
- **Cormorant Garamond** italic 500–600: the masthead, ledes, legends and field-note headings. It is the editorial voice.
- **Syne** 500–700: interface and small-caps labels (0.12–0.16em tracking). It is geometric and slightly eccentric, so it does not read as a SaaS default.
- **JetBrains Mono**: every computed number, so model output looks different from prose.
- **Rozha One**: Devanagari display (पैठणी माग, step numerals १–४). **Martel**: Devanagari text labels (नक्षी, मांडणी, माग, संग्रह, अंग, काठ, पदर). Devanagari appears only where the spelling is certain; uncertain colour names are left in transliteration.

## Composition
Desktop: a sticky stage (the cloth) fills the left ~57% of the first screen; the control panel sits on the right under a warp rail of zari and rani threads. The four tabs are the four stages of making. Field notes follow in a four-column editorial grid. Below 1080px the stage stacks above the panel at 68vh; below 560px stats go 2-up, forms single-column and the notes one column.

## Interaction philosophy
Direct manipulation with a keyboard path for everything. You can turn the cloth by drag, wheel/pinch or arrows; paint on the naksha by pointer or arrows + Space; step through the loom chart by pointer or arrows/Home/End; swatches are radio groups; tabs use roving tabindex. Destructive actions are two-step. Everything autosaves and says so quietly.

## Motion
- One easing curve, `cubic-bezier(.22,1,.36,1)`, at 160ms (UI) and 320ms (panes). Camera moves take 900ms, ease-out cubic, with zoom interpolated in log space so it feels even.
- Boot: warp threads drop into place (scaleY), and the Devanagari wordmark rises.
- Cloth: four travelling sines whose amplitude grows towards the free end. The lamp sweeps ±0.9 rad over about 18s.
- Weaving playback: the fell line glows gold as picks are laid over bare warp.
- **Reduced motion** (OS setting or in-app toggle): frozen folds, no lamp sweep or glints, an instant boot, and CSS animations at 1ms. Playback stays available because it is user-initiated.

## Graphic assets
All procedural: eight implicit-geometry motifs, narali teeth and barwa stripes in the composer, SVG favicon, CSS swatches with a thread texture and a metal conic sheen. Sound: a synthesised beater thud, shuttle brush and a small brass tick (off by default).
