# Prototype sources (preserved)

Copied from the prototype build workspace, which was temporary, so the plan's step P0 has a durable source. The
original folder layout is kept, so the relative imports resolve unchanged (`node gen2/H/contrast.mjs` runs from here).
These are design tools, not product code. `design-config-plan.md` §3 and §4 (P0, A2) say where each piece ends up.

| Path | What it is |
|---|---|
| `../../../../scripts/design/color.mjs` (moved in A2) | Colour maths: WCAG contrast, OKLCH conversion, OKLab ΔE, colour-blind (CVD) simulation. |
| `research/palette-space/engine.mjs`, `engine.md` | The palette engine. It turns a ground/ink/accent triple into light and dark role tokens, six family colours and a chart series, with floor checks. |
| `research/palette-space/candidates.json`, `judge-scores.json` | The 29 palettes' source colours, role mapping and judge scores. |
| `research/palette-space/tokens/`, `overrides/` | The engine output for every palette (`<id>.json` + `<id>.md`), and the per-palette tuning overrides. |
| `gen2/H/tokens.mjs` | **H's colour tokens (source of truth for the Cocoa palette)**, both themes. |
| `gen2/H/contrast.mjs`, `families.mjs` | H's pair contract (contrast and state-distinctness checks) and the node-family colour search/verification for the Sticker disc channel. |
| `gen2/H/geometry.mjs`, `geometry.json` | H's graph geometry for the Lantern scene: node, pill, disc and label boxes, clipped edges, per board. |
| `gen2/H/kit.css` | H's complete prototype stylesheet (tokens + Sticker components), a visual reference for implementation. It is not product CSS. |
| `gen2/G/tokens.mjs` | G · Sticker × Riso tokens, the first candidate for a second design config. |
