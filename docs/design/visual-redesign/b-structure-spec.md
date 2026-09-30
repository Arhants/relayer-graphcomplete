# Prototype B · Surly "Sticker" — builder spec (gen 1)

Light-first, comfortable, playful. Pill "sticker" nodes on flat marshmallow paper, one rose ink for interaction,
selection and running, and **lime only when GraphComplete accepts**. Floating prompt card, inspector card and composer
bar. This file is the blueprint for B1–B6; the design brief (`research/12-design-brief-final.md` §6.2) wins over it
only where this file is silent. Generated tables come from `tokens.mjs`, `contrast.mjs` and `geometry.json`
(`node build-spec.mjs`).

## 0. How to use the kit

| File | What it is | How to use it |
|---|---|---|
| `kit.css` | tokens (`.theme-light`, `.theme-dark`) + every component class (prefix `b-`) | paste verbatim into `<style>`; add board rules **after** it; never fork a token |
| `fonts.html` | the one Google Fonts link (Bricolage Grotesque 600–700 opsz, DM Mono 400, Figtree 400/600) | paste into `<helmet>` |
| `sprite.html` | 59 exact Lucide 0.562.0 icons + `i-relayer-logo` (logo stand-in) | paste as the **first child of the root** |
| `geometry.json` | every node, label and edge in board px for the four graph scenes, plus region rects | copy numbers, never eyeball |
| `kit-demo.png` | the visual reference (both themes) | match it |
| `work/check-*.png` | scratch compositions of B2/B3/B4/B5 and the share landing built from this kit (validation only) | sanity reference, not a deliverable |

- **Root**: `<div class="b-root theme-light b-still" style="width: …px; height: …px; overflow: hidden; position: relative">`
  (`theme-dark` for dark boards). `b-root` sets fonts, 14/20 text, box-sizing and the page background.
  `b-still` pauses the running orbit and spinners at their designed first frame, so every screenshot is identical;
  keep it on B2–B6. B1's "Child running" specimen may drop it to show motion.
- **Icons**: `<svg class="ic ic-16" aria-hidden="true"><use href="#i-NAME"></use></svg>`. Sizes `ic-10/12/14/16/18/20/22`;
  `ic-fill` fills (invoked ▷). Stroke 1.75 at 16–22, heavier at 10–14 (built into the size classes).
- **Absolute layout** is allowed for boards (they are fixed comps). Region classes `b-d-*` (desktop), `b-w-*` (share
  web) and `b-p-*` (phone) carry the exact rects below; combine them with the component class, e.g.
  `class="b-prompt b-d-prompt"`.
- **DOM order = product and tab order** (brief §2.2, §2.3; `view.js`): sprite → sidebar → header → prompt card →
  (breadcrumb) → `b-canvas` → `b-frame` → `<svg class="b-edges">` → nodes / tokens → canvas overlays (tag, stamp, hint,
  zoom, key, tooltip) → composer → inspector. Share web: header → prompt → canvas… → download → details. Phone: header →
  download → prompt → canvas… → sheet. Keyboard and screen-reader users reach the title and the prompt before the graph.
- **Paint order comes from kit z-index layers, never from DOM order**: `b-canvas` 0 · `b-frame`, `b-edges` 1 · nodes,
  tokens, token label 2 · tag, stamp, hint, zoom, key, tooltip 3 · sidebar, header, prompt, inspector, composer,
  download, about, sheet, scrim 4 · popovers, dialogs 5 (a scrim sits after the panels it dims, before the sheet).
- **Boolean attributes**: write a truthy literal (`disabled="true"`, never a bare `disabled`: the renderer passes a bare
  attribute as `""`, which React drops) **and** keep the `is-disabled` class, so the look never depends on the attribute.
- **Edges**: one `<svg class="b-edges" style="width: Wpx; height: Hpx" aria-hidden="true">` at board (0,0) with one
  `<path class="…" d="…"></path>` per edge, both copied from geometry.json. All stroke styling is in CSS.
- **Frames and draft outlines** are SVGs whose `<rect>` is sized by CSS (no numbers to compute):
  `<svg class="b-frame b-d-frame" aria-hidden="true"><rect></rect></svg>` and, inside a draft node,
  `<svg class="b-node-dash" aria-hidden="true"><rect></rect></svg>`.
- The logo is a **stand-in**: artboards cannot embed the PNG, so `i-relayer-logo` is an inline-SVG trace (ink skater,
  deck `#D74326`) on the cream tile with a 1px ink frame. Production keeps the PNG unchanged (§2.8). It is not a redraw
  proposal; do not label it as one. Markup: `<span class="b-logo b-logo-40"><svg aria-hidden="true"><use href="#i-relayer-logo"></use></svg></span>`.

## 1. Tokens (final; both themes)

Brief values win; † = the brief changed `palettes.json`; **kit** = decided here because the brief is silent (reason in
§9). No brief token value was changed. `palettes.json` `raised` is `--field`; `focus-ring` is `--selection-ring`.
The palette's blue info (`#2A8EE7`) and its success solids are **not used** (B shows acceptance only in lime).

| Token | Light | Dark | Source | Use |
|---|---|---|---|---|
| `--bg` | `#FDFAEA` | `#100F0D` | brief | exact marshmallow in light; window first paint |
| `--sidebar` | `#FDFAEA` | `#161612` | brief |  |
| `--surface` | `#FDFDF9` | `#161612` | brief | floating cards, inspector, prompt card, composer |
| `--field` | `#F2F1EB` | `#1F1E1A` | brief | palettes.json `raised`; inputs, chips, Stop |
| `--overlay` | `#FDFDF9` | `#272620` | brief | popovers, dialogs |
| `--hover` | `#EBE9E2` | `#272620` | brief |  |
| `--selected` | `#E4E2DA` | `#2E2D27` | brief |  |
| `--border` | `#DBDAD2` | `#383731` | brief |  |
| `--border-strong` | `#888680` | `#76746D` | brief† | 3.22 / 3.24; input and Stop boundaries, layer frames |
| `--text` | `#1B1B17` | `#EFEEE9` | brief | also the focus ring |
| `--text-muted` | `#66655F` | `#BAB9B2` | brief | secondary text and placeholders |
| `--text-faint` | `#8C8B84` | `#706F68` | brief | disabled and decoration only |
| `--accent-solid` | `#E65979` | `#E65979` | brief | exact reel rose; large fills, running badge, update dot |
| `--accent-solid-text` | `#1B1B17` | `#100F0D` | brief |  |
| `--accent-solid-hover` | `#F66886` | `#F66886` | palettes |  |
| `--accent-solid-alt` | `#CE4365` | `#CE4365` | brief | Send, Download, primary buttons, comment badge |
| `--accent-solid-alt-text` | `#FFFFFF` | `#FFFFFF` | brief |  |
| `--accent-soft-bg` | `#FFE8EB` | `#38121A` | brief | selected sidebar row, Running pill |
| `--accent-text` | `#B13856` | `#FF9DAD` | brief | links, selected-row bar, Running pill + caption |
| `--selection-ring` | `#E65979` | `#E65979` | brief |  |
| `--running` | `#E65979` | `#E65979` | brief† | gene Q = accent |
| `--accepted-fill` | `#C1E357` | `#C1E357` | brief† | exact reel lime, a fill only |
| `--accepted-fill-text` | `#1B1B17` | `#100F0D` | brief† |  |
| `--accepted-mark` | `#7A9500` | `#C1E357` | brief | lime as a line; never on --field |
| `--canvas-bg` | `#FDFAEA` | `#100F0D` | brief | flat poster paper, no grid |
| `--edge` | `#8D8C86` | `#66645E` | brief† |  |
| `--edge-strong` | `#66655F` | `#B4B3AC` | brief† | incident edges of the selected node; hover stroke |
| `--node-fill` | `#FDFDF9` | `#1F1E1A` | brief† |  |
| `--node-stroke` | `#8D8C86` | `#706F68` | brief† |  |
| `--draft-outline` | `#8D8C86` | `#706F68` | brief | = --node-stroke, dashed |
| `--danger-solid` | `#B23B19` | `#FE8160` | brief | failed node outline |
| `--danger-strong` | `#B23B19` | `#C8502F` | brief | failed badge disc (white glyph) |
| `--danger-text` | `#BC4524` | `#FFA289` | brief |  |
| `--danger-soft-bg` | `#FFEBE6` | `#3A1C13` | brief |  |
| `--warning-solid` | `#C17A00` | `#D18500` | brief |  |
| `--warning-text` | `#996000` | `#FEA92F` | brief |  |
| `--warning-soft-bg` | `#FFEDD9` | `#352006` | brief |  |
| `--success-text` | `#4E6000` | `#ADCE3E` | brief |  |
| `--draft-solid` | `#726F5F` | `#726F5F` | brief |  |
| `--draft-text` | `#706D5D` | `#C2BEAC` | brief | working tag text, Draft caption |
| `--draft-soft-bg` | `#F1F0EB` | `#262521` | brief | working tag fill |
| `--diff-add` | `#4E6000` | `#ADCE3E` | brief† |  |
| `--diff-del` | `#BC4524` | `#FFA289` | brief† |  |
| `--ink` | `#1B1B17` | `#1B1B17` | brief | icon ink on family fills and on the rose running badge |
| `--white` | `#FFFFFF` | `#FFFFFF` | brief |  |
| `--cream` | `#FAF2E6` | `#FAF2E6` | brief | logo tile (§2.8) |
| `--deck` | `#D74326` | `#D74326` | brief | logo deck; used only inside the logo stand-in |
| `--sticker-bg` | `#FAF2E6` | `#161612` | kit | download / About card: cream sticker in light (brief), --surface in dark |
| `--scrim` | `rgba(27,27,23,.32)` | `rgba(0,0,0,.56)` | kit | behind dialogs |
| `--tl-close` | `#FF5F57` | `#FF5F57` | kit |  |
| `--tl-min` | `#FEBC2E` | `#FEBC2E` | kit |  |
| `--tl-zoom` | `#28C840` | `#28C840` | kit |  |
| `--tl-rim` | `rgba(0,0,0,.14)` | `rgba(0,0,0,.28)` | kit |  |
| `--focus` | = `--text` | = `--text` | brief | focus ring, always |
| `--stop-bg` / `--stop-glyph` | = `--field` / `--text` | = `--field` / `--text` | brief † | Stop is neutral (PRD) |
| `--halo` | = `--canvas-bg` | = `--canvas-bg` | kit | text halo + badge ring colour |
| `--shadow-card` | `0 1px 2px rgba(27,27,23,.06), 0 4px 16px rgba(27,27,23,.08)` | `none` | kit | prompt card, composer, zoom group, hint, download card |
| `--shadow-float` | `0 1px 2px rgba(27,27,23,.06), 0 12px 40px rgba(27,27,23,.12)` | `none` | brief | inspector (light); dark uses surface + border |
| `--shadow-lift` | `0 4px 12px rgba(27,27,23,.18)` | `none` | brief | selected pill lifts (light only) |
| `--shadow-pop` | `0 2px 4px rgba(27,27,23,.06), 0 16px 48px rgba(27,27,23,.16)` | `0 16px 48px rgba(0,0,0,.5)` | kit | popovers, dialogs, sheets |

**Family colours** (solid 28px disc; icon colour as printed; ratio = icon on disc). Classes `.f1…f6`/`.fn` set
`--fam` / `--fam-ink` on a node, token, legend dot or inspector heading.

| Family | Class | Light disc / icon (icon on disc) | Dark disc / icon (icon on disc) | Scene node | Legend icons |
|---|---|---|---|---|---|
| F1 Document | `.f1` | `#5D2DAE` / `#FFFFFF` (8.56) | `#AB8EFF` / `#1B1B17` (6.62) | N1 scroll-text, N2 file-text | scroll-text, file-text |
| F2 Code | `.f2` | `#006D92` / `#FFFFFF` (5.83) | `#72D1FF` / `#1B1B17` (10.10) | (git-compare in the invoke card) | code, git-compare |
| F3 Data | `.f3` | `#00A486` / `#1B1B17` (5.47) | `#009D81` / `#1B1B17` (5.05) | N5 database-backup | database-backup, table |
| F4 Systems | `.f4` | `#826D00` / `#FFFFFF` (5.08) | `#CFAF00` / `#1B1B17` (8.05) | N6 key | key, server |
| F5 People & agents | `.f5` | `#D665CF` / `#1B1B17` (5.45) | `#B545AE` / `#FFFFFF` (4.74) | N4 users | users, bot |
| F6 Reasoning | `.f6` | `#596AE8` / `#FFFFFF` (4.51) | `#596AE8` / `#FFFFFF` (4.51) | N3 route | route, brain |
| Neutral | `.fn` | `--field` disc + 1px `--border` / `--text-muted` icon | same | — | info, link |

## 2. Type, spacing, radius, elevation

| Role | Font | Size / line-height / weight | Where |
|---|---|---|---|
| Share title | Bricolage Grotesque | 32/36/700, −0.01em | B4 header (28/32 in the 720 landing frame) |
| Sheet heading | Bricolage | 28/32/700 | B1/B6 section titles |
| Node Details title | Bricolage | 20/26/600 | inspector, phone sheet, dialogs (`b-dialog-title`) |
| Wordmark | Bricolage | 20/24/700 | sidebar brand |
| Thread title | Bricolage | 16/20/600 | desktop header, phone header, download-card title (700) |
| Stamp | Bricolage | 16/20/700 | lime "Accepted" stamp |
| Body (inspector, markdown) | Figtree | 14/1.55 (21.7)/400 | desktop; phone sheet body 16/1.55 |
| UI base | Figtree | 14/20/400 and 600 | rows, buttons, node titles (600), prompt (14/20, 2-line clamp) |
| Secondary | Figtree | 13/18/400–600 | scope line, meta line, pills in inspector, labels, pager |
| Micro / captions | Figtree | 12/16/600 (uppercase micro-labels +0.06em) | section labels, node captions, status pills, badges' counts |
| Mono | DM Mono | 12/16/400 | branch, ⌘N kbd, approval scope, hex values |

Scale **12/13/14/16/20/28/32** (7 sizes; 32 only for the share title). Floor 12 everywhere in B (the brief's 11px kind
caption becomes 12, B's micro size). Weights 400/600 + display 700 (Bricolage 600 for headings). There is no 500:
the zoom % is 12/600 tabular.

**Spacing**: 4px grid — 4, 8, 12, 16, 20, 24, 32, 48. Every rect below is on it except where a 1px border is absorbed
(paddings are written as `n − 1px` so outer sizes stay on grid).
**Radius** (B family 10/16/24/999 + the brief's 20): **10** rows, inputs, icon tiles, tooltips, turn and option rows,
URL field, swatches; **16** invoke card, detail-tier node, share header, popovers, B1/B6 frames and cells; **20** prompt
card, download and About sticker cards (brief §6.2); **24** inspector, composer, approval dock, dialogs, working frame,
sheet top; **999** pills, buttons, nodes, chips, kbd. The logo stand-in's tile radius scales with its size (7/8/10/16)
as part of the brand asset.
**Elevation**: light = soft shadows (`--shadow-card` for small floating chrome, `--shadow-float` for the inspector and
composer, `--shadow-pop` for popovers/dialogs/sheet, `--shadow-lift` for the selected pill). Dark = no shadows; every
floating card is `--surface` (lighter than the page) + 1px `--border` (brief).

## 3. Components (sizes)

| Component | Class | Size / anatomy |
|---|---|---|
| Traffic lights | `b-traffic` | three 12px dots, 8px gap, first dot at (20,16); rim 0.5px |
| Sidebar | `b-sidebar` | 248 wide, padding 0 12 12, 1px `--border` right |
| Brand row | `b-brand` | 40 tall, 4px below titlebar; logo 28 + 10 gap + wordmark |
| New thread | `b-newthread` | 40 tall pill, `--surface` + 1px border + `--shadow-card`; plus 16 in `--accent-text`; `⌘N` kbd chip right |
| Section label | `b-section` | 28 tall, 12/600 uppercase, 12px above |
| Sidebar row | `b-row` | 36 tall, radius 10, padding 0 12; hover `--hover`; selected `--accent-soft-bg` + 600 + 3px `--accent-text` bar (16 tall, 4px inside the fill's straight edge); focus 2px `--text` ring offset 2 |
| Project row | `b-row b-row-project` | chevron 16 at padding 8, name 14/600 at +28; compose button (`square-pen`, 28) visible on hover/focus only (`visibility`, no shift) |
| Nested thread | `b-row b-row-nested` | text starts at +28 (aligned with project name) |
| Sidebar marks | `b-mark is-running/approval/failed` | 12px `loader-circle` / `hand` / `octagon-x`, right end; colours `--accent-text` / `--warning-text` / `--danger-text` |
| Footer | `b-side-footer` | 1px top rule, 12 gap; Settings row + Account 32 icon button + update 32 (24 rose disc, ink `arrow-down` 14) |
| Buttons | `b-btn` + `-primary/-secondary/-ghost/-danger` | 36 tall pill, padding 0 16, 14/600; `-sm` 32 / 13px; `-lg` 40; disabled `--field` + `--text-faint` |
| Icon button | `b-iconbtn` | 32 circle (`-28/-36/-44`), `--text-muted`, hover `--hover` |
| Send / Stop / Stopping | `b-send`, `b-stop`, `b-stop is-stopping` | 36 circles; Send rose alt + white `arrow-up` 18; Stop `--field` + 1px `--border-strong` + **10px** `--text` square; Stopping adds a 24px ring (2px, `--border` with a `--text` quarter) spinning 0.9s, disabled + `aria-busy` |
| Status pill | `b-status is-…` | 28 tall, padding 0 12 0 10, glyph 12, gap 6, 12/600 (§5) |
| Prompt card | `b-prompt` | 64 tall, radius 20, padding 12 16 12 20 (outer), `--surface` + 1px border + card shadow; text 14/20 2-line clamp; controls gap 8 |
| Connected-nodes pill | `b-ctx` | 28 tall, 1px `--border-strong` (solid), `command` 14 + count 13/600 |
| Pager | `b-pager` | 32 tall `--field` pill: prev 32 · "Turn N of M" 13/600 tabular (6px side padding) · next 32 (disabled = faint) |
| Working frame | `b-frame` | 1.5px `--border-strong`, dash 8/6, radius 24; `is-solid` for retained layers |
| Layer tag | `b-tag is-working` / `b-tag` / `b-tag is-failed` | 28 tall pill, 13/600, glyph 14 (`circle-dashed` / `.b-sq` / `octagon-x` in `--danger-text`), 1px `--border` |
| Accepted stamp | `b-stamp` | 32 tall lime pill, Bricolage 16/700 ink, `check` 16 (stroke 2.75), 1.5px `--accepted-mark` rim, rotate −4°, card shadow |
| Hint pill | `b-hint` | 28 tall, padding 0 1 0 12, 12/400 muted, dismiss 24 (× 12, concentric with the pill end) |
| Zoom group | `b-zoom` | 36 tall pill: − 34 · % 44 (12/600 tabular) · + 34 · sep · Fit 44 (13/600) · sep · `locate-fixed` 34 = **194** wide; `is-touch` = 46 tall so every item is 44×44 inside the 1px border (224 wide) |
| Family key | `b-key` | 32 tall pill, items gap 16: 12px `--fam` dot + name 12 muted |
| Key button (phone) | `b-keybtn` | 44 hit area, 32 visual pill, `shapes` 14 + "Key" 13/600 |
| Inspector | `b-inspector` | radius 24, `--surface`, 1px border, float shadow; sections below |
| Environment row | `b-env` | collapsed disclosure, ONE 40px row + 1px rule (round 4): chevron 16 · "Environment" 13/600 · right `+16` `−33` (diff tokens) · "Local snapshot" 12 muted. Branch and untracked count sit behind the disclosure and in the tooltip; `.b-env-line` detail lines appear only in the stale / expanded specimens (B6) |
| Node Details head | `b-insp-head` | 44 tall: micro-label "Node details" + close × 32 |
| Heading | `b-nd-head` | family disc 40 (22 icon) + kind 12 muted + title Bricolage 20/26/600 |
| Markdown | `b-md` | 14/1.55; p→ul 8; li gap 4; bullets `--text-muted` |
| Action pill | `b-apill` | 32 tall, 1px `--border-strong`, 13/600 + `chevron-right` 14 (44 tall in the phone sheet) |
| Invoke card | `b-invoke [is-disabled]` | radius 16, padding 12, 32 icon tile, title row "▷ 12 + 14/600", description 13 muted; disabled = `--field`, title muted, description + ▷ faint |
| Input | `b-field` > `b-label` + `b-input` | label 13/600, 6 gap, field 40 tall radius 10 `--field` + 1px `--border-strong`, placeholder `--text-muted`; states `is-focus`, `is-staged`, `is-invalid` (2px `--danger-solid`), `is-locked`; help `b-help [is-error]` 12 |
| Attach context | `b-plus` | 36 circle, 1px `--border-strong`, plus 18; always the last action |
| Composer | `b-composer` | 56 tall, radius 24, padding 0 10 0 20 (outer), input 14 placeholder muted, model button, Send/Stop |
| Model button | `b-model` | 36 tall `--field` pill, 13/600, chevron-down 14, max 240 |
| Composer chips | `b-chip` / `b-chip is-input` | 28 tall, solid / **dashed** 1px `--border-strong`; count bubble 18 |
| Approval dock | `b-approval` | replaces the composer (same x/width, grows upward from y 888): radius 24, padding 16 20; hand disc 36; eyebrow 12/600 caps `--warning-text`; title 16/600; reason 14 muted; scope DM Mono 12 on `--field`; Deny / Approve once (secondary) / Approve always + "this session" (primary) |
| Share header | `b-share-head` | radius 16, padding 12 20: title + meta (`eye` 14 + 13 muted) |
| Download card | `b-download` | radius 20, `--sticker-bg` (cream light / surface dark), padding 16; logo 40 + title/pitch; Download primary full width 36 |
| About card | `b-about` | radius 20, `--surface`; "About this snapshot" Bricolage 16/700 |
| Phone sheet | `b-sheet` | radius 24 top, handle 36×4 (`--border-strong`) 8px from top, `--shadow-pop` |
| Popover | `b-pop` | radius 16, padding 6, `--overlay`, 1px border, pop shadow |
| Turn row | `b-turnrow [is-current]` | **52** tall, radius 10: glyph 16 · prompt first line 13/600 + "Turn N · State" 12 muted · right chip (lime `b-limechip` for Accepted; neutral `b-status` otherwise); current = `--selected` + 3px bar (4px inside); every row has the same anatomy (caption "Turn N · State" + a 22px chip) |
| Model picker | `b-picker` + `b-tabs` + `b-option` | 360 wide; tabs 32 (`--field`, selected tab `--surface` + border); option rows ≥ **44**: name 14/400 + "Codex" 12 muted; the selected row = `--selected` fill + 3px `--accent-text` leading bar (left 4, 16 tall) + name 600 + `check` 16 `--accent-text` (brief §2.5; same rule on the New-thread permission menu) |
| Dialog | `b-dialog` | 480 wide, radius 24, padding 24, gap 16; title Bricolage 20/26; text 14/1.5 muted; actions right; URL field 44 tall DM Mono 13 |
| Settings row | `b-setting` + `b-segmented` | ≥ 64 tall, bottom rule; segmented 36 tall, items 32 with sun / moon / sun-moon 14 |
| Swatch / spec helpers | `b-swatch`, `b-spec`, `b-cell`, `b-sheet-h`, `b-sheet-h2` | B1/B6 only |

## 4. Nodes and edges (Sticker)

**Card tier (0.6–1.4×)** — `b-node` root is the pill box (left/top/width from geometry.json, height 36):
pill radius 999, `--node-fill`, 1.5px `--node-stroke`; 28px family disc inset 4 (centre = left cap centre); 18px icon;
title 14/20/600 from x+40, one line, ellipsis; right padding 16 (12 when `›N` is present). Width = content, max
**248**. Anchor = pill centre.

- **Opens a layer**: `has-peek has-more` + `<span class="b-node-peek">` (a second pill 3px lower and 3px right, behind, so the stack shows on two edges) +
  `<span class="b-node-more">chevron-right 12 + N</span>` inside the right end (6px after the title, 12/600 muted).
- **Badges**: 16px discs centred on the pill box's exterior corners with a 2px `--halo` ring, painted above the
  selection ring (the halo cuts it): TL actions (`b-badge-tl`; two actions → invoke `b-badge-tl` on the corner and input
  `b-badge-tl2` 4px to its right along the top edge, left 12 / top −8, so both sit on the outline), TR comments, BR
  lifecycle, BL attached. Glyphs 10px; the input glyph is `text-cursor` with `ic-thin` (stroke 2.25, so the serifs
  read as a cursor, not a capital I): `text-cursor-input`'s box does not survive 10px.
- **Captions** (card tier): `b-node-cap`, 12/16/600 at x+40, 6px below the footprint (below the peek when present),
  halo. Running `--accent-text`, Draft `--draft-text`, Stopped `--text-muted`, Failed `--danger-text`.
- **Detail tier (> 1.4×)**: `is-detail`, 280×72 max, radius 16: disc top-left, family micro-label ("DOCUMENT"),
  title 14/18 up to 2 lines, `›N` bottom-right.
- **Overview tier (< 0.6×)**: `b-token`, the 28px disc only (18 icon), no labels except the **selected** node
  (`b-token-label`, 13/18/600 + halo, centred **above** the token); lifecycle badge (BR of the disc box) and draft
  ring survive; action/attached/comment badges and the peek are dropped. Tap-to-reveal tooltip: `b-tooltip` (32 tall,
  13/600, radius 10) + `b-tooltip-caret`, above the token, clamped to a 16px gutter.

| State | Class(es) | Treatment |
|---|---|---|
| Default (solid) | — | solid pill, no mark |
| Hover | `is-hover` | outline (and peek) → `--edge-strong` |
| Selected | `is-selected` | 2px `--selection-ring` at a 2px gap around the pill only (`::after`; the peek tucks under it); pill lifts with `--shadow-lift` (light only); fill unchanged |
| Focus | `is-focus` (specimen) and real `:focus-visible` | 2px `--text` ring at a 2px gap; with `is-selected` it moves outside the selection ring (6–8px); pill only, like selection. Nodes and tokens drop the generic box outline so keyboard focus never paints over the selection ring |
| Draft | `is-draft` + `b-node-dash` svg | body = `--canvas-bg` (hollow), 1.5px `--draft-outline` dashed 4/3, disc keeps its colour; caption "Draft" |
| Child running | `is-running` + `b-orbit` svg + BR `b-badge is-running` (`loader-circle`) | one rose 90° arc (r 23 around the disc, 3px, round caps, dash 36.1/108.4; 3.5px clear of the pill outline, so it never reads as a partial 2px selection ring) orbiting 1.4s linear; static phase 6 → 9 o'clock (clear of the title and of a neighbour above); caption "Running" |
| Child running, reduced motion | add `is-reduced` (or omit the orbit svg) | badge + caption only |
| Child stopped | `is-stopped` + BR `b-badge is-stopped` (`<i class="b-sq">`) | disc keeps its colour; caption "Stopped" |
| Child failed | `is-failed` + BR `b-badge is-failed` (`octagon-x`) | 2px `--danger-solid` outline; caption "Failed"; the only red on the canvas |
| Invoke ready / invoked / retry | TL `b-badge` with `play` / `play ic-fill` / `refresh-cw` | Retry only after an unresolved invocation, never while a turn runs |
| Asks for input unanswered / answered | TL `b-badge` / `b-badge is-answered` with `text-cursor` (`ic-thin`) | answered = inverted disc (`--text` fill) |
| Attached as context | BL `b-badge` + `paperclip` | |
| Comments N (Eval) | TR `b-badge is-comments` | rose-alt disc, white 12/600 count |

**Edges**: each layer draws its edges in the shape its agent chose (PRD §6.1, §11.2); the design's default, `arc-outward`, is gentle circular arcs, sagitta = 0.12 × chord capped at 24px (at zoom 1), bowing **away from the layer's centre** (the centre of its authored positions, so dragging a node never reshapes an edge it is not on; revised for #616 so an edge draws the same from either endpoint);
1.5px `--edge`, round caps, non-scaling; clipped 4px outside every drawn shape of both end nodes (pill, peek, badges,
caption, and the selection ring when selected). `b-edge-draft` = dashed 4/3 with butt caps; `b-edge-strong` = 2px
`--edge-strong` for the selected node's incident edges; `b-edge-dim` (40%) exists for the B1 specimen only — B's
scenes do not dim non-neighbours. Midpoint comment badge: `b-badge is-comments b-edge-badge` at the edge `midpoint`.

## 5. Status pills (8 turn states)

| State | Class | Glyph | Fill / text |
|---|---|---|---|
| Waiting | `is-waiting` | `hourglass` (muted) | `--field` + 1px `--border` / `--text` |
| Running | `is-running` | `loader-circle` (spins 1.4s) | `--accent-soft-bg` / `--accent-text` |
| Needs approval | `is-approval` | `hand` | `--warning-soft-bg` / `--warning-text` |
| Stopping… | `is-stopping` | `b-stopping-glyph` (■ in a spinning ring) | neutral |
| Stopped | `is-stopped` | `<i class="b-sq">` ■ | neutral; the stopped notice ("Stopped. Send a follow-up to continue.", `b-notice`) uses the same `--text` |
| Failed | `is-failed` | `octagon-x` | `--danger-soft-bg` / `--danger-text` |
| Cancelled | `is-cancelled` | `ban` | neutral, muted text |
| Accepted | `is-accepted` | `check` (2.75) | **lime** `--accepted-fill` + 1px `--accepted-mark` rim / ink — the only lime pill |

## 6. Boards

All rects are `x, y, w, h` in board px. Where a rect is given, draw exactly that.

### B2 Desktop dark / B3 Desktop light (1440×900) — identical geometry

| Region | Rect | Markup / content |
|---|---|---|
| Canvas | 248, 44, 1192, 856 | `b-canvas b-d-canvas` (flat paper, no grid; runs under the floating cards) |
| Fit rect (not drawn) | 248, 116, 828, 716 | the area the floating panels leave uncovered; Fit padding 48 → **105%** |
| Working frame | 260, 128, 804, 692 | `b-frame b-d-frame` dashed |
| Working tag | 280, 140, 202, 28 | `b-tag is-working b-d-tag`: `circle-dashed` + "Working · not yet accepted" |
| Nodes + edges | geometry.json `desktop` | N1 selected (+ peek ›2, TL invoke + input discs), N2 peek ›1 (title truncates), N3 running, N4 draft + dashed edge, N5 stopped, N6 failed |
| Hint pill | 280, 776, 418, 28 | `b-hint b-d-hint`: "Scroll or pinch to zoom · Drag canvas to pan · Drag nodes for this view" + dismiss |
| Zoom group | 858, 772, 194, 36 | `b-zoom b-d-zoom`: −, "105%", +, Fit, recenter |
| Sidebar | 0, 0, 248, 900 | `b-sidebar b-d-sidebar` |
| · Traffic lights | dots at (20,16), (40,16), (60,16), 12px | `b-traffic` inside `b-titlebar` (0..44) |
| · Collapse toggle | 84, 6, 32, 32 | `b-iconbtn b-collapse`, `panel-left` 18, aria-label "Collapse sidebar" |
| · Brand | 12, 48, 224, 40 | `b-brand`: logo 28 at x 24 + "Relayer" |
| · New thread | 12, 96, 224, 40 | `b-newthread`: plus · "New thread" · kbd "⌘N" |
| · CHATS | 12, 148, 224, 28 | `b-section` "Chats" |
| · Chat rows | 12, 176 / 212 / 248 / 284, 224, 36 | Graph search design · Product idea · Show the deterministic task system. (truncates) · Stop and retry |
| · PROJECTS | 12, 332, 224, 28 | `b-section` "Projects" |
| · Project rows | 12, 360 → 576 in 36 steps | ▾ relayer-graphcomplete · **Lantern launch readiness** (`is-selected`, Running mark) · Environment rail verification · Send-to-display flow (Failed mark) · ▾ h3 · h3 · status-code sanitization (Needs approval mark; truncates) |
| · Footer | 12, 852, 224, 36 (rule at y 840) | Settings row · Account 32 · update 32 (rose dot, aria-label "Application update available. Open update details") |
| Header | 248, 0, 828, 44 | `b-header b-d-header`: Back 32 at x 260, Forward 32 at x 296 (disabled at the end of history), title "Lantern launch readiness" at x 340, scope "relayer-graphcomplete · Ask for approval · Codex Basic" 12px after it, ••• 32 at x 1032 |
| Prompt card | 260, 52, 804, 64 | `b-prompt b-d-prompt`: prompt text x 280, ≈460 wide, 2 lines; right cluster ends at x 1048: `b-ctx` "⌘ 1" (44) · pager "Turn 3 of 3" (next disabled, ≈139) · Running pill (85) |
| Inspector | 1088, 12, 340, 808 | `b-inspector b-d-inspector`: **fixed height** (brief §6.2), top inset 12 → 12 above the composer (y 820) |
| · Environment | 1088, 12, 340, 41 | `b-env` (40 + 1px rule) |
| · Node details head | 1088, 53, 340, 44 | `b-insp-head` |
| · Body | 1089, 98, 338, 452 (scrolls) | `b-insp-body` (round 5: gap 12), overflow clipped at the dock: heading (42) · 12 · authored sheet 156–466 (310: lead 3 lines, sticker trail 64, 7-device strip with hung labels 84, 12% note) · 12 · actions (gap 8): pills row 478–510 · invoke card disabled 518–580 · Review note + **+** inline (`b-field-plus`, 64). At scroll 0 the fold (y 550) falls between the invoke card's title and its description; 570 of content; `b-scrollthumb b-d-thumb` 6×354 at y 89 (scroll top) |
| · Annotation dock | 1089, 550, 338, 269 | `b-dock-annot` (33.333%, 1px `--border` top rule): micro-label "Annotation" · `b-input b-dock-field` "Add an annotation…" (flex, ≈176) · `b-dock-actions` × Discard / ✓ Confirm (disabled while empty), right-aligned. Open because N1 is attached as context (⌘ 1) |
| Composer | 282, 832, 760, 56 | `b-composer b-d-composer`: input "Follow up…" (disabled, placeholder muted) from x 302 · model "Codex · GPT-6-Sol" (addendum §E) · Stop 36 at x 996 |

Dark and light differ only by the root class. No popover is open.

### B4 Share viewer, web (1440×900, light)

| Region | Rect | Content |
|---|---|---|
| Canvas | 0, 0, 1440, 900 | full-bleed paper; Fit rect 16, 184, 1056, 700 → **125% (capped from 138%)** |
| Header ("thin public bar") | 16, 16, 1056, 80 | `b-share-head b-w-header`: "Lantern launch readiness" 32/700 + meta `eye` "Read-only snapshot · Shared Sep 27, 2026 · relayer-graphcomplete" |
| Prompt card | 16, 108, 1056, 64 | `b-prompt b-w-prompt`: Turn-3 prompt (fits 2 lines) · `⌘ 1` · pager "Turn 2 of 2" · **Accepted** pill |
| Accepted stamp | 16, 196 (126×32, rotated −4°) | `b-stamp b-w-stamp` |
| Nodes + edges | geometry.json `share-web` | all default (solid); N1 selected; N1/N2 keep the peek + ›N; N3–N4 solid; **no** action badges on the canvas |
| Family key | 16, 852, ≈404×32 | `b-key b-w-key`: Document · Data · Systems · People · Reasoning |
| Zoom group | 878, 848, 194, 36 | `b-zoom b-w-zoom`, "125%": bottom-right of the uncovered canvas (right edge 1072), level with the family key; the right column below the download card belongs to Node Details |
| Download card | 1084, 16, 340, 120 | `b-download b-w-download`: logo 40 · "Relayer for Mac" · "Explore this thread, then build your own." · Download (primary, full width) |
| Node Details | 1084, 148, 340, 616 | `b-inspector b-w-details` (hugs its content, ends y 764; max 736): head + heading + the authored N1 sheet (light) + pills + invoke card (disabled) + Review note (`is-locked`, disabled), all inside the card with 16 bottom padding; **no** Environment, **no** +, no scroll |

### B5 Share viewer, phone (390×844, dark)

| Band | Rect | Content |
|---|---|---|
| Safe area | 0, 0, 390, 47 | empty page colour (no fake status bar) |
| Header | 16, 47, 358, 48 | title Bricolage 16/20/600 one line + meta 12/16 muted (ellipsis at "…graphcomple…" is expected) |
| Download card | 16, 103, 358, 56 | `b-download` row, radius 16: logo 28 · "Relayer for Mac" (16/700) · Download 36 visual inside a 44 hit area; no pitch |
| Prompt card | 16, 167, 358, 76 | prompt 15/20 2-line clamp (≈184 wide: "…credential rotation on…"), gap 4 + pager: two 44×44 chevron buttons around "Turn 2 of 2" (13/600, no padding), no overlapping hit areas; card right padding 0 |
| Graph | 0, 251, 390, 377 | canvas continues under the sheet; Fit padding 16 → **51%, overview tier** |
| Key button | hit 16, 263, 76, 44 (visual 32) | `b-keybtn b-p-key` |
| Accepted stamp | right 16, top 269 (level with the Key button) | `b-stamp b-p-stamp` |
| Tokens | geometry.json `phone` | N1 selected with its label above; tooltip specimen over N4 ("Named owners, weeks 1–6") |
| Zoom group | 150, 570, 224, 46 | `b-zoom is-touch b-p-zoom`, "51%"; right edge on the 16px gutter, 12 above the sheet |
| Sheet (peek) | 0, 628, 390, 216 | `b-sheet b-p-sheet`: handle at y 636; heading at y 652 (disc 40, "concept", title 20/24); 12 gap; the authored sheet (dark) from y 704: lead (3 lines, 717–777) and the top of the sticker trail (labels 789–805), faded out over 786–810 by a Relayer-owned fold (`b5-fold`); y 810–844 home-indicator zone plain `--surface` |

The page is `100dvh` / `touch-action: pan-y` in production; nothing to draw. Hint hidden below 480px.

### B6 Secondary states (1440 × 3998; round-4 layout in "Round 4" below)

Columns: C1 x 20 (390), C2 x 434 (480), C3 x 938 (480). Every specimen has a 12/600 muted caption 20px above it
(§4.5 names). Frames are real-size, radius 16, 1px `--border`, own theme class.

| # | Specimen | Rect | Theme | Notes |
|---|---|---|---|---|
| 1 | Turn popover frame | 434, 48, 480, 400 | dark | a copy of the prompt card (440 wide) at the top; `b-pop` 400 wide under the pager with 3 `b-turnrow`s (52 each): Turn 1 · Accepted (lime chip), Turn 2 · Stopped (neutral chip), Turn 3 · Running (rose chip, **current**) |
| 2 | Model picker frame | 434, 492, 480, 440 | light | `b-pop b-picker` above a composer copy: tabs Model/Advanced, family "Codex", rows GPT-5.6-Sol · **GPT-5.6-Terra ✓** · GPT-5.6-Luna · Daybreak Blue · GPT-5.5 (caption "Codex", 44 min) |
| 3 | Phone sheet expanded | 20, 48, 390, 844 | dark | same phone chrome; sheet at 85% = top y 127 (717 tall) with N1's full Node Details (actions 44 tall, input locked, no +); the redaction line is the sheet footer (1px rule, pinned 8 above the 34px home-indicator zone); header title 16/20 as on B5 |
| 4 | Share landing | 20, 964, 720, 450 | light | geometry.json `share-landing` + regions: header 28/32, prompt card "Turn 1 of 2" (Turn 1 prompt) + Accepted pill, stamp (28,192), N1 alone at **125% (cap)**, key "Document", zoom (206, 386), About card 424, 180, 280 × ≈251: title + meta "Shared Sep 27, 2026 · relayer-graphcomplete" (12 muted), redaction line, 16 to the rule, download row, Download |
| 5 | Share dialog steps | light 938, 48 → stacked, 16 gap; dark 938, below | both | `b-dialog`, copy exactly from `research/03-share-viewer.md` lines 210–216: **Share this thread** (lead, field "Share title", "Required" + "0/120", redaction note, Cancel · Create link disabled) · **Creating link…** (lead + progress bar + "This step cannot be cancelled.") · **Link ready** + × (DM Mono URL `https://app.relayerlabs.ai/t/` + 32 hex — illustrative — + Copy primary; caption "Read-only snapshot · known secrets and paths removed") · **We couldn’t create the link** (lead + "Reference" + mono `SHR-…`; Close · Retry) · **Daily share limit reached** ("You can share again after {local date-time}", date illustrative; Close) |
| 6 | Settings › Appearance | 20, 1446, 890, ≈200 (light) and 20, 1670 (dark) | both | heading "Appearance"; row "Theme" / "Choose how Relayer looks on this computer." + `b-segmented` Dark · Light · System (System = [PD]) |
| 7 | New-thread view | 20, 1894, 890, ≈540 | light | logo 64 hero, "What are we working on?", composer "Ask Relayer to investigate, design, or build something…", folder control (`folder-open`), permission picker menu open: Ask for approval / Approve for me / Full access + "filesystem and network access are not hard-confined", model button, Send disabled |
| 8 | Secondary-states strip | light 20, 2466, 690, ≈1400; dark 730, 2466 | both | one compact specimen each (§4.5 item 8), stacked with 24 gaps |

### B1 System sheet (1440 × 3992; round-4 layout in "Round 4" below)

Page = light paper. Theme pairs sit in two panels: light x 32, dark x 728, each 680 wide (`b-cell`-style panel,
radius 24, padding 24 → 632 content). Target rows (compress R1/R6 first if you run long; never exceed 4000):

| Row | y (target) | Content |
|---|---|---|
| R0 header | 32, h 200 | "B · Surly “Sticker”" (32/700), the §6.2 hypothesis (16/1.5, ≤ 720 wide), reel chips 72px discs #FDFAEA / #E65979 / #C1E357 with name + hex, logo 64 on the light page and on a dark (#100F0D) tile |
| R1 tokens | 256, h 560 | **one full-width grid of split swatches** (left half light value, right half dark value; 128 wide, 10 per row) grouped: surfaces, text, borders, accent + selection + focus, running + lime, status, graph, diff — label: name, both hexes, key ratio |
| R2 type · spacing | 840, h 340 | type specimen (§2 table rendered with §3.4 strings; show the 12px floor) left; 4px grid bar, radius family, elevation light vs dark right |
| R3 state matrix + badges | 1204, h 720 | light / dark panels: 10 states in 2 columns (cells 310×76, node "Offline recovery covenant" 224 wide); badges: N1-like node with TL pair + TR comments 3 + BL attached, N2-like node with ›2, then a row of isolated badges (invoke ready / invoked / retry / input / answered / attached / comments) with 12px labels |
| R4 anatomy + family legend | 1948, h 300 | overview token, card pill, detail card; F1–F6 + Neutral with two icons each, plus a greyscale copy (`filter: grayscale(1)`) proving the icon carries identity |
| R5 frames · pills · edges | 2272, h 320 | working / stopped / failed / accepted-final frames as 300×64 mini canvases (radius 16; tag at 12,12; a two-dot layer mark with one arc; accepted = paper, no frame, stamp + "No frame"; 160 wide cannot hold the 204px working tag); the 8 status pills; edge specimens incl. midpoint comment badge |
| R6 controls | 2616, h 520 | buttons, Send/Stop/Stopping, inputs + placeholder, model button, chips, approval dock, sidebar rows (default, hover, selected, focus, collapsed ▸ h3, three marks) |
| R7 OG image | 3160, h 340 | ONE branded image for every share (a per-share title in the image is a product decision, 03 §4): 1200×630 drawn at 600×315 inside a light and a dark unfurl frame. Marshmallow ground; logo tile + "Relayer" wordmark (Bricolage 700) left; three 56px family discs as stickers (F1 scroll-text, F6 route, F3 database-backup, ±4° tilt) and the lime "Accepted ✓" stamp right; all inside the centred 600×300 safe area. Unfurl text below the image: og:title "Lantern launch readiness", og:description "relayer-graphcomplete" (no rounded left-bar cards) |
| R8 contrast + decisions | 3524, h 420 | key-pair contrast table (from §8 below, ~16 rows per theme); "Product decisions shown here" box; "Test pins this prototype breaks" box |

Key pairs for R8: text on bg / surface / field / selected row; muted on bg / field; accent-text on rose-soft; white on
`#CE4365`; ink on lime; draft-text on draft-soft; edge / node-stroke / border-strong on canvas; selection ring on
canvas; running arc on pill fill; family discs min (F6 on pill fill); focus ring on selected row.

## 7. Geometry (from geometry.json)

Projection: `graph-layout.js` unchanged (960×640 world, 32 world padding + the largest node `layoutBounds`).
B's `layoutBounds` = the pill box, measured at card tier like today's `offsetWidth/offsetHeight`
(`{halfWidth: w/2, top: 18, bottom: 18}`); peek, badges, caption and ring overflow the element like today's
annotation badge. Fit = today's `fitGraphCamera` (per-node bounds, centred) with padding 48 (desktop, web) / 16
(< 480px) and **capped at 1.25×**. Nodes, labels and badges are screen-constant; only anchors scale.

#### desktop — Fit 105% (1.052), card tier
Canvas {x:248,y:44,w:1192,h:856,note:graph stage, full-bleed under the floating prompt card, inspector and composer}; Fit rect 248, 116, 828×716, padding 48. Problems: none.
Closest pair: N1/N3 6.1px.

| Node | Anchor | Pill / token box (x, y, w, h) | Caption / label box | Badges |
|---|---|---|---|---|
| N1 Offline recovery covenant | 595, 298 | 472, 280, 246, 36 | — | tl invoke; tl2 input |
| N2 Constrained recovery revision (truncates) | 582, 582 | 458, 564, 248, 36 | — | — |
| N3 Red-team stop condition | 800, 343 | 692, 325, 216, 36 | 732, 367, 45, 16 | br running |
| N4 Named owners, weeks 1–6 | 909, 537 | 796, 519, 226, 36 | 836, 561, 29, 16 | — |
| N5 Last-known-good build | 745, 650 | 642, 632, 206, 36 | 682, 674, 47, 16 | br stopped |
| N6 Stale permission grants | 404, 423 | 301, 405, 206, 36 | 341, 447, 33, 16 | br failed |

| Edge | Class | `d` |
|---|---|---|
| N6–N1 | `b-edge b-edge-strong` | `M 418.2 401 A 251.5 251.5 0 0 1 507.9 324` |
| N6–N2 | `b-edge` | `M 413.7 445 A 262.9 262.9 0 0 0 525.8 560` |
| N1–N3 | `b-edge b-edge-strong` | `M 725.7 302.1 A 231.2 231.2 0 0 1 768.1 321` |
| N2–N5 | `b-edge` | `M 607.6 607 A 194.6 194.6 0 0 0 647.3 632` |
| N3–N4 | `b-edge b-edge-draft` | `M 828.3 365 A 245.1 245.1 0 0 1 907.1 515` |

#### share-web — Fit 125% (1.25, capped from 1.38), card tier
Canvas {x:0,y:0,w:1440,h:900,note:full-bleed paper behind the floating header, prompt card and right column}; Fit rect 16, 184, 1056×700, padding 48. Problems: none.

| Node | Anchor | Pill / token box (x, y, w, h) | Caption / label box | Badges |
|---|---|---|---|---|
| N1 Offline recovery covenant | 465, 325 | 342, 307, 246, 36 | — | — |
| N2 Constrained recovery revision (truncates) | 449, 662 | 325, 644, 248, 36 | — | — |
| N3 Red-team stop condition | 708, 379 | 600, 361, 216, 36 | — | — |
| N4 Named owners, weeks 1–6 | 837, 608 | 724, 590, 226, 36 | — | — |
| N5 Last-known-good build | 643, 743 | 540, 725, 206, 36 | — | — |
| N6 Stale permission grants | 238, 473 | 135, 455, 206, 36 | — | — |

| Edge | Class | `d` |
|---|---|---|
| N6–N1 | `b-edge b-edge-strong` | `M 252 451 A 298.5 298.5 0 0 1 371.2 351` |
| N6–N2 | `b-edge` | `M 247.5 495.1 A 312.1 312.1 0 0 0 390.5 640` |
| N1–N3 | `b-edge b-edge-strong` | `M 596 323.5 A 274.2 274.2 0 0 1 677.2 357` |
| N2–N5 | `b-edge` | `M 473.8 687 A 231.6 231.6 0 0 0 541.8 728` |
| N3–N4 | `b-edge` | `M 737 401 A 289.6 289.6 0 0 1 835.2 586` |

#### phone — Fit 51% (0.515), overview tier
Canvas {x:0,y:251,w:390,h:593,note:full-bleed; continues under the bottom sheet (sheet top 628)}; Fit rect 0, 251, 390×377, padding 16. Problems: none.
Closest pair: N1/N3 36.1px.

| Node | Anchor | Pill / token box (x, y, w, h) | Caption / label box | Badges |
|---|---|---|---|---|
| N1 Offline recovery covenant | 162, 353 | 148, 339, 28, 28 | 84, 313, 156, 18 | — |
| N2 Constrained recovery revision | 156, 492 | 142, 478, 28, 28 | — | — |
| N3 Red-team stop condition | 262, 376 | 248, 362, 28, 28 | — | — |
| N4 Named owners, weeks 1–6 | 316, 470 | 302, 456, 28, 28 | — | — |
| N5 Last-known-good build | 236, 526 | 222, 512, 28, 28 | — | — |
| N6 Stale permission grants | 69, 414 | 55, 400, 28, 28 | — | — |

| Edge | Class | `d` |
|---|---|---|
| N6–N1 | `b-edge b-edge-strong` | `M 79.1 399.1 A 122.5 122.5 0 0 1 140.4 357.4` |
| N6–N2 | `b-edge` | `M 76.7 430.3 A 128.7 128.7 0 0 0 138.9 486.2` |
| N1–N3 | `b-edge b-edge-strong` | `M 183.8 349.8 A 113 113 0 0 1 247.3 365.6` |
| N2–N5 | `b-edge` | `M 168.8 504.7 A 95.8 95.8 0 0 0 218 525.5` |
| N3–N4 | `b-edge` | `M 276.3 387 A 119.4 119.4 0 0 1 313.7 452.1` |

#### share-landing — Fit 125% (1.25, capped from 1.411), card tier
Canvas {x:0,y:0,w:720,h:450,note:full-bleed paper inside the 720×450 frame}; Fit rect 16, 180, 412×254, padding 48. Problems: none.

| Node | Anchor | Pill / token box (x, y, w, h) | Caption / label box | Badges |
|---|---|---|---|---|
| N1 Offline recovery covenant | 222, 307 | 110, 289, 224, 36 | — | — |

## 8. Contrast (computed by `contrast.mjs`, both themes)

Thresholds: text 4.5, marks 3, strokes ≤ 2px 3.2 (brief §2.5 design margin). "info" rows are reported, not gated
(disabled text, the lime body that relies on its rim, and the brief value that §9 item 19 replaced).

| Theme | Pair (what) | Foreground | Background | WCAG | APCA Lc | Need | Result |
|---|---|---|---|---|---|---|---|
| light | primary text | `text #1B1B17` | `bg #FDFAEA` | 16.48 | 101 | 4.5 | pass |
| dark | primary text | `text #EFEEE9` | `bg #100F0D` | 16.49 | 96 | 4.5 | pass |
| light | primary text | `text #1B1B17` | `sidebar #FDFAEA` | 16.48 | 101 | 4.5 | pass |
| dark | primary text | `text #EFEEE9` | `sidebar #161612` | 15.62 | 96 | 4.5 | pass |
| light | primary text | `text #1B1B17` | `surface #FDFDF9` | 16.94 | 103 | 4.5 | pass |
| dark | primary text | `text #EFEEE9` | `surface #161612` | 15.62 | 96 | 4.5 | pass |
| light | primary text | `text #1B1B17` | `field #F2F1EB` | 15.26 | 96 | 4.5 | pass |
| dark | primary text | `text #EFEEE9` | `field #1F1E1A` | 14.36 | 95 | 4.5 | pass |
| light | primary text | `text #1B1B17` | `overlay #FDFDF9` | 16.94 | 103 | 4.5 | pass |
| dark | primary text | `text #EFEEE9` | `overlay #272620` | 13.06 | 94 | 4.5 | pass |
| light | primary text | `text #1B1B17` | `hover #EBE9E2` | 14.22 | 91 | 4.5 | pass |
| dark | primary text | `text #EFEEE9` | `hover #272620` | 13.06 | 94 | 4.5 | pass |
| light | primary text | `text #1B1B17` | `selected #E4E2DA` | 13.32 | 87 | 4.5 | pass |
| dark | primary text | `text #EFEEE9` | `selected #2E2D27` | 11.89 | 92 | 4.5 | pass |
| light | primary text | `text #1B1B17` | `accent-soft-bg #FFE8EB` | 14.80 | 94 | 4.5 | pass |
| dark | primary text | `text #EFEEE9` | `accent-soft-bg #38121A` | 14.24 | 94 | 4.5 | pass |
| light | primary text | `text #1B1B17` | `node-fill #FDFDF9` | 16.94 | 103 | 4.5 | pass |
| dark | primary text | `text #EFEEE9` | `node-fill #1F1E1A` | 14.36 | 95 | 4.5 | pass |
| light | primary text | `text #1B1B17` | `canvas-bg #FDFAEA` | 16.48 | 101 | 4.5 | pass |
| dark | primary text | `text #EFEEE9` | `canvas-bg #100F0D` | 16.49 | 96 | 4.5 | pass |
| light | primary text | `text #1B1B17` | `draft-soft-bg #F1F0EB` | 15.14 | 95 | 4.5 | pass |
| dark | primary text | `text #EFEEE9` | `draft-soft-bg #262521` | 13.20 | 94 | 4.5 | pass |
| light | secondary text, captions, placeholders, kbd | `text-muted #66655F` | `bg #FDFAEA` | 5.58 | 76 | 4.5 | pass |
| dark | secondary text, captions, placeholders, kbd | `text-muted #BAB9B2` | `bg #100F0D` | 9.73 | 64 | 4.5 | pass |
| light | secondary text, captions, placeholders, kbd | `text-muted #66655F` | `sidebar #FDFAEA` | 5.58 | 76 | 4.5 | pass |
| dark | secondary text, captions, placeholders, kbd | `text-muted #BAB9B2` | `sidebar #161612` | 9.22 | 64 | 4.5 | pass |
| light | secondary text, captions, placeholders, kbd | `text-muted #66655F` | `surface #FDFDF9` | 5.73 | 78 | 4.5 | pass |
| dark | secondary text, captions, placeholders, kbd | `text-muted #BAB9B2` | `surface #161612` | 9.22 | 64 | 4.5 | pass |
| light | secondary text, captions, placeholders, kbd | `text-muted #66655F` | `field #F2F1EB` | 5.17 | 71 | 4.5 | pass |
| dark | secondary text, captions, placeholders, kbd | `text-muted #BAB9B2` | `field #1F1E1A` | 8.48 | 63 | 4.5 | pass |
| light | secondary text, captions, placeholders, kbd | `text-muted #66655F` | `overlay #FDFDF9` | 5.73 | 78 | 4.5 | pass |
| dark | secondary text, captions, placeholders, kbd | `text-muted #BAB9B2` | `overlay #272620` | 7.71 | 61 | 4.5 | pass |
| light | secondary text, captions, placeholders, kbd | `text-muted #66655F` | `hover #EBE9E2` | 4.81 | 66 | 4.5 | pass |
| dark | secondary text, captions, placeholders, kbd | `text-muted #BAB9B2` | `hover #272620` | 7.71 | 61 | 4.5 | pass |
| light | secondary text, captions, placeholders, kbd | `text-muted #66655F` | `selected #E4E2DA` | 4.51 | 62 | 4.5 | pass |
| dark | secondary text, captions, placeholders, kbd | `text-muted #BAB9B2` | `selected #2E2D27` | 7.02 | 60 | 4.5 | pass |
| light | secondary text, captions, placeholders, kbd | `text-muted #66655F` | `node-fill #FDFDF9` | 5.73 | 78 | 4.5 | pass |
| dark | secondary text, captions, placeholders, kbd | `text-muted #BAB9B2` | `node-fill #1F1E1A` | 8.48 | 63 | 4.5 | pass |
| light | secondary text, captions, placeholders, kbd | `text-muted #66655F` | `canvas-bg #FDFAEA` | 5.58 | 76 | 4.5 | pass |
| dark | secondary text, captions, placeholders, kbd | `text-muted #BAB9B2` | `canvas-bg #100F0D` | 9.73 | 64 | 4.5 | pass |
| light | download-card pitch | `text-muted #66655F` | `sticker-bg #FAF2E6` | 5.26 | 72 | 4.5 | pass |
| dark | download-card pitch | `text-muted #BAB9B2` | `sticker-bg #161612` | 9.22 | 64 | 4.5 | pass |
| light | download-card title | `text #1B1B17` | `sticker-bg #FAF2E6` | 15.55 | 97 | 4.5 | pass |
| dark | download-card title | `text #EFEEE9` | `sticker-bg #161612` | 15.62 | 96 | 4.5 | pass |
| light | disabled only | `text-faint #8C8B84` | `surface #FDFDF9` | 3.35 | 60 | — | info |
| dark | disabled only | `text-faint #706F68` | `surface #161612` | 3.60 | 26 | — | info |
| light | disabled only | `text-faint #8C8B84` | `field #F2F1EB` | 3.02 | 53 | — | info |
| dark | disabled only | `text-faint #706F68` | `field #1F1E1A` | 3.31 | 25 | — | info |
| light | link / Running caption in sidebar | `accent-text #B13856` | `sidebar #FDFAEA` | 5.61 | 75 | 4.5 | pass |
| dark | link / Running caption in sidebar | `accent-text #FF9DAD` | `sidebar #161612` | 9.22 | 64 | 4.5 | pass |
| light | link in inspector | `accent-text #B13856` | `surface #FDFDF9` | 5.77 | 77 | 4.5 | pass |
| dark | link in inspector | `accent-text #FF9DAD` | `surface #161612` | 9.22 | 64 | 4.5 | pass |
| light | Running pill; selected row text | `accent-text #B13856` | `accent-soft-bg #FFE8EB` | 5.04 | 68 | 4.5 | pass |
| dark | Running pill; selected row text | `accent-text #FF9DAD` | `accent-soft-bg #38121A` | 8.41 | 63 | 4.5 | pass |
| light | "Running" node caption | `accent-text #B13856` | `canvas-bg #FDFAEA` | 5.61 | 75 | 4.5 | pass |
| dark | "Running" node caption | `accent-text #FF9DAD` | `canvas-bg #100F0D` | 9.74 | 64 | 4.5 | pass |
| light | "Draft" node caption | `draft-text #706D5D` | `canvas-bg #FDFAEA` | 4.97 | 73 | 4.5 | pass |
| dark | "Draft" node caption | `draft-text #C2BEAC` | `canvas-bg #100F0D` | 10.27 | 67 | 4.5 | pass |
| light | working-layer tag | `draft-text #706D5D` | `draft-soft-bg #F1F0EB` | 4.56 | 67 | 4.5 | pass |
| dark | working-layer tag | `draft-text #C2BEAC` | `draft-soft-bg #262521` | 8.22 | 64 | 4.5 | pass |
| light | "Stopped" node caption | `text-muted #66655F` | `canvas-bg #FDFAEA` | 5.58 | 76 | 4.5 | pass |
| dark | "Stopped" node caption | `text-muted #BAB9B2` | `canvas-bg #100F0D` | 9.73 | 64 | 4.5 | pass |
| light | "Failed" node caption | `danger-text #BC4524` | `canvas-bg #FDFAEA` | 4.99 | 72 | 4.5 | pass |
| dark | "Failed" node caption | `danger-text #FFA289` | `canvas-bg #100F0D` | 9.84 | 65 | 4.5 | pass |
| light | Failed pill, failure message | `danger-text #BC4524` | `danger-soft-bg #FFEBE6` | 4.55 | 66 | 4.5 | pass |
| dark | Failed pill, failure message | `danger-text #FFA289` | `danger-soft-bg #3A1C13` | 7.95 | 62 | 4.5 | pass |
| light | failure copy on cards | `danger-text #BC4524` | `surface #FDFDF9` | 5.13 | 74 | 4.5 | pass |
| dark | failure copy on cards | `danger-text #FFA289` | `surface #161612` | 9.31 | 64 | 4.5 | pass |
| light | Needs approval pill | `warning-text #996000` | `warning-soft-bg #FFEDD9` | 4.56 | 66 | 4.5 | pass |
| dark | Needs approval pill | `warning-text #FEA92F` | `warning-soft-bg #352006` | 8.03 | 63 | 4.5 | pass |
| light | approval dock eyebrow | `warning-text #996000` | `surface #FDFDF9` | 5.11 | 74 | 4.5 | pass |
| dark | approval dock eyebrow | `warning-text #FEA92F` | `surface #161612` | 9.44 | 65 | 4.5 | pass |
| light | Accepted pill + stamp text | `accepted-fill-text #1B1B17` | `accepted-fill #C1E357` | 11.84 | 80 | 4.5 | pass |
| dark | Accepted pill + stamp text | `accepted-fill-text #100F0D` | `accepted-fill #C1E357` | 13.13 | 82 | 4.5 | pass |
| light | Send, Download, primary button label | `accent-solid-alt-text #FFFFFF` | `accent-solid-alt #CE4365` | 4.55 | 76 | 4.5 | pass |
| dark | Send, Download, primary button label | `accent-solid-alt-text #FFFFFF` | `accent-solid-alt #CE4365` | 4.55 | 76 | 4.5 | pass |
| light | large rose fill label | `accent-solid-text #1B1B17` | `accent-solid #E65979` | 4.99 | 41 | 4.5 | pass |
| dark | large rose fill label | `accent-solid-text #100F0D` | `accent-solid #E65979` | 5.54 | 42 | 4.5 | pass |
| light | env +adds | `diff-add #4E6000` | `surface #FDFDF9` | 6.87 | 83 | 4.5 | pass |
| dark | env +adds | `diff-add #ADCE3E` | `surface #161612` | 10.09 | 69 | 4.5 | pass |
| light | env −dels | `diff-del #BC4524` | `surface #FDFDF9` | 5.13 | 74 | 4.5 | pass |
| dark | env −dels | `diff-del #FFA289` | `surface #161612` | 9.31 | 64 | 4.5 | pass |
| light | env +adds on field | `diff-add #4E6000` | `field #F2F1EB` | 6.19 | 76 | 4.5 | pass |
| dark | env +adds on field | `diff-add #ADCE3E` | `field #1F1E1A` | 9.27 | 68 | 4.5 | pass |
| light | env −dels on field | `diff-del #BC4524` | `field #F2F1EB` | 4.62 | 67 | 4.5 | pass |
| dark | env −dels on field | `diff-del #FFA289` | `field #1F1E1A` | 8.56 | 63 | 4.5 | pass |
| light | logo ink on the cream tile | `ink #1B1B17` | `cream #FAF2E6` | 15.55 | 97 | 4.5 | pass |
| dark | logo ink on the cream tile | `ink #1B1B17` | `cream #FAF2E6` | 15.55 | 97 | 4.5 | pass |
| light | Document icon on disc | `f1:icon #FFFFFF` | `f1:fill #5D2DAE` | 8.56 | 93 | 4.5 | pass |
| dark | Document icon on disc | `f1:icon #1B1B17` | `f1:fill #AB8EFF` | 6.62 | 51 | 4.5 | pass |
| light | Document disc on pill fill | `f1:fill #5D2DAE` | `node-fill #FDFDF9` | 8.40 | 87 | 3 | pass |
| dark | Document disc on pill fill | `f1:fill #AB8EFF` | `node-fill #1F1E1A` | 6.39 | 49 | 3 | pass |
| light | Document disc on canvas (draft hollow, overview) | `f1:fill #5D2DAE` | `canvas-bg #FDFAEA` | 8.17 | 85 | 3 | pass |
| dark | Document disc on canvas (draft hollow, overview) | `f1:fill #AB8EFF` | `canvas-bg #100F0D` | 7.34 | 51 | 3 | pass |
| light | Document disc on inspector / legend | `f1:fill #5D2DAE` | `surface #FDFDF9` | 8.40 | 87 | 3 | pass |
| dark | Document disc on inspector / legend | `f1:fill #AB8EFF` | `surface #161612` | 6.95 | 50 | 3 | pass |
| light | Code icon on disc | `f2:icon #FFFFFF` | `f2:fill #006D92` | 5.83 | 84 | 4.5 | pass |
| dark | Code icon on disc | `f2:icon #1B1B17` | `f2:fill #72D1FF` | 10.10 | 71 | 4.5 | pass |
| light | Code disc on pill fill | `f2:fill #006D92` | `node-fill #FDFDF9` | 5.72 | 77 | 3 | pass |
| dark | Code disc on pill fill | `f2:fill #72D1FF` | `node-fill #1F1E1A` | 9.75 | 70 | 3 | pass |
| light | Code disc on canvas (draft hollow, overview) | `f2:fill #006D92` | `canvas-bg #FDFAEA` | 5.56 | 75 | 3 | pass |
| dark | Code disc on canvas (draft hollow, overview) | `f2:fill #72D1FF` | `canvas-bg #100F0D` | 11.20 | 72 | 3 | pass |
| light | Code disc on inspector / legend | `f2:fill #006D92` | `surface #FDFDF9` | 5.72 | 77 | 3 | pass |
| dark | Code disc on inspector / legend | `f2:fill #72D1FF` | `surface #161612` | 10.61 | 71 | 3 | pass |
| light | Data icon on disc | `f3:icon #1B1B17` | `f3:fill #00A486` | 5.47 | 44 | 4.5 | pass |
| dark | Data icon on disc | `f3:icon #1B1B17` | `f3:fill #009D81` | 5.05 | 41 | 4.5 | pass |
| light | Data disc on pill fill | `f3:fill #00A486` | `node-fill #FDFDF9` | 3.09 | 57 | 3 | pass |
| dark | Data disc on pill fill | `f3:fill #009D81` | `node-fill #1F1E1A` | 4.88 | 39 | 3 | pass |
| light | Data disc on canvas (draft hollow, overview) | `f3:fill #00A486` | `canvas-bg #FDFAEA` | 3.01 | 55 | 3 | pass |
| dark | Data disc on canvas (draft hollow, overview) | `f3:fill #009D81` | `canvas-bg #100F0D` | 5.60 | 40 | 3 | pass |
| light | Data disc on inspector / legend | `f3:fill #00A486` | `surface #FDFDF9` | 3.09 | 57 | 3 | pass |
| dark | Data disc on inspector / legend | `f3:fill #009D81` | `surface #161612` | 5.30 | 40 | 3 | pass |
| light | Systems icon on disc | `f4:icon #FFFFFF` | `f4:fill #826D00` | 5.08 | 80 | 4.5 | pass |
| dark | Systems icon on disc | `f4:icon #1B1B17` | `f4:fill #CFAF00` | 8.05 | 60 | 4.5 | pass |
| light | Systems disc on pill fill | `f4:fill #826D00` | `node-fill #FDFDF9` | 4.98 | 73 | 3 | pass |
| dark | Systems disc on pill fill | `f4:fill #CFAF00` | `node-fill #1F1E1A` | 7.77 | 58 | 3 | pass |
| light | Systems disc on canvas (draft hollow, overview) | `f4:fill #826D00` | `canvas-bg #FDFAEA` | 4.84 | 72 | 3 | pass |
| dark | Systems disc on canvas (draft hollow, overview) | `f4:fill #CFAF00` | `canvas-bg #100F0D` | 8.93 | 60 | 3 | pass |
| light | Systems disc on inspector / legend | `f4:fill #826D00` | `surface #FDFDF9` | 4.98 | 73 | 3 | pass |
| dark | Systems disc on inspector / legend | `f4:fill #CFAF00` | `surface #161612` | 8.45 | 59 | 3 | pass |
| light | People & agents icon on disc | `f5:icon #1B1B17` | `f5:fill #D665CF` | 5.45 | 44 | 4.5 | pass |
| dark | People & agents icon on disc | `f5:icon #FFFFFF` | `f5:fill #B545AE` | 4.74 | 78 | 4.5 | pass |
| light | People & agents disc on pill fill | `f5:fill #D665CF` | `node-fill #FDFDF9` | 3.11 | 57 | 3 | pass |
| dark | People & agents disc on pill fill | `f5:fill #B545AE` | `node-fill #1F1E1A` | 3.52 | 28 | 3 | pass |
| light | People & agents disc on canvas (draft hollow, overview) | `f5:fill #D665CF` | `canvas-bg #FDFAEA` | 3.03 | 55 | 3 | pass |
| dark | People & agents disc on canvas (draft hollow, overview) | `f5:fill #B545AE` | `canvas-bg #100F0D` | 4.04 | 29 | 3 | pass |
| light | People & agents disc on inspector / legend | `f5:fill #D665CF` | `surface #FDFDF9` | 3.11 | 57 | 3 | pass |
| dark | People & agents disc on inspector / legend | `f5:fill #B545AE` | `surface #161612` | 3.82 | 29 | 3 | pass |
| light | Reasoning icon on disc | `f6:icon #FFFFFF` | `f6:fill #596AE8` | 4.51 | 76 | 4.5 | pass |
| dark | Reasoning icon on disc | `f6:icon #FFFFFF` | `f6:fill #596AE8` | 4.51 | 76 | 4.5 | pass |
| light | Reasoning disc on pill fill | `f6:fill #596AE8` | `node-fill #FDFDF9` | 4.43 | 70 | 3 | pass |
| dark | Reasoning disc on pill fill | `f6:fill #596AE8` | `node-fill #1F1E1A` | 3.70 | 29 | 3 | pass |
| light | Reasoning disc on canvas (draft hollow, overview) | `f6:fill #596AE8` | `canvas-bg #FDFAEA` | 4.31 | 68 | 3 | pass |
| dark | Reasoning disc on canvas (draft hollow, overview) | `f6:fill #596AE8` | `canvas-bg #100F0D` | 4.24 | 30 | 3 | pass |
| light | Reasoning disc on inspector / legend | `f6:fill #596AE8` | `surface #FDFDF9` | 4.43 | 70 | 3 | pass |
| dark | Reasoning disc on inspector / legend | `f6:fill #596AE8` | `surface #161612` | 4.02 | 30 | 3 | pass |
| light | Neutral icon on --field disc | `text-muted #66655F` | `field #F2F1EB` | 5.17 | 71 | 4.5 | pass |
| dark | Neutral icon on --field disc | `text-muted #BAB9B2` | `field #1F1E1A` | 8.48 | 63 | 4.5 | pass |
| light | edge 1.5px | `edge #8D8C86` | `canvas-bg #FDFAEA` | 3.22 | 58 | 3.2 | pass |
| dark | edge 1.5px | `edge #66645E` | `canvas-bg #100F0D` | 3.24 | 22 | 3.2 | pass |
| light | selected-incident edge 2px | `edge-strong #66655F` | `canvas-bg #FDFAEA` | 5.58 | 76 | 3.2 | pass |
| dark | selected-incident edge 2px | `edge-strong #B4B3AC` | `canvas-bg #100F0D` | 9.11 | 61 | 3.2 | pass |
| light | pill outline 1.5px | `node-stroke #8D8C86` | `canvas-bg #FDFAEA` | 3.22 | 58 | 3.2 | pass |
| dark | pill outline 1.5px | `node-stroke #706F68` | `canvas-bg #100F0D` | 3.80 | 26 | 3.2 | pass |
| light | draft dashed outline (hollow body = canvas) | `draft-outline #8D8C86` | `canvas-bg #FDFAEA` | 3.22 | 58 | 3.2 | pass |
| dark | draft dashed outline (hollow body = canvas) | `draft-outline #706F68` | `canvas-bg #100F0D` | 3.80 | 26 | 3.2 | pass |
| light | hover outline | `edge-strong #66655F` | `canvas-bg #FDFAEA` | 5.58 | 76 | 3.2 | pass |
| dark | hover outline | `edge-strong #B4B3AC` | `canvas-bg #100F0D` | 9.11 | 61 | 3.2 | pass |
| light | failed 2px outline vs canvas | `danger-solid #B23B19` | `canvas-bg #FDFAEA` | 5.67 | 75 | 3.2 | pass |
| dark | failed 2px outline vs canvas | `danger-solid #FE8160` | `canvas-bg #100F0D` | 7.78 | 54 | 3.2 | pass |
| light | failed 2px outline vs pill fill | `danger-solid #B23B19` | `node-fill #FDFDF9` | 5.83 | 77 | 3.2 | pass |
| dark | failed 2px outline vs pill fill | `danger-solid #FE8160` | `node-fill #1F1E1A` | 6.77 | 52 | 3.2 | pass |
| light | selection ring 2px | `selection-ring #E65979` | `canvas-bg #FDFAEA` | 3.30 | 58 | 3.2 | pass |
| dark | selection ring 2px | `selection-ring #E65979` | `canvas-bg #100F0D` | 5.54 | 40 | 3.2 | pass |
| light | focus ring 2px on canvas | `text #1B1B17` | `canvas-bg #FDFAEA` | 16.48 | 101 | 3.2 | pass |
| dark | focus ring 2px on canvas | `text #EFEEE9` | `canvas-bg #100F0D` | 16.49 | 96 | 3.2 | pass |
| light | focus ring on cards | `text #1B1B17` | `surface #FDFDF9` | 16.94 | 103 | 3.2 | pass |
| dark | focus ring on cards | `text #EFEEE9` | `surface #161612` | 15.62 | 96 | 3.2 | pass |
| light | focus ring in sidebar | `text #1B1B17` | `sidebar #FDFAEA` | 16.48 | 101 | 3.2 | pass |
| dark | focus ring in sidebar | `text #EFEEE9` | `sidebar #161612` | 15.62 | 96 | 3.2 | pass |
| light | focus ring on selected row | `text #1B1B17` | `accent-soft-bg #FFE8EB` | 14.80 | 94 | 3.2 | pass |
| dark | focus ring on selected row | `text #EFEEE9` | `accent-soft-bg #38121A` | 14.24 | 94 | 3.2 | pass |
| light | running orbit arc (over the pill outline) | `running #E65979` | `canvas-bg #FDFAEA` | 3.30 | 58 | 3.2 | pass |
| dark | running orbit arc (over the pill outline) | `running #E65979` | `canvas-bg #100F0D` | 5.54 | 40 | 3.2 | pass |
| light | running orbit arc inside the pill | `running #E65979` | `node-fill #FDFDF9` | 3.39 | 60 | 3.2 | pass |
| dark | running orbit arc inside the pill | `running #E65979` | `node-fill #1F1E1A` | 4.82 | 39 | 3.2 | pass |
| light | layer frame (working dashed / retained solid) | `border-strong #888680` | `canvas-bg #FDFAEA` | 3.47 | 61 | 3.2 | pass |
| dark | layer frame (working dashed / retained solid) | `border-strong #76746D` | `canvas-bg #100F0D` | 4.10 | 29 | 3.2 | pass |
| light | input, Stop, secondary button boundary | `border-strong #888680` | `surface #FDFDF9` | 3.57 | 63 | 3.2 | pass |
| dark | input, Stop, secondary button boundary | `border-strong #76746D` | `surface #161612` | 3.88 | 28 | 3.2 | pass |
| light | boundary on page | `border-strong #888680` | `bg #FDFAEA` | 3.47 | 61 | 3.2 | pass |
| dark | boundary on page | `border-strong #76746D` | `bg #100F0D` | 4.10 | 29 | 3.2 | pass |
| light | badge disc rim on --field | `border-strong #888680` | `field #F2F1EB` | 3.22 | 56 | 3.2 | pass |
| dark | badge disc rim on --field | `border-strong #76746D` | `field #1F1E1A` | 3.57 | 27 | 3.2 | pass |
| light | Accepted stamp / pill rim on paper | `accepted-mark #7A9500` | `bg #FDFAEA` | 3.27 | 58 | 3.2 | pass |
| dark | Accepted stamp / pill rim on paper | `accepted-mark #C1E357` | `bg #100F0D` | 13.13 | 81 | 3.2 | pass |
| light | Accepted pill rim on cards | `accepted-mark #7A9500` | `surface #FDFDF9` | 3.36 | 60 | 3.2 | pass |
| dark | Accepted pill rim on cards | `accepted-mark #C1E357` | `surface #161612` | 12.43 | 81 | 3.2 | pass |
| light | lime stamp body vs canvas (rim carries the edge in light) | `accepted-fill #C1E357` | `canvas-bg #FDFAEA` | 1.39 | 18 | — | info |
| dark | lime stamp body vs canvas (rim carries the edge in light) | `accepted-fill #C1E357` | `canvas-bg #100F0D` | 13.13 | 81 | — | info |
| light | running badge disc | `running #E65979` | `canvas-bg #FDFAEA` | 3.30 | 58 | 3 | pass |
| dark | running badge disc | `running #E65979` | `canvas-bg #100F0D` | 5.54 | 40 | 3 | pass |
| light | running badge glyph (ink on rose) | `ink #1B1B17` | `running #E65979` | 4.99 | 41 | 4.5 | pass |
| dark | running badge glyph (ink on rose) | `ink #1B1B17` | `running #E65979` | 4.99 | 41 | 4.5 | pass |
| light | failed badge disc | `danger-strong #B23B19` | `canvas-bg #FDFAEA` | 5.67 | 75 | 3 | pass |
| dark | failed badge disc | `danger-strong #C8502F` | `canvas-bg #100F0D` | 4.24 | 31 | 3 | pass |
| light | failed badge glyph | `white #FFFFFF` | `danger-strong #B23B19` | 5.94 | 84 | 4.5 | pass |
| dark | failed badge glyph | `white #FFFFFF` | `danger-strong #C8502F` | 4.52 | 76 | 4.5 | pass |
| light | stopped ■ glyph on --field disc | `text-muted #66655F` | `field #F2F1EB` | 5.17 | 71 | 4.5 | pass |
| dark | stopped ■ glyph on --field disc | `text-muted #BAB9B2` | `field #1F1E1A` | 8.48 | 63 | 4.5 | pass |
| light | invoke / input / attached glyph | `text #1B1B17` | `field #F2F1EB` | 15.26 | 96 | 4.5 | pass |
| dark | invoke / input / attached glyph | `text #EFEEE9` | `field #1F1E1A` | 14.36 | 95 | 4.5 | pass |
| light | comment badge disc | `accent-solid-alt #CE4365` | `canvas-bg #FDFAEA` | 4.34 | 67 | 3 | pass |
| dark | comment badge disc | `accent-solid-alt #CE4365` | `canvas-bg #100F0D` | 4.21 | 31 | 3 | pass |
| light | comment count | `white #FFFFFF` | `accent-solid-alt #CE4365` | 4.55 | 76 | 4.5 | pass |
| dark | comment count | `white #FFFFFF` | `accent-solid-alt #CE4365` | 4.55 | 76 | 4.5 | pass |
| light | answered-input badge glyph (inverted disc) | `field #F2F1EB` | `text #1B1B17` | 15.26 | 97 | 4.5 | pass |
| dark | answered-input badge glyph (inverted disc) | `field #1F1E1A` | `text #EFEEE9` | 14.36 | 93 | 4.5 | pass |
| light | sidebar Running mark | `running #E65979` | `sidebar #FDFAEA` | 3.30 | 58 | 3 | pass |
| dark | sidebar Running mark | `running #E65979` | `sidebar #161612` | 5.24 | 39 | 3 | pass |
| light | brief value: rose Running mark on the active row (fails 3:1 in light; replaced below) | `running #E65979` | `accent-soft-bg #FFE8EB` | 2.96 | 51 | — | info |
| dark | brief value: rose Running mark on the active row (fails 3:1 in light; replaced below) | `running #E65979` | `accent-soft-bg #38121A` | 4.78 | 38 | — | info |
| light | sidebar Running mark (kit: --accent-text) | `accent-text #B13856` | `sidebar #FDFAEA` | 5.61 | 75 | 3 | pass |
| dark | sidebar Running mark (kit: --accent-text) | `accent-text #FF9DAD` | `sidebar #161612` | 9.22 | 64 | 3 | pass |
| light | sidebar Running mark on a hovered row | `accent-text #B13856` | `hover #EBE9E2` | 4.84 | 65 | 3 | pass |
| dark | sidebar Running mark on a hovered row | `accent-text #FF9DAD` | `hover #272620` | 7.71 | 62 | 3 | pass |
| light | sidebar Running mark on the active row | `accent-text #B13856` | `accent-soft-bg #FFE8EB` | 5.04 | 68 | 3 | pass |
| dark | sidebar Running mark on the active row | `accent-text #FF9DAD` | `accent-soft-bg #38121A` | 8.41 | 63 | 3 | pass |
| light | Needs-approval 12px glyph on a hovered row (graphic: 3:1) | `warning-text #996000` | `hover #EBE9E2` | 4.29 | 62 | 3 | pass |
| dark | Needs-approval 12px glyph on a hovered row (graphic: 3:1) | `warning-text #FEA92F` | `hover #272620` | 7.90 | 63 | 3 | pass |
| light | Needs-approval 12px glyph on the active row (graphic: 3:1) | `warning-text #996000` | `accent-soft-bg #FFE8EB` | 4.47 | 65 | 3 | pass |
| dark | Needs-approval 12px glyph on the active row (graphic: 3:1) | `warning-text #FEA92F` | `accent-soft-bg #38121A` | 8.61 | 64 | 3 | pass |
| light | Failed 12px glyph on a hovered row (graphic: 3:1) | `danger-text #BC4524` | `hover #EBE9E2` | 4.31 | 62 | 3 | pass |
| dark | Failed 12px glyph on a hovered row (graphic: 3:1) | `danger-text #FFA289` | `hover #272620` | 7.79 | 62 | 3 | pass |
| light | Failed 12px glyph on the active row (graphic: 3:1) | `danger-text #BC4524` | `accent-soft-bg #FFE8EB` | 4.48 | 65 | 3 | pass |
| dark | Failed 12px glyph on the active row (graphic: 3:1) | `danger-text #FFA289` | `accent-soft-bg #38121A` | 8.49 | 63 | 3 | pass |
| light | sidebar Needs-approval mark | `warning-text #996000` | `sidebar #FDFAEA` | 4.98 | 72 | 4.5 | pass |
| dark | sidebar Needs-approval mark | `warning-text #FEA92F` | `sidebar #161612` | 9.44 | 65 | 4.5 | pass |
| light | sidebar Failed mark | `danger-text #BC4524` | `sidebar #FDFAEA` | 4.99 | 72 | 4.5 | pass |
| dark | sidebar Failed mark | `danger-text #FFA289` | `sidebar #161612` | 9.31 | 64 | 4.5 | pass |
| light | selected-row leading bar (3px) | `accent-text #B13856` | `accent-soft-bg #FFE8EB` | 5.04 | 68 | 3.2 | pass |
| dark | selected-row leading bar (3px) | `accent-text #FF9DAD` | `accent-soft-bg #38121A` | 8.41 | 63 | 3.2 | pass |
| light | update dot | `accent-solid #E65979` | `sidebar #FDFAEA` | 3.30 | 58 | 3 | pass |
| dark | update dot | `accent-solid #E65979` | `sidebar #161612` | 5.24 | 39 | 3 | pass |
| light | update dot glyph | `accent-solid-text #1B1B17` | `accent-solid #E65979` | 4.99 | 41 | 4.5 | pass |
| dark | update dot glyph | `accent-solid-text #100F0D` | `accent-solid #E65979` | 5.54 | 42 | 4.5 | pass |
| light | Send / primary fill vs card | `accent-solid-alt #CE4365` | `surface #FDFDF9` | 4.46 | 69 | 3 | pass |
| dark | Send / primary fill vs card | `accent-solid-alt #CE4365` | `surface #161612` | 3.99 | 30 | 3 | pass |
| light | Download fill vs sticker card | `accent-solid-alt #CE4365` | `sticker-bg #FAF2E6` | 4.10 | 63 | 3 | pass |
| dark | Download fill vs sticker card | `accent-solid-alt #CE4365` | `sticker-bg #161612` | 3.99 | 30 | 3 | pass |
| light | Stop 10px square glyph | `text #1B1B17` | `field #F2F1EB` | 15.26 | 96 | 4.5 | pass |
| dark | Stop 10px square glyph | `text #EFEEE9` | `field #1F1E1A` | 14.36 | 95 | 4.5 | pass |
| light | approval dock icon disc | `warning-solid #C17A00` | `surface #FDFDF9` | 3.40 | 60 | 3 | pass |
| dark | approval dock icon disc | `warning-solid #D18500` | `surface #161612` | 6.10 | 45 | 3 | pass |

234 checks, 0 failures.

## 9. Decisions where the brief is silent (all prototype-B-local)

1. **Fit behaviour**: today's `fitGraphCamera` with per-node pill bounds (not the brief's uniform 124 halfWidth) →
   desktop **105%**, web 125% (cap), phone 51% (overview), landing 125% (cap). Using the uniform 124 gave 101% and put
   N1's ring 2px *into* N3.
2. **Fit rect (desktop)** = x 248–1076 (828, brief), y 116–832 (prompt-card bottom → composer top).
3. **Inspector height** [PD]: the brief's fixed height (top inset 12 → 12 above the composer, 808). Node Details scroll
   above the one-third annotation dock (as in production, where the dock keeps its slot even while hidden); the scene
   shows the dock open for N1, so the slot is never a blank card and the canvas corner below the card is gone. Round 2's
   "hug" variant was withdrawn: it left a bare 364×274 canvas corner and contradicted brief §6.2.
4. **Header spans only the uncovered width** (248–1076) so the floating inspector never covers •••.
5. **Composer** centred in the uncovered region: x 282–1042, y 832–888.
6. **Working frame** = the uncovered region inset 12 (260, 128, 804×692), radius 24, dash 8/6 (a frame, not a node);
   zoom sits 12 inside its corner; the tag and the hint start at x 280, the prompt text's edge (card 260 + 20), where
   the breadcrumb also starts when shown. Header content, prompt card and frame start at 260.
7. **Node anchor** = pill centre; caption 6px below the footprint, left-aligned with the title (x+40).
8. **Two TL actions** (N1 invoke + input) = two 16px discs on the outline: invoke on the corner, input 4px to its right along the top edge.
9. **Selection ring hugs the pill only** (the peek tucks under it); incident edges stop 4px outside the ring or the peek.
10. **Running orbit**: one 90° arc (brief §3.2), r 23 around the disc, 3px with round caps, 3.5px clear of the outline
    (the 2px ring at a 2px gap is selection's shape, so the orbit must not look like part of one); static phase 6 → 9 o'clock, clear
    of the title and away from a neighbour's selection ring above. It still shares the selection hue (rose): the badge
    and the "Running" caption carry the difference (B1 §14 risk).
11. **Arc direction**: bow away from the layer's centre, taken from the authored positions (revised for #616, which requires an edge to draw the same from either endpoint). Using the authored centre keeps the 2026-09-29 fix: dragging a node never reshapes an edge it is not on. An edge whose line passes within 0.1 × its length of the centre (a hub's spokes) bows to the left of the direction leading away from the centre, so spokes turn one way. Other shapes' design parameters: elbow corners 8px × zoom, crossing halfway between node centres; `arc-circle` radius = the nodes' mean distance from the centre.
12. **No non-neighbour dimming** in B's scenes (B's spec only strengthens incident edges; dimming would push edges
    below 3:1). `b-edge-dim` exists only for the B1 specimen.
13. **Overview tier**: selected label **above** the token (below collides with N6 and the N6–N1 edge); tooltip specimen
    on N4, above, clamped to the 16px gutter. Tier bounds are always measured at card tier (no zoom↔tier feedback).
14. **Env row** = one collapsed disclosure with a 3-line summary (the full brief string cannot fit 308px on one row).
15. **Invoke card** shows ▷ before its title (links it to the canvas badge); disabled = `--field`, muted/faint text.
16. **+ (attach)** = 36 outline circle, last, left-aligned after the input; omitted on the share viewer (no composer).
17. **Share viewer**: no action badges on the canvas (the viewer executes nothing); `⌘ 1` pill kept (turn record);
    hint pill omitted on web (the key owns bottom-left; three chips do not fit one row); download card is cream
    in light, `--surface` in dark (a cream block on the dark phone would out-shout the graph); phone drops the pitch.
18. **Phone sizes**: header title 16/20 (B's scale); the prompt uses the brief's 15/20 so two lines say more.
19. **Sidebar Running mark = `--accent-text`**, not `--running`: rose on the selected row measured 2.96:1. Warning
    and failed glyphs on hover/selected rows measure 4.29–4.48 (≥ 3 as 12px graphics; ≥ 4.5 on the plain sidebar).
20. **Type**: kind caption 12 (B floor), no 500 weight (zoom % at 600), Node Details title Bricolage 20/600.
21. **Radius**: inputs 12 (outside 10/16/24); prompt card and sticker cards 20 (brief).
22. **Traffic lights** at x 20/40/60, y 16 (centres y 22 = header centre); toggle 32 at x 84.
23. **Stamp**: 32 tall, 1.5px `--accepted-mark` rim in light (lime on paper is 1.39:1); the ≤ 200 ms fade-in is left
    to production (a paused fade would hide it in comps).
24. **Stopped glyph** = an 8px CSS square (`.b-sq`, 6px in badges), drawn only in badges/pills, never in an icon well.
25. **Logo** = inline-SVG stand-in (see §0).
26. **Key button** icon `shapes`; share meta icon `eye`; recenter `locate-fixed`; working tag `circle-dashed`.

## 10. Findings to surface (do not hide them in the boards)

- **N2's title truncates** at the 248px pill max: "Constrained recovery rev…" (needs 266px with ›1). This is B's
  stated risk; the full title shows in the tooltip, the detail tier and the inspector.
- **Desktop crowding**: at 105% N1's selection ring sits **6.1px** from N3's outline (3.5px in round 1, when the ring
  also enclosed the peek). N1 pill 472–718 and N3 pill 692–908 overlap 26px horizontally; vertical gap 9px. The
  canonical placements (§3.4) + B's wide pills + the 828px uncovered width cause it; Fit cannot separate them. Web (125%)
  and phone are clear (30px+). Drawn on B1 §14.
- **Running shares the selection hue**: N3's orbit and N1's ring are both rose (`--running` = `--selection-ring` in the
  brief). Round 3 detached the orbit from the pill (3.5px clear); round 4 restored the brief's 90° sweep; the badge and
  the "Running" caption carry the state. Drawn on B1 §14.
- **Inspector scroll at the fixed height**: Node Details hold 488px of content in a 413px viewport above the dock, so
  at scroll top the Review note input is cut by the dock rule and + is below the fold (overlay thumb drawn).
- **Dark F1 vs F6**: `#AB8EFF` and `#596AE8` sit ≈21° apart in hue, so a first-time viewer can group N1, N2 and N3 as
  "the purple ones". Light is clearly distinct. No token change in gen 1; gen 2 re-runs the family search (F6 → 250° or
  F1 → 300°). Drawn on B1 §06 and §14.
- The N1–N3 edge is a short 46px arc; N2–N5 is 47px. Both are visible; do not lengthen them.
- Lime vs amber collapses under CVD (brief) — glyphs are always present.

## 11. Test pins B breaks and [PD] elements B draws

- Pins (beyond §2.3's four-way list): `.interaction-banner{grid-column:1;grid-row:2;margin:8px 0 12px 12px;`
  (`workspace-breadcrumb.test.mjs:191`, floating card), `.thread-workspace{…grid-template-columns:minmax(0,1fr)
  var(--inspector)…` (`:192`, floating inspector), `public-share-viewer.test.mjs:323` (branch; share header radius 16).
- [PD] drawn: floating inspector (fixed height; one-third annotation dock); working layer frame + tag; child running/stopped/failed marks;
  capability badges; family colours; Accepted made visible (lime pill + stamp); Fit cap 1.25× + screen-constant nodes;
  sidebar Running / Needs approval / Failed marks; share meta line, hidden back/forward, family key, phone Key button;
  System appearance; live-view "Jump to live" specimen.

## 12. Notes for builders

- Copy node `style` strings and edge `d` strings from geometry.json verbatim; never nudge a node by eye.
- Put `has-peek has-more` on N1 and N2 (and `is-selected` on N1). The peek and caption offsets depend on them.
- N1's actions: `<span class="b-badge b-badge-tl is-pair">` + play, then `<span class="b-badge b-badge-tl2">` + `text-cursor` (`ic ic-thin`).
- Every node button carries `aria-pressed` and an `aria-label` of title + state ("Red-team stop condition, child running",
  "Offline recovery covenant, selected, opens 2 layers"); `b-node-more` is `aria-hidden="true"`.
- Draft node: `is-draft` **and** the `<svg class="b-node-dash"><rect></rect></svg>` child; the draft edge gets
  `b-edge-draft` (already in geometry.json's `class`).
- Running node: body + `<svg class="b-orbit" viewBox="0 0 46 46" aria-hidden="true"><circle cx="23" cy="23" r="23"></circle></svg>`
  + BR badge + caption. Keep `b-still` on the root.
- Floating cards use real borders; in dark they have no shadow by design (tokens are `none`), so do not add one.
- Zoom % text must equal geometry.json's `zoom.label` (105% / 125% / 51%).
- Board-specific CSS goes after `kit.css`; if a kit value looks wrong, report it instead of overriding it.
- Only strings from brief §3.4 / §4 / this file. Section captions on B1/B6 use the §4.1/§4.5 item names.

## Round 4 (review r3) — what changed in the kit and the boards

**Authored N1 page (`authored/authored.css`, all six boards)**: page gap 12, padding 12/16, lead 14/22; the sequence
is a timeline drawn as a diagram (no borders, shadows or bold labels): 28px rows, 24px discs with 600 numbers, 400
labels, and one continuous 2px `--ex-line` rail (`ex-link`, disc centre to disc centre, painted under the discs); bar
24; the 12% note without its rule. Desktop sheet height 380 (was 506).

**Guidance series (`authored/palette.mjs`)**: Ink `#1B1B17`/`#EFEEE9`, Forest `#21771A`/`#82EC9C`, Umber
`#603205`/`#C8AB91`, Graphite `#8A8985`/`#81807C`. Series are content colours, chosen CIEDE2000 ≥ 20 from every node
family (nearest 20.9) and never the danger red (nearest 15.2); series ΔE (OKLab) ≥ 16.6, CVD ≥ 9.8. The N1 strip uses
Ink (the point) and Graphite (the rest).

**B1 (1440 × 3992)**: order 02 → 15 top to bottom (12 OG, 13 contrast | 14 decisions, 15 guidance last). Height budget:
page 16/12, section heads 24, panels 11/23/15 with 10 gaps, anatomy cells 84, state cells 76 (labels 6 from the bottom,
clear of the exterior badges), layer-frame minis 52, sidebar specimen 8 rows (one per state), dock specimen 11/15, edge
strip 52, OG unfurl text on one line, contrast rows 22, §14 lists 12/18 with the lead in the section note, §15 table
rows 22 with the series rule under it and the PD §A note under its renders.

**B6 (1440 × 3998)**: rows at y 16 / 1192 / 1640 / 2148 / 3522 with 20 gaps and 28px captions.
Row A: 05 share dialog light (20) | 05 share dialog dark (524), 8px stacks, dialogs 19/23 padding | 04 phone (1028)
over 06 settings light (390 × 196, control wraps under the label). Row B: 01 turn popover (20, 480 × 400, pair
centred) | 02 model picker (524, 480 × 360, trimmed from 440 and noted; picker + 12 + composer centred) | 06 settings
dark (1028). Row C: 03 share landing (20, 720 × 450) | 07 new-thread (764, 656 × 460; composer 608, input 64).
Row D: 08 strip light (20) | dark (730), 688 × 1326 (16 gaps, 20/24 padding). Row E: 09 pair under one title
"Theme switch keeps state · dark → light" with a `s-switch` connector on the gap ("same DOM · value · focus ·
scroll"), 450 × 432 frames; 10 unthemed (968). The 09/10 copies are Node Details only (no Environment row, no dock),
400 tall, ending with their own 24px radius inside the frame; 09 is scrolled 298 (strip bar at the top, typed and
focused Review note at the bottom), 10 at scroll top with the fold after the pill row. 04: the sheet header (handle,
heading, close) is pinned; the body is drawn scrolled 47 so the fold falls between lead lines and the pills, the
disabled invoke card and the locked Review note sit above the redaction footer.

## Round 5 (review r4) — what changed in the kit and the boards

**Authored N1 page in B's own language (`authored/authored.css`, all six boards; supersedes the round-4 timeline)**:
page gap 12, padding 12/16, lead 14/20. The sequence is a **sticker trail**: four 32 × 24 stickers (999 radius) filled in
the guidance link colour (`#B13856` + white numeral / `#FF9DAD` + `#100F0D`), evenly spaced in one row and joined by
1.5px gentle arcs in the same colour (gene E: a circle 2.2 × the gap wide clipped to its top gives curvature 0.12 ×
length at any page width; ends on the sticker mid-line, 4 px clear). Labels (12/16, one line each) alternate above
(1, 3) and below (2, 4) the row: 1 left-aligned, 2 and 3 centred on their sticker, 4 right-aligned, so every label fits
on one line from 272 px up. Trail height 64. The strip is drawn in B's series: series 3 **Umber** (`#603205` + white /
`#C8AB91` + `#100F0D`) for "2 rolled back · stale grants retained", series 4 **Graphite** for "5 rotation paused", bar
24 with fully rounded ends (radius 999), the counts inside at the bar's outer ends, and each full label hung under its
segment on a 1px tick in the segment colour, 12 px in from the end, directly under the count (the Graphite label drops
to a second line, its tick running past the first). No swatch legend; lime never appears. Desktop sheet height 310
(was 380). `check-authored.mjs` passes (no `bottom`, which the compiler does not allow; `inset`/`top` instead).

**Unthemed specimen (B6 10)** is the Eval fixture, strings verbatim from `packages/eval-runner/src/fixtures/node-detail.ts`:
heading `fixture.node-detail` / "Accepted Visual Node Detail" (`layout-template`, F3 Data disc; added to `sprite.html`),
white card: eyebrow "Deterministic Eval fixture", "Save the midday surplus", the battery paragraph, "Status · Ready for
constrained rendering", and Morning 3 kWh / Midday 6 kWh / Evening 4 kWh bars (the fixture's light colours, no theme
rules). It needs 427 px of the 432 frame, so 10 crops the dark inspector to its Node Details body (no header row) and
lets the card run past the frame's bottom edge; no N1 controls (the fixture node's own capabilities are not the point).

**Kit (`components.css`)**: `.b-insp-body` gap 16 → 12 and `.b-actions` gap 12 → 8, so the pills and the invoke
card's title rise above the one-third dock at scroll 0 on B2/B3; new `.b-field-plus` puts the last authored input and
the universal **+** on one row (+ last, centred on the 40 px input). B2/B3 body: heading 102–144 · sheet 156–466 · pills
478–510 · invoke 518–580 (fold at 550 between its title and description) · Review note + **+** 588–652; 570 of content,
thumb 6 × 354. Everything cannot fit at scroll 0: the dock starts at y 550, the Node Details viewport is 452, and the
page (≥ 300 with a 3-line lead, the 64 trail, the 2-line strip labels and the 2-line note) plus the controls (182) plus
the heading (58) need ≥ 540.

**B6**: 04's phone sheet body (540) now fits its 574 viewport, so it is drawn unscrolled with no thumb; 09 is scrolled to
the end (216 of 570: strip at the top, the typed Review note with **+** inline at the bottom; the staged undo / commit
glyphs are dropped so the typed value stays readable beside the +), thumb 6 × 216 at y 180. **B1 §15**: the N1 cards pad
16 so the sheet renders at the inspector's exact width (306).
