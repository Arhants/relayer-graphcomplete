# 20 — Expanded palette sources (raw extraction, 2026-09-27)

Sampled in the browser from public posts (logged-out view shows each profile's latest 12 posts only).
Method A (kanishyamo "colour combination" reels): the Pantone-card template puts three flat chips in a row; chips were
detected as flat rectangles (per-cell SD ≤ 4 on a 270×480 frame) or sampled at fixed chip positions with an SD ≤ 6 gate,
and only values that held steady across frames were kept (skin tones from the presenter's hand were rejected).
Method B (photographic moods): OKLab k-means over video frames (every 0.5–1.5 s, 36×64 px) per segment and for the whole
video; percentages are pixel share; C = OKLCH chroma.

## kanishyamo — flat Pantone combinations (ground · ink · accent as presented, left→right)

| id | post | chip 1 | chip 2 | chip 3 | notes |
|---|---|---|---|---|---|
| K1 | reel/DdjSuSZyMwY | #332E34 charcoal | #7779DF periwinkle | #F54731 signal red | Gen-1 prototype A |
| K2 | reel/DdjSuSZyMwY | #FDFAEA marshmallow | #E65979 desert rose | #C1E357 lime | Gen-1 prototype B |
| K3 | reel/DdjSuSZyMwY | #9AB9C2 powder blue | #0C6FDC cobalt | #FEFD15 electric yellow | Gen-1 prototype C |
| K4 | reel/DdjSuSZyMwY | #B9B864 olive | #D5E3FB ice | #F44731 red-orange | Gen-1 prototype D |
| K5 | reel/DdwI_GkSwTZ ("More colour combinations for your creative bone") | #048297 teal | #DA6666 coral rose | #F6F9F8 off-white | |
| K6 | reel/DdwI_GkSwTZ | #D8B44D mustard | #390F14 oxblood | #8B3047 berry | |
| K7 | reel/DdwI_GkSwTZ | #07526C deep sea teal | #062636 midnight | #D96972 rose | |
| K8 | reel/DdwI_GkSwTZ | #D9DCD9 pale grey | #725345 cocoa | #DE5276 hot pink | |
| K9 | reel/DdwI_GkSwTZ | #F5EACF cream | #1708E3 ultramarine | #FF7543 orange | |
| K10 | reel/DdbpiL7SZV3 ("I found colours inspirations…") | #A1B6FA periwinkle | #FB6016 blaze orange | #410606 maroon | |
| K11 | reel/DdbpiL7SZV3 | #EBE0D9 linen | #640A2A burgundy | #D83B36 red | |
| K12 | reel/DdbpiL7SZV3 | #946E65 mocha | #0D4A51 deep teal | #FFB500 amber | |
| K13 | reel/DdbpiL7SZV3 | #EED778 butter | #02C7AA turquoise | #2F4A51 slate teal | |
| K14 | reel/DdrIvMmS2jA ("Oceans best colour combos") | #B89AFE lavender | #8D2222 oxblood red | #E68F2F tangerine | |
| K15 | reel/DdrIvMmS2jA | #A06737 caramel | #86CAFC sky | #F5ECD9 cream | |
| K16 | reel/DdrIvMmS2jA | #EBE201 lemon | #C1D8EE mist blue | #020125 midnight navy | |
| K17 | reel/DVOW2mtkrep (poster redesigns, k-means) | #F97AAC pop pink | #0F9A2F kelly green | #17171B ink | support: #E2E2B4 butter cream, #2665D7 cobalt, #E0E338 acid yellow |

## meghatheeng — photographic mood palettes (k-means; whole-video clusters first, notable segment colours after)

| id | post | caption gist | whole-video clusters (share, chroma) | notable segment colours |
|---|---|---|---|---|
| M1 | reel/DZSQUT5za6x | anxious girl's road trip | #ABB0B3 31% · #ECEBEA 16% · #918C81 14% · #493C3C 11% · #276459 11% (C.058) · #855E58 10% (C.05) · #1F191D 8% | forest #106451 (52% of a scene), cornflower sky #8EA8CF (88% of a scene), sage #A6B192, mauve #92595D |
| M2 | reel/Ddt3eIdTu8W | 2:33 am best makeup | #574D48 · #181216 · #363233 · #A3897C · #7E6E66 · #D39886 (C.076) · #E3B7A9 | night vanity: cocoa black + blush |
| M3 | reel/DdrQ8KsTbCh | mules (adidas) | #C3AE98 · #E6DCC9 · #4F4737 · #957966 · #3F251F · #C03636 (C.174) · #19110F | olive drab #464A32 (56% of a scene), chilli red #C03636 |
| M4 | reel/DdosdaCTVOP | "girl I can't take this" | #BFB2A2 · #AD8B72 · #A46244 (C.095) · #834432 (C.09) · #46302F · #E3D8CA · #1D1417 | terracotta + rust on oat |
| M5 | reel/Ddl-7mUTXmB | cooking video, tungsten kitchen | #191418 · #382F30 · #877364 · #A8907C · #60524A · #C8AF98 · #E8D4BF | a clean warm-brown ramp (dark-mode neutral candidate) |
| M6 | reel/DdY3Pb9Tx_6 | "lachha representation" | #E2D6CB · #C4B0A1 · #5F3D31 · #AB8775 · #1B1518 · #875F52 · #382929 | bone, fawn, umber |
| M7 | reel/DdWhuzSTxx7 | perfume, 4 stages of grief | #554E47 · #151113 · #353431 · #A58E7D · #837166 · #DAA590 (C.07) · #E7D0C2 | charcoal greige + skin blush |
| M8 | reel/DdRg_mMzOtL | life update, Delhi | #C7A886 camel (C.059) · #5B6F70 petrol · #D5D5CF fog · #A48167 · #211D1E · #789FB4 dusk blue (C.052) · #444D4D | petrol teal #495C61 recurring |
| M9 | reel/DdEi0RaTXqZ | beauty lab | #D1D9E6 powder blue 40% · #000000 · #C5A6AB dusty rose · #A08079 · #7F5853 · #231D1E | lime #B7C247 (C.14) accent in the end card |
| M10 | reel/DdB07uhzWzv | haircut | #8A7562 · #A4907D · #46291B chestnut · #E3D6CB · #C7AD9D · #6B5947 · #211717 | |
| M11 | reel/Dcyb5TFTwPd | friends & food back home | #85644E toffee · #251D1E · #553F38 · #AE8866 caramel (C.064) · #C2B2A2 · #DCDCD3 · #010001 | |
| M12 | p/DRr59dOCGLY (photo carousel) | "pick me choose me love me" | #E6DECD parchment · #BFAB99 · #967B69 · #4E3F39 · #C33E3C chilli (C.169) · #1E1313 | pink #E688A4 (C.119) small accent; terracotta #9D5738 |

Character of the two sources:
- kanishyamo: flat, saturated, poster-grade three-colour combinations (high chroma inks and accents; strong figure/ground).
- meghatheeng: low-chroma, film-like, warm neutral ramps (C < 0.06 for most clusters) with one occasional strong accent
  (forest green, chilli red, cornflower, lime). Good source for neutral ramps and "quiet" UI palettes; accents need
  to be lifted in chroma for UI use.
