// ctrlr-import.mjs — read a Ctrlr panel, harvest a device profile, rebuild the panel.
//
//   node tools/scripts/ctrlr-import.mjs <file> [--profile out.json] [--panel out.cepanel] [--verify]
//   node tools/scripts/ctrlr-import.mjs --corpus <directory> [--verify]
//
// <file> is anything the editor's File > New > From Ctrlr Panel… opens: a `.panel` (XML), a
// `.bpanelz` or `.bpanel` (JUCE's binary tree, compressed or not), or a program Ctrlr exported —
// an `.exe`, `.dll`, `.vst3`, `.so` or `.dylib` with the panel inside it.
//
// The stages are `CE/web/src/CE_Application/ctrlrImport/` (the editor's File menu runs the same
// ones) and each is useful alone. With no output flags this reads the file and reports what is in
// it, converting nothing.
//
// --verify holds the harvested profile to Ctrlr itself: for every parameter, every value (or, for
// a wide range, a spread of a few hundred including both ends) is compiled by the device-profile
// engine and compared byte for byte with what Ctrlr sends for the same value — computed by
// `CE/web/test/support/ctrlrReference.js`, a separate port of CtrlrX's byte-building code. A
// mismatch means the profile would send something the panel's author never sent.
//
// --corpus walks a directory (recursively), reads every panel and program in it once (identical
// files are counted once), and prints one line per file and the totals. Every throw is caught: a
// converter that dies on panel 40 of 300 is the failure mode to design against.
// `tools/scripts/ctrlr-corpus.mjs` fetches the public panels this was measured on.
//
// NOTHING IS BUNDLED AND NOTHING IS FETCHED HERE. This converts files the user already has.
// Redistributing other people's panels is their decision, not the program's.
//
// LICENSING, since it always comes up: Ctrlr is GPLv3 and CEditor is AGPL-3.0 — compatible, and in
// the permissive direction. File formats are not copyrightable and this reimplements a reader
// rather than lifting code. A user-run converter distributes nothing.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const WEB = path.join(REPO, 'CE/web');
const APP = path.join(WEB, 'src/CE_Application');

// pathToFileURL, not a bare path: `await import('C:\\...')` is not a valid specifier on Windows,
// and this is a tool that has to run wherever the packaging does.
const load = (...parts) => import(pathToFileURL(path.join(...parts)).href);

const PANEL_FILE = /\.(panel|bpanel|bpanelz)$/i;
const PROGRAM_FILE = /\.(exe|dll|vst3|so|dylib|clap)$/i;

function parseArgs(argv) {
  const args = { file: '', profile: '', panel: '', corpus: '', verify: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--profile') { args.profile = argv[++i] ?? ''; continue; }
    if (arg === '--panel') { args.panel = argv[++i] ?? ''; continue; }
    if (arg === '--corpus') { args.corpus = argv[++i] ?? ''; continue; }
    if (arg === '--verify') { args.verify = true; continue; }
    if (!arg.startsWith('--') && !args.file) { args.file = arg; continue; }
  }
  return args;
}

async function stages() {
  const [read, harvest, reconstruct] = await Promise.all([
    load(APP, 'ctrlrImport/read.js'),
    load(APP, 'ctrlrImport/harvest.js'),
    load(APP, 'ctrlrImport/reconstruct.js'),
  ]);
  return { ...read, ...harvest, ...reconstruct };
}

/** The values a parameter is checked at: all of them up to 600, else both ends and a spread. */
function samples(min, max) {
  if (max - min <= 600) return Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const set = new Set([min, max, 0, 1, -1, -2]);
  for (let i = 0; i < 60; i += 1) { set.add(min + i); set.add(max - i); }
  for (let i = 0; i < 200; i += 1) set.add(min + Math.floor((((i * 7919) % 10007) / 10007) * (max - min)));
  return [...set].filter((v) => v >= min && v <= max).sort((a, b) => a - b);
}

const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');

/**
 * Every parameter of the harvested profile against Ctrlr's own bytes. Returns counts and the first
 * mismatch of each parameter that has one.
 */
async function verifyHarvest(read, harvest) {
  const { localCompileParameter, validateLocalProfileSource } = await load(APP, 'stores/deviceProfileLocalEngine.js');
  const { ctrlrMessages } = await load(WEB, 'test/support/ctrlrReference.js');
  const { componentValueList } = await load(APP, 'ctrlrImport/harvest.js');

  const result = { parameters: 0, values: 0, mismatches: [], invalid: '' };
  const { profile } = harvest;
  if (!profile.parameters.length) return result;
  const validation = validateLocalProfileSource(profile.id, JSON.stringify(profile));
  if (!validation.ok) result.invalid = JSON.stringify(validation.validation ?? validation.error).slice(0, 300);

  const modulatorOf = new Map([...harvest.parameterIdOf].map(([node, id]) => [id, node]));
  for (const parameter of profile.parameters) {
    result.parameters += 1;
    const modulator = modulatorOf.get(parameter.id);
    const component = (modulator.children ?? []).find((c) => c.name === 'component' || c.name === 'uiComponent');
    const listed = componentValueList(component).length;
    // A choice is checked at each choice; the Ctrlr control's value is its position in the list,
    // or, for a choice made from a plain range, the number itself.
    const pairs = parameter.type === 'choice'
      ? parameter.choices.map((choice, index) => [choice.id, listed ? index : Number(choice.label)])
      : samples(parameter.range.min, parameter.range.max)
        .filter((v) => !parameter.ui?.step || (v - parameter.range.min) % parameter.ui.step === 0)
        .map((v) => [v, v]);
    for (const [engineValue, ctrlrValue] of pairs) {
      result.values += 1;
      const compiled = localCompileParameter(profile, { parameterId: parameter.id, value: engineValue });
      const got = compiled.ok ? compiled.transaction.messages.flatMap((m) => m.bytes) : null;
      const want = ctrlrMessages(modulator, read.panel, ctrlrValue).flat();
      if (!got || got.join(',') !== want.join(',')) {
        result.mismatches.push({
          parameter: parameter.id,
          value: engineValue,
          got: got ? hex(got) : `does not compile: ${compiled.error}`,
          want: hex(want),
        });
        break;
      }
    }
  }
  return result;
}

function printVerify(check, indent = '') {
  console.log(`${indent}verify: ${check.values} value(s) of ${check.parameters} parameter(s) against Ctrlr's bytes, `
    + `${check.mismatches.length ? `${check.mismatches.length} parameter(s) DIFFER` : 'all identical'}`);
  if (check.invalid) console.log(`${indent}  the profile does not validate: ${check.invalid}`);
  for (const miss of check.mismatches) {
    console.log(`${indent}  ${miss.parameter} at ${miss.value}: profile sends ${miss.got}; Ctrlr sends ${miss.want}`);
  }
}

/**
 * Build a `.cepanel` from a reconstruction plan, with the builder the editor's File menu uses
 * (ctrlrImport/buildPanel.js), so the command line and the app make the same panel from one file.
 */
async function buildPanel(plan, options) {
  const { buildCtrlrPanel } = await load(APP, 'ctrlrImport/buildPanel.js');
  const { serializePanel } = await load(APP, 'stores/panelModel.js');
  return serializePanel(buildCtrlrPanel(plan, options));
}

function listFiles(directory, out = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) listFiles(full, out);
    else if (entry.isFile() && (PANEL_FILE.test(entry.name) || PROGRAM_FILE.test(entry.name))) out.push(full);
  }
  return out;
}

async function reportCorpus(directory, { verify }) {
  const { readCtrlrPanel, formatReport, harvestProfile } = await stages();
  const files = listFiles(directory).sort();
  if (files.length === 0) {
    console.log(`No Ctrlr panels or programs in ${directory}`);
    return 0;
  }

  const seen = new Set();
  const t = {
    files: 0, duplicates: 0, read: 0, refused: 0, programsWithout: 0, threw: 0,
    sending: 0, converted: 0, luaDriven: 0, silent: 0, parameters: 0, values: 0, differ: 0, invalid: 0,
  };
  const reasons = new Map();

  for (const file of files) {
    const label = path.relative(directory, file);
    let bytes;
    try { bytes = new Uint8Array(readFileSync(file)); } catch (error) { console.log(`${label}: unreadable — ${error.message}`); continue; }
    const digest = createHash('sha1').update(bytes).digest('hex');
    if (seen.has(digest)) { t.duplicates += 1; continue; }
    seen.add(digest);
    t.files += 1;

    let read;
    try {
      read = readCtrlrPanel(bytes);
    } catch (error) {
      t.threw += 1;
      console.log(`${label}: THREW while reading — ${error.message}`);
      continue;
    }
    if (!read.ok) {
      // A program that is not a Ctrlr export is not a failure of the reader.
      if (PROGRAM_FILE.test(file)) { t.programsWithout += 1; continue; }
      t.refused += 1;
      console.log(formatReport(read, label));
      continue;
    }
    t.read += 1;

    let harvest;
    try {
      harvest = harvestProfile(read);
    } catch (error) {
      t.threw += 1;
      console.log(`${label}: THREW while harvesting — ${error.message}`);
      continue;
    }
    const { report } = harvest;
    t.sending += report.sending;
    t.converted += report.converted;
    t.luaDriven += report.sendsFromLua.length;
    t.silent += report.silent;
    for (const flag of report.flagged) {
      const reason = flag.reason.replace(/"[^"]*"/g, '"…"').replace(/\d+/g, 'N');
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    }
    let line = `${label}: ${report.converted}/${report.sending} sending controls converted`
      + `${report.sendsFromLua.length ? `, ${report.sendsFromLua.length} sent by Lua` : ''}`;
    if (verify) {
      try {
        const check = await verifyHarvest(read, harvest);
        t.parameters += check.parameters;
        t.values += check.values;
        t.differ += check.mismatches.length;
        if (check.invalid) t.invalid += 1;
        if (check.values && !check.mismatches.length && !check.invalid) line += `, ${check.values} values identical`;
        console.log(line);
        if (check.mismatches.length || check.invalid) printVerify(check, '    ');
        continue;
      } catch (error) {
        t.threw += 1;
        console.log(`${line}\n    THREW while verifying — ${error.message}`);
        continue;
      }
    }
    console.log(line);
  }

  const share = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : '—');
  console.log('');
  console.log(`--- ${t.files} file(s) (${t.duplicates} duplicate(s) skipped): ${t.read} read, ${t.refused} refused, `
    + `${t.programsWithout} program(s) with no panel inside, ${t.threw} threw`);
  console.log(`--- ${t.converted} of ${t.sending} controls that send MIDI themselves became parameters (${share(t.converted, t.sending)}); `
    + `${t.luaDriven} more are sent by Lua; ${t.silent} send nothing`);
  if (verify) {
    console.log(`--- verify: ${t.values} value(s) of ${t.parameters} parameter(s); ${t.differ} parameter(s) differ from Ctrlr; `
      + `${t.invalid} profile(s) do not validate`);
  }
  if (reasons.size) {
    console.log('--- not converted, most common reasons:');
    for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
      console.log(`  ${String(count).padStart(6)}  ${reason}`);
    }
  }
  return t.refused || t.threw || t.differ || t.invalid ? 1 : 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.corpus) return reportCorpus(args.corpus, args);

  if (!args.file) {
    console.error('usage: ctrlr-import.mjs <file> [--profile out.json] [--panel out.cepanel] [--verify]');
    console.error('       ctrlr-import.mjs --corpus <directory> [--verify]');
    return 2;
  }

  const { readCtrlrPanel, formatReport, harvestProfile, planReconstruction } = await stages();
  const read = readCtrlrPanel(new Uint8Array(readFileSync(args.file)));
  console.log(formatReport(read, path.basename(args.file)));
  if (!read.ok) return 1;

  if (!args.profile && !args.panel && !args.verify) {
    console.log('\n(no --profile, --panel or --verify given, so nothing was converted)');
    return 0;
  }

  const harvest = harvestProfile(read);
  const { report } = harvest;
  console.log(`\nharvest: ${report.converted} of the ${report.sending} controls that send MIDI themselves became parameters`);
  if (report.sendsFromLua.length) console.log(`  ${report.sendsFromLua.length} control(s) are sent by Lua, which does not run here`);
  for (const flag of report.flagged) console.log(`  not converted  ${flag.name || flag.id}: ${flag.reason}`);
  for (const note of report.notes) console.log(`  note  ${note}`);

  let status = 0;
  if (args.verify) {
    const check = await verifyHarvest(read, harvest);
    printVerify(check);
    if (check.mismatches.length || check.invalid) status = 1;
  }

  if (args.profile) {
    mkdirSync(path.dirname(path.resolve(args.profile)), { recursive: true });
    writeFileSync(args.profile, `${JSON.stringify(harvest.profile, null, 2)}\n`, 'utf8');
    console.log(`wrote ${args.profile}`);
  }

  if (args.panel) {
    const hasProfile = harvest.profile.parameters.length > 0;
    const plan = planReconstruction(read, {
      profileId: hasProfile ? harvest.profile.id : '',
      parameterIdOf: hasProfile ? harvest.parameterIdOf : null,
      profile: hasProfile ? harvest.profile : null,
    });
    if (!plan.ok) { console.error(plan.error); return 1; }
    console.log(`\nreconstruct: ${plan.placed.length} placed, ${plan.skipped.length} left out, ${plan.unbound.length} not bound`);
    for (const skip of plan.skipped) console.log(`  left out   ${skip.name}: ${skip.reason}`);
    for (const loose of plan.unbound) console.log(`  not bound  ${loose.name}: ${loose.reason}`);
    for (const note of plan.notes) console.log(`  note       ${note}`);

    const text = await buildPanel(plan, {
      name: `${read.panel.name || path.basename(args.file).replace(/\.[^.]+$/, '')} (Ctrlr)`,
      width: read.panel.width,
      height: read.panel.height,
      profileId: hasProfile ? harvest.profile.id : '',
    });
    mkdirSync(path.dirname(path.resolve(args.panel)), { recursive: true });
    writeFileSync(args.panel, text, 'utf8');
    console.log(`wrote ${args.panel}`);
  }

  // Reported rather than translated: never silently half-translate a script. A converted panel
  // that looks right and behaves subtly wrong is worse than one that says plainly which methods
  // are not running.
  if (read.luaMethods.length) {
    console.log(`\nlua: ${read.luaMethods.length} method(s) kept as reference text, none running`);
    for (const method of read.luaMethods) {
      const uses = Object.entries(method.uses ?? {}).map(([hook, n]) => (n > 1 ? `${hook}×${n}` : hook));
      console.log(`  ${method.classification.padEnd(10)} ${method.name || '(unnamed)'}${uses.length ? `  [${uses.join(', ')}]` : ''}`);
    }
  }

  return status;
}

main().then((code) => { process.exitCode = code; }, (error) => {
  console.error(error.stack ?? String(error));
  process.exitCode = 1;
});
