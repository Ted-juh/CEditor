// ctrlr-import.mjs — read a Ctrlr panel, harvest a device profile, rebuild the panel.
//
//   node tools/scripts/ctrlr-import.mjs <file.panel|file.bpanelz> [--profile out.json] [--panel out.cepanel]
//   node tools/scripts/ctrlr-import.mjs --corpus <directory>
//
// The stages are `tools/ctrlr-import/` and each is useful alone — the plan says stop after any of
// them, and this exposes them that way. With no output flags it does S1 only: read the file and
// report what is in it, converting nothing. That is the cheapest possible way to be wrong early,
// and running it over a corpus answers questions about the corpus that no amount of reasoning here
// can.
//
// NOTHING IS BUNDLED AND NOTHING IS FETCHED. This converts a file the user already has.
// Redistributing other people's panels is their decision, not the program's.
//
// LICENSING, since it always comes up: Ctrlr is GPLv3 and CEditor is AGPL-3.0 — compatible, and in
// the permissive direction. File formats are not copyrightable and this reimplements a reader
// rather than lifting code. A user-run converter distributes nothing.

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { formatReport, readCtrlrPanel } from '../ctrlr-import/read.mjs';
import { harvestProfile } from '../ctrlr-import/harvest.mjs';
import { planReconstruction } from '../ctrlr-import/reconstruct.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

const APP = path.join(REPO, 'CE/web/src/CE_Application');

function parseArgs(argv) {
  const args = { file: '', profile: '', panel: '', corpus: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--profile') { args.profile = argv[++i] ?? ''; continue; }
    if (arg === '--panel') { args.panel = argv[++i] ?? ''; continue; }
    if (arg === '--corpus') { args.corpus = argv[++i] ?? ''; continue; }
    if (!arg.startsWith('--') && !args.file) { args.file = arg; continue; }
  }
  return args;
}

/**
 * Build a `.cepanel` from a reconstruction plan.
 *
 * The component factory is imported HERE rather than in `reconstruct.mjs`, so that module stays a
 * pure translation of the source document and can be tested without standing the editor's model up.
 */
async function buildPanel(plan, { name, width, height, profileId }) {
  // pathToFileURL, not a bare path: `await import('C:\\...')` is not a valid specifier on Windows,
  // and this is a tool that has to run wherever the packaging does.
  const load = (rel) => import(pathToFileURL(path.join(APP, rel)).href);
  const { createControl } = await load('models/componentTypes.js');
  const { createPanel, serializePanel } = await load('stores/panelModel.js');

  const panel = createPanel(name);
  panel.width = Math.max(320, width || 0);
  panel.height = Math.max(240, height || 0);
  panel.requiredProfiles = profileId ? [{ role: 'primary', profileId, version: '*' }] : [];

  panel.controls = plan.placed.map((entry, index) => {
    const id = `ctrlr_${index}_${(entry.name || entry.type).replace(/\W+/g, '_').toLowerCase()}`;
    const overrides = {
      Core: { id, name: id, description: `${entry.name} — imported (${entry.reason})` },
      Transform: {
        x: entry.rect.x, y: entry.rect.y, width: entry.rect.width, height: entry.rect.height,
        opacity: Number.isFinite(entry.alpha) ? entry.alpha : 1,
      },
    };
    if (entry.colours.background) {
      overrides.Background = { _children: { Fill: { colour: entry.colours.background } } };
    }
    if (entry.parameterId && entry.profileId) {
      overrides.DeviceBindings = {
        bindings: [{
          kind: 'deviceParameter',
          port: entry.type === 'ToggleButton' ? 'state' : (entry.type === 'Combobox' ? 'selectedChoice' : 'value'),
          deviceRole: entry.deviceRole,
          parameterId: entry.parameterId,
          adoptMetadata: true,
          dryRun: false,
          feedback: { receiveUpdates: true, ignoreOwnEchoes: true, echoWindowMs: 250 },
        }],
      };
    }
    const control = createControl(entry.type, overrides);
    if (entry.items.length && control._children.Value) {
      control._children.Value.rows = entry.items.map((label, row) => ({
        id: `row_${row}`, displayText: label, internalValue: label,
        sendValue: row, receiveValue: row, selectedByDefault: row === 0, enabled: true, visualOverrides: {},
      }));
    }
    if (entry.type === 'Label' && control._children.Text) control._children.Text.content = entry.name;
    return control;
  });

  return serializePanel(panel);
}

function reportCorpus(directory) {
  const files = readdirSync(directory)
    .filter((f) => /\.(panel|bpanelz)$/i.test(f))
    .map((f) => path.join(directory, f))
    .filter((f) => statSync(f).isFile());

  if (files.length === 0) {
    console.log(`No .panel or .bpanelz files in ${directory}`);
    return 0;
  }

  // The failure mode to design against is not a bad conversion — it is a converter that dies on
  // panel 40 of 300. So every file is attempted, every throw is caught, and the run always finishes.
  let read = 0;
  let failed = 0;
  const modulators = { total: 0, converted: 0 };
  const luaClasses = {};

  for (const file of files) {
    let result;
    try {
      result = readCtrlrPanel(readFileSync(file));
    } catch (error) {
      result = { ok: false, error: `threw: ${error.message}` };
    }
    console.log(formatReport(result, path.basename(file)));

    if (!result.ok) { failed += 1; continue; }
    read += 1;
    for (const [kind, count] of Object.entries(result.histograms.luaClass)) {
      luaClasses[kind] = (luaClasses[kind] ?? 0) + count;
    }
    try {
      const harvest = harvestProfile(result);
      if (harvest.ok) {
        modulators.total += harvest.report.modulators;
        modulators.converted += harvest.report.converted;
      }
    } catch (error) {
      console.log(`    harvest threw: ${error.message}`);
    }
    console.log('');
  }

  const coverage = modulators.total ? (100 * modulators.converted / modulators.total).toFixed(1) : '0.0';
  console.log(`--- ${files.length} file(s): ${read} read, ${failed} refused`);
  console.log(`--- modulators: ${modulators.converted}/${modulators.total} convert without a human (${coverage}%)`);
  console.log(`--- Lua: ${Object.entries(luaClasses).map(([k, v]) => `${k}×${v}`).join(', ') || 'none'}`);
  return failed > 0 ? 1 : 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.corpus) return reportCorpus(args.corpus);

  if (!args.file) {
    console.error('usage: ctrlr-import.mjs <file.panel|file.bpanelz> [--profile out.json] [--panel out.cepanel]');
    console.error('       ctrlr-import.mjs --corpus <directory>');
    return 2;
  }

  const read = readCtrlrPanel(readFileSync(args.file));
  console.log(formatReport(read, path.basename(args.file)));
  if (!read.ok) return 1;

  if (!args.profile && !args.panel) {
    console.log('\n(no --profile or --panel given, so nothing was converted)');
    return 0;
  }

  const harvest = harvestProfile(read);
  if (!harvest.ok) { console.error(harvest.error); return 1; }

  const { converted, modulators, flagged } = harvest.report;
  console.log(`\nharvest: ${converted}/${modulators} modulators became parameters`);
  for (const flag of flagged) console.log(`  flagged  ${flag.name || flag.id}: ${flag.reason}`);

  if (args.profile) {
    mkdirSync(path.dirname(path.resolve(args.profile)), { recursive: true });
    writeFileSync(args.profile, `${JSON.stringify(harvest.profile, null, 2)}\n`, 'utf8');
    console.log(`wrote ${args.profile}`);
  }

  if (args.panel) {
    const plan = planReconstruction(read, {
      profileId: harvest.profile.id,
      parameterIds: new Set(harvest.profile.parameters.map((p) => p.id)),
    });
    if (!plan.ok) { console.error(plan.error); return 1; }
    console.log(`\nreconstruct: ${plan.placed.length} placed, ${plan.skipped.length} skipped`);
    for (const skip of plan.skipped) console.log(`  skipped  ${skip.name}: ${skip.reason}`);
    for (const loose of plan.unbound) console.log(`  unbound  ${loose.name}: ${loose.reason}`);
    for (const note of plan.notes) console.log(`  note     ${note}`);

    const text = await buildPanel(plan, {
      name: `${read.panel.name || 'Imported'} (Ctrlr)`,
      width: read.panel.width,
      height: read.panel.height,
      profileId: harvest.profile.id,
    });
    mkdirSync(path.dirname(path.resolve(args.panel)), { recursive: true });
    writeFileSync(args.panel, text, 'utf8');
    console.log(`wrote ${args.panel}`);
  }

  // S4, reported rather than translated. The rule the plan states and this obeys: never silently
  // half-translate a script. A converted panel that looks right and behaves subtly wrong is worse
  // than one that says plainly which methods are not running.
  if (read.luaMethods.length) {
    console.log(`\nlua: ${read.luaMethods.length} method(s) imported as reference text, none running`);
    for (const method of read.luaMethods) {
      console.log(`  ${method.classification.padEnd(10)} ${method.name || '(unnamed)'}`
        + `${method.hooks.length ? `  [${method.hooks.join(', ')}]` : ''}`);
    }
  }

  return 0;
}

main().then((code) => { process.exitCode = code; }, (error) => {
  console.error(error.stack ?? String(error));
  process.exitCode = 1;
});
