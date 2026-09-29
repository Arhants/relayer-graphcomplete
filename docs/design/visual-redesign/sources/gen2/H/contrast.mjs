#!/usr/bin/env node
// Gen-2 H · Sticker × Cocoa — contrast table, both themes: every text/background pair and every meaningful mark against
// what it sits on (WCAG 2.2 ratio, pass/fail; APCA Lc advisory). Thresholds: text 4.5, large text 3, marks 3, and the
// brief's 3.2 design margin for strokes <= 2px (§2.5). Plus the state-distinctness table (dE_OK x100, normal and CVD =
// min of protan/deutan) for every pair of colours that mean different things and can meet in one frame.
// Adapted from gen1/B/contrast.mjs: same pairs, plus H's grounds (the light canvas is the grey poster card, not the
// page) and H's new tokens (running-text, running-soft-bg, running-ink).
// Usage: node contrast.mjs            console table (exit 1 on any failure)
//        node contrast.mjs --md       markdown tables (spec-gen2.md §4)
import { contrast, apca, dE } from '../../../../../../scripts/design/color.mjs';
import { TOKENS, FAMILIES } from './tokens.mjs';

const md = process.argv.includes('--md');
const val = (t, theme) => {
  if (t.startsWith('#')) return t;
  const [name, fam] = t.split(':');
  if (fam) return FAMILIES[name][theme + (fam === 'icon' ? 'Icon' : '')];
  if (!TOKENS[t]) throw new Error('unknown token ' + t);
  const alias = /^var\(--(.+)\)$/.exec(TOKENS[t][theme]); // a token defined as another token (diff-del = text-muted)
  return alias ? val(alias[1], theme) : TOKENS[t][theme];
};

// kind: text (4.5) | large (3) | stroke (<=2px mark, 3.2 margin) | mark (3) | info (reported, no gate)
const P = (fg, bg, kind, what) => ({ fg, bg, kind, what });
const PAIRS = [
  // ---- chrome text
  ...['bg', 'sidebar', 'surface', 'field', 'overlay', 'hover', 'selected', 'accent-soft-bg', 'node-fill', 'canvas-bg', 'draft-soft-bg']
    .map((bg) => P('text', bg, 'text', 'primary text')),
  ...['bg', 'sidebar', 'surface', 'field', 'overlay', 'hover', 'selected', 'node-fill', 'canvas-bg']
    .map((bg) => P('text-muted', bg, 'text', 'secondary text, captions, placeholders, kbd')),
  P('text-muted', 'sticker-bg', 'text', 'download-card pitch'),
  P('text', 'sticker-bg', 'text', 'download-card title'),
  P('text-faint', 'surface', 'info', 'disabled only'),
  P('text-faint', 'field', 'info', 'disabled only'),
  P('accent-text', 'sidebar', 'text', 'link in sidebar'),
  P('accent-text', 'surface', 'text', 'link in inspector'),
  P('accent-text', 'accent-soft-bg', 'text', '[PD] tag text, Jump to live'),
  P('running-text', 'running-soft-bg', 'text', 'Running pill'),
  P('running-text', 'canvas-bg', 'text', '"Running" node caption (on the canvas halo)'),
  P('running-text', 'surface', 'text', 'running copy on cards (turn popover glyph row)'),
  P('draft-text', 'canvas-bg', 'text', '"Draft" node caption'),
  P('draft-text', 'draft-soft-bg', 'text', 'working-layer tag'),
  P('text-muted', 'canvas-bg', 'text', '"Stopped" node caption'),
  P('danger-text', 'canvas-bg', 'text', '"Failed" node caption'),
  P('danger-text', 'danger-soft-bg', 'text', 'Failed pill, failure message'),
  P('danger-text', 'surface', 'text', 'failure copy on cards'),
  P('warning-text', 'warning-soft-bg', 'text', 'Needs approval pill'),
  P('warning-text', 'surface', 'text', 'approval dock eyebrow'),
  P('accepted-fill-text', 'accepted-fill', 'text', 'Accepted pill + stamp text'),
  P('accent-solid-alt-text', 'accent-solid-alt', 'text', 'primary button, Download label'),
  P('accent-solid-text', 'accent-solid', 'text', 'milk-cocoa fill label (update dot)'),
  P('running-ink', 'running', 'text', 'Send arrow, running badge glyph'),
  P('diff-add', 'surface', 'text', 'env +adds'),
  P('diff-del', 'surface', 'text', 'env −dels'),
  P('diff-add', 'field', 'text', 'env +adds on field'),
  P('diff-del', 'field', 'text', 'env −dels on field'),
  P('ink', 'cream', 'text', 'logo ink on the cream tile'),
  // ---- family discs: icon on disc (4.5), disc vs grounds (3)
  ...Object.keys(FAMILIES).flatMap((f) => [
    P(`${f}:icon`, `${f}:fill`, 'text', `${FAMILIES[f].name} icon on disc`),
    P(`${f}:fill`, 'node-fill', 'mark', `${FAMILIES[f].name} disc on pill fill`),
    P(`${f}:fill`, 'canvas-bg', 'mark', `${FAMILIES[f].name} disc on canvas (draft hollow, overview)`),
    P(`${f}:fill`, 'surface', 'mark', `${FAMILIES[f].name} disc on inspector / legend`),
  ]),
  P('text-muted', 'field', 'text', 'Neutral icon on --field disc'),
  // ---- graph marks
  P('edge', 'canvas-bg', 'stroke', 'edge 1.5px'),
  P('edge-strong', 'canvas-bg', 'stroke', 'selected-incident edge 2px'),
  P('node-stroke', 'canvas-bg', 'stroke', 'pill outline 1.5px'),
  P('draft-outline', 'canvas-bg', 'stroke', 'draft dashed outline (hollow body = canvas)'),
  P('edge-strong', 'canvas-bg', 'stroke', 'hover outline'),
  P('danger-solid', 'canvas-bg', 'stroke', 'failed 2px outline vs canvas'),
  P('danger-solid', 'node-fill', 'stroke', 'failed 2px outline vs pill fill'),
  P('selection-ring', 'canvas-bg', 'stroke', 'selection ring 2px'),
  P('selection-ring', 'node-fill', 'stroke', 'selection ring vs the pill it hugs'),
  P('text', 'canvas-bg', 'stroke', 'focus ring 2px on canvas'),
  P('text', 'surface', 'stroke', 'focus ring on cards'),
  P('text', 'sidebar', 'stroke', 'focus ring in sidebar'),
  P('text', 'accent-soft-bg', 'stroke', 'focus ring on selected row'),
  P('running', 'canvas-bg', 'stroke', 'running orbit arc (over the canvas)'),
  P('running', 'node-fill', 'stroke', 'running orbit arc over the pill'),
  P('border-strong', 'canvas-bg', 'stroke', 'layer frame (working dashed / retained solid)'),
  P('border-strong', 'surface', 'stroke', 'input, Stop, secondary button boundary'),
  P('border-strong', 'bg', 'stroke', 'boundary on page'),
  P('border-strong', 'field', 'stroke', 'badge disc rim on --field'),
  P('accepted-mark', 'canvas-bg', 'stroke', 'Accepted stamp rim on the canvas'),
  P('accepted-mark', 'bg', 'stroke', 'Accepted pill rim on the page'),
  P('accepted-mark', 'surface', 'stroke', 'Accepted pill rim on cards'),
  P('accepted-fill', 'canvas-bg', 'info', 'mint stamp body vs canvas (the rim carries the edge in light)'),
  // ---- badges (16px discs) against the canvas they sit on; glyphs on discs
  P('running', 'canvas-bg', 'mark', 'running badge disc'),
  P('danger-strong', 'canvas-bg', 'mark', 'failed badge disc'),
  P('white', 'danger-strong', 'text', 'failed badge glyph'),
  P('text-muted', 'field', 'text', 'stopped ■ glyph on --field disc'),
  P('text', 'field', 'text', 'invoke / input / attached glyph'),
  P('accent-solid-alt', 'canvas-bg', 'mark', 'comment badge disc'),
  P('white', 'accent-solid-alt', 'text', 'comment count'),
  P('field', 'text', 'text', 'answered-input badge glyph (inverted disc)'),
  // ---- sidebar marks (12px glyphs: >= 3 as graphics on hovered/selected rows, 4.5 on the plain sidebar)
  P('running-text', 'sidebar', 'text', 'sidebar Running mark'),
  P('running-text', 'hover', 'mark', 'sidebar Running mark on a hovered row'),
  P('running-text', 'accent-soft-bg', 'mark', 'sidebar Running mark on the active row'),
  P('warning-text', 'hover', 'mark', 'Needs-approval 12px glyph on a hovered row (graphic: 3:1)'),
  P('warning-text', 'accent-soft-bg', 'mark', 'Needs-approval 12px glyph on the active row (graphic: 3:1)'),
  P('danger-text', 'hover', 'mark', 'Failed 12px glyph on a hovered row (graphic: 3:1)'),
  P('danger-text', 'accent-soft-bg', 'mark', 'Failed 12px glyph on the active row (graphic: 3:1)'),
  P('warning-text', 'sidebar', 'text', 'sidebar Needs-approval mark'),
  P('danger-text', 'sidebar', 'text', 'sidebar Failed mark'),
  P('accent-text', 'accent-soft-bg', 'stroke', 'selected-row leading bar (3px)'),
  P('accent-text', 'surface', 'stroke', 'current turn / selected option bar (3px)'),
  P('accent-solid', 'sidebar', 'mark', 'update dot'),
  P('accent-solid', 'surface', 'mark', 'update progress fill on a card'),
  // ---- header thread-status symbol (Gen-2 brief item 4; 16px glyph on the header strip)
  P('running', 'bg', 'mark', 'header Running symbol (loader-circle)'),
  P('running-text', 'bg', 'mark', 'header Running symbol, if drawn in running-text'),
  P('warning-text', 'bg', 'mark', 'header Needs-approval symbol (hand)'),
  P('danger-text', 'bg', 'mark', 'header Failed symbol (octagon-x)'),
  P('text', 'bg', 'stroke', 'header Stopping… 2px quarter arc + square (round 2; the --border track is decoration)'),
  // ---- controls
  P('accent-solid-alt', 'surface', 'mark', 'primary button fill vs card'),
  P('accent-solid-alt', 'sticker-bg', 'mark', 'Download fill vs the download card'),
  P('running', 'surface', 'mark', 'Send fill vs the composer card'),
  P('text', 'field', 'text', 'Stop 10px square glyph'),
  P('warning-solid', 'surface', 'mark', 'approval dock icon disc'),
];

// Pairs of colours that mean different things and can meet in one frame: normal dE and CVD (min protan/deutan).
// floor = the value this kit holds; carried = what else distinguishes them when the colour gap is small.
const D = (a, b, what, floor, carried = '') => ({ a, b, what, floor, carried });
const DISTINCT = [
  D('running', 'danger-solid', 'running pink vs failed outline (brief K8 risk: >= 10)', 10),
  D('running', 'danger-strong', 'running badge vs failed badge (both 16px discs)', 10),
  D('running-text', 'danger-text', '"Running" vs "Failed" caption', 10, 'the word'),
  D('running', 'selection-ring', 'running arc vs selection ring', 10, '90° 3px arc vs full 2px ring at a gap; badge + caption'),
  D('danger-solid', 'selection-ring', 'failed outline vs selection ring', 10, 'octagon-x badge + "Failed" caption'),
  D('selection-ring', 'edge-strong', 'selection ring vs hover stroke', 0, 'ring sits at a 2px gap outside the pill; hover recolours the outline itself'),
  D('selection-ring', 'text', 'selection ring vs focus ring', 8, 'focus sits outside the selection ring'),
  D('accent-text', 'danger-text', 'link vs error text', 8),
  D('accent-text', 'running-text', 'link / row bar vs running text', 10, 'the word; the spinner'),
  D('accent-soft-bg', 'running-soft-bg', 'selected-row tint vs Running pill tint', 3, 'bar + weight 600 vs pill + pink text'),
  D('danger-strong', 'accent-solid-alt', 'failed badge vs comment badge', 10, 'glyph vs count'),
  D('accepted-fill', 'warning-solid', 'accepted mint vs approval amber', 10, 'check vs hand glyph'),
  D('accepted-fill', 'running', 'accepted mint vs running pink', 10),
  D('danger-solid', 'warning-solid', 'failed vs approval solid', 10),
  D('danger-text', 'warning-text', 'failed vs approval text', 8, 'the word + glyph'),
];

const need = { text: 4.5, large: 3, stroke: 3.2, mark: 3, info: 0 };
const rows = [];
let fails = 0;
for (const p of PAIRS) {
  for (const theme of ['light', 'dark']) {
    const fg = val(p.fg, theme), bg = val(p.bg, theme);
    if (!fg || !bg || fg.startsWith('rgba') || bg.startsWith('rgba')) continue;
    const r = contrast(fg, bg), lc = Math.abs(apca(fg, bg));
    const ok = r >= need[p.kind];
    if (!ok) fails++;
    rows.push({ theme, what: p.what, fg: `${p.fg} ${fg}`, bg: `${p.bg} ${bg}`, r: r.toFixed(2), lc: lc.toFixed(0), need: need[p.kind] || '—', ok: need[p.kind] ? (ok ? 'pass' : '**FAIL**') : 'info' });
  }
}
const cvd = (a, b) => Math.min(dE(a, b, 'protan'), dE(a, b, 'deutan'));
const drows = [];
for (const d of DISTINCT) for (const theme of ['light', 'dark']) {
  const a = val(d.a, theme), b = val(d.b, theme);
  const n = dE(a, b), c = cvd(a, b);
  const ok = n >= d.floor;
  if (!ok) fails++;
  drows.push({ theme, what: d.what, a: `${d.a} ${a}`, b: `${d.b} ${b}`, n: n.toFixed(1), c: c.toFixed(1), floor: d.floor || '—', carried: d.carried, ok: d.floor ? (ok ? 'pass' : '**FAIL**') : 'info' });
}
if (md) {
  console.log('| Theme | Pair (what) | Foreground | Background | WCAG | APCA Lc | Need | Result |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.theme} | ${r.what} | \`${r.fg}\` | \`${r.bg}\` | ${r.r} | ${r.lc} | ${r.need} | ${r.ok} |`);
  console.log(`\n${rows.length} contrast checks.\n`);
  console.log('| Theme | Competing meanings | A | B | ΔE | ΔE CVD | Floor | Also carried by | Result |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const r of drows) console.log(`| ${r.theme} | ${r.what} | \`${r.a}\` | \`${r.b}\` | ${r.n} | ${r.c} | ${r.floor} | ${r.carried} | ${r.ok} |`);
  console.log(`\n${drows.length} distinctness checks. ${fails} failures in total.`);
} else {
  for (const r of rows) console.log(r.ok.padEnd(9), r.theme.padEnd(5), r.r.padStart(6), ('Lc' + r.lc).padStart(6), ' need', String(r.need).padEnd(4), r.what, '|', r.fg, 'on', r.bg);
  console.log('\n-- distinctness (dE_OK x100 normal / CVD)');
  for (const r of drows) console.log(r.ok.padEnd(9), r.theme.padEnd(5), r.n.padStart(5), r.c.padStart(5), ' floor', String(r.floor).padEnd(3), r.what, '|', r.a, 'vs', r.b, r.carried ? '| ' + r.carried : '');
  console.log(rows.length + drows.length, 'checks,', fails, 'failures');
}
process.exit(fails ? 1 : 0);
