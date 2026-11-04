# PAITHANI LOOM — case study

## The question
Can a design tool show not only what a textile looks like but what it **costs to make by hand**, and still be beautiful enough that you want to play with it?

Paithani is tapestry-woven. Each patch of colour in a row is a separate bobbin passed by hand, and colour boundaries are interlocked (*kadiyal*). A design's complexity therefore lives in its rows, not its outline. Most pattern tools treat a design as a picture. Here it is treated as a program that a weaver's hands will execute once per pick.

## How this drop was chosen
Drop #001 was a nostalgic Y2K desktop (WebGL, Desi Y2K palette). Drop #002 was an agent-based sociology lab (Canvas 2D, Luxury Editorial). Rule for #003: not nostalgia, not simulation, and a new palette family and primary technique. Five candidates were scored 1–10 on originality, visual ambition, technical depth, experiential value, cultural depth, feasibility, portfolio relevance and difference from past drops (total out of 80):

| Candidate | Score |
|---|---|
| **PAITHANI LOOM**: tapestry compiler + thread-level silk renderer | **68** |
| FILMI.FM: music metadata explorer (data licensing too uncertain) | 49 |
| CHANDNI DREAM ENGINE: 3D scene builder (visually strong, thin on algorithms) | 55 |
| DIL SE DATABASE: film archive with NLP (would need large real data) | 52 |
| MONSOON MEMORY: procedural rain city (too close to #002's night map) | 50 |

PAITHANI LOOM won on cultural depth, technical depth (a compiler, an exact optimiser and a custom shader) and the most distance from the previous drops: generative design tool / cultural technology, Maharashtrian Heritage palette, WebGL2 GLSL.

## Users
- **Textile and fashion design students** learning how structure constrains surface. They can see that a peacock in four colours on zari is dozens of bobbin passes per row.
- **Designers working with handloom clusters** who want to talk about complexity with weavers before a sample is woven. The draft JSON and ledger CSV give them something concrete to discuss.
- **Curious people from the culture**, for whom a Paithani is an heirloom. The renderer and the field notes explain why the silk changes colour and why a pallu takes so long.

## Need and value
| Need | What the app offers |
|---|---|
| Understand tapestry complexity | A pick-by-pick ledger: bobbins, interlocks, held boundaries, single-end runs |
| Reduce effort without wrecking the image | An exact per-pick optimiser with two interpretable dials (λ, μ) |
| See the cloth, not a flat swatch | Thread-level WebGL rendering with physically motivated shot silk and zari |
| Keep and share work | A local library and four export formats |

## Differentiation
- **Structure-aware.** Tools in the generic pattern-generator space stop at the image. This one compiles the image into weaving operations and reports them.
- **Exact optimisation, not a filter.** Posterising or median-filtering reduces colours but ignores bobbin structure. The optimiser minimises an explicit objective, and each pick is solved exactly.
- **Rendering grounded in weave structure.** The shot-silk effect comes from warp and weft threads at right angles carrying different colours and highlights, not from a gradient texture.

## Core workflow
Draw or load a figure → compose body, border and pallu → read the ledger and find the demanding picks → tune λ/μ until bobbins drop while the figure survives → watch it being woven → keep it and export the draft.

## Technical moat
1. **Compiler** (`lib/weave.ts`): RLE per pick, plus slit detection by tracking, for every end, how long a colour boundary has persisted.
2. **Optimiser** (`lib/optimize.ts`): a 1-D Potts model solved in O(n·K) per pick. The trick is that the best "jump" transition only depends on the minimum over all previous labels plus λ. It is verified against brute force in tests.
3. **Renderer** (`gl/`): integer textures (`RGBA8UI`) carry thread ids; the fragment shader resolves interlacement, thread profiles, anisotropic Kajiya–Kay lobes, metal vs silk and analytic LOD. The vertex shader carries analytic fold normals. The renderer also adapts its resolution to frame time.
4. **Procedural motif grammar** (`lib/motifs.ts`): implicit shapes composed in layers and rasterised at any size. Exact symmetry is enforced by folding the domain, because float error otherwise breaks mirror symmetry at some sizes (a test caught this).

## Creative decisions
- **The loom room at dusk.** The page is a peacock-black ground lit by one moving lamp, because silk and zari only make sense under moving light.
- **Devanagari numerals** (१ २ ३ ४) and Marathi stage names (नक्षी, मांडणी, माग, संग्रह) mark the four steps of making. They are woven into the interface's grammar instead of being decoration.
- **A warp rail** of zari and rani threads runs along the top of the control panel. It is the one ornamental gesture, and it is literally the material.
- **Honest scale.** One cell is a bundle of threads, and the app says so wherever it might mislead.

## Engineering trade-offs and exclusions
- **No physics cloth simulation.** Analytic folds give exact normals, cost almost nothing and never explode. Real draping (collisions, pleats like a worn Nauvari) is left out.
- **No LLM.** Nothing here needs language generation. The "intelligence" is an explicit optimisation you can inspect.
- **Rows are solved greedily top to bottom.** A full 2-D Potts model is NP-hard in general; the 1-D-exact, row-greedy approach with a vertical term is fast enough to run live under a slider.
- **The effort index is a stated assumption** (1 + 0.5 per extra bobbin), not a labour-time model. Calibrating it would need weavers' own data and consent.
- **Excluded**: real thread counts (thousands of ends), extra-weft brocade, the selvedge three-shuttle technique, reverse-side rendering.

## Statistical / algorithmic logic
- Fidelity uses CIELAB ΔE (CIE76) between thread colours, with +25 for silk↔metal swaps, because swapping a zari cell for silk changes the material, not only the hue.
- Objective per pick: `Σ ΔE(cᵢ,ℓᵢ) + λ·#changes + μ·Σ[cᵢ = c_above ∧ ℓᵢ ≠ ℓ_above]`.
- A held boundary is a boundary at the same end for ≥ 6 consecutive picks. The threshold is a documented heuristic.

## Proposed metrics (not measured)
If this were a product: designs saved per active user; share of sessions that open the ledger; optimiser adoption and the median λ users settle on; exports per design; and, with weaving partners, the correlation between the effort index and actual weaving time on sample pieces (the key validity test). No adoption or research numbers are claimed here.

## Limitations
The colour hexes are interpretations. The motifs are geometric abstractions, not reproductions of any workshop's naksha. The renderer has only been tested headless (SwiftShader), not on real mobile GPUs. The optimiser can recolour single cells inside figures at high λ; μ helps, but it is not a perceptual model of shape.

## Roadmap
1. Calibrate the effort model with weavers (paid, credited, consented).
2. Add a 2-D optimiser (graph cuts / α-expansion) for comparison with the row-greedy DP.
3. Add an extra-weft brocade mode and the reverse side of the cloth.
4. Import a photo of a hand-drawn naksha and quantise it to the thread palette.
5. Add a shareable URL encoding of designs (the grid codec already exists).

Original work by Shriya Shekatkar · SHRIYA.EXE · Synthetic or demo data is labeled as such. Not affiliated with any film, studio or company. · https://shriyashekatkar25-byte.github.io/shriya-exe/
