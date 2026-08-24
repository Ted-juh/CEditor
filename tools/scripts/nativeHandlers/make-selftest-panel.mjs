// make-selftest-panel.mjs — generate selftest.cepanel: a panel with one onPanelReady handler in EVERY
// language. Each handler, when it runs window-closed in the shipped plugin, sends a UNIQUE MIDI CC and
// sets a status value + logs. So in a DAW you route the plugin's MIDI out to a monitor, load the panel,
// and SEE which CCs arrive — that's exactly which language runtimes are working in the shipped plugin.
//
//   CC 20 lua · 21 javascript · 22 typescript · 23 python · 24 cpp · 25 csharp · 26 java   (all value 127)
//
// Export it with compileNativeHandlers='auto'/'on' (C++/C#/Java) + embedPython='on' (Python) to exercise
// every engine. Run:
//   node tools/scripts/nativeHandlers/make-selftest-panel.mjs [outFile]
//   node tools/scripts/nativeHandlers/make-selftest-panel.mjs --check   (fail if the committed copy is stale)
//
// THE COMMITTED COPY DRIFTED, and the reason it could is worth writing down. `createPanel` mints a
// random `panelGuid` on every call, so a freshness test comparing the file to a fresh build would
// have failed on every run — nobody wrote one, and the file quietly fell behind the model by several
// fields (exportClap, exportLv2, restoreHardware, panicShortcut, guides, layers).
//
// So the GUID is pinned below, which is not a testing hack: a fixture that mints a NEW plugin
// identity every time it is regenerated is wrong on its own terms. Re-exporting the self-test should
// update the same plugin, not spawn another one in the DAW and leave the old one orphaned — that is
// what the identity registry (utils/guidRegistry.js) exists to prevent, and this file was the one
// place deliberately violating it.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPanel, serializePanel } from '../../../CE/web/src/CE_Application/stores/panelModel.js';
import { createScript } from '../../../CE/web/src/CE_Application/scripting/scriptModel.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');

// per-language: [ccNumber, source]. set/log are globals in Lua/JS/Python; ctx.* methods in C++/C#/Java.
const LANGS = {
  lua: [20, `function onPanelReady(info)
  sendCC(1, 20, 127)
  set("selftest.lua", 1)
  log("lua ok")
end`],
  javascript: [21, `function onPanelReady(info) {
  sendCC(1, 21, 127);
  set("selftest.javascript", 1);
  log("javascript ok");
}`],
  typescript: [22, `function onPanelReady(info: any): void {
  sendCC(1, 22, 127);
  set("selftest.typescript", 1);
  log("typescript ok");
}`],
  python: [23, `def onPanelReady(info):
    sendCC(1, 23, 127)
    set("selftest.python", 1)
    log("python ok")`],
  cpp: [24, `void onPanelReady(CeContext& ctx, const CeEvent& event) {
  ctx.sendCC(1, 24, 127);
  ctx.setValue("selftest.cpp", 1);
  ctx.log("cpp ok");
}`],
  csharp: [25, `void onPanelReady(CeContext ctx, CeEvent e) {
  ctx.sendCC(1, 25, 127);
  ctx.setValue("selftest.csharp", 1);
  ctx.log("csharp ok");
}`],
  java: [26, `void onPanelReady(CeContext ctx, CeEvent e) {
  ctx.sendCC(1, 26, 127);
  ctx.setValue("selftest.java", 1);
  ctx.log("java ok");
}`],
};

/**
 * The self-test's plugin identity, fixed.
 *
 * Reads as "selftest" in hex, which is the point: an obviously synthetic id nobody will mistake for
 * one the registry minted. Never change it — a new value orphans every copy of this plugin already
 * installed in somebody's DAW.
 */
const SELFTEST_GUID = '5e1f7e57-c0de-4000-8000-000000000001';

const panel = createPanel('CEditor Self-Test');
panel.panelGuid = SELFTEST_GUID;
panel.scripts = Object.entries(LANGS).map(([lang, [, source]]) =>
  createScript({ id: `st_${lang}`, name: `selftest ${lang}`, language: lang, source, event: 'onPanelReady', scope: 'panel', target: '*' }));
// Make the export exercise every engine.
panel.exportSettings = { ...panel.exportSettings, compileNativeHandlers: 'on', embedPython: 'on' };
panel.scripting = { enabled: true, runInPreview: true, runOnExport: true };

/** What the committed file should contain. Exported so a test can compare without shelling out. */
export function serializeSelftestPanel() {
  const json = serializePanel(panel);
  return typeof json === 'string' ? json : JSON.stringify(json, null, 2);
}

export const SELFTEST_PATH = path.join(REPO, 'tools/scripts/nativeHandlers/selftest.cepanel');
export const SELFTEST_LANGUAGES = Object.keys(LANGS);

function main() {
  const args = process.argv.slice(2);
  const json = serializeSelftestPanel();
  const out = path.resolve(REPO, args.find((a) => !a.startsWith('--')) ?? SELFTEST_PATH);

  if (args.includes('--check')) {
    let current = null;
    try { current = readFileSync(out, 'utf8'); } catch { /* missing counts as stale */ }
    if (current === json) { console.log('selftest.cepanel is up to date.'); return; }
    console.error(`Stale: ${path.relative(REPO, out)} — run: node tools/scripts/nativeHandlers/make-selftest-panel.mjs`);
    process.exitCode = 1;
    return;
  }

  writeFileSync(out, json);
  console.log(`Wrote ${out}`);
  console.log('Languages:', SELFTEST_LANGUAGES.join(', '));
  console.log('Export it, route the plugin MIDI out to a monitor, load it — each working language sends its CC (20..26).');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
