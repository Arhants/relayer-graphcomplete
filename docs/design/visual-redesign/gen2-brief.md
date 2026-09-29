# 14 — Gen 2 brief (from Vishal's answers, 2026-09-28)

Gen 2 evolves Gen 1 by **palette swap on two surviving structures**, plus three product changes. It amends
`12-design-brief-final.md` and `13-brief-addendum-recent-prs.md`; where they conflict, this brief wins.

## Decisions (Vishal)

1. Palettes liked: **K6 Mustard Cellar, K9 Riso Ultramarine, K8 Cocoa Bubblegum, M11 Toffee Supper**
   (palette space, `research/palette-space/tokens/<id>.json` + `.md`, `candidates.json`). One palette per branch.
2. Structures kept: **A Orbit** and **B Sticker** (brief §6.1, §6.2). C Index and D Stamp are retired.
3. Pairing by temperament:

   | Gen-2 | Parent structure | Palette | Name |
   |---|---|---|---|
   | **E** | A Orbit (compact, circle tokens, docked) | **M11** Toffee Supper (@meghatheeng reel/Dcyb5TFTwPd) | E · Orbit × Toffee |
   | **F** | A Orbit | **K6** Mustard Cellar (@kanishyamo reel/DdwI_GkSwTZ) | F · Orbit × Mustard |
   | **G** | B Sticker (comfortable, pill nodes, floating cards) | **K9** Riso Ultramarine (@kanishyamo reel/DdwI_GkSwTZ) | G · Sticker × Riso |
   | **H** | B Sticker | **K8** Cocoa Bubblegum (@kanishyamo reel/DdwI_GkSwTZ) | H · Sticker × Cocoa |

4. **Thread status in the top bar: a status symbol beside the thread title, shown only when the thread needs you or is
   working** — Running (`loader-circle`, animated; static under reduced motion), Stopping… (■ inside a spinning ring),
   Needs approval (`hand`), Failed (`octagon-x`). **No symbol** when Idle, Stopped, Cancelled or Accepted. Symbol only (no
   visible word); it has a tooltip and an accessible name with the state word (e.g. `aria-label="Thread status: Running"`),
   and each state has a distinct shape so colour never carries it alone. Colours follow each palette's state rules
   (running ink per the parent's gene Q; approval = warning text; failed = danger text). Size 16px glyph in a ≥24px hit
   area, 8px after the title. The prompt card/strip keeps its turn-level pill (the turn and the thread are different
   objects). **[PD]**
5. **Annotations collapsed by default.** The inspector's annotation dock becomes a one-line row ("Add annotation" + chevron,
   40px) until the user opens it, so the agent-authored Node Details page gets the full inspector height. Expanded state =
   today's textarea + Discard/Confirm. **[PD]**: breaks the pin that the dock is one third of the inspector
   (`workspace-keyboard.test.mjs:595`).
6. **Default theme follows macOS** (Settings › Appearance: System selected by default; Dark and Light available). Both themes
   are designed to the same standard. **[PD]** (System is new; `index.html` hard-codes `color-scheme: dark` today).
7. **Density follows the structure**: E, F keep A's compact 13/28; G, H keep B's comfortable 14/36.

## Inheritance rule (what an evolution step may change)

Each Gen-2 branch starts from its parent's FINAL Gen-1 boards and kits (`canvas/project/g1-A*` or `g1-B*`,
`gen1/A` or `gen1/B` incl. `authored/`). Keep the parent's layout, node spec, edge spec, state grammar, spacing, type scale,
fonts, radii and component shapes. Change only:
- colours (the palette swap, below);
- the three product changes above;
- open defects the Gen-1 round-3/compare reviews left on the parent (listed below), where cheap;
- genealogy labels (titles, X1 header).

## Applying the palette

- Start from `research/palette-space/tokens/<id>.json` (engine v1, already floor-checked) and its `.md`. Map its tokens onto
  the parent's token names. Keep the palette's semantic plan (what ink / accent / danger mean) unless it contradicts the
  parent's accent-rationing gene R; record every such call.
- **Re-search the six family colours for the parent's type channel** with the Gen-1 rules
  (`research/tmp/final-brief-cat.mjs`, brief §3.3): A = 2px icon stroke on node fill (≥3:1, ΔE ≥ 12 from every reserved
  colour); B = solid disc carrying a white or ink (#1B1B17) icon at ≥4.5:1. The palette-space cards drew all families as
  strokes, so B branches especially must re-run.
- Re-derive the **agent authoring guidance palette** (addendum §B) from the new tokens; the chart series must be distinct
  from the family colours (ΔE ≥ 10) or the reuse must be stated.
- Keep each source palette's character: where its ground/ink/accent live must be visible (e.g. K6's mustard card stock,
  K9's two-ink riso cream + ultramarine, K8's cocoa + bubblegum pink, M11's toffee/espresso warmth).

### Palette risks the judges found (must be fixed or consciously accepted)

- **M11**: toffee selection ring 3.09:1 (needs ≥ 3.2 for thin strokes); lifted caramel accent sits ΔE 5–6 from warning amber
  (so it takes the approval meaning, as its plan says); brown monochrome — hue must come from families.
- **K6**: heavy all-warm field (mustard chroma 0.127) — decide where mustard lives on A's calm, compact structure without
  fatiguing long sessions; in dark the berry ring is only 12.7/10.3 ΔE from failure/warning; links only 9.6 ΔE from body text.
- **K9**: ultramarine (chroma 0.28) on every interactive element is fatiguing — ration it (exact ultramarine for primary,
  selection and the running accent; quieter tints elsewhere); failure (orange) vs approval collapses under CVD (0.7) — give
  approval a clearly different lightness/hue (CVD ΔE ≥ 8) while keeping glyphs distinct.
- **K8**: hot pink is ΔE 8.6 from signal red, so danger moves to a separately derived brick red (keep ≥ 10 ΔE from the pink);
  light running arc 3.01:1 (needs ≥ 3.2).

### Open parent defects to carry-fix (from the Gen-1 round-3 critics and compare)

- A: authored chart colours inverted the story (the incident group "2 rolled back · stale grants retained" must read as the
  problem); the share download card's logo tile must show the real mark, not an empty/placeholder tile; Environment summary
  row should stay one line; merged invoke/input capsule overlapping the selection ring.
- B: quantity-strip segments carry only numerals — give each segment a direct text label; the running mark is a 45° comet
  (brief asks a 90° arc); chart series vs family distinctness must be stated; titles use the "<L><n> · <Name> — <Board>" form.
- Both: with annotations collapsed, the full N1 authored page and ALL its capability controls (Supporting brief 1, 2,
  Compare approaches, Review note, +) must be visible on X2/X3 without scrolling if at all possible.

## Boards

Same six per branch, same scene and content as Gen 1 (brief §3.4, §4; addendum §A–§E), names `g2-<L><n>-<slug>.dc.html`
(`g2-E2-desktop-dark.dc.html` …), titles "`<L><n> · <Name> — <Board>`" (e.g. "E2 · Orbit × Toffee — Desktop dark").
X1 header shows the genealogy: "Gen 2 · parent A Orbit (Gen 1) × palette M11 Toffee Supper (@meghatheeng)" with the source
chips. X6 adds: the header status symbol in every state (running, stopping, needs approval, failed, and the empty states
idle / stopped / accepted), the annotation row collapsed and expanded, and Settings › Appearance with System selected.
X1 and X6 may be up to 4800px tall.
