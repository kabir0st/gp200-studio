#!/usr/bin/env node
/**
 * Pedal / amp / cab artwork generator.
 *
 * Reads the effect list from src/core/effectNames.ts (single source of truth),
 * merges it with the ART_SPECS table below (authentic looks derived from the
 * "Based On" hardware in valeton-docs/GP200 - Effects v1.8.0.pdf), and emits:
 *
 *   public/pedals/{slug}.svg        one per unique effect name+module
 *   public/pedals/manifest.json     name/module → file, basedOn, type, blurb,
 *                                   body colors, and the artwork's content box
 *
 * Slug convention comes from docs/board-design-system.md (name lowercased,
 * non-alphanumerics → '-'). When two different effects share a slug (e.g.
 * DST "Tube" vs DLY "Tube"), both get a `--{module}` suffix.
 *
 * All artwork is original vector art *evoking* the real hardware (colors,
 * proportions, control layout), with no brand logos or trademarks drawn.
 *
 * Usage: node scripts/generate-pedal-art.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'pedals');

/* ────────────────────────────────────────────────────────────────────────
 * 1. Effect list from src/core/effectNames.ts
 * ──────────────────────────────────────────────────────────────────────── */
function readEffects() {
  const src = readFileSync(join(ROOT, 'src/core/effectNames.ts'), 'utf8');
  const re = /(\d+): \{ name: '([^']+)', module: '(\w+)' \}/g;
  const seen = new Map(); // `${module}:${name}` → true
  const effects = [];
  let m;
  while ((m = re.exec(src))) {
    const key = `${m[3]}:${m[2]}`;
    if (seen.has(key)) continue;
    seen.set(key, true);
    effects.push({ name: m[2], module: m[3] });
  }
  return effects;
}

// board-design-system slug, extended: '+' → '-plus' so "UK 45" / "UK 45+" stay distinct
const slugify = (s) => s.toLowerCase().replace(/\+/g, ' plus').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ────────────────────────────────────────────────────────────────────────
 * 2. SVG helpers: canvas is 160 × 64 (art-zone aspect from the mockup)
 * ──────────────────────────────────────────────────────────────────────── */
const W = 160, H = 64;
const FONT = 'JetBrains Mono, ui-monospace, Menlo, monospace';

let uid = 0;
const gid = (p) => `${p}${++uid}`;

function svgDoc(inner, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img">
${defs ? `<defs>${defs}</defs>\n` : ''}${inner}
</svg>\n`;
}

const shadow = (cx, cy, rx, ry = 4) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="rgba(0,0,0,.30)"/>`;

function vGrad(id, top, bottom) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>`;
}
function rGrad(id, inner, outer) {
  return `<radialGradient id="${id}" cx=".38" cy=".32" r=".85">
<stop offset="0" stop-color="${inner}"/><stop offset="1" stop-color="${outer}"/></radialGradient>`;
}

/** darken/lighten hex by amount (-1..1) */
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + (amt > 0 ? (255 - v) * amt : v * amt))));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** small control knob */
function knob(x, y, r, cap = '#e8e2d2', pointer = '#1c1207', ring = null) {
  const id = gid('k');
  let s = `<radialGradient id="${id}" cx=".35" cy=".3" r=".9">
<stop offset="0" stop-color="${shade(cap, 0.25)}"/><stop offset="1" stop-color="${shade(cap, -0.45)}"/></radialGradient>`;
  let out = `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#${id})" stroke="rgba(0,0,0,.5)" stroke-width=".6"/>`;
  out += `<line x1="${x}" y1="${y}" x2="${x}" y2="${y - r + 1}" stroke="${pointer}" stroke-width="1.1" stroke-linecap="round" transform="rotate(24 ${x} ${y})"/>`;
  if (ring) out += `<circle cx="${x}" cy="${y}" r="${r + 1.2}" fill="none" stroke="${ring}" stroke-width=".7" opacity=".8"/>`;
  return { defs: s, body: out };
}

/** chicken-head knob (amps) */
function chicken(x, y, r, color = '#111') {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" stroke="rgba(255,255,255,.25)" stroke-width=".5"/>
<path d="M ${x} ${y} L ${x - r * 0.42} ${y - r * 1.28} L ${x + r * 0.42} ${y - r * 1.28} Z" fill="${color}" transform="rotate(30 ${x} ${y})"/>`;
}

function label(x, y, text, size, fill, { weight = 700, ls = 0.5, anchor = 'middle', family = FONT, italic = false, opacity = 1 } = {}) {
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" letter-spacing="${ls}" text-anchor="${anchor}" fill="${fill}"${italic ? ' font-style="italic"' : ''}${opacity !== 1 ? ` opacity="${opacity}"` : ''}>${esc(text)}</text>`;
}

/* ════════════════════════════════════════════════════════════════════════
 * 3. TEMPLATES
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * STOMP: mini pedal, front view, centered on canvas.
 * spec: { body, body2?, ink, label, sub?, knobs, knobCap?, shape?, led?,
 *         plate?  (darker bottom footswitch zone, boss-style),
 *         motif?  (extra art fn key), wide? }
 */
function tplStomp(s) {
  const wide = s.shape === 'big';
  const pw = wide ? 58 : 42, ph = 56;
  const x = (W - pw) / 2, y = (H - ph) / 2 + 1;
  const id = gid('b');
  let defs = vGrad(id, shade(s.body, 0.14), s.body2 || shade(s.body, -0.22));
  let out = shadow(W / 2, y + ph - 1, pw * 0.62);

  // enclosure
  if (s.shape === 'round') {
    const r = 27;
    out += `<circle cx="${W / 2}" cy="${H / 2 + 1}" r="${r}" fill="url(#${id})" stroke="rgba(0,0,0,.55)" stroke-width="1"/>`;
    out += `<circle cx="${W / 2}" cy="${H / 2 + 1}" r="${r - 1.5}" fill="none" stroke="rgba(255,255,255,.22)" stroke-width=".8"/>`;
    // two knobs + center switch (fuzz-face face)
    const k1 = knob(W / 2 - 12, H / 2 - 10, 5.5, s.knobCap || '#d8d2c4');
    const k2 = knob(W / 2 + 12, H / 2 - 10, 5.5, s.knobCap || '#d8d2c4');
    defs += k1.defs + k2.defs;
    out += k1.body + k2.body;
    out += `<circle cx="${W / 2}" cy="${H / 2 + 13}" r="5" fill="#c9c9c9" stroke="#333" stroke-width=".8"/><circle cx="${W / 2}" cy="${H / 2 + 13}" r="3" fill="#8f8f8f"/>`;
    out += label(W / 2, H / 2 + 3.5, s.label, 6.4, s.ink, { ls: 0.4 });
    if (s.sub) out += label(W / 2, H / 2 + 30, s.sub, 3.4, s.ink, { weight: 500, opacity: 0.75 });
    return svgDoc(out, defs);
  }

  const rx = s.shape === 'mxr' ? 2.5 : 5;
  out += `<rect x="${x}" y="${y}" width="${pw}" height="${ph}" rx="${rx}" fill="url(#${id})" stroke="rgba(0,0,0,.5)" stroke-width=".8"/>`;
  out += `<rect x="${x + 1}" y="${y + 1}" width="${pw - 2}" height="${ph - 2}" rx="${rx - 0.5}" fill="none" stroke="rgba(255,255,255,.18)" stroke-width=".8"/>`;

  // knobs row
  const n = s.knobs ?? 3;
  const kr = n >= 3 ? 4.6 : 5.6;
  const cy = y + 9;
  if (n > 0) {
    const gap = Math.min(14, (pw - 10) / Math.max(1, n - 1));
    const total = gap * (n - 1);
    for (let i = 0; i < n; i++) {
      const k = knob(W / 2 - total / 2 + i * gap, cy, kr, s.knobCap || '#16130f', s.knobPointer || '#f2ede2');
      defs += k.defs; out += k.body;
    }
  }

  // motif zone (between knobs and label)
  if (s.motif) out += MOTIFS[s.motif](W / 2, y + 24, s);

  // LED
  const led = s.led || '#ff4040';
  out += `<circle cx="${x + pw / 2}" cy="${y + 17.5}" r="1.8" fill="${led}"/><circle cx="${x + pw / 2}" cy="${y + 17.5}" r="3.1" fill="${led}" opacity=".25"/>`;

  // label (always in the middle band; the footswitch owns the bottom)
  const ly = y + 31;
  const size = s.label.length > 9 ? 4.6 : s.label.length > 6 ? 5.4 : 6.6;
  out += label(W / 2, ly, s.label, size, s.ink, { ls: 0.4 });
  if (s.sub) out += label(W / 2, ly + 5, s.sub, 3.2, s.ink, { weight: 500, opacity: 0.72 });

  // footswitch: boss plate or round stomp
  if (s.plate !== false) {
    const py = y + ph - 19;
    out += `<rect x="${x + 3}" y="${py}" width="${pw - 6}" height="15" rx="2.5" fill="rgba(0,0,0,.32)" stroke="rgba(0,0,0,.4)" stroke-width=".6"/>`;
    out += `<line x1="${x + 6}" y1="${py + 2.5}" x2="${x + pw - 6}" y2="${py + 2.5}" stroke="rgba(255,255,255,.28)" stroke-width="1.4" stroke-linecap="round"/>`;
  } else {
    out += `<circle cx="${W / 2}" cy="${y + ph - 9}" r="4.6" fill="#c9c9c9" stroke="#333" stroke-width=".8"/><circle cx="${W / 2}" cy="${y + ph - 9}" r="2.8" fill="#8f8f8f"/>`;
  }

  // side jacks
  out += `<rect x="${x - 3.4}" y="${H / 2 - 3}" width="3.4" height="6" rx="1" fill="#9a9a9a" stroke="#333" stroke-width=".5"/>`;
  out += `<rect x="${x + pw}" y="${H / 2 - 3}" width="3.4" height="6" rx="1" fill="#9a9a9a" stroke="#333" stroke-width=".5"/>`;
  return svgDoc(out, defs);
}

/**
 * ROCKER: expression/wah/volume pedal, 3-quarter side view.
 * spec: { body, ink, label, tread? }
 */
function tplRocker(s) {
  const id = gid('r'), id2 = gid('r');
  const defs = vGrad(id, shade(s.body, 0.18), shade(s.body, -0.3)) + vGrad(id2, shade(s.body, 0.05), shade(s.body, -0.5));
  let out = shadow(W / 2, 55, 44, 4);
  // base wedge
  out += `<path d="M 36 52 L 124 52 L 118 40 L 42 40 Z" fill="url(#${id2})" stroke="rgba(0,0,0,.5)" stroke-width=".8"/>`;
  // treadle (tilted plate)
  out += `<path d="M 44 40 L 116 40 L 106 18 L 50 26 Z" fill="url(#${id})" stroke="rgba(0,0,0,.55)" stroke-width=".9"/>`;
  // tread ribs
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const x0 = 52 + (106 - 52) * t, y0 = 27.5 + (20.5 - 27.5) * t;
    const x1 = 48 + (112 - 48) * t, y1 = 38 + (37 - 38) * t;
    out += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${s.tread || 'rgba(0,0,0,.35)'}" stroke-width="1.1"/>`;
  }
  // heel hinge
  out += `<circle cx="47" cy="41" r="2.2" fill="#9a9a9a" stroke="#333" stroke-width=".5"/>`;
  out += label(80, 60, s.label, 4.4, s.ink, { ls: 0.8 });
  return svgDoc(out, defs);
}

/**
 * GRAPHIC EQ: pedal with vertical slider bank.
 * spec: { body, ink, label, bands, sliderColor?, vals? }
 */
function tplEq(s) {
  const pw = s.bands > 6 ? 76 : 52, ph = 56;
  const x = (W - pw) / 2, y = (H - ph) / 2 + 1;
  const id = gid('e');
  const defs = vGrad(id, shade(s.body, 0.12), shade(s.body, -0.2));
  let out = shadow(W / 2, y + ph - 1, pw * 0.62);
  out += `<rect x="${x}" y="${y}" width="${pw}" height="${ph}" rx="3" fill="url(#${id})" stroke="rgba(0,0,0,.5)" stroke-width=".8"/>`;
  const n = s.bands;
  const gap = (pw - 14) / (n - 1);
  const vals = s.vals || Array.from({ length: n }, (_, i) => 0.5 + 0.32 * Math.sin((i / (n - 1)) * Math.PI * 1.4 + 0.4));
  for (let i = 0; i < n; i++) {
    const sx = x + 7 + i * gap;
    out += `<line x1="${sx}" y1="${y + 8}" x2="${sx}" y2="${y + 34}" stroke="${shade(s.body, -0.45)}" stroke-width="1.6"/>`;
    const vy = y + 34 - vals[i] * 26;
    out += `<rect x="${sx - 2.4}" y="${vy - 1.6}" width="4.8" height="3.2" rx=".8" fill="${s.sliderColor || '#f5f5f0'}" stroke="rgba(0,0,0,.45)" stroke-width=".5"/>`;
  }
  out += label(W / 2, y + 43, s.label, s.label.length > 9 ? 4.4 : 5.4, s.ink, { ls: 0.4 });
  out += `<rect x="${x + 3}" y="${y + ph - 10}" width="${pw - 6}" height="7" rx="2" fill="rgba(0,0,0,.3)"/>`;
  return svgDoc(out, defs);
}

/* grille cloth / tolex pattern fills */
function patternDefs(kind, id, base) {
  switch (kind) {
    case 'tweed':
      return `<pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
<rect width="6" height="6" fill="#c9a86a"/><rect width="6" height="3" fill="#b8945a"/><rect y="3" width="3" height="3" fill="#d8b878"/></pattern>`;
    case 'oxblood':
      return `<pattern id="${id}" width="4" height="4" patternUnits="userSpaceOnUse">
<rect width="4" height="4" fill="#4a2028"/><circle cx="1" cy="1" r=".6" fill="#6a3038"/><circle cx="3" cy="3" r=".6" fill="#2e1418"/></pattern>`;
    case 'silverface':
      return `<pattern id="${id}" width="5" height="5" patternUnits="userSpaceOnUse">
<rect width="5" height="5" fill="#a8a49a"/><circle cx="1.2" cy="1.2" r=".7" fill="#c8c4ba"/><circle cx="3.6" cy="3.6" r=".7" fill="#8a867c"/></pattern>`;
    case 'wheat':
      return `<pattern id="${id}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
<rect width="5" height="5" fill="#cfc0a0"/><rect width="5" height="2.4" fill="#bfae8c"/></pattern>`;
    case 'diamond':
      return `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
<rect width="8" height="8" fill="#5a4632"/><path d="M0 0H8V8H0Z" fill="none" stroke="#7a6248" stroke-width="1"/><circle cx="4" cy="4" r=".8" fill="#8a7250"/></pattern>`;
    case 'cane':
      return `<pattern id="${id}" width="7" height="7" patternUnits="userSpaceOnUse">
<rect width="7" height="7" fill="#c8a878"/><path d="M0 3.5 H7 M3.5 0 V7" stroke="#a8885c" stroke-width="1.6"/><path d="M0 0 L7 7" stroke="#8a6c44" stroke-width=".8"/></pattern>`;
    case 'basket':
      return `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse">
<rect width="8" height="8" fill="#8a7454"/><rect width="4" height="4" fill="#6a5840"/><rect x="4" y="4" width="4" height="4" fill="#6a5840"/></pattern>`;
    case 'blackweave':
      return `<pattern id="${id}" width="4" height="4" patternUnits="userSpaceOnUse">
<rect width="4" height="4" fill="#1c1c1e"/><path d="M0 2 H4" stroke="#2e2e32" stroke-width="1"/><path d="M2 0 V4" stroke="#0e0e10" stroke-width="1"/></pattern>`;
    case 'metalgrid':
      return `<pattern id="${id}" width="5" height="5" patternUnits="userSpaceOnUse">
<rect width="5" height="5" fill="#26282a"/><circle cx="2.5" cy="2.5" r="1.5" fill="#0c0d0e"/></pattern>`;
    case 'bluecheck':
      return `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
<rect width="8" height="8" fill="#28407c"/><rect width="8" height="4" fill="#1e3468"/><rect width="4" height="8" fill="rgba(255,255,255,.08)"/></pattern>`;
    case 'orangeweave':
      return `<pattern id="${id}" width="5" height="5" patternUnits="userSpaceOnUse">
<rect width="5" height="5" fill="#d86a1a"/><path d="M0 2.5 H5 M2.5 0 V5" stroke="#c05a10" stroke-width="1"/></pattern>`;
    case 'diamondplate':
      return `<pattern id="${id}" width="10" height="10" patternUnits="userSpaceOnUse">
<rect width="10" height="10" fill="#b0b4b8"/><ellipse cx="2.5" cy="2.5" rx="2" ry=".9" fill="#d0d4d8" transform="rotate(45 2.5 2.5)"/><ellipse cx="7.5" cy="7.5" rx="2" ry=".9" fill="#d0d4d8" transform="rotate(-45 7.5 7.5)"/></pattern>`;
    default:
      return `<pattern id="${id}" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="${base}"/></pattern>`;
  }
}

/**
 * AMP: amp head/combo front.
 * spec: { tolex (hex or pattern name), panel, panelText, grille (pattern), label,
 *         knobs?, piping?, logoStyle?, face? ('grille'|'panelfull'), combo? }
 */
function tplAmp(s) {
  const aw = 148, ah = 52;
  const x = (W - aw) / 2, y = (H - ah) / 2 + 1;
  let defs = '';
  let out = shadow(W / 2, y + ah, aw * 0.55);

  // body / tolex
  let bodyFill;
  if (s.tolex.startsWith('#')) {
    const id = gid('t');
    defs += vGrad(id, shade(s.tolex, 0.1), shade(s.tolex, -0.18));
    bodyFill = `url(#${id})`;
  } else {
    const id = gid('t');
    defs += patternDefs(s.tolex, id, '#222');
    bodyFill = `url(#${id})`;
  }
  out += `<rect x="${x}" y="${y}" width="${aw}" height="${ah}" rx="4" fill="${bodyFill}" stroke="rgba(0,0,0,.55)" stroke-width="1"/>`;
  // handle
  out += `<rect x="${W / 2 - 16}" y="${y - 2.4}" width="32" height="3.6" rx="1.8" fill="#191919" stroke="rgba(0,0,0,.6)" stroke-width=".5"/>`;

  const panelH = s.face === 'panelfull' ? ah - 8 : 19;
  // control panel strip (hex color or a pattern name, e.g. Mesa diamond plate)
  const pid = gid('p');
  if (s.panel.startsWith('#')) defs += vGrad(pid, shade(s.panel, 0.12), shade(s.panel, -0.15));
  else defs += patternDefs(s.panel, pid, '#444');
  out += `<rect x="${x + 4}" y="${y + 4}" width="${aw - 8}" height="${panelH}" rx="2" fill="url(#${pid})" stroke="rgba(0,0,0,.4)" stroke-width=".6"/>`;

  // grille below panel
  if (s.face !== 'panelfull') {
    const gy = y + panelH + 7, gh = ah - panelH - 11;
    const gidd = gid('g');
    defs += patternDefs(s.grille, gidd, '#333');
    out += `<rect x="${x + 5}" y="${gy}" width="${aw - 10}" height="${gh}" rx="2" fill="url(#${gidd})" stroke="rgba(0,0,0,.45)" stroke-width=".6"/>`;
    if (s.piping) out += `<rect x="${x + 5}" y="${gy}" width="${aw - 10}" height="${gh}" rx="2" fill="none" stroke="${s.piping}" stroke-width="1"/>`;
  }

  // knobs on panel, starting after the logo text so long labels never collide
  const nk = s.knobs ?? 7;
  const lsize = s.label.length > 7 ? 5 : 6.2;
  const kx0 = Math.max(x + 40, x + 13 + s.label.length * lsize * 0.68), kx1 = x + aw - 12;
  for (let i = 0; i < nk; i++) {
    const kx = kx0 + ((kx1 - kx0) / (nk - 1)) * i;
    out += chicken(kx, y + 4 + panelH / 2, 3.1, s.knobColor || (s.panel === '#c9b998' || s.panel === '#e8e0cc' ? '#7a3020' : '#d8d2c0'));
  }
  // logo text on panel left
  out += label(x + 9, y + 4 + panelH / 2 + 2.2, s.label, lsize, s.panelText, { anchor: 'start', ls: 0.3, italic: s.logoStyle === 'script' });
  // pilot lamp
  out += `<circle cx="${x + aw - 7}" cy="${y + 8}" r="1.6" fill="${s.lamp || '#ff5a4d'}"/><circle cx="${x + aw - 7}" cy="${y + 8}" r="2.8" fill="${s.lamp || '#ff5a4d'}" opacity=".3"/>`;
  // corner protectors
  for (const [cx2, cy2] of [[x + 2, y + 2], [x + aw - 2, y + 2], [x + 2, y + ah - 2], [x + aw - 2, y + ah - 2]]) {
    out += `<circle cx="${cx2}" cy="${cy2}" r="1.3" fill="#888" stroke="#222" stroke-width=".4"/>`;
  }
  return svgDoc(out, defs);
}

/**
 * CAB: speaker cabinet front.
 * spec: { tolex, grille, cols, rows, size (speaker label e.g. 4x12), ink?, piping?, exposed? }
 */
function tplCab(s) {
  const big = s.rows >= 2 || s.cols >= 2;
  const cw = big ? 108 : 84, ch = 58;
  const x = (W - cw) / 2, y = (H - ch) / 2 + 1;
  let defs = '';
  let out = shadow(W / 2, y + ch, cw * 0.56);

  let bodyFill;
  const tid = gid('ct');
  if (s.tolex.startsWith('#')) { defs += vGrad(tid, shade(s.tolex, 0.08), shade(s.tolex, -0.18)); }
  else defs += patternDefs(s.tolex, tid, '#222');
  bodyFill = `url(#${tid})`;
  out += `<rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="3.5" fill="${bodyFill}" stroke="rgba(0,0,0,.55)" stroke-width="1"/>`;

  // grille area
  const gx = x + 5, gy = y + 5, gw = cw - 10, gh = ch - 10;
  const gidd = gid('cg');
  defs += patternDefs(s.grille, gidd, '#2a2a2a');
  out += `<rect x="${gx}" y="${gy}" width="${gw}" height="${gh}" rx="2" fill="url(#${gidd})" stroke="rgba(0,0,0,.4)" stroke-width=".6"/>`;
  if (s.piping) out += `<rect x="${gx}" y="${gy}" width="${gw}" height="${gh}" rx="2" fill="none" stroke="${s.piping}" stroke-width="1"/>`;

  // speakers (visible through grille as darker rings)
  const cols = s.cols, rows = s.rows;
  const cellW = gw / cols, cellH = gh / rows;
  const r = Math.min(cellW, cellH) * 0.42;
  for (let ry = 0; ry < rows; ry++) {
    for (let cx2 = 0; cx2 < cols; cx2++) {
      const sx = gx + cellW * (cx2 + 0.5), sy = gy + cellH * (ry + 0.5);
      const alpha = s.exposed ? 1 : 0.55;
      out += `<circle cx="${sx}" cy="${sy}" r="${r}" fill="rgba(10,10,10,${alpha * 0.8})" stroke="rgba(0,0,0,.6)" stroke-width=".8"/>`;
      out += `<circle cx="${sx}" cy="${sy}" r="${r * 0.72}" fill="none" stroke="rgba(255,255,255,${0.14 * alpha + 0.06})" stroke-width="1"/>`;
      // dust cap, tintable (Markbass yellow, Hartke aluminum)
      const cap = s.cone || 'rgba(40,40,42,1)';
      out += `<circle cx="${sx}" cy="${sy}" r="${r * 0.3}" fill="${cap.startsWith('#') ? cap : cap}" opacity="${s.cone ? 0.9 : alpha}" stroke="rgba(255,255,255,.12)" stroke-width=".6"/>`;
    }
  }
  // size tag + corner protectors (tag ink follows tolex luminance)
  const lightTolex = ['tweed', 'wheat', 'orangeweave'].includes(s.tolex) ||
    (s.tolex.startsWith('#') && (0.299 * ((parseInt(s.tolex.slice(1), 16) >> 16) & 255) + 0.587 * ((parseInt(s.tolex.slice(1), 16) >> 8) & 255) + 0.114 * (parseInt(s.tolex.slice(1), 16) & 255)) > 135);
  out += label(x + cw - 4, y + ch - 3.5, s.size, 4.2, lightTolex ? '#1c1712' : '#ffffff', { anchor: 'end', opacity: 0.6 });
  for (const [px, py] of [[x + 2, y + 2], [x + cw - 2, y + 2], [x + 2, y + ch - 2], [x + cw - 2, y + ch - 2]]) {
    out += `<path d="M ${px - 2} ${py} L ${px} ${py - 2} L ${px + 2} ${py} L ${px} ${py + 2} Z" fill="#8a8a8a" stroke="#222" stroke-width=".4"/>`;
  }
  return svgDoc(out, defs);
}

/**
 * ACOUSTIC: instrument silhouette (for CAB-module acoustic IRs).
 * spec: { shape: dread|om|jumbo|classical|mandolin|fretless|doublebass, wood, label }
 */
function tplAcoustic(s) {
  const wood = s.wood || '#d9a95e';
  const id = gid('w');
  const defs = rGrad(id, shade(wood, 0.18), shade(wood, -0.25));
  let out = shadow(W / 2, 57, 30, 3.5);
  const cx = W / 2, cy = 33;
  let bodyPath;
  switch (s.shape) {
    case 'jumbo':
      bodyPath = `M ${cx} 8 C ${cx + 14} 8 ${cx + 17} 16 ${cx + 15} 22 C ${cx + 13.5} 26 ${cx + 15} 28 ${cx + 18} 32 C ${cx + 21} 37 ${cx + 19} 50 ${cx} 52 C ${cx - 19} 50 ${cx - 21} 37 ${cx - 18} 32 C ${cx - 15} 28 ${cx - 13.5} 26 ${cx - 15} 22 C ${cx - 17} 16 ${cx - 14} 8 ${cx} 8 Z`;
      break;
    case 'om':
      bodyPath = `M ${cx} 10 C ${cx + 11} 10 ${cx + 14} 17 ${cx + 12} 23 C ${cx + 10.5} 27 ${cx + 12} 29 ${cx + 14.5} 33 C ${cx + 17} 38 ${cx + 15} 50 ${cx} 52 C ${cx - 15} 50 ${cx - 17} 38 ${cx - 14.5} 33 C ${cx - 12} 29 ${cx - 10.5} 27 ${cx - 12} 23 C ${cx - 14} 17 ${cx - 11} 10 ${cx} 10 Z`;
      break;
    case 'mandolin':
      bodyPath = `M ${cx} 14 C ${cx + 10} 14 ${cx + 15} 24 ${cx + 13} 34 C ${cx + 11} 46 ${cx + 6} 50 ${cx} 50 C ${cx - 6} 50 ${cx - 11} 46 ${cx - 13} 34 C ${cx - 15} 24 ${cx - 10} 14 ${cx} 14 Z`;
      break;
    case 'doublebass':
      bodyPath = `M ${cx} 8 C ${cx + 11} 8 ${cx + 13} 14 ${cx + 11} 19 C ${cx + 9} 24 ${cx + 10} 26 ${cx + 14} 30 C ${cx + 18} 35 ${cx + 16} 49 ${cx} 52 C ${cx - 16} 49 ${cx - 18} 35 ${cx - 14} 30 C ${cx - 10} 26 ${cx - 9} 24 ${cx - 11} 19 C ${cx - 13} 14 ${cx - 11} 8 ${cx} 8 Z`;
      break;
    default: // dread / classical / fretless
      bodyPath = `M ${cx} 9 C ${cx + 13} 9 ${cx + 15} 16 ${cx + 13.5} 22 C ${cx + 12.5} 26 ${cx + 13.5} 28 ${cx + 16} 32 C ${cx + 18.5} 37 ${cx + 17} 50 ${cx} 52 C ${cx - 17} 50 ${cx - 18.5} 37 ${cx - 16} 32 C ${cx - 13.5} 28 ${cx - 12.5} 26 ${cx - 13.5} 22 C ${cx - 15} 16 ${cx - 13} 9 ${cx} 9 Z`;
  }
  out += `<path d="${bodyPath}" fill="url(#${id})" stroke="${shade(wood, -0.5)}" stroke-width="1"/>`;
  if (s.shape === 'doublebass') {
    // f-holes
    out += `<path d="M ${cx - 8} 28 C ${cx - 10} 33 ${cx - 7} 38 ${cx - 8.5} 42" fill="none" stroke="#1a0e06" stroke-width="1.6" stroke-linecap="round"/>`;
    out += `<path d="M ${cx + 8} 28 C ${cx + 10} 33 ${cx + 7} 38 ${cx + 8.5} 42" fill="none" stroke="#1a0e06" stroke-width="1.6" stroke-linecap="round"/>`;
    out += `<rect x="${cx - 1.2}" y="6" width="2.4" height="18" fill="#3a2410"/>`;
  } else {
    // soundhole + rosette + bridge
    out += `<circle cx="${cx}" cy="${cy - 2}" r="6.5" fill="#20130a"/><circle cx="${cx}" cy="${cy - 2}" r="7.8" fill="none" stroke="${shade(wood, -0.42)}" stroke-width="1.4"/>`;
    out += `<rect x="${cx - 8}" y="${cy + 10}" width="16" height="3.4" rx="1.4" fill="#241408"/>`;
    // strings + neck stub
    out += `<rect x="${cx - 4}" y="4" width="8" height="10" fill="#3a2410"/>`;
    for (let i = 0; i < 4; i++) out += `<line x1="${cx - 3 + i * 2}" y1="6" x2="${cx - 3 + i * 2}" y2="${cy + 10}" stroke="rgba(255,240,210,.5)" stroke-width=".35"/>`;
  }
  out += label(cx + 34, 34, s.label, 4.6, '#c8c4bc', { anchor: 'start', opacity: 0.8 });
  return svgDoc(out, defs);
}

/**
 * RACK: 1U 19" rack unit.
 * spec: { face, ink, label, display?, displayColor?, knobs? }
 */
function tplRack(s) {
  const rw = 148, rh = 30;
  const x = (W - rw) / 2, y = (H - rh) / 2 + 1;
  const id = gid('rk');
  const defs = vGrad(id, shade(s.face, 0.14), shade(s.face, -0.2));
  let out = shadow(W / 2, y + rh + 2, rw * 0.55);
  out += `<rect x="${x}" y="${y}" width="${rw}" height="${rh}" rx="2" fill="url(#${id})" stroke="rgba(0,0,0,.55)" stroke-width="1"/>`;
  // rack ears + screws
  for (const ex of [x + 4, x + rw - 4]) {
    out += `<circle cx="${ex}" cy="${y + 4.5}" r="1.7" fill="#0c0c0c" stroke="#555" stroke-width=".6"/>`;
    out += `<circle cx="${ex}" cy="${y + rh - 4.5}" r="1.7" fill="#0c0c0c" stroke="#555" stroke-width=".6"/>`;
  }
  // display window
  const dc = s.displayColor || '#5df08a';
  out += `<rect x="${x + 12}" y="${y + 7}" width="34" height="12" rx="1.5" fill="#0a1408" stroke="rgba(0,0,0,.6)" stroke-width=".6"/>`;
  out += label(x + 29, y + 15.6, s.display || '00', 6.4, dc, { family: FONT, ls: 1 });
  // knobs
  const nk = Math.min(s.knobs ?? 4, 4);
  for (let i = 0; i < nk; i++) {
    const kx = x + 60 + i * 12;
    const k = knob(kx, y + rh / 2, 4, '#26262a', '#e8e8e8');
    out += k.body; // defs appended below
    var _kd = (tplRack._kd || '') + k.defs; tplRack._kd = _kd;
  }
  const kdefs = tplRack._kd || ''; tplRack._kd = '';
  out += label(x + rw - 8, y + rh / 2 + 2, s.label, 5, s.ink, { anchor: 'end', ls: 0.4 });
  return svgDoc(out, defs + kdefs);
}

/**
 * TAPE: tape echo machine (RE-201 style) or Echorec drum.
 * spec: { body, panel, ink, label, kind: 'reels'|'drum' }
 */
function tplTape(s) {
  const tw = 96, th = 54;
  const x = (W - tw) / 2, y = (H - th) / 2 + 1;
  const id = gid('tp');
  let defs = vGrad(id, shade(s.body, 0.12), shade(s.body, -0.2));
  let out = shadow(W / 2, y + th, tw * 0.56);
  out += `<rect x="${x}" y="${y}" width="${tw}" height="${th}" rx="3" fill="url(#${id})" stroke="rgba(0,0,0,.55)" stroke-width="1"/>`;
  // top deck
  out += `<rect x="${x + 4}" y="${y + 4}" width="${tw - 8}" height="26" rx="2" fill="${s.panel}" stroke="rgba(0,0,0,.4)" stroke-width=".6"/>`;
  if (s.kind === 'drum') {
    // magnetic drum + 4 head dots
    out += `<circle cx="${W / 2}" cy="${y + 17}" r="10" fill="#101010" stroke="#c9a850" stroke-width="1.6"/>`;
    out += `<circle cx="${W / 2}" cy="${y + 17}" r="4" fill="#c9a850"/>`;
    for (let i = 0; i < 4; i++) {
      const a = (-140 + i * 45) * Math.PI / 180;
      out += `<circle cx="${W / 2 + Math.cos(a) * 13.5}" cy="${y + 17 + Math.sin(a) * 13.5}" r="1.6" fill="#e8d8a0"/>`;
    }
  } else {
    // two tape reels
    for (const rx of [W / 2 - 17, W / 2 + 17]) {
      out += `<circle cx="${rx}" cy="${y + 16}" r="9.5" fill="#1a1a1c" stroke="#666" stroke-width=".8"/>`;
      out += `<circle cx="${rx}" cy="${y + 16}" r="3" fill="#888"/>`;
      for (let i = 0; i < 3; i++) out += `<line x1="${rx}" y1="${y + 16}" x2="${rx + Math.cos(i * 2.09) * 8.5}" y2="${y + 16 + Math.sin(i * 2.09) * 8.5}" stroke="#555" stroke-width="1.4"/>`;
    }
    out += `<line x1="${W / 2 - 17}" y1="${y + 7}" x2="${W / 2 + 17}" y2="${y + 7}" stroke="#3a3a3c" stroke-width="1.4"/>`;
  }
  // knob row + VU
  for (let i = 0; i < 4; i++) {
    const k = knob(x + 14 + i * 13, y + th - 12, 3.6, '#e8e2d2');
    defs += k.defs; out += k.body;
  }
  out += `<rect x="${x + tw - 26}" y="${y + th - 18}" width="18" height="11" rx="1.5" fill="#f2e8c8" stroke="rgba(0,0,0,.5)" stroke-width=".6"/>`;
  out += `<line x1="${x + tw - 17}" y1="${y + th - 8.5}" x2="${x + tw - 12}" y2="${y + th - 16}" stroke="#b03020" stroke-width=".9"/>`;
  out += label(x + tw + 5, H / 2 + 2, s.label, 4.8, '#c8c4bc', { anchor: 'start', opacity: 0.85 });
  return svgDoc(out, defs);
}

/**
 * UTIL: abstract module card for Valeton-original / software-native effects.
 * spec: { body, ink, label, motif }
 */
function tplUtil(s) {
  const pw = 58, ph = 50;
  const x = (W - pw) / 2, y = (H - ph) / 2 + 1;
  const id = gid('u');
  const defs = vGrad(id, shade(s.body, 0.12), shade(s.body, -0.24));
  let out = shadow(W / 2, y + ph, pw * 0.6);
  out += `<rect x="${x}" y="${y}" width="${pw}" height="${ph}" rx="6" fill="url(#${id})" stroke="rgba(0,0,0,.5)" stroke-width=".8"/>`;
  out += `<rect x="${x + 1}" y="${y + 1}" width="${pw - 2}" height="${ph - 2}" rx="5" fill="none" stroke="rgba(255,255,255,.16)" stroke-width=".8"/>`;
  if (s.motif) out += MOTIFS[s.motif](W / 2, y + 18, s);
  out += label(W / 2, y + ph - 9, s.label, s.label.length > 8 ? 4.8 : 6, s.ink, { ls: 0.4 });
  return svgDoc(out, defs);
}

/* motif mini-drawings (centered at cx, cy; ~44 wide, ~18 tall) */
const MOTIFS = {
  sine: (cx, cy, s) => `<path d="M ${cx - 20} ${cy} q 5 -11 10 0 t 10 0 t 10 0 t 10 0" fill="none" stroke="${s.ink}" stroke-width="1.6" stroke-linecap="round" opacity=".9" transform="translate(-5 0)"/>`,
  wave2: (cx, cy, s) => `<path d="M ${cx - 18} ${cy} q 4.5 -9 9 0 t 9 0 t 9 0 t 9 0" fill="none" stroke="${s.ink}" stroke-width="1.4" opacity=".9" transform="translate(-4.5 0)"/><path d="M ${cx - 18} ${cy + 4} q 4.5 -6 9 0 t 9 0 t 9 0 t 9 0" fill="none" stroke="${s.ink}" stroke-width="1" opacity=".5" transform="translate(-4.5 0)"/>`,
  steps: (cx, cy, s) => `<path d="M ${cx - 18} ${cy + 6} h 7 v -5 h 7 v -5 h 7 v 8 h 7 v -6 h 7" fill="none" stroke="${s.ink}" stroke-width="1.6" opacity=".9"/>`,
  bits: (cx, cy, s) => [0, 1, 2, 3, 4, 5].map(i => `<rect x="${cx - 17 + i * 6}" y="${cy - 4 - (i % 3) * 2.5}" width="4" height="${9 + (i % 3) * 2.5}" fill="${s.ink}" opacity="${0.85 - (i % 3) * 0.18}"/>`).join(''),
  octave: (cx, cy, s) => `<path d="M ${cx - 9} ${cy + 6} V ${cy - 5} M ${cx - 12.5} ${cy - 1.5} L ${cx - 9} ${cy - 6} L ${cx - 5.5} ${cy - 1.5}" fill="none" stroke="${s.ink}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M ${cx + 9} ${cy - 6} V ${cy + 5} M ${cx + 5.5} ${cy + 1.5} L ${cx + 9} ${cy + 6} L ${cx + 12.5} ${cy + 1.5}" fill="none" stroke="${s.ink}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" opacity=".65"/>`,
  harmony: (cx, cy, s) => `<circle cx="${cx - 8}" cy="${cy}" r="5.5" fill="none" stroke="${s.ink}" stroke-width="1.5"/><circle cx="${cx + 8}" cy="${cy}" r="5.5" fill="none" stroke="${s.ink}" stroke-width="1.5" opacity=".55"/>`,
  ring: (cx, cy, s) => `<circle cx="${cx}" cy="${cy}" r="7.5" fill="none" stroke="${s.ink}" stroke-width="1.5"/><path d="M ${cx - 14} ${cy} h 5 M ${cx + 9} ${cy} h 5" stroke="${s.ink}" stroke-width="1.5"/><circle cx="${cx}" cy="${cy}" r="2.4" fill="${s.ink}"/>`,
  snow: (cx, cy, s) => {
    let o = '';
    for (let i = 0; i < 6; i++) o += `<line x1="${cx}" y1="${cy}" x2="${cx + Math.cos(i * Math.PI / 3) * 8}" y2="${cy + Math.sin(i * Math.PI / 3) * 8}" stroke="${s.ink}" stroke-width="1.5" stroke-linecap="round"/>`;
    return o + `<circle cx="${cx}" cy="${cy}" r="1.8" fill="${s.ink}"/>`;
  },
  hold: (cx, cy, s) => `<circle cx="${cx}" cy="${cy}" r="8" fill="none" stroke="${s.ink}" stroke-width="1.6"/><path d="M ${cx - 2.4} ${cy - 3.5} v 7 M ${cx + 2.4} ${cy - 3.5} v 7" stroke="${s.ink}" stroke-width="1.8" stroke-linecap="round"/>`,
  gate: (cx, cy, s) => `<path d="M ${cx - 19} ${cy + 5} h 9 V ${cy - 5} h 9 M ${cx - 1} ${cy - 5} q 8 0 9 10 h 11" fill="none" stroke="${s.ink}" stroke-width="1.6" stroke-linecap="round"/>`,
  swell: (cx, cy, s) => `<path d="M ${cx - 18} ${cy + 7} Q ${cx} ${cy + 7} ${cx + 6} ${cy - 6} L ${cx + 18} ${cy - 6}" fill="none" stroke="${s.ink}" stroke-width="1.7" stroke-linecap="round"/>`,
  filter: (cx, cy, s) => `<path d="M ${cx - 18} ${cy + 3} h 10 q 6 0 8 -8 q 2 8 8 8 h 10" fill="none" stroke="${s.ink}" stroke-width="1.6" stroke-linecap="round" transform="translate(-9 3)"/><path d="M ${cx - 4} ${cy + 6} h 22" stroke="${s.ink}" stroke-width="1" opacity=".4"/>`,
  arcs: (cx, cy, s) => `<path d="M ${cx - 4} ${cy + 6} a 9 9 0 0 1 0 -13" fill="none" stroke="${s.ink}" stroke-width="1.5" opacity=".95"/><path d="M ${cx + 1} ${cy + 9} a 14 14 0 0 1 0 -19" fill="none" stroke="${s.ink}" stroke-width="1.4" opacity=".6"/><path d="M ${cx + 6} ${cy + 12} a 19 19 0 0 1 0 -25" fill="none" stroke="${s.ink}" stroke-width="1.3" opacity=".35"/><circle cx="${cx - 8}" cy="${cy}" r="2.2" fill="${s.ink}"/>`,
  sparkle: (cx, cy, s) => {
    const star = (x, y, r, o) => `<path d="M ${x} ${y - r} Q ${x + r * .18} ${y - r * .18} ${x + r} ${y} Q ${x + r * .18} ${y + r * .18} ${x} ${y + r} Q ${x - r * .18} ${y + r * .18} ${x - r} ${y} Q ${x - r * .18} ${y - r * .18} ${x} ${y - r} Z" fill="${s.ink}" opacity="${o}"/>`;
    return star(cx - 8, cy, 7, 0.95) + star(cx + 7, cy - 5, 4.5, 0.6) + star(cx + 10, cy + 5, 3, 0.4);
  },
  spring: (cx, cy, s) => {
    let d = `M ${cx - 19} ${cy}`;
    for (let i = 0; i < 6; i++) d += ` c 2 -7 4.5 -7 6.5 0 c -2 7 -4.5 7 -6.5 0 m 6.5 0`;
    return `<path d="${d}" fill="none" stroke="${s.ink}" stroke-width="1.3" opacity=".9"/>`;
  },
  plate: (cx, cy, s) => `<rect x="${cx - 17}" y="${cy - 7}" width="34" height="14" rx="1.5" fill="none" stroke="${s.ink}" stroke-width="1.5"/><path d="M ${cx - 10} ${cy} q 5 -6 10 0 t 10 0" fill="none" stroke="${s.ink}" stroke-width="1.1" opacity=".65" transform="translate(-5 0)"/>`,
  pan: (cx, cy, s) => `<path d="M ${cx - 16} ${cy} h 32 M ${cx - 16} ${cy} l 5 -4 m -5 4 l 5 4 M ${cx + 16} ${cy} l -5 -4 m 5 4 l -5 4" fill="none" stroke="${s.ink}" stroke-width="1.5" stroke-linecap="round"/>`,
  nam: (cx, cy, s) => {
    const n = [[-14, -5], [-14, 5], [0, -7], [0, 0], [0, 7], [14, -3], [14, 4]];
    let o = '';
    for (const [ax, ay] of n.slice(0, 2)) for (const [bx, by] of n.slice(2, 5)) o += `<line x1="${cx + ax}" y1="${cy + ay}" x2="${cx + bx}" y2="${cy + by}" stroke="${s.ink}" stroke-width=".7" opacity=".5"/>`;
    for (const [ax, ay] of n.slice(2, 5)) for (const [bx, by] of n.slice(5)) o += `<line x1="${cx + ax}" y1="${cy + ay}" x2="${cx + bx}" y2="${cy + by}" stroke="${s.ink}" stroke-width=".7" opacity=".5"/>`;
    for (const [ax, ay] of n) o += `<circle cx="${cx + ax}" cy="${cy + ay}" r="2.2" fill="${s.ink}"/>`;
    return o;
  },
  ir: (cx, cy, s) => `<path d="M ${cx - 18} ${cy} h 6 l 3 -8 l 4 14 l 4 -11 l 3 5 h 16" fill="none" stroke="${s.ink}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  tapesat: (cx, cy, s) => `<circle cx="${cx - 9}" cy="${cy}" r="6" fill="none" stroke="${s.ink}" stroke-width="1.5"/><circle cx="${cx + 9}" cy="${cy}" r="6" fill="none" stroke="${s.ink}" stroke-width="1.5"/><path d="M ${cx - 9} ${cy - 6} H ${cx + 9}" stroke="${s.ink}" stroke-width="1.2" opacity=".7"/>`,
  tri: (cx, cy, s) => `<path d="M ${cx - 18} ${cy + 5} l 5 -10 l 9 10 l 9 -10 l 9 10 l 5 -10" fill="none" stroke="${s.ink}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`,
  rev: (cx, cy, s) => `<path d="M ${cx + 12} ${cy - 3} a 12 8 0 1 0 0 6" fill="none" stroke="${s.ink}" stroke-width="1.6" stroke-linecap="round"/><path d="M ${cx + 8} ${cy - 7} l 5 4 l -6 3" fill="none" stroke="${s.ink}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  detune: (cx, cy, s) => `<path d="M ${cx - 18} ${cy} q 4.5 -9 9 0 t 9 0 t 9 0 t 9 0" fill="none" stroke="${s.ink}" stroke-width="1.5" opacity=".95" transform="translate(-4.5 0)"/><path d="M ${cx - 15} ${cy + 1} q 4.5 -9 9 0 t 9 0 t 9 0 t 9 0" fill="none" stroke="${s.ink}" stroke-width="1.2" opacity=".45" transform="translate(-4.5 0)"/>`,
};

/* dispatcher */
const TEMPLATES = { stomp: tplStomp, rocker: tplRocker, eq: tplEq, amp: tplAmp, cab: tplCab, acoustic: tplAcoustic, rack: tplRack, tape: tplTape, util: tplUtil };

/**
 * Content box of each template's subject on the 160×64 canvas, as { x, w }.
 *
 * Every template centres its subject and leaves the rest of the canvas empty,
 * so a viewer that fits the whole 160-wide canvas into a small square renders a
 * 42-wide stompbox at a tenth of the space it was given. The phone UI crops to
 * this box instead (see src/components/board/pedalManifest.ts `artBox`).
 *
 * Deliberately a parallel table rather than a second return value from each
 * tpl* function: the SVG-emitting code is then provably untouched by this
 * addition, so regenerating can only ever change manifest.json. The widths here
 * are the same expressions the templates use — keep them in step.
 *
 * `y` is always 0..64: every subject uses the full canvas height.
 */
const centred = (w) => ({ x: (W - w) / 2, w });

const BOXES = {
  // body is `wide ? 58 : 42` (round is a r=27 circle), plus the 3.4-wide side
  // jacks that only the rectangular shapes carry
  stomp: (s) => (s.shape === 'round' ? centred(54) : centred((s.shape === 'big' ? 58 : 42) + 6.8)),
  // base wedge spans x 36..124
  rocker: () => ({ x: 36, w: 88 }),
  eq: (s) => centred(s.bands > 6 ? 76 : 52),
  amp: () => centred(148),
  cab: (s) => centred(s.rows >= 2 || s.cols >= 2 ? 108 : 84),
  // widest body is the jumbo at cx ± 21. The name sits off to the right at
  // cx + 34 and is deliberately outside the box: cropped thumbnails show the
  // instrument, and the full canvas (hero art) still shows the label.
  acoustic: () => centred(44),
  rack: () => centred(148),
  tape: () => centred(96),
  util: () => centred(58),
};

/* ════════════════════════════════════════════════════════════════════════
 * 4. MAIN: merge effect list with specs, emit SVGs + manifest
 * ════════════════════════════════════════════════════════════════════════ */
import { SPECS, TYPE_BLURBS } from './pedal-art-specs.mjs';

/* board palette bodies for spec-less fallbacks (docs/board-design-system.md) */
const MODULE_BODY = {
  PRE: '#ece4d4', WAH: '#8a4dd8', DST: '#d45050', AMP: '#211d18', NR: '#c9cfd2',
  CAB: '#3a3d3f', EQ: '#f1f1ec', MOD: '#2f6fd8', DLY: '#5a5fd8', RVB: '#2fb9c9', VOL: '#2e2e33',
};

/* per-module LED colors (specs don't carry LEDs; the board view does) */
const MODULE_LED = {
  PRE: '#ff4d4d', WAH: '#ff4d4d', DST: '#ff4d4d', AMP: '#ffa23f', NR: '#4dff88',
  CAB: '#ffa23f', EQ: '#ff4d4d', MOD: '#4da6ff', DLY: '#4da6ff', RVB: '#4dffe0', VOL: '#ffffff',
};

/* representative base hex for each pattern fill (see patternDefs) */
const PATTERN_HEX = {
  tweed: '#c9a86a', oxblood: '#4a2028', silverface: '#a8a49a', wheat: '#cfc0a0',
  diamond: '#5a4632', cane: '#c8a878', basket: '#8a7454', blackweave: '#1c1c1e',
  metalgrid: '#26282a', bluecheck: '#28407c', orangeweave: '#d86a1a', diamondplate: '#b0b4b8',
};
const hexOf = (c, fallback) => (typeof c === 'string' && c.startsWith('#') ? c : PATTERN_HEX[c] ?? fallback);

const relLum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
};
const inkOn = (bg) => (relLum(bg) > 135 ? '#1c1712' : '#f2ede2');
const knobStyleOn = (bg) => (relLum(bg) > 135 ? 'dark' : 'cream');

/**
 * Body colors the board view paints the whole pedal with: the enclosure
 * gradient, text ink, knob style, LED, and (amps) the control-panel strip.
 * Derived from the same spec that drew the SVG so pedal and artwork match.
 */
function bodyColorsFor(spec, module) {
  let body, ink;
  let panel, panelText;
  switch (spec.t) {
    case 'amp':
      body = hexOf(spec.tolex, '#211d18');
      panel = hexOf(spec.panel, '#26282c');
      panelText = spec.panelText && spec.panelText.startsWith('#') ? spec.panelText : inkOn(panel);
      ink = inkOn(body);
      break;
    case 'cab':
      body = hexOf(spec.tolex, '#3a3d3f');
      ink = inkOn(body);
      break;
    case 'acoustic':
      body = spec.wood || '#d9a95e';
      ink = inkOn(body);
      break;
    case 'rack':
      body = hexOf(spec.face, '#26262a');
      ink = inkOn(body);
      break;
    case 'tape':
      body = hexOf(spec.body, '#3a3a3c');
      ink = inkOn(body);
      break;
    case 'rocker':
      body = hexOf(spec.body, '#2e2e33');
      ink = inkOn(body);
      break;
    default: // stomp / eq / util
      body = hexOf(spec.body, MODULE_BODY[module] ?? '#666');
      ink = spec.ink && spec.ink.startsWith('#') ? spec.ink : inkOn(body);
  }
  const colors = {
    body,
    bodyDeep: shade(body, -0.22),
    ink,
    // amp knobs sit on the panel, everything else's sit on the body
    knob: spec.t === 'amp' ? (relLum(panel) > 135 ? 'dark' : 'gold') : knobStyleOn(body),
    led: spec.led ?? MODULE_LED[module] ?? '#ff4d4d',
  };
  if (panel) {
    colors.panel = panel;
    colors.panelText = panelText;
  }
  return colors;
}

function main() {
  const effects = readEffects();
  mkdirSync(OUT, { recursive: true });

  // slug collision detection across name+module pairs
  const bySlug = new Map();
  for (const e of effects) {
    const s = slugify(e.name);
    if (!bySlug.has(s)) bySlug.set(s, []);
    bySlug.get(s).push(e);
  }

  const manifest = [];
  const missing = [];
  for (const e of effects) {
    const key = `${e.module}:${e.name}`;
    let spec = SPECS[key];
    if (!spec) {
      missing.push(key);
      spec = { t: 'util', body: MODULE_BODY[e.module] ?? '#666', ink: '#1c1712', label: e.name.toUpperCase(), motif: 'sine', type: 'Special', basedOn: '-' };
      const lum = parseInt(spec.body.slice(1), 16);
      const y = 0.299 * ((lum >> 16) & 255) + 0.587 * ((lum >> 8) & 255) + 0.114 * (lum & 255);
      if (y < 135) spec.ink = '#f2ede2';
    }
    const slug = slugify(e.name);
    const collides = bySlug.get(slug).length > 1;
    const file = collides ? `${slug}--${e.module.toLowerCase()}.svg` : `${slug}.svg`;
    const svg = TEMPLATES[spec.t](spec);
    writeFileSync(join(OUT, file), svg);
    manifest.push({
      name: e.name,
      module: e.module,
      slug,
      file,
      type: spec.type ?? 'Special',
      basedOn: spec.basedOn ?? '-',
      blurb: spec.blurb ?? TYPE_BLURBS[spec.type] ?? '',
      colors: bodyColorsFor(spec, e.module),
      art: BOXES[spec.t](spec),
    });
  }

  // stale spec keys (spec exists but effect doesn't)
  const liveKeys = new Set(effects.map((e) => `${e.module}:${e.name}`));
  const stale = Object.keys(SPECS).filter((k) => !liveKeys.has(k));

  // every effect must get its own file; collisions are a hard error
  const files = manifest.map((m) => m.file);
  const dupes = files.filter((f, i) => files.indexOf(f) !== i);
  if (dupes.length) throw new Error(`file collisions: ${[...new Set(dupes)].join(', ')}`);

  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`✓ ${manifest.length} SVGs → public/pedals/ (+ manifest.json)`);
  if (missing.length) console.warn(`⚠ no art spec (module-color fallback used): ${missing.join(', ')}`);
  if (stale.length) console.warn(`⚠ stale spec keys (no matching effect): ${stale.join(', ')}`);
}

main();
