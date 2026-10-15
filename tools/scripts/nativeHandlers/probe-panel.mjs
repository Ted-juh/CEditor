// probe-panel.mjs — a plug-in with a load handler in each compiled language, exported the way an
// installed CEditor exports one; for the release checks (.github/workflows/release-checks.yml).
//
//   node tools/scripts/nativeHandlers/probe-panel.mjs write   <out.cepanel>
//   node tools/scripts/nativeHandlers/probe-panel.mjs modules <probe.cepanel> <plug-in binary folder>
//   node tools/scripts/nativeHandlers/probe-panel.mjs check   <ceditor-player-scripts.log>
//
// `write` makes the payload: QA-08, which exports a host parameter for most control types, with
// its scripts replaced by one onPanelLoad handler per language, each setting a different parameter
// and logging that it ran. `modules` compiles them beside the built plug-in's binary with the
// exporter's own compileNativeHandlers. `check` reads the player's script log after a host has
// loaded the plug-in (pluginval, in the workflow) and fails unless every handler logged.
//
// Run by hand on Linux into a VST3 a host loaded, this is what found a C++ handler not exporting
// there at all; the verifiers, building modules their own way, had passed (cpp/moduleCommand.mjs).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportFormFor } from '../lib/exportDocument.mjs';
import { compileNativeHandlers } from './index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.resolve(HERE, '../../../CE/qa/QA-08-export.cepanel');
export const PRODUCT_NAME = 'NH Probe';

/** One load handler per language; each sets an exported parameter away from its default. */
export const PROBE_SCRIPTS = [
  { id: 'nh-cpp', name: 'C++ probe', language: 'cpp', event: 'onPanelLoad', enabled: true,
    source: 'void onPanelLoad(CeContext& ctx, const CeEvent&){ ctx.setValue("Level", 0.25); ctx.log("nh probe: cpp ran"); }' },
  { id: 'nh-cs', name: 'CSharp probe', language: 'csharp', event: 'onPanelLoad', enabled: true,
    source: 'void onPanelLoad(CeContext ctx, CeEvent e){ ctx.setValue("Expression", 100); ctx.log("nh probe: csharp ran"); }' },
  { id: 'nh-java', name: 'Java probe', language: 'java', event: 'onPanelLoad', enabled: true,
    source: 'void onPanelLoad(CeContext ctx, CeEvent e){ ctx.setValue("Filter Track", 4096); ctx.log("nh probe: java ran"); }' },
];

export async function probePanel() {
  const doc = await exportFormFor(JSON.parse(readFileSync(SOURCE, 'utf8')), SOURCE);
  return { ...doc, name: PRODUCT_NAME, scripts: PROBE_SCRIPTS };
}

/** The languages whose "ran" line the log has, from an instance of the probe. */
export function languagesThatRan(logText) {
  const ran = new Set();
  for (const line of String(logText).split(/\r?\n/)) {
    const match = /\[NH Probe [0-9a-f]{4}\]\s+\[script\] nh probe: (cpp|csharp|java) ran/.exec(line);
    if (match) ran.add(match[1]);
  }
  return ran;
}

async function main([mode, ...args]) {
  if (mode === 'write' && args[0]) {
    mkdirSync(path.dirname(path.resolve(args[0])), { recursive: true });
    writeFileSync(args[0], JSON.stringify(await probePanel()));
    console.log(`wrote ${args[0]}: ${PROBE_SCRIPTS.length} handlers (${PROBE_SCRIPTS.map((s) => s.language).join(', ')})`);
    return 0;
  }
  if (mode === 'modules' && args[0] && args[1]) {
    if (!existsSync(args[1])) { console.error(`no plug-in binary folder at ${args[1]}`); return 1; }
    const doc = JSON.parse(readFileSync(args[0], 'utf8'));
    const result = await compileNativeHandlers(doc, { binDir: args[1], workRoot: path.join(os.tmpdir(), 'ce-nh-probe') });
    const built = (result.built ?? []).map((b) => b.lang);
    const failed = (result.failed ?? []).map((f) => `${f.lang}: ${f.error}`);
    console.log(`built ${built.join(', ') || 'nothing'}${failed.length ? `; failed ${failed.join('; ')}` : ''}`);
    return built.length === PROBE_SCRIPTS.length && failed.length === 0 ? 0 : 1;
  }
  if (mode === 'check' && args[0]) {
    const ran = languagesThatRan(existsSync(args[0]) ? readFileSync(args[0], 'utf8') : '');
    for (const { language } of PROBE_SCRIPTS) console.log(`${ran.has(language) ? 'ran    ' : 'MISSING'} ${language}`);
    return PROBE_SCRIPTS.every(({ language }) => ran.has(language)) ? 0 : 1;
  }
  console.error('Usage: probe-panel.mjs write <out.cepanel> | modules <probe.cepanel> <binary folder> | check <log>');
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await main(process.argv.slice(2)));
}
