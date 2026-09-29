# How to build H, and keep themes easy to prototype and add (final)

**Vishal's question:** "How do we build it? I would love to be able to prototype the different versions and make it easy
to update or add selectable themes in the future. How feasible is that?"

**What this is.** The lead-engineer answer, revised after two adversarial reviews: `review-engineering.md` (is it
buildable?) and `review-product.md` (does it respect the PRD, the record states and your decisions?). It draws on six
investigation reports in this folder (`renderer.md`, `surfaces.md`, `authored.md`, `pins.md`, `fonts.md`,
`prior-art.md`), the H and B specs, the Gen-2 brief, the final brief and ADR 0013. Appendix A lists the review
corrections not taken, each with a one-line reason. Appendix B maps every correction that was applied.

**Source snapshots.**
- The worktree is at `1409d572`. `origin/main` is **`7093fece`**, 25 commits ahead. The public share viewer **is merged
  on main** (#496, #542, #568), so it is no longer only on `codex/share-gate-b-462-467`.
- Citations marked **main** are at `7093fece`. Unmarked citations are at `1409d572`. Line numbers will shift: re-derive
  every count, rule number and pin on current main at the start of each PR.
- Main's `desktop/renderer/styles.css` is **288 lines, 107,266 B, 1,074 rules and 522 `var(--…)` uses**. At
  `1409d572` it had 942 rules.

**What this document did not do.** No repo edits, builds, repo test runs, installs or paid inference. The review
findings used here were re-checked at their key lines (Appendix B says which).

---

## 0. The answer on one screen

**Verdict: feasible. Selectable colour themes are cheap to add once a foundation is in place. Layout "versions" are not
a runtime setting.**

- **Your versions A–H mixed two things: a structure (layout, node shape, density, fonts) and a palette (the colours).**
  In the product, "versions" should mean **palettes only**. Structures stay on the Design canvas, where you compared
  them, and one of them wins as a product decision. **Please confirm this (PD-0).**
- **A theme = palette × appearance.** One data file per palette holds both light and dark. Your System / Light / Dark
  setting picks the mode. Pink means running and mint means accepted in both modes, so a palette is one family, not a
  separate light theme and dark theme.
- **The foundation** (built once):
  - components use about **45 named colour roles** (plus shadows, family discs and chart colours: **70 values per
    mode**);
  - each palette is one JSON file, `desktop/palettes/<id>.json`, and a small script writes it into the stylesheet;
  - `<html>` gets one new attribute, `data-palette`, next to the existing light/dark one;
  - a test that runs in under a second checks every palette against H's list of colour pairs that must stay readable
    and distinct.
- **After that, a new palette** goes from three colours to a file that passes the floors in **1–3 hours**. You see it on
  the real app, in light and dark, **in the same session**. Making it *look* right takes however many review rounds it
  takes (H took three). Shipping it is **one small PR**.
- **What you ask for, and what you get back.** "Try palette X" (or three colours). You get light and dark screenshots of
  the real app with real states (running, approval, stopped, accepted), plus the short list of colour pairs that need
  your call.
- **Build order (PD-12). Recommended: foundation first, and H lands whole.**
  1. On main: System appearance with no dark flash on launch (**~1 week**), then colour roles instead of hard-coded
     colours, which also fixes today's light-mode defects (**~2–3.5 weeks** in).
  2. Palettes become swappable on the real app at **~3–4.5 weeks**.
  3. H's structure, fonts and Cocoa are built on an **integration branch** and reach users together at **~6–9 weeks**,
     so nobody sees a half-H hybrid.

  The alternative, H first with tokens added as each area is restyled, gets H to users about a week sooner but palette
  switching about three weeks later (§4.1).
- **Honest sizing.** The two big steps are the colour cleanup (1–2 weeks) and H's structure (3–5 weeks). The first draft
  undersized both.

**Decisions I need from you before building** (full list in §4.4):

| # | Question | Recommended |
|---|---|---|
| PD-0 | "Versions" in the product means palettes, not structures | Confirm |
| PD-12 | Build order, and does H reach users whole (integration branch) or area by area | Foundation first; H whole |
| PD-10 | Show Cocoa's colours on today's layout before H's structure is ready? | No |
| PD-11 | Must live work always use a different hue from selection, in every palette? | Yes |
| PD-2 | Do existing installs with no saved appearance move to System? | Your call (new installs get System, as decided) |
| PD-5 | Put the accessibility floors (text 4.5, marks 3, thin strokes 3.2, 12px type) in the PRD | Yes |

---

## Glossary

Each term is also explained where it first matters.
- **Token.** A named CSS variable such as `--text`. Components write `var(--text)`, and the value is set in one place.
- **Role (semantic token).** A token named for its job (`--running-text`), not its colour (`--pink`).
- **Palette.** One named colour set that covers light and dark, for example Cocoa. Called "palette" in code and "Theme"
  in Settings.
- **Appearance.** Light or dark. **System** is a preference that resolves to one of them.
- **Structure.** Layout, node shape, sizes, spacing, radii and fonts. B "Sticker" is a structure; today's app is
  another.
- **Pair contract.** The list of colour pairs that must meet a contrast or distinctness floor, for example "muted text on
  the canvas ≥ 4.5:1". Each structure has its own, because the structure decides what sits on what.
- **ΔE.** How different two colours look; 10 is clearly different. **CVD**: simulated colour-blind vision.
- **Residual.** A known check failure that a palette file lists as accepted, with a pointer to the decision that
  accepted it.
- **First paint / flash.** The first frame a window draws. A flash is a first frame in the wrong mode.
- **CSP (Content Security Policy).** The page's rule about what it may load. The desktop page forbids `<style>` blocks
  and inline `style=""`.
- **Preload / `sendSync`.** The preload is Electron's small privileged script that runs before the page. `sendSync` is a
  blocking message from it to the main process that returns a value immediately.
- **Classic script.** A plain `<script src>` with no `import`. `theme-bootstrap.js` is one.
- **Pin.** A test that asserts an exact CSS string or number.
- **Ratchet.** A lint whose allowed count may only go down.
- **Routing sentinel.** A check in the running app that a component uses the right role, for example "the Stop button's
  background equals `--stop-bg`".
- **Heavy entry point.** A slow proof script (Electron, a packaged app). It runs before handoff, not after every edit.
- **Integration branch ("train").** A branch under `integration/**`. Component PRs target it and get CI; one PR takes the
  whole train to main (`docs/agents/ci.md` "Integration trains", **main**).

---

## 1. Verdict: how feasible, and what "a theme" means

**Why it is feasible.**
- **No bundler.** The renderer is static files served from `desktop/renderer/` by the Rust app server
  (`ServeDir`, `crates/relayer-app-server/src/api.rs:326`) and copied whole into the app
  (`desktop/packaging/electron-builder.mjs:92` **main**).
- **All colour already lives in one stylesheet.** The renderer's JavaScript and `index.html` contain no real colour
  literals (`renderer.md` §0).
- **A two-mode token setup already works:** 13 colour tokens at `styles.css:1`, light values at `:26` **main**, 522
  `var(--…)` uses **main**.
- **The debt is concentrated** (counts on **main**):
  - **194** hard-coded colour literals outside the tokens, plus 69 inside light-only rules (263 in total);
  - **57** rules that only repaint colour for light mode, plus the light token block;
  - **51** rules with no light version at all (`renderer.md` §4, at `1409d572`);
  - the light/dark choice is clamped to two values in **six** places, plus the `<meta>` tag.
- **The palette engine and validator already exist** in the scratchpad: `palette-space/engine.mjs` turns a
  ground/ink/accent triple into 60 role tokens per mode, 6 family colours and a chart series; H's `contrast.mjs` runs
  282 checks in about 0.05 s (`pins.md` §0.4).
- **After the one-time cleanup,** every surface that uses `styles.css` follows a palette change: the desktop app,
  onboarding, Settings, dialogs, the Eval review workspace and the share viewer.

**What a theme means: palette × appearance, chosen as a family.**

| Axis | Selectable at runtime? | Why (evidence) |
|---|---|---|
| **Palette** (Cocoa, later others) | **Yes**: a data file and a `data-palette` attribute | Same structure, different values. On Sticker, G (Riso) already shares 73 of H's 76 kit token names (`renderer.md` §0.4). |
| **Appearance** (System / Light / Dark) | **Yes** | Your decision (Gen-2 brief item 6, ADR 0013 item 3). `data-theme` must stay the *resolved* light/dark, because agent-authored Node Details mirror it and treat anything else as dark (`node-detail-runtime.js:515` **main**). |
| **Structure** (layout, node shape, density, edges, elevation) | **No**: Design-canvas prototypes, then a product decision (PD-0) | The design "genes" depend on each other: the family channel on node shape, the canvas on the palette (`12-design-brief-final.md` §6.0). Orbit shares only 54 of 76 names with Sticker (`renderer.md` §10). Structure moves JS geometry (`workspace.js:76-80`, `:154-157`, `graph-layout.js:1-4`), changes the DOM (docked vs floating) and breaks about 40 pins (`pins.md` §0.5). |
| **Fonts** | **No** in v1 (fixed by the structure, PD-8) | The UI font sets pill widths, which are measured from the DOM (`workspace.js:4350-4353`) and feed layout and camera fit (`graph-layout.js:58-70`, `workspace.js:283-300`). A font swap moves nodes (`fonts.md` §7.2). |
| **Density** | **No** | Density follows the structure (Gen-2 brief item 7). A later `data-density` could override the ~18 size tokens (`renderer.md` §8). |

**A palette is valid only for one structure.**
- The engine-clean K8 palette still failed 5 floors on B's grey canvas (`spec-gen2.md` §5.4): muted text 4.27, strong
  border 2.64, danger text 3.78.
- So each palette file names its structure, and the test checks it against **that structure's** pair contract,
  `desktop/palettes/contracts/<structure>.json`. Only `sticker.json` exists.
- Today's layout has no contract. That has a consequence for the build order: **during the cleanup on today's layout,
  the fast test proves completeness only, not readability.** Your side-by-side screenshot review is the gate there
  (§4.2, A3). A new structure later brings a new contract, and each palette is re-validated or re-tuned.

---

## 2. Architecture

### 2.1 Token layers

| Layer | Lives in | Who may reference it | Notes |
|---|---|---|---|
| **L0 primitives** (neutral ramp, hue ramps, engine inputs) | the palette's `source` block and the engine only | nobody at runtime | No primitive scale ships as CSS variables, which keeps the API small (`prior-art.md` §3). |
| **L1 palette roles**: colours, shadows, family discs, chart series, per mode | `desktop/palettes/<id>.json` → generated block in `styles.css` | structure CSS and components | **The only thing a palette sets.** |
| **L2 structure tokens and aliases** | hand-written base at the top of `styles.css` | components | fonts, type scale, control heights, radii, layout widths; aliases such as `--focus: var(--text)` |
| **L3 components** | the rest of `styles.css` | — | Only L1 or L2 names. A lint forbids literals. No component tokens, except scoped locals that point at L1 roles (for example `--tutorial-surface: var(--overlay)`). |

### 2.2 The role list

Names are H's kit names (`gen2/H/tokens.mjs`), so a token block moves between the Design canvas and the product
unchanged. There is **one rename set**, applied the same way by the engine importer and the canvas exporter:
- H's `accent-solid*` names describe palette slots, and H itself had to swap their meanings (`spec-gen2.md` §2). They
  become `primary`, `primary-text`, `accent-fill` and `accent-fill-text`.
- H's colour **`sidebar`** becomes **`sidebar-bg`**, because the product's `--sidebar` is already a width.

Values are H light / dark.

| Group | Roles (palette-level unless marked) | H values (examples) | Count |
|---|---|---|---|
| Surfaces | `bg` (header strip, window first paint), `sidebar-bg`, `surface`, `field`, `overlay`, `hover`, `selected`, `canvas-bg` | `#F7F9F7`/`#0F100F` … `#D9DCD9`/`#0F100F` | 8 |
| Lines | `border` (hairline), `border-strong` (≥ 3.2 stroke) | `#D7DBD7`/`#353835`, `#747874`/`#707470` | 2 |
| Text | `text`, `text-muted`, `text-faint` (disabled and decoration only) | `#191B19`/`#ECEEEC` … | 3 |
| Interaction | `primary` (was `accent-solid-alt`), `primary-text`, `accent-fill` (was `accent-solid`), `accent-fill-text`, `accent-text` (links, row bars), `accent-soft-bg` (selected-row tint), `selection-ring` | cocoa `#725345`/`#7C5C4E`; latte text `#ECC8B8` | 7 |
| Live work | `running`, `running-text`, `running-soft-bg`, `running-ink` | pink `#D43064`/`#DE5276` | 4 |
| Acceptance | `accepted-fill`, `accepted-fill-text`, `accepted-mark` | mint `#80D497` | 3 |
| Graph | `edge`, `edge-strong`, `node-fill`, `node-stroke`, `draft-outline` | | 5 |
| Failure | `danger-solid`, `danger-strong`, `danger-text`, `danger-soft-bg` | brick `#A93800` / coral `#FE8160` | 4 |
| Approval | `warning-solid`, `warning-text`, `warning-soft-bg` | | 3 |
| Success and diff | `success-text`, `diff-add` | | 2 |
| Draft | `draft-solid`, `draft-text`, `draft-soft-bg` | | 3 |
| Scrim | `scrim` | `rgba(25,27,25,.32)` / `rgba(0,0,0,.56)` | 1 |
| **Colour roles** | | | **45** |
| Canvas grid | `canvas-grid`: today's `.graph-stage` dot grid (`#282b2f`; light `#d6d3d1`). H is flat, so Cocoa sets `transparent` | | 1 |
| Shadows | `shadow-card`, `shadow-float`, `shadow-lift`, `shadow-pop` (geometry from the structure; values differ by mode and use the palette's ink) | dark: `none` for three | 4 |
| Family discs | `f1…f6`, `f1-ink…f6-ink` (re-searched per palette against its reserved colours, brief §3.3) | `#641F9F` … | 12 |
| Chart series (authoring) | `chart-1…4`, `chart-1…4-ink` (engine `authoring.series`; H `authored/palette.json`) | Ink, Lilac, Plum, Graphite | 8 |
| **Per mode, per palette** | | | **70** |

**Rules for surfaces the list does not name** (today's layout still has them during the cleanup):
- **Gradients flatten** to `--canvas-bg` or `--field`, because H is flat. This covers the new-thread hero
  (`.new-thread-view`), `.node-input-option-visual` and the annotation rating track and thumb.
- **Hovers use `color-mix()` over roles.** 15 of 50 `:hover` rules carry literals today (for example
  `.annotation-submit:hover{background:#fff}`), and `accent-solid-hover` is dropped. The file already uses `color-mix`
  at 4 sites.
- **`accent-color`** (native form controls, today `var(--blue)`) maps to `--primary`.

**Structure-level (L2): fixed by Sticker, never set by a palette.**
- **Aliases:** `--focus: var(--text)` (focus is always text, brief §2.5); `--stop-bg: var(--field)` and
  `--stop-glyph: var(--text)` (Stop is neutral, PRD `:2195`); `--halo: var(--canvas-bg)`;
  `--sticker-bg: var(--surface)`; `--diff-del: var(--text-muted)`; the 8 `--relayer-*` authoring aliases (§2.8).
- **Brand constants:** `--cream #FAF2E6` (logo tile), `--ink #1B1B17` (family icon ink), `--white`, and 3–4
  provider-icon constants.
- **Fonts:** `--font-ui`, `--font-display`, `--font-mono`.
- **Sizes (~18 tokens):** type scale 12/13/14/16/20/28/32; control heights 28/32/36/40/44/52; radii 10/16/20/24/999;
  the existing layout widths `--sidebar` and `--inspector` (`renderer.md` §8).

**No layout renames.** `--sidebar` and `--inspector` keep their names and meanings. Renaming `--inspector` would break 5
pins (`environment-rail.test.mjs:477`, `:478`, `:489`; `workspace-keyboard.test.mjs:1601`;
`workspace-breadcrumb.test.mjs:192`, all **main**) for no gain, and authored pages that read `--sidebar` today keep the
same meaning.

**Dropped from H's kit:** `--tl-*` (the traffic lights are native, `titleBarStyle:"hiddenInset"`, `window.mjs:45`
**main**); `--deck` (logo mock only); `--accent-solid-hover` (unused by components).

**Temporary alias shim.** Old names point at the new roles while areas migrate:
`--panel` → `--surface`, `--raised` → `--field`, `--line` → `--border`, `--line-strong` → `--border-strong`,
`--muted` → `--text-muted`, `--faint` → `--text-faint`, `--green` → `--success-text`, `--blue` → `--accent-text`,
`--danger` → `--danger-text`, `--warning` → `--warning-text`. The `--blue` alias ends today's lie that light-mode "blue"
is amber `#b45309` (`styles.css:26` **main**).
- The shim is deleted at B4 **everywhere except one rule**: the 13 colour names in today's `:root` block
  (`styles.css:1`) stay **permanently** as aliases on `.node-detail-runtime-host` (the single mount point,
  `desktop/renderer/src/product-workspace/workspace.js:135` **main**). Accepted authored pages can read those names
  today (`authored.md` §2), are immutable and are never re-linted. Without the aliases their text would inherit and their
  backgrounds turn transparent. That one rule is exempt from the lint.

**The vocabulary rule that keeps palettes swappable.**
- A component always uses the **most specific role**. Component CSS never changes per palette, so no per-palette
  `routing.css` like H's (`gen2/H/routing.css`).
- A palette that does not separate two roles may alias one to the other in its own file, **only within one group**:
  surfaces, lines or interaction. Example: `"accent-fill": "var(--primary)"`.
- A palette may **never** alias across the state groups (running, accepted, danger, warning, draft) or from a state role
  to an interaction role. The contract test enforces this. It protects the explicit states (`AGENTS.md`; PRD `:289`).

### 2.3 DOM axes

- **`data-theme` on `<html>`** stays exactly `light` or `dark`, the resolved appearance. Never `system`, never a
  palette name.
  - Readers: the Node Details runtime (`node-detail-runtime.js:513-520` **main**), the share viewer
    (`public-share-viewer/main.js:16-26` **main**), 5 evidence scripts, and the CSS.
  - Pins: `test/node-detail-runtime.test.mjs:46-95`, `packages/graph-client/test/detail.test.ts:24-35`.
- **`data-palette` on `<html>`** is new. No code reads or writes it today (`renderer.md` §6).
  - **It is absent for the default palette.** Every script that flips only `dataset.theme` keeps working
    (`test-desktop-project-new-thread.mjs:333`, `test-node-detail-csp.mjs:53-57`), and so do the share viewer and the
    private service's template copy.
- **Generated selectors**, one complete block per palette × mode:

```css
/* BEGIN GENERATED PALETTES — scripts/build-palettes.mjs; do not edit */
:root{color-scheme:dark;--bg:#0F100F;…}                                   /* default palette, dark  (0,1,0) */
:root[data-theme="light"]{color-scheme:light;--bg:#F7F9F7;…}             /* default palette, light (0,2,0) */
:root[data-palette="riso"]{color-scheme:dark;…}                          /* (0,2,0), later in file wins */
:root[data-palette="riso"][data-theme="light"]{color-scheme:light;…}     /* (0,3,0) */
/* share viewer only: correct mode before its module script sets data-theme */
@media (prefers-color-scheme:light){:root:not([data-theme]):not([data-viewer-theme="dark"]){…default light…}}
:root[data-viewer-theme="light"]:not([data-theme]){…default light…}
/* END GENERATED PALETTES */
```

- **Why this cannot leak.** Every block defines every token (the completeness test enforces it), so the most specific
  matching block supplies all values.
- **What must go first.** The 57 `html[data-theme="light"] <component>` override rules must be gone before a second
  palette exists. Otherwise today's light literals paint over every palette's light block.
- **The `:not([data-theme])` fallback** fixes the share viewer's dark first frame, including fixed-light embeds
  (`surfaces.md` §6.2). The template always emits `data-viewer-theme="system|light|dark"` (`template.js:96`, `:105`,
  `:120` **main**), so the selectors cover all three cases. It matches only until JavaScript sets `data-theme`.
- **`<meta name="color-scheme">`** becomes `light dark` (it is `dark` today, `index.html:6` **main**).
- **Rejected:** `light-dark()`, and a combined value such as `data-theme="cocoa-light"`. The resolved attribute is
  needed anyway, and a combined value would silently turn every authored light page dark.

### 2.4 Palette files

**Files and folders.**
- **Shipped palettes:** `desktop/palettes/<id>.json`.
- **Contracts:** `desktop/palettes/contracts/<structure>.json`. Only `sticker.json` exists.
- **Lab palettes:** `desktop/palettes/lab/<id>.json`, **git-ignored**. Prototypes live here and never block anyone.
  A prototype worth keeping as a design record is committed next to the 29 engine palettes under
  `docs/design/palette-engine/` (§3).
- Everything sits **outside `desktop/renderer/`**, because everything under `desktop/renderer/` ships in the app and
  possibly in the share artifact (`project-row-hover.prototype.html` ships today, `fonts.md` §4).

**Format** (mirrors H's `tokens.mjs` shape `T(light, dark, src, note)`). The example shows Cocoa's final state:

```json
{
  "format": 1,
  "id": "cocoa",
  "name": "Cocoa",
  "status": "shipped",
  "default": true,
  "structure": "sticker",
  "source": {
    "engine": "palette-space engine v1, candidate K8",
    "inputs": { "ground": "#D9DCD9", "ink": "#725345", "accent": "#DE5276" },
    "credit": "@kanishyamo reel DdwI_GkSwTZ",
    "rationale": "docs/design/visual-redesign/h-colour-spec.md"
  },
  "tokens": {
    "bg":          { "light": "#F7F9F7", "dark": "#0F100F", "src": "K8", "note": "header strip, window first paint" },
    "running":     { "light": "#D43064", "dark": "#DE5276", "src": "H-fix", "note": "light deepened: arc 3.45 on the grey" },
    "shadow-card": { "light": "0 1px 2px rgba(25,27,25,.06), 0 4px 16px rgba(25,27,25,.08)", "dark": "none", "src": "parent" }
  },
  "families": { "f1": { "name": "Document", "light": "#641F9F", "lightInk": "#FFFFFF", "dark": "#BC85FF", "darkInk": "#1B1B17" } },
  "chart":    { "chart-1": { "light": "#191B19", "lightInk": "#FFFFFF", "dark": "#ECEEEC", "darkInk": "#0F100F" } },
  "acceptedResiduals": [
    { "check": "cvd", "a": "f4", "b": "warning-solid", "mode": "dark", "value": 3.2,
      "why": "family disc vs approval pill never share a slot", "decision": "<ADR, PRD section or issue that accepted it>" }
  ]
}
```

**Field rules.**
- **`status`:** `shipped` palettes are compiled into `styles.css`. `legacy` is used once, for "classic" (today's look,
  §4.2 A3): compiled, checked for completeness only, never user-selectable, deleted when Cocoa becomes the default.
- **Exactly one** compiled palette has `"default": true`.
- **Values vs rationale.** From the moment `cocoa.json` exists, it holds Cocoa's values and `h-colour-spec.md` holds the
  rationale and points at the JSON instead of repeating value tables. P0 amends ADR 0013 `:38` to say so. One source of
  values, nothing to keep in sync.

**The contract test has three tiers** (so taste never hides inside an integrity gate):

| Tier | What it checks | Residuals allowed? | Authority |
|---|---|---|---|
| **Integrity** | completeness (exactly the contract's 70 names per mode), the generated output is fresh, the aliasing rule (§2.2), `data-theme` stays binary | **No** | integrity (`AGENTS.md`) |
| **Floors and state distinctness** | contrast floors (text 4.5, marks 3, thin strokes 3.2, labels on fills 4.5); the state pairs in §5.1 C2 | **No** | brief §2.5 until PD-5 puts the floors in the PRD; PRD `:289` and `AGENTS.md` for the states; PD-11 |
| **Taste** | family hue gaps, the "below 15/8 is a warning" band (`pins.md:434-439`), other distinctness | **Yes**, each with a `decision` field that points at a recorded decision (ADR, PRD or issue). A residual without one fails. | you |

**`contract.json` holds:** the structure name, the 70 required names, the contrast pairs (foreground, background, kind,
floor, meaning, ported from H's `contrast.mjs` `PAIRS`), the distinctness pairs (`DISTINCT` plus the new state pairs),
the family rules (`families.mjs`) and the aliasing groups.

**Why not DTCG or Style Dictionary.** DTCG (the W3C Design Tokens JSON format) is verbose for a two-mode value. Style
Dictionary (a token build tool) does not yet fully support DTCG 2025.10 (`prior-art.md` §1.11). A DTCG export is a small
later script if Figma or Tokens Studio is ever needed.

### 2.5 How palettes compile (build time, committed, no new build step)

- **`scripts/build-palettes.mjs`** (Node only, no dependencies) reads every compiled palette (`shipped` and `legacy`)
  and writes:
  1. the generated region at the top of `styles.css`, between marker comments (§2.3);
  2. **`desktop/main/palettes.generated.mjs`**, a tiny manifest `[{ id, name, default, bg: { light, dark } }]` for the
     main process (window first paint and the Settings list). The renderer never imports it; it gets the list over IPC
     (§2.7).
- **Both outputs are committed.** A test regenerates them in memory and fails if the bytes differ.
- **Why generate into `styles.css`, not a separate file.** The share viewer's template links exactly one workspace
  stylesheet and its artifact is a closed allowlist (`template.js:133-134` **main**; `workspaceStyles` in
  `contracts/share-service-v1/contract.json`; `scripts/build-public-share-viewer-artifact.mjs:11-43` **main**). A new
  stylesheet would change the contract and the private service (`surfaces.md` §2.2). Inside `styles.css`, the share
  viewer gets palettes for free.
- **Why not at runtime:** the desktop CSP is `style-src 'self'` (`index.html:7` **main**, pinned by
  `test/desktop-shell.test.mjs:198-199`), and the engine's family search takes 10–40 s.
- **Size:** about 3.4 KB per palette (H's two blocks are 1,781 + 1,606 B), plus about 3.4 KB for the share fallback
  copies. Negligible next to a 107 KB stylesheet and the 386,702 B `lucide.min.js` that already ships.
- **Keep the stylesheet's dense format.** The 104 string pins assume it (`renderer.md` §9).

### 2.6 First paint and System

**Today.**
1. Main sets `nativeTheme.themeSource` to `light|dark` (`index.mjs:407-408` **main**) before `createWindow` (`:618`).
   The window background is the literal `#fafafa` or `#0b0c0d` (`window.mjs:46` **main**).
2. The page origin changes on every launch (`--port 0`), so `localStorage` in `theme-bootstrap.js:2` is empty on a cold
   start and the bootstrap paints **dark**.
3. Light is applied only after an IPC round trip (`main.js:400` **main**).

**Inferred result:** light users see a dark first frame on every cold launch (`renderer.md` §7). Not yet observed; a
launch recording would confirm it.

**New flow (one path, no localStorage).**
1. **Main.**
   - `settings.appearance` becomes `system|light|dark`, and `nativeTheme.themeSource` is set from it. Electron 43
     supports all three, and `themeSource` drives the page's `prefers-color-scheme`.
   - The window background is `firstPaint(palette, nativeTheme.shouldUseDarkColors)` from the manifest. Main re-applies
     it on `nativeTheme.on("updated")` **and** when the palette setting changes.
2. **Preload.** On every page load it calls `ipcRenderer.sendSync("relayer:palette-read")` and exposes the current,
   normalised palette id next to the existing synchronous `platform` (`desktop/preload/index.cjs:104` **main**).
   - Reading on every load keeps it correct after a palette change followed by a reload (⌘R, or a crash reload).
     Launch arguments (`additionalArguments`) would be fixed at window creation and go stale, so they are not used.
3. **`theme-bootstrap.js`** (classic script in `<head>`, before `styles.css`):
   - `dataset.theme = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"`, plus a `change`
     listener;
   - `dataset.palette` = the preload's id, when it is not the default. No validation here; main already validated it.

   Mode and palette are both right on the first frame, and live macOS switches under System follow with no IPC.
4. **`ui.js` `applyAppearance`** stops writing `dataset.theme` and `localStorage`. It updates the control and persists
   the preference; the mode flips because main changes `themeSource`. Exactly one path.
5. **One pure module, `desktop/main/appearance.mjs`** (main process and tests only; the renderer cannot load files
   outside `desktop/renderer/`, and a classic script cannot `import`):
   - `normalizePreference`, `resolve(pref, osDark)`, `normalizePalette`, `firstPaint`;
   - it replaces the four main-process clamps (`register-ipc.mjs:156`, `:322`; `index.mjs:407`; `window.mjs:46`, all
     **main**);
   - the two renderer clamps (`ui.js:7`, `theme-bootstrap.js:3`) are simply **deleted**: the bootstrap reads
     `matchMedia`, and `ui.js` only sets the control.
6. **Migration.**
   - A saved `light` or `dark` is kept. The PRD's update evidence depends on "Light appearance persisted" (`:1376`,
     `:1737`), and the release canaries seed `"light"`.
   - A missing value becomes `system` for new installs. Existing installs with no saved value: **PD-2**.
7. **Evidence scripts.** The 13 `{appearance:"dark"}` stubs and the 11 first-paint literals in 8 scripts stay as they
   are: the default palette has no attribute, and dark stays dark. The renderer tolerates a reply without `palette` or
   `palettes`. Only three scripts change in A1 (§4.2).

### 2.7 Settings UI

**Today.** One row labelled **"Theme"** is a Dark/Light `<select id="appearanceSelect">` (`index.html:185` **main**).
The word "Theme" already means mode.

**Proposal.**
- **Appearance row.** Relabel it "Appearance" and make it a System · Light · Dark segmented control, as H draws it
  (`gen1/B/spec.md` §3). Keep the ids `appearanceSelect` and `appearanceDescription` (pinned,
  `test/desktop-shell.test.mjs:207`, `:219`).
- **Theme row (A7, later).** A list of shipped palettes from the manifest, delivered by extending the existing
  `relayer:appearance-read` reply (`register-ipc.mjs:317` **main**) to `{ appearance, palette, palettes }`. No new
  renderer module, so no telemetry-inventory change. Hidden while only one palette is offered (PD-7).
- **Persistence.** Store `palette` beside `appearance` in `desktop-settings.json`. Do not write defaults eagerly:
  `test/provider-onboarding-ipc.test.mjs:134` compares the whole write with `toEqual`.
- **Scope:** per device, like appearance (folded into PD-1).

### 2.8 Agent-authored Node Details (authoring tokens)

**The facts.**
- Host custom properties already reach authored pages through the shadow root (confirmed in Chromium with the runtime's
  exact CSS, `authored.md` §2). The runtime resets no custom properties.
- The compiler already accepts `var()` with fallbacks (`packages/graph-client/src/detail.ts:1086`, `:1144`,
  `:1186-1189`).
- Pages are integrity-hashed and never recoloured (`detail.ts:183`; PRD §6.2A `:2385`). A page written with literal
  colours keeps them under every palette forever.
- Pages that set no colours inherit `--text` through `color:inherit` (`node-detail-runtime.js:503`). That is the one way
  a palette affects such pages today.

**The proposal: a small, versioned `--relayer-*` contract (v1)** (`authored.md` §3.1).
- **16 colour names:** 8 aliases (`page`, `surface`, `text`, `text-muted`, `border`, `rule`, `accent`, `focus`) plus
  `chart-1…4` and `chart-1…4-ink` from each palette file. Three font names are part of PD-A1.
- Defined on `.node-detail-runtime-host`. For H: `--relayer-page: var(--canvas-bg)`,
  `--relayer-surface: var(--node-fill)`, `--relayer-border: var(--border-strong)`, `--relayer-rule: var(--border)`,
  `--relayer-accent: var(--accent-text)`, `--relayer-focus: var(--text)`. These match H's `authored/palette.json`.
- **Reserved state colours are never exposed** (running pink, accepted mint, failure brick, approval amber, the family
  colours), and neither are palette names. `data-relayer-theme` stays light/dark.

**This changes PRD §6.2A's meaning, so it is your decision first (PD-A1, four parts).**
1. **Amend ADR 0013 item 4?** Item 4 (`:62-64`) says H's authoring palette *replaces* the example colours in
   `graph-presentation-guidance.ts:17`. Tokens with H's values as fallbacks (for example
   `color: var(--relayer-text, #191b19)`) would replace that accepted decision.
2. **Clarify PRD `:2385`.** It says output "without theme-specific styling uses the same authored presentation in both
   modes". A page that reads `--relayer-text` with no theme selector *does* change with mode and palette
   (`authored.md:152`). The clarification: reading a `--relayer-*` token counts as theme-specific styling the author
   opted into; pages with neither selectors nor tokens are unchanged by mode and by palette.
3. **Which compiler rules?** Recommended: **only** reserving the `--relayer-` namespace (an authority rule). The typo
   guard, mandatory fallback and closing the accidental API (`authored.md:229-236`) would newly **reject** agent output,
   and PRD `:2385` says output "is not rejected for omitting variants" and readability is "not a deterministic palette
   judgment". Keep them as guidance unless the PRD adds a rejection class.
4. **Chart slot meaning:** categorical, or role-ordered (`authored.md` §6).

**What it takes after PD-A1:** a frozen `RELAYER_AUTHORING_TOKENS` constant in `detailAuthoringReference()`
(`detail.ts:2033-2046`; the guidance embeds it at `graph-presentation-guidance.ts:14`; no test pins the reference's
keys); a guidance example that uses tokens with literal fallbacks; the authoring pairs in the contract test; one token
assertion in `scripts/test-node-detail-csp.mjs`.

**Timing is a trade-off, not a deadline.** Only pages written after tokens ship can follow a palette, so each week
without tokens adds pages locked to their literals. Against that, PD-A1 reopens an accepted decision and a PRD sentence,
and deserves a considered answer.

### 2.9 Share viewer

**Policy (recommended, PD-4).**
- A **fixed default palette** (Cocoa once it is the default). The **visitor's OS picks the mode** (already built,
  `setTheme`, `main.js:16-26` **main**). The embed host's fixed light/dark option stays (`template.js:96`, `:105`, `:120`
  **main**; contract `themeOptions`).
- The sharer's palette is **not** published. It would be new published data and could clash with the single OG image and
  the private 404 page (`surfaces.md` §3). The CSS leaves a seam for a later server-owned, allowlisted `palette` option.

**Work.**
- The `:not([data-theme])` fallback (§2.3) fixes the dark first frame.
- `viewer.css`'s two literals move to tokens (logo tile `#f7f0e5` → `--cream`; `#fff` → `--surface`), and its `--blue`
  focus → `--focus`.
- Font files join `browserResources`; the loopback fixture's MIME map serves `.woff2` as
  `application/octet-stream` today (`scripts/fixtures/public-share-embed.mjs:82` **main**), so add `font/woff2`.
- Old shares keep their pinned look (`contract.json` `publishedSharesPinViewerArtifact: true`).
- **OG link image: PD-14, not part of any palette step.** ADR 0013 `:70` leaves it undecided. Cheapest option: when Cocoa
  becomes the default, hand-edit the SVG's 7 colours and fix the cream drift (`#f7f0e5` → `#FAF2E6`). A generated PNG is
  a separate share-viewer PR: it changes `logicalAssets.ogImage` (`build-public-share-viewer-artifact.mjs:48` **main**),
  the template default (`template.js:113`), the fixture MIME map and the build (a rasteriser).

### 2.10 Eval, judge and trace

- **The Eval review workspace** is the product renderer behind a proxy (`web-host.mjs:84-143`), so it follows the tokens.
- **Pin the judge's mode.** Under System, a headless context with no `colorScheme` (`eval-main/browser-review.mjs:11`
  **main**) emulates **light**, where today it is effectively dark. Set `colorScheme` explicitly and record palette and
  mode in the visual evidence.
- **The Eval dashboard, judge and trace pages** (4 forked dark-only stylesheets, 158 hex). ADR 0013 `:76` lists
  "eval/judge/trace" colour tokens as in scope; this plan would leave them out. **PD-13**: amend the ADR consequence, or
  bring them in. **PD-6**: follow the OS, or stay dark.

### 2.11 Fonts (structure, not palette)

- **The set:** Figtree (variable 300–900), Bricolage Grotesque (variable, with optical size) and DM Mono 400. Latin plus
  latin-ext is **162,432 B**; Figtree italic (so `<em>` gets a real italic) adds 31,304 B. All OFL-1.1 with no Reserved
  Font Name (`fonts.md` §2–§3).
- **Shipping:** WOFF2 files, licence files and a `fonts.json` provenance record under
  `desktop/renderer/assets/fonts/`; `@font-face` in `styles.css`.
- **Neither CSP changes:** the desktop CSP has no `font-src`, so `default-src 'self'` covers same-origin fonts; the share
  CSP already has `font-src 'self'`. ADR 0013's "CSP `font-src`" consequence (`:77`) can be dropped in P0.
- **One behaviour change:** re-measure and re-lay-out the graph when `document.fonts.ready` resolves. Otherwise pills are
  measured with fallback metrics (`workspace.js:4350-4353`); the share viewer is most exposed.
- **Accepted authored pages reflow.** They inherit the font (`font:inherit`, `node-detail-runtime.js:503`), so moving to
  Figtree changes line lengths on every existing page. Not an integrity break, but a visible change: say so in B1's PR
  and in PD-A1, and add one page with no declared font to the `visual-node-details` fixture so the reflow is reviewed.

### 2.12 What never follows a palette

The logo and app icon; native macOS dialogs (they follow the mode only); `@media(forced-colors:active)` blocks; literal
colours in authored pages; the OG link image (PD-14).

---

## 3. The prototyping loop

**One source of truth for shipped values:** `desktop/palettes/*.json` plus `contracts/sticker.json`. Everything else
is generated from them or checks them.

```
 idea (3 colours, a reel, a mood)
   │  engine (docs/design/palette-engine/, offline, 10–40 s)
   │  → scripts/palettes/import-engine.mjs (maps engine names → product names)
   ▼
 desktop/palettes/lab/<id>.json   (git-ignored; never blocks)
   ├──► (a) scripts/palettes/validate.mjs <id>   pass/fail + the exact failing pairs to hand-tune
   ├──► (b) scripts/palettes/export-kit.mjs <id>  → kit token block for Design-canvas boards (same names)
   └──► (c) the real app with RELAYER_LAB_PALETTES=1   (every state colour, real threads)
          + npm run evidence:themes -- --palettes <id>   light and dark tiles from fixture harnesses
   ▼
 move to desktop/palettes/, status "shipped"  →  build-palettes regenerates styles.css + manifest  →  one PR
```

**(a) Engine and validator.**
- The scratchpad is temporary, so the engine, its overrides and the 29 token outputs are committed as a **design tool**
  under `docs/design/palette-engine/` (precedent for runnable files under `docs/`: `docs/prd/server.mjs`).
- Only the colour-maths module (which both `contrast.mjs` and `families.mjs` import) goes under `scripts/palettes/`, as
  `color.mjs`, with `validate.mjs`, `import-engine.mjs`, `export-kit.mjs` and `build-palettes.mjs`. The contract test
  imports the same validation function and never runs the family search.
- The importer maps the engine's 60 names onto the product vocabulary (about 20 renames and derivations; H spec §2 is the
  table). The engine palettes lack Sticker's six extra roles, so the importer derives them and flags them for review.
- Two engine tweaks shrink the hand-tuning: run Sticker palettes with the engine's gene-B override, and teach the engine
  H's §5.4 canvas floors (`renderer.md` §10).

**(b) Design-canvas boards.** `export-kit.mjs` produces the same `.theme-light` / `.theme-dark` block that
`gen2/H/build-kit.mjs` makes today, from the repo file. The canvas stays the **review surface, not the source** (ADR 0013
Consequences). Structure experiments (a new inspector layout, Orbit vs Sticker) happen **only** here.

**(c) The real app.**
- In the **unpackaged** app, `RELAYER_LAB_PALETTES=1` makes main compile every lab palette and inject it with
  `webContents.insertCSS()` on every `did-finish-load` (insertCSS does not survive a reload). insertCSS does not touch the
  page's `style-src 'self'` CSP and puts nothing in `desktop/renderer/`. Confirm both in the A6 spike.
- Each injected lab block includes a small corner label with the palette's name and its failing-pair count, so a failing
  palette is visible as failing but still renders.
- You or I flip `document.documentElement.dataset.palette = "<id>"` in DevTools. Shipped palettes also work with
  `RELAYER_PALETTE=<id>` at launch.
- **Canary.** The lab loader also generates a `canary` palette on the fly (every role one loud colour). Anything that
  still looks normal is a hard-coded literal (Atlassian's trick, `prior-art.md` §1.12). It is also the proof that
  palettes swap. Use it throughout the cleanup.
- **Tiles.** `npm run evidence:themes -- --palettes <id>` is a thin screenshot script. It drives the existing fixture
  harnesses in turn (`test/support/lantern-2x2-fixture.mjs`; `test/support/stop-run-fixture.mjs` for Running and
  Stopping; `harnesses/fixture-approval.yaml`; the `fixture.node-detail` factory), writes light and dark PNG tiles plus
  the validator report, and checks that tokens resolve, no region is blank and there are no CSP errors. No new all-states
  fixture and no geometry assertions in v1.
- **Not used:** a custom "View › Palette" menu. `desktop/main` sets no application menu today, and adding one item means
  a full `Menu.setApplicationMenu` template, or macOS loses the Edit roles behind ⌘C/⌘V. Not used either: the
  share-viewer fixture as a fast lab. It renders accepted history only (`public-share-embed.mjs:11`, `:19-33` **main**),
  so running, Stop, approval, failure and draft never appear.

**What "any of the 29" means.** Once A6 lands, any of the 29 engineered palettes can be **viewed** on real product code.
Most will need tuning before they pass Sticker's contract: engine-clean K8 itself failed five floors.

**How long does a new palette take (after the foundation)?**

| Step | What happens | Time |
|---|---|---|
| Idea → draft file | pick a ground, ink and accent; run the engine; import | 10–40 s of compute, ~15 min of work |
| Draft → passes the floors | fix the pairs the validator names (K8 needed 11 floor fixes + 6 new roles on Sticker) | 1–3 h |
| → on the real app | lab injection; tiles from `evidence:themes`; optional canvas boards via `export-kit` | same session; ~10–20 min of runtime; ~1 h for boards |
| → looks right | your review rounds (H took three on the canvas) | design time, not engineering |
| → shipped | move to `desktop/palettes/`, set `shipped`, run `build-palettes`, `npm run check` + `build`, one PR | ½–1 day, including review |

**No test file changes per palette**, once the colour pins have been converted (§5.4). Otherwise every palette would
re-break about 23 colour pins (`pins.md` §4.9).

---

## 4. Build plan

### 4.1 Build order (PD-12)

Two workable orders. Both start with appearance (A1) and the offline palette tooling (A2). Times are **rough elapsed
weeks for one engineer or agent working mostly in sequence, review included**; they are estimates, not commitments.

| | **Option 1: foundation first (recommended)** | Option 2: H first, tokens added per area |
|---|---|---|
| Sequence | A1 ∥ A2 → A3 cleanup on main → A4 palette axis → A6 lab; H (B1–B4) on an integration branch | A1 ∥ A2 → H on an integration branch, each area tokenised straight to Cocoa, palette axis in the first area → A6 lab |
| System appearance, no dark flash | ~0.5–1 wk | ~0.5–1 wk |
| Today's light-mode defects fixed | ~2–3.5 wk | when H lands |
| Palettes swappable on the real app | ~3–4.5 wk (on today's layout, dev only) | ~6.5–8.5 wk |
| H reaches users | ~6–9 wk | ~5.5–7.5 wk |
| Throwaway work | "classic" palette values (the role assignment carries into H) | none |
| Integration-branch size | structure only (colours already tokens) | structure and all colour work |

**Why Option 1.**
- **Main keeps moving.** Main's stylesheet grew from 942 to 1,074 rules in the 25 commits since `1409d572`. Landing
  tokens and the literal lint on main first stops new literals and shrinks the integration branch to structure work.
  Option 2's branch would touch nearly every rule for 5+ weeks while main keeps changing the same file.
- **Little is thrown away.** Deciding which role each of today's 42 dark background shades maps to is the same work H
  needs. Only classic's *values* are discarded.
- **Earlier wins you can see:** System, no flash, fixed light mode and real-app palette prototyping, weeks before H.
- **Cost:** about a week later for H, and one legacy palette file kept for about six weeks.

**In both options, H reaches users whole.** B1–B4 and the switch of the default palette to Cocoa land as component PRs on
one `integration/h-redesign` branch (`docs/agents/ci.md` "Integration trains" **main**), reviewed area by area, then one
PR takes H to main. That answers PD-10 ("no hybrid") without a runtime structure switch. The price is keeping the branch
rebased on main for the length of B2.

**Until the lab exists, palette prototyping continues on the Design canvas.** That loop already works, and A2 adds the
validator and `export-kit` to it in the first week or two.

### 4.2 Phases

**Sizes:** **S** ≤ 1 day; **M** 2–5 days; **L** 1–3 weeks, split across several PRs. "Main" and "train" say where the
PRs land under Option 1.

| # | Where | Step | Size | Depends on | Visible change |
|---|---|---|---|---|---|
| P0 | main | **Decisions, then PRD and ADR edits from your answers only.** You answer the PDs (§4.4); only then edit PRD "Appearance: the local theme" (`:1345` **main**), the Settings row (`:594-604`), header status (`:1243`), the annotation dock (`:2231`), §6.2A, and the floors (PD-5). **Add checkpoint rows** for palettes and System to §6.2A and the appearance row (`:594-597`), naming the tests in §5.1 and the heavy entry points in §5.2, so the proof is declared before anyone claims it. Amend ADR 0013 `:38` (values live in `cocoa.json`), `:77` (no CSP change) and `:76` (PD-13). | S | — | none (docs) |
| A1 | main | **Appearance.** System/Light/Dark; `desktop/main/appearance.mjs`; bootstrap from `prefers-color-scheme`; window background via `nativeTheme` + `updated`; meta `light dark`; migration. Update the 2 evidence scripts that flip to light **and** `scripts/test-desktop-visual-node-details.mjs`, which imports `applyAppearance` (`:102`) and calls it to switch modes (`:120`) **main** and would silently stop switching: switch mode through `nativeTheme.themeSource` or CDP `Emulation.setEmulatedMedia`, then assert `dataset.theme`. Leave the dark stubs alone (§2.6 step 7). | S–M (~100–150 source + 100–150 test lines) | P0 (PD-2) | System option; no cold-launch dark flash |
| A2 | main | **Palette data and validator (offline, no product change).** `contracts/sticker.json` (port H's `contrast.mjs`, 185 lines, and `families.mjs`, 187 lines); `cocoa.json` from `gen2/H/tokens.mjs` (`shipped`, not default, not yet compiled); the contract test (three tiers); `scripts/palettes/{color,validate,import-engine,export-kit}.mjs`; the engine under `docs/design/palette-engine/`; `h-colour-spec.md` points at the JSON. | M | P0 (PD-5, PD-11) | none; you can validate palettes and get canvas boards from the repo |
| A3 | main | **Token cleanup on today's look** (Option 1 only). Replace the 194 base literals with roles; delete the 57 light override rules; alias shim; `canvas-grid`; flatten gradients; `color-mix` hovers; the literal lint as a ratchet; reverse coverage (every `var(--x)` is defined); "classic" as a `legacy` palette holding today's values; convert about 23 colour pins. **Gate:** old vs classic side by side, both modes, per area, reviewed by you; the 42→8 surface mapping recorded as a table in the PR. | **L** (1–2 wk, split by area) | A1, A2 | **visible in light mode** (51 rules gain a light version, defects fixed); small grey shifts in dark (ΔE < 4) |
| A4 | main | **Palette axis.** `build-palettes.mjs`, the generated region and manifest, compile `cocoa.json` next to classic; `data-palette`; preload `sendSync`; the completeness and freshness tests; `data-theme`-stays-binary test. | M (~1 wk) | A3 | none for users; `RELAYER_PALETTE=cocoa` shows Cocoa on today's layout to developers |
| A5 | main | **Authoring tokens `--relayer-*` v1**, guidance rewrite, compiler constant. | S | A4, PD-A1 | new authored pages can follow the palette |
| A6 | main | **Real-app lab.** `RELAYER_LAB_PALETTES` + `insertCSS` + corner label; generated canary; `evidence:themes` (thin screenshots); a `--palette` parameter on `test:desktop:stop` (plus the routing sentinels), `visual-node-details`, `project-new-thread` and `node-detail-csp`. | M (~1 wk) | A4 | you can view any palette on the real app |
| A7 | main | **User-facing Theme picker.** | S | A6, PD-1 | only when a second palette has passed and you have reviewed its tiles |
| B1 | train | **Fonts.** Three families + licences + `fonts.json`; re-measure on `document.fonts.ready`; `browserResources`; `font/woff2` in the fixture MIME map; the no-font authored page in the fixture. | S | — | new type |
| B2 | train | **H structure, one PR per area.** About 18 size tokens. Areas: sidebar; composer, header, turns; inspector + collapsed annotations; graph pills, discs and arcs + JS geometry (`workspace.js:76-80`, `:154-157`, `:374`, `:4469`: pill-aware edge clip); settings; overlays; share viewer. Rule counts per area were measured at `1409d572` (942 rules); re-derive on main (1,074 rules, ~14% more). | **L** (3–5 wk) | A3 (A4 preferred), B1 | H's layout, on the branch |
| B3 | train | **Header thread-status symbol** (Running, Stopping, Needs approval, Failed). | S | B2 header | ADR 0013 item 1 |
| B4 | train | **Cocoa becomes the default; cleanup.** Flip `default`; delete classic; remove the shim except the 13 permanent aliases on the Node Details host; lint at zero; refresh the PRD evidence images; OG per PD-14. Then the train PR to main. | S | B2, B3 | **H reaches users** |

**Ordering rules.**
- A1 ∥ A2 ∥ B1.
- A3 before any B2 area PR; restyling on literals would do the colour work twice.
- A6 ∥ B2.
- A5 as soon as PD-A1 is decided.
- Track A PRs touch only colour, token names, appearance plumbing and tooling. Track B PRs touch geometry, DOM, fonts and
  JS layout, and may not add a colour literal (the lint enforces it).

**Option 2 differences.** A3 and A4 disappear as separate steps. The first B2 area PR brings the generator, `data-palette`
and the preload read with Cocoa as the only palette; each later area moves its own literals straight onto Cocoa roles;
classic is never built; B2 grows by about a week.

### 4.3 Risks

| Risk | Consequence | Mitigation |
|---|---|---|
| Tokenising is a design call per surface: 42 dark background shades map to 8 roles (`renderer.md` §3) | unintended drift in A3 | your side-by-side review per area; the 42→8 table in the PR; the canary palette |
| A role used by a component is missing in some palette | silently transparent UI | completeness test + reverse coverage |
| A palette merges two state roles through an alias | a draft looks accepted, or failed looks like approval | the aliasing rule in the integrity tier; state pairs in the floors tier; the sentinels in §5.1 C7 and C13 |
| A palette passes the engine but fails on the structure (K8 had 5 misses) | unreadable captions | the contract is owned by the structure; step-7 review of contract completeness |
| During A3–A4 the fast test cannot see today's layout | readability regressions go unnoticed | classic is completeness-only by design, and your screenshot review is the gate |
| `data-theme` gets a third value or a palette name | authored light pages render dark | `appearance.mjs` + the binary test + existing pins `node-detail-runtime.test.mjs:46-95`, `detail.test.ts:24-35` |
| A palette change followed by a reload | wrong palette on the first frame | preload `sendSync` on every load; background re-applied on palette change |
| Evidence and judges flip to light once System ships | misleading screenshots and judge inputs | pin `colorScheme` in `browser-review.mjs:11`; A1 updates the three mode-switching scripts |
| Old authored pages use colours H reserves for state (the Eval fixture's "solar" is 1.9 ΔE from H's approval amber, `authored.md` §4) | a page reads as "needs approval" | nothing can recolour accepted pages; ship tokens once PD-A1 is decided; document it |
| Old authored pages read today's token names | text inherits, backgrounds vanish, after the shim goes | the 13 permanent aliases on the Node Details host |
| Fonts load after the first graph measure | clipped or off-camera pills, mostly in the share viewer | B1 re-measure hook + a deterministic test |
| Lab palettes leak into the app or the share artifact | an unreviewed palette ships | lab files are git-ignored and never compiled; a packaging check that only compiled ids appear in `styles.css` |
| The integration branch drifts from main for weeks | painful rebases on `styles.css` | Option 1 lands colour work on main first; rebase the train at least weekly |
| A naive literal lint flags non-colours in JS (`desktop/main/managed-runtimes/prime-wheels.mjs:1` `#377`; `desktop/renderer/src/share-publish-ui.js:9` `&#039;`) | false failures | for JS, lint only 6- or 8-digit hex inside string literals (or only the `backgroundColor`/`setBackgroundColor` call sites), with a `file:line` allowlist |
| Private share service content types for `.woff2`/`.txt` are unknown (`fonts.md` §8) | fonts fail on hosted shares | add them to the public/private pairing check |
| Line numbers and counts drift (main is 25 commits ahead) | stale pins in the plan | base all work on current main, carry over the untracked `docs/design/` and ADR 0013, re-derive counts at the start of A3 |

### 4.4 Decisions for you

P0 edits the PRD and ADR only from your answers. **Now** means before A1–A3 start.

| # | Decision | Recommended | When |
|---|---|---|---|
| PD-0 | "Versions" in the product means palettes, not structures. Structures stay on the Design canvas. | Confirm | now |
| PD-12 | Build order (§4.1), and H reaching users whole through an integration branch | Option 1; yes, whole | now |
| PD-10 | Show Cocoa's colours on today's layout before H's structure? | No (Cocoa becomes the default in B4) | now |
| PD-11 | Must live work always use a different hue from selection, in every palette? That is why K8 won (`spec-gen2.md` §5.1 `:169-176`). G/Riso draws running in its selection ultramarine (`gen2/G/tokens.mjs:36` vs `:35`), so Riso would need its own running ink first. | Yes | now (A2) |
| PD-2 | Existing installs with no saved appearance: move to System? (New installs get System; saved Light/Dark are kept.) | Your call | now (A1) |
| PD-5 | Accessibility floors in the PRD: text 4.5, marks 3, thin strokes 3.2, 12px type floor for H | Brief §2.5 numbers | now (A2) |
| PD-A1 | Authoring tokens, in four parts (§2.8): amend ADR 0013 item 4; clarify PRD `:2385`; namespace rule only; chart slot meaning | Tokens; namespace rule only; `:2385` clarified | before A5 |
| PD-1 | **When** palettes become user-selectable, and per device or per account | After a second palette passes and you have reviewed its tiles; per device | before A7 |
| PD-7 | Settings labels "Appearance" (mode) and "Theme" (palette); hide Theme while one palette is offered | Yes | before A7 |
| PD-4 | Share viewer: fixed default palette, visitor's OS picks the mode | Yes | before B2 share area |
| PD-8 | UI font fixed per structure (a palette never changes fonts) | Yes | before B1 |
| PD-9 | Floating inspector at ≤ 1100px (PRD `:597`, `:1195`, `:1336`) | Your call | before B2 inspector |
| PD-6 / PD-13 | Eval app: follow the OS or stay dark; eval/judge/trace get tokens or ADR 0013 `:76` is amended | Your call; amend the ADR either way | before B4 |
| PD-14 | OG link image: recolour the SVG, generate a PNG, and from which palette | Recolour the SVG in B4; PNG as its own PR | before B4 |
| PD-15 | Tutorial coach mark drops its private blue for palette roles (`surfaces.md:473-474`; ADR 0013 `:71` leaves onboarding visuals open) | Your call | before A3 |

PD-3 from the first draft ("does classic survive?") is gone: classic is never user-selectable and is deleted in B4.

---

## 5. Verification plan (`AGENTS.md` "Change verification workflow")

### 5.1 Checkpoints → the smallest deterministic test

| # | Checkpoint | Authority | Test | Tier |
|---|---|---|---|---|
| C1 | Every shipped palette × mode meets the floors on every contract pair | brief §2.5 → PRD after PD-5 | **T1 `test/palette-contract.test.mjs`** floors tier; residuals not allowed | warm, < 1 s |
| C2 | States stay distinct: running vs selection (PD-11), failed, approval, accepted; **draft-outline vs accepted-fill and accepted-mark; neutral stopped (`text-muted` on `field`) vs `danger-solid`; stopped vs `running`; `warning-solid` vs `danger-solid`** (normal and CVD); families clear of reserved colours and of each other | PRD `:289`; `AGENTS.md` "Preserve explicit draft, accepted, and stopped states"; brief §3.3 | T1: state pairs in the floors tier (hard); family rules in the taste tier (decision-backed residuals) | warm |
| C3 | Every palette defines exactly the contract's names; no cross-state alias; every `var(--x)` is defined; generated region and manifest are fresh | integrity | T1 integrity tier + **T2 `test/palette-token-coverage.test.mjs`** + regenerate-and-compare | warm |
| C4 | No colour literal outside the generated region (CSS, `index.html`, renderer JS, main process, `viewer.css`), except the Node Details legacy-alias rule; focus rings use `--focus`; font sizes on the scale | design-system integrity | T2 as a ratchet, reaching zero at B4 | warm |
| C5 | Preference → resolved mode; OS change in place; saved light/dark kept; unknown palette → default; window background = the palette's `bg`, also after a palette change | PRD `:1345` **main**, `:1376`, `:2383` | **T3 `test/appearance.test.mjs`** over `desktop/main/appearance.mjs`; the bootstrap in HappyDOM with stubbed `matchMedia` and a stubbed preload value; IPC with a fake `nativeTheme` (fixtures already pass `nativeTheme: {}`, `provider-onboarding-ipc.test.mjs:54`); settings-persistence tests extended with `system` and `palette` | warm |
| C6 | Changing palette or appearance keeps the authored page, input, focus and scroll; the marker stays binary; **unthemed output is preserved across palette switches** | PRD `:2384`, `:2389`, `:2391` | **T4**: extend `test/node-detail-runtime.test.mjs:70-95` (a `data-palette` change leaves the marker, DOM and an unthemed page's computed colours alone; a System flip updates in place) | warm |
| C7 | Stop and the stopped notice stay neutral and equal in every palette × mode; a stopped badge is `--text-muted` on `--field`; a Stopped or Failed layer frame is neutral | PRD `:2195`, STOP-006 `:2219`; brief `:391` | `scripts/test-desktop-stop.mjs:52`, `:62` (relational) + the new sentinels, run per palette through `--palette` | heavy |
| C8 | Authoring tokens resolve inside the real shadow root in both modes and every palette; **`--text` on the surface the Node Details page sits on is ≥ 4.5 in every palette × mode** (the inherited-text leg) | PRD §6.2A after PD-A1; Relayer's own frame for the text leg | T1 authoring pairs and inherited-text pair + extend `scripts/test-node-detail-csp.mjs` + a token component in the Eval fixture (`packages/eval-runner/src/fixtures/node-detail.ts:251-262`) | warm + heavy |
| C9 | The real app paints every palette × mode: tokens resolve, no blank regions, no CSP errors | PRD `:2390` (review the screenshots) | `npm run evidence:themes` (thin) + your review of the tiles | heavy |
| C10 | H geometry: breadcrumb left edge (PRD `:2324`), 3 × 52px turn rows (`:2332`) | PRD, brief §2.2 | B2's rewritten environment-rail evidence, once per appearance (not per palette) | heavy |
| C11 | Fonts, licences and palettes ship in the app and the share artifact; no lab palette ships | PRD §14.3 | a font provenance unit test; `test/public-share-viewer-artifact.test.mjs:62-68` (every `url(./…)` declared); `verify-bundled-app-server.mjs` checks licence files; the compiled-ids packaging check | warm + CI |
| C12 | Share viewer: correct mode on the first frame (standalone and fixed embed), default palette, both modes | PRD `:1260`, `:1324` | `evidence:public-share-viewer` with a light leg via `prefers-color-scheme` emulation (it never emulates light today) | heavy |
| C13 | A draft node's outline is `--draft-outline`, dashed (`border-style` or `stroke-dasharray`), opacity 1; inside a Working layer frame nothing computes to an `--accepted-*` value | `AGENTS.md`; PRD `:289`; brief `:122-126`, `:387`, `:431` | sentinels in the heavy driver that renders a draft node; **if no existing fixture renders one, this is a mapping gap** (§5.3) | heavy |
| C14 | Fonts arriving after the first render leave no pill clipped or off-camera | graph-fit behaviour | HappyDOM or in-process layout test with a stubbed `document.fonts` | warm |

**Warm loop** (well under 10 s, no Electron):

```
npx vitest run test/palette-contract.test.mjs test/palette-token-coverage.test.mjs test/appearance.test.mjs test/node-detail-runtime.test.mjs
```

Add the pin files a PR touches.

### 5.2 Heavy entry points before handoff

Run in their declared contexts. None needs paid inference. P0 declares these in the PRD checkpoint rows first.
- `npm run check` and `npm run build`.
- `npm run test:desktop:stop` (with `--palette` and the new sentinels), `test:desktop:project-new-thread`,
  `test:desktop:visual-node-details` (widen its `['light','dark']` loops at `:161` and `:192` **main** to palette × mode
  plus System) and `test:desktop:node-detail-csp`.
- `npm run evidence:model-selector` (add a `system` leg).
- `npm run evidence:public-share-viewer` and `evidence:public-share-embed`.
- `npm run evidence:themes` (thin screenshots, all palettes × modes in one process, per-cell results visible).

**No omnibus driver in v1.** Parameterising the existing drivers reuses what they already own (the Stop relational
checks, `inspectTheme`, the rail geometry). Build a combined driver only once two or more palettes ship.

**CI wiring.** Every new file under `scripts/` gets a `scriptOwners` entry in `scripts/ci/affected-modules.v1.json`:
`vitestFiles` for the pure modules (`color`, `validate`, `import-engine`, `export-kit`, `build-palettes`),
`"chapters": []` for manual drivers such as `evidence:themes`. Check whether `docs/design/palette-engine/` needs an entry
too (the manifest lists some `docs/` files, for example `docs/conversation-export-v1.md`).

**No golden-image gate.** Font and GPU rasterisation are not deterministic, and every intended palette change would fail
it. Decisions come from computed assertions plus your review of the tiles (PRD `:2390`).

### 5.3 Unmapped today (named, with the fallback)

- PRD `:2324` (interaction query and breadcrumb share a left edge) and the small-window layout have **no** deterministic
  test until B2's environment-rail evidence covers them.
- C13 has no known fixture that renders a draft node in the real app. Until one is identified or added, C13 is a
  mapping gap.
- Palettes, System default and the floors are not in the PRD. Until P0 lands, T1's floors are reported as brief-level
  and no "PRD promise" is claimed.
- For each gap, run `npm run check` as the fallback and report the gap.

### 5.4 Pins to update deliberately

Line numbers are at `1409d572`; re-derive them on main.
- **REPLACE colour pins with T1 or T2** (about 23), each retired only after its replacement passes a subsumption review:
  `tutorial-visual-contract.test.mjs:23`, `:30`, `:33-36` (literal contrast that never reads the CSS), `:46`, `:48-49`;
  `environment-rail.test.mjs:484`, `:494-495`; `model-picker-ui.test.mjs:321-322`, `:325`;
  `annotation-ui.test.mjs:107`; `model-family-settings.test.mjs:340`; `desktop-account-ui.test.mjs:292`;
  `workspace-keyboard.test.mjs:1603`, `:1608`.
- **RENAME only:** `environment-rail.test.mjs:496` (`--warning` → `--warning-text`), `workspace-keyboard.test.mjs:1602`
  (`--line-strong` → `--border-strong`).
- **UPDATE with H's structure in B2** (a real promise changed on purpose, together with the PRD): floating inspector and
  prompt card (`environment-rail.test.mjs:478`, `:485-490`; `workspace-breadcrumb.test.mjs:191-192`;
  `workspace-keyboard.test.mjs:1601`, `:1604`; `annotation-ui.test.mjs:104`); annotations collapsed
  (`workspace-keyboard.test.mjs:595-596` + PRD `:2231`); pill geometry (`graph-camera.test.mjs:86-89`, `:112-121`,
  `:130-131`, `:139-147`; `desktop-shell.test.mjs:4096`); rail maths (`environment-rail.test.mjs:505-522`); Electron
  geometry (`capture-environment-rail-evidence.mjs:198-237`); share viewer (`public-share-viewer.test.mjs:445`
  `100vh` → `100dvh`, `:447-448`).
- **KEEP:** the `--inspector` and `--sidebar` width pins (`environment-rail.test.mjs:477`, `:489`; no rename); the 11
  first-paint literals in 8 evidence scripts and the 13 dark stubs; the accessibility media rules
  (`environment-rail.test.mjs:492-493`, `workspace-keyboard.test.mjs:602-603`); the 3 × 52px turn rows
  (`workspace-navigation-controls.test.mjs:208-209`); the CSP pin (`desktop-shell.test.mjs:198-199`); every Node
  Details appearance and authority pin; the Stop relational checks; the `.graph-node` / `.graph-node b` names (restyle,
  don't rename); the telemetry inventory (this plan adds no renderer JS module).

### 5.5 Adversarial review targets (step 7)

- **Contract completeness:** does every surface a colour sits on appear, including canvas captions and layer frames
  (K8 missed them)?
- **State boundary:** do the aliasing rule, the C2 state pairs and the C7/C13 sentinels catch a palette or component
  that merges draft with accepted, stopped with failed, or running with selection?
- **Residuals:** does every residual point at a real recorded decision?
- **Each pin subsumption** in §5.4.
- **System authority boundary:** the marker stays binary.
- **First paint:** a recorded cold launch in light, in System, and after a palette change plus ⌘R.
- **The "no hybrid" claim:** nothing from B1–B4 reaches main before the train PR.

Record reviewer, commit or digest, scope, verdict and open findings in each PR. Without a PR, a review is
non-certifying.

---

## Appendix A. Corrections not taken

| Source | Correction | Why not (one line) |
|---|---|---|
| Product HIGH-1 | Build `contracts/classic.json` from today's surface pairs | A contract for a structure being retired is throwaway; classic is `legacy` (completeness only) and your side-by-side review gates A3 instead (engineering #3, product MEDIUM-4). The per-structure contract folder is kept. |
| Product HIGH-1 | Cocoa must pass both contracts during the overlap | Moot: Cocoa never becomes the default on today's layout (PD-10 default no; it flips in B4 on the train). |
| Product HIGH-2 | The A3 PR carries tier-1 lab tiles of the hybrid | The tier-1 lab is dropped (engineering #7); if you answer yes to PD-10, tiles come from `evidence:themes` on the real app. |
| Product PD-3 | Keep "classic kept or retired" as a decision, default retire at B4 | Nothing to decide: classic is never user-selectable (engineering #3) and is deleted in B4. |
| Engineering #3 | Delete classic in A3 | Classic must stay the default on main until Cocoa becomes the default, which now happens in B4, so it is deleted there. |
| Engineering #7 | Keep tier 1 but state it shows only neutral, accepted and authored surfaces | Took the reviewer's KISS option instead: drop it and prototype on the real app. |
| Product MEDIUM-2 | Read lab palettes from the scratchpad | The scratchpad is temporary (engineering #11); lab files live in a git-ignored repo folder, keepers go under `docs/design/palette-engine/`. |
| Product MEDIUM-6 | Generate the spec's value tables from the JSON, or add a freshness check | Simpler to remove the values from the spec and point at `cocoa.json`, so there is nothing to keep in sync. |
| Product MEDIUM-1 | Allow residuals for all distinctness checks | State distinctness carries PRD `:289` and `AGENTS.md` authority, so it is hard-fail; only family and taste distinctness takes residuals. |
| Product MEDIUM-3 | Present the build order as the owner's call with no recommendation | Kept as PD-12 with both timelines, but recommend Option 1 because main's churn on `styles.css` makes a long colour-and-structure branch risky. |
| Product LOW-2 | Let lab palettes also set the display and mono fonts | Each lab font must be bundled and licence-checked, and palettes stay colour-only (PD-8); compare type on the Design canvas. |
| Product HIGH-3 | Put the new sentinels in the omnibus driver T6 | T6 is deferred (engineering #12); the sentinels go into `test:desktop:stop` and the driver that renders drafts (C7, C13). |

## Appendix B. Corrections applied

Re-checked on main in this pass: `ServeDir` at `api.rs:326`, and no renderer file imports `desktop/shared/` (engineering
#1); `applyAppearance` at `test-desktop-visual-node-details.mjs:102`/`:120`, loops at `:161`/`:192`, first-paint
literal at `:244` (engineering #4); the five `--inspector` pins (engineering #5); no `Menu`, `additionalArguments` or
`sendSync` in `desktop/main` or `desktop/preload` (engineering #2, #9); `.node-detail-runtime-host` at
`product-workspace/workspace.js:135` (engineering #8); G's running = selection hue at `gen2/G/tokens.mjs:35-36`
(product HIGH-4); PRD §6.2A wording at `:2385`, `:2391` (product HIGH-5); PRD `:1345` "Appearance: the local theme"
(engineering #16); integration trains in `docs/agents/ci.md` (used for PD-10).

| Source | Applied as |
|---|---|
| Eng #1 | `desktop/main/appearance.mjs`, main and tests only; renderer clamps deleted (§2.6) |
| Eng #2 | preload `sendSync` on every load; background re-applied on palette change; no `additionalArguments` spike (§2.6) |
| Eng #3 | contract per structure; classic `legacy`, completeness only; canary as swap proof; A3/PD-10 as decisions (§1, §2.4, §3, §4) |
| Eng #4 | `visual-node-details` in A1; line refs fixed (§4.2, §5.2) |
| Eng #5 | no layout renames; `sidebar` → `sidebar-bg` (§2.2) |
| Eng #6 | A2 split (A3 cleanup, A4 axis); A3, B2 sized L; counts re-derived (§4.2) |
| Eng #7, #9 | tier-1 lab and custom menu dropped; `RELAYER_LAB_PALETTES` + `insertCSS` on `did-finish-load` (§3) |
| Eng #8 | 13 permanent legacy aliases on the Node Details host (§2.2) |
| Eng #10 | `canvas-grid` (70 per mode); gradients, hovers, `accent-color` rules (§2.2) |
| Eng #11 | engine under `docs/design/palette-engine/`; colour maths under `scripts/palettes/`; `scriptOwners` for all (§3, §5.2) |
| Eng #12 | existing drivers parameterised; thin `evidence:themes`; geometry once per appearance (§5.1, §5.2) |
| Eng #13 | OG out of palette steps; SVG recolour vs PNG PR (§2.9, PD-14) |
| Eng #14–#19 | precise JS lint; counts and line refs; dark stubs left alone; `font/woff2`; base on main (§1, §2.6, §4.3) |
| Product HIGH-1 | the fast test's blind spot on today's layout stated; `canvas-grid` added (§1, §2.2, §4.3) |
| Product HIGH-2 | PD-10; H reaches users whole via an integration branch; summary rewritten as an option (§0, §4.1) |
| Product HIGH-3 | state pairs for draft and stopped; aliasing rule; stopped and draft sentinels (§2.2, §5.1 C2, C7, C13) |
| Product HIGH-4 | PD-11; Riso example replaced (§2.2, §4.4) |
| Product HIGH-5 | PD-A1 in four parts; inherited-text leg restored; unthemed output across palette switches; timing as a trade-off (§2.8, §5.1 C6, C8) |
| Product MEDIUM-1 | contract test in three tiers; `decision` field on residuals (§2.4) |
| Product MEDIUM-2 | git-ignored lab folder; failing palettes render with a label; "viewed, not passing"; the "what you ask, what you get" line (§0, §3) |
| Product MEDIUM-3 | PD-12 with both timelines; canvas loop continues meanwhile (§4.1) |
| Product MEDIUM-4 | A3 described as visible in light mode; side-by-side gate; 42→8 table (§4.2) |
| Product MEDIUM-5 | PD-13, PD-14, PD-15; scope folded into PD-1; P0 edits only from answers (§4.2, §4.4) |
| Product MEDIUM-6 | `cocoa.json` holds values, spec holds rationale; ADR `:38` amended (§2.4) |
| Product MEDIUM-7 | P0 adds PRD checkpoint rows naming the tests and heavy entry points (§4.2, §5.2) |
| Product LOW-1 | §2.8 reference and 16 names; one count per snapshot; "passes floors in 1–3 h, looks right after review" (§0, §3) |
| Product LOW-2 | PD-0 leads the answer; PD-1 asks "when" (§0, §4.4) |
| Product LOW-3 | font reflow of accepted pages noted; no-font fixture page (§2.11, B1) |

This revision is non-certifying: there is no pull request, and nothing in the repo was built or run.
