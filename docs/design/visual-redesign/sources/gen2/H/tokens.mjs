// Gen-2 H · Sticker × Cocoa — the single source of truth for every colour token.
// Parent: Gen-1 B · Surly "Sticker" (gen1/B/tokens.mjs: every token NAME kept). Palette: K8 Cocoa Bubblegum
// (research/palette-space/tokens/K8.json, @kanishyamo reel/DdwI_GkSwTZ): ground #D9DCD9, ink #725345, accent #DE5276.
// `src` records where each value came from:
//   "K8"      the K8 token of the same role, unchanged
//   "K8 exact" a creator colour used exactly
//   "K8→"     a K8 token moved to a different parent role (the mapping is in spec-gen2.md §2)
//   "H-fix"   changed here to fix a Gen-2 brief risk or a floor on B's structure (reason in spec-gen2.md §5)
//   "H"       decided here because neither the parent nor K8 has the role (reason in spec-gen2.md §5)
//   "brand"   unchanged from the parent (logo, window chrome)
// build-kit.mjs turns this into the .theme-light / .theme-dark blocks of kit.css; contrast.mjs checks it.

const T = (light, dark, src, note = '') => ({ light, dark, src, note });

export const TOKENS = {
  // surfaces (K8 green-grey neutrals, h146 C0.007; the grey poster ground is the light canvas)
  'bg': T('#F7F9F7', '#0F100F', 'K8', 'header strip, window first paint'),
  'sidebar': T('#F7F9F7', '#141614', 'K8'),
  'surface': T('#FBFDFB', '#141614', 'K8', 'floating cards, inspector, prompt card, composer'),
  'field': T('#EEF2EE', '#1D1F1D', 'K8', 'inputs, chips, Stop'),
  'overlay': T('#FBFDFB', '#242624', 'K8', 'popovers, dialogs'),
  'hover': T('#E7EAE7', '#242624', 'K8'),
  'selected': T('#DFE3DF', '#2B2E2B', 'K8'),
  'border': T('#D7DBD7', '#353835', 'K8'),
  'border-strong': T('#747874', '#707470', 'H-fix', 'light: K8 #838783 is 2.64 on the grey canvas, where B draws its layer frames; = edge (3.24)'),
  // text
  'text': T('#191B19', '#ECEEEC', 'K8', 'also the focus ring'),
  'text-muted': T('#5E615E', '#B6BAB6', 'H-fix', 'light: K8 #626562 is 4.27 on the grey canvas (Stopped caption, authored page); K8 canvas-label-muted'),
  'text-faint': T('#888C88', '#6C706C', 'K8', 'disabled and decoration only'),
  // accent family = cocoa (interaction). K8 semantic plan: cocoa = primary, selection, links.
  'accent-solid': T('#9F7E6F', '#9F7E6F', 'K8→', 'milk cocoa (K8 accent-solid-alt): large fills with an ink label — update dot, update progress'),
  'accent-solid-text': T('#191B19', '#0F100F', 'K8→', 'K8 accent-solid-alt-label'),
  'accent-solid-hover': T('#AC8A7B', '#AC8A7B', 'H', 'milk cocoa +0.04 L (unused by components; kept for the token set)'),
  'accent-solid-alt': T('#725345', '#7C5C4E', 'K8 exact', 'cocoa (K8 accent-solid): primary buttons, Download, comment badge; light = exact creator ink'),
  'accent-solid-alt-text': T('#FFFFFF', '#FFFFFF', 'K8', 'K8 accent-solid-label'),
  'accent-soft-bg': T('#EBE3DB', '#2B221C', 'H-fix', 'oat/cocoa tint: selected sidebar row, [PD] tags. K8 #FFE9E0 / #311A0F sat dE 1.6 / 3.8 from the pink running tint and read as blush'),
  'accent-text': T('#725345', '#ECC8B8', 'K8 exact', 'links, selected-row bar, current turn / option bars; light = exact cocoa, dark = latte'),
  'selection-ring': T('#725345', '#ECC8B8', 'H-fix', 'light exact cocoa (5.00 on the grey); dark latte = accent-text: K8 milk cocoa #9F7E6F sat CVD 2.1 from the pink running arc'),
  // live work = bubblegum pink (K8 accent). Gene Q "running ink = the accent" holds: the accent is pink.
  'running': T('#D43064', '#DE5276', 'H-fix', 'orbit arc, running badge, Send. Light: exact #DE5276 deepened to L0.58 (arc 3.01 -> 3.45 on the grey); dark exact'),
  'running-text': T('#B00D4C', '#F67591', 'H', 'NEW: Running pill text, "Running" caption, sidebar Running mark (>= 4.5 on the grey canvas)'),
  'running-soft-bg': T('#FFE8EB', '#38121B', 'K8→', 'NEW: Running pill fill (K8 signal-soft-bg)'),
  'running-ink': T('#FFFFFF', '#0F100F', 'H', 'NEW: glyph on the running badge and the Send arrow (light white 4.77, dark ink 5.06)'),
  // acceptance = mint (K8 success hue 152). B's gene R keeps a special colour that appears only when GraphComplete accepts.
  'accepted-fill': T('#80D497', '#80D497', 'H', 'mint (K8 success hue 152, L0.80): a fill only; replaces the parent lime'),
  'accepted-fill-text': T('#191B19', '#0F100F', 'H'),
  'accepted-mark': T('#2F7C49', '#80D497', 'K8→', 'mint as a line: light = K8 success-text (3.70 on the grey canvas); dark = the fill'),
  // graph
  'canvas-bg': T('#D9DCD9', '#0F100F', 'K8 exact', 'light = exact creator ground (grey poster card), flat, no grid'),
  'edge': T('#747874', '#626562', 'K8'),
  'edge-strong': T('#5E615E', '#B0B4B0', 'K8', 'incident edges of the selected node; hover stroke'),
  'node-fill': T('#FBFDFB', '#1D1F1D', 'K8'),
  'node-stroke': T('#747874', '#6C706C', 'K8'),
  'draft-outline': T('#747874', '#6C706C', 'K8', '= --node-stroke, dashed'),
  // status
  'danger-solid': T('#A93800', '#FE8160', 'H-fix', 'failed node outline. Light brick moved to h40 (K8 #AB3512 was dE 9.1 from the pink running text); dark exact coral'),
  'danger-strong': T('#A93800', '#BB4717', 'H-fix', 'failed badge disc (white glyph). Dark: K8 #C85030 sat dE 9.6 from the pink'),
  'danger-text': T('#A93800', '#FFA289', 'H-fix', 'light: K8 #BC4525 is 3.78 on the grey canvas ("Failed" caption)'),
  'danger-soft-bg': T('#FFEBE6', '#3A1C14', 'K8'),
  'warning-solid': T('#976712', '#C08E43', 'K8', 'approval'),
  'warning-text': T('#93640C', '#E9B452', 'H-fix', 'dark: K8 #E7B369 sat dE 7.6 from the coral danger text (Gen-1 floor 8); moved to h80, 9.4'),
  'warning-soft-bg': T('#FEEED8', '#30220E', 'K8'),
  'success-text': T('#2F7C49', '#86D29B', 'K8', 'diff additions'),
  'draft-solid': T('#4D594D', '#667366', 'K8'),
  'draft-text': T('#536253', '#B4C2B4', 'H-fix', 'working tag text, "Draft" caption; light K8 #647164 is 3.72 on the grey canvas'),
  'draft-soft-bg': T('#EDF1ED', '#232623', 'K8', 'working tag fill'),
  'diff-add': T('#2F7C49', '#86D29B', 'K8'),
  'diff-del': T('var(--text-muted)', 'var(--text-muted)', 'H-fix', '= --text-muted: a deletion count is neutral, never red (Gen-2 canonical form, item 6)'),
  // brand + fixed inks
  'ink': T('#1B1B17', '#1B1B17', 'brand', 'icon ink on family fills (brief §3.3)'),
  'white': T('#FFFFFF', '#FFFFFF', 'brand'),
  'cream': T('#FAF2E6', '#FAF2E6', 'brand', 'logo tile (§2.8)'),
  'deck': T('#D74326', '#D74326', 'brand', 'logo deck; used only inside the logo stand-in'),
  'sticker-bg': T('#FBFDFB', '#141614', 'H', 'download / About card = --surface (a cream card read dirty on the cool grey); the logo tile keeps cream'),
  'scrim': T('rgba(25,27,25,.32)', 'rgba(0,0,0,.56)', 'K8', 'behind dialogs (K8 neutral ink)'),
  // macOS window chrome (not themeable in macOS)
  'tl-close': T('#FF5F57', '#FF5F57', 'brand'),
  'tl-min': T('#FEBC2E', '#FEBC2E', 'brand'),
  'tl-zoom': T('#28C840', '#28C840', 'brand'),
  'tl-rim': T('rgba(0,0,0,.14)', 'rgba(0,0,0,.28)', 'brand'),
};

// Shadows (not colours; parent geometry, K8 neutral ink rgb(25,27,25))
export const SHADOWS = {
  'shadow-card': T('0 1px 2px rgba(25,27,25,.06), 0 4px 16px rgba(25,27,25,.08)', 'none', 'parent', 'prompt card, composer, zoom group, hint, download card'),
  'shadow-float': T('0 1px 2px rgba(25,27,25,.06), 0 12px 40px rgba(25,27,25,.12)', 'none', 'parent', 'inspector (light); dark uses surface + border'),
  'shadow-lift': T('0 4px 12px rgba(25,27,25,.18)', 'none', 'parent', 'selected pill lifts (light only)'),
  'shadow-pop': T('0 2px 4px rgba(25,27,25,.06), 0 16px 48px rgba(25,27,25,.16)', '0 16px 48px rgba(0,0,0,.5)', 'parent', 'popovers, dialogs, sheets'),
};

// Family colours: solid 28px disc + icon colour. Re-searched by families.mjs against THIS palette's reserved colours
// (Gen-1 rules, brief §3.3; spec-gen2.md §3). Values pasted from `node families.mjs` and verified by `node families.mjs --verify`.
export const FAMILIES = {
  f1: { name: 'Document', light: '#641F9F', lightIcon: '#FFFFFF', dark: '#BC85FF', darkIcon: '#1B1B17', icons: ['scroll-text', 'file-text'] },
  f2: { name: 'Code', light: '#003F6E', lightIcon: '#FFFFFF', dark: '#87C3FF', darkIcon: '#1B1B17', icons: ['code', 'git-compare'] },
  f3: { name: 'Data', light: '#00707E', lightIcon: '#FFFFFF', dark: '#009EB1', darkIcon: '#1B1B17', icons: ['database-backup', 'table'] },
  // F4 light, round 2: lifted from #2D4600 (L0.36, read as an ink bullet at 1x: dE 16.7, CR 1.64 vs --text) to #4A5700
  // (L0.43: dE 23.2, CR 2.19 vs --text; white icon 7.91; every families.mjs rule passes; light set min dE 15.1 f3/f4, CVD
  // 8.4). No light Khaki series member can then keep CIEDE2000 >= 20 from it at any hue (work/r2/f4-khaki.mjs, 0 rows; the
  // joint search work/r2/f4-joint.mjs tops out at F4 L0.395), so the authored family gate became floor 15 / target 20:
  // light Khaki #7D7842 sits 15.3 CIEDE2000 / 13.9 OKLab from it (authored/palette.md).
  f4: { name: 'Systems', light: '#4A5700', lightIcon: '#FFFFFF', dark: '#6B9F00', darkIcon: '#1B1B17', icons: ['key', 'server'] },
  f5: { name: 'People & agents', short: 'People', light: '#B247B3', lightIcon: '#FFFFFF', dark: '#AB40AD', darkIcon: '#FFFFFF', icons: ['users', 'bot'] },
  f6: { name: 'Reasoning', light: '#6068E8', lightIcon: '#FFFFFF', dark: '#5B62E1', darkIcon: '#FFFFFF', icons: ['route', 'brain'] },
};
