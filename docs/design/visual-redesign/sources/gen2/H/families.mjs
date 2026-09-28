#!/usr/bin/env node
// Gen-2 H · Sticker × Cocoa — node-family colours for B's type channel (a solid 28px disc carrying a white or ink
// #1B1B17 icon), re-searched with the Gen-1 rules (research/tmp/final-brief-cat.mjs, brief §3.3) against THIS palette's
// reserved colours, both themes:
//   disc >= 3:1 on every ground it sits on (pill fill and canvas), icon (white or ink) >= 4.5:1 on the disc;
//   dE_OK >= 10 (B's floor) from every reserved colour: the cocoa accents and ring, the pink running marks and text,
//     every danger token, warning, the mint acceptance colours;
//   hue >= 30 deg from the interaction hue (cocoa 45) AND from the running hue (pink 8): H decision, because in B the
//     running badge is a solid disc of the same shape as a family disc (in the parent running = interaction, so it had
//     the 30 deg gap for free); hue >= 20 deg from danger, warning and success;
//   between families: hue >= 20 deg apart; maximise min(dE_normal/15, dE_CVD/8) (report 08's metric).
// Global search (all six slots are new for this palette), then each family takes the parent's nearest hue slot so the
// scene keeps its reading (F1 violet, F2 blue, F3 teal, F4 olive/mustard, F5 magenta, F6 indigo).
// Usage: node families.mjs            search + print the rows to paste into tokens.mjs FAMILIES
//        node families.mjs --verify   re-check tokens.mjs FAMILIES against every rule (exit 1 on a failure)
import { contrast, hexToOklch, oklchToHex, maxChroma, labOf, dEab } from '../../research/tmp/color.mjs';
import { TOKENS, FAMILIES } from './tokens.mjs';

const THEMES = ['light', 'dark'];
const tok = (n, t) => TOKENS[n][t];
const LAB = new Map(); // memo: the search compares the same hexes millions of times
const lab = (hex, kind = '') => { const k = hex + kind; let v = LAB.get(k); if (!v) { v = labOf(hex, kind || undefined); LAB.set(k, v); } return v; };
const dEn = (a, b) => dEab(lab(a), lab(b));
const dEc = (a, b) => Math.min(dEab(lab(a, 'protan'), lab(b, 'protan')), dEab(lab(a, 'deutan'), lab(b, 'deutan')));
const hueOf = (hex) => hexToOklch(hex).h;
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
const INK = '#1B1B17';
const iconOn = (fill) => (contrast('#FFFFFF', fill) >= contrast(INK, fill) ? '#FFFFFF' : INK);
const r2 = (x) => x.toFixed(2);

export const FLOOR = 10;
export const GROUNDS = Object.fromEntries(THEMES.map((t) => [t, { 'node-fill': tok('node-fill', t), 'canvas-bg': tok('canvas-bg', t) }]));
const RES_NAMES = ['accent-solid', 'accent-solid-alt', 'accent-text', 'selection-ring', 'running', 'running-text',
  'danger-solid', 'danger-strong', 'danger-text', 'warning-solid', 'warning-text', 'success-text', 'accepted-fill', 'accepted-mark'];
export const RESERVED = Object.fromEntries(THEMES.map((t) => [t, Object.fromEntries(RES_NAMES.map((n) => [n, tok(n, t)]))]));
export const HUE_RULES = [
  { kind: 'interaction (cocoa)', h: hueOf(tok('selection-ring', 'light')), gap: 30 },
  { kind: 'running (pink)', h: hueOf(tok('running', 'dark')), gap: 30 },
  { kind: 'danger', h: hueOf(tok('danger-solid', 'light')), gap: 20 },
  { kind: 'danger (dark coral)', h: hueOf(tok('danger-solid', 'dark')), gap: 20 },
  { kind: 'warning', h: hueOf(tok('warning-solid', 'light')), gap: 20 },
  { kind: 'success / accepted', h: hueOf(tok('success-text', 'light')), gap: 20 },
];

export function problems(row) {
  const out = [];
  for (const r of HUE_RULES) if (hueGap(row.h, r.h) < r.gap) out.push(`hue ${row.h.toFixed(0)} within ${r.gap} of ${r.kind} ${r.h.toFixed(0)}`);
  for (const m of THEMES) {
    const hex = row[m];
    for (const [g, gx] of Object.entries(GROUNDS[m])) if (contrast(hex, gx) < 3) out.push(`${m} ${hex} on ${g} ${r2(contrast(hex, gx))}`);
    for (const [n, x] of Object.entries(RESERVED[m])) if (dEn(hex, x) < FLOOR) out.push(`${m} ${hex} vs ${n} ${x} dE ${dEn(hex, x).toFixed(1)}`);
    if (contrast(iconOn(hex), hex) < 4.5) out.push(`${m} icon ${r2(contrast(iconOn(hex), hex))}`);
  }
  return out;
}
function pairMetric(a, b) {
  if (hueGap(a.h, b.h) < 20) return 0;
  let m = Infinity;
  for (const t of THEMES) m = Math.min(m, dEn(a[t], b[t]) / 15, dEc(a[t], b[t]) / 8);
  return m;
}
export function stats(rows) {
  const o = {};
  for (const t of THEMES) {
    let n = Infinity, c = Infinity, np = '', cp = '';
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i][t], b = rows[j][t];
      if (dEn(a, b) < n) { n = dEn(a, b); np = `${rows[i].fam ?? a}/${rows[j].fam ?? b}`; }
      if (dEc(a, b) < c) { c = dEc(a, b); cp = `${rows[i].fam ?? a}/${rows[j].fam ?? b}`; }
    }
    o[t] = { minNormal: +n.toFixed(1), worstNormal: np, minCVD: +c.toFixed(1), worstCVD: cp };
  }
  return o;
}
export const nearestReserved = (hex, t) => Object.entries(RESERVED[t]).map(([n, x]) => ({ n, x, d: dEn(hex, x), c: dEc(hex, x) })).sort((a, b) => a.d - b.d)[0];

// Gen-1 used C >= 0.1 for every candidate. H light discs must be <= ~L0.58 to hold 3:1 on the grey canvas, where sRGB teal
// cannot reach C0.1 (max ~0.09 at L0.52), so the light floor is 0.07 (a deep teal still reads as teal). Dark keeps 0.1.
// Light L0.36 floor: a 0.40-0.42 floor (work/fam-compare.png, sets B-D) drops the set to 0.87-0.92 of report 08 targets;
// the two darkest discs (F2 navy, F4 olive, L0.36) still read as their hue on the white pill.
const BANDS = { light: [Number(process.env.LLO ?? 0.36), 0.72], dark: [0.56, 0.88] };
const CMIN = { light: 0.07, dark: 0.1 };
function candidates() {
  const out = [];
  for (let h = 0; h < 360; h += 3) {
    const per = { light: [], dark: [] };
    for (const m of THEMES) for (let L = BANDS[m][0]; L <= BANDS[m][1] + 1e-9; L += 0.02) {
      const C = Math.min(maxChroma(L, h), 0.19);
      if (C < CMIN[m]) continue;
      per[m].push(oklchToHex(L, C, h));
    }
    for (const a of per.light) for (const b of per.dark) { const row = { h, light: a, dark: b }; if (!problems(row).length) out.push(row); }
  }
  return out;
}
function score(set) {
  let mn = Infinity, sm = 0, n = 0;
  for (let i = 0; i < set.length; i++) for (let j = i + 1; j < set.length; j++) { const v = pairMetric(set[i], set[j]); mn = Math.min(mn, v); sm += v; n++; }
  return [mn, sm / n];
}
const better = (a, b) => (Math.round(a[0] * 400) !== Math.round(b[0] * 400) ? a[0] > b[0] : a[1] > b[1]);

// parent B hue slots (gen1/B tokens.mjs FAMILIES), used only to name the found hues
const PARENT_H = { f1: 294, f2: 231, f3: 174, f4: 96, f5: 330, f6: 273 };
// hue windows (parent slot, clipped by this palette's hue rules): F4 moves from mustard 96 into the 95-132 olive gap;
// F5 stays magenta but no closer than 30 deg to the pink; F1/F6 are pulled apart (parent finding: dark F1 vs F6 21 deg).
const WINDOWS = { f1: [285, 312], f2: [222, 250], f3: [172, 210], f4: [95, 132], f5: [314, 338], f6: [252, 276] };

function search() {
  const pool = candidates();
  console.log(`pool ${pool.length} rows (hue, light, dark) pass every single-colour rule`);
  let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  // --free: one pool for all six slots (the unconstrained optimum, reported for comparison);
  // default: each family searches its own hue window around the parent's slot (continuity of the scene's reading)
  const fams = Object.keys(PARENT_H);
  const free = process.argv.includes('--free');
  const pools = fams.map((f) => (free ? pool : pool.filter((c) => c.h >= WINDOWS[f][0] && c.h <= WINDOWS[f][1])));
  if (!free) console.log('window pools', fams.map((f, i) => `${f} [${WINDOWS[f]}] ${pools[i].length}`).join(' · '));
  let best = null;
  const restarts = Number(process.env.RESTARTS ?? (free ? 60 : 30));
  for (let r = 0; r < restarts; r++) {
    // greedy start from a random first member, then coordinate ascent
    const sel = new Array(6).fill(null);
    const order = [0, 1, 2, 3, 4, 5].sort(() => rnd() - 0.5);
    sel[order[0]] = pools[order[0]][Math.floor(rnd() * pools[order[0]].length)];
    for (const i of order.slice(1)) {
      let bc = null, bs = -1;
      for (const c of pools[i]) { const s = Math.min(...sel.filter(Boolean).map((o) => pairMetric(c, o))); if (s > bs) { bs = s; bc = c; } }
      sel[i] = bc;
    }
    let cur = score(sel);
    for (let round = 0; round < 20; round++) {
      let improved = false;
      for (let i = 0; i < 6; i++) {
        let bi = sel[i], bsc = cur;
        for (const c of pools[i]) { const t = sel.slice(); t[i] = c; const s = score(t); if (better(s, bsc)) { bsc = s; bi = c; } }
        if (bi !== sel[i]) { sel[i] = bi; cur = bsc; improved = true; }
      }
      if (!improved) break;
    }
    if (!best || better(cur, best.cur)) best = { sel: sel.slice(), cur };
  }
  let bestPerm = [0, 1, 2, 3, 4, 5];
  if (free) {
    // assign found hues to families by the smallest total hue move from the parent slots (6! permutations)
    let bestCost = Infinity;
    const perm = (arr, k = 0) => {
      if (k === arr.length) { const c = arr.reduce((s, x, i) => s + hueGap(best.sel[x].h, PARENT_H[fams[i]]), 0); if (c < bestCost) { bestCost = c; bestPerm = arr.slice(); } return; }
      for (let i = k; i < arr.length; i++) { [arr[k], arr[i]] = [arr[i], arr[k]]; perm(arr, k + 1); [arr[k], arr[i]] = [arr[i], arr[k]]; }
    };
    perm([0, 1, 2, 3, 4, 5]);
  }
  const rows = fams.map((f, i) => ({ fam: f, ...best.sel[bestPerm[i]] }));
  console.log(`objective min ${best.cur[0].toFixed(3)} mean ${best.cur[1].toFixed(3)} (>= 1 meets report 08's targets)`);
  for (const r of rows) report(r);
  console.log('stats', JSON.stringify(stats(rows)));
  console.log('\n// paste into tokens.mjs FAMILIES (light / dark disc, icon colour)');
  for (const r of rows) console.log(`${r.fam}: light ${r.light} icon ${iconOn(r.light)}  dark ${r.dark} icon ${iconOn(r.dark)}  (h ${r.h}, parent ${PARENT_H[r.fam]})`);
}
function report(r) {
  const g = (m) => Object.values(GROUNDS[m]).map((x) => r2(contrast(r[m], x))).join('/');
  const ic = (m) => `${iconOn(r[m]) === '#FFFFFF' ? 'white' : 'ink'} ${r2(contrast(iconOn(r[m]), r[m]))}`;
  const nr = (m) => { const n = nearestReserved(r[m], m); return `${n.n} ${n.d.toFixed(1)}/${n.c.toFixed(1)}`; };
  console.log(`  ${r.fam ?? ''} h${Math.round(r.h)} | light ${r.light} L${hexToOklch(r.light).L.toFixed(2)} grounds ${g('light')} icon ${ic('light')} nearest ${nr('light')} | dark ${r.dark} L${hexToOklch(r.dark).L.toFixed(2)} grounds ${g('dark')} icon ${ic('dark')} nearest ${nr('dark')} | problems: ${problems(r).join('; ') || 'none'}`);
}
function verify() {
  const rows = Object.entries(FAMILIES).map(([fam, f]) => ({ fam, h: hueOf(f.light), light: f.light, dark: f.dark, lightIcon: f.lightIcon, darkIcon: f.darkIcon }));
  let fails = 0;
  for (const r of rows) {
    const p = problems(r);
    // the printed icon colour must be the one that passes (and hue gap judged on the light disc's hue)
    for (const m of THEMES) if (contrast(r[m + 'Icon'], r[m]) < 4.5) p.push(`${m} printed icon ${r[m + 'Icon']} ${r2(contrast(r[m + 'Icon'], r[m]))}`);
    if (hueGap(hueOf(r.light), hueOf(r.dark)) > 12) p.push(`light/dark hue drift ${hueGap(hueOf(r.light), hueOf(r.dark)).toFixed(0)}`);
    fails += p.length;
    report(r);
  }
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) if (hueGap(rows[i].h, rows[j].h) < 20) { fails++; console.log(`  FAIL hue gap ${rows[i].fam}/${rows[j].fam}`); }
  const st = stats(rows);
  console.log('stats', JSON.stringify(st));
  console.log(fails ? `${fails} problem(s)` : 'All family rules pass.');
  return { rows, stats: st, fails };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--verify')) process.exit(verify().fails ? 1 : 0);
  else search();
}
