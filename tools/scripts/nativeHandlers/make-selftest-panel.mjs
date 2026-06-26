// make-selftest-panel.mjs — generate selftest.cepanel: a panel with one onPanelReady handler in EVERY
// language. Each handler, when it runs window-closed in the shipped plugin, sends a UNIQUE MIDI CC and
// sets a status value + logs. So in a DAW you route the plugin's MIDI out to a monitor, load the panel,
// and SEE which CCs arrive — that's exactly which language runtimes are working in the shipped plugin.
//
//   CC 20 lua · 21 javascript · 22 typescript · 23 python · 24 cpp · 25 csharp · 26 java   (all value 127)
//
// Export it with compileNativeHandlers='auto'/'on' (C++/C#/Java) + embedPython='on' (Python) to exercise
// every engine. Run:  node tools/scripts/nativeHandlers/make-selftest-panel.mjs [outFile]
import { writeFileSync } from 'node:fs';
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

const panel = createPanel('CEditor Self-Test');
panel.scripts = Object.entries(LANGS).map(([lang, [, source]]) =>
  createScript({ id: `st_${lang}`, name: `selftest ${lang}`, language: lang, source, event: 'onPanelReady', scope: 'panel', target: '*' }));
// Make the export exercise every engine.
panel.exportSettings = { ...panel.exportSettings, compileNativeHandlers: 'on', embedPython: 'on' };
panel.scripting = { enabled: true, runInPreview: true, runOnExport: true };

const out = process.argv[2] || path.join(REPO, 'tools/scripts/nativeHandlers/selftest.cepanel');
const json = serializePanel(panel);
writeFileSync(out, typeof json === 'string' ? json : JSON.stringify(json, null, 2));
console.log(`Wrote ${out}`);
console.log('Languages:', Object.keys(LANGS).join(', '));
console.log('Export it, route the plugin MIDI out to a monitor, load it — each working language sends its CC (20..26).');
