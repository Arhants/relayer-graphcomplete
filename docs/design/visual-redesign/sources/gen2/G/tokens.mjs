// Gen-2 G · Sticker × Riso — the single source of truth for every colour token.
// Parent: Gen-1 B Surly "Sticker" (gen1/B/tokens.mjs) — every parent token NAME is kept, no token is added.
// Palette: K9 Riso Ultramarine (research/palette-space/tokens/K9.json, engine v1): cream paper #F5EACF, ultramarine
// ink #1708E3, fluoro-orange accent #FF7543 (= failure). Mapping decisions and risk fixes: spec-gen2.md.
// `src`: "K9" (engine token used as is), "K9 exact" (a source swatch, exact), "K9†" (engine value changed here; reason
// in spec-gen2.md §3), "G" (decided here: B's structure needs a value K9 does not define), "brand" (logo, unchanged),
// "parent" (B value kept: not a palette colour).
// build-kit.mjs turns this into the .theme-light / .theme-dark blocks of kit.css; contrast.mjs checks it.

const T = (light, dark, src, note = '') => ({ light, dark, src, note });

export const TOKENS = {
  // surfaces — light: the exact cream is the page, sidebar and canvas (the riso paper); floating cards are white stock
  'bg': T('#F5EACF', '#110F0C', 'K9 exact', 'exact riso cream in light; window first paint'),
  'sidebar': T('#F5EACF', '#171511', 'K9 exact', 'light = exact cream'),
  'surface': T('#FEFCF6', '#171511', 'K9†', 'white-stock cards on the cream (light = un-rebased neutral-1); inspector, prompt card, composer'),
  'field': T('#F1EFEA', '#211E17', 'K9†', 'light = K9 neutral-1 (the engine put it on --surface); inputs, chips, Stop, pager'),
  'overlay': T('#FEFCF6', '#28251E', 'K9†', 'popovers, dialogs (light = surface)'),
  'hover': T('#DFDBD1', '#28251E', 'K9'),
  'selected': T('#D9D4C9', '#302D24', 'K9'),
  'border': T('#D0CCC1', '#3A372E', 'K9'),
  'border-strong': T('#817D73', '#777368', 'K9', 'input and Stop boundaries, layer frames'),
  // text (K9 ink #13110D is the palette's near-black)
  'text': T('#13110D', '#F0EEE7', 'K9', 'also the focus ring'),
  'text-muted': T('#5A574F', '#BDB9B0', 'K9', 'secondary text and placeholders'),
  'text-faint': T('#858177', '#726E64', 'K9', 'disabled and decoration only'),
  // interaction — the ultramarine ink, rationed: exact only on primary, selection and running (+ the update dot)
  'accent-solid': T('#1708E3', '#264AFF', 'K9 exact', 'exact ultramarine (light) / lifted electric blue (dark); update dot, progress'),
  'accent-solid-text': T('#FFFFFF', '#FFFFFF', 'K9', 'white on ultramarine 9.63 / 5.99'),
  'accent-solid-hover': T('#1200C5', '#1C30F7', 'K9'),
  'accent-solid-alt': T('#1708E3', '#264AFF', 'K9 exact', 'Send, Download, primary buttons, comment badge (B: white label; K9 alt #4471FF carried ink, not used)'),
  'accent-solid-alt-text': T('#FFFFFF', '#FFFFFF', 'K9†', 'white on the ink 9.63 / 5.99'),
  'accent-soft-bg': T('#DFE4FC', '#0B1A4E', 'K9†', 'quiet ultramarine tint: selected sidebar row, Running pill'),
  'accent-text': T('#2B439D', '#9AB8FF', 'K9†', 'quiet ultramarine (C 0.15, half the ink chroma): links, row bars, Running pill + caption'),
  'selection-ring': T('#1708E3', '#5F8AFF', 'K9 exact', 'exact ultramarine on cream 8.05'),
  'running': T('#1708E3', '#5F8AFF', 'G', 'gene Q = accent (B); K9 left running open'),
  // acceptance — a riso green sticker, only when GraphComplete accepts (B's lime gene; K9 has no acceptance ink)
  'accepted-fill': T('#42C070', '#69D98D', 'G', 'riso green, a fill only; dark one step lighter so it clears the fluoro-orange failure under CVD (9.4)'),
  'accepted-fill-text': T('#13110D', '#110F0C', 'G'),
  'accepted-mark': T('#168B49', '#69D98D', 'G', 'green as a line (rim on paper)'),
  // graph
  'canvas-bg': T('#F5EACF', '#110F0C', 'K9 exact', 'flat poster paper, no grid (B gene)'),
  'edge': T('#7E7A70', '#68645A', 'K9†', 'light one step darker than K9 #868278 (3.20 -> 3.53 on the cream: the 3.2 stroke margin had 0.004 to spare)'),
  'edge-strong': T('#5C5951', '#B6B2A9', 'K9', 'incident edges of the selected node; hover stroke'),
  'node-fill': T('#FEFCF6', '#211E17', 'K9†', 'light = white-stock sticker on cream'),
  'node-stroke': T('#7E7A70', '#726E64', 'K9†', '= --edge in light (K9 #868278 was 3.20 on the cream)'),
  'draft-outline': T('#7E7A70', '#726E64', 'K9†', '= --node-stroke, dashed (a dashed 1.5px line needs the margin most)'),
  // status — the fluoro orange means failure only; approval is separated from it by lightness (CVD fix)
  'danger-solid': T('#C04100', '#FF7543', 'K9', 'failed node outline; dark = exact fluoro orange'),
  'danger-strong': T('#C04100', '#CF490A', 'K9', 'failed badge disc (white glyph)'),
  'danger-text': T('#B53C00', '#FFA383', 'K9'),
  'danger-soft-bg': T('#FFEBE5', '#391C12', 'K9'),
  'warning-solid': T('#593C00', '#FECD5C', 'K9†', 'approval: deep ochre (light) / gold (dark), CVD >= 8 from failure'),
  'warning-text': T('#593C00', '#FECD5C', 'K9†', 'approval text and glyphs'),
  'warning-soft-bg': T('#F5D77E', '#473506', 'K9†', 'butter fill, lighter-darker than the failure tint so the pills differ under CVD (11.7 / 8.3)'),
  'success-text': T('#00753A', '#60DB89', 'K9', 'diff additions'),
  'draft-solid': T('#5B5546', '#756E5E', 'K9'),
  'draft-text': T('#6B6555', '#C4BDAC', 'K9', 'working tag text, Draft caption'),
  'draft-soft-bg': T('#F2F0EB', '#272520', 'K9', 'working tag fill'),
  'diff-add': T('#00753A', '#60DB89', 'K9', '= --success-text'),
  'diff-del': T('#5A574F', '#BDB9B0', 'K9', '= --text-muted + the "−" glyph: orange means failure only'),
  // brand + fixed inks
  'ink': T('#FFFFFF', '#1B1B17', 'G', 'no kit use since the running badge moved to --accent-solid / --accent-solid-text (spec-gen2 §3.4); kept so every B name exists'),
  'white': T('#FFFFFF', '#FFFFFF', 'parent'),
  'cream': T('#FAF2E6', '#FAF2E6', 'brand', 'logo tile (§2.8)'),
  'deck': T('#D74326', '#D74326', 'brand', 'logo deck; used only inside the logo stand-in'),
  'sticker-bg': T('#FEFCF6', '#171511', 'G', 'download / About card: white stock on the cream (light), --surface in dark'),
  'scrim': T('rgba(19,17,13,.32)', 'rgba(0,0,0,.56)', 'parent', 'behind dialogs (B geometry, K9 ink)'),
  // macOS window chrome (not themeable in macOS)
  'tl-close': T('#FF5F57', '#FF5F57', 'parent'),
  'tl-min': T('#FEBC2E', '#FEBC2E', 'parent'),
  'tl-zoom': T('#28C840', '#28C840', 'parent'),
  'tl-rim': T('rgba(0,0,0,.14)', 'rgba(0,0,0,.28)', 'parent'),
};

// Shadows (not colours; listed for kit.css only) — parent geometry, K9 ink (#13110D = 19,17,13)
export const SHADOWS = {
  'shadow-card': T('0 1px 2px rgba(19,17,13,.06), 0 4px 16px rgba(19,17,13,.08)', 'none', 'parent', 'prompt card, composer, zoom group, hint, download card'),
  'shadow-float': T('0 1px 2px rgba(19,17,13,.06), 0 12px 40px rgba(19,17,13,.12)', 'none', 'parent', 'inspector (light); dark uses surface + border'),
  'shadow-lift': T('0 4px 12px rgba(19,17,13,.18)', 'none', 'parent', 'selected pill lifts (light only)'),
  'shadow-pop': T('0 2px 4px rgba(19,17,13,.06), 0 16px 48px rgba(19,17,13,.16)', '0 16px 48px rgba(0,0,0,.5)', 'parent', 'popovers, dialogs, sheets'),
};

// Family colours: solid 28px disc + icon colour (white or #1B1B17). Re-searched for G by families.mjs (brief §3.3).
// The parent's values drive the family ORDER (nearest-hue assignment) in families.mjs; `parent` keeps them for the record.
export const FAMILIES = {
  f1: { name: 'Document', light: '#BE5DD1', lightIcon: '#1B1B17', dark: '#F2ADFF', darkIcon: '#1B1B17', icons: ['scroll-text', 'file-text'], parent: ['#5D2DAE', '#AB8EFF'] },
  f2: { name: 'Code', light: '#00668D', lightIcon: '#FFFFFF', dark: '#0098D0', darkIcon: '#1B1B17', icons: ['code', 'git-compare'], parent: ['#006D92', '#72D1FF'] },
  f3: { name: 'Data', light: '#009393', lightIcon: '#1B1B17', dark: '#00CACA', darkIcon: '#1B1B17', icons: ['database-backup', 'table'], parent: ['#00A486', '#009D81'] },
  f4: { name: 'Systems', light: '#767300', lightIcon: '#FFFFFF', dark: '#959100', darkIcon: '#1B1B17', icons: ['key', 'server'], parent: ['#826D00', '#CFAF00'] },
  f5: { name: 'People & agents', short: 'People', light: '#960059', lightIcon: '#FFFFFF', dark: '#C93A82', darkIcon: '#FFFFFF', icons: ['users', 'bot'], parent: ['#D665CF', '#B545AE'] },
  f6: { name: 'Reasoning', light: '#6529A9', lightIcon: '#FFFFFF', dark: '#8E57D8', darkIcon: '#FFFFFF', icons: ['route', 'brain'], parent: ['#596AE8', '#596AE8'] },
};
