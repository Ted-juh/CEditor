import { get } from 'svelte/store';
import { defaultControlSetId, defaultGridSize, defaultSnapToGrid } from './runtimePreferences.js';
import { normalizeProjectDeviceSession } from './projectDeviceSession.js';
import { normalizeCaptureSession } from '../utils/captureSession.js';
import { collectExportParameters } from '../utils/exportParameters.js';
import { expandAuthoredParts, expandControls, exportDefaultsFor, shrinkAuthoredParts, shrinkControl } from './documentShape.js';
import { panelDocumentText } from './documentLayout.js';
import { shareDrawings } from './documentDrawings.js';
import { ENTRY_BASELINES, shrinkEntries } from './documentEntries.js';
import { normalizePanelLayers } from '../utils/panelLayers.js';
import { panelDefaults } from '../models/panelDefaults.js';
import { repairGaiaNoteChoices } from '../utils/gaiaNoteChoiceMigration.js';
import { controlSetLibrary } from './controlSetLibraryStore.js';
import { newPanelControlSet, normalizeControlSet, normalizeControlSetList, serializeControlSet } from '../models/controlSets.js';
import { resolveControlForSet } from '../models/controlSetFamilies.js';
import { dedupeSnapshotIds } from '../utils/snapshotModel.js';
import { PANEL_FORMAT_VERSION, panelFormatVersion, readPanelDocument } from '../utils/panelFormat.js';

let nextId = 1;

/**
 * Stable, document-scoped GUID — the source of a panel's exported plugin identity (VST3 FUID /
 * AU subtype / CLAP id, mirrored in C++ PanelExportIdentity). Persisted in the .cepanel so the
 * same panel always exports to the same plugin slot (the Ctrlr "identical FUID" fix). Distinct
 * from the in-memory numeric `id`, which is not stable across sessions.
 */
export function makeGuid() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch { /* fall through to the manual generator */ }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function createPanel(name = null) {
  const id = nextId++;
  // The user's default set (Settings → Control Sets), which may be one of their own; see
  // newPanelControlSet for why a library default arrives already carried in the document.
  const startingSet = newPanelControlSet(get(defaultControlSetId), get(controlSetLibrary));

  return panelDefaults({
    id,
    panelGuid: makeGuid(),
    name,
    gridSize: get(defaultGridSize),
    snapToGrid: get(defaultSnapToGrid),
    controlSet: startingSet.controlSet,
    controlSets: startingSet.controlSets,
  });
}

export function uniquePanelPaths(paths) {
  const unique = [];
  const seen = new Set();

  for (const rawPath of paths ?? []) {
    const path = String(rawPath ?? '').trim();
    if (!path || seen.has(path)) continue;
    seen.add(path);
    unique.push(path);
  }

  return unique;
}

/** Controls a script generated carry Core.generatedBy. They are a product of onPanelBuild, not a
 *  part of the document, so saving must not persist them — otherwise every open-and-save doubles
 *  the layout in the file, and the author's panel slowly fills with something they never drew.
 *  The build regenerates them on load; that is the whole contract (design doc §13). */
function stripGeneratedControls(controls) {
  return (controls ?? [])
    .filter((c) => c?._children?.Core?.generatedBy == null)
    .map((c) => {
      const kids = c?._children?.Children?._children;
      if (!kids) return c;
      const kept = Object.fromEntries(
        Object.entries(kids).filter(([, child]) => child?._children?.Core?.generatedBy == null)
          .map(([key, child]) => [key, stripGeneratedControls([child])[0] ?? child]),
      );
      return { ...c, _children: { ...c._children, Children: { ...c._children.Children, _children: kept } } };
    });
}

/**
 * Shrink a control to the form the document stores: a diff against the pristine control of the
 * same type, and the entries of its lists, which the pristine has nothing under, a diff against
 * their own baselines. See documentShape.js and documentEntries.js — this is one line here because
 * the interesting half is the inverse, and the two have to stay exact inverses. The export payload
 * is this form too (exportFormDocument), and carries what both halves are against.
 */
function toDocumentForm(control, usedBaselines = null) {
  return shrinkEntries(shrinkControl(control), usedBaselines);
}

/**
 * The export payload in the form a plug-in is built from: its controls as a diff against their
 * types and the entries of their lists as a diff against their baselines, like a saved document's,
 * carrying the defaults both are against (`controlDefaults`), marked `documentForm: 'export'`.
 *
 * The payload used to be complete, every field of every control written out, because the plug-in's
 * C++ reads controls raw and could not rebuild a default it never saw. GAIA's came to 12.2 MB, the
 * same panel saved is 3.0 MB, and the difference was the same defaults again for each of its 818
 * controls. Now the payload brings them once, per type, and the C++ rebuilds each control from them
 * as it loads (Player/PanelValueModel.h), sharing them rather than copying. A drawing several
 * controls share goes once too, as in a saved document (documentDrawings.js): 1.8 MB for GAIA. And
 * an entry of a control's lists (a binding, a grab area, a value channel, a choice) is written as
 * what it changes from its baseline, and the baselines its entries were written against travel as
 * `controlDefaults.entries`, from which the C++ and the player page put them back (documentEntries.js):
 * GAIA's payload went from 1.72 MB to 1.49, AN1x's from 1.93 to 1.44. `entries` is there, if empty,
 * in every payload written this way; a payload without it has its entries whole.
 *
 * It takes the COMPLETE document serializePanelForExport writes, and it is the last thing done to
 * one: everything before it in an export reads whole controls (the host parameter list, the fonts a
 * panel carries and the characters they are cut to). A complete control still knows what its author
 * deleted, which a diff has to record; only its authored parts travel sparse in that form, and they
 * are made whole again first, so they are diffed from what they are rather than from a diff.
 */
export function exportFormDocument(doc) {
  if (doc?.documentForm === 'export') return doc;
  if (doc?.documentForm !== 'complete') {
    throw new Error('exportFormDocument takes the complete document serializePanelForExport writes');
  }
  const whole = (doc.controls ?? []).map(expandAuthoredParts);
  // A drawing more than one control uses goes once, as in a saved document (documentDrawings.js).
  const used = new Set();
  const { controls, drawings } = shareDrawings(whole.map((control) => toDocumentForm(control, used)));
  const entries = Object.fromEntries(Object.entries(ENTRY_BASELINES).filter(([section]) => used.has(section)));
  const controlDefaults = { ...exportDefaultsFor(whole), entries };
  return { ...doc, documentForm: 'export', controls, ...(drawings ? { drawings } : {}), controlDefaults };
}

/**
 * Card presets as read off a document: an array of entries with an id, deduplicated. Anything
 * else in the field is dropped rather than repaired — a preset with no id cannot be merged,
 * applied or deleted, so keeping it would only mean carrying it forward for ever.
 */
export function normalizeCardPresets(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const preset of value) {
    if (!preset || typeof preset !== 'object' || Array.isArray(preset)) continue;
    const id = preset.id;
    if (typeof id !== 'string' || !id || seen.has(id)) continue;
    seen.add(id);
    out.push(preset);
  }
  return out;
}

/** `Untitled 7` and friends — a stand-in the app invented, not a name anyone chose. */
const PLACEHOLDER_PANEL_NAME = /^Untitled \d+$/;

/** `C:\dev\x\qa-beta-smoke.cepanel` -> `qa-beta-smoke`. Handles both separators. */
function panelNameFromPath(filePath) {
  const leaf = String(filePath ?? '').split(/[\\/]/).pop() ?? '';
  return leaf.replace(/\.cepanel$/i, '').trim();
}

/**
 * @param {object} panel
 * @param {object} [options]
 * @param {boolean} [options.elide=true]  Write controls as a diff against their type's defaults.
 *   Turn it OFF for a document that leaves the editor. The exported plugin parses the .cepanel in
 *   C++ (Player/PanelValueModel.h walks controls[] and reads Core, Behavior and Scripts straight
 *   off it), and that reader has no way to reconstruct a default it never saw. So the authoring
 *   document is compact and the export payload is complete, and the split is explicit rather than
 *   something the exporter has to remember. Complete except for authored parts (every part of a
 *   custom component, and any added to a built-in control), which no C++ reads and the player
 *   page expands on load: they go out as a saved document has them (shrinkAuthoredParts in
 *   documentShape.js says why, and what it costs).
 */
export function serializePanel(panel, options = {}) {
  const { id, modified, ...data } = panel;
  const elide = options.elide !== false;
  // Generated controls come out first (they are regenerated on load), then what remains is
  // written as a diff against each type's defaults — unless this document is leaving the editor.
  const controls = stripGeneratedControls(data.controls);
  // A build payload wants literals: the player has no business looking up tokens per frame, and
  // the exported plugin's reader has never heard of a set. `bakeControlSet` names the set to
  // resolve against. A saved .cepanel passes none and keeps its references and its `controlSet`,
  // which is what lets the set be switched later.
  const baked = options.bakeControlSet
    ? controls.map((control) => resolveControlForSet(control, options.bakeControlSet))
    : controls;
  data.controls = elide ? baked.map((control) => toDocumentForm(control)) : baked.map(shrinkAuthoredParts);
  // A saved document writes each drawing more than one control uses once, beside the controls
  // (documentDrawings.js). The complete form keeps every control's own: it is the step before the
  // export form, which does the same to its controls once they are a diff again.
  const shared = elide ? shareDrawings(data.controls) : { controls: data.controls, drawings: null };
  data.controls = shared.controls;

  // Panel identity. deserializePanel prefers the name the host derives from the filename, so a
  // stale `name` in the document is invisible in the app and only shows up when someone reads the
  // file — which is how it was found: a panel saved as qa-beta-smoke.cepanel still said
  // "Untitled 2" inside, because Save As serialises before the dialog has returned a path.
  //
  // Two cases, so the field is either right or absent, never misleading:
  //   - the panel has a file: the file IS the name, so write that
  //   - it does not, and is still carrying an invented "Untitled N": write nothing, and let
  //     whoever opens it name it from wherever it ended up
  // A name the author actually typed is always kept.
  const fromPath = panelNameFromPath(data.filePath);
  if (fromPath) {
    data.name = fromPath;
  } else if (PLACEHOLDER_PANEL_NAME.test(String(data.name ?? ''))) {
    delete data.name;
  }
  const deviceSession = options.deviceSession ?? data.deviceSession;
  if (deviceSession) data.deviceSession = normalizeProjectDeviceSession(deviceSession);
  else delete data.deviceSession;

  // An in-progress capture, on the same "right or absent" rule. It lives on the panel so a session
  // survives whatever the panel survives and travels between machines with the file — the owner's
  // call, made knowing a shared .cepanel then carries a half-finished capture and the raw dumps it
  // took off somebody's synth.
  //
  // NOT in the build payload: `serializePanelForExport` passes `captureSession: null`. The exported
  // plugin's C++ reads Core, Behavior and Scripts and has no idea what a capture is, so including
  // one would compile a few tens of KB of somebody's SysEx into a binary for nothing.
  const captureSession = options.captureSession === null
    ? null
    : (options.captureSession ?? data.captureSession);
  if (captureSession) data.captureSession = captureSession;
  else delete data.captureSession;

  // Card presets, on the same "right or absent" rule as `name` and `deviceSession` above: a panel
  // that defines none writes no key, so a document saved before presets travelled round-trips
  // byte-identical and the committed .cepanel fixtures do not all grow an empty array. The key
  // appears the moment there is a preset worth carrying.
  const cardPresets = normalizeCardPresets(data.cardPresets);
  if (cardPresets.length) data.cardPresets = cardPresets;
  else delete data.cardPresets;

  // The control set, same rule: a panel on the default set writes no key, so every document
  // written before sets existed round-trips byte-identical, and a reader never has to tell "no
  // set" from "the default set". An id this build does not know is written as it was read.
  const controlSet = serializeControlSet(data.controlSet);
  if (controlSet) data.controlSet = controlSet;
  else delete data.controlSet;

  // The sets the document carries, same rule: present only when there is at least one.
  const controlSets = normalizeControlSetList(data.controlSets);
  if (controlSets.length) data.controlSets = controlSets;
  else delete data.controlSets;

  // The program bank, on the same "right or absent" rule as `name` and `cardPresets`: a panel with
  // no bank writes no key, so every committed .cepanel does not grow a `"programBank": null` and
  // the plugin's reader never has to tell "no bank" from "an empty one".
  if (!data.programBank || !Array.isArray(data.programBank.programs) || data.programBank.programs.length === 0) {
    delete data.programBank;
  }

  // Snapshots, same rule. An empty array on every panel would be noise in every committed fixture.
  if (!Array.isArray(data.snapshots) || data.snapshots.length === 0) delete data.snapshots;

  // Routes, same rule. Only the panel's OWN routes are stored — the ones derived from Macro slots
  // and Router destinations are a view, and writing them here would give the panel a stale second
  // copy of something the component already owns.
  if (!Array.isArray(data.routes) || data.routes.length === 0) delete data.routes;

  // The panel key, on the "right or absent" rule: a panel where nothing follows it writes no key,
  // so a reader never has to tell "no panel key" from "a panel key nobody uses".
  if (!data.musicalContext) delete data.musicalContext;

  // Bake the host-automatable parameter list (M2) so the exported plugin's APVTS can read it.
  // Author-defined `exportParameters` are kept as-is; an empty list is derived from the controls.
  if (!Array.isArray(data.exportParameters) || data.exportParameters.length === 0) {
    data.exportParameters = collectExportParameters(panel);
  }

  // The format version goes first, where a person opening the file sees it. A document from a
  // newer CEditor keeps its number: writing ours would tell that newer version to run its
  // migrations again over a document that already had them (utils/panelFormat.js).
  // A complete document says so. It is the step before the export payload (exportFormDocument
  // above), which needs controls that still know what their author deleted, and the exporters read
  // a document in any form (tools/scripts/lib/exportDocument.mjs). The mark is how they tell, where
  // no structural test can: a default item the author deleted is simply absent from both forms.
  //
  // Laid out one line per control section, not one per property (stores/documentLayout.js).
  //
  // The drawings table goes right after the controls that refer to it. A document from a newer
  // CEditor brought its own table, which goes back with this one's shares over it
  // (resolveDrawings' keepTable); a saved document only, since the complete form shares nothing.
  const { formatVersion, documentForm, controlDefaults, drawings: carried, ...rest } = data;
  const kept = carried && typeof carried === 'object' && !Array.isArray(carried) ? carried : null;
  const table = elide && (kept || shared.drawings) ? { ...kept, ...shared.drawings } : null;
  const doc = {
    formatVersion: Math.max(PANEL_FORMAT_VERSION, panelFormatVersion({ formatVersion })),
    ...(elide ? {} : { documentForm: 'complete' }),
  };
  for (const [key, value] of Object.entries(rest)) {
    doc[key] = value;
    if (key === 'controls' && table) doc.drawings = table;
  }
  return panelDocumentText(doc);
}

// What the last deserializePanel call had to say, for the caller to show: why a document was
// refused (`error`), or what a person should know about one that opened (`warnings`, such as a
// panel from a newer CEditor). A side channel rather than a return value because three callers
// take the panel-or-null contract and only the editor's open path reports anything.
let lastOpenReport = { error: null, warnings: [] };
export function panelOpenReport() {
  return lastOpenReport;
}

/**
 * A document's panel-level fields, normalised as opening the document normalises them: the ones
 * the editor does not take as written. Everything else is taken as it is. `controls` are the panel's
 * expanded controls, which the layer list is checked against. Opening a file uses it, and so does
 * the panel file view when its panel settings are applied (stores/panelFileText.js), so a setting
 * typed there is read exactly as the same setting in a file would be.
 *
 * `captureSession` is present when the document has one, and undefined when that one makes no sense:
 * the caller drops it then.
 */
export function panelFieldsFromDocument(data, controls) {
  const fields = {
    // A document written before presets travelled has no `cardPresets` key, and one written by
    // hand can have anything at all in it. Normalising here means every reader downstream can
    // assume an array of {id,…} and the merge in stores/cardPresets.js never has to defend
    // itself against a string or a null.
    cardPresets: normalizeCardPresets(data.cardPresets),
    controlSet: normalizeControlSet(data.controlSet),
    controlSets: normalizeControlSetList(data.controlSets),
    snapshots: dedupeSnapshotIds(data.snapshots),
    // Migration lives here rather than in a version bump: a document with no `layers` gets one
    // built from first-appearance order, which is exactly what rendering used to infer, so it
    // looks identical on the first load and stops restacking on every load after it.
    layers: normalizePanelLayers(data.layers, controls),
  };
  if (data.deviceSession) fields.deviceSession = normalizeProjectDeviceSession(data.deviceSession);
  // Coerced rather than trusted: everything downstream indexes into `baselines` as arrays of byte
  // arrays, and a document can be hand-edited. `normalizeCaptureSession` returns null for anything
  // it cannot make sense of, and for an empty session, which then reads as no session at all.
  if (data.captureSession) fields.captureSession = normalizeCaptureSession(data.captureSession) ?? undefined;
  return fields;
}

/**
 * Returns the panel object, or null if the document is corrupted / not a valid panel; then
 * panelOpenReport().error says why. The document is checked against utils/panelDocumentSchema.js
 * and upgraded to the current format version on the way in (utils/panelFormat.js).
 */
export function deserializePanel(json, filePath, name) {
  const read = readPanelDocument(json);
  lastOpenReport = { error: read.error, warnings: read.migration?.warnings ?? [] };
  if (!read.doc) {
    console.error(`[panels] Cannot open panel${filePath ? ` "${filePath}"` : ''} — ${read.error}`);
    return null;
  }
  for (const warning of lastOpenReport.warnings) console.warn(`[panels] ${warning}`);
  const data = read.doc;
  // An export payload (exportFormDocument) carries the defaults its controls are a diff against, for
  // the plug-in's C++. expandControl below has its own, from the same code, so they are dropped
  // rather than kept in the panel and written into a document that has no use for them.
  delete data.controlDefaults;
  const id = nextId++;

  // The document stores each control as a diff against its type's defaults; the editor's model
  // is always the full control, because everything that reads one reads deep paths off it. Done
  // once and reused — expanding a 4.8 MB panel twice to build a layer list would be a silly way
  // to spend a hundred milliseconds. Equal sections are one object between the controls, as their
  // defaults are (expandControls).
  const controls = repairGaiaNoteChoices(expandControls(data.controls ?? []));
  const fields = panelFieldsFromDocument(data, controls);

  const panel = {
    ...createPanel(),
    ...data,
    controls,
    ...fields,
    formatVersion: read.migration.toVersion,
    id,
    filePath,
    name: name || data.name || `Untitled ${id}`,
    modified: false,
  };
  if (Object.hasOwn(fields, 'captureSession') && !fields.captureSession) delete panel.captureSession;
  // A document an older format was converted from is marked modified: what is open is no longer
  // what is on disk, and saving it should be offered.
  if (read.migration.changed) {
    console.info(`[panels] ${panel.name}: converted from format ${read.migration.fromVersion} to ${read.migration.toVersion}`);
    return { ...panel, modified: true };
  }
  return panel;
}
