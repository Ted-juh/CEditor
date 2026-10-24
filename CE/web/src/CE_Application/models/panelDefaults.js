// panelDefaults.js — the panel document a new panel starts as, with nothing read from a store.
//
// createPanel (stores/panelModel.js) is this with the user's settings filled in: the next id, a
// fresh GUID, the grid size and snap from Settings, and the control set a new panel starts with.
// Those are handed in, so this module imports nothing but plain data and can be read where the
// stores cannot: by scriptColours.js, which reads which of the panel's keys are colours from it
// (PANEL_COLOUR_FIELDS) as it reads a control's from the section templates, and through that by
// tools/scripts/gen-colour-fields.mjs, which runs in plain Node. The keys are in the order the
// document has always had them, since the committed panels are compared as text.

import { createLayer } from '../utils/panelLayers.js';

/**
 * A new panel document. `name` null means "Untitled <id>"; the rest are written as given.
 */
export function panelDefaults({
  id, panelGuid, name = null, gridSize, snapToGrid, controlSet, controlSets,
}) {
  return {
    id,
    panelGuid,
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
      // failing if a required handler cannot build; 'on' = force; 'off' = omit native handlers.
      compileNativeHandlers: 'auto',
      // New panels select VST3 only. The installed compiler-free exporter also makes CLAP and LV2
      // when they are selected.
      // Existing explicit format selections remain part of their documents.
      // AAX needs Avid's SDK + PACE signing, VST2 licensing closed in 2018, and AU/AUv3 need a
      // macOS build, so none of those are settings here.
      exportClap: false,
      exportLv2: false,
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
    gridSize,
    gridColour: '33FFFFFF',
    gridLineWidth: 1,
    gridType: 'lines',
    gridSubdivision: 1,
    gridSubColour: '55FFFFFF',
    gridCentered: false,
    gridOriginX: 0,
    gridOriginY: 0,
    snapToGrid,
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
    // The control set this panel's ready-made controls resolve their colour tokens against
    // (models/controlSets.js). Always present in the model so readers can index into it; written
    // to the file only when it is not the default — see serializePanel.
    controlSet,
    // The sets this document carries with it (stores/controlSetLibrary.js): a set chosen from the
    // user's library or imported from a file is copied here so a shared panel arrives with the set
    // it was designed in — and so is a library set that is the default for new panels. Built-ins
    // are never copied. Written only when there is something in it.
    controlSets,
    modified: false,
    controls: [],
    // Paint order, back to front. One layer to begin with, because a panel with none is a panel
    // whose controls have nowhere to live — normalizePanelLayers would invent it anyway.
    layers: [createLayer()],
  };
}
