# Palette space — summary (Gen 1 → Gen 2)

Written by the orchestrator from the synthesis agent's notes (its own file write was blocked by the harness) and the
final, re-judged scores in `judge-scores.json` / `ps-00-map.dc.html`.

## What is in the space

- **29 palettes**: K1–K4 (the Gen-1 reel palettes, re-run through the same engine as controls) plus 25 new.
- **kanishyamo, 17** (K1–K17): 16 flat Pantone-chip combinations from four colour reels and one k-means palette from
  the poster-redesign reel. Regions: *poster* 11, *pop* 6.
- **meghatheeng, 12** (M1–M12): photographic mood palettes clustered from video frames (M12 from a photo carousel).
  Region: *photographic*. Accents were lifted only to chroma ≈ 0.10 to keep the film mood.
- Default themes: 16 light, 12 dark, 1 system.

## How they were engineered and judged

- `engine.mjs` applies the Gen-1 rules (report 08, brief §2.5/§3.2/§3.3, addendum §B) and changes only lightness when
  fixing contrast. On K1–K4 it reproduces brief §6: 84, 82, 68 and 69 of about 88 tokens are identical.
- 29 of 29 pass the hard floors after tuning (25 needed overrides). 14 have zero warnings. 18 meet the family-colour
  target (ΔE 15 normal / 8 colour-blind) in both themes.
- Three independent judges: **viability** (contrast headroom, status conflicts, family capacity), **character**
  (memorable, keeps its source's feel, distinct) and **fit** (calm for long graph sessions, state legibility, light/dark
  parity). 5 points each, 15 total. A review pass re-judged against the measurements printed on the cards.

## Final ranking (total / 15)

| Total | Palettes |
|---|---|
| 12 | K4 Small Things (Gen-1 D) |
| 11 | K5 Lido Coral · K6 Mustard Cellar · K9 Riso Ultramarine · K12 Mocha Amber · M12 Parchment Chilli |
| 10 | K1 Nocturne (Gen-1 A) · K2 Surly (Gen-1 B) · K3 Apex (Gen-1 C) · M8 Petrol Camel · M9 Powder Lime |
| 9 | K8 Cocoa Bubblegum |
| 8 | K7 · K16 · K17 · M1 · M2 · M7 · M10 |
| 7 | K10 · K11 · K13 · K14 · M6 |
| 6 | M3 · M4 · M11 |
| 5 | K15 · M5 |

## Clusters

- **Cool night** (K1, K7, K10, K13, K14, K16): all variants of A's structure; none beats K1.
- **Pink or lime stamp** (K2, K17, K8, M12, M9).
- **Cool ink on light paper** (K3, K5, K9, M1, M8).
- **Earth block with ink primary** (K4, K6, K12, K11, M3).
- **Warm-earth paper** (M4, M6, M10, K15): near-duplicates.
- **Warm dark** (M2, M5, M7, M11): the genuinely new region. Weak alone, useful as a warm dark neutral ramp to lend.

## Strongest new candidates and their main risk

- **K5 Lido Coral**: the calmest (fit 5), widest families (19.9/10.4), no overrides needed. Risk: generic teal-and-coral;
  primary label only 4.52:1; the ring is 10.8 ΔE from success green.
- **K12 Mocha Amber**: the only palette whose colour lives in the chrome (a mocha sidebar block); amber means "needs you".
  Risk: the mid-tone block holds one text grade and cannot carry the teal ring (2.21:1).
- **K6 Mustard Cellar**: widest families of all (19.9/11.4); berry is used only for selection. Risk: a heavy, all-warm field.
- **M12 Parchment Chilli**: hue-free chrome with colour rationed to two stamps (pink = accepted, chilli = failed).
  Risk: in dark the parchment ring is only 4.8 ΔE from text and focus, so selection relies on shape.
- **M8 Petrol Camel**: calm, led by temperature rather than saturation; zero warnings. Risk: the near-grey petrol makes
  selection and the brand subdued.
- **Wildcard K9 Riso Ultramarine**: character 5, fit 2. Risk: fatigue over hours; failure and approval collapse under
  colour-blind simulation (0.7).

## Gaps the space exposes

- No strong new **dark-first** palette: every dark-default newcomer scores 8 or less.
- Only K12 has a mid-tone ground; 9 of 12 photographic accents sit at chroma ≈ 0.10 (one row on the map).
- Warm film accents sit in the red–amber hue band reserved for failure and approval, so they must read as positive by
  lightness and chroma alone, or take over those meanings.
- Five poster palettes lose their only hot colour to "danger", leaving no positive signal (the A/D pattern).

## Proposed Gen-2 slate (palette × Gen-1 structure)

Each pairing keeps a Gen-1 layout and swaps only the palette, so comments separate palette taste from structure taste.

| Branch | Pairing | Question it answers |
|---|---|---|
| G2-A | A Orbit × **M7 Perfume Greige** | Should the dark default stay cool or go warm, and is "colour only while working" enough signal? (weakest pick — lower-risk swap: M2) |
| G2-B | B Sticker × **M12 Parchment Chilli** | Is B's charm the rose everywhere, or the rationed stamp? |
| G2-C | C Index × **K9 Riso Ultramarine** | Where is the loudness ceiling — fatigue versus identity? (lower-risk swap: K5) |
| G2-D | D Stamp × **K12 Mocha Amber** | Does colour in the chrome beat D's "colour belongs to content"? (lower-risk swap: K6) |

Every crossover must re-run the family-colour check (brief §6.0). Known knock-ons: G2-A links need underlines (greige
interaction colour); G2-B running becomes neutral ink and lime is removed; G2-C draft loses the yellow highlighter;
G2-D gains a teal chrome accent it did not have.

**Side finding.** The re-judge measured K3 (C's Gen-1 palette through the engine) and found the light running arc and badge
edge at 2.33:1 on the powder canvas (strokes need 3.2). Check C's Gen-1 boards for the same issue before Gen 2.
