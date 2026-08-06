import { get } from 'svelte/store';
import { defaultGridSize, defaultSnapToGrid } from './runtimePreferences.js';
import { normalizeProjectDeviceSession } from './projectDeviceSession.js';
import { collectExportParameters } from '../utils/exportParameters.js';
import { resolveSliderSemanticParts, stripDefaultSliderParts, usesSliderSemanticParts } from '../utils/sliderEntityFactory.js';

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
    notepad: {
      notes: [{ name: 'Note 1', content: '' }],
      activeNoteIndex: 0,
    },
    viewer: {
      images: [],
      activeImageIndex: 0,
    },
    requiredProfiles: [],
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
    modified: false,
    controls: [],
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
      const trimmed = stripRedundantParts(c);
      const kids = trimmed?._children?.Children?._children;
      if (!kids) return trimmed;
      const kept = Object.fromEntries(
        Object.entries(kids).filter(([, child]) => child?._children?.Core?.generatedBy == null)
          .map(([key, child]) => [key, stripGeneratedControls([child])[0] ?? child]),
      );
      return { ...trimmed, _children: { ...trimmed._children, Children: { ...trimmed._children.Children, _children: kept } } };
    });
}

/**
 * Don't write down a slider part that is still exactly its default.
 *
 * A Knob is born with seventeen fully-materialized parts, each carrying a complete Background and
 * Text at defaults: 93 KB of JSON for a knob nobody has styled. On a 162-control synth editor that
 * was 93% of a 28 MB document, and it is paid again on every autosave and fifty times over in the
 * undo stack.
 *
 * The parts are recomputed on read anyway — SliderFamilyRenderer resolves them through
 * resolveSliderSemanticParts(), which fills in every default part whether the document had it or
 * not. So the only thing the stored copy was doing was taking up room.
 *
 * Slider and Knob only. Number and Range share the family but render their Parts directly rather
 * than through the resolver, so theirs have to stay on disk.
 */
function stripRedundantParts(control) {
  if (!control?._children?.Parts || !usesSliderSemanticParts(control)) return control;

  const parts = stripDefaultSliderParts(control._children.Parts);
  const children = { ...control._children };
  if (parts) children.Parts = parts;
  else delete children.Parts;

  return { ...control, _children: children };
}

/**
 * Put the elided slider parts back on load — the other half of stripRedundantParts, and not
 * optional.
 *
 * SliderFamilyRenderer would cope without this: it resolves parts on every render. Nothing else
 * would. The Slider and Slider-label editors read `getSection(control, 'Parts')` straight off the
 * control to populate their lists, the Animations and Behavior editors read it to enumerate what
 * can be targeted, and interactionRuntime reads it for hit-testing and state patches. All of them
 * see the in-memory model, where Parts has always been materialized — so eliding on save without
 * restoring on load would leave a knob that draws correctly and has an empty Parts inspector,
 * which is a worse bug than the one being fixed.
 *
 * So the document is the compact form and the in-memory model is the full one, and neither side
 * has to know about the other.
 */
function rehydrateParts(controls) {
  return (controls ?? []).map((control) => {
    if (!control?._children) return control;

    let children = control._children;

    if (usesSliderSemanticParts(control)) {
      children = { ...children, Parts: resolveSliderSemanticParts(children.Parts ?? null) };
    }

    const kids = children.Children?._children;
    if (kids) {
      const restored = Object.fromEntries(
        Object.entries(kids).map(([key, child]) => [key, rehydrateParts([child])[0] ?? child]),
      );
      children = { ...children, Children: { ...children.Children, _children: restored } };
    }

    return children === control._children ? control : { ...control, _children: children };
  });
}

/** `Untitled 7` and friends — a stand-in the app invented, not a name anyone chose. */
const PLACEHOLDER_PANEL_NAME = /^Untitled \d+$/;

/** `C:\dev\x\qa-beta-smoke.cepanel` -> `qa-beta-smoke`. Handles both separators. */
function panelNameFromPath(filePath) {
  const leaf = String(filePath ?? '').split(/[\\/]/).pop() ?? '';
  return leaf.replace(/\.cepanel$/i, '').trim();
}

export function serializePanel(panel, options = {}) {
  const { id, modified, ...data } = panel;
  data.controls = stripGeneratedControls(data.controls);

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

  return {
    ...createPanel(),
    ...data,
    // Documents store slider parts in their compact form (defaults elided); the in-memory model
    // is always the full one, because everything except the renderer reads Parts directly.
    controls: rehydrateParts(data.controls),
    id,
    filePath,
    name: name || data.name || `Untitled ${id}`,
    modified: false,
  };
}
