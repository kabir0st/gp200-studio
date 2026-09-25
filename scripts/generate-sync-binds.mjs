#!/usr/bin/env node
/**
 * Parses the Valeton GP-200 algorithm.xml and generates
 * src/core/effectSyncBinds.ts: which Rate/Time knob each tempo-Sync switch
 * turns into a note-value knob.
 *
 * Deliberately separate from generate-effect-params.mjs. That script's output
 * is hand-corrected (CAB idx) and must not be casually regenerated, while this
 * table is safe to rebuild at any time: it is keyed by param NAME, and
 * tests/unit/tempoSync.test.ts checks every name against the committed
 * effectParams.ts, so an idx drift between editor releases cannot mis-wire it.
 *
 * Usage: node scripts/generate-sync-binds.mjs
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Same lookup as generate-effect-params.mjs: a Windows install seen from WSL,
// or a local Wine install. First hit wins; override with GP200_ALGORITHM_XML.
const XML_CANDIDATES = [
  process.env.GP200_ALGORITHM_XML,
  '/mnt/c/Program Files/Valeton/GP-200/Resource/GP-200/File/algorithm.xml',
  join(
    process.env.HOME ?? '',
    '.wine/drive_c/Program Files/Valeton/GP-200/Resource/GP-200/File/algorithm.xml',
  ),
].filter(Boolean);
const OUT_PATH = join(__dirname, '..', 'src', 'core', 'effectSyncBinds.ts');

const XML_PATH = XML_CANDIDATES.find((candidate) => existsSync(candidate));
if (!XML_PATH) {
  console.error('algorithm.xml not found. Checked:\n  ' + XML_CANDIDATES.join('\n  '));
  process.exit(1);
}

const xml = readFileSync(XML_PATH, 'utf-8');
const algRegex = /<Alg\s+([^>]+)>([\s\S]*?)<\/Alg>/g;
const elementRegex = /<(Knob|Slider|Switch|Combox)\s+([^>]+?)\/?>/g;

function parseAttrs(str) {
  const attrs = {};
  for (const match of str.matchAll(/(\w+)\s*=\s*"([^"]*)"/g)) attrs[match[1]] = match[2];
  return attrs;
}

// A synced knob carries `valueType="1" bind="<ID>"`, where the ID names its
// Sync switch. IDs are not idx values (High Cut: idx 2, ID 6), so the bind is
// resolved to the switch element here and emitted by name.
const binds = {};
let unresolved = 0;
for (const alg of xml.matchAll(algRegex)) {
  const code = parseInt(parseAttrs(alg[1]).Code, 10);
  if (isNaN(code)) continue;
  // commented-out params must not bind (see generate-effect-params.mjs)
  const body = alg[2].replace(/<!--[\s\S]*?-->/g, '');
  const elements = [...body.matchAll(elementRegex)].map((element) => ({
    tag: element[1],
    ...parseAttrs(element[2]),
  }));
  const syncedKnobs = elements.filter((element) => element.valueType === '1');
  for (const knob of syncedKnobs) {
    const syncSwitch = elements.find(
      (element) => element.tag === 'Switch' && element.ID === knob.bind,
    );
    if (!syncSwitch) {
      unresolved++;
      console.warn(`code ${code}: ${knob.Name} binds ID ${knob.bind}, which is no switch`);
      continue;
    }
    binds[code] ??= {};
    binds[code][knob.Name] = syncSwitch.Name;
  }
}

const rows = Object.entries(binds).map(([code, knobs]) => {
  const pairs = Object.entries(knobs).map(([knob, sw]) => `'${knob}': '${sw}'`);
  return `  ${code}: { ${pairs.join(', ')} },`;
});

const ts = `/**
 * GP-200 tempo-sync bindings: effect code -> { knob name: Sync switch name }.
 *
 * Auto-generated from algorithm.xml (\`valueType="1" bind="<switch ID>"\`) by
 * scripts/generate-sync-binds.mjs. DO NOT EDIT MANUALLY. Re-run the script to update.
 *
 * Keyed by name rather than idx so it is resolved against the committed
 * effectParams.ts at runtime (see core/tempoSync.ts).
 */
export const SYNC_BINDS: Record<number, Record<string, string>> = {
${rows.join('\n')}
};
`;

writeFileSync(OUT_PATH, ts, 'utf-8');
const knobCount = Object.values(binds).reduce(
  (sum, knobs) => sum + Object.keys(knobs).length,
  0,
);
console.log(
  `Wrote ${Object.keys(binds).length} effects / ${knobCount} synced knobs to ${OUT_PATH}` +
    (unresolved ? ` (${unresolved} unresolved)` : ''),
);
