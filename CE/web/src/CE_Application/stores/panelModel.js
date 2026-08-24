import { get } from 'svelte/store';
import { defaultGridSize, defaultSnapToGrid } from './runtimePreferences.js';
import { normalizeProjectDeviceSession } from './projectDeviceSession.js';
import { normalizeCaptureSession } from '../utils/captureSession.js';
import { collectExportParameters } from '../utils/exportParameters.js';
import { expandControl, shrinkControl } from './documentShape.js';
import { createLayer, normalizePanelLayers } from '../utils/panelLayers.js';

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

  return {
    id,
    panelGuid: makeGuid(),
    // VST3 / plugin export identity (surfaced in Panel Properties → Export). The exporter
    // (tools/scripts/export-panel-vst3.mjs) reads these; defaults mirror what used to be hardcoded.
    // pluginName '' ⇒ fall back to the panel name. Together with panelGuid these drive the unique FUID.
    exportSettings: {
      pluginName: '',
      vendor: 'Tedjuh',
      manufacturerCode: 'Tdjh',
      version: '1.0.0',
      // Embed the native CPython runtime (full stdlib) so Python scripts run window-closed + offline.
      // 'auto' = include only when the panel actually has Python scripts; 'on'/'off' force it.
      // Costs ~the size of a CPython runtime + stdlib in the exported plugin (shown in the Export tab).
      embedPython: 'auto',
      // Compile-at-export C++/C#/Java handlers into native modules (no language runtime shipped).
      // 'auto' = compile the native-handler languages the panel actually uses, when their toolchain is
      // present on the export machine (clang for C++, .NET SDK for C#, GraalVM native-image for Java),
      // warning for any that's missing; 'on' = force; 'off' = keep those handlers editor-preview-only.
      compileNativeHandlers: 'auto',
      // Every JUCE format reachable without a third-party gate ships by default. Both readers
      // (the Export tab and export-panel-vst3.mjs) test `!== false`, so a panel saved before these
      // keys existed exports all three too — the default is the behaviour, not just the value.
      // AAX needs Avid's SDK + PACE signing, VST2 licensing closed in 2018, and AU/AUv3 need a
      // macOS build, so none of those are settings here.
      exportClap: true,
      exportLv2: true,
      // Total Recall: may the exported plugin push a restored session's values back at the synth
      // when a project reopens? 'ask' (the default) asks once and remembers; 'always' sends without
      // asking; 'never' leaves the hardware alone. Ask is the conservative default because a plugin
      // that blasts SysEx at whatever is plugged in whenever a project opens is a bad citizen —
      // the device may be a different synth today, or the same synth mid-take. A panel exported
      // before this key existed reads as 'ask' too (Player/RestorePolicy.h), which is strictly more
      // than the nothing it used to do.
      restoreHardware: 'ask',
    },
    name: name ?? `Untitled ${id}`,
    scriptId: `panel_${id}`,
    author: '',
    version: '1.0.0',
    description: '',
    enabled: true,
    locked: false,
    filePath: null,
    width: 600,
    height: 400,
    resizable: false,
    // The panel-wide emergency-stop key (see docs/panic.md). Lives on the panel
    // rather than in app settings so it travels with an exported Player. Empty
    // string switches it off — some rigs already have Escape bound.
    panicShortcut: 'Escape',
    minWidth: 0,
    minHeight: 0,
    maxWidth: 0,
    maxHeight: 0,
    lockAspectRatio: false,
    bgLayerOrder: ['solid', 'gradient', 'image', 'texture'],
    bgSolid: true,
    bgColour: 'FF333333',
    bgGradientEnabled: false,
    bgGradientOpacity: 100,
    bgGradientName: '',
    bgGradient: {
      type: 'linear',
      angle: 90,
      centerX: 50,
      centerY: 50,
      radiusX: 50,
      radiusY: 50,
      edge: 0,
      stops: [
        { color: 'FF0000', position: 0 },
        { color: '0000FF', position: 100 },
      ],
    },
    bgImageEnabled: false,
    bgImage: '',
    bgImageOpacity: 100,
    bgImageFit: 'fill',
    bgImageAlign: 'center',
    bgImageOffsetX: 0,
    bgImageOffsetY: 0,
    bgImageBlend: 'normal',
    bgImageBlur: 0,
    bgImageTint: 'FFFFFF',
    bgImageFlipH: false,
    bgImageFlipV: false,
    bgImageRotation: 0,
    bgImageGrayscale: false,
    bgImageSaturation: 100,
    bgImageBrightness: 100,
    bgImageContrast: 100,
    bgImageTileScale: 1.0,
    bgTextureEnabled: false,
    bgTexture: '',
    bgTextureOpacity: 100,
    bgTextureFit: 'tile',
    bgTextureAlign: 'center',
    bgTextureOffsetX: 0,
    bgTextureOffsetY: 0,
    bgTextureBlend: 'normal',
    bgTextureBlur: 0,
    bgTextureTint: 'FFFFFF',
    bgTextureFlipH: false,
    bgTextureFlipV: false,
    bgTextureRotation: 0,
    bgTextureGrayscale: false,
    bgTextureSaturation: 100,
    bgTextureBrightness: 100,
    bgTextureContrast: 100,
    bgTextureTileScale: 1.0,
    gridEnabled: true,
    gridSize: get(defaultGridSize),
    gridColour: '33FFFFFF',
    gridLineWidth: 1,
    gridType: 'lines',
    gridSubdivision: 1,
    gridSubColour: '55FFFFFF',
    gridCentered: false,
    gridOriginX: 0,
    gridOriginY: 0,
    snapToGrid: get(defaultSnapToGrid),
    // Ruler guides are part of the document: they save with the panel,
    // restore with the session, and undo with everything else. They used to
    // live in a session-only store — one reload and a layout's whole
    // scaffold was gone.
    guides: { horizontal: [], vertical: [] },
    notepad: {
      notes: [{ name: 'Note 1', content: '' }],
      activeNoteIndex: 0,
    },
    viewer: {
      images: [],
      activeImageIndex: 0,
    },
    requiredProfiles: [],
    // Total Recall S4: the program list the exported plugin shows a DAW, baked from a preset
    // librarian bank at author time. Absent means the plugin reports the one nameless program it
    // always did. The librarian lives in browser storage, which neither the Node exporter nor the
    // plugin can reach — and a plugin should not scan an instrument's memory on every project
    // load, so baking is the right answer rather than a workaround. See utils/programBank.js.
    programBank: null,
    // Captured panel states: named value maps the panel can recall or blend between. Stored on the
    // document so they travel with it — a shared panel carries the scenes somebody built, not just
    // the controls. Distinct from `parameterSnapshots` below, which despite the name is a cache of
    // profile parameter METADATA rather than any captured value. See utils/snapshotModel.js.
    snapshots: [],
    // Routes: one source to many targets, each with its own window, depth, offset and curve. On the
    // DOCUMENT rather than on a component, and that is the answer to the design note's open
    // question — three editors are planned (properties-panel link, Link Mapper, node-graph) and if
    // each kept its own routes a cable drawn on the canvas would be invisible in the Mapper. The
    // Macro's slots and the Router's destinations are READ as routes rather than copied into here;
    // see utils/routeAdapters.js.
    routes: [],
    // One key and scale the whole panel plays in. Components opt in with `followPanelKey` on their
    // own section, and changing this WRITES the new key into each of them — see utils/panelKey.js
    // for why a broadcast beats an indirection here. Absent means nothing follows anything.
    musicalContext: null,
    parameterSnapshots: {},
    // Host-automatable parameters this panel exposes (Milestone 2 / DAW automation). Empty = derive
    // automatically from the value-bearing controls at export time (see utils/exportParameters.js).
    exportParameters: [],
    scripts: [],
    scripting: {
      enabled: true,
      runInPreview: true,
      runOnExport: true,
    },
    // Card presets the document carries. They also live in the user's localStorage library
    // (stores/cardPresets.js) — that is what makes them reusable across panels — but a preset
    // that ONLY lives there is a preset a shared .cepanel arrives without, and the design the
    // file describes then cannot be reproduced by the person who received it. So the file
    // carries its own copy and the store merges the two on open, document winning.
    cardPresets: [],
    modified: false,
    controls: [],
    // Paint order, back to front. One layer to begin with, because a panel with none is a panel
    // whose controls have nowhere to live — normalizePanelLayers would invent it anyway.
    layers: [createLayer()],
  };
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
 * same type. See documentShape.js — this is one line here because the interesting half is the
 * inverse, and the two have to stay exact inverses.
 */
function toDocumentForm(control) {
  return shrinkControl(control);
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
 *   something the exporter has to remember.
 */
export function serializePanel(panel, options = {}) {
  const { id, modified, ...data } = panel;
  const elide = options.elide !== false;
  // Generated controls come out first (they are regenerated on load), then what remains is
  // written as a diff against each type's defaults — unless this document is leaving the editor.
  const controls = stripGeneratedControls(data.controls);
  data.controls = elide ? controls.map(toDocumentForm) : controls;

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

  return JSON.stringify(data, null, 2);
}

/** Returns the panel object, or null if the document is corrupted / not a valid panel. */
export function deserializePanel(json, filePath, name) {
  let data;
  try {
    data = JSON.parse(json);
  } catch (error) {
    console.error(`[panels] Cannot open panel${filePath ? ` "${filePath}"` : ''} — file is not valid JSON: ${error.message}`);
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    console.error(`[panels] Cannot open panel${filePath ? ` "${filePath}"` : ''} — file does not contain a panel document`);
    return null;
  }
  const id = nextId++;
  if (data.deviceSession) {
    data.deviceSession = normalizeProjectDeviceSession(data.deviceSession);
  }
  // Coerced rather than trusted: everything downstream indexes into `baselines` as arrays of byte
  // arrays, and a document can be hand-edited. `normalizeCaptureSession` returns null for anything
  // it cannot make sense of, and for an empty session, which then reads as no session at all.
  if (data.captureSession) {
    const session = normalizeCaptureSession(data.captureSession);
    if (session) data.captureSession = session;
    else delete data.captureSession;
  }

  // The document stores each control as a diff against its type's defaults; the editor's model
  // is always the full control, because everything that reads one reads deep paths off it. Done
  // once and reused — expanding a 4.8 MB panel twice to build a layer list would be a silly way
  // to spend a hundred milliseconds.
  const controls = (data.controls ?? []).map(expandControl);

  return {
    ...createPanel(),
    ...data,
    controls,
    // A document written before presets travelled has no `cardPresets` key, and one written by
    // hand can have anything at all in it. Normalising here means every reader downstream can
    // assume an array of {id,…} and the merge in stores/cardPresets.js never has to defend
    // itself against a string or a null.
    cardPresets: normalizeCardPresets(data.cardPresets),
    // Migration lives here rather than in a version bump: a document with no `layers` gets one
    // built from first-appearance order, which is exactly what rendering used to infer, so it
    // looks identical on the first load and stops restacking on every load after it.
    layers: normalizePanelLayers(data.layers, controls),
    id,
    filePath,
    name: name || data.name || `Untitled ${id}`,
    modified: false,
  };
}
