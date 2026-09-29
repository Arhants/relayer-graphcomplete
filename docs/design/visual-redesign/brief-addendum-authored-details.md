# 13 — Brief addendum: recent main PRs (#500, #532) — authored visual Node Details in light and dark

This addendum amends `12-design-brief-final.md`. Where they conflict, this addendum wins. The repo worktree was
fast-forwarded to `origin/main` @ `1409d572`, so the files cited here are readable at
`<repo>`.

## What changed on main

1. **#500 "Enable explanatory visual presentation in production Codex and Prime harnesses"** (`d9fd50af`).
   Production `codex-basic` and `prime-agent-basic` now select personal-presentation **V4** for new threads. Agents are
   asked to author **visual Node Details**: HTML/CSS pages with explanatory visuals (relationships, mechanisms,
   comparisons, quantities, sequences, spatial structure), optional pinned image assets, and bound controls. Concise prose
   stays appropriate for simple tasks. So in the real product the inspector's Node Details is now usually an
   **agent-authored page**, not markdown. Sources: PRD (V4 paragraphs), `docs/architecture.md`,
   `docs/evidence/production-visual-rollout/` (see `prime-detail-*.png` for how raw authored output can look today).
   The same PR moved Codex's production model policy to v3: `gpt-6-sol`, `gpt-6-astra`, `gpt-6-luna`
   (`crates/relayer-app-server/src/product/model_policy.rs:10`).

2. **#532 "Support agent-authored light and dark node details"** (`09af288e`, PRD §6.2A "Authored light and dark
   presentation", `docs/evidence/issue-519-themes/`).
   - Relayer owns the active appearance. The agent authors BOTH modes in one accepted package using the selectors
     `[data-relayer-theme="light"]` and `[data-relayer-theme="dark"]` on a runtime-owned inner scope.
   - **Relayer's palette is guidance, not a required palette or layout.** Harness guidance
     (`packages/harness-host/src/implementations/graph-presentation-guidance.ts:17`) currently gives the example
     `[data-relayer-theme="light"] .explanation { color: #182c34; background-color: #fafbf9; }` and
     `[data-relayer-theme="dark"] .explanation { color: #edf2f3; background-color: #121619; }` and says "Relayer light uses
     pale neutral surfaces and dark text; dark uses charcoal surfaces and light text". The example colours are **not
     test-pinned** (only the theme sentence and the two selectors are, in `graph-presentation-guidance-assertions.ts:8-10`).
   - Theme switching happens in place: no regeneration; the authored page, input values, focus, selection and scroll are
     preserved; controls keep ONE stable capability mount (authors may reposition and restyle them).
   - Theme-specific images are ordinary pinned assets shown/hidden by the theme selectors.
   - **Unthemed output is valid** and renders the SAME presentation in both modes; Relayer never recolours it.
   - Product and read-only Eval share the mechanism; the share viewer mounts the same runtime.

## What this means for the redesign

The inspector is now a **host for agent-authored pages** that follow each prototype's palette only as guidance. The
redesign therefore owns two new things: (a) how the inspector frames authored content in both themes, and (b) the
**authoring guidance palette** the harness hands to Codex and Prime. Each prototype must show both.

### A. Authored Node Details for N1 (replaces the §3.4 markdown body everywhere N1's details appear)

Relayer chrome stays as specified: the heading (N1 icon in its family treatment, caption `concept`, title "Offline recovery
covenant"), the collapsed Environment row above it, and the capability controls. Below the heading, draw an
**agent-authored explanatory page** that uses the prototype's authoring guidance palette (section B). Content, in order:

1. Lead sentence (real, fixture `:71`): "Interrupted updates roll back to the last-known-good build and stale permissions
   are revoked before relaunch."
2. A **sequence diagram** of four steps (illustrative, derived from the lead sentence): "Update interrupted" →
   "Roll back to last-known-good" → "Revoke stale grants" → "Relaunch". Compact: fits the inspector width (authored content
   260–420 px); vertical or horizontal as the prototype's inspector width allows; step labels ≥ 12 px.
3. A **quantity strip** (illustrative, derived from the real Turn 3 prompt "credential rotation interrupted on seven
   devices; two rolled back successfully but retained stale permission grants"): a single 100% bar titled
   "7 devices interrupted", segmented "2 rolled back · stale grants retained" and "5 rotation paused", each segment with a
   direct text label (never colour alone). Semantic chart colours must mean the same in both modes.
4. One short line (illustrative): "Applies to the 12% of testers who may be offline for 72 hours."
5. The capability controls, same order as before, after the authored content: pill "Supporting brief 1", pill
   "Supporting brief 2", invoke card "Compare approaches" / "Lay out the tradeoffs before choosing." (disabled while Turn 3
   runs), input "Review note" (placeholder "Add a review note"), and **+** last. They look like Relayer controls (they are
   capability mounts), not like authored decoration.

**Dark board (X2) shows the authored page's dark variant; light board (X3) shows its light variant.** Same layout, same
meaning, colours per section B. X4 (share web, light) shows the light variant with inert controls. X5 (phone, dark) shows
the start of the dark variant in the sheet at peek (lead sentence + the top of the sequence). X6's expanded phone sheet
shows the full dark variant.

**How the inspector frames authored content is a per-prototype choice** (keep it consistent with the prototype's layout
and elevation genes, and record it on X1): e.g. flush on the inspector surface with a hairline separator (A), on an inner
card (B), inside an inset "document" frame (C), or as an editorial reading column (D). Whatever the frame, the boundary
between Relayer chrome (heading, actions) and authored content must be legible, and the frame must not fight authored
colours in either theme.

### B. Authoring guidance palette (new X1 section 15 — "Agent authoring guidance")

For each theme give the reference values the harness would pass to authors:
`page` (usually transparent — the inspector surface shows through), `card`, `text`, `text-muted`, `border`, `link/accent`,
`focus`, and a **chart series of 4–6 colours** harmonised with the prototype palette. Rules: text ≥ 4.5:1 on page and card;
chart marks ≥ 3:1 on the card; series members distinguishable in both themes and under CVD; do not reuse the danger red
except to mean failure; chart series are content colours and must not be confused with node-family colours on the canvas
(either choose a distinct series or state explicitly that the family colours are reused and why). Compute contrast with a
node script and print the ratios. Show:
- a swatch table (light | dark) with hex and contrast;
- the guidance snippet in the same form as `graph-presentation-guidance.ts:17`, e.g.
  `[data-relayer-theme="light"] .explanation { color: …; background-color: …; }` /
  `[data-relayer-theme="dark"] .explanation { color: …; background-color: …; }` with the prototype's values, plus the
  one-sentence description that replaces "pale neutral surfaces and dark text / charcoal surfaces and light text";
- the N1 authored page rendered in both themes side by side at inspector width;
- a **[PD]** note: "Replaces the example colours in `graph-presentation-guidance.ts:17` (not test-pinned)".

### C. New X6 specimens (add to the secondary-states board)

1. **Theme switch keeps state**: the N1 authored page in dark and in light, with the Review note input holding typed text
   "Keep grants revoked until healthy" and visible keyboard focus in both (PRD §6.2A: value, focus and DOM identity survive).
2. **Unthemed authored detail**: a light-only authored page (white card, dark text, a small bar chart — like the Eval
   fixture in `docs/evidence/issue-519-themes/product-light-1.png`) shown inside the DARK inspector, unchanged (Relayer
   never recolours it). Show how the prototype's frame keeps it from looking broken. If the frame adds chrome beyond today,
   mark it **[PD]**.
3. The existing "phone sheet expanded" specimen now shows the N1 authored page (dark variant).

### D. Share viewer theme

The public viewer sets `data-relayer-theme` itself (authors never read `prefers-color-scheme`). **[PD]**: the viewer maps
the visitor's `prefers-color-scheme` to its own theme and mirrors it onto the authored scope; X4 = light, X5 = dark as
before. Note this on X1's "Product decisions shown here" box.

### E. Model names (current main)

- Composer model button: "Codex · GPT-6-Sol".
- Model picker (X6): Family Codex; options "GPT-6-Sol" ✓, "GPT-6-Astra", "GPT-6-Luna" (Codex production policy v3,
  `model_policy.rs:10`), each with provider caption "Codex" and a 44 px minimum row. Remove the GPT-5.6-*/Daybreak Blue/GPT-5.5
  options. Advanced tab text unchanged ("Harness · Codex Basic · Pinned for this thread").
- Update every other place the old model string appears (system sheet specimens included).

### F. What must not change

Everything else in the final brief: the canvas scene, node states, sample content, invariants, the six-board structure,
and each prototype's genes. The inspector width stays within its §5 range.
