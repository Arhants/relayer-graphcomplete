#!/usr/bin/env node
// Geometry for prototype B · Surly "Sticker". Computes, per scene, the canvas rect, the Fit zoom, the tier, every node's
// anchor / pill / footprint / title / caption box and every edge's clipped arc, all in BOARD px, then checks collisions.
// Faithful to the repo: projectLayerNodePositions (graph-layout.js:58-84: 960x640 world, 32 world padding + the largest
// node layoutBounds) and fitGraphCamera/recenterGraphCamera (workspace.js:283-326: per-node layoutBounds, centred),
// with the brief's changes: Fit padding 48 desktop / 16 phone, Fit capped at 1.25x, nodes and labels screen-constant.
// Usage: node geometry.mjs   (reads work/text-widths.json from measure.mjs; writes geometry.json; prints a report)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const W = JSON.parse(readFileSync(join(here, 'work', 'text-widths.json'), 'utf8'));
const tw = (font, weight, size, text) => {
  const k = `${font}|${weight}|${size}|${text}`;
  if (!W[k]) throw new Error('not measured: ' + k);
  return W[k].w;
};

// ---------- B node constants (spec.md §Node) ----------
const PILL_H = 36, DISC = 28, DISC_INSET = 4, TITLE_X = 40, PAD_R = 16, MORE_GAP = 6, MORE_ICON = 12, MORE_PAD_R = 12;
const PILL_MAX = 248, PEEK = 3, BADGE_R = 8, BADGE_HALO = 2, CAPTION_GAP = 6, CAPTION_H = 16, CLIP = 4;
const RING_GAP = 2, RING_W = 2; // selection ring: 2px ring at a 2px gap -> outer edge 4px outside the footprint
const OVERVIEW_DISC = 28, LABEL_GAP = 4; // phone overview token + selected-node label (13/600)
// layoutBounds (world units = card-tier px at 1.0x) = the node element's own box, as today's graphNodeLayoutBounds
// measures offsetWidth/offsetHeight: for B that is the PILL only. Peek, badges, caption and ring overflow the element
// (like today's annotation badge) and live inside the 32 world padding and the 48/16 Fit padding. Always measured at
// card tier, even when the overview token is drawn, so tier and zoom cannot feed back into each other.
const layoutBounds = (n) => ({ halfWidth: pillWidth(n).w / 2, top: PILL_H / 2, bottom: PILL_H / 2 });
const WORLD = { w: 960, h: 640, pad: 32 };
const ZOOM = { min: 0.4, max: 2, fitCap: 1.25 };
const ARC_K = 0.12; // sagitta = 0.12 x chord length (brief §6.2 "curvature 0.12 x edge length")

// ---------- canonical content (§3.4) ----------
const NODES = [
  { id: 'N1', title: 'Offline recovery covenant', icon: 'scroll-text', fam: 'f1', x: 0.42, y: 0.22, more: 2, actions: ['invoke', 'input'], selected: true },
  { id: 'N2', title: 'Constrained recovery revision', icon: 'file-text', fam: 'f1', x: 0.40, y: 0.72, more: 1 },
  { id: 'N3', title: 'Red-team stop condition', icon: 'route', fam: 'f6', x: 0.72, y: 0.30, life: 'running', caption: 'Running' },
  { id: 'N4', title: 'Named owners, weeks 1–6', icon: 'users', fam: 'f5', x: 0.88, y: 0.64, draft: true, caption: 'Draft' },
  { id: 'N5', title: 'Last-known-good build', icon: 'database-backup', fam: 'f3', x: 0.64, y: 0.84, life: 'stopped', caption: 'Stopped' },
  { id: 'N6', title: 'Stale permission grants', icon: 'key', fam: 'f4', x: 0.14, y: 0.44, life: 'failed', caption: 'Failed' },
];
const EDGES = [['N6', 'N1'], ['N6', 'N2'], ['N1', 'N3'], ['N2', 'N5'], ['N3', 'N4', 'draft']];

// ---------- repo camera math ----------
function project(nodes) {
  const lbs = nodes.map(layoutBounds);
  const pad = { h: Math.max(...lbs.map((b) => b.halfWidth)) + WORLD.pad, t: Math.max(...lbs.map((b) => b.top)) + WORLD.pad, b: Math.max(...lbs.map((b) => b.bottom)) + WORLD.pad };
  const uw = WORLD.w - 2 * pad.h, uh = WORLD.h - pad.t - pad.b;
  return nodes.map((n) => ({ ...n, wx: pad.h + n.x * uw, wy: pad.t + n.y * uh }));
}
function fit(nodes, rect, padding) {
  const b = nodes.reduce((r, n) => {
    const lb = layoutBounds(n);
    return {
      minX: Math.min(r.minX, n.wx - lb.halfWidth), maxX: Math.max(r.maxX, n.wx + lb.halfWidth),
      minY: Math.min(r.minY, n.wy - lb.top), maxY: Math.max(r.maxY, n.wy + lb.bottom),
    };
  }, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  const cw = b.maxX - b.minX, ch = b.maxY - b.minY;
  const raw = Math.min((rect.w - 2 * padding) / cw, (rect.h - 2 * padding) / ch);
  const zoom = Math.min(ZOOM.fitCap, Math.max(ZOOM.min, raw));
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  return { zoom, raw, content: { w: cw, h: ch }, camX: rect.x + rect.w / 2 - cx * zoom, camY: rect.y + rect.h / 2 - cy * zoom };
}
const tier = (z) => (z < 0.6 ? 'overview' : z <= 1.4 ? 'card' : 'detail');

// ---------- shapes ----------
const r1 = (v) => Math.round(v * 10) / 10;
const box = (x, y, w, h) => ({ x: r1(x), y: r1(y), w: r1(w), h: r1(h) });
const union = (...bs) => {
  const v = bs.filter(Boolean);
  const x = Math.min(...v.map((b) => b.x)), y = Math.min(...v.map((b) => b.y));
  return box(x, y, Math.max(...v.map((b) => b.x + b.w)) - x, Math.max(...v.map((b) => b.y + b.h)) - y);
};
// capsule (stadium) with centre segment; inside test with extra padding
const capsule = (cx, cy, hw, hh) => ({ kind: 'capsule', cx, cy, hw, hh });
const circle = (cx, cy, r) => ({ kind: 'circle', cx, cy, r });
const rect = (b, r = 0) => ({ kind: 'rect', ...b, r });
function inside(s, px, py, pad) {
  if (s.kind === 'circle') return Math.hypot(px - s.cx, py - s.cy) <= s.r + pad;
  if (s.kind === 'capsule') {
    const rad = s.hh; // pill: radius = half height
    const dx = Math.max(Math.abs(px - s.cx) - (s.hw - rad), 0), dy = Math.abs(py - s.cy);
    return Math.hypot(dx, dy) <= rad + pad;
  }
  return px >= s.x - pad && px <= s.x + s.w + pad && py >= s.y - pad && py <= s.y + s.h + pad;
}
const insideAny = (shapes, px, py, pad) => shapes.some((s) => inside(s, px, py, pad));
function sdf(s, px, py) {
  if (s.kind === 'circle') return Math.hypot(px - s.cx, py - s.cy) - s.r;
  if (s.kind === 'capsule') return Math.hypot(Math.max(Math.abs(px - s.cx) - (s.hw - s.hh), 0), py - s.cy) - s.hh;
  const dx = Math.max(s.x - px, 0, px - (s.x + s.w)), dy = Math.max(s.y - py, 0, py - (s.y + s.h));
  return dx || dy ? Math.hypot(dx, dy) : -Math.min(px - s.x, s.x + s.w - px, py - s.y, s.y + s.h - py);
}
function boundary(s, n = 720) {
  const pts = [];
  if (s.kind === 'rect') { for (let i = 0; i <= n / 4; i++) { const t = i / (n / 4); pts.push([s.x + t * s.w, s.y], [s.x + t * s.w, s.y + s.h], [s.x, s.y + t * s.h], [s.x + s.w, s.y + t * s.h]); } return pts; }
  const r = s.kind === 'circle' ? s.r : s.hh, half = s.kind === 'circle' ? 0 : s.hw - s.hh;
  for (let i = 0; i < n; i++) { const a = (i / n) * 2 * Math.PI, x = Math.cos(a) * r, y = Math.sin(a) * r; pts.push([s.cx + x + Math.sign(x) * half, s.cy + y]); }
  return pts;
}
const clearance = (A, B) => Math.min(...A.flatMap((sa) => boundary(sa).map(([x, y]) => Math.min(...B.map((sb) => sdf(sb, x, y))))));
const rectsOverlap = (a, b, gap = 0) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

// ---------- node layout at card tier ----------
function pillWidth(n) {
  const t = tw('Figtree', 600, 14, n.title);
  const more = n.more ? MORE_GAP + MORE_ICON + tw('Figtree', 600, 12, String(n.more)) + MORE_PAD_R : PAD_R;
  const natural = TITLE_X + t + more + 1; // +1px slack for sub-pixel layout differences
  const w = Math.min(PILL_MAX, Math.ceil(natural / 2) * 2);
  return { w, truncated: natural > PILL_MAX, titleW: t, titleBoxW: w - TITLE_X - more + 1 };
}
function cardNode(n, sx, sy, opts = {}) {
  const pw = pillWidth(n);
  const L = Math.round(sx - pw.w / 2), T = Math.round(sy - PILL_H / 2);
  const R = L + pw.w, B = T + PILL_H;
  const cx = L + pw.w / 2, cy = T + PILL_H / 2;
  const stack = n.more ? PEEK : 0;
  const pill = box(L, T, pw.w, PILL_H);
  const badges = [];
  const showBadges = opts.badges !== false;
  if (showBadges && n.actions?.length === 1) badges.push({ slot: 'tl', kind: n.actions[0], cx: L, cy: T, box: box(L - BADGE_R, T - BADGE_R, 16, 16) });
  // two TL actions: invoke disc on the corner, input disc 4px further out, both lifted 2px (kit .is-pair / .b-badge-tl2)
  if (showBadges && n.actions?.length === 2) {
    badges.push({ slot: 'tl', kind: n.actions[0], cx: L, cy: T - 2, box: box(L - BADGE_R, T - 2 - BADGE_R, 16, 16) });
    badges.push({ slot: 'tl2', kind: n.actions[1], cx: L - 20, cy: T - 2, box: box(L - 20 - BADGE_R, T - 2 - BADGE_R, 16, 16) });
  }
  if (showBadges && n.life) badges.push({ slot: 'br', kind: n.life, cx: R, cy: B, box: box(R - BADGE_R, B - BADGE_R, 16, 16) });
  const footBottom = B + stack;
  const caption = opts.captions !== false && n.caption
    ? { text: n.caption, box: box(L + TITLE_X, footBottom + CAPTION_GAP, Math.ceil(tw('Figtree', 600, 12, n.caption)), CAPTION_H) } : null;
  // selection ring hugs the pill only (the peek, offset 3 down + 3 right, tucks under it)
  const ring = n.selected ? box(L - RING_GAP - RING_W, T - RING_GAP - RING_W, pw.w + 2 * (RING_GAP + RING_W), PILL_H + 2 * (RING_GAP + RING_W)) : null;
  const halo = BADGE_R + BADGE_HALO;
  const footprint = union(pill, stack ? box(L + stack, T + stack, pw.w, PILL_H) : null, ring,
    ...badges.map((b) => box(b.box.x - BADGE_HALO, b.box.y - BADGE_HALO, b.box.w + 2 * BADGE_HALO, b.box.h + 2 * BADGE_HALO)));
  // clip shapes (edges stop CLIP px outside every one of them)
  const shapes = [];
  shapes.push(ring ? capsule(cx, cy, pw.w / 2 + RING_GAP + RING_W, PILL_H / 2 + RING_GAP + RING_W) : capsule(cx, cy, pw.w / 2, PILL_H / 2));
  if (stack) shapes.push(capsule(cx + stack, cy + stack, pw.w / 2, PILL_H / 2));
  for (const b of badges) shapes.push(circle(b.cx, b.cy, halo));
  if (caption) shapes.push(rect(caption.box));
  return {
    id: n.id, title: n.title, icon: n.icon, family: n.fam, state: n.draft ? 'draft' : n.life ? `child-${n.life}` : 'default',
    selected: !!n.selected, opensLayer: n.more || 0, actions: n.actions || [],
    anchor: { x: r1(cx), y: r1(cy) }, pill, style: `left: ${L}px; top: ${T}px; width: ${pw.w}px`,
    titleBox: box(L + TITLE_X, T + 8, pw.titleBoxW, 20), titleTruncated: pw.truncated,
    disc: { cx: L + DISC_INSET + DISC / 2, cy: T + PILL_H / 2, r: DISC / 2 },
    stackPeek: stack ? box(L + stack, T + stack, pw.w, PILL_H) : null, ring, badges, caption,
    labelBox: caption ? caption.box : null, footprint, _shapes: shapes,
  };
}
function overviewNode(n, sx, sy, opts = {}) {
  const cx = Math.round(sx), cy = Math.round(sy), r = OVERVIEW_DISC / 2;
  const ring = n.selected ? box(cx - r - 4, cy - r - 4, OVERVIEW_DISC + 8, OVERVIEW_DISC + 8) : null;
  let label = null;
  if (n.selected) {
    const w = Math.ceil(tw('Figtree', 600, 13, n.title) / 2) * 2;
    label = { text: n.title, box: box(cx - w / 2, cy - r - 4 - LABEL_GAP - 18, w, 18), placement: 'above' };
  }
  const shapes = [circle(cx, cy, ring ? r + 4 : r)];
  if (label) shapes.push(rect(label.box));
  let tooltip = null;
  if (opts.tooltip) {
    const w = Math.ceil(tw('Figtree', 600, 13, n.title)) + 24;
    const x = Math.min(Math.max(cx - w / 2, opts.gutter.l), opts.gutter.r - w);
    tooltip = { text: n.title, box: box(x, cy - r - 8 - 32, w, 32), caret: { x: cx, baseY: cy - r - 8, tipY: cy - r - 2, note: '12px-wide, 6px-tall caret under the box, tip 2px above the token' } };
  }
  return {
    id: n.id, title: n.title, icon: n.icon, family: n.fam, state: 'default', selected: !!n.selected,
    anchor: { x: cx, y: cy }, disc: { cx, cy, r }, style: `left: ${cx - r}px; top: ${cy - r}px`,
    ring, labelBox: label ? label.box : null, label, tooltip,
    footprint: union(box(cx - r, cy - r, OVERVIEW_DISC, OVERVIEW_DISC), ring, label?.box), _shapes: shapes,
  };
}

// ---------- arcs ----------
function arcEdge(a, b, centroid, draft, incident) {
  const A = a.anchor, B = b.anchor;
  const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy);
  const s = ARC_K * d, R = (d * d / 4 + s * s) / (2 * s);
  const M = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  let n = { x: -dy / d, y: dx / d };
  const out = (M.x - centroid.x) * n.x + (M.y - centroid.y) * n.y;
  const side = Math.abs(out) < 1 ? 1 : Math.sign(out); // bulge away from the layer centroid
  n = { x: n.x * side, y: n.y * side };
  const C = { x: M.x - n.x * (R - s), y: M.y - n.y * (R - s) }; // centre on the far side of the bulge
  const a0 = Math.atan2(A.y - C.y, A.x - C.x);
  let delta = Math.atan2(B.y - C.y, B.x - C.x) - a0;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  const at = (t) => ({ x: C.x + R * Math.cos(a0 + delta * t), y: C.y + R * Math.sin(a0 + delta * t) });
  const N = 4000;
  let t0 = 0, t1 = 1;
  for (let i = 0; i <= N; i++) { const p = at(i / N); if (!insideAny(a._shapes, p.x, p.y, CLIP)) { t0 = i / N; break; } }
  for (let i = N; i >= 0; i--) { const p = at(i / N); if (!insideAny(b._shapes, p.x, p.y, CLIP)) { t1 = i / N; break; } }
  const P1 = at(t0), P2 = at(t1), apex = at(0.5);
  const sweep = delta > 0 ? 1 : 0;
  const f = (v) => r1(v);
  return {
    between: [a.id, b.id], kind: draft ? 'draft' : incident ? 'incident' : 'default',
    class: draft ? 'b-edge b-edge-draft' : incident ? 'b-edge b-edge-strong' : 'b-edge',
    d: `M ${f(P1.x)} ${f(P1.y)} A ${f(R)} ${f(R)} 0 0 ${sweep} ${f(P2.x)} ${f(P2.y)}`,
    p1: { x: f(P1.x), y: f(P1.y) }, p2: { x: f(P2.x), y: f(P2.y) }, radius: f(R), sweep, bulge: side,
    midpoint: { x: f(apex.x), y: f(apex.y) }, _at: at, _t: [t0, t1],
  };
}

// ---------- scene builder ----------
function scene(name, spec) {
  const nodesIn = spec.nodes;
  const proj = project(nodesIn);
  const F = fit(proj, spec.fitRect, spec.padding);
  const tr = tier(F.zoom);
  const screen = (n) => ({ x: n.wx * F.zoom + F.camX, y: n.wy * F.zoom + F.camY });
  const nodes = proj.map((n) => {
    const p = screen(n);
    const o = tr === 'overview' ? overviewNode(n, p.x, p.y, { tooltip: spec.tooltip === n.id, gutter: { l: spec.fitRect.x + 16, r: spec.fitRect.x + spec.fitRect.w - 16 } }) : cardNode(n, p.x, p.y, spec.nodeOpts);
    o.world = { x: r1(n.wx), y: r1(n.wy) };
    return o;
  });
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const centroid = { x: nodes.reduce((s, n) => s + n.anchor.x, 0) / nodes.length, y: nodes.reduce((s, n) => s + n.anchor.y, 0) / nodes.length };
  const sel = nodes.find((n) => n.selected);
  const edges = (spec.edges || []).map(([a, b, kind]) => arcEdge(byId[a], byId[b], centroid, kind === 'draft' && !spec.allSolid,
    spec.incidentStrong !== false && sel && (a === sel.id || b === sel.id)));
  // ---- checks
  const problems = [];
  const overlays = spec.overlays || {};
  for (const n of nodes) {
    for (const [k, o] of Object.entries(overlays)) if (rectsOverlap(n.footprint, o, 6)) problems.push(`${n.id} footprint within 6px of overlay ${k}`);
    if (n.labelBox) for (const [k, o] of Object.entries(overlays)) if (rectsOverlap(n.labelBox, o, 6)) problems.push(`${n.id} label within 6px of overlay ${k}`);
    if (n.tooltip) for (const [k, o] of Object.entries(overlays)) if (rectsOverlap(n.tooltip.box, o, 8)) problems.push(`${n.id} tooltip overlaps overlay ${k}`);
    const fr = spec.fitRect;
    const fp = n.footprint;
    if (fp.x < fr.x || fp.y < fr.y || fp.x + fp.w > fr.x + fr.w || fp.y + fp.h > fr.y + fr.h) problems.push(`${n.id} footprint leaves the Fit rect`);
  }
  const clearances = [];
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    if (rectsOverlap(nodes[i].footprint, nodes[j].footprint, 12)) {
      const c = Math.round(clearance(nodes[i]._shapes, nodes[j]._shapes) * 10) / 10;
      clearances.push({ between: [nodes[i].id, nodes[j].id], px: c, note: 'shortest gap between the drawn shapes (pill, peek, ring, badges, caption)' });
      if (c < 2) problems.push(`${nodes[i].id} and ${nodes[j].id} shapes only ${c}px apart`);
    }
    if (nodes[i].labelBox && rectsOverlap(nodes[i].labelBox, nodes[j].footprint, 4)) problems.push(`${nodes[i].id} label touches ${nodes[j].id}`);
    if (nodes[j].labelBox && rectsOverlap(nodes[j].labelBox, nodes[i].footprint, 4)) problems.push(`${nodes[j].id} label touches ${nodes[i].id}`);
  }
  for (const e of edges) {
    for (const n of nodes) {
      if (e.between.includes(n.id)) continue;
      for (let i = 0; i <= 400; i++) {
        const p = e._at(e._t[0] + (e._t[1] - e._t[0]) * i / 400);
        if (insideAny(n._shapes, p.x, p.y, 2)) { problems.push(`edge ${e.between.join('–')} passes through ${n.id}`); break; }
      }
    }
    for (const [k, o] of Object.entries(overlays)) {
      for (let i = 0; i <= 400; i++) {
        const p = e._at(e._t[0] + (e._t[1] - e._t[0]) * i / 400);
        if (inside(rect(o), p.x, p.y, 4)) { problems.push(`edge ${e.between.join('–')} crosses overlay ${k}`); break; }
      }
    }
    // the arc must also leave its own endpoints' labels alone
    for (const id of e.between) {
      const lb = byId[id].labelBox;
      if (!lb) continue;
      for (let i = 0; i <= 400; i++) {
        const p = e._at(e._t[0] + (e._t[1] - e._t[0]) * i / 400);
        if (inside(rect(lb), p.x, p.y, 2)) { problems.push(`edge ${e.between.join('–')} crosses ${id} label`); break; }
      }
    }
  }
  const clean = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k.startsWith('_') ? undefined : v)));
  return {
    board: spec.board, theme: spec.theme, canvasRect: spec.canvasRect, fitRect: spec.fitRect, fitPadding: spec.padding,
    zoom: { value: Math.round(F.zoom * 1000) / 1000, uncapped: Math.round(F.raw * 1000) / 1000, label: `${Math.round(F.zoom * 100)}%`, capped: F.raw > ZOOM.fitCap },
    tier: tr, contentWorld: { w: r1(F.content.w), h: r1(F.content.h) },
    regions: spec.regions || {}, overlays, extras: spec.extras || {}, nodes: nodes.map(clean), edges: edges.map(clean), clearances, problems,
  };
}

// ---------- scenes ----------
const desktopFrame = { x: 260, y: 128, w: 804, h: 692 };
const scenes = {
  desktop: scene('desktop', {
    board: { w: 1440, h: 900 }, theme: 'both (B2 dark, B3 light)',
    canvasRect: { x: 248, y: 44, w: 1192, h: 856, note: 'graph stage, full-bleed under the floating prompt card, inspector and composer' },
    fitRect: { x: 248, y: 116, w: 828, h: 716, note: 'region the floating panels leave uncovered: sidebar edge → 12px before the inspector; prompt-card bottom → composer top' },
    padding: 48,
    nodes: NODES, edges: EDGES,
    overlays: { workingTag: { x: 280, y: 140, w: 202, h: 28, note: 'starts on the prompt-text edge (x 280)' }, hint: { x: 280, y: 776, w: 418, h: 28 }, zoomGroup: { x: 858, y: 772, w: 194, h: 36 } },
    extras: { workingFrame: { ...desktopFrame, r: 24, class: 'b-frame b-d-frame' } },
    regions: {
      trafficLights: { x: 20, y: 16, w: 52, h: 12, note: 'three 12px dots, centres x 26/46/66, y 22' },
      collapseToggle: { x: 84, y: 6, w: 32, h: 32 },
      sidebar: { x: 0, y: 0, w: 248, h: 900, note: '1px --border on its right edge (x 247)' },
      brand: { x: 12, y: 48, w: 224, h: 40 }, newThread: { x: 12, y: 96, w: 224, h: 40 },
      chatsLabel: { x: 12, y: 148, w: 224, h: 28 }, chatRows: { x: 12, y: 176, w: 224, h: 144, note: '4 rows x 36' },
      projectsLabel: { x: 12, y: 332, w: 224, h: 28 }, projectRows: { x: 12, y: 360, w: 224, h: 216, note: '6 rows x 36: project, 3 threads, project, thread' },
      sidebarFooter: { x: 12, y: 852, w: 224, h: 36, note: 'top rule 1px at y 840' },
      header: { x: 248, y: 0, w: 828, h: 44 }, promptCard: { x: 260, y: 52, w: 804, h: 64 },
      canvas: { x: 248, y: 44, w: 1192, h: 856 }, inspector: { x: 1088, y: 12, w: 340, h: 808, note: 'fixed height (brief §6.2): top inset 12 → 12 above the composer; Node Details scroll y 98–550 (under the 40px Environment row + 44px head), annotation dock (33.333%) y 550–819' }, composer: { x: 282, y: 832, w: 760, h: 56 },
    },
  }),
  'share-web': scene('share-web', {
    board: { w: 1440, h: 900 }, theme: 'light (B4)',
    canvasRect: { x: 0, y: 0, w: 1440, h: 900, note: 'full-bleed paper behind the floating header, prompt card and right column' },
    fitRect: { x: 16, y: 184, w: 1056, h: 700, note: 'left of the right column (x 1084), below the prompt card (y 172 + 12), above the bottom gutter' },
    padding: 48,
    nodes: NODES.map((n) => ({ ...n, draft: false, life: null, caption: null, actions: null })), edges: EDGES, allSolid: true,
    overlays: { acceptedStamp: { x: 15, y: 192, w: 125, h: 41, note: 'rotated bbox of the 126x32 stamp at (16,196)' }, familyKey: { x: 16, y: 852, w: 404, h: 32 }, zoomGroup: { x: 878, y: 848, w: 194, h: 36, note: 'bottom-right of the uncovered canvas (right edge 1072), level with the family key; the right column below the download card is Node Details (max 736)' } },
    regions: { header: { x: 16, y: 16, w: 1056, h: 80 }, promptCard: { x: 16, y: 108, w: 1056, h: 64 }, downloadCard: { x: 1084, y: 16, w: 340, h: 120 }, nodeDetails: { x: 1084, y: 148, w: 340, h: 486, note: 'hugs its content; max-height 736' } },
  }),
  phone: scene('phone', {
    board: { w: 390, h: 844 }, theme: 'dark (B5)',
    canvasRect: { x: 0, y: 251, w: 390, h: 593, note: 'full-bleed; continues under the bottom sheet (sheet top 628)' },
    fitRect: { x: 0, y: 251, w: 390, h: 377, note: 'graph band from the budget (§4.4): 251 → 628' },
    padding: 16,
    nodes: NODES.map((n) => ({ ...n, draft: false, life: null, caption: null, actions: null })), edges: EDGES, allSolid: true, tooltip: 'N4',
    overlays: { keyButton: { x: 16, y: 269, w: 76, h: 32, note: 'visual 32px pill inside a 44px hit area y 263..307' }, acceptedStamp: { x: 247, y: 265, w: 128, h: 41, note: 'rotated bbox of the 126x32 stamp at right 16, top 269' }, zoomGroup: { x: 150, y: 570, w: 224, h: 46, note: '44x44 items inside the 1px border' } },
    regions: { safeAreaTop: { x: 0, y: 0, w: 390, h: 47 }, header: { x: 16, y: 47, w: 358, h: 48 }, downloadCard: { x: 16, y: 103, w: 358, h: 56 }, promptCard: { x: 16, y: 167, w: 358, h: 76 }, graph: { x: 0, y: 251, w: 390, h: 377 }, sheetPeek: { x: 0, y: 628, w: 390, h: 216, note: 'includes the 34px home-indicator zone y 810..844 (left empty)' } },
  }),
  'share-landing': scene('share-landing', {
    board: { w: 720, h: 450 }, theme: 'light (frame on B6)',
    canvasRect: { x: 0, y: 0, w: 720, h: 450, note: 'full-bleed paper inside the 720×450 frame' },
    fitRect: { x: 16, y: 180, w: 412, h: 254, note: 'left of the About card (x 440), below the prompt card (y 168 + 12)' },
    padding: 48,
    nodes: [{ ...NODES[0], x: 0.5, y: 0.5, more: 0, actions: null, selected: false }], edges: [],
    overlays: { acceptedStamp: { x: 27, y: 187, w: 128, h: 42, note: 'rotated bbox of the 126x32 stamp at (28,192)' }, familyKey: { x: 28, y: 390, w: 110, h: 32 }, zoomGroup: { x: 222, y: 386, w: 194, h: 36 } },
    regions: { header: { x: 16, y: 16, w: 688, h: 76 }, promptCard: { x: 16, y: 104, w: 688, h: 64 }, aboutCard: { x: 440, y: 180, w: 264, h: 254 } },
  }),
};

const out = {
  _about: 'Prototype B geometry. All boxes are {x,y,w,h} in BOARD px of the named board. Node `style` is the inline style for the .b-node root (card tier) or .b-token (overview). Edge `d` goes in <path class="…" d="…"> inside one <svg class="b-edges"> absolutely positioned at board (0,0) with the board size. Generated by geometry.mjs.',
  constants: { PILL_H, DISC, DISC_INSET, TITLE_X, PAD_R, MORE_GAP, MORE_ICON, MORE_PAD_R, PILL_MAX, PEEK, BADGE_R, BADGE_HALO, CAPTION_GAP, CAPTION_H, CLIP, RING_GAP, RING_W, OVERVIEW_DISC, layoutBounds: 'pill box: {halfWidth: pillWidth/2, top: 18, bottom: 18}', WORLD, ZOOM, ARC_K },
  scenes,
};
writeFileSync(join(here, 'geometry.json'), JSON.stringify(out, null, 1));
for (const [k, s] of Object.entries(scenes)) {
  console.log(`\n== ${k}: zoom ${s.zoom.label} (raw ${s.zoom.uncapped}, capped ${s.zoom.capped}) tier ${s.tier}; content world ${s.contentWorld.w}×${s.contentWorld.h}`);
  for (const n of s.nodes) console.log(`  ${n.id} anchor ${n.anchor.x},${n.anchor.y}  ${n.style}${n.titleTruncated ? '  (title truncated)' : ''}  fp ${JSON.stringify(n.footprint)}${n.labelBox ? '  label ' + JSON.stringify(n.labelBox) : ''}`);
  for (const e of s.edges) console.log(`  ${e.between.join('–')} ${e.kind} bulge ${e.bulge} ${e.d}`);
  for (const c of s.clearances) console.log(`  clearance ${c.between.join('/')} ${c.px}px`);
  console.log('  problems:', s.problems.length ? s.problems : 'none');
}
