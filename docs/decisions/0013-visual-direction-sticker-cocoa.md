# ADR 0013: Visual direction "Sticker × Cocoa"

Status: accepted visual direction (owner decision, 2026-09-28). Not implemented. Designs are build-time configuration
with no in-product picker (see "Build decisions"). PRD §10.1 records item 3 below and the one-design-per-build rule; PRD §8.1
records item 1 (planned). Items 2 and 4 are not in the PRD yet.

## Context

The current desktop and share UI has no visual language for the graph. Every node is the same grey circle whatever its
icon family, record state or capabilities. Colour is almost absent. Graph marks and `--faint` text fail contrast in both
themes. Light mode is a partial re-skin with an amber "blue" token. Most sized text is 10px or smaller. The diagnosis,
with file:line evidence, is in [`docs/design/visual-redesign/design-brief.md`](../design/visual-redesign/design-brief.md) §1.

The redesign ran as a prototype search with a branch width of four on a claude.ai Design canvas
(<https://claude.ai/artifact/LGjmv6H2PLFhPboze15eyt>):

- **Gen 1** tried four structures (A Orbit, B Sticker, C Index, D Stamp), each seeded by a palette from an inspiration reel.
  All four showed the same deterministic Lantern scene in dark and light, on desktop, the web share viewer and phone.
- A **palette space** of 29 palettes was engineered into full light/dark token sets. Three independent judges scored it.
- **Gen 2** crossed the owner's four preferred palettes with the two preferred structures.

The owner chose **H**: structure B "Sticker" with palette K8 "Cocoa Bubblegum".

## Decision

**Structure: B "Sticker"**
([`b-structure-spec.md`](../design/visual-redesign/b-structure-spec.md)).

- **Nodes** are 36px pills with a 28px solid family-colour disc and the label inside. Edges are 1.5px strokes. Gentle
  arcs (`arc-outward`) are the design's default shape; agents may choose another shape per layer (PRD §6.1, §11.2).
  The canvas is flat, with no grid.
- **Layout.** The inspector (340px) and the composer float as cards; the prompt card floats over the canvas.
- **Density is comfortable:** 14px Figtree UI text, 36px rows, type scale 12/13/14/16/20/28/32, a 4px spacing grid.
- **Radii:** 10/16/24 and pill.
- **Type.** Bricolage Grotesque is the display face and DM Mono the mono face. All three fonts are OFL-licensed and must
  be bundled.
- **Elevation.** Light mode uses soft shadows. Dark mode uses lighter surfaces with a 1px border.

**Colour: K8 "Cocoa Bubblegum"**
([`h-colour-spec.md`](../design/visual-redesign/h-colour-spec.md); source: @kanishyamo).

- **Light canvas:** grey poster ground `#D9DCD9`. **Dark canvas:** `#0F100F`.
- **Cocoa** `#725345` covers interaction, primary actions and selection. In dark it is `#7C5C4E` for fills and latte
  `#ECC8B8` for text and the selection ring.
- **Bubblegum pink** marks live work (running). It is `#DE5276` in dark and deepens to `#D43064` in light so thin arcs
  hold 3.2:1.
- **Mint** marks acceptance only.
- **Failure** is brick `#A93800` in light and coral `#FE8160` in dark.
- **Stop** stays neutral.
- The six presentation-only node families are re-searched for the solid-disc channel.

**State grammar.** Brief §2 and §3 are kept: explicit states with a glyph plus a label, dashed hollow drafts, a 2px
selection ring with a gap, a `--text` focus ring, and contrast floors of 4.5:1 for text and 3.2:1 for thin strokes.

**Product changes the owner chose for this direction.** Each needs a PRD update before implementation:

1. **Top-bar thread status symbol.** A symbol follows the thread title only while the thread is Running, Stopping…,
   Needs approval or Failed. There is no symbol when Idle, Stopped, Cancelled or Accepted. The state is carried by the
   shape, a tooltip and an accessible name. The prompt card keeps its turn-level pill.
2. **Annotations collapsed by default.** A 40px "Add annotation" row gives the agent-authored Node Details page the full
   inspector height. This deliberately replaces the one-third dock pin (`test/workspace-keyboard.test.mjs:595`).
3. **Appearance follows macOS by default.** Settings offers System, Light and Dark, with System as the default.
   `index.html`'s hard-coded `color-scheme: dark` and the dark-only bootstrap change accordingly.
4. **Agent authoring guidance.** H's authoring palette replaces the example colours in
   `packages/harness-host/src/implementations/graph-presentation-guidance.ts:17`. These colours are not test-pinned.
   Per PRD §6.2A the Relayer palette remains guidance only, and unthemed authored output is unchanged.

**Not decided here:**

- the public share viewer's light/dark policy (the hosted artifact uses the default design; see "Build decisions")
- the link-preview (OG) image
- the approval dock and onboarding visuals beyond the prototype boards

## Build decisions (owner, 2026-09-28)

- **Designs are build-time configuration, not a user setting.** Each design type (for example H "Sticker × Cocoa") is a
  config file, and the build takes the config file as its parameter. There is no in-product theme picker.
- **Build order: foundation first.** Appearance (System/Light/Dark), then the colour-token cleanup on today's look, then
  the design-config build parameter; H's structure lands whole through an integration branch.
- **Running and selection may share a hue, decided per palette.** They must still be distinct by shape, motion and
  label (running arc + badge + caption versus a static selection ring).
- **Existing installs with no saved appearance move to System** when System ships.
- **Plan only for now.** No implementation until the owner approves the revised plan
  ([`design-config-plan.md`](../design/visual-redesign/design-config-plan.md)). Update: the owner approved step P0 (these
  docs) on 2026-09-28; each later step needs its own approval (tracking issue #582).
- **Keep #570's persistent workspace split.** H's floating inspector card fills the split's right pane (340px only below
  1101px); READ-002 is unchanged. (plan PD-16)
- **Re-review the collapsed "Add annotation" row against #570's floating annotation editor** in the real app before
  building it; drop the row if #570 already gives the authored page the full height. Item 2 above is on hold until then.
  (plan PD-19)
- **Delete the classic look after H ships.** One structure in code; layout experiments stay on the Design canvas. (plan PD-18)
- **Only the default design is released.** Releases and the hosted share artifact use the committed default design; other
  designs are for dev runs and dev packs. (plan PD-17)

## Consequences

- Implementation touches:
  - every surface's colour tokens: desktop renderer, eval/judge/trace, and the share viewer
  - font bundling. Fonts are served from the app's own origin, so no CSP change is needed: the desktop page falls back to
    `default-src 'self'`, and the share viewer already allows `font-src 'self'`.
  - graph node rendering: record state, node families and badges are not drawn today
  - several test pins listed in the specs
- The visual record and rationale live in `docs/design/visual-redesign/`. The canvas is the review surface, not the
  source of truth.
- Later palettes can reuse the same token architecture. The 29 engineered palettes and the palette engine are
  candidates for further design configs.
