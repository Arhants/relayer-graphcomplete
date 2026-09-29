// Minimal colour math: sRGB <-> OKLab/OKLCH (Ottosson 2020), gamut mapping by
// chroma reduction, WCAG 2.x contrast, APCA 0.0.98G-4g Lc, OKLab deltaE and
// Machado 2009 CVD simulation. No dependencies.

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const s2lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lin2s = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
}
export function rgbToHex(rgb) {
  return "#" + rgb.map((c) => Math.round(clamp01(c) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}
export function linToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
export function oklabToLin([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
export const hexToLin = (hex) => hexToRgb(hex).map(s2lin);
export const hexToOklab = (hex) => linToOklab(hexToLin(hex));
export function hexToOklch(hex) {
  const [L, a, b] = hexToOklab(hex);
  const C = Math.hypot(a, b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L, C, h: C < 1e-4 ? 0 : h };
}
export function oklchToLin(L, C, h) {
  const r = (h * Math.PI) / 180;
  return oklabToLin([L, C * Math.cos(r), C * Math.sin(r)]);
}
const EPS = 1e-7;
export const inGamut = (L, C, h) => oklchToLin(L, C, h).every((c) => c >= -EPS && c <= 1 + EPS);
export function maxChroma(L, h) {
  if (L <= 0 || L >= 1) return 0;
  let lo = 0, hi = 0.37;
  for (let i = 0; i < 32; i++) {
    const m = (lo + hi) / 2;
    if (inGamut(L, m, h)) lo = m; else hi = m;
  }
  return lo;
}
// Gamut-map by holding L and h and reducing C (CSS Color 4 style, simplified).
export function oklchToHex(L, C, h) {
  L = clamp01(L);
  const c = Math.min(Math.max(C, 0), maxChroma(L, h));
  return rgbToHex(oklchToLin(L, c, h).map((x) => lin2s(clamp01(x))));
}
export function fmtLch(hex) {
  const { L, C, h } = hexToOklch(hex);
  return `${L.toFixed(3)} ${C.toFixed(3)} ${h.toFixed(1)}`;
}
export function cssOklch(hex) {
  const { L, C, h } = hexToOklch(hex);
  return `oklch(${(L * 100).toFixed(1)}% ${C.toFixed(3)} ${h.toFixed(1)})`;
}

// WCAG 2.2 relative luminance + contrast ratio (https://www.w3.org/TR/WCAG22/#dfn-relative-luminance)
export function relLum(hex) {
  const [r, g, b] = hexToLin(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const la = relLum(a), lb = relLum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// APCA-W3 0.0.98G-4g (advisory only; WCAG 2.x is the pass/fail gate here)
function apcaY(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126729 * r ** 2.4 + 0.7151522 * g ** 2.4 + 0.072175 * b ** 2.4;
}
export function apca(txt, bg) {
  let yt = apcaY(txt), yb = apcaY(bg);
  const thr = 0.022, clmp = 1.414;
  yt = yt > thr ? yt : yt + (thr - yt) ** clmp;
  yb = yb > thr ? yb : yb + (thr - yb) ** clmp;
  if (Math.abs(yb - yt) < 0.0005) return 0;
  let out;
  if (yb > yt) {
    const s = (yb ** 0.56 - yt ** 0.57) * 1.14;
    out = s < 0.1 ? 0 : s - 0.027;
  } else {
    const s = (yb ** 0.65 - yt ** 0.62) * 1.14;
    out = s > -0.1 ? 0 : s + 0.027;
  }
  return out * 100;
}

// Machado, Oliveira & Fernandes 2009, severity 1.0, applied in linear RGB
const MACHADO = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
export function labOf(hex, kind) {
  const l = hexToLin(hex);
  if (!kind) return linToOklab(l);
  const M = MACHADO[kind];
  return linToOklab(M.map((row) => clamp01(row[0] * l[0] + row[1] * l[1] + row[2] * l[2])));
}
// deltaE_OK x100 (Euclidean OKLab distance, scaled so 1 unit ~ 0.01)
export const dEab = (a, b) => 100 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const dE = (h1, h2, kind) => dEab(labOf(h1, kind), labOf(h2, kind));
