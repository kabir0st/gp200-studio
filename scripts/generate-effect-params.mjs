#!/usr/bin/env node
/**
 * Parses the Valeton GP-200 algorithm.xml and generates
 * src/core/effectParams.ts with all effect parameter definitions.
 *
 * Usage: node scripts/generate-effect-params.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const XML_PATH = join(
  process.env.HOME,
  '.wine/drive_c/Program Files/Valeton/GP-200/Resource/GP-200/File/algorithm.xml'
);
const OUT_PATH = join(__dirname, '..', 'src', 'core', 'effectParams.ts');

const xml = readFileSync(XML_PATH, 'utf-8');

// Parse all <Alg> blocks
const algRegex = /<Alg\s+([^>]+)>([\s\S]*?)<\/Alg>/g;
const attrRegex = /(\w+)\s*=\s*"([^"]*)"/g;

function parseAttrs(str) {
  const attrs = {};
  let m;
  while ((m = attrRegex.exec(str)) !== null) {
    attrs[m[1]] = m[2];
  }
  attrRegex.lastIndex = 0;
  return attrs;
}

// Parse children (Knob, Switch, Combox) from body
function parseParams(body) {
  const params = [];

  // Parse Knob and Slider elements (same structure, both render as sliders)
  const knobRegex = /<(?:Knob|Slider)\s+([^>]+)\/>/g;
  let m;
  while ((m = knobRegex.exec(body)) !== null) {
    const a = parseAttrs(m[1]);
    params.push({
      type: 'knob',
      name: a.Name,
      idx: parseInt(a.idx, 10),
      default: parseFloat(a.default),
      min: parseFloat(a.Dmin),
      max: parseFloat(a.Dmax),
      step: parseFloat(a.step),
    });
  }

  // Parse Switch elements (with child Menu items)
  const switchRegex = /<Switch\s+([^>]+)>([\s\S]*?)<\/Switch>/g;
  while ((m = switchRegex.exec(body)) !== null) {
    const a = parseAttrs(m[1]);
    const menuBody = m[2];
    const options = [];
    const menuRegex = /<Menu\s+([^>]+)\/>/g;
    let mm;
    while ((mm = menuRegex.exec(menuBody)) !== null) {
      const ma = parseAttrs(mm[1]);
      options.push({ name: ma.Name, id: parseInt(ma.ID, 10) });
    }
    params.push({
      type: 'switch',
      name: a.Name,
      idx: parseInt(a.idx, 10),
      default: parseFloat(a.default),
      options,
    });
  }

  // Parse Combox elements (with child Menu items)
  const comboxRegex = /<Combox\s+([^>]+)>([\s\S]*?)<\/Combox>/g;
  while ((m = comboxRegex.exec(body)) !== null) {
    const a = parseAttrs(m[1]);
    const menuBody = m[2];
    const options = [];
    const menuRegex = /<Menu\s+([^>]+)\/>/g;
    let mm;
    while ((mm = menuRegex.exec(menuBody)) !== null) {
      const ma = parseAttrs(mm[1]);
      options.push({ name: ma.Name, id: parseInt(ma.ID, 10) });
    }
    params.push({
      type: 'combox',
      name: a.Name,
      idx: parseInt(a.idx, 10),
      default: parseFloat(a.default),
      options,
    });
  }

  // Sort by idx
  params.sort((a, b) => a.idx - b.idx);
  return params;
}

const effects = {};
let match;
while ((match = algRegex.exec(xml)) !== null) {
  const attrs = parseAttrs(match[1]);
  const code = parseInt(attrs.Code, 10);
  const body = match[2];
  const params = parseParams(body);
  if (!isNaN(code)) {
    effects[code] = params;
  }
}

// Generate TypeScript
let ts = `/**
 * GP-200 Effect Parameter Definitions
 *
 * Auto-generated from algorithm.xml by scripts/generate-effect-params.mjs
 * DO NOT EDIT MANUALLY — re-run the script to update.
 */

export interface KnobParam {
  type: 'knob';
  name: string;
  idx: number;
  default: number;
  min: number;
  max: number;
  step: number;
}

export interface SwitchParam {
  type: 'switch';
  name: string;
  idx: number;
  default: number;
  options: { name: string; id: number }[];
}

export interface ComboxParam {
  type: 'combox';
  name: string;
  idx: number;
  default: number;
  options: { name: string; id: number }[];
}

export type EffectParam = KnobParam | SwitchParam | ComboxParam;

/**
 * Maps effect code (uint32) to its parameter definitions.
 * The idx field maps directly to the position in the 15-element float32 array.
 */
export const EFFECT_PARAMS: Record<number, EffectParam[]> = {\n`;

const sortedCodes = Object.keys(effects).map(Number).sort((a, b) => a - b);

for (const code of sortedCodes) {
  const params = effects[code];
  ts += `  ${code}: [\n`;
  for (const p of params) {
    if (p.type === 'knob') {
      ts += `    { type: 'knob', name: '${p.name.replace(/'/g, "\\'")}', idx: ${p.idx}, default: ${p.default}, min: ${p.min}, max: ${p.max}, step: ${p.step} },\n`;
    } else {
      const optStr = p.options
        .map((o) => `{ name: '${o.name.replace(/'/g, "\\'")}', id: ${o.id} }`)
        .join(', ');
      ts += `    { type: '${p.type}', name: '${p.name.replace(/'/g, "\\'")}', idx: ${p.idx}, default: ${p.default}, options: [${optStr}] },\n`;
    }
  }
  ts += `  ],\n`;
}

ts += `};

/**
 * Returns the parameter definitions for a given effect code.
 * Returns an empty array for unknown effects.
 */
export function getEffectParams(effectId: number): EffectParam[] {
  return EFFECT_PARAMS[effectId] ?? [];
}
`;

writeFileSync(OUT_PATH, ts, 'utf-8');
console.log(`Generated ${OUT_PATH} with ${sortedCodes.length} effects.`);
