// make-qa-panels.mjs — regenerate the QA panel suite.
//
//   node tools/scripts/qa/make-qa-panels.mjs [outDir]     (default: CE/qa)
//   node tools/scripts/qa/make-qa-panels.mjs --check      (fail if the committed files are stale)
//
// The sheets are committed rather than generated on demand, for one reason: you can open them
// from File → Open on a machine that has never run Node, and a beta tester is exactly that
// machine. `--check` is what stops the committed copy drifting from the generator — CI runs it,
// and a component added without regenerating fails there rather than in someone's hands.
//
// Sibling of tools/scripts/nativeHandlers/make-selftest-panel.mjs, which does the same job for the
// seven script languages. If you are adding a sheet, add it to SHEETS and to CE/qa/README.md.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { serializePanel } from '../../../CE/web/src/CE_Application/stores/panelModel.js';
import { buildComponentsSheet } from './sheets/components.mjs';
import { buildExportSheet } from './sheets/export.mjs';
import { buildGaiaSheet } from './sheets/gaia.mjs';
import { buildPackagesSheet } from './sheets/packages.mjs';
import { buildPropertiesSheet } from './sheets/properties.mjs';
import { buildScriptingSheet } from './sheets/scripting.mjs';
import { buildStatesSheet } from './sheets/states.mjs';
import { buildVerbsSheet } from './sheets/verbs.mjs';
import { readCommitted } from '../readCommitted.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');

/**
 * `commit: true` means the sheet is checked in, so it opens on a machine that has never run Node.
 *
 * All of them are. QA-06 was gitignored while it was 28 MB; eliding defaults took it to 392 KB and
 * the reason to keep it out went with them, and nothing since has come close to that size.
 *
 * The numbering is the order a beta pass runs them in, not the order they were written: what
 * renders (01), what renders under pressure (02), what happens when you touch it (03), what a
 * script can do to it (04), what the component API can do to it (05), a whole real device (06),
 * the components a user builds themselves (07), and what leaves the building (08).
 */
export const SHEETS = [
  { file: 'QA-01-components.cepanel', build: buildComponentsSheet, commit: true },
  { file: 'QA-02-properties.cepanel', build: buildPropertiesSheet, commit: true },
  { file: 'QA-03-states.cepanel', build: buildStatesSheet, commit: true },
  { file: 'QA-04-scripting.cepanel', build: buildScriptingSheet, commit: true },
  { file: 'QA-05-verbs.cepanel', build: buildVerbsSheet, commit: true },
  { file: 'QA-06-roland-gaia.cepanel', build: buildGaiaSheet, commit: true },
  { file: 'QA-07-packages.cepanel', build: buildPackagesSheet, commit: true },
  { file: 'QA-08-export.cepanel', build: buildExportSheet, commit: true },
];

/**
 * Serialize a sheet deterministically.
 *
 * createPanel() mints a fresh panelGuid every call and numbers scriptId off a process counter, so
 * two runs of this generator produce two different documents from identical input — and a file
 * that always shows as modified is a file nobody reviews. Both are pinned to the filename here.
 * A QA sheet is never exported as a plugin, so its identity only has to be stable and unique
 * within the suite, not random.
 */
export function serializeSheet(sheet) {
  const panel = sheet.build();
  const slug = sheet.file.replace(/\.cepanel$/i, '').replace(/\W+/g, '_').toLowerCase();
  panel.panelGuid = guidFromName(sheet.file);
  panel.scriptId = slug;
  panel.filePath = null;
  return `${serializePanel(panel)}\n`;
}

/** A stable v4-shaped GUID from a string. Not cryptographic — it only has to be repeatable. */
function guidFromName(name) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < name.length; i++) {
    h1 = Math.imul(h1 ^ name.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + name.charCodeAt(i), 0x85ebca6b) >>> 0;
  }
  const hex = (n) => n.toString(16).padStart(8, '0');
  const a = hex(h1), b = hex(h2), c = hex(h1 ^ h2), d = hex(Math.imul(h1, 31) >>> 0);
  return `${a}-${b.slice(0, 4)}-4${b.slice(5)}-a${c.slice(1, 4)}-${c.slice(4)}${d}`;
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const outDir = path.resolve(REPO, args.find((a) => !a.startsWith('--')) ?? 'CE/qa');

  if (!check) mkdirSync(outDir, { recursive: true });

  const stale = [];
  for (const sheet of SHEETS) {
    const target = path.join(outDir, sheet.file);
    const json = serializeSheet(sheet);

    if (check) {
      if (!sheet.commit) continue;
      if (readCommitted(target) !== json) stale.push(sheet.file);
      continue;
    }

    writeFileSync(target, json);
    const controls = JSON.parse(json).controls.length;
    console.log(`Wrote ${path.relative(REPO, target)}  (${controls} controls, ${(json.length / 1024).toFixed(0)} KB)`);
  }

  if (check) {
    if (stale.length === 0) {
      console.log(`QA panels are up to date (${SHEETS.length} sheets).`);
      return;
    }
    console.error(`Stale QA panels: ${stale.join(', ')}`);
    console.error('Run: node tools/scripts/qa/make-qa-panels.mjs');
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
