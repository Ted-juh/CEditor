// ctrlrImportActions.js — File → New Panel from Ctrlr Panel...
//
// A Ctrlr panel is a document, not a program (docs/design/ctrlr-import-plan.md), and the importer
// that translates one had been built and tested for months — behind a command line nobody using the
// editor would find. This is the same four stages (ctrlrImport/), run from the File menu:
//
//   S1  read     a .panel (XML), a .bpanelz or .bpanel (JUCE's binary tree), or a program or plug-in
//                Ctrlr exported, which carries its panel inside; what is in it, said in the Console
//   S2  harvest  its modulators as a device profile, saved into the engine as a new profile
//                (DeviceProfileService gives it a file of its own on its first save)
//   S3  rebuild  its components as controls on a new panel, bound to that profile's parameters
//   S4  Lua      reported, never run: each method's text goes into the panel's notes, to port by hand
//
// What could not be converted is said, not hidden: the notice counts it and the Console and the
// panel's "Ctrlr import" note list each thing and why. The new panel is unsaved until it is saved.

import { get } from 'svelte/store';

import { browseImage, isJuceAvailable, onFileData, onImageBrowsed, requestFileData } from '../bridge/bridge.js';
import { addPanel } from './panels.js';
import { cerror, cinfo, cwarn } from './console.js';
import { notify } from './scriptUi.js';
import { deviceProfiles, saveProfileSource } from './deviceProfiles.js';
import { formatReport, readCtrlrPanel } from '../ctrlrImport/read.js';
import { harvestProfile } from '../ctrlrImport/harvest.js';
import { planReconstruction } from '../ctrlrImport/reconstruct.js';
import { buildCtrlrPanel } from '../ctrlrImport/buildPanel.js';

// A Ctrlr-made program is tens of megabytes (the JD-990 Super Editor's is 57 MB).
const READ_TIMEOUT_MS = 180000;
const PANEL_FILE = /\.(panel|bpanelz|bpanel)$/i;
const PROGRAM_FILE = /\.(exe|dll|vst3|clap|so|component|vst|dylib|aaxplugin)$/i;
const REQUEST_PREFIX = 'ctrlrpanel_';

/** The panel's file name without its folder or ending. */
export function ctrlrBaseName(path) {
  return String(path ?? '').split(/[\\/]/).pop().replace(PANEL_FILE, '').replace(PROGRAM_FILE, '') || 'Ctrlr panel';
}

/** `wanted`, or `wanted-2`, `wanted-3`… — the first no loaded profile has. A re-import never writes over an earlier one. */
export function unusedProfileId(wanted, taken) {
  const have = new Set([...(taken ?? [])].map(String));
  if (!have.has(wanted)) return wanted;
  let n = 2;
  while (have.has(`${wanted}-${n}`)) n += 1;
  return `${wanted}-${n}`;
}

/** The "Ctrlr import" note: what came in and what did not, each with its reason. */
export function importReportNote(fileName, { harvest, plan }) {
  const lines = [`Imported from ${fileName}.`, ''];
  if (harvest?.ok) {
    const { report } = harvest;
    lines.push(`Device profile: ${report.converted} of the ${report.sending} controls that send MIDI themselves became parameters of "${harvest.profile.name}" (${harvest.profile.id}), each checked to send what Ctrlr sends.`);
    if (report.sendsFromLua.length) lines.push(`${report.sendsFromLua.length} control(s) send nothing of their own: Lua sends for them when they change (Ctrlr Lua note), and none of that runs here yet.`);
    if (report.silent) lines.push(`${report.silent} component(s) send nothing at all: labels, groups, pictures.`);
    for (const flag of report.flagged) lines.push(`- not converted: ${flag.name || flag.id} — ${flag.reason}`);
    for (const note of report.notes) lines.push(`- note: ${note}`);
  } else {
    lines.push(`No device profile: ${harvest?.error ?? 'nothing to harvest'}.`);
  }
  lines.push('', `Controls: ${plan.placed.length} placed, ${plan.skipped.length} left out.`);
  for (const skip of plan.skipped) lines.push(`- left out: ${skip.name} — ${skip.reason}`);
  for (const loose of plan.unbound) lines.push(`- not bound: ${loose.name} — ${loose.reason}`);
  if (plan.notes.length) lines.push('', ...plan.notes);
  return { name: 'Ctrlr import', content: lines.join('\n') };
}

/** The panel's Lua, as a note to port from: none of it runs here. */
export function luaNote(luaMethods) {
  if (!luaMethods?.length) return null;
  const parts = [
    `${luaMethods.length} Lua method(s) from the Ctrlr panel. None of them runs in CEditor: port what you need to a panel script.`,
    'shimmable: value and MIDI logic that maps onto ce.* · port: panel orchestration · paint: drawing, which has no mapping',
  ];
  for (const method of luaMethods) {
    const uses = Object.entries(method.uses ?? {}).map(([hook, count]) => (count > 1 ? `${hook} ×${count}` : hook));
    parts.push('', `-- ${method.name || '(unnamed)'} [${method.classification}]${uses.length ? ` called by: ${uses.join(', ')}` : ''}`, String(method.source ?? '').trim());
  }
  return { name: 'Ctrlr Lua', content: parts.join('\n') };
}

/**
 * Build and open a panel from a Ctrlr panel file's bytes. Returns `{ panel, profileId }`, or null
 * with the reason already reported. `saveProfile` is how the harvested profile reaches the engine.
 */
export async function importCtrlrPanelBytes(bytes, fileName = '', { saveProfile = saveProfileSource } = {}) {
  const label = String(fileName ?? '').split(/[\\/]/).pop() || 'the Ctrlr panel';
  const read = readCtrlrPanel(bytes);
  for (const line of formatReport(read, label).split('\n')) cinfo(`[ctrlr import] ${line}`);
  if (!read.ok) {
    for (const attempt of read.attempts ?? []) cwarn(`[ctrlr import]   tried ${attempt}`);
    cerror('[ctrlr import]', read.error);
    notify(`${label}: ${read.error}`, { kind: 'error', duration: 0 });
    return null;
  }

  // S2: the profile. Its own id when nothing has it, so a re-import never replaces a profile the
  // author may have edited since.
  const first = harvestProfile(read);
  const taken = (get(deviceProfiles) ?? []).map((profile) => profile?.id);
  const harvest = first.ok ? harvestProfile(read, { id: unusedProfileId(first.profile.id, taken) }) : first;
  let profileId = '';
  if (harvest.ok && harvest.profile.parameters.length) {
    profileId = harvest.profile.id;
    saveProfile(profileId, JSON.stringify(harvest.profile, null, 2), `ctrlr_profile_${profileId}`);
    cinfo(`[ctrlr import] device profile "${harvest.profile.name}" (${profileId}): ${harvest.report.converted} of ${harvest.report.sending} sending controls became parameters`);
  } else if (harvest.ok) {
    cwarn('[ctrlr import] no modulator converted to a parameter, so no device profile was made');
  }
  for (const flag of harvest.ok ? harvest.report.flagged : []) cwarn(`[ctrlr import]   not converted: ${flag.name || flag.id} — ${flag.reason}`);

  // S3: the panel, each control bound to the parameter its own modulator became.
  const plan = planReconstruction(read, {
    profileId,
    parameterIdOf: profileId ? harvest.parameterIdOf : null,
    profile: profileId ? harvest.profile : null,
  });
  if (!plan.ok) {
    cerror('[ctrlr import]', plan.error);
    notify(`${label}: ${plan.error}`, { kind: 'error', duration: 0 });
    return null;
  }
  const panel = buildCtrlrPanel(plan, {
    name: `${read.panel.name || ctrlrBaseName(fileName)} (Ctrlr)`,
    width: read.panel.width,
    height: read.panel.height,
    profileId,
  });
  // S4 and the report, where the author will look for them next week: the panel's own notes.
  panel.notepad = {
    notes: [importReportNote(label, { harvest, plan }), luaNote(read.luaMethods)].filter(Boolean),
    activeNoteIndex: 0,
  };
  // New and never saved: closing it or quitting asks.
  panel.modified = true;
  addPanel(panel);

  for (const skip of plan.skipped) cwarn(`[ctrlr import]   left out: ${skip.name} — ${skip.reason}`);
  for (const loose of plan.unbound) cwarn(`[ctrlr import]   not bound: ${loose.name} — ${loose.reason}`);
  for (const note of plan.notes) cinfo(`[ctrlr import]   ${note}`);
  if (read.luaMethods.length) cinfo(`[ctrlr import] ${read.luaMethods.length} Lua method(s) kept in the panel's notes, none running`);

  const gaps = plan.skipped.length + plan.unbound.length + (harvest.ok ? harvest.report.flagged.length : 0);
  notify(
    `"${panel.name}": ${panel.controls.length} control(s)${profileId ? `, bound to a new device profile with ${harvest.profile.parameters.length} parameter(s)` : ''}.`
      + (gaps || read.luaMethods.length
        ? ` Not everything converts: the panel's notes (Ctrlr import${read.luaMethods.length ? ', Ctrlr Lua' : ''}) say what and why.`
        : ''),
    { kind: gaps ? 'warn' : 'info', duration: gaps ? 0 : 6000 },
  );
  return { panel, profileId };
}

// --- Choosing the file ---------------------------------------------------------------------------

let requestCounter = 0;
let pendingBrowse = null;
const pendingReads = new Map();
let listenersReady = false;

function bytesFromDataUrl(dataUrl) {
  const comma = String(dataUrl ?? '').indexOf(',');
  if (comma < 0) return new Uint8Array(0);
  return Uint8Array.from(atob(String(dataUrl).slice(comma + 1)), (c) => c.charCodeAt(0));
}

function readBytes(filePath) {
  return new Promise((resolve, reject) => {
    const requestId = `${REQUEST_PREFIX}${++requestCounter}`;
    const timer = setTimeout(() => { pendingReads.delete(requestId); reject(new Error(`Timed out reading ${filePath}`)); }, READ_TIMEOUT_MS);
    pendingReads.set(requestId, { resolve, reject, timer });
    requestFileData(requestId, filePath);
  });
}

function ensureListeners() {
  if (listenersReady) return;
  listenersReady = true;
  onImageBrowsed(async (payload) => {
    if (!pendingBrowse || payload?.requestId !== pendingBrowse.requestId) return;
    pendingBrowse = null;
    const filePath = String(payload?.filePath ?? '').trim();
    if (!filePath) return;
    if (!PANEL_FILE.test(filePath) && !PROGRAM_FILE.test(filePath)) {
      notify('Choose a Ctrlr panel (.panel, .bpanelz, .bpanel), or a program or plug-in made with Ctrlr.', { kind: 'warn' });
      return;
    }
    try {
      await importCtrlrPanelBytes(await readBytes(filePath), filePath);
    } catch (error) {
      cerror('[ctrlr import] Could not read', filePath, '—', error.message);
      notify('Could not read the Ctrlr panel.', { kind: 'error', duration: 0 });
    }
  });
  onFileData((payload) => {
    const pending = pendingReads.get(payload?.requestId);
    if (!pending) return;
    pendingReads.delete(payload.requestId);
    clearTimeout(pending.timer);
    if (!payload?.data) pending.reject(new Error(payload?.error || 'The file was empty or could not be read'));
    else pending.resolve(bytesFromDataUrl(payload.data));
  });
}

/** File → New Panel from Ctrlr Panel...: the app's own dialog, or the browser's. */
export function newPanelFromCtrlrPanel() {
  if (!isJuceAvailable()) {
    if (typeof window === 'undefined' || !window.document) return;
    const input = window.document.createElement('input');
    input.type = 'file';
    input.accept = '.panel,.bpanelz,.bpanel,.exe,.dll,.vst3,.clap,.so,.component,.vst,.dylib';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) await importCtrlrPanelBytes(new Uint8Array(await file.arrayBuffer()), file.name);
    };
    input.click();
    return;
  }
  ensureListeners();
  pendingBrowse = { requestId: `${REQUEST_PREFIX}browse_${++requestCounter}` };
  browseImage(pendingBrowse.requestId, {
    patterns: '*.panel;*.bpanelz;*.bpanel;*.exe;*.dll;*.vst3;*.clap;*.so;*.component;*.vst;*.dylib',
    title: 'Ctrlr panel, or a program or plug-in made with Ctrlr',
  });
}
