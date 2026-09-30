# Palette-space token engine (`engine.mjs`)

One deterministic engine turns any candidate in `candidates.json` into a full Relayer token set for **both** themes. It
uses the same rules that produced Gen 1, so every new palette is engineered the same way and can be compared fairly with
A–D. It reuses the Gen-1 code rather than re-deriving it:

| Layer | Source it reproduces |
|---|---|
| Colour maths (contrast, OKLCH, gamut, CVD simulation, ΔE) | `scripts/design/color.mjs` (moved from `../tmp/` in A2), imported as is |
| Neutral and accent ramps, status colours, the contrast "fix loop" | report 08's engine (`../tmp/engine.mjs`), same constants |
| Thin-stroke margin, selection ring, neutral Stop, focus = text, poster-canvas labels, diff tokens | brief 12 §2.5, §3.2, §6 |
| Family colours F1–F6 | `../tmp/final-brief-cat.mjs`: same bands, pools, seed, restarts and scoring, plus the brief §3.3 rules |
| Agent authoring guidance (page, card, text, link, focus, chart series) | addendum 13 §B |

Glossary (first use):
- **OKLCH**: a colour space with L (lightness 0–1), C (chroma, i.e. colourfulness) and h (hue angle). The engine only
  ever moves **L** to fix contrast, so hue and chroma (the colour's character) stay put.
- **ΔE**: the distance between two colours in OKLab ×100. About 2 is one hex step; 10 is clearly different; 15 is easy to
  tell apart even for small marks.
- **CVD**: colour-vision deficiency. "CVD ΔE" is the distance after simulating protan and deutan vision (red-green
  colour blindness, Machado 2009); the engine takes the smaller of the two.
- **APCA Lc**: an advisory perceptual contrast score. WCAG ratios are the pass/fail gate.
- **Thin-stroke margin**: lines of 2px or less anti-alias below their nominal ratio, so the brief asks for 3.2:1, not 3:1.

## Run it

```sh
cd research/palette-space
node engine.mjs                  # all candidates -> tokens/<id>.json and tokens/_summary.json (about 12 min)
node engine.mjs K5 M3            # only these ids (about 10–40 s each; the family search dominates)
node engine.mjs --overrides x.json K7   # use another overrides file
node engine.mjs --no-overrides   # ignore overrides.json
node engine.mjs --out /some/dir  # write elsewhere
node validate.mjs [--json validate-report.json]   # K1–K4 against brief §6 and palettes.json (run the engine first)
```

It needs Node only, with no packages, network or paid calls. The output is deterministic, because the searches use fixed
seeds. The console prints one line per candidate (PASS/FAIL, failure count, warning count, the smallest family ΔE as
normal/CVD for each theme) and lists every failure.

From code: `import { engineer, parsePlan, resolvePlan, loadCandidates, loadOverrides } from "./engine.mjs"`. Importing it
has no side effects.

## What a token file holds (`tokens/<id>.json`)

- `plan`: every decision the engine made, and in `plan.origin` where each one came from (`parsed …`, `rule: …`,
  `override`). `plan.notes` flags conflicts it resolved (for example, an accent that "means running" when
  `semantic_plan.running` says neutral ink).
- `light.tokens` / `dark.tokens` hold every token hex. Beside them, `source` gives one line per token on how it was
  derived and how far L moved, `neutral` gives the neutral ramp, its hue and chroma, and any pin, and `fixes` lists what
  the report-08 fix loop changed. Tokens:
  - chrome: `bg sidebar surface field overlay hover selected border border-strong text text-muted text-faint`
  - interaction: `accent-solid (+ -label) accent-solid-hover accent-solid-alt (+ -label) accent-soft-bg accent-text`
  - graph: `selection-ring focus-ring running canvas-bg canvas-grid canvas-label canvas-label-muted edge edge-strong
    node-fill node-stroke draft-outline`
  - status: `danger-solid (+label) danger-strong (+label) danger-text danger-soft-bg danger-outline`,
    `success-* warning-* draft-*` (solid, label, text, soft-bg)
  - `diff-add diff-del stop-bg stop-glyph`
  - the candidate's accent as a rationed signal: `signal-fill (+label) signal-soft-bg signal-mark`, with the brief's
    names as aliases where they apply (`accepted-fill`/`accepted-mark` for "accepted"; `highlight-fill` for "not yet
    accepted")
  - `sidebar-text sidebar-muted` (plus `sidebar-hover` when the ground is a sidebar block)
- `families`: F1–F6 per theme with hex, OKLCH, contrast on each ground the family mark sits on, the icon colour and its
  contrast for solid fills, and the nearest reserved colour with its ΔE. It also records the reserved set, the hue rules,
  the pool size, any anchor, and pairwise stats (smallest normal, CVD and tritan ΔE, with the worst pair).
- `authoring`: the addendum §B guidance for each theme (`page` transparent → `pageResolved`, `card`, `text`,
  `text-muted`, `border`, `rule`, `link`, `focus`), a chart `series` of 4–6 colours, the
  `[data-relayer-theme=…] .explanation {…}` snippet and a one-sentence description.
- `exact`: every token that is a source colour **exactly** (`used`), and the role colours no token could take exactly
  (`unused`, with the reason).
- `checks`: every contrast pair with its ratio, floor and pass flag (`contrast`, `authoringContrast`); family and series
  pairwise minima; the nearest-reserved ΔE; and `failures` (hard floors), `warnings` (margins and targets) and `pass`.

## The rules, in order

1. **Plan** (`parsePlan`), read from the candidate's own fields:
   - **Gene** (brief §6.0): the Gen-1 letter in `relation_to_gen1` ("is A", "near C", "nearest B", "a B×C cross" → B).
     The gene sets the family-colour channel (A icon stroke, B solid disc, C 4px tab, D whole tile) and the grid (A/C
     dots at 1.22:1, B none, D registration crosses at 1.33:1).
   - **Ground placement** (checked in this order). The ground is always used exactly and always seeds the neutral hue:
     - a sidebar block if `role_origin.ground` says "sidebar": exact in light, and in dark the ground hue at L 0.28 with
       C ≤ 0.045;
     - the light page background if L ≥ 0.93 or the text says "paper" (the light ramp is re-based so the other neutrals
       sit around it);
     - a poster canvas if the text says "canvas" (the light canvas if L ≥ 0.5, else the dark canvas);
     - a neutral seed only if it says "hue seed";
     - otherwise by lightness: L ≤ 0.20 → the dark page background; L < 0.5 → the dark poster canvas under darker
       chrome (A's charcoal); L < 0.93 → the light poster canvas under lighter chrome (C's powder).
   - **Interaction** is `roles.ink`. It becomes the ground chip if the text says "(the ground chip)", and **ink primary**
     (D) if it says "primary is ink".
   - **Accent meaning** from `accent_means`: selection, not-yet-accepted highlighter, danger, accepted, warning (approval),
     running (live work), or else a generic signal. The accent becomes the matching status colour (danger, success or
     warning source), the draft highlighter, the selection ring or the running colour.
   - **Running** comes from `semantic_plan.running`: "neutral" → `--text`; "open gene" → neutral (the Gen-1 A/D
     default); otherwise the interaction colour, or the accent when the accent means running.
   - **Danger**: the accent if it means failure. Otherwise it is a hex named in `semantic_plan.danger`, unless the text
     calls that hex "derived", in which case the engine re-derives it and reports the gap; or the ink if the text says
     so; or else derived.
2. **Neutrals** (report 08): a 12-step ramp at the ground's hue, with C = clamp(ground C × 0.5, 0.007, 0.016).
   Dark mode never goes below L 0.17 unless the ground itself is pinned darker (K16's navy is L 0.128, which is not
   black).
3. **Interaction ramp** (report 08): the exact swatch when it clears 3:1 on bg and surface and carries a 4.5:1 label.
   Otherwise the nearest L at C ≥ 0.12. It also derives the alt solid with the opposite label colour, the soft bg and the
   text step.
4. **Status colours** (report 08 rules):
   - Derived hues: danger from 25/36/15/45°, warning from 75/65/85/55°, success from 152/140/165/128°. The engine takes
     the first hue ≥ 20° away from the interaction hue and from the accent's hue.
   - Derived danger L starts at 0.52 (light) / 0.66 (dark) and steps until it is ΔE ≥ 10 from `accent-solid`. This
     reproduces B's h36 and dark L 0.74 exactly.
   - `danger-strong` carries a white glyph at 4.5:1 and APCA 75.
5. **Fix loop** (report 08): text, muted, faint (3:1), accent text, status text, border-strong and the primary move in L
   until they clear WCAG, plus the APCA advisories for text (Lc 75) and secondary text (Lc 60). Grounds are the chrome
   and the neutral canvas.
6. **Brief layer**:
   - Strokes: `border-strong`, `edge` and `node-stroke` reach 3.2:1 on their ground (the real canvas for the graph).
     `edge-strong` reaches 4.5:1 on the canvas.
   - Canvas labels: `canvas-label` and `canvas-label-muted` are `--text` / `--text-muted`, lifted to 4.5:1 on a poster
     canvas.
   - Selection ring: the report-08 ring on the interaction ramp (or the accent, when the accent means selection). It
     must reach 3.2:1 **and** APCA Lc 30 on the canvas. If it does not, the engine uses `--accent-text` when that passes
     (this is C-dark's `#8ABCFF`), and otherwise moves L.
   - `focus-ring` = `--text`. `stop-bg` = `--field` and `stop-glyph` = `--text` (Stop is neutral).
   - Hued running reaches 3:1 on the grounds its arc sits on (canvas for A/D, canvas and pill for B, card for C).
   - `draft-outline` is `--node-stroke`, or `--edge-strong` when a highlighter carries "not yet accepted".
   - `danger-outline` is danger lifted to 3.2:1 on the canvas (C's `#AA2E2F`).
   - `diff-del` is muted text when red means failure only (the one-red rule), and otherwise danger text.
   - Sidebar block text: the hover steps darker in light and lighter in dark, and flips direction when text cannot
     clear 4.5 on it. `sidebar-muted` reaches 4.6, or falls back to the sidebar text on a mid-tone block.
7. **Families** (brief §3.3 through `final-brief-cat.mjs`):
   - Candidates: hues every 3°, L bands 0.44–0.72 (light) and 0.58–0.86 (dark), C = min(gamut, 0.19) with C ≥ 0.1.
   - Per-colour rules:
     - ≥ 3:1 on the channel's grounds (A: node fill, surface, canvas; B: pill and canvas; C: card; D: canvas and
       surface).
     - ΔE ≥ 12 (stroke) or 10 from every reserved colour: accent (or `accent-text` for an ink primary), alt, selection
       ring, hued running, danger solid, strong and text, warning, success, and the accent fill and mark.
     - Hue ≥ 30° from the selection ring's hue, and ≥ 20° from danger, warning and success (≥ 30° from danger for
       tiles).
     - A white or ink `#1B1B17` icon at ≥ 4.5:1 on solid fills.
   - Search: pairs at least 20° of hue apart, maximising min(normal ΔE / 15, CVD ΔE / 8). It uses 40 first-slot restarts
     (seed 12345, as Gen 1) plus 200 fully random restarts. F1 is anchored within ±14° of the ground hue when the ground
     has any chroma. If the anchored set fails the sanity floor, the unanchored search replaces it when it does better.
   - Output order: after F1, each next family is the most distinct from those already chosen.
8. **Authoring guidance** (addendum §B):
   - Roles: page = transparent (it resolves to `--surface`), card = `--field`, text, muted, `border` = border-strong,
     `rule` = border, link = accent-text, focus = text. Each is lifted if needed to 4.5 (or 3) on both page and card.
   - Chart series: 5 colours (4 if 5 fall below ΔE 12 / CVD 6) with L bands 0.40–0.70 (light) and 0.62–0.88 (dark) and
     0.07 ≤ C ≤ 0.15, so they are quieter than the families. Each is ≥ 3:1 on page and card; ΔE ≥ 10 from every danger
     and accent token; ≥ 8 from warning and success; and **≥ 10 from every family colour**, so chart colours never pose
     as node families. The series are searched and ordered like the families.

### Floors: failures vs warnings

- **Failures** (hard floors):
  - text ≥ 4.5 on every surface it sits on, including placeholders;
  - marks, rings, strokes and status solids ≥ 3;
  - labels on fills ≥ 4.5;
  - focus = text, and Stop neutral, as field + text;
  - no pure-black dark surfaces;
  - every family per-colour rule above;
  - family or series pairwise ΔE below the **engine's sanity floor of 10 normal / 6 CVD**. This floor is my choice,
    set below every Gen-1 set (lowest: D 12.1, A 7.4) to catch sets that are clearly indistinct.
- **Warnings**:
  - strokes and rings between 3.0 and 3.2;
  - family or series minimum ΔE below report 08's targets (15 normal / 8 CVD);
  - APCA text advisories.

## Overrides

`overrides.json` (default) maps a candidate id to plan fields. The engine deep-merges them over the parsed plan, and
`plan.origin` records each overridden field as `override: <_why>`. Keep it small: every entry marks a place where the
parser could not read the candidate's intent.

```json
{ "K6": { "interaction": { "light": "#390F14", "dark": "#D8B44D" }, "_why": "oxblood primary in light, mustard in dark" } }
```

Settable fields:

| Field | Values |
|---|---|
| `ground`, `neutralSeed` | hex |
| `placement` | `bg-light`, `bg-dark`, `canvas-light`, `canvas-dark`, `sidebar`, `seed` |
| `gene` | `A`–`D`; also sets channel and grid unless those are given |
| `channel` | `stroke`, `disc`, `tab`, `tile` |
| `grid` / `gridTarget` | `dots` / `crosses` / `none`, and the contrast the grid aims for |
| `interaction` | a hex, or `{light, dark}` |
| `primary` | `interaction` or `ink` |
| `accent`, `accentRole` | hex; `danger`, `accepted`, `warning`, `draft-highlight`, `running`, `selection`, `signal` |
| `running` | `neutral`, `interaction`, `accent` |
| `selection` | `interaction`, `accent`, or a hex |
| `danger` / `success` / `warning` / `draft` | `{swatch: hex}`, `{derive: true}`, `{h, L: {light, dark}}`, or `{neutral: true, Loff}` |
| `familyFloor` | number |
| `familyAnchor` / `familyAnchorWidth` | `"ground-hue"` or `null`, and the width in degrees |
| `familySearch` | `{restarts, randomRestarts}` |
| `seriesCount` | number |
| `tokens` | `{light: {token: hex}, dark: {…}}` forces final hexes after derivation; checks still run on them, and `source` says `override (was …)` |

Current overrides: **K6 only**. Its `semantic_plan.interaction` asks for a role swap between themes (oxblood primary in
light, mustard in dark), which the one-colour parser cannot express. The environment variable `PS_RR` overrides the
default number of random family restarts, for quick experiments.

## Validation against Gen 1 (K1–K4 = A–D)

Run `node validate.mjs`. It parses the brief's §6 token tables straight from `12-design-brief-final.md` and compares
them with `palettes.json`. The full output is in `validate.log` and `validate-report.json`.

**Tokens vs brief §6** (about 88 tokens per candidate; "near" means ΔE < 2, about one hex step):

| Candidate | Identical | Near | Further |
|---|---|---|---|
| K1 = A | 84 | 2 | 0 |
| K2 = B | 82 | 6 | 0 (all six are warning tokens: hue 75° vs 70°) |
| K3 = C | 68 | 16 | 4 |
| K4 = D | 69 | 19 | 0 (`sidebar-selected` not emitted) |

The largest deviations, and why:

1. **C warning** (`warning-solid` light `#C67600` → `#9A6700`, ΔE 9.2; dark `#FFA747` → `#CB8900`, ΔE 12.2; warning
   text ΔE 2–3). Report 08 **hand-set** C's warning (h 65, L 0.64 / 0.80, "orange, away from the yellow"). The engine
   applies its general rule (h 75 at the family L), and at L 0.555 the light warning then takes a white label.
   Reproducing it would need a C-only special case, so it is left as a known deviation. It can be restored with an
   override: `{"K3": {"warning": {"h": 65, "L": {"light": 0.64, "dark": 0.8}}}}`.
2. **Near misses (ΔE ≤ 1.5)**:
   - Warning and success hues: report 08 used 70/80° (B/D warning) and 150/155° (D/C success); the engine uses one hue
     list for everyone (75°, 152°).
   - Canvas grids (≤ 1.3): the engine searches a contrast target, while the brief picked a neutral step by eye.
   - Edges, strokes and C's ring (0.1–0.2): the engine starts its L walk from a different point than the brief's scratch
     script, so it lands one hex step away.
3. **Tokens vs palettes.json.** Every large difference is a deliberate brief change (†) that the engine reproduces:
   - the poster canvases (A dark charcoal, C light powder) and the edges and strokes lifted to 3.2:1 on them;
   - D's ink/ice primary and its olive sidebar block;
   - the grid values.

   The rest are the C warning above.
4. **Families.** Brief A was a global search, so it is the fair comparison. The engine reaches the same quality: light
   14.8/7.4 vs the brief's 14.8/7.4, dark 14.9/7.3 vs 14.4/7.8, with the same six hues (126, 213, 240, 312, 333, and
   3 vs 357) and three identical light hexes. The F-numbering differs, because the brief assigned families to meanings by
   hand; the engine numbers by anchor and then distinctness.

   Brief B, C and D were **repairs** of report 08's older sets (only failing slots were re-searched). The engine searches
   all six globally, so its sets differ in hue but score better on normal vision:

   | Prototype | Brief (light; dark) | Engine (light; dark) |
   |---|---|---|
   | B | 15.5/7.7; 15.7/9.5 | 17.3/9.6; 17.3/10.6 |
   | C | 12.7/10.0; 13.9/10.1 | 15.8/9.6; 16.0/8.7 |
   | D | 12.1/8.3; 12.5/7.8 | 15.5/7.7; 16.1/8.4 |

   C's and D's CVD minima are slightly lower (C dark 8.7 vs 10.1; D light 7.7 vs 8.3), because the metric trades CVD for
   normal-vision distance.

In short, the engine reproduces the Gen-1 tokens to within a hex step, except where report 08 hand-set a value, and its
family search matches or beats Gen 1 under the same rules.

## Limits worth knowing

- The plan parser reads free text with keyword rules. Always read `plan.origin` and `plan.notes` before trusting a new
  candidate's tokens, and add an override instead of editing the text.
- Support colours (`roles.support`) are recorded but not placed. `exact.unused` lists them.
- Only the six brief families are searched. Report 08's overflow slots 7–8 are not used (brief §3.3 rule 4).
- The chart series is a guidance palette, not a validated data-viz ramp. There are no sequential or diverging scales.
