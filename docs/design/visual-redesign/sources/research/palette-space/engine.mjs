// Palette-space token engine: one deterministic path from a candidate in candidates.json to a full Relayer token set,
// engineered by the same rules as Gen 1 so every candidate is comparable.
//
//   report 08 engine (../tmp/engine.mjs)      neutral + accent ramps, status colours, WCAG/APCA L-fix loop
//   brief 12 (§2.5, §3.2, §3.3, §6)           3.2:1 thin-stroke margin, selection ring, neutral Stop, focus = text,
//                                             poster canvas labels, diff tokens, family-colour rules
//   ../tmp/final-brief-cat.mjs                family (F1-F6) search: same bands, pools, seed, restarts and metric
//   addendum 13 §B                            agent authoring guidance palette (page, card, text, link, focus, series)
//
// Colour maths comes only from ../tmp/color.mjs. No dependencies, no network, deterministic (seeded search).
//
// Usage:
//   node engine.mjs                 all candidates -> tokens/<id>.json (+ tokens/_summary.json)
//   node engine.mjs K1 K5 M3        only these ids
//   node engine.mjs --overrides my.json K7      use another overrides file (default: ./overrides.json if present)
//   node engine.mjs --no-overrides  ignore overrides entirely
//   node engine.mjs --out dir       write somewhere else
// Import: import { engineer, loadCandidates } from "./engine.mjs"  (no side effects on import).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { contrast, apca, hexToOklch, oklchToHex, maxChroma, labOf, dEab, clamp } from "../tmp/color.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ENGINE_VERSION = "palette-space/engine.mjs v1";
const MODES = ["light", "dark"];
const r2 = (x) => +x.toFixed(2);
const r1 = (x) => +x.toFixed(1);
const lch = (hex) => hexToOklch(hex);
const dEn = (a, b) => dEab(labOf(a), labOf(b));
const dEc = (a, b) => Math.min(dEab(labOf(a, "protan"), labOf(b, "protan")), dEab(labOf(a, "deutan"), labOf(b, "deutan")));
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
const uniq = (xs) => [...new Set(xs)];
const fmtL = (hex) => { const o = lch(hex); return `oklch(${(o.L * 100).toFixed(1)}% ${o.C.toFixed(3)} ${o.h.toFixed(1)})`; };
export const hueName = (h) => [[15, "pink-red"], [45, "red-orange"], [70, "orange/brown"], [100, "amber/ochre"], [130, "olive/yellow-green"], [165, "green"], [200, "teal"], [235, "cyan/sky"], [265, "blue"], [295, "indigo/violet"], [325, "purple"], [350, "magenta"], [361, "pink-red"]].find(([x]) => h < x)[1];

// ------------------------------------------------------------------ constants (copied from report 08's engine)
// 12-step ramps (Radix semantics): 1-2 backgrounds, 3-5 component fills, 6-8 borders, 9-10 solids, 11 muted text, 12 text.
const NEUTRAL_L = {
  light: [0.993, 0.98, 0.957, 0.934, 0.912, 0.886, 0.852, 0.795, 0.655, 0.615, 0.505, 0.22],
  dark: [0.17, 0.198, 0.236, 0.266, 0.296, 0.336, 0.39, 0.468, 0.54, 0.585, 0.765, 0.948],
};
const NEUTRAL_CM = [0.45, 0.6, 0.8, 0.9, 1, 1, 1, 1, 1, 1, 0.85, 0.6];
const ACCENT_L = {
  light: [0.99, 0.975, 0.95, 0.925, 0.895, 0.86, 0.81, 0.74, null, null, null, 0.33],
  dark: [0.18, 0.205, 0.245, 0.28, 0.315, 0.355, 0.41, 0.48, null, null, null, 0.93],
};
const ACCENT_CM = {
  light: [0.12, 0.2, 0.3, 0.4, 0.5, 0.6, 0.72, 0.85, 1, 1, 0.9, 0.5],
  dark: [0.2, 0.25, 0.35, 0.45, 0.5, 0.6, 0.72, 0.85, 1, 1, 0.8, 0.35],
};
// Brief floors (§2.5) and engine targets
export const FLOORS = { text: 4.5, mark: 3, strokeMargin: 3.2, edgeStrongTarget: 4.5, ringApcaMin: 30, iconOnFill: 4.5,
  familyReservedStroke: 12, familyReserved: 10, familyInteractionGap: 30, familyStatusGap: 20, familyDangerGapTile: 30, familyPairGap: 20,
  // report 08 targets for pairwise family distinctness; below the "sanity" pair is a failure (lowest Gen-1 set is 12.1 / 7.4)
  familyNormalTarget: 15, familyCvdTarget: 8, familyNormalSanity: 10, familyCvdSanity: 6,
  seriesNormalTarget: 15, seriesCvdTarget: 8, seriesDanger: 10, seriesAccent: 10, seriesStatus: 8, seriesFamily: 10 };
// Gen-1 genes a candidate inherits from its nearest Gen-1 prototype (brief §6.0 genes K and G)
const GENES = {
  A: { channel: "stroke", grid: "dots", gridTarget: 1.22 },
  B: { channel: "disc", grid: "none", gridTarget: null },
  C: { channel: "tab", grid: "dots", gridTarget: 1.22 },
  D: { channel: "tile", grid: "crosses", gridTarget: 1.33 },
};
// Family-colour channel (brief §3.3): which grounds the family mark sits on, reserved-colour floor, solid-fill icon.
const CHANNELS = {
  stroke: { grounds: ["node-fill", "surface", "canvas-bg"], floor: FLOORS.familyReservedStroke, solidIcon: false, dangerGap: 20, runningOn: ["canvas-bg"], what: "icon stroke on node fill (hollow drafts on the canvas)" },
  disc: { grounds: ["node-fill", "canvas-bg"], floor: FLOORS.familyReserved, solidIcon: true, dangerGap: 20, runningOn: ["canvas-bg", "node-fill"], what: "solid disc on the pill fill and the canvas" },
  tab: { grounds: ["node-fill"], floor: FLOORS.familyReserved, solidIcon: false, dangerGap: 20, runningOn: ["node-fill"], what: "4px tab on the card fill" },
  tile: { grounds: ["canvas-bg", "surface"], floor: FLOORS.familyReserved, solidIcon: true, dangerGap: FLOORS.familyDangerGapTile, runningOn: ["canvas-bg"], what: "whole tile on the canvas and surface" },
};
const INK = "#1B1B17"; // brief §6 token note: ink icon colour on family fills
const STATUS_HUES = { danger: [25, 36, 15, 45], warning: [75, 65, 85, 55], success: [152, 140, 165, 128] };
const DANGER_L = { light: [0.52, 0.48, 0.56, 0.44, 0.6], dark: [0.66, 0.7, 0.74, 0.78, 0.62] };

// ------------------------------------------------------------------ small helpers (report 08)
function nearestL(o, test, { dir = 0, step = 0.0025, maxD = 0.8 } = {}) {
  for (let d = 0; d <= maxD + 1e-9; d += step) {
    const signs = d === 0 ? [0] : dir ? [dir] : [-1, 1];
    for (const s of signs) {
      const L = o.L + s * d;
      if (L < 0 || L > 1) continue;
      const hex = oklchToHex(L, o.C, o.h);
      if (test(hex)) return { hex, L, dL: s * d };
    }
  }
  return null;
}
const bestOn = (hex, cands) => cands.reduce((a, b) => (contrast(hex, b) > contrast(hex, a) ? b : a));
const allPass = (hex, bgs, min) => bgs.every((b) => contrast(hex, b) >= min - 1e-9);
const minOn = (hex, bgs) => Math.min(...bgs.map((b) => contrast(hex, b)));
// Hold C and h, move L until `hex` clears `target` on every ground. Returns { hex, moved }.
function lift(hex, grounds, target, extra = () => true) {
  const ok = (h) => allPass(h, grounds, target) && extra(h);
  if (ok(hex)) return { hex, moved: false };
  const r = nearestL(lch(hex), ok);
  return r ? { hex: r.hex, moved: true, dL: r.dL } : { hex, moved: false, failed: true };
}

// ------------------------------------------------------------------ plan: candidate text -> structured decisions
// Every decision records where it came from ("parsed: …", "rule: …", "gene X", "override").
function geneOf(c) {
  const t = c.relation_to_gen1 || "";
  const m = /\b(?:is|near|nearest)\s+([ABCD])\b/.exec(t) || /\b([ABCD])\b/.exec(t);
  return m ? m[1] : "A";
}
function accentRoleOf(text) {
  const t = (text || "").toLowerCase();
  if (/^selection/.test(t)) return "selection";
  if (/not yet accepted|highlighter behind|unfinished/.test(t)) return "draft-highlight";
  if (/^failure|failure only|\(danger\)|becomes danger/.test(t)) return "danger";
  if (/accepted/.test(t)) return "accepted";
  if (/approval|warning|needs you/.test(t)) return "warning";
  if (/running|live work/.test(t)) return "running";
  return "signal";
}
export function parsePlan(c) {
  const sp = c.semantic_plan || {};
  const ro = c.role_origin || {};
  const origin = {};
  const notes = [];
  const gene = geneOf(c);
  origin.gene = `parsed relation_to_gen1 "${(c.relation_to_gen1 || "").slice(0, 40)}"`;
  const g = lch(c.roles.ground);
  const gtxt = (ro.ground || "").toLowerCase();
  let placement;
  if (/sidebar/.test(gtxt)) { placement = "sidebar"; origin.placement = "parsed role_origin.ground mentions a sidebar block"; }
  else if (g.L >= 0.93 || /paper/.test(gtxt)) { placement = "bg-light"; origin.placement = `rule: ground L ${g.L.toFixed(3)} ${g.L >= 0.93 ? ">= 0.93" : "and role_origin says paper"}, pinned as the light page background (and so the light canvas)`; }
  else if (/canvas/.test(gtxt)) { placement = g.L < 0.5 ? "canvas-dark" : "canvas-light"; origin.placement = `parsed role_origin.ground mentions a canvas (L ${g.L.toFixed(3)} -> ${g.L < 0.5 ? "dark" : "light"} theme)`; }
  else if (/hue seed/.test(gtxt)) { placement = "seed"; origin.placement = "parsed role_origin.ground: a hue seed only (tints the neutrals; not painted as a surface)"; }
  else if (g.L < 0.5) { placement = g.L <= 0.2 ? "bg-dark" : "canvas-dark"; origin.placement = `rule: ground L ${g.L.toFixed(3)} ${g.L <= 0.2 ? "<= 0.20, pinned as the dark page background" : "< 0.50, dark-theme poster canvas under darker chrome"}`; }
  else if (g.L >= 0.93 || /paper/.test(gtxt)) { placement = "bg-light"; origin.placement = `rule: ground L ${g.L.toFixed(3)} ${g.L >= 0.93 ? ">= 0.93" : "and role_origin says paper"}, pinned as the light page background`; }
  else { placement = "canvas-light"; origin.placement = `rule: ground L ${g.L.toFixed(3)} in 0.50-0.93, light-theme poster canvas under lighter chrome`; }
  const itxt = (sp.interaction || "").toLowerCase();
  let primary = "interaction";
  let interaction = { light: c.roles.ink, dark: c.roles.ink };
  origin.interaction = "roles.ink";
  if (/primary is ink/.test(itxt)) { primary = "ink"; origin.primary = "parsed semantic_plan.interaction: primary is ink (light) / the interaction colour (dark)"; }
  if (/\(the ground chip\)/.test(itxt)) { interaction = { light: c.roles.ground, dark: c.roles.ground }; origin.interaction = "parsed semantic_plan.interaction: the ground chip"; }
  const accentRole = accentRoleOf(sp.accent_means);
  origin.accentRole = `parsed semantic_plan.accent_means "${(sp.accent_means || "").slice(0, 50)}"`;
  const rtxt = (sp.running || "").toLowerCase();
  let running;
  if (/open gene/.test(rtxt)) { running = "neutral"; origin.running = "semantic_plan.running is an open gene; engine default neutral ink (Gen-1 A/D)"; }
  else if (/neutral/.test(rtxt)) { running = "neutral"; origin.running = "parsed semantic_plan.running: neutral ink"; }
  else if (accentRole === "running") { running = "accent"; origin.running = "parsed: running uses the accent"; }
  else { running = "interaction"; origin.running = "parsed: running uses the interaction colour"; }
  if (accentRole === "running" && running === "neutral") notes.push("accent_means says live work/running but semantic_plan.running says neutral ink: running stays neutral and the accent is emitted as a live-work signal (signal-fill / signal-mark)");
  const selection = accentRole === "selection" ? "accent" : "interaction";
  origin.selection = accentRole === "selection" ? "parsed: accent_means is selection" : "rule: the interaction colour (report 08 focus-ring rule on its ramp)";
  let danger;
  const dtxt = sp.danger || "";
  const dhex = /#[0-9A-Fa-f]{6}\b/.exec(dtxt);
  if (accentRole === "danger") { danger = { swatch: c.roles.accent }; origin.danger = "parsed: the accent is failure only"; }
  else if (dhex && !/derived/i.test(dtxt)) { danger = { swatch: dhex[0].toUpperCase() }; origin.danger = `parsed semantic_plan.danger names ${dhex[0]}`; }
  else if (/\bink\b/i.test(dtxt)) { danger = { swatch: c.roles.ink }; origin.danger = "parsed semantic_plan.danger: the ink colour"; }
  else { danger = { derive: true }; origin.danger = `rule: derived red (hue from ${STATUS_HUES.danger.join("/")} with >= 20 deg from interaction and accent, L from ${DANGER_L.light[0]}/${DANGER_L.dark[0]} stepped until dE >= 10 from accent-solid)`; if (dhex) notes.push(`semantic_plan.danger quotes ${dhex[0]} as "derived"; the engine re-derives it by rule and reports the difference`); }
  return {
    ground: c.roles.ground, neutralSeed: c.roles.ground, placement, gene, channel: GENES[gene].channel, grid: GENES[gene].grid, gridTarget: GENES[gene].gridTarget,
    primary, interaction, accent: c.roles.accent, accentRole, running, selection, danger,
    success: accentRole === "accepted" ? { swatch: c.roles.accent } : { derive: true },
    warning: accentRole === "warning" ? { swatch: c.roles.accent } : { derive: true },
    draft: accentRole === "draft-highlight" ? { swatch: c.roles.accent } : { neutral: true, Loff: { light: -0.1, dark: -0.14 } },
    familyAnchor: "ground-hue", familyAnchorWidth: 14, familySearch: { restarts: 40, randomRestarts: +(process.env.PS_RR ?? 200) }, seriesCount: 5,
    origin, notes,
  };
}
function isObj(x) { return x && typeof x === "object" && !Array.isArray(x); }
function merge(a, b) { const o = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = isObj(v) && isObj(a[k]) && !("swatch" in v) && !("derive" in v) ? merge(a[k], v) : v; return o; }
export function resolvePlan(c, ov = {}) {
  let p = parsePlan(c);
  const { tokens: tokenOv, _why, ...planOv } = ov;
  if (Object.keys(planOv).length) {
    if (typeof planOv.interaction === "string") planOv.interaction = { light: planOv.interaction, dark: planOv.interaction };
    if (planOv.gene && !planOv.channel) { planOv.channel = GENES[planOv.gene].channel; }
    if (planOv.gene && !planOv.grid) { planOv.grid = GENES[planOv.gene].grid; planOv.gridTarget = GENES[planOv.gene].gridTarget; }
    p = merge(p, planOv);
    for (const k of Object.keys(planOv)) p.origin[k] = `override${_why ? `: ${_why}` : ""}`;
  }
  p.tokenOverrides = tokenOv || null;
  return p;
}

// ------------------------------------------------------------------ ramps (report 08)
function neutralRamp(plan, mode) {
  const seed = lch(plan.neutralSeed);
  const C = clamp(seed.C * 0.5, 0.007, 0.016);
  let Ls = NEUTRAL_L[mode].slice();
  const pinIdx = plan.placement === "bg-light" && mode === "light" ? 1 : plan.placement === "bg-dark" && mode === "dark" ? 0 : null;
  let rebased = 0;
  if (pinIdx != null) {
    const off = lch(plan.ground).L - Ls[pinIdx];
    if (Math.abs(off) > 0.01) { Ls = Ls.map((L) => clamp(L + off, 0.02, 0.995)); rebased = off; }
  }
  const N = Ls.map((L, i) => oklchToHex(L, C * NEUTRAL_CM[i], seed.h));
  if (pinIdx != null) N[pinIdx] = plan.ground;
  return { N, hue: seed.h, chroma: C, pinIdx, rebased };
}
// kind "accent": solid must be >= 3:1 on bg/surface with a >= 4.5 label; kind "highlight": a fill behind a label + a mark.
function swatchRamp(swHex, mode, ctx, kind) {
  const s = lch(swHex);
  const Cb = Math.max(s.C, 0.12);
  const steps = ACCENT_L[mode].map((L, i) => (L == null ? null : oklchToHex(L, Cb * ACCENT_CM[mode][i], s.h)));
  const solidBgs = kind === "accent" ? ctx.solidBgs : [];
  const test = (hex) => allPass(hex, solidBgs, 3) && contrast(hex, bestOn(hex, ctx.onCands)) >= 4.5;
  let solid, exact = true, dL = 0;
  if (test(swHex)) solid = swHex;
  else { exact = false; const r = nearestL({ L: s.L, C: Cb, h: s.h }, test); solid = r.hex; dL = r.dL; }
  steps[8] = solid;
  const on = bestOn(solid, ctx.onCands);
  const L9 = lch(solid).L;
  const hdir = on === "#FFFFFF" ? -1 : 1;
  steps[9] = nearestL({ L: clamp(L9 + hdir * 0.045, 0.02, 0.98), C: exact ? s.C : Cb, h: s.h }, (hex) => contrast(hex, on) >= 4.5, { dir: hdir }).hex;
  const altOn = ctx.onCands.find((c) => c !== on);
  const alt = nearestL({ L: L9, C: Cb, h: s.h }, (hex) => allPass(hex, solidBgs, 3) && contrast(hex, altOn) >= 4.5);
  const tStart = mode === "light" ? Math.min(L9, 0.62) : Math.max(L9, 0.66);
  const textBgs = [...ctx.textBgs, steps[1], steps[2]];
  steps[10] = nearestL({ L: tStart, C: Cb * ACCENT_CM[mode][10], h: s.h }, (hex) => allPass(hex, textBgs, 4.5), { dir: mode === "light" ? -1 : 1 }).hex;
  let exactAt = exact ? 9 : null;
  if (!exact) {
    let bi = 1, bd = 9;
    for (let i = 1; i <= 7; i++) { const d = Math.abs(lch(steps[i]).L - s.L); if (d < bd) { bd = d; bi = i; } }
    if (bd < 0.06) { steps[bi] = swHex; exactAt = bi + 1; }
  }
  return { steps, solid, on, exact, dL, exactAt, hue: s.h, alt: alt ? { hex: alt.hex, on: altOn } : null };
}
function statusHue(kind, avoid) {
  for (const h of STATUS_HUES[kind]) if (avoid.every((a) => hueGap(h, a) >= 20)) return h;
  return STATUS_HUES[kind][0];
}

// ------------------------------------------------------------------ one theme
function buildTheme(plan, mode) {
  const light = mode === "light";
  const nr = neutralRamp(plan, mode);
  const N = nr.N;
  const t = light
    ? { bg: N[1], sidebar: N[1], surface: N[0], field: N[2], overlay: N[0], hover: N[3], selected: N[4], border: N[5],
        "border-strong": N[7], text: N[11], "text-muted": N[10], "text-faint": N[8], "canvas-bg": N[1], edge: N[8], "edge-strong": N[10], "node-fill": N[0], "node-stroke": N[8] }
    : { bg: N[0], sidebar: N[1], surface: N[1], field: N[2], overlay: N[3], hover: N[3], selected: N[4], border: N[5],
        "border-strong": N[7], text: N[11], "text-muted": N[10], "text-faint": N[8], "canvas-bg": N[0], edge: N[7], "edge-strong": N[10], "node-fill": N[2], "node-stroke": N[8] };
  const src = {};
  for (const k of Object.keys(t)) { const i = N.indexOf(t[k]); src[k] = i === nr.pinIdx ? `exact ground ${plan.ground} (pinned neutral-${i + 1})` : `neutral-${i + 1}`; }
  const chromeCanvas = t["canvas-bg"]; // report 08's canvas (neutral); status solids are tested against it
  if ((plan.placement === "canvas-light" && light) || (plan.placement === "canvas-dark" && !light)) { t["canvas-bg"] = plan.ground; src["canvas-bg"] = `exact ground ${plan.ground} (poster canvas)`; }
  let sidebarBlock = false;
  if (plan.placement === "sidebar") {
    sidebarBlock = true;
    const g = lch(plan.ground);
    if (light) { t.sidebar = plan.ground; src.sidebar = `exact ground ${plan.ground} (sidebar block)`; }
    else { t.sidebar = oklchToHex(0.28, Math.min(0.045, g.C), g.h); src.sidebar = `ground hue at L 0.28, C ${Math.min(0.045, g.C).toFixed(3)} (deep sidebar block)`; }
  }
  const onCands = ["#FFFFFF", light ? N[11] : N[0]];
  const textBgs = [t.bg, t.sidebar, t.surface, t.field, t.overlay].filter((x, i) => !(i === 1 && sidebarBlock));
  const ctx = { solidBgs: [t.bg, t.surface], onCands, textBgs };
  // --- interaction ramp (accent-*)
  const ihex = plan.interaction[mode];
  const acc = swatchRamp(ihex, mode, ctx, "accent");
  t["accent-solid"] = acc.solid; src["accent-solid"] = acc.exact ? `exact ${ihex} (interaction, accent-9)` : `${ihex} hue, L shifted ${acc.dL > 0 ? "+" : ""}${acc.dL.toFixed(3)} (C >= 0.12) so it clears 3:1 and carries a 4.5:1 label`;
  t["accent-solid-label"] = acc.on; src["accent-solid-label"] = acc.on === "#FFFFFF" ? "white" : light ? "neutral-12" : "neutral-1";
  t["accent-solid-hover"] = acc.steps[9]; src["accent-solid-hover"] = "accent-10";
  if (acc.alt) { t["accent-solid-alt"] = acc.alt.hex; t["accent-solid-alt-label"] = acc.alt.on; src["accent-solid-alt"] = `interaction hue, nearest L carrying a ${acc.alt.on === "#FFFFFF" ? "white" : "dark"} label`; src["accent-solid-alt-label"] = acc.alt.on === "#FFFFFF" ? "white" : "neutral ink"; }
  const paleExactSoft = light && !acc.exact && acc.exactAt && acc.exactAt >= 3 && acc.exactAt <= 6;
  t["accent-soft-bg"] = paleExactSoft ? ihex : acc.steps[2]; src["accent-soft-bg"] = paleExactSoft ? `exact ${ihex} (accent-${acc.exactAt})` : "accent-3";
  t["accent-text"] = acc.steps[10]; src["accent-text"] = "accent-11";
  if (plan.primary === "ink") {
    // D-style: no chrome accent. Light primary is the ink; dark primary is the interaction colour when it works as a solid.
    if (light || !acc.exact) { t["accent-solid"] = t.text; t["accent-solid-label"] = t.bg; src["accent-solid"] = "ink primary (--text)"; src["accent-solid-label"] = "--bg"; }
    else { t["accent-solid"] = ihex; t["accent-solid-label"] = bestOn(ihex, onCands); src["accent-solid"] = `exact ${ihex} (ink primary in dark)`; }
    t["accent-solid-hover"] = t["accent-solid"]; src["accent-solid-hover"] = "= accent-solid (ink primary)";
  }
  // report 08 focus ring rule on the interaction ramp: first of steps 9-11 clearing 3:1 on every chrome ground + canvas + node
  const focusBgs = [t.bg, t.surface, t.field, t.overlay, chromeCanvas, t["node-fill"]];
  const fr = [8, 9, 10].find((i) => allPass(acc.steps[i], focusBgs, 3));
  const ring08 = fr != null ? acc.steps[fr] : nearestL(lch(acc.steps[8]), (h) => allPass(h, focusBgs, 3)).hex;
  // --- accent (the candidate's third colour) as a rationed signal: exact fill + label, and a mark for thin use
  const sig = swatchRamp(plan.accent, mode, ctx, "highlight");
  t["signal-fill"] = sig.solid; t["signal-fill-label"] = sig.on;
  src["signal-fill"] = sig.exact ? `exact ${plan.accent} (accent; ${plan.accentRole})` : `${plan.accent} L shifted ${sig.dL.toFixed(3)} to carry a label`;
  src["signal-fill-label"] = sig.on === "#FFFFFF" ? "white" : light ? "neutral-12" : "neutral-1";
  t["signal-soft-bg"] = sig.steps[2]; src["signal-soft-bg"] = "signal-3";
  // --- functional colours (report 08 rules; hue choice made explicit)
  const fam = { L: light ? clamp(lch(acc.solid).L, 0.55, 0.64) : clamp(lch(acc.solid).L, 0.68, 0.78), C: clamp(lch(ihex).C, 0.11, 0.16) };
  const ih = lch(ihex), ah = lch(plan.accent);
  const avoid = [...(ih.C >= 0.04 ? [ih.h] : [])];
  const g = lch(plan.neutralSeed);
  const funcInfo = {};
  const solidBgs = [t.bg, t.surface, t.field, chromeCanvas, t["node-fill"]];
  const solidTest = (hex) => allPass(hex, solidBgs, 3) && contrast(hex, bestOn(hex, onCands)) >= 4.5;
  for (const f of ["danger", "success", "warning", "draft"]) {
    const spec = plan[f];
    let h, C, sw = null, L0list;
    if (spec.swatch) { sw = spec.swatch; const o = lch(sw); h = o.h; C = Math.max(o.C, 0.1); }
    else if (spec.neutral) { h = g.h; C = 0.025; }
    else {
      const av = [...avoid, ...(plan.accentRole !== f && ah.C >= 0.04 ? [ah.h] : [])];
      h = spec.h ?? statusHue(f, av); C = fam.C;
    }
    if (spec.L) L0list = [spec.L[mode]];
    else if (spec.neutral) L0list = [fam.L + (spec.Loff ? spec.Loff[mode] : 0)];
    else if (f === "danger" && !sw) L0list = DANGER_L[mode];
    else L0list = [fam.L];
    let solid, solidSrc;
    if (sw && solidTest(sw)) { solid = sw; solidSrc = `exact ${sw}`; }
    else {
      let pick = null;
      for (const L0 of L0list) {
        const r = nearestL({ L: L0, C, h }, solidTest);
        if (!r) continue;
        if (!pick) pick = { r, L0 };
        if (f !== "danger" || sw || dEn(r.hex, acc.solid) >= 10) { pick = { r, L0 }; break; }
      }
      solid = pick.r.hex;
      solidSrc = sw ? `${sw} hue, L ${lch(sw).L.toFixed(3)}->${lch(solid).L.toFixed(3)}` : `${spec.neutral ? "neutral " : ""}h ${h.toFixed(0)} L ${pick.L0.toFixed(3)}${pick.r.dL ? ` ${pick.r.dL > 0 ? "+" : ""}${pick.r.dL.toFixed(3)}` : ""}`;
    }
    const swO = sw ? lch(sw) : null;
    let soft, softSrc;
    if (sw && light && swO.L >= 0.85 && contrast(sw, N[11]) >= 4.5) { soft = sw; softSrc = `exact ${sw}`; }
    else { soft = oklchToHex(light ? 0.955 : 0.265, Math.min(C * (light ? 0.3 : 0.35), 0.05), h); softSrc = "tint"; }
    const tr = nearestL({ L: light ? 0.56 : 0.8, C, h }, (hex) => allPass(hex, [...textBgs, soft], 4.5), { dir: light ? -1 : 1 });
    t[`${f}-solid`] = solid; src[`${f}-solid`] = solidSrc;
    t[`${f}-solid-label`] = bestOn(solid, onCands); src[`${f}-solid-label`] = t[`${f}-solid-label`] === "#FFFFFF" ? "white" : "neutral ink";
    t[`${f}-text`] = tr.hex; src[`${f}-text`] = `L ${(light ? 0.56 : 0.8).toFixed(2)}${tr.dL ? ` ${tr.dL > 0 ? "+" : ""}${tr.dL.toFixed(3)}` : ""} until 4.5:1 on chrome and its soft bg`;
    t[`${f}-soft-bg`] = soft; src[`${f}-soft-bg`] = softSrc;
    if (f === "danger") {
      const st = nearestL({ L: lch(solid).L, C: Math.max(lch(solid).C, C), h }, (hex) => contrast(hex, "#FFFFFF") >= 4.5 && Math.abs(apca("#FFFFFF", hex)) >= 75, { dir: -1 });
      t["danger-strong"] = st.hex; t["danger-strong-label"] = "#FFFFFF"; src["danger-strong"] = `danger-solid L ${lch(solid).L.toFixed(3)} -> ${st.L.toFixed(3)} for a white label (WCAG 4.5 and APCA 75)`; src["danger-strong-label"] = "white";
    }
    funcInfo[f] = { hue: r1(h), chroma: +C.toFixed(3), fromSwatch: sw };
  }
  // --- report 08 contrast fix loop (L only), against chrome grounds and the neutral canvas
  const TB = ["bg", ...(sidebarBlock ? [] : ["sidebar"]), "surface", "field", "overlay", "hover", "selected"];
  const tt = { ...t, "chrome-canvas": chromeCanvas };
  const rows = [
    ["text", [...TB, "chrome-canvas", "node-fill", "accent-soft-bg", ...["danger", "success", "warning", "draft"].map((f) => `${f}-soft-bg`)], 4.5],
    ["text-muted", [...TB, "chrome-canvas", "node-fill"], 4.5],
    ["text-faint", ["bg", ...(sidebarBlock ? [] : ["sidebar"]), "surface", "field", "overlay", "chrome-canvas"], 3],
    ["accent-text", [...TB, "accent-soft-bg", "chrome-canvas"], 4.5],
    ["border-strong", ["bg", ...(sidebarBlock ? [] : ["sidebar"]), "surface", "field", "overlay"], 3],
    ["accent-solid", ["bg", "surface"], 3],
    ...["danger", "success", "warning", "draft"].map((f) => [`${f}-text`, ["bg", ...(sidebarBlock ? [] : ["sidebar"]), "surface", "field", "overlay", `${f}-soft-bg`], 4.5]),
  ];
  const apcaFloor = (fg) => (fg === "text-faint" ? 0 : fg === "text" ? 75 : /^(text-muted|accent-text|(success|warning|danger|draft)-text)$/.test(fg) ? 60 : 0);
  const fixes = [];
  for (const [fg, bgs, min] of rows) {
    if (fg === "accent-solid" && plan.primary === "ink") continue;
    const bgHex = bgs.map((b) => tt[b]);
    const floor = apcaFloor(fg);
    const ok = (hex) => allPass(hex, bgHex, min) && Math.min(...bgHex.map((b) => Math.abs(apca(hex, b)))) >= floor;
    if (ok(tt[fg])) continue;
    const before = tt[fg];
    const r = nearestL(lch(before), ok) || nearestL(lch(before), (hex) => allPass(hex, bgHex, min));
    tt[fg] = t[fg] = r.hex;
    src[fg] += ` -> L ${r.dL > 0 ? "+" : ""}${r.dL.toFixed(3)} (${allPass(before, bgHex, min) ? `APCA Lc ${floor}` : `WCAG ${min}:1`})`;
    fixes.push({ token: fg, before, after: r.hex });
  }
  // --- brief layer (§2.5, §3.2, §6)
  const canvas = t["canvas-bg"];
  const stroke = (k, grounds, target = FLOORS.strokeMargin) => { const r = lift(t[k], grounds, target); if (r.moved) { src[k] += ` -> L ${r.dL > 0 ? "+" : ""}${r.dL.toFixed(3)} (>= ${target}:1 thin-stroke margin)`; t[k] = r.hex; } };
  stroke("border-strong", [t.bg, ...(sidebarBlock ? [] : [t.sidebar]), t.surface, t.field, t.overlay]);
  stroke("edge", [canvas]);
  stroke("node-stroke", [canvas]);
  { const r = lift(t["edge-strong"], [canvas], FLOORS.edgeStrongTarget); if (r.moved) { t["edge-strong"] = r.hex; src["edge-strong"] += ` -> L ${r.dL.toFixed(3)} (>= 4.5:1 on the canvas)`; } }
  // canvas labels (brief C: tags and captions on a poster canvas)
  for (const [k, from] of [["canvas-label", "text"], ["canvas-label-muted", "text-muted"]]) {
    const r = lift(t[from], [canvas], FLOORS.text);
    t[k] = r.hex; src[k] = r.moved ? `--${from} L ${r.dL.toFixed(3)} (>= 4.5:1 on the canvas)` : `= --${from}`;
  }
  // canvas grid: a quiet mark ~1.22:1 (dots) or ~1.33:1 (sparse crosses) on the canvas, holding the canvas hue/chroma
  if (plan.grid === "none") { t["canvas-grid"] = "none"; src["canvas-grid"] = "none (flat poster; gene G)"; }
  else {
    const co = lch(canvas);
    const dir = co.L > 0.5 ? -1 : 1;
    const r = nearestL({ L: co.L, C: co.C, h: co.h }, (hex) => contrast(hex, canvas) >= plan.gridTarget, { dir, step: 0.0025 });
    t["canvas-grid"] = r.hex; src["canvas-grid"] = `${plan.grid}: canvas hue/chroma, L ${r.dL.toFixed(3)} to ${plan.gridTarget}:1`;
  }
  // selection ring: >= 3.2:1 on the canvas and APCA |Lc| >= 30 (the brief's C-dark reason for the lighter ring)
  const ringOk = (hex) => contrast(hex, canvas) >= FLOORS.strokeMargin && Math.abs(apca(hex, canvas)) >= FLOORS.ringApcaMin;
  {
    let base, baseSrc;
    if (plan.selection === "accent") { base = plan.accent; baseSrc = `accent ${plan.accent}`; }
    else if (/^#/.test(plan.selection)) { base = plan.selection; baseSrc = `plan colour ${plan.selection}`; }
    else { base = ring08; baseSrc = ring08 === ihex ? `exact interaction ${ihex}` : `interaction ramp (report 08 focus-ring rule) ${ring08}`; }
    if (ringOk(base)) { t["selection-ring"] = base; src["selection-ring"] = baseSrc; }
    else if (plan.selection === "interaction" && ringOk(t["accent-text"])) { t["selection-ring"] = t["accent-text"]; src["selection-ring"] = `--accent-text (${baseSrc} is ${r2(contrast(base, canvas))}:1, Lc ${Math.abs(apca(base, canvas)).toFixed(0)} on the canvas)`; }
    else { const r = nearestL(lch(base), ringOk); t["selection-ring"] = r.hex; src["selection-ring"] = `${baseSrc} L ${r.dL > 0 ? "+" : ""}${r.dL.toFixed(3)} (>= 3.2:1 and Lc 30 on the canvas)`; }
  }
  t["focus-ring"] = t.text; src["focus-ring"] = "= --text (brief §2.5: focus is never the accent)";
  // running (gene Q)
  const ch = CHANNELS[plan.channel];
  if (plan.running === "neutral") { t.running = t.text; src.running = "= --text (neutral ink)"; }
  else {
    const base = plan.running === "accent" ? plan.accent : t["accent-solid"];
    const grounds = ch.runningOn.map((k) => t[k]);
    const r = lift(base, grounds, FLOORS.mark);
    t.running = r.hex; src.running = `${plan.running === "accent" ? "accent" : "accent-solid"} ${base}${r.moved ? ` L ${r.dL.toFixed(3)}` : " exact"} (>= 3:1 on ${ch.runningOn.join(", ")})`;
  }
  // signal mark: the accent as a thin mark (>= 3.2 on page, surface, canvas, node fill)
  {
    if (plan.accentRole === "accepted") { t["signal-mark"] = t["success-solid"]; src["signal-mark"] = "= --success-solid (accepted mark; brief B)"; }
    else { const r = lift(plan.accent, [t.bg, t.surface, canvas, t["node-fill"]], FLOORS.strokeMargin); t["signal-mark"] = r.hex; src["signal-mark"] = r.moved ? `accent L ${r.dL.toFixed(3)} (>= 3.2:1 on page, surface, canvas, node fill)` : `exact accent ${plan.accent}`; }
  }
  // draft outline: neutral; stronger when a highlighter carries "not yet accepted" (brief C)
  if (plan.accentRole === "draft-highlight") { t["draft-outline"] = t["edge-strong"]; src["draft-outline"] = "= --edge-strong (the highlighter carries draft; the dashed line stays neutral)"; }
  else { t["draft-outline"] = t["node-stroke"]; src["draft-outline"] = "= --node-stroke (dashed)"; }
  // failed outline on the canvas
  { const r = lift(t["danger-solid"], [canvas], FLOORS.strokeMargin); t["danger-outline"] = r.hex; src["danger-outline"] = r.moved ? `danger-solid L ${r.dL.toFixed(3)} (>= 3.2:1 on the canvas)` : "= --danger-solid"; }
  // diff tokens (one-red rule when red means failure only)
  const surfaces = [t.surface, t.field];
  { const r = lift(t["success-text"], surfaces, FLOORS.text); t["diff-add"] = r.hex; src["diff-add"] = r.moved ? "success-text lifted to 4.5 on surface/field" : "= --success-text"; }
  if (plan.accentRole === "danger") { t["diff-del"] = t["text-muted"]; src["diff-del"] = "= --text-muted + '−' glyph (red means failure only)"; }
  else { const r = lift(t["danger-text"], surfaces, FLOORS.text); t["diff-del"] = r.hex; src["diff-del"] = r.moved ? "danger-text lifted to 4.5 on surface/field" : "= --danger-text"; }
  // Stop is neutral (PRD): field + text
  t["stop-bg"] = t.field; src["stop-bg"] = "= --field (Stop is neutral)";
  t["stop-glyph"] = t.text; src["stop-glyph"] = "= --text";
  // sidebar block text (brief D)
  if (sidebarBlock) {
    const sb = t.sidebar, so = lch(sb);
    // hover steps darker in light / lighter in dark (brief D); flipped when the text could not clear 4.5 on it
    let dh = light ? -0.06 : 0.04;
    let hov = oklchToHex(so.L + dh, so.C, so.h);
    let rt = lift(t.text, [sb, hov], FLOORS.text);
    if (rt.failed) { dh = -dh; hov = oklchToHex(so.L + dh, so.C, so.h); rt = lift(t.text, [sb, hov], FLOORS.text); }
    t["sidebar-hover"] = hov; src["sidebar-hover"] = `sidebar L ${dh > 0 ? "+" : ""}${dh}${(light ? -0.06 : 0.04) !== dh ? " (flipped so text still clears 4.5)" : ""}`;
    t["sidebar-text"] = rt.hex; src["sidebar-text"] = rt.failed ? "text cannot reach 4.5 on this block" : rt.moved ? "text lifted to 4.5 on the block" : "= --text";
    const rm = lift(t["text-muted"], [sb, hov], 4.6);
    if (rm.failed) { t["sidebar-muted"] = t["sidebar-text"]; src["sidebar-muted"] = "= --sidebar-text (the block is too mid-tone for a separate muted grade)"; }
    else { t["sidebar-muted"] = rm.hex; src["sidebar-muted"] = rm.moved ? `text-muted L ${rm.dL.toFixed(3)} (>= 4.6 on block and hover; brief D)` : "= --text-muted"; }
  } else { t["sidebar-text"] = t.text; t["sidebar-muted"] = t["text-muted"]; src["sidebar-text"] = "= --text"; src["sidebar-muted"] = "= --text-muted"; }
  // role aliases for the accent signal (brief names)
  const aliases = {};
  if (plan.accentRole === "accepted") { aliases["accepted-fill"] = "signal-fill"; aliases["accepted-fill-label"] = "signal-fill-label"; aliases["accepted-mark"] = "signal-mark"; }
  if (plan.accentRole === "draft-highlight") { aliases["highlight-fill"] = "signal-fill"; aliases["highlight-fill-label"] = "signal-fill-label"; }
  for (const [a, k] of Object.entries(aliases)) { t[a] = t[k]; src[a] = `= --${k}`; }
  // hard token overrides (recorded)
  const ovT = plan.tokenOverrides?.[mode] || {};
  for (const [k, v] of Object.entries(ovT)) { src[k] = `override (was ${t[k] ?? "unset"})`; t[k] = v.toUpperCase(); }
  return { tokens: t, source: src, neutral: { steps: N, hue: r1(nr.hue), chroma: +nr.chroma.toFixed(4), pinned: nr.pinIdx != null ? `neutral-${nr.pinIdx + 1}` : null, rebasedL: nr.rebased ? +nr.rebased.toFixed(3) : 0 },
    interactionRamp: acc.steps, functional: funcInfo, familyL: { L: +fam.L.toFixed(3), C: +fam.C.toFixed(3) }, fixes, sidebarBlock, chromeCanvas };
}

// ------------------------------------------------------------------ family + series search (final-brief-cat.mjs algorithm, cached)
function labs(hex) { return { n: labOf(hex), p: labOf(hex, "protan"), d: labOf(hex, "deutan") }; }
function makeRow(h, lightHex, darkHex, cacheL, cacheD) {
  return { h, light: lightHex, dark: darkHex, lab: { light: cacheL, dark: cacheD }, Cl: lch(lightHex).C, Cd: lch(darkHex).C };
}
function pairMetric(a, b, gapMin) {
  if (hueGap(a.h, b.h) < gapMin) return 0;
  let m = Infinity;
  for (const mode of MODES) {
    const x = a.lab[mode], y = b.lab[mode];
    const dn = dEab(x.n, y.n) / 15;
    const dc = Math.min(dEab(x.p, y.p), dEab(x.d, y.d)) / 8;
    if (dn < m) m = dn;
    if (dc < m) m = dc;
  }
  return m;
}
const better = (a, b) => (Math.round(a[0] * 400) !== Math.round(b[0] * 400) ? a[0] > b[0] : a[1] > b[1]);
function search({ pools, restarts, seed, gapMin, randomRestarts = 0 }) {
  const n = pools.length;
  const pm = (a, b) => pairMetric(a, b, gapMin);
  const score = (sel) => { let mn = Infinity, sm = 0, k = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const v = pm(sel[i], sel[j]); mn = Math.min(mn, v); sm += v; k++; } return [mn, sm / k]; };
  const npairs = (n * (n - 1)) / 2;
  const ascend = (sel) => {
    let cur = score(sel);
    for (let round = 0; round < 15; round++) {
      let improved = false;
      for (let i = 0; i < n; i++) {
        const others = sel.filter((_, j) => j !== i);
        let restMin = Infinity, restSum = 0;
        for (let a = 0; a < others.length; a++) for (let b = a + 1; b < others.length; b++) { const v = pm(others[a], others[b]); restMin = Math.min(restMin, v); restSum += v; }
        let best = sel[i], bs = cur;
        for (const c of pools[i]) {
          let mn = restMin, sm = restSum;
          for (const o of others) { const v = pm(c, o); if (v < mn) mn = v; sm += v; }
          const s = [mn, sm / npairs];
          if (better(s, bs)) { bs = s; best = c; }
        }
        if (best !== sel[i]) { sel[i] = best; cur = bs; improved = true; }
      }
      if (!improved) break;
    }
    return { sel, cur };
  };
  const greedy = (first) => {
    const sel = Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      let best = null, bs = -1;
      const pool = i === 0 && first ? [first] : pools[i];
      for (const cand of pool) {
        const others = sel.filter((x, j) => x && j !== i);
        const sc = others.length ? Math.min(...others.map((o) => pm(cand, o))) + 1e-3 * (cand.Cl + cand.Cd) : cand.Cl;
        if (sc > bs) { bs = sc; best = cand; }
      }
      sel[i] = best;
    }
    return sel;
  };
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  let best = null;
  for (let r = 0; r < restarts; r++) {
    const first = r === 0 ? null : pools[0][Math.floor(rnd() * pools[0].length)];
    const run = ascend(greedy(first));
    if (!best || better(run.cur, best.cur)) best = { sel: run.sel.slice(), cur: run.cur };
  }
  // extra restarts from a fully random start (report 08's engine style); keeps the first-slot restarts' result unless beaten
  for (let r = 0; r < randomRestarts; r++) {
    const run = ascend(pools.map((p) => p[Math.floor(rnd() * p.length)]));
    if (better(run.cur, best.cur)) best = { sel: run.sel.slice(), cur: run.cur };
  }
  return best;
}
function orderByDistinctness(sel, gapMin, keepFirst) {
  const out = keepFirst ? [sel[0]] : [];
  const rest = keepFirst ? sel.slice(1) : sel.slice();
  if (!out.length) { let bi = 0; rest.forEach((c, i) => { if (c.Cl + c.Cd > rest[bi].Cl + rest[bi].Cd) bi = i; }); out.push(rest.splice(bi, 1)[0]); }
  while (rest.length) {
    let bi = 0, bs = -1;
    rest.forEach((c, i) => { const sc = Math.min(...out.map((x) => pairMetric(c, x, gapMin))); if (sc > bs) { bs = sc; bi = i; } });
    out.push(rest.splice(bi, 1)[0]);
  }
  return out;
}
function pairStats(rows) {
  const o = {};
  for (const m of MODES) {
    let n = Infinity, c = Infinity, tr = Infinity, np = null, cp = null;
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i][m], b = rows[j][m];
      const dn = dEn(a, b), dc = dEc(a, b);
      if (dn < n) { n = dn; np = `${a}/${b}`; }
      if (dc < c) { c = dc; cp = `${a}/${b}`; }
      tr = Math.min(tr, dEab(labOf(a, "tritan"), labOf(b, "tritan")));
    }
    o[m] = { minNormal: r1(n), worstNormalPair: np, minCVD: r1(c), worstCvdPair: cp, minTritan: r1(tr) };
  }
  return o;
}
const iconOn = (fill) => (contrast("#FFFFFF", fill) >= contrast(INK, fill) ? "#FFFFFF" : INK);

function reservedSet(T, plan) {
  const out = {};
  for (const m of MODES) {
    const t = T[m].tokens;
    const keys = [plan.primary === "ink" ? "accent-text" : "accent-solid", ...(plan.primary === "ink" ? [] : ["accent-solid-alt"]), "selection-ring",
      ...(t.running !== t.text ? ["running"] : []), "danger-solid", "danger-strong", "danger-text", "warning-solid", "success-solid", "signal-fill", "signal-mark"];
    const seen = new Set();
    out[m] = {};
    for (const k of keys) { const v = t[k]; if (!v || seen.has(v)) continue; seen.add(v); out[m][k] = v; }
  }
  return out;
}
function familyColours(T, plan) {
  const ch = CHANNELS[plan.channel];
  const floor = plan.familyFloor ?? ch.floor;
  const grounds = { light: uniq(ch.grounds.map((k) => T.light.tokens[k])), dark: uniq(ch.grounds.map((k) => T.dark.tokens[k])) };
  const groundNames = ch.grounds;
  const reserved = reservedSet(T, plan);
  const hueRefs = [];
  for (const m of MODES) { const o = lch(T[m].tokens["selection-ring"]); if (o.C >= 0.03 && !hueRefs.some((x) => x.kind === "interaction" && hueGap(x.h, o.h) < 5)) hueRefs.push({ kind: "interaction", h: o.h, gap: FLOORS.familyInteractionGap, from: `selection-ring (${m}) ${T[m].tokens["selection-ring"]}` }); }
  for (const f of ["danger", "warning", "success"]) { const hx = T.light.tokens[`${f}-solid`]; hueRefs.push({ kind: f, h: lch(hx).h, gap: f === "danger" ? ch.dangerGap : FLOORS.familyStatusGap, from: `${f}-solid (light) ${hx}` }); }
  const BANDS = { light: [0.44, 0.72], dark: [0.58, 0.86] };
  const perMode = (hex, m) => grounds[m].every((g) => contrast(hex, g) >= 3) && Object.values(reserved[m]).every((r) => dEn(hex, r) >= floor) && (!ch.solidIcon || contrast(iconOn(hex), hex) >= FLOORS.iconOnFill);
  const cands = [];
  for (let h = 0; h < 360; h += 3) {
    if (hueRefs.some((r) => hueGap(h, r.h) < r.gap)) continue;
    const per = { light: [], dark: [] };
    for (const m of MODES) for (let L = BANDS[m][0]; L <= BANDS[m][1] + 1e-9; L += 0.02) {
      const C = Math.min(maxChroma(L, h), 0.19);
      if (C < 0.1) continue;
      const hex = oklchToHex(L, C, h);
      if (perMode(hex, m)) per[m].push({ hex, lab: labs(hex) });
    }
    for (const a of per.light) for (const b of per.dark) cands.push(makeRow(h, a.hex, b.hex, a.lab, b.lab));
  }
  const gh = lch(plan.ground);
  let anchor = null;
  if (plan.familyAnchor === "ground-hue" && gh.C >= 0.01) {
    const w = plan.familyAnchorWidth;
    const pool = cands.filter((c) => hueGap(c.h, gh.h) <= w);
    if (pool.length) anchor = { lo: +(gh.h - w).toFixed(0), hi: +(gh.h + w).toFixed(0), pool };
  }
  const result = { channel: plan.channel, channelWhat: ch.what, reservedFloor: floor, grounds: Object.fromEntries(MODES.map((m) => [m, Object.fromEntries(groundNames.map((k) => [k, T[m].tokens[k]]))])),
    reserved, hueRules: hueRefs.map((r) => ({ ...r, h: r1(r.h) })), pool: cands.length, anchor: anchor ? { hue: r1(gh.h), lo: anchor.lo, hi: anchor.hi, pool: anchor.pool.length } : null };
  if (cands.length < 6) { result.rows = []; result.infeasible = `only ${cands.length} candidate colours pass the per-colour rules`; return result; }
  const runSearch = (anc) => search({ pools: Array.from({ length: 6 }, (_, i) => (i === 0 && anc ? anc.pool : cands)), restarts: plan.familySearch.restarts, randomRestarts: plan.familySearch.randomRestarts, seed: 12345, gapMin: FLOORS.familyPairGap });
  let best = runSearch(anchor);
  const sane = (b) => { const st = pairStats(b.sel); return MODES.every((m) => st[m].minNormal >= FLOORS.familyNormalSanity && st[m].minCVD >= FLOORS.familyCvdSanity); };
  if (anchor && !sane(best)) {
    const free = runSearch(null);
    if (better(free.cur, best.cur)) { best = free; result.anchor = { ...result.anchor, dropped: "the anchored set failed the sanity floor and the unanchored search did better" }; anchor = null; }
  }
  if (best.cur[0] === 0) result.infeasible = `fewer than six hues >= ${FLOORS.familyPairGap} deg apart pass the per-colour rules (pool ${cands.length} colours over ${uniq(cands.map((c) => c.h)).length} hues)`;
  const ordered = orderByDistinctness(best.sel, FLOORS.familyPairGap, !!anchor);
  result.rows = ordered.map((r, i) => {
    const row = { fam: `F${i + 1}`, h: r.h, hueName: hueName(r.h), anchored: i === 0 && !!anchor };
    for (const m of MODES) {
      const hex = r[m];
      const near = Object.entries(reserved[m]).map(([k, v]) => ({ token: k, hex: v, dE: r1(dEn(hex, v)), dECVD: r1(dEc(hex, v)) })).sort((a, b) => a.dE - b.dE)[0];
      row[m] = { hex, oklch: fmtL(hex), grounds: Object.fromEntries(groundNames.map((k) => [k, r2(contrast(hex, T[m].tokens[k]))])), nearestReserved: near,
        ...(ch.solidIcon ? { icon: iconOn(hex) === "#FFFFFF" ? "white" : `ink ${INK}`, iconContrast: r2(contrast(iconOn(hex), hex)) } : {}) };
    }
    return row;
  });
  result.score = { minMetric: +best.cur[0].toFixed(3), meanMetric: +best.cur[1].toFixed(3), note: "min over pairs and themes of min(dE_normal/15, dE_CVD/8); >= 1 meets report 08's targets" };
  result.stats = pairStats(ordered);
  return result;
}

// ------------------------------------------------------------------ authoring guidance (addendum 13 §B)
function authoring(T, plan, fam) {
  const out = { rules: "text/text-muted/link >= 4.5 on page and card; border >= 3; focus = text; series marks >= 3 on page and card; series dE >= 10 from danger and accent, >= 8 from status, >= 10 from every family colour; hue gap >= 20 within the series; maximise min(normal/15, CVD/8)" };
  const neutralHue = hueName(T.light.neutral.hue);
  for (const m of MODES) {
    const t = T[m].tokens;
    const page = t.surface, card = t.field;
    const fix = (hex, min) => lift(hex, [page, card], min);
    const txt = fix(t.text, 4.5), mut = fix(t["text-muted"], 4.5), link = fix(t["accent-text"], 4.5), bord = fix(t["border-strong"], 3);
    out[m] = { page: "transparent", pageResolved: page, card, text: txt.hex, "text-muted": mut.hex, border: bord.hex, rule: t.border, link: link.hex, focus: txt.hex,
      source: { card: "= --field", text: txt.moved ? "--text lifted" : "= --text", "text-muted": mut.moved ? "--text-muted lifted to 4.5 on card" : "= --text-muted", border: bord.moved ? "--border-strong lifted" : "= --border-strong", link: link.moved ? "--accent-text lifted to 4.5 on card" : "= --accent-text", focus: "= text" } };
  }
  // series search
  const BANDS = { light: [0.4, 0.7], dark: [0.62, 0.88] };
  const res = {};
  for (const m of MODES) {
    const t = T[m].tokens;
    res[m] = [
      ...["danger-solid", "danger-strong", "danger-text", "danger-outline"].map((k) => ({ k, hex: t[k], floor: FLOORS.seriesDanger })),
      ...["accent-solid", "accent-text", "selection-ring", "signal-fill", "signal-mark"].map((k) => ({ k, hex: t[k], floor: FLOORS.seriesAccent })),
      ...["warning-solid", "success-solid"].map((k) => ({ k, hex: t[k], floor: FLOORS.seriesStatus })),
      ...(fam.rows || []).map((r) => ({ k: `family ${r.fam}`, hex: r[m].hex, floor: FLOORS.seriesFamily })),
    ];
  }
  const grounds = { light: [out.light.pageResolved, out.light.card], dark: [out.dark.pageResolved, out.dark.card] };
  const cands = [];
  for (let h = 0; h < 360; h += 3) {
    const per = { light: [], dark: [] };
    for (const m of MODES) for (let L = BANDS[m][0]; L <= BANDS[m][1] + 1e-9; L += 0.02) {
      const C = Math.min(maxChroma(L, h), 0.15);
      if (C < 0.07) continue;
      const hex = oklchToHex(L, C, h);
      if (!grounds[m].every((g) => contrast(hex, g) >= 3)) continue;
      if (!res[m].every((r) => dEn(hex, r.hex) >= r.floor)) continue;
      per[m].push({ hex, lab: labs(hex) });
    }
    for (const a of per.light) for (const b of per.dark) cands.push(makeRow(h, a.hex, b.hex, a.lab, b.lab));
  }
  const pick = (n) => {
    if (cands.length < n) return null;
    const best = search({ pools: Array.from({ length: n }, () => cands), restarts: 20, randomRestarts: 40, seed: 777, gapMin: 20 });
    const ordered = orderByDistinctness(best.sel, 20, false);
    return { rows: ordered, stats: pairStats(ordered), metric: best.cur[0] };
  };
  let s = pick(plan.seriesCount);
  const weak = (x) => !x || ["light", "dark"].some((m) => x.stats[m].minNormal < 12 || x.stats[m].minCVD < 6);
  let countNote = `${plan.seriesCount} colours`;
  if (weak(s)) { const s4 = pick(4); if (s4 && !weak(s4)) { s = s4; countNote = `4 colours (5 fell below dE 12 normal / 6 CVD)`; } }
  out.seriesPool = cands.length;
  out.seriesCount = countNote;
  if (!s) { out.series = []; out.seriesInfeasible = `only ${cands.length} candidate series colours pass`; return out; }
  out.series = s.rows.map((r, i) => {
    const row = { slot: i + 1, name: hueName(r.h), h: r.h };
    for (const m of MODES) {
      const hex = r[m], t = T[m].tokens;
      const lbl = bestOn(hex, ["#FFFFFF", m === "light" ? t.text : t.bg]);
      const near = res[m].map((x) => ({ token: x.k, hex: x.hex, dE: r1(dEn(hex, x.hex)) })).sort((a, b) => a.dE - b.dE)[0];
      row[m] = { hex, oklch: fmtL(hex), onCard: r2(contrast(hex, out[m].card)), onPage: r2(contrast(hex, out[m].pageResolved)), label: lbl, labelContrast: r2(contrast(lbl, hex)), nearestReserved: near };
    }
    return row;
  });
  out.seriesStats = s.stats;
  out.snippet = {
    light: `[data-relayer-theme="light"] .explanation { color: ${out.light.text.toLowerCase()}; background-color: ${out.light.pageResolved.toLowerCase()}; }`,
    dark: `[data-relayer-theme="dark"] .explanation { color: ${out.dark.text.toLowerCase()}; background-color: ${out.dark.pageResolved.toLowerCase()}; }`,
    sentence: `Relayer light uses pale ${neutralHue}-tinted neutral surfaces and dark text; dark uses deep ${neutralHue}-tinted neutral surfaces and light text.`,
  };
  return out;
}

// ------------------------------------------------------------------ checks
function runChecks(T, plan, fam, auth) {
  const contrastRows = [], failures = [], warnings = [];
  const ck = (m, fg, bg, floor, kind, margin) => {
    const t = T[m].tokens;
    const fgHex = t[fg] ?? fg, bgHex = t[bg] ?? bg;
    if (!/^#/.test(fgHex) || !/^#/.test(bgHex)) return;
    const ratio = contrast(fgHex, bgHex);
    const pass = ratio >= floor - 1e-9;
    const row = { theme: m, fg, bg, fgHex, bgHex, ratio: r2(ratio), floor, kind, pass };
    if (margin) row.margin = margin;
    contrastRows.push(row);
    if (!pass) failures.push(`${m}: ${fg} ${fgHex} on ${bg} ${bgHex} = ${r2(ratio)} < ${floor} (${kind})`);
    else if (margin && ratio < margin - 1e-9) warnings.push(`${m}: ${fg} on ${bg} = ${r2(ratio)} (below the ${margin}:1 thin-stroke margin)`);
  };
  for (const m of MODES) {
    const t = T[m].tokens, sb = T[m].sidebarBlock;
    const chrome = ["bg", ...(sb ? [] : ["sidebar"]), "surface", "field", "overlay"];
    const rowsBg = [...chrome, "hover", "selected"];
    for (const b of [...rowsBg, "node-fill", "accent-soft-bg", "danger-soft-bg", "success-soft-bg", "warning-soft-bg", "draft-soft-bg"]) ck(m, "text", b, 4.5, "text");
    for (const b of [...rowsBg, "node-fill"]) ck(m, "text-muted", b, 4.5, "text (placeholders)");
    for (const b of [...rowsBg, "accent-soft-bg"]) ck(m, "accent-text", b, 4.5, "text (links)");
    ck(m, "accent-solid-label", "accent-solid", 4.5, "label on primary");
    if (t["accent-solid-alt"]) ck(m, "accent-solid-alt-label", "accent-solid-alt", 4.5, "label on alt primary");
    for (const b of ["bg", "surface"]) ck(m, "accent-solid", b, 3, "control fill");
    ck(m, "selection-ring", "canvas-bg", 3, "selection ring", FLOORS.strokeMargin);
    for (const b of [...chrome, "hover", "selected", "canvas-bg", "node-fill"]) ck(m, "focus-ring", b, 3, "focus ring");
    for (const k of CHANNELS[plan.channel].runningOn) ck(m, "running", k, 3, "running arc");
    for (const b of chrome) ck(m, "border-strong", b, 3, "control boundary", FLOORS.strokeMargin);
    ck(m, "edge", "canvas-bg", 3, "edge", FLOORS.strokeMargin);
    ck(m, "node-stroke", "canvas-bg", 3, "node outline", FLOORS.strokeMargin);
    ck(m, "edge-strong", "canvas-bg", 3, "edge (hover/selected)");
    ck(m, "draft-outline", "canvas-bg", 3, "draft outline", FLOORS.strokeMargin);
    ck(m, "canvas-label", "canvas-bg", 4.5, "canvas label");
    ck(m, "canvas-label-muted", "canvas-bg", 4.5, "canvas caption");
    ck(m, "danger-outline", "canvas-bg", 3, "failed outline", FLOORS.strokeMargin);
    for (const f of ["danger", "success", "warning", "draft"]) {
      for (const b of ["bg", "surface", "field", "node-fill"]) ck(m, `${f}-solid`, b, 3, "status solid");
      ck(m, `${f}-solid-label`, `${f}-solid`, 4.5, "label on status solid");
      for (const b of [...chrome, `${f}-soft-bg`]) ck(m, `${f}-text`, b, 4.5, "status text");
    }
    ck(m, "danger-strong-label", "danger-strong", 4.5, "white glyph on failed badge");
    for (const b of ["surface", "field"]) { ck(m, "diff-add", b, 4.5, "diff text"); ck(m, "diff-del", b, 4.5, "diff text"); }
    ck(m, "stop-glyph", "stop-bg", 4.5, "Stop glyph");
    ck(m, "signal-fill-label", "signal-fill", 4.5, "label on accent fill");
    for (const b of ["bg", "surface", "canvas-bg", "node-fill"]) ck(m, "signal-mark", b, 3, "accent as a mark", FLOORS.strokeMargin);
    if (sb) { ck(m, "sidebar-text", "sidebar", 4.5, "sidebar text"); ck(m, "sidebar-muted", "sidebar", 4.5, "sidebar text"); ck(m, "sidebar-muted", "sidebar-hover", 4.5, "sidebar text"); }
    // structural rules
    if (t["focus-ring"] !== t.text) failures.push(`${m}: focus ring is not --text`);
    if (t["stop-bg"] !== t.field || t["stop-glyph"] !== t.text) failures.push(`${m}: Stop is not field + text`);
    if (lch(t["stop-bg"]).C > 0.03) failures.push(`${m}: Stop background is not neutral (C ${lch(t["stop-bg"]).C.toFixed(3)})`);
    if (m === "dark") for (const k of ["bg", "sidebar", "surface", "canvas-bg", "node-fill"]) if (t[k] === "#000000") failures.push(`dark: ${k} is pure black`);
    // APCA advisories (brief §2.5): primary text Lc >= 75, secondary >= 60 on the page
    for (const [k, lc] of [["text", 75], ["text-muted", 60]]) { const v = Math.abs(apca(t[k], t.bg)); if (v < lc) warnings.push(`${m}: APCA ${k} on bg Lc ${v.toFixed(0)} < ${lc} (advisory)`); }
  }
  // families
  const famOut = { failures: [], stats: fam.stats || null };
  if (fam.infeasible) failures.push(`families: ${fam.infeasible}`);
  const ch = CHANNELS[plan.channel];
  for (const r of fam.rows || []) {
    for (const m of MODES) {
      const hex = r[m].hex;
      for (const [k, v] of Object.entries(r[m].grounds)) if (v < 3) failures.push(`${m}: family ${r.fam} ${hex} on ${k} ${v} < 3`);
      if (r[m].nearestReserved && r[m].nearestReserved.dE < fam.reservedFloor) failures.push(`${m}: family ${r.fam} ${hex} dE ${r[m].nearestReserved.dE} from ${r[m].nearestReserved.token} < ${fam.reservedFloor}`);
      if (ch.solidIcon && r[m].iconContrast < FLOORS.iconOnFill) failures.push(`${m}: family ${r.fam} icon ${r[m].iconContrast} < 4.5`);
    }
    for (const hr of fam.hueRules) if (hueGap(r.h, hr.h) < hr.gap) failures.push(`family ${r.fam} hue ${r.h} within ${hr.gap} deg of ${hr.kind}`);
  }
  if (fam.stats) for (const m of MODES) {
    const s = fam.stats[m];
    if (s.minNormal < FLOORS.familyNormalSanity || s.minCVD < FLOORS.familyCvdSanity) failures.push(`${m}: families too close (min dE ${s.minNormal} normal / ${s.minCVD} CVD; engine sanity floor ${FLOORS.familyNormalSanity} / ${FLOORS.familyCvdSanity})`);
    else if (s.minNormal < FLOORS.familyNormalTarget || s.minCVD < FLOORS.familyCvdTarget) warnings.push(`${m}: family min dE ${s.minNormal} normal / ${s.minCVD} CVD below report 08 targets ${FLOORS.familyNormalTarget} / ${FLOORS.familyCvdTarget}`);
  }
  const nearestAll = (fam.rows || []).flatMap((r) => MODES.map((m) => ({ fam: r.fam, theme: m, ...r[m].nearestReserved }))).sort((a, b) => a.dE - b.dE)[0] || null;
  // authoring
  const authRows = [];
  for (const m of MODES) {
    const a = auth[m];
    for (const [k, min] of [["text", 4.5], ["text-muted", 4.5], ["link", 4.5], ["border", 3], ["focus", 3]]) for (const [gname, g] of [["page", a.pageResolved], ["card", a.card]]) {
      const v = contrast(a[k], g); authRows.push({ theme: m, fg: `authoring ${k}`, bg: gname, fgHex: a[k], bgHex: g, ratio: r2(v), floor: min, pass: v >= min - 1e-9 });
      if (v < min - 1e-9) failures.push(`${m}: authoring ${k} on ${gname} ${r2(v)} < ${min}`);
    }
    for (const s of auth.series || []) for (const g of ["onCard", "onPage"]) if (s[m][g] < 3) failures.push(`${m}: series ${s.slot} ${g} ${s[m][g]} < 3`);
  }
  if (auth.seriesInfeasible) failures.push(`authoring: ${auth.seriesInfeasible}`);
  if (auth.seriesStats) for (const m of MODES) {
    const s = auth.seriesStats[m];
    if (s.minNormal < FLOORS.familyNormalSanity || s.minCVD < FLOORS.familyCvdSanity) failures.push(`${m}: chart series too close (min dE ${s.minNormal} / CVD ${s.minCVD})`);
    else if (s.minNormal < FLOORS.seriesNormalTarget || s.minCVD < FLOORS.seriesCvdTarget) warnings.push(`${m}: chart series min dE ${s.minNormal} normal / ${s.minCVD} CVD below ${FLOORS.seriesNormalTarget} / ${FLOORS.seriesCvdTarget}`);
  }
  return {
    floors: FLOORS,
    contrast: contrastRows,
    authoringContrast: authRows,
    families: { minPairwise: fam.stats, nearestReserved: nearestAll, score: fam.score || null },
    series: { minPairwise: auth.seriesStats || null },
    failures: uniq(failures), warnings: uniq(warnings), pass: failures.length === 0,
  };
}

// ------------------------------------------------------------------ exact source-colour use
function exactUse(c, T) {
  const srcs = [];
  const add = (hex, role) => { if (hex && !srcs.some((s) => s.hex === hex.toUpperCase())) srcs.push({ hex: hex.toUpperCase(), role }); };
  add(c.roles.ground, "ground"); add(c.roles.ink, "ink"); add(c.roles.accent, "accent");
  for (const s of c.roles.support || []) add(s, "support");
  const used = [];
  for (const m of MODES) for (const [k, v] of Object.entries(T[m].tokens)) { const s = srcs.find((x) => x.hex === v); if (s) used.push({ theme: m, token: k, hex: v, sourceRole: s.role }); }
  const unused = srcs.filter((s) => !used.some((u) => u.hex === s.hex)).map((s) => ({ ...s, why: s.role === "support" ? "support colour: the engine does not place support colours (the plan names only ground, ink and accent)" : "no token could take it exactly under the floors (see the source notes of the nearest token)" }));
  return { used, unused };
}

// ------------------------------------------------------------------ public entry
export function engineer(c, ov = {}) {
  const plan = resolvePlan(c, ov);
  const T = { light: buildTheme(plan, "light"), dark: buildTheme(plan, "dark") };
  const fam = familyColours(T, plan);
  const auth = authoring(T, plan, fam);
  const checks = runChecks(T, plan, fam, auth);
  const { tokenOverrides, ...planOut } = plan;
  return {
    id: c.id, name: c.name, engine: ENGINE_VERSION,
    candidate: { swatches: c.swatches, roles: c.roles, semantic_plan: c.semantic_plan, intended_default_theme: c.intended_default_theme, relation_to_gen1: c.relation_to_gen1 },
    plan: { ...planOut, tokenOverrides: tokenOverrides || undefined },
    light: { tokens: T.light.tokens, source: T.light.source, neutral: T.light.neutral, functional: T.light.functional, fixes: T.light.fixes },
    dark: { tokens: T.dark.tokens, source: T.dark.source, neutral: T.dark.neutral, functional: T.dark.functional, fixes: T.dark.fixes },
    families: fam,
    authoring: auth,
    exact: exactUse(c, T),
    checks,
  };
}
export function loadCandidates(file = path.join(HERE, "candidates.json")) { return JSON.parse(fs.readFileSync(file, "utf8")); }
export function loadOverrides(file = path.join(HERE, "overrides.json")) {
  if (!file || !fs.existsSync(file)) return {};
  const o = JSON.parse(fs.readFileSync(file, "utf8"));
  delete o._readme;
  return o;
}

// ------------------------------------------------------------------ CLI
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  let ovFile = path.join(HERE, "overrides.json"), outDir = path.join(HERE, "tokens");
  const ids = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--overrides") ovFile = path.resolve(args[++i]);
    else if (args[i] === "--no-overrides") ovFile = null;
    else if (args[i] === "--out") outDir = path.resolve(args[++i]);
    else ids.push(args[i]);
  }
  const cands = loadCandidates();
  const ovs = loadOverrides(ovFile);
  fs.mkdirSync(outDir, { recursive: true });
  const todo = ids.length ? cands.filter((c) => ids.includes(c.id)) : cands;
  const summary = [];
  for (const c of todo) {
    const t0 = Date.now();
    const out = engineer(c, ovs[c.id] || {});
    fs.writeFileSync(path.join(outDir, `${c.id}.json`), JSON.stringify(out, null, 1));
    const f = out.families.stats;
    summary.push({ id: c.id, name: c.name, pass: out.checks.pass, failures: out.checks.failures, warnings: out.checks.warnings.length,
      families: f ? { light: `${f.light.minNormal}/${f.light.minCVD}`, dark: `${f.dark.minNormal}/${f.dark.minCVD}` } : null, overrides: Object.keys(ovs[c.id] || {}).filter((k) => k !== "_why") });
    console.log(`${c.id.padEnd(4)} ${out.checks.pass ? "PASS" : "FAIL"} ${String(out.checks.failures.length).padStart(2)} failures ${String(out.checks.warnings.length).padStart(2)} warnings | families dE light ${f ? `${f.light.minNormal}/${f.light.minCVD}` : "-"} dark ${f ? `${f.dark.minNormal}/${f.dark.minCVD}` : "-"} | ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    for (const x of out.checks.failures) console.log(`       - ${x}`);
  }
  if (!ids.length) fs.writeFileSync(path.join(outDir, "_summary.json"), JSON.stringify({ engine: ENGINE_VERSION, overridesFile: ovFile && fs.existsSync(ovFile) ? path.basename(ovFile) : null, candidates: summary }, null, 1));
}
