// panelRuntime.js — the M1 JS/WebView script runtime.
//
// Runs scripts in the WebView, where the controls actually live, and binds the panel API
// (set/get/log/helpers/self) directly to the control stores — so `set("cutoff.value", 8000)`
// moves the real control immediately, no C++ round-trip.
//
// Scope: JavaScript / TypeScript / Lua (wasmoon) / Python (Pyodide) / the C++, C# and Java preview
// interpreters, control set/get, the full helper set, log → trace console, live dispatch of every
// event panelApi.js declares, real MIDI out (sendCC/sendNRPN/sendSysex → the device bridge;
// requestDump → the device-sync path), cross-script flow (on/emit/run), host timers, and the
// panel-component verbs. The C++ runtime remains the engine for window-closed logic in shipped
// panels; this one covers everything while the window is open.
//
// This runtime implements the contract in panelApi.js, and CE/web/test/panelApiParity.test.js
// fails if it drifts from it in either direction. It used to: on/emit/run were `() => {}`, eight
// declared events were absent from the handler probe list, fourteen encoding helpers were missing
// and a fifteenth was spelled differently, and forty-seven panel verbs existed here and nowhere
// else. Bind nothing panelApi.js doesn't declare, and declare nothing you don't bind.

import {
  formatNumber, formatHz, formatTime, formatDb, formatPercent, formatPan, formatRatio, formatClock,
  formatNote, formatDivision, formatTable, formatFit, formatLine, formatParse, formatDescribed,
  formatPlaceholderFor,
} from './formatCore.js';
import {
  addShortcut as keysAddShortcut, removeShortcut as keysRemoveShortcut, listShortcuts as keysListShortcuts,
  isDown as keysIsDownRead, heldKeys as keysHeldRead, setPiano as keysSetPiano, pianoInfo as keysPianoInfoRead,
  focusControl as keysFocusControl, focusedControl as keysFocusedControl, resetKeys, setShortcutRunner,
  setKeysPanelResolver,
} from './scriptKeys.js';
import { patchCommands } from './patchCore.js';
import { verifyCommands } from './verifyCore.js';
import { fileCommands } from './fileCore.js';
import { createFileDialogs } from './scriptFileHost.js';
import { createCiBridge } from './ciHost.js';
import { createMidiInDecoder } from './midiInDecoder.js';
import { mpeCommands } from './mpeCore.js';
import { dawCommands } from './dawCore.js';
import { oscCommands, oscMatches } from './oscCore.js';
import { OSC_CONTROL_KIND, parseOscTargets } from '../utils/oscControlBindings.js';
import { collectExportParameters } from '../utils/exportParameters.js';
import { get } from 'svelte/store';
import { runBoundedLuaSource } from './boundedLua.js';
import { evaluatePanelSource, ensureScriptSandbox, disposeJavascriptSandboxes } from './scriptSandbox.js';
import { executionFingerprint, isExecutionApproved, isNativeExecutionApproved, approveExecution, scriptExecutionStatus, setExportApprovalCheck } from './scriptTrust.js';
import { panels, scriptRuntimePanelId, updatePanel } from '../stores/panels.js';
import { sanitizeControlName } from '../utils/controlNames.js';
import {
  applyControlPatchesById, applyResolvedValue, updateControlProperty, removeControlNode,
} from '../stores/controls.js';
import { presetSlotInfo } from '../stores/deviceProfileLocalEngine.js';
import { recallPreset as recallPresetAction } from '../stores/presetLibrarian.js';
import { noteScriptTouchedControl, noteScriptTouchedControls } from '../stores/scriptTouchedControls.js';
import { valueAtPath, probeNestedWrite, getDefaultChildTemplate } from '../stores/controlTreeUtils.js';
import { deepClone } from '../utils/deepClone.js';
import { controlSetForPanel, isTokenReference, resolveColourValue, resolveToken } from '../models/controlSets.js';
import {
  COLOUR_FORMS, DRAW_COLOUR_FORMS, MADE_CHILDREN, colourFieldAt, colourHint, drawColour, mapColourWrites,
  mapPanelColourWrites, panelColour, panelColourFieldAt, percentHint, percentTextHint, realNumber,
  shownNumber, storedColour, unitProblem, orderedColour, ORDERED_FORMS, colourFromRgb, colourFromHsl, hslOfChannels,
} from './scriptColours.js';
import { dashPattern, strokeEnd } from './drawDash.js';
import { listWord } from '../utils/wordLists.js';
import { timeNumber } from './timeWords.js';
import { HAND_WRITTEN, handWrittenRefusal, recorderQuantizeArgs, reducerArgs, sectionFieldRefusal, sectionRefusalLine } from './handWrittenVerbs.js';
import { layoutWord } from './layoutWords.js';
import { noteList, voiceLeadMode, arpOrderPattern, octaveCount } from './noteLists.js';
import {
  drawNumber, commandBounds, outsideWords, pointList, pointRadius, curveTension, pixelScale, pixelGapWords, clipWords, drawMissing,
  drawOption, textSize, polygonSides, gridCount, gridStep, flatPointList, segmentList,
} from './drawShapes.js';
import { lcdLineWords } from './lcdLines.js';
import { lcdReadAt, lcdWriteAt, lcdRows, lcdLayoutIndex, lcdShownLayout, lcdZonePlaceOf, lcdZoneSourceFor, lcdZoneSourceName } from './lcdPositions.js';
import { layoutShowing, showLayout } from '../stores/displayLayouts.js';
import { phaseNow, seekPhase } from '../stores/componentPhases.js';
import { contextForControl } from '../utils/panelKey.js';
import { recallNoProfileWords } from './presetWords.js';
import { addScriptTrace } from '../stores/scriptConsole.js';
import { envelopeRefusal, envelopePointParts } from './animEnvelope.js';
import { availableFonts, storedIcons } from '../stores/appSettings.js';
import { documentIcons } from '../utils/documentIcons.js';
import { layoutModeForIcon } from '../utils/iconLayout.js';
import { currentDocumentFonts } from '../utils/fontSources.js';
// ce.image (§50). The file cache is how a path source becomes something renderable, which is also
// what makes embed() possible.
import { fileCache, loadFile } from '../stores/fileCache.js';
import {
  IMAGE_LAYER_IDS, assetCatalogue, findAsset, imageLayer, isPortableSource, planClear, planImage,
  sourceKind,
} from '../utils/imageLayers.js';
// Shared with the device profile engine, so the two cannot disagree about what "roland" means.
import { checksumNames, computeChecksum } from '../utils/checksums.js';
// ce.text measures through the renderer's own layout rather than a second implementation of it.
import { buildBlockTextLayout } from '../editor/canvasControlTextLayout.js';
import {
  findFont, fontCatalogue, planAxis, planStyle, resolvedWeight, axisClampWords, axisRefusalWords,
} from './textStyle.js';
import {
  isJuceAvailable, triggerRawMidiAction, parseDumpMessage, onDumpMessageParsed,
  listMidiInputs, listMidiDestinations,
} from '../bridge/bridge.js';
import {
  startDeviceSync, startBulkDumpSend, commitDeviceParameter,
  latestMidiInputMessage, latestSysexInputMessage, deviceSessionState, deviceRuntimeState,
  deviceProfiles, deviceRoleMappings,
  midiInputs, midiDestinations,
} from '../stores/deviceProfiles.js';
import { profileSources } from '../stores/deviceProfileStores.js';
import { parameterTable, requestParameterTable } from '../stores/deviceParameterTable.js';
import {
  deviceWriteUnknownWords, deviceWriteNoProfileWords, deviceBindUnknownWords, DEVICE_OVERRIDES, deviceOverrideValue,
  deviceSetNoNameWords, deviceTimingUnknownWords, deviceNoIdWords, deviceNotOptionsWords, devicePortsDirectionWords, deviceSetNoProfileWords, profileDumpKinds, dumpKindUnknownWords,
} from './deviceWords.js';
import { parseProfileSourceText } from '../stores/deviceProfileLocalEngine.js';
import { mapDeviceRole } from '../stores/deviceProfileSession.js';
import {
  defineParameter as defineRuntimeParameter, defineDump as defineRuntimeDump,
  definedParameters, definedParameter, encodeParameter as encodeRuntimeParameter,
  dumpRequestBytes, decodeDump as decodeRuntimeDump, buildDump as buildRuntimeDump, clearDeviceDefinitions,
  hasDefinedParameter, hasDefinedDump,
} from './deviceDefinitions.js';
import {
  handlerNamesForRuntime, RUNTIME_WEBVIEW, VALUE_ACCESSOR_IDS,
  PANEL_TARGET, PANEL_READONLY_PROPERTIES,
  MODULES, MODULE_BY_ID, moduleMemberMap, MEMBER_MODULE, isValueMember, MEMBER_BY_ID,
  CE_API_VERSION, RUNTIME_ANY, panelModules, moduleGateMessage, modulesUsedBy, resolveModules,
  allModules, moduleById, memberMapFor, registeredExtensions, EVENT_BY_ID, optionChecks, memberPath,
  andList, unknownOptionsMessage,
} from './panelApi.js';
// Each section type's template: what get() checks a path against, and create's `<section>` keys.
import { SECTION_DEFAULTS } from '../models/sectionDefaults.js';
// The entries the app makes for a control's lists: what ce.panel.define holds a spec against.
import { ENTRY_BASELINES } from '../stores/documentEntries.js';
import {
  createPartNode, createValueChannel, createArrayChannel, createBehaviorModule, createHitZone,
  createGenerator, createLink, createVariant,
} from '../utils/customComponentFactory.js';
import { extensionSource } from './extensionModules.js';
import { panelPreviewSessions, previewModeEnabled, updatePanelPreviewSession, syncPanelPreviewSessions, setPreviewStopBarrier } from '../stores/interactionPreview.js';
import {
  customChannelOfPath, customChannelPatch, hasLiveValue, isLiveValuePath, liveValuePatch,
  readLiveValue, readsLiveValue, whyChannelNotWritable,
} from './liveValue.js';
import {
  setPreviewRehearsalEnabled, isRehearsing, keepAllInRehearsal, keepPropertyInRehearsal,
} from '../stores/previewRehearsal.js';
import { syncDeviceRuntimeStateToPanelPreview } from '../utils/deviceBindingSync.js';
import { scriptDocuments } from '../stores/scriptWorkspace.js';
import { isSourceScript } from './scriptModel.js';
import { compileCpp, invokeCpp } from './cppPreview.js';
import { compileCsharp, invokeCsharp } from './csharpPreview.js';
import { compileJava, invokeJava } from './javaPreview.js';
import { ensureTs, transpileTs } from './tsService.js';
// The wasm binary URL — resolved by Vite so wasmoon finds its runtime in dev and in the bundle.
import luaWasmUrl from 'wasmoon/dist/glue.wasm?url';
import { GUARD_NAME, PYTHON_WATCHDOG_PRELUDE, isScriptTimeLimit, scriptLoopGuard } from './scriptWatchdog.js';
import { applySplitScriptAction } from '../utils/splitZoneLayout.js';
import { phraseScriptPatch } from '../utils/phraseLayout.js';
import { recorderScriptPatch } from '../utils/noteRecorderLayout.js';
import { harmoniserScriptPatch } from '../utils/harmoniserLayout.js';
import { setlistScriptPatch } from '../utils/setlistLayout.js';
import { elementSites, elementAt, elementPropTable } from '../utils/pixelElements.js';
import { DEFAULT_DEVICE_ROLE } from '../stores/deviceConstants.js';
import { transport as transportStore } from '../stores/transport.js';
// The arrangement maths — pure, and the SAME functions the canvas context menu runs. Two
// implementations of "distribute six things evenly" would drift the first time one was touched.
// arrangementPlan is each verb's decision on top of them, which the Values tab draws too.
import { boundsOf, arrangementPlan } from '../utils/arrangement.js';
import { pushSnapshot } from '../stores/history.js';
import { createControl, COMPONENT_TYPES } from '../models/componentTypes.js';
import { setDrawing, clearDrawing } from '../stores/scriptDraw.js';
import {
  setInboundMidiFilter, setOutboundMidiFilter, clearMidiFilters, filterInboundMidi,
} from './midiFilters.js';
import {
  COMPONENT_VERBS, componentScriptPatch, componentRequestLegal, componentRefusalLine, componentRefusalReason, componentClampWarning, familyVerbRefusal, familyVerbNamed, readIndexRefusal, LIST_KINDS,
  itemListLength, LINK_KIND, ELEM_KIND, LAYOUT_KIND,
} from './componentVerbs.js';
import {
  SOURCE_KINDS, sourceAccepts, sourceByName, sourceName,
} from '../utils/controlSources.js';
import {
  componentListWithElement, componentListWithoutElement,
} from '../utils/componentElements.js';
import { patchOf, isUnchanged } from '../utils/scriptPatchOutcome.js';
import { typeOfControl, familiesForType } from './componentSchema.js';
import {
  SCALES, CHORDS, SCALE_NAMES, CHORD_NAMES, NOTE_SHARP, NOTE_FLAT, FLAT_KEY_PCS, MINOR_SCALE_NAMES,
  QUALITY_SUFFIX, ROMAN, MINOR_QUALITY_NAMES, noteNameOf, noteNumberOf,
} from './musicTheory.js';
import { DIVISIONS, DIVISION_LABELS, DIVISION_NAMES, PPQN, divisionIdOf } from './timeTables.js';
import { FONT_ADVANCE as PIXEL_ADVANCE, FONT_H as PIXEL_FONT_H } from '../utils/pixelFont.js';
import { EASING_BEZIERS, ANIM_CURVE_NAMES, bezierOf } from './easingTables.js';
import { cubicBezierEase, springEase } from '../utils/easing.js';
// ce.time's arithmetic IS the transport's, called rather than restated: a script asking where a
// beat falls and the Transport drawing that beat have to agree, and one implementation is the only
// way to promise it. The C++ preludes cannot import, so they transliterate — and
// scriptPreludeAgreement.test.js runs the same fixtures through all four.
import {
  barBeat as panelBarBeat, formatBarBeat as panelFormatBarBeat, stepAtBeat as panelStepAtBeat,
  crossedSteps as panelCrossedSteps, swungBeatOffset as panelSwungBeatOffset,
  cyclePhaseAt as panelCyclePhaseAt, cycleCountAt as panelCycleCountAt,
  cycleBeats as panelCycleBeats, loopedBeats as panelLoopedBeats,
  loopCycleIndex as panelLoopCycleIndex, tapTempo as panelTapTempo,
  estimateTempoFromPulses as panelClockTempo,
} from '../utils/transportLayout.js';
import {
  notify as uiNotifyStore, setStatus as uiStatusStore, openDialog as uiDialogStore, clearScriptUi,
  dismissNotification as uiDismissStore, updateNotification as uiUpdateStore,
  uiSnapshot as uiSnapshotStore,
} from '../stores/scriptUi.js';
import { requestAnimationPlay } from '../stores/animationActivity.js';
import {
  flatControls, findControlById, findParentOfControl, isContainerControl,
  insertControlIntoTree, mapControlsTree, removeControlFromTree, remintControlIds, controlPanelOffset,
} from '../utils/containment.js';
import { isHardwareEndpoint } from '../utils/midiEndpoints.js';

/* --------------------------------------------------------------- path resolution */

// Runtime host override. When set (by the exported player), the runtime resolves the active panel,
// its scripts, and control value I/O from here instead of the editor stores — so the SAME runtime
// runs scripts in the shipped plugin. null = editor mode (resolve from panels / scriptDocuments).
let host = null;
let executionEpoch = 0;

// A script callback often paints many document fields as one logical operation. Publishing every
// field separately makes every panels-store subscriber repeat its work, even though Svelte cannot
// paint until the callback returns. Keep a private document snapshot for synchronous read-after-
// write semantics, then publish the accumulated control patches once at the callback or explicit
// ce.panel.batch boundary. Live values still use panelPreviewSessions immediately, and player
// hosts retain their own mutable document semantics.
let documentWriteBatchDepth = 0;
let documentWriteBatch = null;

let teardownPanelId = null;
function runtimeReadPanelId() { return teardownPanelId ?? get(scriptRuntimePanelId); }

function storedActivePanel() {
  return get(panels).find((p) => p.id === runtimeReadPanelId()) ?? null;
}

function beginDocumentWriteBatch() {
  documentWriteBatchDepth += 1;
  if (host || documentWriteBatchDepth !== 1) return;
  const panel = storedActivePanel();
  if (!panel) return;
  documentWriteBatch = {
    panelId: panel.id,
    panel: null, // materialized lazily on the first authored write; read-only timers stay cheap
    drafts: new Map(),
    patches: new Map(),
    touchedIds: new Set(),
  };
}

function publishDocumentWriteBatch(completed) {
  if (completed?.touchedIds.size) noteScriptTouchedControls(completed.touchedIds);
  if (completed?.patches.size) applyControlPatchesById(completed.patches, completed.panelId);
}

function rebaseDocumentWriteBatchIfPanelChanged() {
  if (!documentWriteBatch) return;
  const panel = storedActivePanel();
  if (panel?.id === documentWriteBatch.panelId) return;
  publishDocumentWriteBatch(documentWriteBatch);
  documentWriteBatch = panel ? {
    panelId: panel.id, panel: null, drafts: new Map(), patches: new Map(), touchedIds: new Set(),
  } : null;
}

function endDocumentWriteBatch() {
  if (documentWriteBatchDepth <= 0) return;
  documentWriteBatchDepth -= 1;
  if (documentWriteBatchDepth !== 0) return;
  const completed = documentWriteBatch;
  documentWriteBatch = null;
  publishDocumentWriteBatch(completed);
}

function withDocumentWriteBatch(fn) {
  beginDocumentWriteBatch();
  try { return fn(); }
  finally { endDocumentWriteBatch(); }
}

function writeEditorControlProperty(control, path, value) {
  rebaseDocumentWriteBatchIfPanelChanged();
  const controlId = control?._children?.Core?.id;
  if (!documentWriteBatch || controlId == null) {
    applyControlPatchesById(new Map([[controlId, { [path]: value }]]), runtimeReadPanelId(), { pin: true });
    return;
  }
  let draft = documentWriteBatch.drafts.get(controlId);
  if (!draft) {
    const panel = documentWriteBatch.panel ?? storedActivePanel();
    if (!panel || panel.id !== documentWriteBatch.panelId) {
      applyControlPatchesById(new Map([[controlId, { [path]: value }]]), runtimeReadPanelId(), { pin: true });
      return;
    }
    const source = findControlById(panel.controls, controlId);
    if (!source) {
      applyControlPatchesById(new Map([[controlId, { [path]: value }]]), runtimeReadPanelId(), { pin: true });
      return;
    }
    draft = deepClone(source);
    const controls = mapControlsTree(panel.controls, (candidate) =>
      candidate?._children?.Core?.id === controlId ? draft : candidate);
    documentWriteBatch.panel = { ...panel, controls };
    documentWriteBatch.drafts.set(controlId, draft);
  }
  applyResolvedValue(draft, path, value);
  let patch = documentWriteBatch.patches.get(controlId);
  if (!patch) {
    patch = {};
    documentWriteBatch.patches.set(controlId, patch);
  }
  // Reinsert an existing key so Object.entries preserves the order of the LAST write. Ancestor and
  // descendant paths can both occur in one batch, and applying them out of sequence changes which
  // value wins (Text, then Text.content, then Text again must end with the final whole Text value).
  if (Object.prototype.hasOwnProperty.call(patch, path)) delete patch[path];
  patch[path] = value;
}

function noteEditorScriptTouchedControl(id) {
  rebaseDocumentWriteBatchIfPanelChanged();
  if (documentWriteBatch) {
    if (id != null && String(id)) documentWriteBatch.touchedIds.add(String(id));
    return;
  }
  noteScriptTouchedControl(id);
}

/**
 * Install a host (exported player) or clear it (null = editor). See scripting/playerScriptHost.js.
 * Seeds value/session snapshots so the first change after install is measured against current state.
 */
export function setRuntimeHost(h) {
  host = h ?? null;
  // A host means the player, which owns its document: its panel is loaded from the .cepanel and
  // reloaded when it changes, so there is nothing to put back and nothing to rehearse. The editor
  // installs no host, which is exactly the case the rehearsal exists for.
  setPreviewRehearsalEnabled(host == null);
  if (host) {
    live.activePanelId = host.panel?.id ?? 'player';
    snapshotValues();
    seedSessionSnapshot();
    syncOscBindings();   // the player's panel: open its OSC port when it has OSC bindings
  }
}

function activePanel() {
  if (host) return host.panel ?? null;
  const panelId = runtimeReadPanelId();
  if (documentWriteBatch?.panel && documentWriteBatch.panelId === panelId) return documentWriteBatch.panel;
  return storedActivePanel();
}

// Editor document writes replace the controls array. Reuse name/id lookups
// across the many watch() reads in a settle pass.
const editorNameIndexes = new WeakMap();

// The player's document is its host's and is written in place (playerScriptHost.js), so its controls
// array stays the same object when a name changes and cannot key an index on its own. It used to be
// scanned whole on every lookup instead, and with the window open that was most of what GAIA's
// preset-name script cost: 1,070 lookups across 818 controls in one call, 160 to 220 ms of the
// 250 ms a call could take then. Its index is kept honest as it is used: a hit is checked against the
// control's current name and id, a miss looks again in a fresh index (a control a script created),
// and a script's write to a name or an id drops it (noteHostWrite).
const hostNameIndexes = new WeakMap();
let hostNamesVersion = 0;

/** Name and id (lower-cased) to the first control that answers to it, in the order a scan meets them. */
function nameIndexFor(controls) {
  const index = new Map();
  // flatControls, NOT the top level: a control inside a Group or Container was unreachable by
  // name — get("Osc1Cutoff.value") returned nothing for a knob that was plainly there, in both
  // runtimes, and most real panels group their controls. ce.panel.snapshot found it, because a
  // snapshot that stopped at the top level would have silently missed most of a panel.
  for (const control of flatControls(controls)) {
    const core = control?._children?.Core;
    for (const key of [String(core?.name ?? '').toLowerCase(), String(core?.id ?? '').toLowerCase()]) {
      if (!index.has(key)) index.set(key, control);
    }
  }
  return index;
}

function answersTo(control, target) {
  const core = control?._children?.Core;
  return String(core?.name ?? '').toLowerCase() === target || String(core?.id ?? '').toLowerCase() === target;
}

/** A host write that renames a control, or changes its id, leaves the player's name index stale. */
function noteHostWrite(modelPath) {
  if (modelPath === 'Core.name' || modelPath === 'Core.id') hostNamesVersion += 1;
}

/** Find a control in the active panel by its friendly name (case-insensitive), id fallback. */
function findControlByName(name) {
  const panel = activePanel();
  if (!panel) return null;
  const target = String(name ?? '').toLowerCase();
  const controls = Array.isArray(panel.controls) ? panel.controls : [];
  if (!host) {
    let index = editorNameIndexes.get(controls);
    if (!index) editorNameIndexes.set(controls, (index = nameIndexFor(controls)));
    return index.get(target) ?? null;
  }
  let entry = hostNameIndexes.get(controls);
  if (entry?.version === hostNamesVersion) {
    const found = entry.index.get(target);
    if (found && answersTo(found, target)) return found;
  }
  entry = { version: hostNamesVersion, index: nameIndexFor(controls) };
  hostNameIndexes.set(controls, entry);
  return entry.index.get(target) ?? null;
}

// Common shorthands → their canonical section path (visible lives under Core, x under Transform, …).
const SHORTHANDS = {
  visible: 'Core.visible', enabled: 'Core.enabled', locked: 'Core.locked', name: 'Core.name', zindex: 'Core.zIndex',
  x: 'Transform.x', y: 'Transform.y', width: 'Transform.width', height: 'Transform.height',
  opacity: 'Transform.opacity', rotation: 'Transform.rotation', scale: 'Transform.scale',
  value: 'Value.value',
};

/** Walk a node case-insensitively; returns the real-case path or null if any segment is missing. */
function walkCaseInsensitive(node, segments) {
  const out = [];
  for (const seg of segments) {
    const low = String(seg).toLowerCase();
    let key = null;
    if (node && node._children) key = Object.keys(node._children).find((k) => k.toLowerCase() === low);
    if (key != null) { out.push(key); node = node._children[key]; continue; }
    if (node && typeof node === 'object') key = Object.keys(node).filter((k) => k !== '_children' && k !== '_type').find((k) => k.toLowerCase() === low);
    if (key != null) { out.push(key); node = node[key]; continue; }
    return null;
  }
  return out.join('.');
}

// If a resolved path lands on a custom-component ValueChannel object, address its live value.
// Lets a script write the channel by its friendly name: set("dial.cutoff", 5000).
function channelizePath(control, path) {
  if (!path) return path;
  const node = valueAtPath(control, path);
  // A channel is recognised by its `_type`, not by already holding a value. Testing for
  // `'currentValue' in node` meant a channel NOBODY HAS WRITTEN YET was not channelized — the key
  // only appears once something sets it — so a script reading a fresh channel got the channel
  // OBJECT back instead of its value. The GAIA's arpPattern is exactly that: populated by the
  // session on the first grid edit, absent from the document until then.
  if (node && typeof node === 'object' && !Array.isArray(node)
    && (node._type === 'ValueChannel' || 'currentValue' in node)) {
    return `${path}.currentValue`;
  }

  // `value` is a SHORTHAND, and it wins over any real key — which on a custom component pointed it
  // at `Value.value`, a section that type does not have. So get("distortion.type") and
  // get("distortion.type.value") both resolved to nothing, silently, on a control whose value is
  // sitting in ValueChannels one step away. Every LED column and every custom knob on the GAIA
  // panel reads that way, so a script asking one of them what it was set to got undefined.
  //
  // Only when the shorthand landed nowhere: a control that genuinely has the section keeps it.
  if (node === undefined && path === SHORTHANDS.value) {
    const channels = control?._children?.ValueChannels?._children;
    const main = channels && (channels.value ? 'value' : (channels.mainValue ? 'mainValue' : null));
    if (main) return `ValueChannels._children.${main}.currentValue`;
  }
  return path;
}

/** Map a script path's segments to the model's real-case section path. */
function resolveModelPath(control, segments) {
  // A bare control name means its value — `.value` is documented as the default representation, so
  // get("cutoff") and get("cutoff.value") are the same question. This is also what lets the
  // second-argument form, get("cutoff", "normalizedValue"), find something to normalise.
  if (segments.length === 0) return channelizePath(control, SHORTHANDS.value);
  const first = String(segments[0]).toLowerCase();
  let path;
  // Single-segment shorthand (e.g. "visible", "x", "value") — canonical, wins over any stray key.
  if (segments.length === 1 && SHORTHANDS[first]) {
    path = SHORTHANDS[first];
  // Explicit section path (e.g. "background.fill.colour") — walk from the control.
  } else if (control?._children && Object.keys(control._children).some((k) => k.toLowerCase() === first)) {
    path = walkCaseInsensitive(control, segments) ?? segments.join('.');
  } else {
    // Otherwise search each section for the property (e.g. a bare "fill.colour" or a channel name).
    path = null;
    if (control?._children) {
      for (const secKey of Object.keys(control._children)) {
        const sub = walkCaseInsensitive(control._children[secKey], segments);
        if (sub) { path = `${secKey}.${sub}`; break; }
      }
    }
    if (path == null) path = SHORTHANDS[first] ?? segments.join('.');
  }
  return channelizePath(control, path);
}

/** "cutoff.background.fill.colour" -> { name:'cutoff', segs:['background','fill','colour'] } */
function splitScriptPath(path) {
  const parts = String(path).split('.');
  return { name: parts[0], segs: parts.slice(1) };
}

/* ------------------------------------------------------------------ the panel itself */
// `panel` is a reserved first segment addressing the panel DOCUMENT rather than a control, so a
// script can read and write the thing it lives inside: size, name, background, the panic key.
// Until this existed the first segment was always a control name, so asking for the panel's width
// searched for a control called "panel" and reported it missing — a misleading answer.

function isPanelTarget(name) {
  return String(name ?? '').toLowerCase() === PANEL_TARGET;
}

// A control genuinely named "panel" loses to the document. Behaviour that depends on whether
// somebody happened to name a knob "panel" would be worse than a reserved word — but the author
// needs to know that control is no longer reachable by name, so it is reported once.
let warnedPanelNameClash = false;
function warnIfControlNamedPanel() {
  if (warnedPanelNameClash) return;
  const clash = activePanel()?.controls?.some((c) => isPanelTarget(c?._children?.Core?.name));
  if (!clash) return;
  warnedPanelNameClash = true;
  addScriptTrace('error', '',
    'A control on this panel is named "panel", which is a reserved word addressing the panel document. '
    + 'That control cannot be reached by name — rename it.');
}

/** Walk a plain dotted path on the panel object (no _children sections; it is a flat document). */
function panelValueAt(panel, segs) {
  let node = panel;
  for (const seg of segs) {
    if (node == null || typeof node !== 'object') return undefined;
    const key = Object.keys(node).find((k) => k.toLowerCase() === String(seg).toLowerCase());
    if (key == null) return undefined;
    node = node[key];
  }
  return node;
}

function getPanelValue(segs) {
  const panel = activePanel();
  if (!panel) return undefined;
  warnIfControlNamedPanel();
  if (segs.length === 0) {
    // A bare `panel` gives the summary a script usually wants, rather than the whole document.
    return {
      id: panel.id, name: panel.name, width: panel.width, height: panel.height,
      controlCount: Array.isArray(panel.controls) ? panel.controls.length : 0,
    };
  }
  if (segs.length === 1 && String(segs[0]).toLowerCase() === 'controlcount') {
    return Array.isArray(panel.controls) ? panel.controls.length : 0;
  }
  return panelValueAt(panel, segs);
}

function setPanelValue(segs, value, path) {
  const panel = activePanel();
  if (!panel) return;
  warnIfControlNamedPanel();
  if (segs.length === 0) { addScriptTrace('error', '', 'set("panel", …): name a property, e.g. set("panel.width", 800)'); return; }

  const root = String(segs[0]);
  if (PANEL_READONLY_PROPERTIES.some((p) => p.toLowerCase() === root.toLowerCase())) {
    addScriptTrace('error', '',
      `set("panel.${root}", …) is read-only — it is the panel's identity or its structure, and writing it `
      + 'would detach the document from itself. Use the panel/structure verbs for controls.');
    return;
  }

  // The panel's own colours are read as a control's are: "red" is stored as "#FF0000", what the
  // panel cannot read is refused in set()'s words and nothing is written, and a gradient written
  // whole has each of its stops read. They took anything, so "red" was stored as "red" and the
  // background painted nothing. The plug-in's model asks the same question with its window shut.
  const colours = panelColourWrites(`set("${path}")`, 'nothing was set', segs.join('.'), value);
  if (!colours) return;
  value = colours.value;

  // Walk to the leaf's parent, then assign with the document's real-case key.
  let node = panel;
  let top = null;
  for (let i = 0; i < segs.length - 1; i++) {
    if (node == null || typeof node !== 'object') return;
    const key = Object.keys(node).find((k) => k.toLowerCase() === String(segs[i]).toLowerCase());
    if (key == null) { addScriptTrace('error', '', `set("panel.${segs.join('.')}", …): no such property`); return; }
    top ??= key;
    node = node[key];
  }
  if (node == null || typeof node !== 'object') return;
  const last = Object.keys(node).find((k) => k.toLowerCase() === String(segs[segs.length - 1]).toLowerCase())
    ?? segs[segs.length - 1];
  node[last] = value;
  top ??= last;

  // The editor holds panels in a store; the player holds one object. Poke the store so the canvas
  // repaints, exactly as a control write does. By the panel's own key: a write below one
  // (bgGradient.stops.0.color) poked the leaf's name, and left `color: undefined` on the panel.
  if (!host) panels.update((list) => list.map((p) => (p.id === panel.id ? { ...p, [top]: panel[top] } : p)));
}

/* ---------------------------------------------------------------- value representations (Q8) */
// A control value can be asked for three ways: the real value, the 0–1 position, or what the DPD
// would put on the wire. The accessor is a path SUFFIX — get("cutoff.normalizedValue") — or a
// second ARGUMENT — get("cutoff", "normalizedValue"). Both spellings work; the suffix is what the
// picker inserts, the argument is what the engines' host bindings pass. An explicit argument wins.
//
// `.value` is left in the path: it is the shorthand that already resolves to Value.value. The other
// two are stripped, because underneath them the thing being read or written is still the real value
// — the representation is arithmetic applied on the way past.

const DERIVED_ACCESSORS = new Set(VALUE_ACCESSOR_IDS.filter((id) => id !== 'value'));

// An explicit form that is not one of the three used to be dropped here without a word, so
// get("cutoff", "normalisedValue"), British spelling and all, answered the raw 64 rather than 0.5,
// and set("cutoff", 0.5, "normalisedValue") wrote 0.5 into a 0..127 control. A string that is not a
// form now refuses the call: get answers nothing, set writes nothing, and the console names the
// forms, and the one meant when the text is a form written another way (other capitals, the label's
// leading dot, or "normalised"/"normalise" for "normalized"). The player says the same in the same
// words (BridgeScriptHost::formRefusal). Anything but a string is not a form at all and is left as
// it was: set's options table, and whatever else reaches get's second argument.

/** The form `text` is another way of writing, or ''. */
function formMeant(text) {
  const canonical = String(text).trim().toLowerCase().replace(/^\./, '').replace(/normali[sz]e?d?/, 'normalized');
  return VALUE_ACCESSOR_IDS.find((id) => id.toLowerCase() === canonical) ?? '';
}

/** A form in any case and with spaces around it, as the list spells it, or '': "NormalizedValue" is
 *  normalizedValue (utils/wordLists.js). Another spelling ("normalised") is still not a form. */
const formWord = (text) => listWord(VALUE_ACCESSOR_IDS, text) ?? '';

/** The console's line refusing `form`, given explicitly to `call`, or '' when it is a form or none. */
function formRefusal(call, outcome, form) {
  if (typeof form !== 'string' || form === '' || formWord(form)) return '';
  const meant = formMeant(form);
  return `${call}: "${form}" is not a value form, so ${outcome}. The forms are ${andList(VALUE_ACCESSOR_IDS)}.`
    + (meant ? ` Write ${meant}.` : '');
}

function splitAccessor(path, explicitForm) {
  const text = String(path ?? '');
  const form = formWord(explicitForm);
  const dot = text.lastIndexOf('.');
  if (dot > 0) {
    const tail = formWord(text.slice(dot + 1));
    if (DERIVED_ACCESSORS.has(tail)) return { path: text.slice(0, dot), form: form || tail };
  }
  return { path: text, form: form || 'value' };
}

/** The control's own 0–1 range, from Behavior.min/max. null when it has no numeric range. */
function rangeOf(control) {
  const behavior = control?._children?.Behavior;
  const min = Number(behavior?.min);
  const max = Number(behavior?.max);
  return Number.isFinite(min) && Number.isFinite(max) && max !== min ? { min, max } : null;
}

// `.midiValue` is what the DPD codec would encode, and the codec lives in the device host — there
// is no way to answer it from the panel document alone. Say so once, clearly, rather than returning
// undefined and leaving the author to work out which of several things went wrong.
function reportNeedsDeviceHost(member, path) {
  addScriptTrace('error', '',
    `${member} on "${path}" needs the device host — the MIDI encoding is the device profile's, not the panel's. `
    + 'Use .value or .normalizedValue, or run this where the device host is attached.');
}

/* ------------------------------------------------------------- transmit origin (Q2) */
// Mirrors ScriptRuntime's origin tracking exactly, because the two runtimes have to agree on
// whether a given set() reaches the synth. A write is LOUD by default, SILENT while we're
// reacting to something the device just sent us (otherwise filling the panel from a dump echoes
// the whole dump straight back), and an explicit noTransmit()/transmit() block wins over both.
//
// Scope note, deliberately matching the C++ side: these blocks gate set(), NOT the explicit
// senders. sendCC() inside noTransmit() still sends — you asked for a CC, you get a CC.
const origin = {
  inboundDepth: 0,   // >0 while handling inbound MIDI / a dump
  override: -1,      // -1 none, 0 forced silent (noTransmit), 1 forced loud (transmit)
  stack: [],
};

function defaultTransmit() {
  if (origin.override === 0) return false;
  if (origin.override === 1) return true;
  return origin.inboundDepth === 0;
}

function pushTransmit(on) { origin.stack.push(origin.override); origin.override = on ? 1 : 0; }
function popTransmit() { origin.override = origin.stack.length ? origin.stack.pop() : -1; }

// A control's device-parameter binding on its value port, if it has one. Same shape
// deviceBindingSync reads going the other way (device → panel).
function valueBindingFor(control) {
  const bindings = control?._children?.DeviceBindings;
  if (bindings?.enabled === false) return null;
  const list = Array.isArray(bindings?.bindings) ? bindings.bindings : [];
  return list.find((b) => b?.kind === 'deviceParameter' && b?.parameterId
    && String(b.port ?? 'value') === 'value') ?? null;
}

/**
 * What a write stores in the colour properties it reaches: `{ value }`, the value to write, with
 * each colour in it as scriptColours.panelColour stores it ("red" as "#FF0000", "#000" as
 * "#000000"); or null when one of them is something the panel cannot read, and then each such
 * property has been reported, once, and nothing is to be written.
 *
 * Which properties hold colours comes from the section templates (scriptColours.colourFieldAt), so
 * Icon.tint is one and Pixel.imageColour, a switch, is not. `root` is the control, or for a state's
 * part patch the part, and `path` is relative to it: set()'s model path, or a patch map's key. A
 * whole section or list written at once is looked into, field by field. `place(at, path)` says
 * where in the write a refused colour is, for the message: below `path` by default, as set() says
 * it ("at colour"); `wholePath` for a call whose own arguments do not already say which property it
 * was; componentPlace for a component verb, which counts list positions from 1.
 */
function colourWrites(call, outcome, root, path, value, place = belowPath, say = null) {
  return readColours(call, outcome, path, place,
    (colour) => mapColourWrites(root, path, value, colour), say);
}

/** The same for a write to the panel document itself, `path` below the panel: the panel's own
 *  colours (bgColour, the tints, the grid's, the gradient's stops) are read by the same rule
 *  (scriptColours.panelColourFieldAt), in the same words. */
function panelColourWrites(call, outcome, path, value) {
  return readColours(call, outcome, path, belowPath,
    (colour) => mapPanelColourWrites(path, value, colour));
}

/** `say`, where given, writes the line from where the colour is, why it is refused and the advice:
 *  a component verb's, in the form its other refusals take. */
function readColours(call, outcome, path, place, map, say = null) {
  // Asked only of a control-set reference, so an ordinary write does not look the set up.
  const resolves = (name) => resolveToken(name, controlSetForPanel(activePanel())) !== undefined;
  let refused = false;
  const stored = map((at, written, field) => {
    const read = panelColour(written, field, resolves);
    if (!read.why) return read.colour;
    refused = true;
    addScriptTrace('error', '', say ? say(place(at, path), read.why, read.advice)
      : `${call}: ${place(at, path)}${read.why}, so ${outcome}. ${read.advice}`);
    return written;
  });
  return refused ? null : { value: stored };
}

/** Where a refused colour is, below the path the call wrote: "at colour, ", or '' at the path. */
function belowPath(at, path) {
  return at === path ? '' : `at ${at.slice(path.length + 1)}, `;
}

/** …or by its whole path, for the calls that write several: 'at "Background.Fill.colour", '. */
function wholePath(at) {
  return `at "${at}", `;
}

// The third argument carries two different things, as the contract's own signature does:
// set(path, value, opts) with { transmit }, and the second-argument spelling of the value form.
// A string is a form, an object is opts.
// The value of a range control (a Knob, a Slider, a Number, a Range) and any .normalizedValue are
// numbers: text that is one is read as one, and anything else is refused, where "x" was written as
// given. One bound to a device parameter is read by the binding instead. BridgeScriptHost::setValue
// says the same.
function setNumber(path, value) {
  const n = realNumber(value);
  if (n === undefined) addScriptTrace('error', '', `set("${path}"): ${shownValue(value)} is not a number, so nothing was set.`);
  return n;
}

// A script's set(): a value left out is refused, where it was written as nothing. The plug-in's host
// says the same (BridgeScriptHost::setValue). A colour property says it in its own words, with the
// forms a colour takes (colourWrites). The runtime's own writes go to setValue directly.
function scriptSet(path, value, form) {
  if ((value === undefined || value === null) && !isColourPath(splitAccessor(String(path), typeof form === 'string' ? form : '').path)) {
    addScriptTrace('error', '', `set("${path}"): no value was given, so nothing was set.`);
    return;
  }
  setValue(path, value, typeof form === 'string' || isOptionsTable(form) ? form : '');
}

function setValue(path, value, formOrOpts = '') {
  // A write outside any handler (after(), a timer's own callback) raises the value events itself:
  // origin() then says a script made it, unless whoever called this said otherwise first.
  if (!dispatchingNow() && panelsOrigin == null) {
    panelsOrigin = 'script';
    // A write that changed nothing raises nothing, and must not lend its origin to a later one.
    queueMicrotask(() => { panelsOrigin = null; });
  }
  const form = typeof formOrOpts === 'string' ? formOrOpts : '';
  const opts = formOrOpts && typeof formOrOpts === 'object' ? formOrOpts : null;
  const notAForm = formRefusal(`set("${path}")`, 'nothing was set', form);
  if (notAForm) { addScriptTrace('error', '', notAForm); return; }
  const addressed = splitAccessor(path, form);
  const { name, segs } = splitScriptPath(addressed.path);
  if (isPanelTarget(name)) { setPanelValue(segs, value, path); return; }
  const control = findControlByName(name);
  if (!control) { addScriptTrace('error', '', `set: control "${name}" not found on the active panel`); return; }

  if (addressed.form === 'midiValue') { reportNeedsDeviceHost('set(.midiValue)', addressed.path); return; }
  if (addressed.form === 'normalizedValue') {
    const range = rangeOf(control);
    if (!range) {
      addScriptTrace('error', '', `set: "${name}" has no numeric range (Behavior.min/max), so .normalizedValue means nothing here`);
      return;
    }
    const position = setNumber(path, value);
    if (position === undefined) return;
    // Clamp: a 0–1 position outside 0–1 is a bug in the caller's maths, and letting it through
    // would drive the control past its own limits.
    const t = Math.max(0, Math.min(1, position));
    // Boolean controls must keep their raw value type after a normalized write.
    const valueType = String(control?._children?.Behavior?.valueType ?? "").toLowerCase();
    value = valueType === "bool" || valueType === "boolean"
      ? t >= 0.5
      : range.min + t * (range.max - range.min);
  }

  const modelPath = resolveModelPath(control, segs);
  // A script renaming a control follows the same rule as the editor: no dots in a name.
  if (modelPath === 'Core.name') value = sanitizeControlName(value);

  // intercept(): the script's filters get the value before the model does, so a rule like "this
  // knob only takes even numbers" holds for every write rather than being re-checked at each
  // call site. Skipped while a filter is already running — an interceptor that writes to its own
  // path would otherwise re-enter itself forever.
  if (filters.length && !interceptDepth) {
    const key = `${String(control._children.Core.name ?? control._children.Core.id)}.${modelPath}`.toLowerCase();
    interceptDepth += 1;
    let decided;
    try { decided = applyIntercepts(key, value, valueAtPath(control, modelPath)); }
    finally { interceptDepth -= 1; }
    if (decided === REJECTED) return;
    value = decided;
  }

  // A colour the panel cannot read used to be stored as written and painted white ("#000", "red",
  // a number). Read here, after the filters have had their say (so what a filter returns is read
  // too) and before anything is written: CSS's short forms are written out, so "red" is stored as
  // "#FF0000", and what has no one reading is refused with the form to write instead.
  // ce.panel.patch asks the same question of its entries, ce.panel.create and clone of their props'
  // sections (sectionOverrides), and the component verbs of what they write (writeComponentFields).
  const colours = colourWrites(`set("${path}")`, 'nothing was set', control, modelPath, value);
  if (!colours) return;
  value = colours.value;
  // A control bound to a device parameter is read by its binding, which takes a choice by its name
  // ("LP") and says what it cannot read.
  if (isLiveValuePath(modelPath) && String(control?._children?.Behavior?.family ?? '').trim().toLowerCase() === 'range'
      && !valueBindingFor(control)) {
    const n = setNumber(path, value);
    if (n === undefined) return;
    value = n;
  }

  // A write that goes nowhere used to VANISH. The contract's own headline (Q1) is that coverage is
  // total and you can never pick wrong, so a path that resolves to nothing has to say so — without
  // it every structural gap behind it is invisible.
  //
  // Who answers depends on who owns the document. The player host has its own write semantics (a
  // live value goes through the preview session, which needs no Value section at all), so it is
  // asked rather than second-guessed; a host that returns nothing is not making a claim, and is
  // taken at its word rather than reported on.
  // Landing but CREATING a key on a typed section node is almost always a typo: Font has a fixed
  // shape of 41 fields, so `Text.Font.sze` writes a property nothing reads. Free-form maps (a
  // state's `when`, a patch map) are untyped and take new keys by design, so they stay quiet.
  //
  // Asked BEFORE the write, and asked regardless of who performs it. Two things were wrong before:
  //
  //  * It was written as an `else if` beside the landing branch, which made it unreachable —
  //    probeNestedWrite reports writes:true for any target it can resolve, a fresh key included,
  //    and reports fresh:false whenever writes is false, so the state it tested for could never
  //    coincide with the branch it was on. The wording already described a write that HAD happened
  //    ("It was written, but nothing reads it"), which is the tell.
  //  * It only ran on the no-host path. But whether a key is new on a fixed-shape section is a
  //    question about the control tree, not about the host's write semantics — a typo is a typo in
  //    the player too. `wrote` still comes from the host, which is the part only the host knows.
  const shape = probeNestedWrite(control, modelPath, value);

  // A control's live value is session state in BOTH runtimes (scripting/liveValue.js). The player
  // has always done this through its host; the editor used to fall through to a document write at
  // `Value.value`, a path Knob and Slider do not have — so the headline call of the whole API moved
  // the knob in the shipped plugin and did nothing in the preview the author was testing in.
  // A custom component's channel is live too, and has to be WRITTEN where it is READ. Its own patch
  // rather than liveValuePatch, which sets one unnamed `valueOverride` — see liveValue.js.
  const channelName = customChannelOfPath(control, modelPath);
  if (channelName) {
    const refusal = whyChannelNotWritable(control, channelName);
    if (refusal) {
      addScriptTrace('error', '', `set("${path}"): ${refusal}.`);
      return;
    }
  }

  const live = (isLiveValuePath(modelPath) && hasLiveValue(control)) || channelName != null;
  const liveId = live ? String(control?._children?.Core?.id ?? '') : '';

  let wrote = true;
  if (host) {
    wrote = host.writeValue(control, modelPath, value) !== false;
    noteHostWrite(modelPath);
  } else if (live && liveId) {
    updatePanelPreviewSession(liveId, channelName
      ? customChannelPatch(control, channelName, value, get(panelPreviewSessions))
      : liveValuePatch(value, control, get(panelPreviewSessions)));
    wrote = true;
  } else {
    wrote = shape.writes;
    if (wrote && (shape.fresh || !Object.is(valueAtPath(control, modelPath), value))) {
      // Status/name polling often writes the same text or colour repeatedly.
      // Avoid cloning the control and waking every document watcher for a no-op.
      // Continue below: an explicit device send still has its normal semantics.
      // Out of the scenery ground, for good — see stores/scriptTouchedControls.js. A folded control
      // a script writes to would otherwise re-bake the whole ground on every write.
      noteEditorScriptTouchedControl(control?._children?.Core?.id);
      writeEditorControlProperty(control, modelPath, value);
    }
  }

  // A live value needs no `Value` section to move, so the fresh-key warning does not apply to it —
  // Button has that section without the field, and would otherwise warn on every write.
  if (wrote && !live && shape.fresh && shape.typed) {
    addScriptTrace('warn', '',
      `set("${path}"): "${modelPath}" is a new property on a section with a fixed shape. `
      + 'It was written, but nothing reads it — check the spelling.');
  }

  if (!wrote) {
    const section = String(modelPath).split('.')[0];
    const hasSection = control?._children?.[section] !== undefined;
    addScriptTrace('error', '',
      `set("${path}"): nothing was written — "${modelPath}" does not lead anywhere on "${name}". `
      + (hasSection
        ? 'A child in the middle of the path is missing. A state patch key like '
          + '"Background.Fill.colour" is ONE map key rather than three path steps, and is reached '
          + 'with ce.panel.patch() instead.'
        : `"${section}" is not a section this control has. Add it in the Properties panel, or `
          + 'address a section it does have — ce.panel.info() lists them.'));
  }

  // Transmit-by-default: a bound control's value write also goes to the synth, which is what the
  // C++ runtime does. Without this the same script moved the knob window-closed and only moved
  // the picture window-open. An explicit opts.transmit beats the origin rule, as it does there —
  // this runtime used to accept the option and drop it.
  const transmit = opts && 'transmit' in opts ? opts.transmit !== false : defaultTransmit();
  if (!transmit) return;
  if (String(modelPath).toLowerCase() !== 'value' && !String(modelPath).toLowerCase().endsWith('.value')) return;
  const binding = valueBindingFor(control);
  if (!binding) return;
  const bindingRole = binding.deviceRole ?? DEFAULT_ROLE;
  // A binding made by bind() onto a parameter the script declared has no profile behind it, so it
  // is compiled from the declaration and sent raw. Without this the control moved and nothing left
  // the machine, which is exactly the "self-building panel builds dead controls" this pair exists
  // to fix — half-fixed would have been worse than not fixed, because the wiring would look done.
  if (hasDefinedParameter(bindingRole, binding.parameterId)) {
    const encoded = encodeRuntimeParameter(bindingRole, binding.parameterId, value);
    if (encoded.ok) sendRawMidi(encoded.bytes, `param_${binding.parameterId}`);
    else addScriptTrace('error', '', `set("${path}"): ${encoded.error}`);
    return;
  }
  commitDeviceParameter({
    deviceRole: bindingRole,
    parameterId: binding.parameterId,
    value,
    interactionPhase: 'commit',
    dryRun: false,
  });
}

/* What get() says when it has no answer because the script asked for something that is not there.
 *
 * set() always reported a control it could not find and a path that led nowhere. get() returned
 * nothing for both, so get("cutof.value") and get("cutoff.vlaue") read exactly like a control whose
 * value is unset, and the mistake surfaced wherever the nothing was used. It says so now, in set()'s
 * words, and still returns nothing.
 *
 * Only for a script's own get(): the runtime asks getValue whether a section exists all the time
 * (ce.image, ce.text, snapshot), and the debugger's watch panel reads whatever is typed into it.
 *
 * "Not there" is decided without false alarms: a value the session holds (a knob's live value, a
 * custom component's channel) is never reported, nor a key absent from a free-form map (a state's
 * `when`), nor a property the section's own type has, written or not. What is reported is a path no
 * reading of which resolves (not a shorthand, a section or a property of any section), and an
 * explicit section path that stops short or names a property its section's type does not have.
 * The exported plug-in's PanelValueModel::whyNoAnswer gives the first two cases in the same words. */
function getFoundNothing(path, what, control) {
  addScriptTrace('error', '', `get("${path}"): "${what}" does not lead anywhere on "${control}", so there is no answer.`);
}

/** No reading of `segs` resolves on `control`: resolveModelPath fell through every branch. */
function pathReadsNothing(control, segs) {
  if (!segs.length) return false;
  const first = String(segs[0]).toLowerCase();
  if (SHORTHANDS[first]) return false;
  const sections = Object.keys(control?._children ?? {});
  if (sections.some((k) => k.toLowerCase() === first)) return false;
  return !sections.some((key) => walkCaseInsensitive(control._children[key], segs));
}

/** An explicit section path that stops short, or names what its section's type does not have. */
function sectionPathMisses(control, modelPath) {
  if (!probeNestedWrite(control, modelPath, undefined).writes) return true;
  const parts = String(modelPath).split('.');
  if (parts.length < 2) return false;
  const parent = valueAtPath(control, parts.slice(0, -1).join('.'));
  // A parent that is only a template (an effect nobody has edited) cannot be asked.
  if (!parent || typeof parent !== 'object' || typeof parent._type !== 'string') return false;
  const key = parts[parts.length - 1];
  if (parent[key] !== undefined || parent._children?.[key] !== undefined) return false;
  const template = SECTION_DEFAULTS[parent._type];
  return !(template && (key in template || template._children?.[key] !== undefined));
}

function getValue(path, form = '', report = false) {
  const notAForm = formRefusal(`get("${path}")`, 'there is no answer', form);
  if (notAForm) { addScriptTrace('error', '', notAForm); return undefined; }
  const addressed = splitAccessor(path, form);
  const { name, segs } = splitScriptPath(addressed.path);
  if (isPanelTarget(name)) return getPanelValue(segs);
  const control = findControlByName(name);
  if (!control) {
    if (report) addScriptTrace('error', '', `get: control "${name}" not found on the active panel, so there is no answer.`);
    return undefined;
  }

  if (addressed.form === 'midiValue') { reportNeedsDeviceHost('get(.midiValue)', addressed.path); return undefined; }

  const modelPath = resolveModelPath(control, segs);
  let raw;
  if (host) {
    raw = host.readValue(control, modelPath);
  } else {
    // Same order the player's host reads in: the session first, the document behind it.
    raw = readsLiveValue(control, modelPath)
      ? readLiveValue(get(panelPreviewSessions), control, modelPath)
      : undefined;
    if (raw === undefined) raw = valueAtPath(control, modelPath);
  }
  // A colour the document holds as a control-set reference ('{surface}', models/controlSets.js)
  // reads as the literal the panel's set gives it — the answer the exported plugin gives too,
  // whose payload was baked at export. A script should never see the reference.
  if (typeof raw === 'string' && isTokenReference(raw)) raw = resolveColourValue(raw, controlSetForPanel(activePanel()));
  if (report && raw === undefined && !readsLiveValue(control, modelPath) && customChannelOfPath(control, modelPath) == null) {
    const explicitSection = segs.length > 1
      && Object.keys(control._children ?? {}).some((k) => k.toLowerCase() === String(segs[0]).toLowerCase());
    if (pathReadsNothing(control, segs)) {
      getFoundNothing(addressed.path, segs.join('.'), name);
      return undefined;
    }
    if (explicitSection && sectionPathMisses(control, modelPath)) {
      getFoundNothing(addressed.path, modelPath, name);
      return undefined;
    }
  }
  if (addressed.form !== 'normalizedValue') return raw;

  const range = rangeOf(control);
  if (!range) {
    addScriptTrace('error', '', `get: "${name}" has no numeric range (Behavior.min/max), so .normalizedValue means nothing here`);
    return undefined;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(1, (n - range.min) / (range.max - range.min)));
}

/** Read a control value at a path, for the debugger's watch panel. Never throws. */
export function readWatch(path) {
  try { return getValue(path); } catch { return undefined; }
}

/* ------------------------------------------------------------------ helpers (pure) */

// @module ce.math
/* ------------------------------------------------------------------------ colour arithmetic */
// The app's own, ported rather than restated for the reason every table in this file is: a script
// lightening a colour and the border renderer lightening the same colour have to agree, or a
// script-drawn highlight sits a shade off the one beside it.
//
// One accepted input, three forms out, and the difference matters. The app STORES colours as
// AARRGGBB (JUCE's order — '66FFFFFF' is a 40%-opaque white in every panel document). CSS and SVG
// want #RRGGBB or #RRGGBBAA — the SAME four bytes in a DIFFERENT order, which is the trap this
// pair of formats sets. So: everything takes what a colour property takes, everything returns
// "#RRGGBB" which both CSS and a panel property accept, and ONE verb — alpha() — returns the
// panel's AARRGGBB, because that is the only form a stored colour can carry an alpha in. Making a
// DRAWING translucent is ce.draw.opacity(), which is a different question with a different answer.
//
// READING. A colour is read as if what a property would store for it had been given
// (scriptColours.storedColour): 6 hex digits are RRGGBB, 8 are AARRGGBB with the alpha set aside,
// one leading "#" either way, and CSS's short forms are written out first as set() writes them out
// ("#000" is "#000000", "red" is "#FF0000", rgba(255, 0, 0, 0.5) is "80FF0000"). This used to take
// the last six characters of whatever it was given, so text that is no colour at all ("x5B9BD5",
// "#12#34#56", the number 0xFF0000) read as one and nothing said so. Anything else is refused, in
// the words of each prelude's __cchan, which reads the short forms with its own port of
// scriptColours' CSS reading and the generated names table. Eight digits are still AARRGGBB, so
// CSS's "#5B9BD580" reads as 9BD580, which is the colour a property would paint for it.
//
// AMOUNTS. lighten, darken and alpha take a number from 0 to 1. One outside it used to be used as
// it was (lightening by 40 gave white) or clamped (an alpha of 128 gave solid). It is refused, with
// the number out of 100 when that is what it looks like, in the words of each prelude's __cunit.


/** A colour a property could store -> [r, g, b], or null after saying why it cannot be read. */
function colourChannels(verb, hex) {
  const stored = storedColour(hex);
  if (stored) {
    const h = stored.slice(-6);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  let why;
  if (hex === undefined || hex === null) why = 'no colour was given';
  else if (typeof hex === 'string') why = `"${hex}" is not a colour`;
  else if (typeof hex === 'number' && Number.isFinite(hex)) why = `${shownNumber(hex)} is not a colour`;
  else why = 'the colour given is not text';
  addScriptTrace('error', '', `${verb}: ${why}, so there is no answer. ${COLOUR_FORMS}.${colourHint(hex)}`);
  return null;
}

/** A 0..1 amount, or its default when one was left out, or undefined after saying why not. */
function colourUnit(verb, what, value, fallback) {
  if ((value === undefined || value === null) && fallback !== undefined) return fallback;
  const problem = unitProblem(what, value);
  if (!problem) return realNumber(value);
  addScriptTrace('error', '', `${verb}: ${problem.why}, so there is no answer.${problem.hint}`);
  return undefined;
}

/** A number a ce.math command was given, or undefined after an error in the console. Left out, it
 *  is `fallback` when there is one; text that is a number is read as one. Anything else used to be
 *  read as 0, or as NaN, in silence, and differently in each runtime: Python read "128" as 0 where
 *  the others read 128. The preludes' __mnum is its twin, word for word. */
function mathNumber(verb, what, value, fallback) {
  if ((value === undefined || value === null) && fallback !== undefined) return fallback;
  const n = realNumber(value);
  if (n !== undefined) return n;
  addScriptTrace('error', '', value === undefined || value === null
    ? `${verb}: ${what} is a number, and none was given, so there is no answer.`
    : `${verb}: ${what} is a number, and ${shownValue(value)} is not, so there is no answer.`);
  return undefined;
}

/** ce.math.hex: each part left out is 0, and one that is not a number is refused. */
function colourFromParts(r, g, b) {
  const parts = [];
  for (const [v, what] of [[r, 'the red part'], [g, 'the green part'], [b, 'the blue part']]) {
    const n = mathNumber('ce.math.hex', what, v, 0);
    if (n === undefined) return undefined;
    parts.push(n);
  }
  return colourFromRgb(...parts);
}

/** ce.math.fromHsl: the same, for hue, saturation and lightness. */
function colourFromHslParts(h, s, l) {
  const parts = [];
  for (const [v, what] of [[h, 'the hue'], [s, 'the saturation'], [l, 'the lightness']]) {
    const n = mathNumber('ce.math.fromHsl', what, v, 0);
    if (n === undefined) return undefined;
    parts.push(n);
  }
  return colourFromHsl(...parts);
}

function colourToRgb(hex) {
  const rgb = colourChannels('ce.math.rgb', hex);
  return rgb ? { r: rgb[0], g: rgb[1], b: rgb[2] } : undefined;
}

/** Scale each channel toward 255. The border renderer's `lighten`, default and all. */
function colourLighten(hex, amount) {
  const rgb = colourChannels('ce.math.lighten', hex);
  if (!rgb) return undefined;
  const f = colourUnit('ce.math.lighten', 'the amount', amount, 0.4);
  if (f === undefined) return undefined;
  return colourFromRgb(rgb[0] + (255 - rgb[0]) * f, rgb[1] + (255 - rgb[1]) * f, rgb[2] + (255 - rgb[2]) * f);
}

/** Scale each channel toward 0. The border renderer's `darken`, whose 0.55 default is the groove
 *  shading — so a script drawing a bevel matches the one the panel draws. */
function colourDarken(hex, amount) {
  const rgb = colourChannels('ce.math.darken', hex);
  if (!rgb) return undefined;
  const f = colourUnit('ce.math.darken', 'the amount', amount, 0.55);
  if (f === undefined) return undefined;
  return colourFromRgb(rgb[0] * f, rgb[1] * f, rgb[2] * f);
}

/** Blend two colours. NOT an app algorithm and said so: it is lerp() per channel, in plain RGB,
 *  which is the blend a meter fading from green to red actually wants. */
function colourMix(a, b, t) {
  const x = colourChannels('ce.math.mix', a);
  if (!x) return undefined;
  const y = colourChannels('ce.math.mix', b);
  if (!y) return undefined;
  const n = mathNumber('ce.math.mix', 't', t, 0);
  if (n === undefined) return undefined;
  const f = Math.min(1, Math.max(0, n));
  return colourFromRgb(x[0] + (y[0] - x[0]) * f, x[1] + (y[1] - x[1]) * f, x[2] + (y[2] - x[2]) * f);
}

/** The PANEL's form: AARRGGBB, which is what a stored colour property holds. See the note above —
 *  CSS's #RRGGBBAA is the same bytes the other way round, and mixing them up is silent. */
function colourWithAlpha(hex, a) {
  const rgb = colourChannels('ce.math.alpha', hex);
  if (!rgb) return undefined;
  const f = colourUnit('ce.math.alpha', 'the alpha', a);
  if (f === undefined) return undefined;
  const aa = Math.round(f * 255).toString(16).padStart(2, '0');
  return (aa + colourFromRgb(rgb[0], rgb[1], rgb[2]).slice(1)).toUpperCase();
}

/** A colour written with its alpha first (fromARGB) or last (fromRGBA), in the form every reader
 *  reads one way: "#RRGGBB" when solid, AARRGGBB when not. In each prelude's __corder words. */
function colourFromOrder(verb, order, value) {
  const colour = orderedColour(value, order);
  if (colour) return colour;
  let why;
  if (value === undefined || value === null) why = 'no colour was given';
  else if (typeof value === 'string') why = `"${value}" is not a colour written ${order === 'argb' ? 'AARRGGBB' : 'RRGGBBAA'}`;
  else if (typeof value === 'number' && Number.isFinite(value)) why = `${shownNumber(value)} is a number, not text`;
  else why = 'the colour given is not text';
  addScriptTrace('error', '', `${verb}: ${why}, so there is no answer. ${ORDERED_FORMS[order]}`);
  return undefined;
}

/** Hue 0-360, saturation and lightness 0-100 — the colour editor's own ranges. */
function colourToHsl(hex) {
  const rgb = colourChannels('ce.math.hsl', hex);
  return rgb ? hslOfChannels(rgb) : undefined;
}

// @module ce.music
const musicMod12 = (n) => ((Math.floor(n) % 12) + 12) % 12;

// A pitch argument is a MIDI number or a name ("C4"), the way sendNote's already is. An unreadable
// name used to be 0 here, because a nil root would have turned one bad string into an unexplained
// nil list: so ce.music.scale("c4") answered with the scale on C-1, and nothing said why. It is
// undefined now, and the helper that asked refuses through musicPitchOf, which does the explaining.
// An unknown scale or chord name already answered nothing, just as silently; musicSetOf says so.
// Both are in the words of each prelude's __pitchOf and __setOf. Each helper checks its scale or
// chord first, then its notes in argument order, and stops at the first that cannot be read.
// A number has to be a finite one: NaN, true or a table went through Number(v) || 0 and rooted the
// answer at C-1 or C#-1 just as an unreadable name had. The answer itself may pass 127 (a chord on
// G9 does), since these compute pitches; a sender refuses one that is not a MIDI note.
const musicPitch = (v) => (typeof v === 'string' ? noteNumberOf(v)
  : typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : undefined);
// A name in any case (utils/wordLists.js): "Dorian" and "MAJ7" are dorian and maj7. Never one of
// Object's own: table["toString"] was a function.
const musicSteps = (table, name) => {
  if (name == null) return table.major;
  const word = listWord(Object.keys(table), String(name));
  return word ? table[word] : undefined;
};
function musicPitchOf(verb, v) {
  // A note left out altogether went the numeric way and became 0, the scale on C-1 again.
  if (v === undefined || v === null) {
    addScriptTrace('error', '', `${verb}: no note was given, so there is no answer. A note is a MIDI `
      + 'number or a name, such as 60 or "C4".');
    return undefined;
  }
  const n = musicPitch(v);
  if (n === undefined) {
    addScriptTrace('error', '', typeof v === 'string'
      ? `${verb}: "${v}" is not a note name, so there is no answer. A name is `
        + 'a letter from A to G, then # or b if it has one, then the octave: "C4", "Eb3", "F#-1".'
      : `${verb}: ${shownValue(v)} is not a note, so there is no answer. A note is a MIDI `
        + 'number or a name, such as 60 or "C4".');
  }
  return n;
}
function musicSetOf(verb, kind, name) {
  const steps = musicSteps(kind === 'chord' ? CHORDS : SCALES, name);
  if (!steps) {
    addScriptTrace('error', '', `${verb}: "${name}" is not a ${kind}, so there is no answer. The ${kind}s `
      + `are ${(kind === 'chord' ? CHORD_NAMES : SCALE_NAMES).join(', ')}.`);
  }
  return steps;
}
const musicNotes = (verb, kind, root, name) => {
  const steps = musicSetOf(verb, kind, name);
  if (!steps) return undefined;
  const base = musicPitchOf(verb, root);
  if (base === undefined) return undefined;
  return steps.map((x) => base + x);
};
// Sorted ascending, which is what every voicing rule below assumes.
// ce.music's lists of notes, read as noteLists.js reads them: a number, a note name or text that
// is a number, and one that is neither refuses the call where it is. They were read as numbers, so
// a chord written by name was an empty one, without a word. null for a list refused.
function musicNoteList(memberId, name, list) {
  const { notes, refused } = noteList(memberId, name, list);
  if (refused) { addScriptTrace('error', '', refused); return null; }
  return notes;
}
const musicSorted = (notes) => notes.slice().sort((a, b) => a - b);
// A word or a count used as its default, said once (noteLists.js); resetScriptState clears it.
const musicWarned = new Set();
function musicSaid(said) {
  if (!said || musicWarned.has(said)) return;
  musicWarned.add(said);
  addScriptTrace('warn', '', `${said} This is said only the first time.`);
}
// degreeChord's step and size: left out, the default; a number, or text that is one, rounded down;
// anything else the default, said once. Written out rather than leaning on falsiness, because
// `0 || 3` is 3 in JavaScript and Python and 0 in Lua — and a degree or a size differing by one
// between runtimes is a chord differing by a third. They were read with each language's own
// conversion, so "x" was the default without a word, null was step 0 here and 1 in Lua, and "0x10"
// was 16 in two runtimes and the default in the third.
function musicStep(what, v, fallback) {
  if (v === undefined || v === null) return fallback;
  const n = realNumber(v);
  if (n !== undefined) return Math.floor(n);
  musicSaid(`ce.music.degreeChord: ${what} is ${shownValue(v)}, which is not a number, so ${fallback} was used.`);
  return fallback;
}

// Stack scale thirds from a 0-based degree — the Chord Pad's `stackedChord`, offsets from the
// TONIC. Wrapping past the top of the scale adds an octave, so degree 8 of a seven-note scale is
// the I chord one octave up rather than an error.
const musicStack = (steps, degree, size) => {
  const n = steps.length;
  const out = [];
  for (let k = 0; k < Math.max(2, size); k += 1) {
    const idx = degree + k * 2;
    out.push(steps[((idx % n) + n) % n] + Math.floor(idx / n) * 12);
  }
  return out;
};
// Every octave-rotation of a chord, up and down — the candidates a voice-leading rule picks from.
const musicInversions = (notes, spread = 2) => {
  const base = notes.slice();
  const out = [base];
  const span = Math.max(1, base.length - 1) * spread;
  let cur = base;
  for (let i = 0; i < span; i += 1) { cur = [...cur.slice(1), cur[0] + 12].sort((a, b) => a - b); out.push(cur); }
  cur = base;
  for (let i = 0; i < span; i += 1) { cur = [cur[cur.length - 1] - 12, ...cur.slice(0, -1)].sort((a, b) => a - b); out.push(cur); }
  return out;
};
// Each voice to its NEAREST note in the other chord — voice counts differ (a triad following a
// seventh), so pairing by index would compare nonsense.
const musicMotion = (a, b) => a.reduce((sum, n) => sum + Math.min(...b.map((m) => Math.abs(n - m))), 0);

// A roman numeral for a chord root, spelled against the MAJOR scale so borrowed degrees read as
// ♭III / ♭VI / ♭VII the way the Chord Pad's wheel labels them. Minor-ish qualities go lowercase.
const musicRoman = (rootSemitone, quality) => {
  const semi = musicMod12(rootSemitone);
  let best = 0;
  let acc = '';
  for (let d = 0; d < 7; d += 1) {
    const diff = musicMod12(semi - SCALES.major[d]);
    if (diff === 0) { best = d; acc = ''; break; }
    if (diff === 11) { best = d; acc = '♭'; }              // a semitone below degree d
    else if (diff === 1 && acc === '') { best = d; acc = '♯'; }
  }
  let r = ROMAN[best];
  if (MINOR_QUALITY_NAMES.includes(quality)) r = r.toLowerCase();
  if (quality === 'dim' || quality === 'dim7' || quality === 'm7b5') r += '°';
  if (quality === 'aug') r += '+';
  return acc + r;
};
// @module ce.time
// A monotonic millisecond reading. NOT a wall clock and NOT a date: the origin is arbitrary and
// only DIFFERENCES mean anything. That is deliberate — a wall clock jumps when the machine syncs
// its time, and a script measuring an interval across that jump measures the jump.
//
// This is a Q10 exception, and a sharp one. The Lua engine opens base, math, string and table and
// NOT os, so a Lua script has no clock at all; QuickJS has Date and Python has time, and the three
// disagree about epoch and unit. So "use the language's own" was never available here.
const NOW_EPOCH = (typeof performance !== 'undefined' && typeof performance.now === 'function')
  ? null : Date.now();
const nowMsRead = () => (NOW_EPOCH === null ? performance.now() : Date.now() - NOW_EPOCH);

// A division is the panel's own vocabulary — "1/16", "1/8T", "1/4D" — and every sequencer property
// speaks it. An unknown name returns nothing rather than the component's 1/16 fallback: a component
// must keep running, a script that mistyped one should find out. It found out only by getting
// nothing, so this says so as well, in the same words as each prelude's __division. Any case is
// read: "1/8t" is "1/8T", because the names differ only by D and T and nothing is ambiguous. The
// table's own id comes back, because the transport's functions look the name up again.
function divisionId(verb, name) {
  const id = divisionIdOf(name);
  if (id === undefined) {
    // A division left out is named as such: "undefined", "nil" and "None" were the same mistake
    // printed three ways.
    addScriptTrace('error', '', `${verb}: ${name === undefined || name === null ? 'no division given'
      : `${shownValue(name)} is not a division`}, so there is no answer. The divisions are ${DIVISION_NAMES.join(', ')}.`);
  }
  return id;
}

// @module ce.math
// A seeded xorshift32, written the same way in every prelude and masked to 32 bits at every step.
// Seeded is the whole point: the language's own math.random cannot promise the same sequence in
// five runtimes, so a "random" patch could not be reproduced and a generative sequence would sound
// different in the editor and in the export.
const DEFAULT_SEED = 0x9E3779B9;

// ONE GENERATOR PER (SCRIPT, STREAM), not one for the whole runtime.
//
// It used to be a single module-level state, and that was wrong in two directions at once. Across
// scripts it was a cross-runtime DIVERGENCE: the C++ JavaScript and Python engines give each script
// its own engine or namespace, so the generator was already per script there, while Lua's prelude
// runs once into shared globals and this runtime kept one variable — so a panel with two generative
// scripts produced different output in the editor than in the export, and different again depending
// on which language the scripts were written in. That breaks the one rule Model 2 exists for.
//
// Within a script it was coupling: shuffle() advanced the same state gaussian() read, so two
// generative elements interfered and reseeding one reset the other.
//
// Keyed by script AND stream fixes both. A fresh key starts from the same default seed, so an
// untouched stream is still deterministic.
const randomStates = new Map();

// The stream in force, set by randomStream(name, fn) for the duration of the block. Module-level
// rather than threaded through nine signatures, for the reason routeMidi is a block: the stream is
// a decision about a RUN of draws, not about one of them.
let streamOverride = null;

function randomKey(scriptId) {
  return `${scriptId ?? ''}\u0000${streamOverride ?? ''}`;
}

function randomNext(scriptId) {
  const key = randomKey(scriptId);
  let x = randomStates.get(key) ?? DEFAULT_SEED;
  x = (x ^ (x << 13)) >>> 0;
  x = (x ^ (x >>> 17)) >>> 0;
  x = (x ^ (x << 5)) >>> 0;
  randomStates.set(key, x);
  return x / 4294967296;      // [0, 1)
}

function randomSeedImpl(scriptId, n) {
  const v = Math.floor(Number(n) || 0) >>> 0;
  // 0 is a dead state for xorshift — it would return zero forever — so it means "the default"
  // rather than "a generator that never moves".
  randomStates.set(randomKey(scriptId), v === 0 ? DEFAULT_SEED : v);
}

/**
 * randomStream(name, fn) — draws inside the block come from a generator of their own.
 *
 * A block rather than a name argument on nine verbs, which is the shape routeMidi already uses and
 * for the same stated reason. Restored in a `finally`, so a throw inside cannot leave every later
 * draw in the session pointed at the wrong stream.
 */
function randomStreamImpl(scriptId, name, fn) {
  if (typeof fn !== 'function') {
    addScriptTrace('error', scriptId ?? '', 'stream(name, fn) needs a block to run — nothing was drawn');
    return;
  }
  const previous = streamOverride;
  streamOverride = String(name ?? '');
  try { fn(); } finally { streamOverride = previous; }
}

/** Drop every generator. Used when a script set is torn down, so a reload starts from the seed. */
function resetRandomStreams() { randomStates.clear(); streamOverride = null; }

function randomImpl(scriptId, lo, hi) {
  const r = randomNext(scriptId);
  if (lo === undefined || lo === null || hi === undefined || hi === null) return r;
  const a = mathNumber('ce.math.random', 'lo', lo);
  if (a === undefined) return undefined;
  const b = mathNumber('ce.math.random', 'hi', hi);
  if (b === undefined) return undefined;
  // Whole numbers, INCLUSIVE at both ends — the form a script wants for a note or a step — and
  // only those inside the range: the ends were floored, so random(1.5, 3.5) could give 1.
  const low = Math.ceil(Math.min(a, b)), high = Math.floor(Math.max(a, b));
  if (high < low) {
    addScriptTrace('error', '', `ce.math.random: there is no whole number from ${shownValue(a)} to ${shownValue(b)}, so there is no answer.`);
    return undefined;
  }
  return low + Math.floor(r * (high - low + 1));
}

/**
 * wrap(v, lo, hi) — bring a value round into a HALF-OPEN range, so wrap(12, 0, 12) is 0.
 *
 * This exists because the five runtimes disagree about `%`. (-1) % 12 is 11 in Lua and Python and
 * -1 in JavaScript, C++, C# and Java — so the ordinary way to write a pitch class already gives two
 * different answers depending on which engine the panel is running in. The floored form below is
 * written identically in every prelude, which is the only way that stops being true.
 */
function wrapImpl(v, lo, hi) {
  const a = Number(lo), b = Number(hi), n = Number(v);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(n)) return Number.isFinite(a) ? a : 0;
  const span = b - a;
  // An empty or inverted range has exactly one answer, and it is not NaN.
  if (!(span > 0)) return a;
  return a + ((((n - a) % span) + span) % span);
}

/** {{x, y}, …} however the language spelled it, sorted by x. Accepts pairs and {x=, y=} tables. */
function toBreakpoints(points) {
  const raw = Array.isArray(points) ? points
    : points && typeof points === 'object' ? Object.values(points)
    : [];
  const out = [];
  for (const p of raw) {
    // A pair, or a table by its names or its numbered entries (animEnvelope.js says how they are
    // counted). A point may also carry the CURVE of the segment ending at it, the way an Envelope
    // point and a Router breakpoint do; straight lines are still the default, so a plain pair list
    // is unchanged.
    const parts = envelopePointParts(p);
    if (!parts) continue;
    const nx = Number(parts.x), ny = Number(parts.y);
    if (Number.isFinite(nx) && Number.isFinite(ny)) out.push([nx, ny, parts.curve, parts.tension]);
  }
  return out.sort((p, q) => p[0] - q[0]);
}

/**
 * map(v, points) — straight lines through breakpoints: a response curve of the panel's own shape,
 * which is the thing curve()'s closed set of four names cannot express and a property cannot hold.
 *
 * Outside the outermost points the value is HELD rather than extrapolated: a curve drawn between
 * 0 and 1 that suddenly runs away past 1 is never what the author drew.
 */
function mapCurveImpl(v, points) {
  const list = toBreakpoints(points);
  if (!list.length) return Number(v);
  const n = Number(v);
  if (!Number.isFinite(n)) return list[0][1];
  // An exact hit on a breakpoint takes the LAST point with that x. That is what makes two points
  // sharing an x a STEP rather than a divide by zero, and it settles which side of the step the
  // breakpoint itself belongs to — the value it steps TO.
  for (let i = list.length - 1; i >= 0; i -= 1) if (list[i][0] === n) return list[i][1];
  if (n < list[0][0]) return list[0][1];
  const last = list[list.length - 1];
  if (n > last[0]) return last[1];
  for (let i = 1; i < list.length; i += 1) {
    const [x0, y0] = list[i - 1];
    const [x1, y1] = list[i];
    if (n < x1 && x1 !== x0) {
      const t = (n - x0) / (x1 - x0);
      // The segment's own shape, taken from the point it ENDS at — the envelope's convention, so a
      // curve list read out of a control evaluates here exactly as the app draws it.
      const eased = list[i][2] === undefined || list[i][2] === null
        ? t : shapeImpl(t, list[i][2], list[i][3]);
      return y0 + eased * (y1 - y0);
    }
  }
  return last[1];
}

function toNumberList(values) {
  const raw = Array.isArray(values) ? values
    : values && typeof values === 'object' ? Object.values(values)
    : [];
  return raw.map(Number).filter(Number.isFinite);
}

/** quantizeTo(v, values) — nearest entry in a LIST. A tie goes to the LOWER value, so the answer
    never depends on how the two distances happened to round. */
function quantizeToImpl(v, values) {
  const list = toNumberList(values);
  if (!list.length) return Number(v);
  const n = Number(v);
  if (!Number.isFinite(n)) return list[0];
  let best = list[0];
  let bestDistance = Math.abs(n - best);
  for (const candidate of list) {
    const d = Math.abs(n - candidate);
    if (d < bestDistance || (d === bestDistance && candidate < best)) { best = candidate; bestDistance = d; }
  }
  return best;
}

/**
 * random.choice(values [, weights]) — a pick from the SEEDED generator, so a randomised patch
 * replays. Exactly one number is drawn in every branch, weighted or not: a weighted pick that
 * consumed a different amount of the sequence would change what everything after it picked, and
 * "the same seed replays the same sequence" would quietly stop being true.
 */
function randomChoiceImpl(scriptId, values, weights) {
  const raw = Array.isArray(values) ? values
    : values && typeof values === 'object' ? Object.values(values)
    : [];
  if (!raw.length) return undefined;
  const r = randomNext(scriptId);
  const w = toNumberList(weights).map((n) => (n > 0 ? n : 0));
  let total = 0;
  for (let i = 0; i < raw.length; i += 1) total += w[i] ?? 0;
  if (!(total > 0)) return raw[Math.floor(r * raw.length)];
  let ticket = r * total;
  for (let i = 0; i < raw.length; i += 1) {
    ticket -= w[i] ?? 0;
    if (ticket < 0) return raw[i];
  }
  return raw[raw.length - 1];
}

// A gain of zero or less is -144 dB, the 24-bit noise floor, rather than negative infinity: -inf is
// a number half the runtimes cannot carry through a value and none of them can put on a label.
const MIN_DB = -144;

/* ------------------------------------------------------- ce.math: the rest of the arithmetic */
// Everything below is what a synth panel actually computes and had to hand-roll. The rule from Q10
// still holds and is what keeps the list finite: nothing here duplicates the language's own scalar
// maths (min/max/abs/floor/ceil/sin all already exist in every runtime). What IS here is either
// domain-specific, list-shaped (where Lua's varargs make the language version unusable), or must
// be identical in five runtimes to be worth anything at all.

const num = (v, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };

/** A list however the language spelled it — a JS array, or a Lua table over the wasmoon bridge. */
function toList(values) {
  if (Array.isArray(values)) return values;
  if (values && typeof values === 'object') return Object.values(values);
  return [];
}

// --- range and normalisation -------------------------------------------------------------
// The value model already has three faces (.value / .normalizedValue / .midiValue). A script
// converting between them by hand was writing scale() with the same two arguments every time —
// and scale() does NOT clamp, so a value past the end came out past 0..1 and stayed wrong.

function normImpl(v, lo, hi) {
  const a = num(lo), b = num(hi);
  if (a === b) return 0;
  const t = (num(v) - a) / (b - a);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
function denormImpl(t, lo, hi) {
  const a = num(lo), b = num(hi);
  const x = num(t);
  return a + (x < 0 ? 0 : x > 1 ? 1 : x) * (b - a);
}
/** 0..1 -> -1..1 and back: the two shapes a modulation source is ever in. */
const bipolarImpl = (t) => num(t) * 2 - 1;
const unipolarImpl = (v) => (num(v) + 1) / 2;

/**
 * fold(v, lo, hi) — come back off the end instead of round it.
 *
 * wrap() jumps from the top to the bottom, which is right for a pitch class and wrong for a
 * modulation depth: a fold reflects, so the movement stays continuous. Wave folding is the audible
 * version of the same idea, and neither is expressible with the language's %.
 */
function foldImpl(v, lo, hi) {
  const a = num(lo), b = num(hi);
  const span = b - a;
  if (!(span > 0)) return a;
  const t = Math.abs(num(v) - a) % (span * 2);
  return a + (t > span ? span * 2 - t : t);
}

/**
 * index(t, count) — 0..1 to one of `count`, zero-based.
 *
 * The hand-rolled floor(t * count) returns `count` itself at exactly 1.0, which is one past the
 * end of every list it is used to address. That off-by-one only shows up when a knob is turned
 * fully up, which is exactly when somebody is watching.
 */
function indexImpl(t, count) {
  const n = Math.floor(num(count));
  if (n <= 0) return 0;
  const i = Math.floor(normImpl(t, 0, 1) * n);
  return i >= n ? n - 1 : i;
}

// --- shaping -------------------------------------------------------------------------------

/**
 * crossfade(a, b, t [, law]) — the laws the Crossfader component already has, which a script
 * could not compute. "equalPower" is the one that matters: a linear fade between two sounds dips
 * in the middle, which is audible and is why the component defaults away from it.
 */
function crossfadeImpl(a, b, t, law) {
  const x = normImpl(t, 0, 1);
  const from = num(a), to = num(b);
  const kind = String(law ?? 'linear').trim().toLowerCase();
  if (kind === 'equalpower') {
    const angle = (x * Math.PI) / 2;
    return from * Math.cos(angle) + to * Math.sin(angle);
  }
  if (kind === 'sharp') {
    // The component's steep law: constant power squared, so the middle passes quickly.
    const g = x * x * (3 - 2 * x);
    return from * (1 - g) + to * g;
  }
  return from + (to - from) * x;
}

/**
 * approach(current, target, maxStep) — move, but no further than this in one go.
 *
 * A rate limit with no state of its own, so it works from any handler without the script keeping
 * a timer. ce.anim owns motion the RUNTIME drives; this is the one a script drives itself, per
 * incoming message — which is how you smooth a jumpy expression pedal.
 */
function approachImpl(current, target, maxStep) {
  const from = num(current), to = num(target);
  const step = Math.abs(num(maxStep));
  if (!(step > 0)) return to;
  const delta = to - from;
  if (Math.abs(delta) <= step) return to;
  return from + (delta > 0 ? step : -step);
}

// --- rounding and comparison ---------------------------------------------------------------

/** roundTo(v, decimals) — for a readout. JS's toFixed returns a STRING and Lua has no equivalent. */
function roundToImpl(v, decimals) {
  const d = Math.floor(num(decimals));
  const f = 10 ** (d < 0 ? 0 : d);
  return Math.round(num(v) * f) / f;
}

/**
 * almost(a, b [, epsilon]) — float comparison that means what == is assumed to mean.
 *
 * A panel compares values constantly (has this reached its target, is this at the detent) and
 * every one of those comparisons is on a float that arrived through a scale() or a curve().
 */
function almostImpl(a, b, epsilon) {
  const tol = Math.abs(num(epsilon, 1e-9));
  return Math.abs(num(a) - num(b)) <= (tol || 1e-9);
}

// --- lists ---------------------------------------------------------------------------------
// Lua's math.min/max take VARARGS, so over a table they need table.unpack and fall over on a long
// one; JavaScript needs a spread with the same limit. Over a list these are genuinely missing in
// both, and a panel deals in lists constantly — macro slots, matrix rows, envelope points, the
// values out of a dump.

function minOfImpl(values) {
  const list = toNumberList(values);
  if (!list.length) return undefined;
  let best = list[0];
  for (const n of list) if (n < best) best = n;
  return best;
}
function maxOfImpl(values) {
  const list = toNumberList(values);
  if (!list.length) return undefined;
  let best = list[0];
  for (const n of list) if (n > best) best = n;
  return best;
}
function sumImpl(values) {
  let total = 0;
  for (const n of toNumberList(values)) total += n;
  return total;
}
function meanImpl(values) {
  const list = toNumberList(values);
  return list.length ? sumImpl(list) / list.length : undefined;
}

/**
 * blend(a, b, t) — morph one set of values into another, element by element.
 *
 * This is what a snapshot morph IS, and a script could only do it a value at a time. The shorter
 * list decides the length: padding with zeros would silently drag the missing entries to nothing,
 * which on a patch is a set of parameters slammed to their minimum.
 */
function blendImpl(a, b, t) {
  const from = toNumberList(a);
  const to = toNumberList(b);
  const x = num(t);
  const n = Math.min(from.length, to.length);
  const out = [];
  for (let i = 0; i < n; i += 1) out.push(from[i] + (to[i] - from[i]) * x);
  return out;
}

// --- randomness ----------------------------------------------------------------------------
// All of these draw from the SEEDED generator, and each one draws a FIXED number of times, so a
// seed replays the whole sequence regardless of which of them a panel used. That rule is why
// randomGaussian does not cache Box-Muller's second value the way the textbook version does.

/** The seeded float in a range — random(lo, hi) returns whole numbers, so this did not exist. */
function randomFloatImpl(scriptId, lo, hi) {
  // One number alone is the top of a range from 0. It used to be the bottom of a range up to 1, so
  // randomFloat(5) was between 1 and 5.
  const alone = hi === undefined || hi === null;
  const a = alone ? 0 : num(lo), b = alone ? num(lo, 1) : num(hi);
  return a + randomNext(scriptId) * (b - a);
}

/**
 * randomGaussian([mean, sd]) — a bell rather than a slab. Humanising velocity or timing with a
 * uniform random is the thing that sounds mechanical; most of the values should be near the middle.
 * Box-Muller, always consuming exactly two draws.
 */
function randomGaussianImpl(scriptId, mean, sd) {
  const u1 = Math.max(randomNext(scriptId), 1e-12);   // ln(0) is not a number anyone wants downstream
  const u2 = randomNext(scriptId);
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return num(mean) + z * num(sd, 1);
}

/** randomWalk(current, step, lo, hi) — drift, not jump. A generative line that stays musical. */
function randomWalkImpl(scriptId, current, step, lo, hi) {
  const move = (randomNext(scriptId) * 2 - 1) * Math.abs(num(step));
  const next = num(current) + move;
  if (lo === undefined || lo === null || hi === undefined || hi === null) return next;
  // Folded rather than clamped: a walk that clamps sticks to the end it hit and stops moving.
  return foldImpl(next, num(lo), num(hi));
}

/** randomBool([chance]) — a weighted coin. The probability gate every step sequencer wants. */
function randomBoolImpl(scriptId, chance) {
  return randomNext(scriptId) < num(chance, 0.5);
}

/** shuffle(values) — seeded Fisher-Yates, returning a NEW list. Draws exactly n-1 times. */
function shuffleImpl(scriptId, values) {
  const out = [...toList(values)];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(randomNext(scriptId) * (i + 1));
    const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
  }
  return out;
}

// --- geometry ------------------------------------------------------------------------------
// For XY pads, joysticks, the Orbit and Ribbon, and above all ce.draw — whose arcs are DEGREES
// with 0 at twelve o'clock, clockwise. A script drawing a knob ring had to know that convention
// and rebuild atan2 against it; getting the quadrant wrong is a pointer that runs backwards.

const degImpl = (radians) => (num(radians) * 180) / Math.PI;
const radImpl = (degrees) => (num(degrees) * Math.PI) / 180;

function distanceImpl(x1, y1, x2, y2) {
  const dx = num(x2) - num(x1);
  const dy = num(y2) - num(y1);
  return Math.sqrt(dx * dx + dy * dy);
}

/** The angle from (x1,y1) to (x2,y2), in ce.draw's convention: degrees, 0 up, clockwise, 0..360. */
function angleOfImpl(x1, y1, x2, y2) {
  const dx = num(x2) - num(x1);
  const dy = num(y2) - num(y1);
  // The same point twice has no direction. atan2 answered 180 for it here and 0 in Lua.
  if (dx === 0 && dy === 0) return 0;
  const a = degImpl(Math.atan2(dx, -dy));
  return a < 0 ? a + 360 : a;
}

/** polar(angle, radius) — the inverse, in the same convention. { x, y } offsets from the centre. */
function polarImpl(angle, radius) {
  const a = radImpl(num(angle));
  const r = num(radius);
  return { x: Math.sin(a) * r, y: -Math.cos(a) * r };
}

/* ------------------------------------------ ce.math: the transforms the Properties panel applies */
// The panel is not only a place to store constants — it CONFIGURES value transforms. A Macro slot
// has a curve, a Router has a dead zone and a transfer curve, an Envelope segment has a curve and a
// tension, a Timbre pad blends anchors by a power, a slider generates tick stops, a Meter reads in
// dB. Every one of those is arithmetic the app performs and a script could not reproduce — so a
// script could not compute what its own panel was about to display, and anything it worked out
// alongside a bound control came out subtly different.
//
// These are the app's own functions, matched exactly rather than approximated. Where a formula
// looks odd (the tension default below), it is odd IN THE APP, and matching it is the point.

/**
 * shape(v, curve [, tension]) — the panel's own curve warp: the one an Envelope segment and a
 * Router breakpoint use (utils/envelopeLayout.js `envWarp`).
 *
 * This is NOT curve(). curve() is the older, simpler family — `exp` is v², `log` is √v, and the
 * s-curve is spelled `s`. The panel spells it `scurve`, has a `hold`, and computes `exp`/`log`
 * from a tension exponent. So a script that read a curve name straight out of a control and passed
 * it to curve() got either "unknown shape" or a different number. Both verbs stay: curve() is what
 * existing panels are written against, shape() is what the app itself does.
 *
 * The tension default is 1.6 rather than 0 — `tension || 1.6` in the app, so an unset tension is
 * not a straight line. Matched deliberately: a shape() that disagreed with the envelope it is
 * named after would be worse than not having one.
 */
function shapeImpl(v, curve, tension) {
  const t = normImpl(v, 0, 1);
  const k = 1 + Math.max(0, num(tension, 0) || 1.6);
  switch (String(curve).trim().toLowerCase()) {   // in any case: "SCurve" is "scurve"
    case 'exp': return t ** k;
    case 'log': return 1 - (1 - t) ** k;
    // Both spellings, because the panel says "scurve" and the script API has always said "s".
    case 'scurve': case 's': return t * t * (3 - 2 * t);
    case 'hold': return t >= 1 ? 1 : 0;
    default: return t;
  }
}

/**
 * deadzone(v, amount [, invert]) — the Router's input shaping (utils/routerLayout.js `shapeInput`).
 *
 * Below the threshold the value is zero, and the REMAINING range rescales to fill 0–1, so response
 * starts right at the edge of the dead zone rather than stepping up from it. That rescale is the
 * part a hand-rolled version leaves out, and leaving it out loses the top of the range.
 */
function deadzoneImpl(v, amount, invert) {
  let x = normImpl(v, 0, 1);
  if (invert === true) x = 1 - x;
  const dz = normImpl(amount, 0, 1);
  if (dz > 0) x = x <= dz ? 0 : (x - dz) / (1 - dz);
  return normImpl(x, 0, 1);
}

/**
 * weights(points, x, y [, power]) — the inverse-distance blend a Timbre Space and a Preset
 * Constellation use (utils/timbreLayout.js, utils/constellationLayout.js).
 *
 * Normalised, so they sum to 1. `power` is the blend sharpness: higher means the nearest anchor
 * dominates sooner. Pair it with blendBy() to morph a set of values the way the pad does.
 */
function weightsImpl(points, x, y, power) {
  const list = toList(points).map((p) => ({ x: num(p?.x), y: num(p?.y) }));
  if (!list.length) return [];
  const px = normImpl(x, 0, 1);
  const py = normImpl(y, 0, 1);
  const p = Math.max(0.5, num(power, 2));
  const eps = 1e-6;                               // the app's own guard against a zero distance
  const raw = list.map((pt) => {
    const d2 = (pt.x - px) ** 2 + (pt.y - py) ** 2;
    return 1 / (d2 ** (p / 2) + eps);
  });
  const total = raw.reduce((a, b) => a + b, 0);
  return total > 0 ? raw.map((w) => w / total) : raw.map(() => 1 / raw.length);
}

/** blendBy(values, weights) — a weighted sum. What weights() is for, and what a morph pad IS. */
function blendByImpl(values, weights) {
  const v = toNumberList(values);
  const w = toNumberList(weights);
  const n = Math.min(v.length, w.length);
  let total = 0;
  let sum = 0;
  for (let i = 0; i < n; i += 1) { sum += v[i] * w[i]; total += w[i]; }
  return total > 0 ? sum / total : 0;
}

/**
 * ticks(major [, minor]) — the stop positions a slider's scale is drawn from
 * (utils/sliderGeometry.js `buildSliderTickStops`), as 0–1 positions.
 *
 * A script drawing its own scale with ce.draw had to reinvent the minor-tick spacing, and getting
 * it wrong puts the minors visibly out of step with the ones the app draws beside them.
 */
function ticksImpl(major, minor) {
  const majorCount = Math.max(2, Math.round(num(major, 11)));
  const minorCount = Math.max(0, Math.round(num(minor, 0)));
  const out = { major: [], minor: [] };
  for (let index = 0; index < majorCount; index += 1) {
    const normalized = index / (majorCount - 1);
    out.major.push(normalized);
    if (index >= majorCount - 1 || minorCount <= 0) continue;
    for (let m = 1; m <= minorCount; m += 1) {
      out.minor.push(normalized + ((m / (minorCount + 1)) * (1 / (majorCount - 1))));
    }
  }
  return out;
}

/**
 * dbPosition(fraction [, floorDb, ceilDb]) — where a level sits on a dB meter
 * (utils/meterLayout.js `meterPosition`), 0–1.
 *
 * gainToDb answers "how many dB is this"; this answers "how far up the meter does it go", which is
 * a different question and the one a script drawing a meter is asking. The 1e-4 clamp is the app's:
 * without it silence is -inf and the fill position stops being a number.
 */
function dbPositionImpl(fraction, floorDb, ceilDb) {
  const frac = normImpl(fraction, 0, 1);
  const floor = num(floorDb, -60);
  const ceil = num(ceilDb, 6);
  if (ceil === floor) return 0;
  const db = 20 * Math.log10(Math.max(frac, 1e-4));
  return normImpl((db - floor) / (ceil - floor), 0, 1);
}

/* --------------------------------------------------- ce.math: taming what arrives on the wire */

/**
 * smooth(current, target, coefficient [, epsilon]) — one-pole exponential smoothing.
 *
 * Not the same job as approach(). approach moves a FIXED step, which is a rate limit; this moves a
 * PROPORTION of the remaining distance, which settles fast and then creeps — the response a jittery
 * expression pedal or a noisy CC wants.
 *
 * It is `lerp` underneath and says so, but two things are the reason it is a member rather than a
 * line: the coefficient is clamped to 0–1, and it ARRIVES. A one-pole is asymptotic — left alone it
 * sits at 0.9999 forever and a control smoothed with it transmits forever. Snapping inside epsilon
 * is what a hand-rolled version leaves out, and the symptom is a panel that never stops sending.
 */
function smoothImpl(current, target, coefficient, epsilon) {
  const from = num(current);
  const to = num(target);
  const k = normImpl(coefficient, 0, 1);
  const tol = Math.abs(num(epsilon, 1e-4)) || 1e-4;
  if (Math.abs(to - from) <= tol) return to;
  return from + (to - from) * k;
}

/**
 * hysteresis(value, on, low, high) — a Schmitt trigger: turns on at `high`, off at `low`, and
 * HOLDS in between. `on` is the state it is currently in, and the return is the state it should be.
 *
 * A plain threshold chatters: a CC hovering on the line flips a switch dozens of times a second,
 * which on a bound control is dozens of messages a second. Two thresholds and the current state is
 * the fix, and nothing else in the module composes to it.
 */
function hysteresisImpl(value, on, low, high) {
  const v = num(value);
  let lo = num(low);
  let hi = num(high);
  // A caller who passes them the other way round means the same thing; refusing would be pedantry.
  if (lo > hi) { const t = lo; lo = hi; hi = t; }
  return on === true ? v > lo : v >= hi;
}

/**
 * median(values) — the middle value, or the mean of the two middle ones.
 *
 * Distinct from mean() and the reason is the whole point: a mean SMEARS a spike across the result,
 * a median rejects it. For a noisy controller reading, that is the difference between a glitch you
 * can hear and one you cannot.
 */
function medianImpl(values) {
  const list = toNumberList(values).slice().sort((a, b) => a - b);
  if (!list.length) return undefined;
  const mid = list.length >> 1;
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}

/**
 * unshape(y, curve [, tension]) — the inverse of shape().
 *
 * Going device → panel THROUGH a taper needs it: a value that was shaped on the way out has to be
 * un-shaped on the way back, or the control lands somewhere else than it started. Only map() is
 * invertible by hand (swap x and y); a named curve is not.
 *
 * `hold` is a step, so many inputs give the same output and there is no true inverse. It returns
 * the EARLIEST input that produces the output, which is the only answer that is a function.
 */
/**
 * euclid(steps, pulses [, rotation]) — `pulses` hits spread as evenly as possible over `steps`,
 * as a list of booleans. The Bjorklund rhythm, and the app's own (utils/arpLayout.js `euclid`).
 *
 * The Arpeggiator has used this for its rest pattern since it shipped, and a script could set
 * arpEuclidSteps/Pulses/Rotate but never COMPUTE a pattern — so a sequencer, a gate, an LFO mask or
 * anything else that wanted one had to reinvent it, and the hand-rolled version is almost never the
 * stable spread.
 *
 * Bresenham rather than the recursive Bjorklund: the same output, and no recursion to port five
 * times. `rotation` turns the pattern without changing which steps fire relative to each other.
 */
function euclidImpl(steps, pulses, rotation) {
  const n = Math.max(1, Math.min(64, Math.round(num(steps, 1))));
  const k = Math.max(0, Math.min(n, Math.round(num(pulses, 0))));
  if (k <= 0) return new Array(n).fill(false);
  if (k >= n) return new Array(n).fill(true);
  const out = new Array(n).fill(false);
  let bucket = 0;
  for (let i = 0; i < n; i += 1) {
    bucket += k;
    if (bucket >= n) { bucket -= n; out[i] = true; }
  }
  const rot = ((Math.round(num(rotation, 0)) % n) + n) % n;
  return out.slice(rot).concat(out.slice(0, rot));
}

function unshapeImpl(y, curve, tension) {
  const v = normImpl(y, 0, 1);
  // The same k as shape(), including the 1.6 default — an inverse computed against a different
  // exponent would be an inverse of nothing.
  const k = 1 + Math.max(0, num(tension, 0) || 1.6);
  switch (String(curve).trim().toLowerCase()) {
    case 'exp': return v ** (1 / k);
    case 'log': return 1 - (1 - v) ** (1 / k);
    // The closed-form inverse of smoothstep. Solving the cubic numerically would be slower and
    // would not agree to the last bit across five runtimes.
    case 'scurve': case 's': return 0.5 - Math.sin(Math.asin(1 - 2 * v) / 3);
    case 'hold': return v >= 1 ? 1 : 0;
    default: return v;
  }
}

// ce.format's console: a rejected argument is an error, a value past the end of a table a warning.
function formatSay(level, text) {
  addScriptTrace(level === 'warn' ? 'warn' : 'error', '', text);
}

const helpers = {
  clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v),
  round: (v) => Math.round(v),
  scale: (v, inLo, inHi, outLo, outHi) => (inHi === inLo ? outLo : outLo + (v - inLo) * (outHi - outLo) / (inHi - inLo)),
  // A step or t left out gave NaN in silence here and a Lua error in the other runtime.
  snap: (v, step) => {
    const n = mathNumber('ce.math.snap', 'the value', v);
    if (n === undefined) return undefined;
    const s = mathNumber('ce.math.snap', 'the step', step);
    if (s === undefined) return undefined;
    return s === 0 ? n : Math.round(n / s) * s;
  },
  lerp: (a, b, t) => {
    const x = mathNumber('ce.math.lerp', 'a', a);
    if (x === undefined) return undefined;
    const y = mathNumber('ce.math.lerp', 'b', b);
    if (y === undefined) return undefined;
    const f = mathNumber('ce.math.lerp', 't', t);
    if (f === undefined) return undefined;
    return x + (y - x) * f;
  },
  // A shape the list does not have used to return v in silence, which reads as a curve that does
  // nothing rather than as a name that was never applied.
  curve: (v, shape) => {
    // A name in any case, as every word from a list is read: "EXP" is "exp".
    const name = shape === undefined || shape === null ? 'linear' : String(shape).trim().toLowerCase();
    if (name === 'exp') return v * v;
    if (name === 'log') return Math.sqrt(Math.max(0, v));
    if (name === 's') return v * v * (3 - 2 * v);
    if (name !== '' && name !== 'linear') {
      addScriptTrace('log', '',
        `curve(v, ${JSON.stringify(String(shape))}): unknown shape — using linear. `
        + 'The names are "linear", "exp", "log" and "s"; for any other shape use map(v, points).');
    }
    return v;
  },
  wrap: (v, lo, hi) => wrapImpl(v, lo, hi),
  mapCurve: (v, points) => mapCurveImpl(v, points),
  // The transforms the Properties panel itself applies, matched exactly rather than approximated.
  shapeCurve: (v, curve, tension) => shapeImpl(v, curve, tension),
  deadzone: (v, amount, invert) => deadzoneImpl(v, amount, invert),
  weightsFor: (points, x, y, power) => weightsImpl(points, x, y, power),
  blendBy: (values, weights) => blendByImpl(values, weights),
  tickStops: (major, minor) => ticksImpl(major, minor),
  dbPosition: (fraction, floorDb, ceilDb) => dbPositionImpl(fraction, floorDb, ceilDb),
  // taming what arrives on the wire
  smooth: (current, target, coefficient, epsilon) => smoothImpl(current, target, coefficient, epsilon),
  hysteresis: (value, on, low, high) => hysteresisImpl(value, on, low, high),
  median: (values) => medianImpl(values),
  unshape: (y, curve, tension) => unshapeImpl(y, curve, tension),
  euclid: (steps, pulses, rotation) => euclidImpl(steps, pulses, rotation),
  // Colour arithmetic. Here rather than in ce.draw because it is PURE and cross-runtime: setting a
  // control's colour from a value works with the panel shut, and the exported plugin does it.
  //
  // §36's sweep swept utils/*Layout.js and declared ce.math complete. colorMath.js and
  // colorHelpers.js do not match that glob — the sweep had a blind spot exactly the shape of its
  // own search pattern, which is the failure mode of any sweep and worth writing down.
  lighten: (hex, amount) => colourLighten(hex, amount),
  darken: (hex, amount) => colourDarken(hex, amount),
  mixColour: (a, b, t) => colourMix(a, b, t),
  colourAlpha: (hex, a) => colourWithAlpha(hex, a),
  hexToRgb: (hex) => colourToRgb(hex),
  rgbToHex: (r, g, b) => colourFromParts(r, g, b),
  hexToHsl: (hex) => colourToHsl(hex),
  hslToHex: (h, sat, l) => colourFromHslParts(h, sat, l),
  colourFromArgb: (colour) => colourFromOrder('ce.math.fromARGB', 'argb', colour),
  colourFromRgba: (colour) => colourFromOrder('ce.math.fromRGBA', 'rgba', colour),
  quantizeTo: (v, values) => quantizeToImpl(v, values),
  // range and normalisation
  norm: (v, lo, hi) => normImpl(v, lo, hi),
  denorm: (t, lo, hi) => denormImpl(t, lo, hi),
  bipolar: (t) => bipolarImpl(t),
  unipolar: (v) => unipolarImpl(v),
  fold: (v, lo, hi) => foldImpl(v, lo, hi),
  indexOfRange: (t, count) => indexImpl(t, count),
  // shaping
  crossfade: (a, b, t, law) => crossfadeImpl(a, b, t, law),
  approach: (current, target, maxStep) => approachImpl(current, target, maxStep),
  // rounding and comparison
  roundTo: (v, decimals) => roundToImpl(v, decimals),
  almost: (a, b, epsilon) => almostImpl(a, b, epsilon),
  // lists
  minOf: (values) => minOfImpl(values),
  maxOf: (values) => maxOfImpl(values),
  sumOf: (values) => sumImpl(values),
  meanOf: (values) => meanImpl(values),
  blend: (a, b, t) => blendImpl(a, b, t),
  // randomness — every one draws a FIXED number of times, so a seed replays whatever was used
  // geometry
  toDegrees: (radians) => degImpl(radians),
  toRadians: (degrees) => radImpl(degrees),
  distance: (x1, y1, x2, y2) => distanceImpl(x1, y1, x2, y2),
  angleOf: (x1, y1, x2, y2) => angleOfImpl(x1, y1, x2, y2),
  polar: (angle, radius) => polarImpl(angle, radius),
  dbToGain: (db) => (Number.isFinite(Number(db)) ? 10 ** (Number(db) / 20) : 0),
  gainToDb: (gain) => {
    const g = Number(gain);
    if (!Number.isFinite(g) || g <= 0) return MIN_DB;
    const db = 20 * Math.log10(g);
    return db < MIN_DB ? MIN_DB : db;
  },
  // @module ce.format
  // Pure, and line for line the preludes' own (formatCore.js says why that matters here).
  formatNumber: (v, opts) => formatNumber(v, opts, formatSay),
  formatHz: (v, opts) => formatHz(v, opts, formatSay),
  formatTime: (ms, opts) => formatTime(ms, opts, formatSay),
  formatDb: (v, opts) => formatDb(v, opts, formatSay),
  formatPercent: (v, opts) => formatPercent(v, opts, formatSay),
  formatPan: (v, opts) => formatPan(v, opts, formatSay),
  formatRatio: (v, opts) => formatRatio(v, opts, formatSay),
  formatClock: (ms, opts) => formatClock(ms, opts, formatSay),
  formatNote: (n, opts) => formatNote(n, opts, formatSay),
  formatDivision: (beats, opts) => formatDivision(beats, opts, formatSay),
  formatTable: (v, table, opts) => formatTable(v, table, opts, formatSay),
  formatFit: (text, width, opts) => formatFit(text, width, opts, formatSay),
  formatLine: (left, right, width, opts) => formatLine(left, right, width, opts, formatSay),
  formatParse: (text, opts) => formatParse(text, opts),
  // The one ce.format command that reads the device: the profile's description, then the pure part.
  formatParameter: (id, v, opts) => {
    const role = opts && typeof opts === 'object' && opts.role ? String(opts.role) : DEFAULT_ROLE;
    const desc = deviceParameterRead(id, role);
    if (!desc || typeof desc !== 'object') {
      const shown = formatPlaceholderFor(opts);
      formatSay('error', `ce.format.parameter: the device profile has no parameter "${String(id)}", so "${shown}" is shown.`);
      return shown;
    }
    return formatDescribed(desc, v, opts, formatSay);
  },
  // @module ce.music
  // Two spellings, chosen by whether the second argument is there at all. Omitted, you get this
  // module's own plain-ASCII names (C#4) — what every script written so far compares against, and
  // what noteNumber has always round-tripped. Given, you get the PANEL's names (C♯4 / E♭4): the
  // same table the Chord Pad, the Harmoniser and the Arpeggiator print from, so a script can label
  // a control with the spelling the component beside it is using.
  // The rule is musicTheory's, which the script editor's Values sidebar reads a note by too.
  // A number, or text that is one, rounded down; anything else is no answer, and says why, in each
  // prelude's words. A name ("C4") raised in Lua and Python and gave "undefinedNaN" in the
  // JavaScript engine (ce.music's review, docs/design/api-descriptions-handoff.md).
  noteName: (n, flats) => {
    const v = typeof n === 'boolean' ? undefined : realNumber(n);
    if (v === undefined) {
      addScriptTrace('error', '', n === undefined || n === null
        ? 'ce.music.name: no note was given, so there is no answer. A note is a MIDI number, such as 60.'
        : `ce.music.name: ${shownValue(n)} is not a note number, so there is no answer. A note is a MIDI number, such as 60.`);
      return undefined;
    }
    return noteNameOf(v, flats);
  },
  // Reads all four spellings: C4, C#4, C♯4, Db4, D♭4. An unreadable name is NIL, not 0 — 0 is a
  // perfectly good MIDI note (C-1), so returning it for "Eb4" meant a typo played a wrong note in
  // silence rather than showing up. It now says why, as the other ce.music commands do; the senders
  // and those commands read a name with noteNumberOf, and say their own why.
  noteNumber: (name) => {
    const n = typeof name === 'string' ? noteNumberOf(name) : undefined;
    if (n === undefined) {
      addScriptTrace('error', '', name === undefined || name === null
        ? 'ce.music.number: no note name was given, so there is no answer.'
        : `ce.music.number: ${shownValue(name)} is not a note name, so there is no answer. A name is a letter `
          + 'from A to G, then # or b if it has one, then the octave: "C4", "Eb3", "F#-1".');
    }
    return n;
  },
  // Does this key write its accidentals as flats? The Chord Pad's rule, exactly: judged by the
  // RELATIVE MAJOR, so C minor spells E♭/A♭ rather than D♯/G♯. Pass the answer straight to
  // noteName and a script's labels match the panel's without deciding anything itself.
  noteSpelling: (root, scale) => {
    const steps = musicSetOf('ce.music.spelling', 'scale', scale);
    if (!steps) return undefined;
    const name = scale == null ? 'major' : (listWord(SCALE_NAMES, String(scale)) ?? String(scale));
    const pitch = musicPitchOf('ce.music.spelling', root);
    if (pitch === undefined) return undefined;
    const pc = musicMod12(pitch);
    return FLAT_KEY_PCS.includes(MINOR_SCALE_NAMES.includes(name) ? musicMod12(pc + 3) : pc);
  },
  inScale: (note, root, scale) => {
    const steps = musicSetOf('ce.music.inScale', 'scale', scale);
    if (!steps) return undefined;
    const n = musicPitchOf('ce.music.inScale', note);
    if (n === undefined) return undefined;
    const r = musicPitchOf('ce.music.inScale', root);
    if (r === undefined) return undefined;
    const base = musicMod12(r);
    return steps.some((x) => musicMod12(base + x) === musicMod12(n));
  },
  // Which degree of the key a note is — 1 for the tonic, 5 for the dominant. A note OUTSIDE the key
  // has NO degree and gets nil rather than the nearest one: rounding here is what turns a wrong
  // note into a plausible chord, and quantizeNote is the verb that rounds on purpose.
  scaleDegree: (note, root, scale) => {
    const steps = musicSetOf('ce.music.degree', 'scale', scale);
    if (!steps) return undefined;
    const n = musicPitchOf('ce.music.degree', note);
    if (n === undefined) return undefined;
    const r = musicPitchOf('ce.music.degree', root);
    if (r === undefined) return undefined;
    const base = musicMod12(r);
    const pc = musicMod12(n);
    const i = steps.findIndex((x) => musicMod12(base + x) === pc);
    return i < 0 ? undefined : i + 1;
  },
  // The chord the key builds on a degree — the Chord Pad's own answer, named and numbered. Degrees
  // are 1-based, like scaleDegree's, so degreeChord(60, 'major', 5) is the V. `size` is how many
  // thirds to stack: 3 a triad, 4 a seventh. Past the top of the scale it keeps going an octave up.
  degreeChord: (root, scale, degree, size) => {
    const steps = musicSetOf('ce.music.degreeChord', 'scale', scale);
    if (!steps || !steps.length) return undefined;
    const name = scale == null ? 'major' : String(scale);
    const base = musicPitchOf('ce.music.degreeChord', root);
    if (base === undefined) return undefined;
    const d = musicStep('degree', degree, 1) - 1;
    const offsets = musicStack(steps, d, musicStep('size', size, 3));
    const quality = helpers.chordQuality(offsets);
    const flats = helpers.noteSpelling(root, name);
    const spell = (n) => (flats ? NOTE_FLAT : NOTE_SHARP)[musicMod12(n)];
    return {
      degree: d + 1,
      rootNote: base + offsets[0],
      quality,
      name: spell(base + offsets[0]) + (QUALITY_SUFFIX[quality] ?? ''),
      roman: musicRoman(offsets[0], quality),
      offsets,
      notes: offsets.map((o) => base + o),
      names: offsets.map((o) => spell(base + o)),
    };
  },
  // Name a chord from the notes in it: [60,63,70] -> "min7". Reads intervals above the LOWEST
  // given note, so it takes a chord from chordNotes, from degreeChord or from whatever a script
  // built by hand. The vocabulary is the panel's, so a chord this names and a chord the Chord Pad
  // labels agree.
  chordQuality: (notes) => {
    const read = musicNoteList('chordQuality', 'notes', notes);
    if (!read) return undefined;
    const list = musicSorted(read);
    if (!list.length) return undefined;
    const iv = list.map((x) => musicMod12(x - list[0]));
    const has = (a) => iv.includes(a);
    const third = has(3) ? 'min' : has(4) ? 'maj' : has(2) ? 'sus2' : has(5) ? 'sus4' : '';
    const fifth = has(7) ? 'p5' : has(6) ? 'd5' : has(8) ? 'a5' : '';
    const seventh = has(10) ? 'm7' : has(11) ? 'M7' : (has(9) && fifth === 'd5') ? 'd7' : '';
    if (third === 'min' && fifth === 'd5') return seventh === 'm7' ? 'm7b5' : seventh === 'd7' ? 'dim7' : 'dim';
    if (third === 'maj' && fifth === 'a5') return 'aug';
    if (third === 'min') return seventh === 'm7' ? 'min7' : seventh === 'M7' ? 'minMaj7' : 'min';
    if (third === 'maj') return seventh === 'm7' ? 'dom7' : seventh === 'M7' ? 'maj7' : 'maj';
    if (third === 'sus2') return 'sus2';
    if (third === 'sus4') return 'sus4';
    return 'maj';
  },
  // Re-voice a chord so it moves as little as possible from the one before it — the Harmoniser's
  // voice leading, available to any script that sends chords. 'closest' minimises the total
  // movement of all voices; 'smooth' minimises the TOP voice only, which holds a melody still and
  // lets the inner voices jump; 'off' returns the chord in root position. With no previous chord
  // there is nothing to lead from, so the chord comes back untouched.
  voiceLead: (notes, previous, mode) => {
    const read = musicNoteList('voiceLead', 'notes', notes);
    const before = read && musicNoteList('voiceLead', 'previous', previous);
    if (!read || !before) return [];
    const chord = musicSorted(read);
    const prev = musicSorted(before);
    const { how, said } = voiceLeadMode(mode);
    musicSaid(said);
    if (!chord.length || !prev.length || how === 'off') return chord;
    let best = chord;
    let bestScore = Infinity;
    for (const cand of musicInversions(chord)) {
      if (cand.some((n) => n < 0 || n > 127)) continue;
      const score = how === 'smooth'
        ? Math.abs(cand[cand.length - 1] - prev[prev.length - 1])
        : musicMotion(cand, prev);
      // Strictly less, so a tie keeps the earlier (lower) candidate and the same input always
      // gives the same answer in every runtime.
      if (score < bestScore) { bestScore = score; best = cand; }
    }
    return best;
  },
  // The same note set spread up over `octaves` octaves, the Arpeggiator's own expansion. Sorted
  // ascending and clamped into MIDI range; anything that would land above 127 is DROPPED rather
  // than clamped, because clamping stacks strays on one pitch and that sounds like a stuck key.
  expandOctaves: (notes, octaves) => {
    const read = musicNoteList('expandOctaves', 'notes', notes);
    if (!read) return [];
    const base = musicSorted(read).map((n) => Math.min(127, Math.max(0, Math.floor(n))));
    const { n: oc, said } = octaveCount(octaves);
    musicSaid(said);
    const out = [];
    for (let o = 0; o < oc; o += 1) for (const n of base) { const v = n + o * 12; if (v <= 127) out.push(v); }
    return out;
  },
  // The walk an arpeggiator pattern describes, as a list of STEPS — each step a list of notes, so
  // 'chord' (one step, everything at once) has the same shape as the rest. The notes are taken in
  // the order given, which is what makes 'asPlayed' mean anything; sort or expandOctaves first if
  // you want a rising walk. 'updown' and 'downup' do not repeat the endpoints.
  //
  // 'random' returns the input order, exactly as the panel's own arpeggiator does — it draws its
  // step at play time rather than shuffling the walk. A script that wants a shuffled WALK has
  // ce.math.shuffle, which is seeded and therefore repeatable.
  arpOrder: (notes, pattern) => {
    const asc = musicNoteList('arpOrder', 'notes', notes);
    if (!asc) return [];
    const { which, said, refused } = arpOrderPattern(pattern);
    if (refused) { addScriptTrace('error', '', refused); return []; }
    musicSaid(said);
    if (!asc.length) return [];
    switch (which) {
      case 'down': return asc.slice().reverse().map((n) => [n]);
      case 'updown': return [...asc, ...asc.slice(1, -1).reverse()].map((n) => [n]);
      case 'downup': {
        const desc = asc.slice().reverse();
        return [...desc, ...desc.slice(1, -1).reverse()].map((n) => [n]);
      }
      case 'chord': return [asc.slice()];
      default: return asc.map((n) => [n]);
    }
  },
  // Scales, chords and snap-to-key. Same tables the C++ preludes are generated from, so a script
  // that quantises to dorian gets the same note whether the window is open or shut. An unknown
  // name returns undefined rather than guessing "major" — asking for something this build does not
  // know should be findable, not silently corrected.
  scaleNotes: (root, scale) => musicNotes('ce.music.scale', 'scale', root, scale),
  chordNotes: (root, type) => musicNotes('ce.music.chord', 'chord', root, type),
  quantizeNote: (note, root, scale) => {
    const steps = musicSetOf('ce.music.quantize', 'scale', scale);
    if (!steps) return undefined;
    const n = musicPitchOf('ce.music.quantize', note);
    if (n === undefined) return undefined;
    const base = musicPitchOf('ce.music.quantize', root);
    if (base === undefined) return undefined;
    const inKey = new Set(steps.map((x) => (((base + x) % 12) + 12) % 12));
    // Search outwards from the note itself. A TIE GOES UP, always: the +d candidate is tested
    // before the -d one, so a note exactly between two scale tones lands on the same one in every
    // runtime. Without a stated rule the five engines would each pick their own.
    for (let d = 0; d <= 6; d += 1) {
      if (inKey.has((((n + d) % 12) + 12) % 12)) return n + d;
      if (inKey.has((((n - d) % 12) + 12) % 12)) return n - d;
    }
    return n;
  },

// @module ce.time
  // The clock. See NOW_EPOCH: monotonic, arbitrary origin, differences only.
  nowMs: () => nowMsRead(),
  // The panel's division vocabulary, in both directions. Every sequencer property in the app is
  // one of these strings, and a script could set one and never convert it.
  beatsPerDivision: (name) => {
    const id = divisionId('ce.time.division', name);
    return id === undefined ? undefined : DIVISIONS[id];
  },
  divisionNames: () => DIVISION_NAMES.map((id) => ({ id, label: DIVISION_LABELS[id], beats: DIVISIONS[id] })),
  // Where a beat position falls, musically — for ANY position, not only the one the transport is
  // at. `text` is the Transport's own readout ("3.2.00"), so a script's label and the component's
  // agree character for character. Ticks are 24 PPQN, the MIDI clock resolution.
  //
  // Their numbers are read as the transport reads them, and one not used as written is said once
  // (timeArg): a position before the start is the start, and text that is not a number is the
  // argument's default.
  barBeatAt: (beats, beatsPerBar) => {
    const b = timeArg('barBeatAt', 'beats', beats);
    if (b === undefined) return undefined;
    const signature = { beats: timeArg('barBeatAt', 'beatsPerBar', beatsPerBar), unit: 4 };
    return { ...panelBarBeat(b, signature), text: panelFormatBarBeat(b, signature) };
  },
  // Which step of the grid a position is on, counting from 0 at the transport origin.
  stepAt: (beats, division) => {
    const id = divisionId('ce.time.step', division);
    if (id === undefined) return undefined;
    const b = timeArg('stepAt', 'beats', beats);
    return b === undefined ? undefined : panelStepAtBeat(b, id);
  },
  // The step boundaries crossed between two readings — the never-lose-an-event rule every synced
  // follower in the panel runs on. A stalled frame must FIRE the steps it slept through rather than
  // drop them: that is the difference between a stutter and a hole in the bar. `max` caps the
  // catch-up (default 16) and what was dropped is REPORTED rather than swallowed, so a script can
  // say it happened. On an overrun the most RECENT steps are kept — catching up to now matters
  // more than replaying where you were.
  stepsBetween: (fromBeats, toBeats, division, max) => {
    const id = divisionId('ce.time.steps', division);
    if (id === undefined) return undefined;
    const from = timeArg('stepsBetween', 'from', fromBeats);
    if (from === undefined) return undefined;
    const to = timeArg('stepsBetween', 'to', toBeats);
    if (to === undefined) return undefined;
    return panelCrossedSteps(from, to, id, timeArg('stepsBetween', 'max', max));
  },
  // The panel's shuffle: every odd step pushed later by up to half a step. In BEATS, to add to a
  // step's position. Two sequencers at "the same" swing really are the same swing only if they
  // compute it the same way, which is why this is the transport's function and not a second one.
  swingOffset: (step, amount, division) => {
    const id = divisionId('ce.time.swing', division);
    if (id === undefined) return undefined;
    const s = timeArg('swingOffset', 'step', step);
    if (s === undefined) return undefined;
    const a = timeArg('swingOffset', 'amount', amount);
    if (a === undefined) return undefined;
    return panelSwungBeatOffset(s, a, id);
  },
  // For anything whose rate is a LOOP LENGTH in bars rather than a step — a take, a slow sweep.
  // Derived from the position, never accumulated, so a cycle running for an hour is still exactly
  // on the bar line. `length` is the cycle in beats; `count` is how many have completed.
  cycleAt: (beats, bars, beatsPerBar) => {
    const b = timeArg('cycleAt', 'beats', beats);
    if (b === undefined) return undefined;
    const n = timeArg('cycleAt', 'bars', bars);
    if (n === undefined) return undefined;
    const perBar = timeArg('cycleAt', 'beatsPerBar', beatsPerBar);
    return {
      phase: panelCyclePhaseAt(b, n, perBar),
      count: panelCycleCountAt(b, n, perBar),
      length: panelCycleBeats(n, perBar),
    };
  },
  // Fold a timeline position into a loop. Before the loop start the position is untouched — you can
  // run IN to a loop from earlier in the song, which is what every DAW does and what a count-in
  // needs. `pass` is which time round you are, and -1 before the loop has been reached; a script
  // watching it for CHANGES knows a wrap happened without a wrap handler that can miss one.
  loopedBeats: (beats, startBeats, lengthBeats) => {
    const b = timeArg('loopedBeats', 'beats', beats);
    if (b === undefined) return undefined;
    const start = timeArg('loopedBeats', 'startBeats', startBeats);
    if (start === undefined) return undefined;
    const length = timeArg('loopedBeats', 'lengthBeats', lengthBeats);
    if (length === undefined) return undefined;
    return { beats: panelLoopedBeats(b, start, length), pass: panelLoopCycleIndex(b, start, length) };
  },
  // Tempo from tap times, in the milliseconds nowMs() reports. Taps more than `resetMs` apart start
  // a NEW measurement rather than averaging across the pause — otherwise the first tap after a
  // break poisons it, which is what every hand-rolled tap tempo gets wrong. Nothing comes back from
  // fewer than two usable taps.
  tapTempo: (times, resetMs) => {
    const list = timeList('ce.time.tap', 'times', 'a tap time in milliseconds', times);
    if (list === undefined) return undefined;
    // A pause that is not a number above 0 gave nothing (every gap was "after a pause") or 2000, in
    // silence; it is 2000, said once.
    const reset = realNumber(resetMs);
    if (resetMs !== undefined && resetMs !== null && !(reset > 0)) {
      timeSaid('tapTempo resetMs', `ce.time.tap: resetMs is ${shownValue(resetMs)}, which is ${reset === undefined ? 'not a number' : 'not above 0'}, so 2000 was used.`);
    }
    return panelTapTempo(list, reset > 0 ? reset : 2000) ?? undefined;
  },
  // Tempo from the gaps between incoming MIDI clock pulses (24 per quarter note). The MEDIAN, not
  // the mean: one late pulse from a USB hiccup drags an average around, and a wobbling BPM readout
  // is worse than a slightly stale one.
  clockTempo: (intervalsMs) => {
    const list = timeList('ce.time.clockTempo', 'intervalsMs', 'a gap in milliseconds', intervalsMs);
    return list === undefined ? undefined : (panelClockTempo(list) ?? undefined);
  },

// @module ce.midi
  // MIDI data encoding — the escape hatch for hand-built SysEx, for the parameters the DPD
  // doesn't model. Ported byte-for-byte from the Lua/JS/Python preludes in CE/src/Scripting so a
  // script packs a value identically whether it runs here or in the shipped plugin.
  // Each answers nothing and says why for a value that does not fit, as the byte lists below do
  // ("the older encoding helpers").
  to14bit: (v) => packTo14bit(v),
  from14bit: (msb, lsb) => packFrom14bit(msb, lsb),
  to7bit: (v, count, order) => packTo7bit(v, count, order),
  from7bit: (bytes, order) => packFrom7bit(bytes, order),
  toNibbles: (b) => packToNibbles(b),
  fromNibbles: (hi, lo) => packFromNibbles(hi, lo),
  nibblize: (bytes) => packNibblize(bytes),
  denibblize: (bytes) => packDenibblize(bytes),
  toAscii: (str, length) => packToAscii(str, length),
  fromAscii: (bytes) => packFromAscii(bytes),
  toOffset: (v, center) => packOffset('ce.midi.toOffset', 'v', v, center, 1),
  fromOffset: (b, center) => packOffset('ce.midi.fromOffset', 'b', b, center, -1),
  toSigned: (v, bits) => packToSigned(v, bits),
  fromSigned: (b, bits) => packFromSigned(b, bits),
  // Byte lists — see "byte lists" below, and docs/design/script-bytes.md for why lists.
  getBits: (value, start, count) => bytesGetBits(value, start, count),
  setBits: (value, start, count, bits) => bytesSetBits(value, start, count, bits),
  bytesRead: (bytes, offset, count, opts) => bytesRead(bytes, offset, count, opts),
  bytesWrite: (bytes, offset, count, value, opts) => bytesWrite(bytes, offset, count, value, opts),
  bytesSlice: (bytes, offset, count) => bytesSlice(bytes, offset, count),
  bytesPut: (bytes, offset, values) => bytesPut(bytes, offset, values),
  bytesFind: (bytes, pattern, from) => bytesFind(bytes, pattern, from),
  bytesToHex: (bytes) => bytesToHex(bytes),
  bytesFromHex: (text) => bytesFromHex(text),
  bytesToBase64: (bytes) => bytesToBase64(bytes),
  bytesFromBase64: (text) => bytesFromBase64(text),
};
// The spelling this runtime shipped with before the contract was enforced. panelApi.js declares
// it as an alias of to14bit, so panels written against it keep working.
helpers.to14Bit = helpers.to14bit;

// @module ce.midi
/* ------------------------------------------------------------------- MIDI out (real) */
// Scripts emit MIDI through the same device bridge the player/DPD use: raw bytes go via
// triggerRawMidiAction (needs a hardware output selected on the 'mainSynth' role). With no JUCE
// host (e.g. a plain browser tab) the call is a no-op and we trace what *would* have gone out.
// Origin/transmit gating for shipped panels is owned by the C++ runtime (Model 2).

const DEFAULT_ROLE = DEFAULT_DEVICE_ROLE;

function midiInt(v, lo, hi) { v = Math.round(Number(v) || 0); return v < lo ? lo : v > hi ? hi : v; }
// How a refusal shows a value the script passed, in the same words in every runtime whatever the
// language would print: "nothing" for nil, undefined or None, NaN and Infinity as JavaScript writes
// them, a whole number without Lua's or Python's ".0", text in quotes, and "a list" for any list or
// table. The preludes' __shownValue and BridgeScriptHost's shownScriptValue are its twins.
function shownValue(v) {
  if (v === undefined || v === null) return 'nothing';
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return 'NaN';
    return Number.isFinite(v) ? String(v) : v > 0 ? 'Infinity' : '-Infinity';
  }
  if (typeof v === 'string') return `"${v}"`;
  return typeof v === 'function' ? 'a function' : 'a list';
}

// Hex text is read a token at a time, and a token is one byte: one or two hex digits, with or
// without 0x. A longer token was read as ONE number and clamped, so "F0411000" went out as F0 FF F7
// here and as F0 00 F7 from the player (which kept the low byte), and neither said anything. A
// token that is not one byte is now refused, the message naming it, in the same words as the
// player's BridgeScriptHost. The separators are the same in every runtime: space, tab, the line
// breaks, form and vertical tab, and the comma. JavaScript's \s would also split on a no-break
// space, which Lua and the player do not, so the same text was a message here and a refusal there.
const HEX_BYTE = /^(0x)?[0-9a-f]{1,2}$/i;
const hexTokens = (text) => text.split(/[ \t\r\n\f\v,]+/).filter(Boolean);
function notOneByte(input) {
  if (typeof input !== 'string') return null;
  return hexTokens(input).find((token) => !HEX_BYTE.test(token)) ?? null;
}
// One item of a list of bytes: a whole number from 0 to 255, or text that is one byte by the rule
// above, so ["F0", "41"] is F0 41. A list item used to be clamped (300 went out as FF, System Reset,
// inside a SysEx), and a text item read as decimal ("41" went out as 29).
const byteItem = (v) => (typeof v === 'number' ? (Number.isInteger(v) && v >= 0 && v <= 255 ? v : undefined)
  : typeof v === 'string' && HEX_BYTE.test(v) ? parseInt(v, 16) : undefined);
/** The bytes a script passed, as numbers from 0 to 255: hex text, a list, a wasmoon Lua table (which
 *  arrives as an object) or a typed array. Nothing given is an empty list, for the caller to judge.
 *  Anything else is null, after saying what was wrong; `outcome` finishes "so …": what did not
 *  happen because of it. */
function scriptBytes(verb, input, outcome = 'nothing was sent') {
  if (input === undefined || input === null) return [];
  if (typeof input === 'string') {
    const token = notOneByte(input);
    if (token === null) return hexTokens(input).map((t) => parseInt(t, 16));
    const spaced = /^[0-9a-f]+$/i.test(token) && token.length % 2 === 0 ? token.match(/../g).join(' ') : '';
    addScriptTrace('error', '', `${verb}: "${token}" is not one byte, so ${outcome}. `
      + (spaced ? `Put a space between the bytes: "${spaced}".`
        : 'Each byte is one or two hex digits, with spaces between the bytes: "F0 41 10 F7".'));
    return null;
  }
  if (typeof input !== 'object') {
    addScriptTrace('error', '', `${verb}: ${shownValue(input)} is not a list of bytes, so ${outcome}.`);
    return null;
  }
  const items = Array.isArray(input) ? input : Object.values(input);
  const bytes = [];
  for (let i = 0; i < items.length; i += 1) {
    const b = byteItem(items[i]);
    if (b === undefined) {
      addScriptTrace('error', '', `${verb}: ${shownValue(items[i])} at position ${i} is not a byte, so ${outcome}. `
        + 'A byte is a whole number from 0 to 255, or one or two hex digits such as "F7".');
      return null;
    }
    bytes.push(b);
  }
  return bytes;
}
function toHexMessage(bytes) {
  return bytes.map((v) => (midiInt(v, 0, 255) & 0xff).toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

/* ------------------------------------------------------------------- byte lists */
// What JUCE's MemoryBlock does, over the plain lists scripts already pass bytes in
// (docs/design/script-bytes.md): bit fields and multi-byte values read and written at an offset, a
// pattern found, a run cut out or written in, and a list turned into hex or base64 text and back.
// Lists rather than a block object, because only plain data crosses between scripts and languages
// (panel-api-spec Q3). The rules, the same in every prelude and pinned word for word by
// scriptPreludeAgreement.test.js:
//   - offsets and bit positions count from 0, in every language, as dump layouts do (Lua too);
//   - a list may also be hex text, and its items are bytes, both by scriptBytes' rule: a number
//     from 0 to 255 or one hex byte. Anything else is refused, as a send refuses it;
//   - nothing is answered for a mistake, and the error says what it was. Nothing is clamped,
//     wrapped or padded into a plausible answer, except that a write may run past the end of a
//     list and grow it, since that is how a message is built;
//   - every list that comes back is new. The one passed in is never changed.
const isWholeNumber = (n) => typeof n === 'number' && Number.isInteger(n);
function bytesRefuse(verb, why, tail = '') {
  addScriptTrace('error', '', `${verb}: ${why}, so there is no answer.${tail ? ` ${tail}` : ''}`);
  return undefined;
}
// No bytes at all is refused here, where a send says "no bytes given": an empty list is a list, but
// toHex(nil) answering "" made a variable left unset look like a message with nothing in it.
function bytesIn(verb, input) {
  if (input === undefined || input === null) return bytesRefuse(verb, 'no bytes given');
  return scriptBytes(verb, input, 'there is no answer') ?? undefined;
}
const BIT_RANGE = 'start must be a whole number from 0, and count one from 1 to 32';
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
// A single position IS past the end; a range RUNS past it, since its first part may be inside.
const span = (word, a, b) => (a === b ? `${word} ${a} is past` : `${word}s ${a} to ${b} run past`);
const WRITE_START = 'Writing can run past the end, but not start beyond it.';
// Why a value to write cannot be written in `bits` bits, or '' when it can. A value left out is
// named as such rather than printed, since each language would print it as a different word.
const doesNotFit = (v, bits) => (v === undefined || v === null ? 'the value to write is missing'
  : !isWholeNumber(v) ? `${shownValue(v)} is not a whole number`
    : v < 0 || v >= 2 ** bits ? `${v} does not fit in ${plural(bits, 'bit')}` : '');
function bytesOpts(verb, opts) {
  const bits = opts?.bits ?? 7;
  // In any case, as every word from a list is read: "MSB" is "msb".
  const order = typeof opts?.order === 'string' ? opts.order.trim().toLowerCase() : (opts?.order ?? 'msb');
  if (bits !== 7 && bits !== 8) return bytesRefuse(verb, 'bits must be 7 or 8');
  if (order !== 'msb' && order !== 'lsb') return bytesRefuse(verb, 'order must be "msb" or "lsb"');
  return { bits, order };
}
function bytesGetBits(value, start, count) {
  const verb = 'ce.midi.getBits';
  if (!isWholeNumber(start) || start < 0 || !isWholeNumber(count) || count < 1 || count > 32) {
    return bytesRefuse(verb, BIT_RANGE);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return bytesRefuse(verb, `${shownValue(value)} is not a finite number`);
    if (start + count > 32) return bytesRefuse(verb, `${span('bit', start, start + count - 1)} the 32 bits a number holds here`);
    const m = 2 ** count;
    return ((Math.floor(Math.floor(value) / 2 ** start) % m) + m) % m;
  }
  const bytes = bytesIn(verb, value);
  if (!bytes) return undefined;
  if (start + count > bytes.length * 8) {
    return bytesRefuse(verb, `${span('bit', start, start + count - 1)} the end of ${plural(bytes.length, 'byte')}`);
  }
  let out = 0;
  for (let k = 0; k < count; k += 1) {
    const at = start + k;
    out += (Math.floor(bytes[Math.floor(at / 8)] / 2 ** (at % 8)) % 2) * 2 ** k;
  }
  return out;
}
function bytesSetBits(value, start, count, bits) {
  const verb = 'ce.midi.setBits';
  if (!isWholeNumber(start) || start < 0 || !isWholeNumber(count) || count < 1 || count > 32) {
    return bytesRefuse(verb, BIT_RANGE);
  }
  const unfit = doesNotFit(bits, count);
  if (unfit) return bytesRefuse(verb, unfit);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return bytesRefuse(verb, `${shownValue(value)} is not a finite number`);
    if (start + count > 32) return bytesRefuse(verb, `${span('bit', start, start + count - 1)} the 32 bits a number holds here`);
    const v = Math.floor(value);
    const m = 2 ** count;
    const old = ((Math.floor(v / 2 ** start) % m) + m) % m;
    return v - old * 2 ** start + bits * 2 ** start;
  }
  const bytes = bytesIn(verb, value);
  if (!bytes) return undefined;
  if (start + count > bytes.length * 8) {
    return bytesRefuse(verb, `${span('bit', start, start + count - 1)} the end of ${plural(bytes.length, 'byte')}`);
  }
  const out = bytes.slice();
  for (let k = 0; k < count; k += 1) {
    const at = start + k;
    const i = Math.floor(at / 8);
    const mask = 2 ** (at % 8);
    const now = Math.floor(out[i] / mask) % 2;
    const want = Math.floor(bits / 2 ** k) % 2;
    out[i] += (want - now) * mask;
  }
  return out;
}
function bytesRead(bytes, offset, count, opts) {
  const verb = 'ce.midi.read';
  const list = bytesIn(verb, bytes);
  if (!list) return undefined;
  if (!isWholeNumber(offset) || offset < 0) return bytesRefuse(verb, 'offset must be a whole number from 0');
  if (!isWholeNumber(count) || count < 1 || count > 4) return bytesRefuse(verb, 'count must be a whole number from 1 to 4');
  const shape = bytesOpts(verb, opts);
  if (!shape) return undefined;
  if (offset + count > list.length) {
    return bytesRefuse(verb, `${span('byte', offset, offset + count - 1)} the end of ${plural(list.length, 'byte')}`);
  }
  const part = list.slice(offset, offset + count);
  if (shape.order === 'lsb') part.reverse();
  let v = 0;
  for (const b of part) v = v * 2 ** shape.bits + (b % 2 ** shape.bits);
  return v;
}
function bytesWrite(bytes, offset, count, value, opts) {
  const verb = 'ce.midi.write';
  const list = bytesIn(verb, bytes);
  if (!list) return undefined;
  if (!isWholeNumber(offset) || offset < 0) return bytesRefuse(verb, 'offset must be a whole number from 0');
  if (!isWholeNumber(count) || count < 1 || count > 4) return bytesRefuse(verb, 'count must be a whole number from 1 to 4');
  const shape = bytesOpts(verb, opts);
  if (!shape) return undefined;
  const unfit = doesNotFit(value, count * shape.bits);
  if (unfit) return bytesRefuse(verb, unfit);
  if (offset > list.length) return bytesRefuse(verb, `offset ${offset} is past the end of ${plural(list.length, 'byte')}`, WRITE_START);
  const digits = [];
  let v = value;
  for (let i = 0; i < count; i += 1) { digits.push(v % 2 ** shape.bits); v = Math.floor(v / 2 ** shape.bits); }
  if (shape.order === 'msb') digits.reverse();
  const out = list.slice();
  digits.forEach((d, i) => { out[offset + i] = d; });
  return out;
}
function bytesSlice(bytes, offset, count) {
  const verb = 'ce.midi.slice';
  const list = bytesIn(verb, bytes);
  if (!list) return undefined;
  if (!isWholeNumber(offset) || offset < 0) return bytesRefuse(verb, 'offset must be a whole number from 0');
  if (count === undefined || count === null) {
    if (offset > list.length) return bytesRefuse(verb, `offset ${offset} is past the end of ${plural(list.length, 'byte')}`);
    return list.slice(offset);
  }
  if (!isWholeNumber(count) || count < 0) return bytesRefuse(verb, 'count must be a whole number from 0');
  if (offset + count > list.length) {
    return bytesRefuse(verb, count === 0 ? `offset ${offset} is past the end of ${plural(list.length, 'byte')}`
      : `${span('byte', offset, offset + count - 1)} the end of ${plural(list.length, 'byte')}`);
  }
  return list.slice(offset, offset + count);
}
function bytesPut(bytes, offset, values) {
  const verb = 'ce.midi.put';
  const list = bytesIn(verb, bytes);
  if (!list) return undefined;
  if (!isWholeNumber(offset) || offset < 0) return bytesRefuse(verb, 'offset must be a whole number from 0');
  const part = bytesIn(verb, values);
  if (!part) return undefined;
  if (offset > list.length) return bytesRefuse(verb, `offset ${offset} is past the end of ${plural(list.length, 'byte')}`, WRITE_START);
  const out = list.slice();
  part.forEach((b, i) => { out[offset + i] = b; });
  return out;
}
function bytesFind(bytes, pattern, from) {
  const verb = 'ce.midi.find';
  const list = bytesIn(verb, bytes);
  if (!list) return undefined;
  const wanted = bytesIn(verb, pattern);
  if (!wanted) return undefined;
  if (!wanted.length) return bytesRefuse(verb, 'the pattern is empty');
  const first = from === undefined || from === null ? 0 : from;
  if (!isWholeNumber(first) || first < 0) return bytesRefuse(verb, 'from must be a whole number from 0');
  // Not found is an answer, not a mistake: nothing comes back and nothing is said.
  for (let i = first; i + wanted.length <= list.length; i += 1) {
    let j = 0;
    while (j < wanted.length && list[i + j] === wanted[j]) j += 1;
    if (j === wanted.length) return i;
  }
  return undefined;
}
// Hex text out, the form the console prints messages in and every send reads back: two uppercase
// digits a byte, one space between. Reading it back is scriptBytes' rule, so text that is not a
// byte at a time is refused here as it is in a send.
function bytesToHex(bytes) {
  const list = bytesIn('ce.midi.toHex', bytes);
  return list ? list.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ') : undefined;
}
function bytesFromHex(text) {
  const verb = 'ce.midi.fromHex';
  if (text === undefined || text === null) return bytesRefuse(verb, 'no hex text given');
  if (typeof text !== 'string') return bytesRefuse(verb, `${shownValue(text)} is not hex text`);
  return bytesIn(verb, text);
}
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function bytesToBase64(bytes) {
  const list = bytesIn('ce.midi.toBase64', bytes);
  if (!list) return undefined;
  let out = '';
  for (let i = 0; i < list.length; i += 3) {
    const a = list[i], b = list[i + 1], c = list[i + 2];
    const n = a * 65536 + (b ?? 0) * 256 + (c ?? 0);
    out += BASE64[Math.floor(n / 262144) % 64] + BASE64[Math.floor(n / 4096) % 64]
      + (b === undefined ? '=' : BASE64[Math.floor(n / 64) % 64])
      + (c === undefined ? '=' : BASE64[n % 64]);
  }
  return out;
}
function bytesFromBase64(text) {
  const verb = 'ce.midi.fromBase64';
  if (text === undefined || text === null) return bytesRefuse(verb, 'no base64 text given');
  const clean = typeof text === 'string' ? text.replace(/[ \t\r\n]/g, '') : null;
  if (clean === null || clean.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) {
    return bytesRefuse(verb, 'that is not base64', 'Base64 is groups of four characters from A-Z, a-z, '
      + '0-9, + and /, with = only as padding at the end.');
  }
  const out = [];
  for (let i = 0; i < clean.length; i += 4) {
    const group = clean.slice(i, i + 4);
    const pad = (group.match(/=/g) ?? []).length;
    let n = 0;
    for (let j = 0; j < 4; j += 1) n = n * 64 + (group[j] === '=' ? 0 : BASE64.indexOf(group[j]));
    out.push(Math.floor(n / 65536) % 256);
    if (pad < 2) out.push(Math.floor(n / 256) % 256);
    if (pad < 1) out.push(n % 256);
  }
  return out;
}
/* ------------------------------------------------------------- the older encoding helpers */
// to7bit to fromSigned, held to the byte lists' rule: a value that does not fit, a number that is
// not one and a list that is not bytes answer nothing and say why. They answered a wrong number
// without a word: to14bit(20000) wrapped to 3616, nibblize({300}) split 300, toSigned(-200, 8) gave
// 56, denibblize joined an odd half with 0. A value to split is rounded down first, as it always
// was; a part to join must be whole. The same words in every prelude, which
// scriptPreludeAgreement.test.js checks.
// A number, or text that is one; undefined after the error.
function packNumber(verb, what, v) {
  const n = realNumber(v);
  if (n !== undefined) return n;
  return bytesRefuse(verb, `${what} is a number, and ${v === undefined || v === null ? 'none was given' : `${shownValue(v)} is not`}`);
}
// A number already read, as a whole number from 0 below 2 ** bits; undefined after the error.
function packRange(verb, what, n, bits, room, roundDown) {
  const m = roundDown ? Math.floor(n) : n;
  if (!Number.isInteger(m)) return bytesRefuse(verb, `${what} is ${String(n)}, which is not a whole number`);
  if (m < 0 || m >= 2 ** bits) return bytesRefuse(verb, `${what} is ${String(n)}, which does not fit in ${room}`);
  return m;
}
function packFit(verb, what, v, bits, room, roundDown) {
  const n = packNumber(verb, what, v);
  return n === undefined ? undefined : packRange(verb, what, n, bits, room, roundDown);
}
// A whole-number setting from lo to hi: to7bit's count, the bits of a signed number. Left out, the
// fallback when there is one.
function packSetting(verb, what, v, lo, hi, fallback) {
  if ((v === undefined || v === null) && fallback !== undefined) return fallback;
  const n = realNumber(v);
  if (n === undefined || !Number.isInteger(n) || n < lo || n > hi) {
    return bytesRefuse(verb, `${what} must be a whole number from ${lo} to ${hi}`);
  }
  return n;
}
// "msb" or "lsb", in any case; left out, "msb". Anything else was read as "lsb".
function packOrder(verb, order) {
  const o = order === undefined || order === null ? 'msb' : typeof order === 'string' ? order.trim().toLowerCase() : order;
  return o === 'msb' || o === 'lsb' ? o : bytesRefuse(verb, 'order must be "msb" or "lsb"');
}
// A list of bytes whose every item is below 2 ** bits; `why` says what one that is not is.
function packList(verb, input, bits, why) {
  const list = bytesIn(verb, input);
  if (!list) return undefined;
  const at = list.findIndex((b) => b >= 2 ** bits);
  return at < 0 ? list : bytesRefuse(verb, `${list[at]} at position ${at} ${why}`);
}
function packTo14bit(v) {
  const n = packFit('ce.midi.to14bit', 'v', v, 14, '14 bits', true);
  return n === undefined ? undefined : { msb: Math.floor(n / 128), lsb: n % 128 };
}
function packFrom14bit(msb, lsb) {
  const verb = 'ce.midi.from14bit';
  const hi = packFit(verb, 'msb', msb, 7, '7 bits');
  if (hi === undefined) return undefined;
  const lo = packFit(verb, 'lsb', lsb, 7, '7 bits');
  return lo === undefined ? undefined : hi * 128 + lo;
}
function packTo7bit(v, count, order) {
  const verb = 'ce.midi.to7bit';
  const n = packNumber(verb, 'v', v);
  if (n === undefined) return undefined;
  const k = packSetting(verb, 'count', count, 1, 4, 2);
  if (k === undefined) return undefined;
  const o = packOrder(verb, order);
  if (o === undefined) return undefined;
  let x = packRange(verb, 'v', n, 7 * k, `${plural(k, 'byte')} of 7 bits`, true);
  if (x === undefined) return undefined;
  const out = [];
  for (let i = 0; i < k; i += 1) { out.push(x % 128); x = Math.floor(x / 128); }
  return o === 'msb' ? out.reverse() : out;
}
function packFrom7bit(bytes, order) {
  const verb = 'ce.midi.from7bit';
  const list = packList(verb, bytes, 7, 'does not fit in 7 bits');
  if (!list) return undefined;
  if (list.length < 1 || list.length > 4) return bytesRefuse(verb, `it joins 1 to 4 bytes, and ${list.length} were given`);
  const o = packOrder(verb, order);
  if (o === undefined) return undefined;
  let v = 0;
  for (const b of o === 'msb' ? list : list.slice().reverse()) v = v * 128 + b;
  return v;
}
function packToNibbles(b) {
  const n = packFit('ce.midi.toNibbles', 'byte', b, 8, '8 bits', true);
  return n === undefined ? undefined : { hi: Math.floor(n / 16), lo: n % 16 };
}
function packFromNibbles(hi, lo) {
  const verb = 'ce.midi.fromNibbles';
  const h = packFit(verb, 'hi', hi, 4, '4 bits');
  if (h === undefined) return undefined;
  const l = packFit(verb, 'lo', lo, 4, '4 bits');
  return l === undefined ? undefined : h * 16 + l;
}
function packNibblize(bytes) {
  const list = bytesIn('ce.midi.nibblize', bytes);
  if (!list) return undefined;
  const out = [];
  for (const b of list) out.push(Math.floor(b / 16), b % 16);
  return out;
}
function packDenibblize(bytes) {
  const verb = 'ce.midi.denibblize';
  const list = packList(verb, bytes, 4, 'does not fit in 4 bits');
  if (!list) return undefined;
  if (list.length % 2 === 1) return bytesRefuse(verb, `the halves come in pairs, and ${list.length} is an odd count`);
  const out = [];
  for (let i = 0; i < list.length; i += 2) out.push(list[i] * 16 + list[i + 1]);
  return out;
}
// Text longer than the length is cut to it, and a length that is not one is no length; each said
// once. The text went out whole, past the field a patch name has in a dump, and a length of "x"
// or 0 filled nothing without a word.
const packWarned = new Set();
function packSaid(key, said) {
  if (packWarned.has(key)) return;
  packWarned.add(key);
  addScriptTrace('warn', '', `${said} This is said only the first time.`);
}
function packToAscii(str, length) {
  const verb = 'ce.midi.toAscii';
  if (typeof str !== 'string') {
    return bytesRefuse(verb, `str is text, and ${str === undefined || str === null ? 'none was given' : `${shownValue(str)} is not`}`);
  }
  const out = [];
  for (let i = 0; i < str.length; i += 1) {
    const c = str.charCodeAt(i);
    if (c > 127) return bytesRefuse(verb, 'the text has a character outside ASCII');
    out.push(c);
  }
  if (length === undefined || length === null) return out;
  const n = realNumber(length);
  if (n === undefined || !Number.isInteger(n) || n < 1) {
    packSaid('toAscii length', `${verb}: length is ${shownValue(length)}, which is not a whole number from 1, so the text was neither filled out nor cut.`);
    return out;
  }
  if (out.length > n) {
    packSaid('toAscii cut', `${verb}: "${str}" is longer than ${plural(n, 'character')}, so it was cut to ${n}.`);
    out.length = n;
  }
  while (out.length < n) out.push(32);
  return out;
}
function packFromAscii(bytes) {
  const list = packList('ce.midi.fromAscii', bytes, 7, 'is not an ASCII character');
  return list ? list.map((b) => String.fromCharCode(b)).join('') : undefined;
}
function packOffset(verb, what, v, center, sign) {
  const n = packNumber(verb, what, v);
  if (n === undefined) return undefined;
  const c = packNumber(verb, 'center', center);
  return c === undefined ? undefined : n + sign * c;
}
function packToSigned(v, bits) {
  const verb = 'ce.midi.toSigned';
  const n = packNumber(verb, 'v', v);
  if (n === undefined) return undefined;
  const k = packSetting(verb, 'bits', bits, 1, 32);
  if (k === undefined) return undefined;
  const m = Math.floor(n);
  const half = 2 ** (k - 1);
  if (m < -half || m >= half) {
    return bytesRefuse(verb, `v is ${String(n)}, and in ${plural(k, 'bit')} a signed number is from ${-half} to ${half - 1}`);
  }
  return m < 0 ? m + 2 ** k : m;
}
function packFromSigned(b, bits) {
  const verb = 'ce.midi.fromSigned';
  const n = packNumber(verb, 'b', b);
  if (n === undefined) return undefined;
  const k = packSetting(verb, 'bits', bits, 1, 32);
  if (k === undefined) return undefined;
  const m = packRange(verb, 'b', n, k, plural(k, 'bit'));
  if (m === undefined) return undefined;
  return m >= 2 ** (k - 1) ? m - 2 ** k : m;
}
// checksum(kind, bytes). "roland"/"yamaha" are the same two's-complement 7-bit sum — Roland
// documents it as (128 - sum) & 0x7F and Yamaha as (0 - sum) & 0x7F, which are the same number —
// so both spellings are accepted rather than pretending to tell them apart. "sum" is the plain
// 7-bit sum and "xor" the running XOR, for the devices that use those instead.
//
// The one-argument form checksum(bytes) defaults to roland: that is what this runtime accepted
// when it ignored the type argument entirely, so panels written against it keep working.
/**
 * One checksum, from the shared table (design doc §48).
 *
 * This used to hold its own three-branch implementation and fall through to Roland for anything it
 * did not recognise — so checksum("crc16", bytes) came back as a plausible Roland checksum and a
 * typo was indistinguishable from a working call. Every other vocabulary in this API returns nothing
 * for a name it does not know; this one now does too, and says what it would have accepted.
 *
 * The table is shared with the device profile engine, which understood a DIFFERENT two algorithms
 * under different names. Two implementations of the same arithmetic is how they drifted apart.
 */
function checksumOf(kind, bytes, opts) {
  // The bytes have been through scriptBytes, so each one is already 0 to 255.
  const value = typeof kind === 'string' ? computeChecksum(kind, bytes, opts) : undefined;
  if (value === undefined) {
    // The algorithm left out is named as such, rather than printed as undefined, nil or None.
    const which = kind === undefined || kind === null ? ': no algorithm given'
      : `(${typeof kind === 'string' ? `"${kind}"` : shownValue(kind)}): no such algorithm`;
    addScriptTrace('error', '', `ce.midi.checksum${which}. One of: ${checksumNames().join(', ')}.`);
    return undefined;
  }
  return value;
}

// routeMidi(role, fn) — the destination for sends made inside the block. A block rather than a
// per-call argument, the same shape noTransmit() uses: it keeps thirteen signatures unchanged and
// reads as what it is, a decision that applies to a run of sends rather than to one of them.
let routedRole = null;
let activeScriptNoteSeq = 0;
const activeScriptNotes = new Map(); // token -> { role, channel, note, timerId }

function sendRawMidi(bytes, actionId) {
  const message = toHexMessage(bytes);
  const role = routedRole ?? DEFAULT_ROLE;
  if (isJuceAvailable()) {
    // The outbound filters run inside triggerRawMidiAction, not here — a control's own binding
    // sends through that door too, and interceptOut has to see those as well.
    triggerRawMidiAction({ deviceRole: role, actionId, message, dryRun: false });
    addScriptTrace('midi', '', `→ ${actionId}: ${message}${role === DEFAULT_ROLE ? '' : `  [${role}]`}`);
  } else {
    addScriptTrace('midi', '', `→ ${actionId}: ${message}  (no JUCE host — not sent)`);
  }
}

function sendRawMidiForRole(bytes, actionId, role) {
  const previous = routedRole;
  routedRole = role;
  try { sendRawMidi(bytes, actionId); }
  finally { routedRole = previous; }
}

function releaseTrackedScriptNotes(role, channel, note) {
  for (const [token, active] of activeScriptNotes) {
    if (active.role !== role || active.channel !== channel || active.note !== note) continue;
    if (active.timerId) {
      afterCallbacks.delete(active.timerId);
      stopTimer(active.timerId);
    }
    activeScriptNotes.delete(token);
  }
}

// MIDI channel messages — arithmetic over one raw-byte send, the way panic() is over sendCC, which
// is what makes them identical in every runtime and every exported language. `note` accepts a MIDI
// number or a name ("C3"), because a script that reads musically should be allowed to say so.
// The numbers a channel message carries, checked before anything is sent. They were clamped, and a
// clamp is not harmless here: CC 200 went out as CC 127 (Poly Mode On), "cutoff" as CC 0 (Bank
// Select), channel 0 or 17 as 1 or 16, a missing velocity as 0 (a note off). So an ADDRESS (channel,
// controller, program, bank, parameter number) outside its range is refused, since clamping it picks
// a different message; so is anything that is not a number, or is missing where there is no default.
// Text that is a number ("64", from a label say) is read as one, as it always was, by realNumber's
// rule. A VALUE past the end of its range (a CC value of 128) is sent as the nearest end, which is
// the same message one step along, and the first time for each command a warning says so: such a
// value comes from the script's own arithmetic (0..1 times 128, an offset added, a curve that
// overshoots), and the warning points at it without filling the console sixty times a second. A
// number with a fraction is rounded half up, the same in every runtime (the player floored it). The
// preludes' __midiArg is the twin of this, word for word.
const MIDI_ARGS = {
  channel: ['channel', 'a channel', 1, 16, true, 'A channel is a whole number from 1 to 16.'],
  controller: ['controller number', 'a controller number', 0, 127, true, 'A controller number is a whole number from 0 to 127.'],
  program: ['program', 'a program', 0, 127, true, 'A program is a whole number from 0 to 127.'],
  bank: ['bank number', 'a bank number', 0, 127, true, 'A bank number is a whole number from 0 to 127.'],
  msb: ['MSB', 'an MSB', 0, 127, true, 'An MSB is a whole number from 0 to 127.'],
  lsb: ['LSB', 'an LSB', 0, 127, true, 'An LSB is a whole number from 0 to 127.'],
  value: ['value', 'a value', 0, 127, false, 'A value is a number from 0 to 127.'],
  velocity: ['velocity', 'a velocity', 0, 127, false, 'A velocity is a number from 0 to 127.'],
  pressure: ['pressure', 'a pressure', 0, 127, false, 'A pressure is a number from 0 to 127.'],
  value14: ['value', 'a value', 0, 16383, false, 'A value is a number from 0 to 16383.'],
  bend: ['bend', 'a bend', 0, 16383, false, 'A bend is a number from 0 to 16383, and 8192 is the centre.'],
  position: ['song position', 'a song position', 0, 16383, false, 'A song position is a number of MIDI beats from 0 to 16383.'],
};
const edgeWarned = new Set();   // the commands that have said a value was past its end; resetScriptState clears it
/** The number to send for `kind`, or undefined after saying why nothing was sent. */
function midiArg(verb, kind, v) {
  const [noun, aNoun, lo, hi, address, hint] = MIDI_ARGS[kind];
  if (v === undefined || v === null) {
    addScriptTrace('error', '', `${verb}: no ${noun} given, so nothing was sent.`);
    return undefined;
  }
  const r = realNumber(v);
  const n = r === undefined ? undefined : Math.floor(r + 0.5);
  if (n === undefined || (address && (n < lo || n > hi))) {
    addScriptTrace('error', '', `${verb}: ${shownValue(v)} is not ${aNoun}, so nothing was sent. ${hint}`);
    return undefined;
  }
  if (n >= lo && n <= hi) return n;
  const sent = n < lo ? lo : hi;
  if (!edgeWarned.has(verb)) {
    edgeWarned.add(verb);
    addScriptTrace('warn', '', `${verb}: the ${noun} ${shownValue(v)} is outside ${lo} to ${hi}, so ${sent} was sent. `
      + 'This is said only the first time.');
  }
  return sent;
}
// A note: a MIDI number from 0 to 127, rounded, or a name such as "C4" whose number is in that range.
// An unreadable name used to become note 0, so "c4" (the letter must be a capital) played C-1, the
// bottom of the keyboard, with nothing to say why; and a name past the top, "C10", put 132 in the
// data byte, which a synth reads as a status byte. Anything else, NaN or a table included, played
// C-1 by the numeric path. Each is refused by refuseNote, in the preludes' __badNote words.
const midiNote = (n) => {
  const v = typeof n === 'string' ? noteNumberOf(n)
    : typeof n === 'number' && Number.isFinite(n) ? Math.floor(n + 0.5) : undefined;
  return v !== undefined && v >= 0 && v <= 127 ? v : undefined;
};
function refuseNote(verb, note) {
  const range = 'MIDI notes run from 0 to 127, which is C-1 to G9.';
  let why;
  if (note === undefined || note === null) {
    why = 'no note was given, so nothing was sent. A note is a MIDI number or a name, such as 60 or "C4".';
  } else if (typeof note === 'string') {
    why = noteNumberOf(note) === undefined
      ? `"${note}" is not a note name, so nothing was sent. A name is a letter from A to G, then # or b if it `
        + 'has one, then the octave: "C4", "Eb3", "F#-1".'
      : `"${note}" is outside the MIDI notes, so nothing was sent. ${range}`;
  } else if (typeof note === 'number' && Number.isFinite(note)) {
    why = `${note} is outside the MIDI notes, so nothing was sent. ${range}`;
  } else {
    why = `${shownValue(note)} is not a note, so nothing was sent. A note is a MIDI number or a name, such as 60 or "C4".`;
  }
  addScriptTrace('error', '', `${verb}: ${why}`);
}
// sendNote's `ms`: left out, the script sends the note off itself; given, it must be a length.
// "500ms", NaN or -5 sent the note on and never the note off, a hung voice.
function noteLength(verb, ms) {
  if (ms === undefined || ms === null) return null;
  const length = realNumber(ms);   // "500" is what sendNote has always read
  if (length !== undefined && length > 0) return length;
  addScriptTrace('error', '', `${verb}: ${shownValue(ms)} is not a length in milliseconds, so nothing was sent. `
    + 'Give a number above 0, or leave it out to send the note off yourself.');
  return undefined;
}

/* --- the wire filters: interceptIn / interceptOut / feed --------------------------------------
 * ce.core.intercept filters a MODEL PATH. These filter the WIRE, and they are a different thing:
 * inbound reaches the panel's bindings, the note input and the transport long before any script
 * sees it, and outbound leaves from a control's own binding as often as from a sendCC. So they are
 * installed at the app's two choke points via midiFilters.js rather than applied here — see the
 * note in that module for why the seam exists at all.
 *
 * Filters are per script and replace that script's previous one, the same rule the ce.core rules
 * follow. Order across scripts is registration order, and each sees what the last one produced. */
const midiIn = [];    // { scriptId, fn }
const midiOut = [];   // { scriptId, fn }

function putMidiFilter(list, scriptId, fn) {
  if (typeof fn !== 'function') return;
  const at = list.findIndex((f) => f.scriptId === scriptId);
  if (at >= 0) list[at] = { scriptId, fn }; else list.push({ scriptId, fn });
  installMidiFilters();
}

function clearMidiFiltersFor(scriptId) {
  for (const list of [midiIn, midiOut]) {
    for (let i = list.length - 1; i >= 0; i--) if (list[i].scriptId === scriptId) list.splice(i, 1);
  }
  installMidiFilters();
}

/** Run a chain over a message payload. Returns the payload, or null if a filter swallowed it. */
function runMidiChain(list, payload, label) {
  let bytes = hexToBytes(payload?.hex);
  for (const f of list) {
    let out;
    try { out = f.fn(bytes.slice()); } catch (e) { reportScriptError(f.scriptId, e); continue; }
    if (out === false) {
      addScriptTrace('midi', f.scriptId, `${label}: swallowed ${toHexMessage(bytes)}`);
      return null;
    }
    if (out === undefined || out === null) continue;    // no opinion — pass it on unchanged
    // What a filter returns is read as a send reads bytes. "903C7F" used to become FF, and an
    // unreadable token 00, and that went out in place of the message; now the message goes nowhere
    // and the filter's mistake is named.
    const next = scriptBytes(label === 'out' ? 'interceptMidiOut' : 'interceptMidiIn', out,
      label === 'out' ? 'the message was not sent' : 'the message was dropped');
    if (!next) return null;
    if (!next.length) continue;                          // an empty array is not a decision
    bytes = next;
  }
  return { ...payload, hex: toHexMessage(bytes) };
}

/** Put the current chains behind the app's two choke points, or take them away when empty. */
function installMidiFilters() {
  setInboundMidiFilter(midiIn.length ? (p) => runMidiChain(midiIn, p, 'in') : null);
  setOutboundMidiFilter(midiOut.length ? (p) => runMidiChain(midiOut, p, 'out') : null);
}

/** An NRPN or RPN: the parameter number in two CCs, then the 14-bit value in data entry 6 and 38. */
function sendParameterNumber(verb, label, msbCc, lsbCc, ch, msb, lsb, v) {
  const c = midiArg(verb, 'channel', ch);
  const m = c === undefined ? undefined : midiArg(verb, 'msb', msb);
  const l = m === undefined ? undefined : midiArg(verb, 'lsb', lsb);
  const val = l === undefined ? undefined : midiArg(verb, 'value14', v);
  if (val === undefined) return;
  const s = 0xB0 | (c - 1);
  sendRawMidi([s, msbCc, m, s, lsbCc, l, s, 0x06, (val >> 7) & 0x7f, s, 0x26, val & 0x7f], `${label}_${m}_${l}`);
}

const midiApi = {
  sendMidi: (bytes) => {
    const b = scriptBytes('sendMidi', bytes);
    if (!b) return;
    if (!b.length) { addScriptTrace('error', '', 'sendMidi: no bytes given'); return; }
    sendRawMidi(b, 'raw');
  },
  sendNote: (ch, note, velocity, ms) => {
    const c = midiArg('sendNote', 'channel', ch);
    if (c === undefined) return;
    const n = midiNote(note);
    if (n === undefined) { refuseNote('sendNote', note); return; }
    const vel = midiArg('sendNote', 'velocity', velocity);
    if (vel === undefined) return;
    const length = noteLength('sendNote', ms);
    if (length === undefined) return;
    const channel = c - 1;
    const role = routedRole ?? DEFAULT_ROLE;
    sendRawMidi([0x90 | channel, n, vel], `note_${n}`);
    const token = ++activeScriptNoteSeq;
    const active = { role, channel, note: n, timerId: '' };
    activeScriptNotes.set(token, active);
    // A duration schedules the note off. Not doing this was making every script that plays a note
    // hand-roll a timer, and getting it wrong meant a hung voice — the one MIDI mistake you hear
    // rather than read. The role is captured now, so a note started inside routeMidi() ends where
    // it began even though the block has long since closed.
    if (length === null) return;
    active.timerId = scheduleOneShot(length, () => {
      if (!activeScriptNotes.delete(token)) return;
      sendRawMidiForRole([0x80 | channel, n, 0], `noteoff_${n}`, role);
    });
  },
  sendNoteOff: (ch, note, velocity) => {
    const c = midiArg('sendNoteOff', 'channel', ch);
    if (c === undefined) return;
    const n = midiNote(note);
    if (n === undefined) { refuseNote('sendNoteOff', note); return; }
    const vel = midiArg('sendNoteOff', 'velocity', velocity ?? 0);   // release velocity: 0 unless given
    if (vel === undefined) return;
    const channel = c - 1;
    const role = routedRole ?? DEFAULT_ROLE;
    releaseTrackedScriptNotes(role, channel, n);
    sendRawMidi([0x80 | channel, n, vel], `noteoff_${n}`);
  },
  sendProgramChange: (ch, program, bankMsb, bankLsb) => {
    const verb = 'sendProgramChange';
    const c = midiArg(verb, 'channel', ch);
    if (c === undefined) return;
    const p = midiArg(verb, 'program', program);
    if (p === undefined) return;
    const msb = bankMsb === undefined || bankMsb === null ? null : midiArg(verb, 'bank', bankMsb);
    if (msb === undefined) return;
    const lsb = bankLsb === undefined || bankLsb === null ? null : midiArg(verb, 'bank', bankLsb);
    if (lsb === undefined) return;
    // Bank select first: a device applies the bank that was in force when the program change lands.
    const s = 0xB0 | (c - 1);
    if (msb !== null) sendRawMidi([s, 0, msb], 'cc_0');
    if (lsb !== null) sendRawMidi([s, 32, lsb], 'cc_32');
    sendRawMidi([0xC0 | (c - 1), p], `pc_${p}`);
  },
  sendPitchBend: (ch, value) => {
    const c = midiArg('sendPitchBend', 'channel', ch);
    if (c === undefined) return;
    const v = midiArg('sendPitchBend', 'bend', value ?? 8192);   // left out, the bend centres
    if (v === undefined) return;
    sendRawMidi([0xE0 | (c - 1), v % 128, Math.floor(v / 128) % 128], 'bend');
  },
  sendAftertouch: (ch, pressure, note) => {
    const c = midiArg('sendAftertouch', 'channel', ch);
    if (c === undefined) return;
    if (note === undefined || note === null) {
      const p = midiArg('sendAftertouch', 'pressure', pressure);
      if (p !== undefined) sendRawMidi([0xD0 | (c - 1), p], 'aftertouch');
      return;
    }
    const n = midiNote(note);
    if (n === undefined) { refuseNote('sendAftertouch', note); return; }
    const p = midiArg('sendAftertouch', 'pressure', pressure);
    if (p === undefined) return;
    sendRawMidi([0xA0 | (c - 1), n, p], 'polyaftertouch');
  },
  // feed(bytes) — inject as if the hardware had sent it, so the panel's OWN bindings, note input
  // and transport all act on it. set() moves a control directly and bypasses every binding, which
  // is a different thing: this is how a script-built arpeggiator drives the panel rather than
  // fighting it. Inbound filters run on it, so a fed message obeys the same rules as a real one —
  // a velocity curve that applies to the keyboard has to apply to the sequencer too.
  feedMidi: (bytes) => {
    const b = scriptBytes('feedMidi', bytes, 'nothing was fed');
    if (!b) return;
    if (!b.length) { addScriptTrace('error', '', 'feedMidi: no bytes given'); return; }
    const status = b[0] ?? 0;
    const kind = (status & 0xf0) === 0xb0 ? 'cc' : (status & 0xf0) === 0x90 || (status & 0xf0) === 0x80 ? 'note' : 'raw';
    const payload = filterInboundMidi({ hex: toHexMessage(b), messageType: kind, fed: true });
    if (!payload) return;                       // a filter swallowed what we fed it
    addScriptTrace('midi', '', `← fed ${payload.hex}`);
    latestMidiInputMessage.set(payload);
  },
  interceptMidiIn: null,      // bound per script in the api factory — it needs the caller's id
  interceptMidiOut: null,
  routeMidi: null,
  sendClock: () => sendRawMidi([0xF8], 'clock'),
  // Any action but stop and continue used to send Start, so "pause" started the sequencer.
  sendTransport: (action) => {
    const verb = 'sendTransport';
    const actions = 'The actions are "start", "continue" and "stop".';
    if (action === undefined || action === null) {
      addScriptTrace('error', '', `${verb}: no action given, so nothing was sent. ${actions}`);
      return;
    }
    const a = typeof action === 'string' ? action.trim().toLowerCase() : '';
    const status = { start: 0xFA, continue: 0xFB, stop: 0xFC }[a];
    if (status === undefined) {
      addScriptTrace('error', '', `${verb}: ${shownValue(action)} is not a transport action, so nothing was sent. ${actions}`);
      return;
    }
    sendRawMidi([status], `transport_${a}`);
  },

  sendCC: (ch, cc, v) => {
    const c = midiArg('sendCC', 'channel', ch);
    const n = c === undefined ? undefined : midiArg('sendCC', 'controller', cc);
    const value = n === undefined ? undefined : midiArg('sendCC', 'value', v);
    if (value !== undefined) sendRawMidi([0xB0 | (c - 1), n, value], `cc_${n}`);
  },
  // RPN is NRPN with CC 101/100 instead of 99/98 — the standard path for pitch-bend range,
  // fine tuning and coarse tuning, which is what a panel sets once at load.
  sendRPN: (ch, msb, lsb, v) => sendParameterNumber('sendRPN', 'rpn', 0x65, 0x64, ch, msb, lsb, v),
  // Song Position Pointer: where the next start resumes from, in MIDI beats (six clocks each).
  sendSongPosition: (beats) => {
    const b = midiArg('sendSongPosition', 'position', beats);
    if (b !== undefined) sendRawMidi([0xF2, b & 0x7f, (b >> 7) & 0x7f], 'songPosition');
  },
  sendNRPN: (ch, msb, lsb, v) => sendParameterNumber('sendNRPN', 'nrpn', 0x63, 0x62, ch, msb, lsb, v),
  sendSysex: (bytes) => {
    let b = scriptBytes('sendSysex', bytes);
    if (!b) return;
    if (b.length === 0) { addScriptTrace('error', '', 'sendSysex: no bytes given'); return; }
    if (b[0] !== 0xF0) b = [0xF0, ...b];
    if (b[b.length - 1] !== 0xF7) b = [...b, 0xF7];
    sendRawMidi(b, 'sysex');
  },
  // Read the synth: routes through the app's device-sync path (resolves the profile on the role).
  // The parameter is `kind`, the name the contract and every other runtime use for it.
  // requestDump is bound in buildApi, not here: its optional callback belongs to a script, and a
  // throw inside it has to be reported against that script. Same reason the wire filters are.
  checksum: (type, bytes, opts) => {
    const verb = 'ce.midi.checksum';
    const oneArg = bytes === undefined || bytes === null;   // one-arg form: checksum(bytes)
    // checksum("roland") with the bytes left out read the NAME as hex text and said "roland" is not
    // one byte. A name the table knows is a name, and what is missing is the bytes.
    if (oneArg && typeof type === 'string' && checksumNames().includes(type.toLowerCase())) {
      addScriptTrace('error', '', `${verb}: no bytes given, so there is no checksum.`);
      return undefined;
    }
    const raw = scriptBytes(verb, oneArg ? type : bytes, 'there is no checksum');
    if (!raw) return undefined;
    if (oneArg && (type === undefined || type === null)) {
      addScriptTrace('error', '', `${verb}: no bytes given, so there is no checksum.`);
      return undefined;
    }
    return oneArg ? checksumOf('roland', raw) : checksumOf(type, raw, opts);
  },

  // panic([opts]) — All Sound Off (120) FIRST, then All Notes Off (123), then Reset All
  // Controllers (121). The order matters: 120 cuts a note that is already ringing, 123 only stops
  // one the device still thinks is held. Expands to plain CC sends, which is why it is portable
  // to every runtime and every exported language rather than needing a host primitive.
  panic: (opts) => {
    const o = opts ?? {};
    const reset = o.resetControllers !== false;
    // A channel that is not one ("all", 17) silenced channel 1 or 16 here and nothing at all from
    // the player's JavaScript; leaving it out is how every channel is named.
    let channels = Array.from({ length: 16 }, (_, i) => i + 1);
    if (o.channel !== undefined && o.channel !== null) {
      const c = midiArg('panic', 'channel', o.channel);
      if (c === undefined) return;
      channels = [c];
    }
    for (const ch of channels) {
      const s = 0xB0 | (ch - 1);
      sendRawMidi([s, 120, 0], 'cc_120');
      sendRawMidi([s, 123, 0], 'cc_123');
      if (reset) sendRawMidi([s, 121, 0], 'cc_121');
    }
  },

  // Bulk dump ↔ panel.
  // applyDump fills the panel from a dump: pass a DECODED { parameterId: value } map and it lands
  // on the bound controls right away (no host needed); pass raw bytes and the device host (C++ DPD
  // codec) decodes them, then onDumpMessageParsed fills the panel + fires onDumpReceived.
  // applyDump(bytes) — the contract's signature. It also accepts an already-decoded
  // { parameter: value } map, which is how a panel fills with no device host attached; that is
  // documented on the member rather than left as a surprise. There is no role parameter: every
  // runtime addresses the main synth, and an undocumented extra argument here is exactly the kind
  // of divergence that put the five runtimes out of step in the first place.
  applyDump: (bytes) => {
    const data = bytes;
    const role = DEFAULT_ROLE;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const n = syncDeviceRuntimeStateToPanelPreview({ [role]: data });
      addScriptTrace('midi', '', `applyDump: filled ${n} control(s) from ${Object.keys(data).length} value(s)`);
      return n;
    }
    if (isJuceAvailable()) {
      const raw = scriptBytes('applyDump', data, 'nothing was decoded');
      if (!raw) return 0;
      parseDumpMessage({ deviceRole: role, message: toHexMessage(raw) });
      addScriptTrace('midi', '', 'applyDump: decoding bulk dump via the device host…');
    } else {
      addScriptTrace('midi', '', 'applyDump(bytes): decoding raw dumps needs the device host — pass a decoded { parameter: value } map to fill now');
    }
    return 0;
  },
  // sendDump builds the dump from the device profile and sends it (host-side bulk send).
  sendDump: (kind) => {
    const role = DEFAULT_ROLE;
    const refused = dumpKindRefusal('sendDump', kind);
    if (refused) {
      addScriptTrace('error', '', refused);
      return;
    }
    if (isJuceAvailable()) {
      startBulkDumpSend({ deviceRole: role, expectedDumpId: String(kind ?? ''), dryRun: false });
      addScriptTrace('midi', '', `sendDump(${JSON.stringify(kind ?? '')}) → bulk send requested`);
    } else {
      addScriptTrace('midi', '', `sendDump(${JSON.stringify(kind ?? '')}) — no device host`);
    }
  },
  // buildDump (panel → bytes). Two cases, and only one of them still needs the host.
  //
  // A layout the SCRIPT declared with defineDump is one this runtime owns outright — the same reason
  // requestDump can send its request bytes with no profile at all — so it is built here, by the
  // local engine, and returns real bytes in the preview. A PROFILE dump's codec lives in the C++
  // DeviceProfileEngine and the preview has no synchronous way to reach it, so that case still
  // reports and returns null, which is what requiresDeviceHost in panelApi.js is about.
  //
  // The error is at ERROR level, not 'midi': it used to be the latter, which reads as ordinary
  // chatter, so a script got a quiet null and no indication anything was wrong.
  buildDump: (kind, values) => {
    const refused = dumpKindRefusal('buildDump', kind, { outcome: 'nothing was built' });
    if (refused) {
      addScriptTrace('error', '', refused);
      return null;
    }
    const built = buildRuntimeDump(DEFAULT_ROLE, String(kind ?? ''), values ?? {});
    if (built === null) {
      addScriptTrace('error', '',
        `buildDump(${JSON.stringify(kind ?? '')}) needs the device host — panel→bytes encoding for a PROFILE dump is `
        + "the device profile's codec, which runs in the host, not the panel view. It returns bytes in the exported "
        + 'plugin. A layout you declare yourself with defineDump builds here and now.');
      return null;
    }
    if (!built.ok) {
      addScriptTrace('error', '', `buildDump(${JSON.stringify(kind ?? '')}): ${built.error}`);
      return null;
    }
    if (built.unmapped?.length)
      addScriptTrace('midi', '', `buildDump(${JSON.stringify(kind ?? '')}) — ${built.unmapped.length} parameter(s) left at their defaults`);
    return built;
  },
};

/** One printer for log/warn/error, so the three cannot format differently. */
function scriptPrint(kind, scriptId, message, value) {
  addScriptTrace(kind, scriptId ?? '',
    value !== undefined ? `${message} ${JSON.stringify(value)}` : String(message));
}

/* ------------------------------------------------------------------ API + executor */

// --- Zone Splitter -----------------------------------------------------------
// `set()` can already reach SplitZone.zones, but nobody is going to hand-write a
// zone array in a script. This reads the current zones, hands them to the same
// pure reducer the editor's own buttons use, and writes the result back — so a
// footswitch changing the split mid-set is one line.
// @module ce.components
/**
 * The message for a component verb pointed at the wrong control.
 *
 * It used to name only what was missing — `"cutoffslider" is not an Arpeggiator (no Arp section)`.
 * True, and no help: the person reading it already believed it WAS one, and the reply tells them
 * nothing about what they have actually got. So say what it is, and what it can do instead.
 *
 * It also separates two failures the old text ran together. A name with no control behind it and a
 * control of the wrong kind read identically before ("is not an Arpeggiator" for a typo), and they
 * want opposite fixes — one is a spelling mistake, the other is a misunderstanding.
 */
function wrongTargetMessage(path, section, label) {
  const article = /^[AEIOU]/i.test(label) ? 'an' : 'a';
  const control = findControlByName(path);
  if (!control) return `"${path}" — this panel has no control by that name.`;

  const type = typeOfControl(control);
  // No type at all is not a case the model produces, but a message is the wrong place to throw.
  if (!type) return `"${path}" is not ${article} ${label} (no ${section} section).`;

  const families = familiesForType(type);
  const instead = families.length
    ? `Its own verbs are ${families.join(', ')}.`
    : `${/^[AEIOU]/i.test(type) ? 'An' : 'A'} ${type} has no component verbs of its own — `
      + 'ce.midi, ce.draw and ce.anim all work on it.';
  return `"${path}" is ${/^[AEIOU]/i.test(type) ? 'an' : 'a'} ${type}, not ${article} ${label}. ${instead}`;
}

// The call a hand-written verb was given, as the script wrote it: its short name and the arguments
// after the target. Its refusal line named the reducer's action and that action's arguments as JSON
// (`quantize {"grid":16}`), where every generated verb names the call (`rate(200)`); both name the
// call now (sectionRefusalLine). Set around each call by shownCalls, below.
let handWrittenCall = null;
function shownCalls(api) {
  for (const [id, fn] of Object.entries(api)) {
    api[id] = (target, ...args) => {
      const outer = handWrittenCall;
      handWrittenCall = { verb: MEMBER_MODULE[id]?.name ?? id, args };
      try { return fn(target, ...args); } finally { handWrittenCall = outer; }
    };
  }
  return api;
}
const handWrittenRefusalLine = (family, target, action, reason) =>
  sectionRefusalLine(family, target, handWrittenCall?.verb ?? action, handWrittenCall?.args ?? [], reason);

function splitAction(path, action, args) {
  const target = String(path ?? '');
  const zonesPath = `${target}.SplitZone.zones`;
  const current = getValue(zonesPath);
  if (!Array.isArray(current)) {
    addScriptTrace('error', '', `split: ${wrongTargetMessage(target, 'SplitZone', 'Zone Splitter')}`);
    return false;
  }
  // A zone that is not one, or a preset there is none of, is refused, and says which there are
  // (handWrittenVerbs.js). The zone was logged as though it had been set, and nothing changed; the
  // preset replaced every zone with one whole-keyboard zone.
  const refused = handWrittenRefusal('split', action, { zones: current }, args ?? {});
  if (refused) {
    addScriptTrace('error', '', handWrittenRefusalLine('split', target, action, refused.reason));
    return false;
  }
  // A script counts zones from 1, as the panel labels them; the reducer indexes them from 0.
  const next = applySplitScriptAction(current, action, reducerArgs('split', action, { zones: current }, args));
  setValue(zonesPath, next);
  addScriptTrace('log', '', `split ${target}: ${action} ${JSON.stringify(args ?? {})}`);
  return true;
}
const splitApi = shownCalls({
  // Their arguments are built where the Values tab builds them (handWrittenVerbs.js).
  splitPreset: (target, preset, lowNote, highNote) => splitAction(target, 'preset', HAND_WRITTEN.splitPreset.args(preset, lowNote, highNote)),
  splitMute: (target, zone, enabled) => splitAction(target, 'mute', HAND_WRITTEN.splitMute.args(zone, enabled)),
  splitChannel: (target, zone, channel) => splitAction(target, 'channel', HAND_WRITTEN.splitChannel.args(zone, channel)),
  splitTranspose: (target, zone, semitones) => splitAction(target, 'transpose', HAND_WRITTEN.splitTranspose.args(zone, semitones)),
  splitPoint: (target, zone, note) => splitAction(target, 'splitPoint', HAND_WRITTEN.splitPoint.args(zone, note)),
  splitRead: (target, field) => sectionRead(target, 'SplitZone', 'split', field),
});

// --- Phrase Sequencer --------------------------------------------------------
// Same idea, one level up: the reducer patches the whole config rather than one
// array, because a seed needs to know the grid size and a key change needs to
// leave the pattern alone. Only the changed fields are written, so an undo step
// says "direction" rather than "the sequencer".
function phraseAction(path, action, args) {
  const target = String(path ?? '');
  const cfg = getValue(`${target}.Phrase`);
  if (!cfg || typeof cfg !== 'object') {
    addScriptTrace('error', '', `phrase: ${wrongTargetMessage(target, 'Phrase', 'Phrase Sequencer')}`);
    return false;
  }
  // A cell off the grid, a seed or a direction there is none of, and a key that is not a pitch
  // class are refused, and say what there is (handWrittenVerbs.js). They said "nothing to change".
  const refused = handWrittenRefusal('phrase', action, cfg, args ?? {});
  if (refused) {
    addScriptTrace('error', '', handWrittenRefusalLine('phrase', target, action, refused.reason));
    return false;
  }
  // A script counts steps and rows from 1; the reducer indexes them from 0.
  const patch = phraseScriptPatch(cfg, action, reducerArgs('phrase', action, cfg, args), () => Math.random());
  const keys = Object.keys(patch);
  // What reaches here is a request the Phrase can take, so an empty patch is one already met (a cell
  // already on, the key it has). It answered nothing either way; it answers true, as the other
  // components do (the Phrase Sequencer's review).
  if (keys.length === 0) {
    addScriptTrace('log', '', `phrase ${target}: ${action} — already that way`);
    return true;
  }
  for (const key of keys) setValue(`${target}.Phrase.${key}`, patch[key]);
  addScriptTrace('log', '', `phrase ${target}: ${action} → ${keys.join(', ')}`);
  return true;
}
const phraseApi = shownCalls({
  phraseSeed: (target, seed) => phraseAction(target, 'seed', HAND_WRITTEN.phraseSeed.args(seed)),
  phraseClear: (target) => phraseAction(target, 'clear', {}),
  phraseKey: (target, key) => phraseAction(target, 'key', HAND_WRITTEN.phraseKey.args(key)),
  phraseScale: (target, scale) => phraseAction(target, 'scale', { scale }),
  phraseTranspose: (target, semitones) => phraseAction(target, 'transpose', { transpose: semitones }),
  phraseDirection: (target, direction) => phraseAction(target, 'direction', HAND_WRITTEN.phraseDirection.args(direction)),
  phraseRun: (target, running) => phraseAction(target, 'run', { running: running !== false }),
  phraseCell: (target, step, row, on) => phraseAction(target, 'cell', HAND_WRITTEN.phraseCell.args(step, row, on)),
  phraseRead: (target, field) => sectionRead(target, 'Phrase', 'phrase', field),
});

// --- Recorder / Harmoniser / Setlist -----------------------------------------
// All three follow the Phrase Sequencer's shape exactly: read the section, hand
// it to a pure reducer, write back only the fields that changed. One helper,
// because three near-identical copies is how they drift apart.
/**
 * Returns whether the component now holds what the call asked for.
 *
 * True covers both "written" and "already that way" — the second is what UNCHANGED marks, and the
 * distinction matters: a script writing `if not setlistEnable(s, 3, true) then warn() end` must
 * not warn because scene 3 was already enabled. False means the call was REFUSED, which for these
 * five reducers is the only other way a patch comes back empty: they build a patch from the
 * request without consulting the current value, so nothing back means nothing accepted.
 *
 * Every one of these used to return undefined for all three outcomes.
 */
function sectionAction(path, section, reducer, action, args) {
  const target = String(path ?? '');
  const cfg = getValue(`${target}.${section}`);
  if (!cfg || typeof cfg !== 'object') {
    addScriptTrace('error', '', `${section.toLowerCase()}: ${wrongTargetMessage(target, section, section)}`);
    return false;
  }
  const result = reducer(cfg, action, args ?? {});
  const patch = patchOf(result);
  const keys = Object.keys(patch);
  if (keys.length === 0) {
    if (isUnchanged(result)) {
      addScriptTrace('log', '', `${section.toLowerCase()} ${target}: ${action} — already that way`);
      return true;
    }
    // Refused, and said so at error level: it reads exactly like a dead footswitch otherwise, and
    // a scene name that does not exist is a typo somebody needs to see.
    // With why (handWrittenVerbs.js): the words there are, a slot that holds no take, the scenes.
    const family = section.toLowerCase();
    addScriptTrace('error', '', handWrittenRefusalLine(family, target, action, handWrittenRefusal(family, action, cfg, args ?? {})?.reason ?? null));
    return false;
  }
  for (const key of keys) setValue(`${target}.${section}.${key}`, patch[key]);
  addScriptTrace('log', '', `${section.toLowerCase()} ${target}: ${action} → ${keys.join(', ')}`);
  return true;
}
const recAction = (t, a, g) => sectionAction(t, 'Recorder', recorderScriptPatch, a, g);
const recorderApi = shownCalls({
  recorderRecord: (target, on) => recAction(target, 'record', on === undefined ? {} : { on: on !== false }),
  recorderStop: (target) => recAction(target, 'stop', {}),
  recorderPlay: (target, playing) => recAction(target, 'play', playing === undefined ? {} : { playing: playing !== false }),
  recorderClear: (target) => recAction(target, 'clear', {}),
  recorderUndo: (target) => recAction(target, 'undo', {}),
  recorderQuantize: (target, grid, strength, scale, key) => {
    const read = recorderQuantizeArgs({ grid, strength, scale, key });
    if (read.reason) {
      addScriptTrace('error', '', handWrittenRefusalLine('recorder', String(target ?? ''), 'quantize', read.reason));
      return false;
    }
    return recAction(target, 'quantize', read.args);
  },
  recorderTranspose: (target, semitones) => recAction(target, 'transpose', { transpose: semitones }),
  recorderBars: (target, bars) => recAction(target, 'bars', { bars }),
  recorderSource: (target, source) => recAction(target, 'source', HAND_WRITTEN.recorderSource.args(source)),
  recorderNudge: (target, by) => recAction(target, 'nudge', { by }),
  recorderShift: (target, semitones) => recAction(target, 'shift', { semitones }),
  recorderStore: (target, slot, name) => recAction(target, 'store', HAND_WRITTEN.recorderStore.args(slot, name)),
  recorderLoad: (target, slot) => recAction(target, 'load', HAND_WRITTEN.recorderLoad.args(slot)),
  recorderCountIn: (target, bars) => recAction(target, 'countIn', { bars }),
  recorderRead: (target, field) => sectionRead(target, 'Recorder', 'recorder', field),
});

const harmAction = (t, a, g) => sectionAction(t, 'Harmoniser', harmoniserScriptPatch, a, g);
const harmoniserApi = shownCalls({
  harmonyMode: (target, mode) => harmAction(target, 'mode', HAND_WRITTEN.harmonyMode.args(mode)),
  harmonyKey: (target, key) => harmAction(target, 'key', HAND_WRITTEN.harmonyKey.args(key)),
  harmonyScale: (target, scale) => harmAction(target, 'scale', { scale }),
  harmonySize: (target, size) => harmAction(target, 'size', { size }),
  harmonyShape: (target, shape) => harmAction(target, 'shape', HAND_WRITTEN.harmonyShape.args(shape)),
  harmonyVoicing: (target, voicing) => harmAction(target, 'voicing', HAND_WRITTEN.harmonyVoicing.args(voicing)),
  harmonyInversion: (target, inversion) => harmAction(target, 'inversion', { inversion }),
  harmonyOctave: (target, octave) => harmAction(target, 'octave', { octave }),
  harmonyOutOfKey: (target, mode) => harmAction(target, 'outOfKey', HAND_WRITTEN.harmonyOutOfKey.args(mode)),
  harmonyKeepPlayed: (target, keep) => harmAction(target, 'keepPlayed', keep === undefined ? {} : { keepPlayed: keep !== false }),
  harmonyChannel: (target, channel) => harmAction(target, 'channel', { channel }),
  harmonyVoiceLeading: (target, mode) => harmAction(target, 'voiceLeading', HAND_WRITTEN.harmonyVoiceLeading.args(mode)),
  harmonyStrum: (target, ms) => harmAction(target, 'strum', { ms }),
  harmonyDegree: (target, degree, chord) => harmAction(target, 'degree', HAND_WRITTEN.harmonyDegree.args(degree, chord)),
  harmonyRead: (target, field) => sectionRead(target, 'Harmoniser', 'harmony', field),
});

// --- The other twenty-three families (phase 7) -------------------------------
// Same shape as everything above — read the section, reduce, write back only what changed — but
// built in one loop from componentVerbs.js rather than typed out 182 times. `sectionAction` cannot
// be reused verbatim because these verbs take POSITIONAL arguments rather than a named action, so
// this is its sibling: identical error text, identical no-op reporting, one extra hop to the spec.
// @module ce.components

/**
 * Where a refused colour is in what a component verb writes, in the verbs' own terms: a list
 * position counted from 1, as every verb here counts them ("in pad 3, "), the property below it if
 * that is not the item's own colour, and nothing when the field written is the colour itself.
 */
function componentPlace(at, path) {
  if (at === path) return '';
  const below = at.slice(path.length + 1).split('.');
  if (!/^\d+$/.test(below[0])) return `at ${below.join('.')}, `;
  const item = path.slice(path.lastIndexOf('.') + 1).replace(/s$/, '');
  const rest = below.slice(1).join('.');
  return `in ${item} ${Number(below[0]) + 1}, ${rest && rest.toLowerCase() !== 'colour' ? `at ${rest}, ` : ''}`;
}

/**
 * Write the fields a component verb changes in its section, every one or none. `patch` maps each
 * field to its new value, a whole list for a verb that addresses one element of it.
 *
 * Every colour in it is read first, as set() reads one: a short form is written out ("red" is
 * stored as "#FF0000"), and one the panel cannot read refuses the call before any field is written,
 * in set()'s sentence with the verb's own name first. Which fields are colours comes from the
 * section templates (colourFieldAt), not from the verb, so a verb added later that reaches a colour
 * field is read the same way. Every verb built from componentVerbs.js writes through here.
 *
 * Returns whether it wrote; false is the verb's answer for a refusal, as for any other.
 */
function writeComponentFields(verb, path, patch) {
  const control = findControlByName(path);
  const call = `${memberPath(verb.id)}("${path}")`;
  // A colour refused in a verb the script called is said as the verb's other refusals are, the call
  // as written and then why: it named the call as set()'s line does, `ce.components.drumpads.
  // colour("Kit"): in pad 2, …`, the one refusal of a component verb in another form.
  const asked = componentCall && componentCall.verb === verb ? componentCall : null;
  const say = asked ? (place, why, advice) => `${verb.family} ${path}: ${verb.v}(${asked.shown}) — refused, nothing changed. `
    + `${place ? place.charAt(0).toUpperCase() + place.slice(1) : ''}${why}.${advice ? ` ${advice}` : ''}` : null;
  const written = [];
  let refused = false;
  for (const [field, value] of Object.entries(patch)) {
    const at = `${verb.section}.${field}`;
    const colours = colourWrites(call, 'nothing was set', control, at, value, componentPlace, say);
    if (colours) written.push([field, colours.value]);
    else refused = true;
  }
  if (refused) return false;
  for (const [field, value] of written) setValue(`${path}.${verb.section}.${field}`, value);
  return true;
}

/** The LCD's text and clear, and read's "text": addressed by position, on a layout (lcdPositions.js). */
const isLcdText = (verb) => verb.family === 'lcd' && verb.k === 'line';

/**
 * A display's section with the layout it is showing, as the preview hands it to the renderer
 * (`__page.activeLayoutId`), so text(), clear() and read() with no layout act on the layout on
 * screen. The preview decides it (stores/displayLayouts.js); with none, the display rests on its
 * default and lcdPositions.js finds that itself.
 */
function withLayoutShowing(path, section) {
  const id = layoutShowing(findControlByName(path)?._children?.Core?.id);
  return id ? { ...section, __page: { activeLayoutId: id } } : section;
}

const componentClampWarned = new Set();   // the verbs that have said a number was past their range; resetScriptState clears it
// The verb a script called and its arguments as shown, while it runs, for writeComponentFields to
// say a refused colour in the verb's own form. Set by componentVerbApi, below.
let componentCall = null;
function componentVerbAction(verb, target, args) {
  const path = String(target ?? '');
  const stored = getValue(`${path}.${verb.section}`);
  if (!stored || typeof stored !== 'object') {
    addScriptTrace('error', '', `${verb.family}: ${wrongTargetMessage(path, verb.section, verb.label)}`);
    return false;
  }
  const cfg = isLcdText(verb) ? withLayoutShowing(path, stored) : stored;
  const shown = args.map((x) => JSON.stringify(x) ?? 'nil').join(', ');
  if (verb.seek) return componentSeekAction(verb, path, cfg, args, shown);
  // zoneSource (and pixel.source) is given a control's name and stores its id, as the picker does
  // (lcdPositions.js). A zone that is not there is said by the reducer's own refusal, below.
  let given = args;
  if (verb.k === ELEM_KIND && verb.link) {
    const selfId = findControlByName(path)?._children?.Core?.id;
    const { id, refusal } = lcdZoneSourceFor(activePanel()?.controls ?? [], args[1], selfId, verb.list === 'zones' ? 'zone' : 'element');
    if (refusal && elementSites(cfg, args[0], verb.list).length) {
      addScriptTrace('error', '', `${verb.family} ${path}: ${verb.v}(${shown}) — refused, nothing changed. ${refusal}`);
      return false;
    }
    given = [args[0], id ?? undefined];
  }
  const patch = componentScriptPatch(verb, cfg, given);
  // followPanelKey(t, true) takes the panel's key and scale at once, in the same write, as the
  // inspector's toggle does (stores/panelKeyActions.setFollowsPanelKey): it set the flag alone, and
  // the control kept its own key until the panel's next change. Again when already following, so a
  // key() written on a follower since is brought back into line.
  if (verb.f === 'followPanelKey' && ('followPanelKey' in patch ? patch.followPanelKey === true : cfg.followPanelKey === true)) {
    Object.assign(patch, panelKeyCatchUp(path, verb.section, cfg));
  }
  const keys = Object.keys(patch);
  // A number past the verb's range is used as the nearest end, and said once per verb.
  const clamped = componentClampWarning(verb, path, args, cfg);
  if (clamped && !componentClampWarned.has(verb.id)) {
    componentClampWarned.add(verb.id);
    addScriptTrace('warn', '', `${clamped} This is said only the first time.`);
  }
  if (keys.length === 0) {
    // An empty patch is two different things here, and this reducer DOES compare against the
    // current value — so ask the spec whether the request was one the component could have
    // honoured at all. "Already that way" is a success; an unknown enum or an index past the end
    // of the list is not, and used to be indistinguishable from both success and silence.
    if (componentRequestLegal(verb, cfg, given)) {
      addScriptTrace('log', '', `${verb.family} ${path}: ${verb.v}(${shown}) — already that way`);
      lcdLineSaid(verb, path, cfg, args, shown);
      return true;
    }
    // Said with why (componentVerbs.componentRefusalLine): the index that addresses nothing and
    // the ones there are, or the value that is not one, which the Values tab's rows say too.
    addScriptTrace('error', '', componentRefusalLine(verb, path, args, cfg));
    return false;
  }
  if (!writeComponentFields(verb, path, patch)) return false;
  addScriptTrace('log', '', `${verb.family} ${path}: ${verb.v} → ${keys.join(', ')}`);
  lcdLineSaid(verb, path, cfg, args, shown);
  return true;
}

/**
 * phase(t, x) on a component that runs in the preview: a seek, not a write (stores/componentPhases.js).
 * The value is read as the verb reads it (range, the nearest end, refusals) against no stored value,
 * so seeking to the number already stored still seeks.
 */
function componentSeekAction(verb, path, cfg, args, shown) {
  const patch = componentScriptPatch(verb, { ...cfg, [verb.f]: null }, args);
  if (!(verb.f in patch)) {
    addScriptTrace('error', '', componentRefusalLine(verb, path, args, cfg));
    return false;
  }
  const clamped = componentClampWarning(verb, path, args, cfg);
  if (clamped && !componentClampWarned.has(verb.id)) {
    componentClampWarned.add(verb.id);
    addScriptTrace('warn', '', `${clamped} This is said only the first time.`);
  }
  if (verb.seek.clock && cfg[verb.seek.clock] === true) {
    addScriptTrace('warn', '', `${verb.family} ${path}: ${verb.v}(${shown}) — synced to the Transport, whose position decides; nothing changed.`);
    return true;
  }
  seekPhase(findControlByName(path)?._children?.Core?.id, patch[verb.f]);
  addScriptTrace('log', '', `${verb.family} ${path}: ${verb.v} → ${patch[verb.f]}`);
  return true;
}

/** The key and scale a control that follows the panel's key should have, where they differ from its own. */
function panelKeyCatchUp(path, section, cfg) {
  const control = findControlByName(path);
  if (!control) return {};
  const following = { ...control, _children: { ...control._children, [section]: { ...cfg, followPanelKey: true } } };
  const context = contextForControl(activePanel(), following);
  if (!context?.following) return {};
  const out = {};
  if (Number(cfg.key) !== context.root) out.key = context.root;
  if (String(cfg.scale) !== context.scale) out.scale = context.scale;
  return out;
}

// A line the LCD cannot show all of (cut at its width, a character it has no shape for, a display
// showing its layouts instead) is said once per line and reason (lcdLines.js).
const lcdLineWarned = new Set();   // resetScriptState clears it
function lcdLineSaid(verb, path, display, args, shown) {
  if (verb.family !== 'lcd' || verb.v !== 'text') return;
  // The row as written, which from a column on is more than the text given.
  const { line } = lcdWriteAt(display, args[0], args[1]);
  if (line === undefined) return;
  for (const { reason, message } of lcdLineWords(display, `lcd ${path}: text(${shown})`, line)) {
    const key = `${path}\u0000${JSON.stringify(args[0])}\u0000${reason}`;
    if (lcdLineWarned.has(key)) continue;
    lcdLineWarned.add(key);
    addScriptTrace('warn', '', `${message} This is said only the first time.`);
  }
}


/* --------------------------------------------------------- reading a component (design doc §44)
 *
 * Every one of the 229 component members was a WRITE. A script could set the arpeggiator's pattern
 * and could not ask what it was — so "next pattern", "if it is synced then…", and reading back a
 * generated sequence were all impossible, and a shadow copy in `state` desyncs the moment somebody
 * touches the control.
 *
 * ce.core.get() technically reached these — get("MyArp.Arp.syncToTransport") works — but it needs
 * the section name and the INTERNAL field name, which is exactly the vocabulary the verbs exist to
 * hide, and it hands back raw 0-based arrays against verbs that are 1-based. So the read is by verb
 * name, in the verbs' own units, and 1-based throughout.
 */

/** verb name -> spec, per family. Built once from the same list the writers come from. */
const COMPONENT_VERB_BY_NAME = COMPONENT_VERBS.reduce((acc, verb) => {
  (acc[verb.family] ??= {})[verb.v] = verb;
  return acc;
}, {});

/** The kinds `read` answers with one value rather than a list. */
const SCALAR_KINDS = ['num', 'int', 'bool', 'str', 'enum'];

/** The section config for a component verb's target, or nothing (having said why). */
function componentConfig(verb, path, forWhat) {
  const cfg = getValue(`${path}.${verb.section}`);
  if (!cfg || typeof cfg !== 'object') {
    addScriptTrace('error', '', `${verb.family}.${forWhat}: ${wrongTargetMessage(path, verb.section, verb.label)}`);
    return null;
  }
  return cfg;
}

/**
 * The list an indexed verb addresses, in document order.
 *
 * A verb declaring `count` addresses a SPARSE list — the Drum Pads' per-pad overrides are as long
 * as the grid says and stored only where something was overridden — so it is reported at the length
 * the component means, not the length the array happens to have. Otherwise size() would answer 0
 * for a sixteen-pad grid and fill() would refuse every value it was given.
 */
function componentList(cfg, verb) {
  const stored = Array.isArray(cfg[verb.f]) ? cfg[verb.f] : null;
  if (!verb.count) return stored;
  const want = itemListLength(verb, cfg);
  const list = stored ?? [];
  if (list.length === want) return list;
  return list.length > want
    ? list.slice(0, want)
    : [...list, ...Array.from({ length: want - list.length }, () => ({}))];
}

/** One scalar verb's current value, in the verb's own units. */
function componentScalarValue(cfg, verb) {
  if (verb.k === 'xy') {
    // The two axes as a table under the names the verb takes them by, so `move` reads back the way
    // it is written rather than as the model's field names.
    const [nameX, nameY] = verb.args ?? ['x', 'y'];
    const base = verb.flat ? cfg : (cfg[verb.f] && typeof cfg[verb.f] === 'object' ? cfg[verb.f] : {});
    const un = (n) => (verb.oneBased && Number.isFinite(Number(n)) ? Number(n) + 1 : n);
    return { [nameX]: un(base[verb.fx]), [nameY]: un(base[verb.fy]) };
  }
  const raw = cfg[verb.f];
  // oneBased verbs are stored one lower than they are written, so they read back one higher.
  if (verb.oneBased && Number.isFinite(Number(raw))) return Number(raw) + 1;
  return raw;
}

/** The whole list an indexed verb addresses, in verb vocabulary. */
function componentListValue(cfg, verb) {
  const list = componentList(cfg, verb);
  if (!list) return null;
  if (verb.k === 'item') {
    // A verb with a resolver reads back what the component ANSWERS rather than what is stored. For
    // the Drum Pads that is the difference between the sixteen notes the grid plays and sixteen
    // holes, which is the difference between an answer and a technically-correct nothing.
    const rows = verb.resolve ? verb.resolve(cfg) : list;
    return (Array.isArray(rows) ? rows : []).map((row) => (row && typeof row === 'object' ? row[verb.item] : undefined));
  }
  if (verb.k === 'cell' && verb.grid) {
    // A grid reads back as rows of columns, matching how `cell(target, row, col, amount)` addresses
    // it. A flat list of sixty-four numbers would be technically the same data and unusable.
    const cols = Array.isArray(cfg.cols) ? cfg.cols.length : 0;
    const rows = Array.isArray(cfg.rows) ? cfg.rows.length : 0;
    if (!cols || !rows) return [];
    return Array.from({ length: rows }, (_, r) => list.slice(r * cols, r * cols + cols));
  }
  return [...list];
}

/** A seek verb's read: where the component is now (stores/componentPhases.js), else the stored value. */
function componentPhaseNow(path, cfg, spec) {
  const now = phaseNow(findControlByName(path)?._children?.Core?.id);
  return now ?? componentScalarValue(cfg, spec);
}

function componentReadAction(verb, path, args) {
  const cfg = componentConfig(verb, path, 'read');
  if (!cfg) return undefined;
  const [name, index, index2] = args;
  const specs = COMPONENT_VERB_BY_NAME[verb.family] ?? {};

  // read(target) — every scalar verb of this component, keyed by the name it is written by.
  if (name === undefined || name === null || name === '') {
    const out = {};
    for (const [verbName, spec] of Object.entries(specs)) {
      // A link reads back as the NAME it was written by — '' when it points at nothing, which is
      // the truthful answer for both "unlinked" and "linked to a control that has been deleted".
      if (spec.k === LINK_KIND) out[verbName] = sourceName(activePanel()?.controls ?? [], cfg[spec.f]);
      else if (spec.k === LAYOUT_KIND) out[verbName] = lcdShownLayout(withLayoutShowing(path, cfg)) + 1;
      else if (spec.seek) out[verbName] = componentPhaseNow(path, cfg, spec);
      else if (SCALAR_KINDS.includes(spec.k) || spec.k === 'xy') out[verbName] = componentScalarValue(cfg, spec);
    }
    return out;
  }

  const spec = familyVerbNamed(verb.family, name);
  const refusedName = familyVerbRefusal(verb.family, 'read', name);
  if (refusedName) {
    addScriptTrace('error', '', refusedName);
    return undefined;
  }
  if (spec.k === LINK_KIND) return sourceName(activePanel()?.controls ?? [], cfg[spec.f]);
  // The layout showing, counted from 1 as layout() takes it: 1 on a display without layouts.
  if (spec.k === LAYOUT_KIND) return lcdShownLayout(withLayoutShowing(path, cfg)) + 1;
  // Where it is now, as the preview runs it; the stored phase, where it starts, when nothing runs it.
  if (spec.seek) return componentPhaseNow(path, cfg, spec);
  if (SCALAR_KINDS.includes(spec.k) || spec.k === 'xy') return componentScalarValue(cfg, spec);

  // A name-addressed scene reads back BY NAME, in both shapes: the whole table, which is also how a
  // script discovers what the display has, or one element's value. A positional index would be the
  // wrong question — see LIST_KINDS in componentVerbs.js — so it is refused rather than guessed at.
  // An LCD's zones read the same way, a zone's place as zoneAt takes it and its source by name.
  if (spec.k === ELEM_KIND) {
    const list = spec.list ?? 'elements';
    const readAs = spec.place ? (zone) => lcdZonePlaceOf(cfg, zone)
      : spec.link ? (zone) => lcdZoneSourceName(activePanel()?.controls ?? [], zone?.[spec.item])
        : (el) => el?.[spec.item] ?? spec.absent;
    const table = elementPropTable(cfg, spec.item, list, readAs);
    if (index === undefined || index === null || index === '') return table;
    const sites = elementSites(cfg, index, list);
    if (!sites.length) {
      addScriptTrace('error', '',
        `${verb.family}.read("${name}", "${index}"): this display has no ${list === 'zones' ? 'zone' : 'element'} called `
        + `"${index}". One of: ${Object.keys(table).join(', ') || '(none)'}.`);
      return undefined;
    }
    return readAs(elementAt(cfg, sites[0], list));
  }

  // The LCD's text is read by position (lcdPositions.js): every row of the layout showing, one row,
  // the columns of one, or another layout's.
  if (isLcdText(spec)) {
    const { value, refusal } = lcdReadAt(withLayoutShowing(path, cfg), index);
    if (refusal) addScriptTrace('error', '', `${verb.family}.read("${spec.v}", ${JSON.stringify(index)}): ${refusal}`);
    return refusal ? undefined : value;
  }

  const list = componentListValue(cfg, spec);
  if (!list) return undefined;
  // A set of steps (the Arpeggiator's mutes) reads as the steps counted from 1, as mute() takes them,
  // and one step as whether it is in the set. It read as the stored list, counted from 0, and one
  // entry of it by position (item 7 of the owner's review of the arp).
  if (spec.k === 'indexset') {
    const steps = [...new Set(list.map((n) => Math.round(Number(n))).filter(Number.isFinite))]
      .sort((a, b) => a - b).map((n) => n + 1);
    if (index === undefined || index === null) return steps;
    const refused = componentRefusalReason(spec, cfg, [index]);
    if (refused) {
      addScriptTrace('error', '', `${verb.family}.read("${spec.v}", ${JSON.stringify(index)}): ${refused}`);
      return undefined;
    }
    return steps.includes(Math.round(Number(index)));
  }
  if (index === undefined || index === null) return list;

  // 1-based, as everywhere else in this module — and for a grid the second index is the column.
  const refusedIndex = readIndexRefusal(spec, cfg, index, index2);
  if (refusedIndex) {
    addScriptTrace('error', '', refusedIndex);
    return undefined;
  }
  const at = Math.round(Number(index)) - 1;
  if (!Number.isFinite(at) || at < 0 || at >= list.length) return undefined;
  const row = list[at];
  if (spec.k === 'cell' && spec.grid && index2 !== undefined && index2 !== null) {
    const col = Math.round(Number(index2)) - 1;
    return Array.isArray(row) && col >= 0 && col < row.length ? row[col] : undefined;
  }
  return row;
}

/** Which indexed verbs a family has, and how long each one's list is. */
function componentSizeAction(verb, path, args) {
  const cfg = componentConfig(verb, path, 'size');
  if (!cfg) return undefined;
  const specs = COMPONENT_VERB_BY_NAME[verb.family] ?? {};
  const lists = Object.entries(specs).filter(([, s]) => LIST_KINDS.includes(s.k) && !s.clear);

  const sizeOf = (spec) => {
    if (isLcdText(spec)) return lcdRows(cfg);
    const list = componentList(cfg, spec);
    if (!list) return undefined;
    if (spec.k === 'cell' && spec.grid) {
      // A crosspoint is addressed by two indices, so one number would not be an answer.
      return { rows: Array.isArray(cfg.rows) ? cfg.rows.length : 0,
               cols: Array.isArray(cfg.cols) ? cfg.cols.length : 0 };
    }
    return list.length;
  };

  const [name] = args;
  if (name === undefined || name === null || name === '') {
    return Object.fromEntries(lists.map(([verbName, spec]) => [verbName, sizeOf(spec)]));
  }
  const spec = familyVerbNamed(verb.family, name);
  if (!spec || !LIST_KINDS.includes(spec.k)) {
    addScriptTrace('error', '', familyVerbRefusal(verb.family, 'size', name));
    return undefined;
  }
  return sizeOf(spec);
}

/** Write a whole list in one call — one document change instead of one per element. */
function componentFillAction(verb, path, args) {
  const cfg = componentConfig(verb, path, 'fill');
  if (!cfg) return false;
  const [name, values] = args;
  const spec = familyVerbNamed(verb.family, name);
  if (!spec || !LIST_KINDS.includes(spec.k) || spec.clear) {
    addScriptTrace('error', '', familyVerbRefusal(verb.family, 'fill', name));
    return false;
  }
  if (!Array.isArray(values)) {
    addScriptTrace('error', '', `${verb.family}.fill("${name}"): needs a list of values.`);
    return false;
  }
  if (isLcdText(spec)) return lcdFill(verb, path, cfg, name, values);
  const list = componentList(cfg, spec);
  if (!list) return false;

  // A grid takes ROWS of columns — the shape read() gives back — and each row is placed at its own
  // row index. Flattening first would put a short second row inside the first one, which is how a
  // 2x2 fill silently landed as four cells along the top.
  const grid = spec.k === 'cell' && spec.grid;
  const calls = [];
  if (grid) {
    const cols = Array.isArray(cfg.cols) ? cfg.cols.length : 0;
    const rows = Array.isArray(cfg.rows) ? cfg.rows.length : 0;
    if (values.length > rows || values.some((row) => Array.isArray(row) && row.length > cols)) {
      addScriptTrace('error', '',
        `${verb.family}.fill("${name}"): does not fit a ${rows}x${cols} grid — refused. `
        + `${verb.family}.size("${name}") gives its shape.`);
      return false;
    }
    values.forEach((row, r) => {
      (Array.isArray(row) ? row : [row]).forEach((value, c) => calls.push([r + 1, c + 1, value]));
    });
  } else {
    if (values.length > list.length) {
      // Refused rather than truncated: silently dropping half a pattern is worse than not writing
      // it, and the caller can ask size() first.
      addScriptTrace('error', '',
        `${verb.family}.fill("${name}"): ${values.length} values for a list of ${list.length} — `
        + `refused. ${verb.family}.size("${name}") says how many there are.`);
      return false;
    }
    values.forEach((value, i) => calls.push([i + 1, value]));
  }

  // Each element goes through the SAME reducer one call would use, so a value written in bulk is
  // clamped, coerced and refused exactly as a value written singly. Then ONE write at the end,
  // which is the whole point: sixteen steps used to be sixteen document changes.
  let next = list;
  let wrote = false;
  for (const args of calls) {
    const patch = componentScriptPatch(spec, { ...cfg, [spec.f]: next }, args);
    if (patch[spec.f]) { next = patch[spec.f]; wrote = true; }
  }
  if (!wrote) {
    addScriptTrace('log', '', `${verb.family} ${path}: fill("${name}") — already that way`);
    return true;
  }
  if (!writeComponentFields(verb, path, { [spec.f]: next })) return false;
  addScriptTrace('log', '', `${verb.family} ${path}: fill("${name}") → ${calls.length} value(s)`);
  return true;
}

/** fill(t, "text", rows): the rows of the layout showing from the first, as text() writes each. */
function lcdFill(verb, path, cfg, name, values) {
  const rows = lcdRows(cfg);
  if (values.length > rows) {
    addScriptTrace('error', '',
      `${verb.family}.fill("${name}"): ${values.length} values for ${rows} rows — refused. `
      + `${verb.family}.size("${name}") says how many there are.`);
    return false;
  }
  let work = withLayoutShowing(path, cfg);
  let patch = {};
  for (const [i, value] of values.entries()) {
    const done = lcdWriteAt(work, i + 1, value);
    if (done.refusal) {
      addScriptTrace('error', '', `${verb.family}.fill("${name}"): row ${i + 1}: ${done.refusal} Nothing was written.`);
      return false;
    }
    patch = { ...patch, ...done.patch };
    work = { ...work, ...done.patch };
  }
  if (!Object.keys(patch).length) {
    addScriptTrace('log', '', `${verb.family} ${path}: fill("${name}") — already that way`);
    return true;
  }
  if (!writeComponentFields(verb, path, patch)) return false;
  addScriptTrace('log', '', `${verb.family} ${path}: fill("${name}") → ${values.length} value(s)`);
  return true;
}

/** Add one element to a component's list, using the template the canvas uses. */
function componentInsertAction(verb, path, args) {
  const cfg = componentConfig(verb, path, 'insert');
  if (!cfg) return false;
  const spec = componentListSpec(verb, 'insert', args[0]);
  if (!spec) return false;
  const list = componentList(cfg, spec) ?? [];
  const at = args[1] === undefined || args[1] === null ? null : Math.round(Number(args[1])) - 1;
  const next = componentListWithElement(verb.section, spec.f, list, cfg, at);
  if (!next) {
    addScriptTrace('error', '',
      `${verb.family}.insert("${spec.v}"): this component's ${spec.f} cannot be grown from a script.`);
    return false;
  }
  if (!writeComponentFields(verb, path, { [spec.f]: next })) return false;
  addScriptTrace('log', '', `${verb.family} ${path}: insert("${spec.v}") → ${next.length}`);
  return true;
}

/** …and take one away, when the component does not need it. */
function componentRemoveAction(verb, path, args) {
  const cfg = componentConfig(verb, path, 'remove');
  if (!cfg) return false;
  const spec = componentListSpec(verb, 'remove', args[0]);
  if (!spec) return false;
  const list = componentList(cfg, spec) ?? [];
  // No index removes the last, which is what "one fewer" means without saying which.
  const at = args[1] === undefined || args[1] === null
    ? list.length - 1
    : Math.round(Number(args[1])) - 1;
  const next = componentListWithoutElement(verb.section, spec.f, list, at);
  if (!next) {
    addScriptTrace('error', '',
      `${verb.family}.remove("${spec.v}", ${args[1] ?? 'last'}): refused — either there is no such `
      + 'element, or this component needs it.');
    return false;
  }
  if (!writeComponentFields(verb, path, { [spec.f]: next })) return false;
  addScriptTrace('log', '', `${verb.family} ${path}: remove("${spec.v}") → ${next.length}`);
  return true;
}

/** The list-addressing verb a name refers to, having complained if it is not one. */
function componentListSpec(verb, forWhat, name) {
  const spec = familyVerbNamed(verb.family, name);
  if (spec && LIST_KINDS.includes(spec.k) && !spec.clear) return spec;
  addScriptTrace('error', '', familyVerbRefusal(verb.family, forWhat, name));
  return null;
}

/**
 * Point one component at another control, BY NAME.
 *
 * The field stores an id, and an id is not something a script could have got hold of — it addresses
 * controls by name everywhere else, so it does here too, and read() gives the name back.
 *
 * Three outcomes, and they are deliberately distinguishable, because "the meter is not moving" has
 * three very different causes and a silent one would leave all three looking alike:
 *
 *   no name        unlink. The component falls back to its static value, which is the editor's own
 *                  "— Static / bound level —" and a legitimate thing to ask for.
 *   unknown name   refused, and says the panel has no such control. A typo must not become a link
 *                  to nothing that looks exactly like a link to something.
 *   wrong kind     refused, and says WHAT would have been right — a Meter follows a knob, not a
 *                  label. The rule is the same one the inspector's picker filters by; it lives in
 *                  controlSources.js precisely so these two cannot disagree.
 */
function componentLinkAction(verb, path, args) {
  const cfg = componentConfig(verb, path, verb.v);
  if (!cfg) return false;
  const controls = activePanel()?.controls ?? [];
  const self = findControlByName(path);
  const selfId = String(self?._children?.Core?.id ?? '');
  const current = String(cfg[verb.f] ?? '');

  const wanted = args[0] === undefined || args[0] === null ? '' : String(args[0]).trim();
  if (!wanted) {
    if (!current) {
      addScriptTrace('log', '', `${verb.family} ${path}: ${verb.v}() — already unlinked`);
      return true;
    }
    if (!writeComponentFields(verb, path, { [verb.f]: '' })) return false;
    addScriptTrace('log', '', `${verb.family} ${path}: ${verb.v}() → unlinked`);
    return true;
  }

  // Refused in the words every other verb is (componentRefusalLine's), which these two lines were
  // not: "arp.link: no control named …" and "arp.link("Knob"): refused — it is not …" (item 10 of
  // the owner's review of the arp, for every family's link).
  const refuse = (why) => {
    const shown = args.map((x) => JSON.stringify(x) ?? 'nil').join(', ');
    addScriptTrace('error', '', `${verb.family} ${path}: ${verb.v}(${shown}) — refused, nothing changed. ${why}`);
    return false;
  };
  const found = sourceByName(controls, wanted);
  if (!found) return refuse(`There is no control called ${shownValue(wanted)} on this panel.`);
  if (!sourceAccepts(verb.sourceKind, found, selfId)) {
    return refuse(String(found._children?.Core?.id ?? '') === selfId
      ? 'A control cannot drive itself.'
      : `${shownValue(wanted)} is not ${SOURCE_KINDS[verb.sourceKind]?.label ?? 'a usable source'}.`);
  }

  const id = String(found._children.Core.id);
  if (id === current) {
    addScriptTrace('log', '', `${verb.family} ${path}: ${verb.v}("${wanted}") — already that way`);
    return true;
  }
  if (!writeComponentFields(verb, path, { [verb.f]: id })) return false;
  addScriptTrace('log', '', `${verb.family} ${path}: ${verb.v} → "${wanted}"`);
  return true;
}

/**
 * layout(t, which): show one of a display's layouts, as a soft key does (stores/displayLayouts.js).
 * Not a write to the panel: which layout shows is the preview's, and is not saved.
 */
function componentLayoutAction(verb, path, args) {
  const cfg = componentConfig(verb, path, 'layout');
  if (!cfg) return false;
  const shown = args.map((x) => JSON.stringify(x) ?? 'nil').join(', ');
  const named = lcdLayoutIndex(cfg, args[0], verb.flat);
  if (named.refusal) {
    addScriptTrace('error', '', `${verb.family} ${path}: layout(${shown}) — refused, nothing changed. ${named.refusal}`);
    return false;
  }
  const layouts = Array.isArray(cfg.layouts) ? cfg.layouts : [];
  const already = !layouts.length || lcdShownLayout(withLayoutShowing(path, cfg)) === named.index;
  // Shown again even when it is showing, as a second press of a soft key restarts its timeout.
  if (layouts.length) showLayout(findControlByName(path)?._children?.Core?.id, layouts[named.index]?.id);
  addScriptTrace('log', '', already
    ? `${verb.family} ${path}: layout(${shown}) — already that way`
    : `${verb.family} ${path}: layout → ${named.index + 1}`);
  return true;
}

/** The five kinds every family gets are not writes of a field, so they dispatch elsewhere. */
const COMPONENT_KIND_ACTION = {
  read: componentReadAction,
  size: componentSizeAction,
  fill: componentFillAction,
  insert: componentInsertAction,
  remove: componentRemoveAction,
  [LINK_KIND]: componentLinkAction,
  [LAYOUT_KIND]: componentLayoutAction,
};

const componentVerbApi = Object.fromEntries(COMPONENT_VERBS.map((verb) => [
  verb.id,
  // Rest args rather than a fixed arity: the verbs take one, two or three, and a wrapper that
  // named them would have to be generated per kind for no gain. `target` is always first.
  (target, ...rest) => {
    const special = COMPONENT_KIND_ACTION[verb.k];
    const outer = componentCall;
    componentCall = { verb, shown: rest.map((x) => JSON.stringify(x) ?? 'nil').join(', ') };
    try {
      return special
        ? special(verb, String(target ?? ''), rest)
        : componentVerbAction(verb, target, rest);
    } finally { componentCall = outer; }
  },
]));

/**
 * The read for the five hand-written families, by MODEL field name.
 *
 * The twenty-three spec-driven families read by verb name because their spec says which field each
 * verb writes. These five have no such map — they are five hand-written reducers that predate it —
 * so rather than hand-type a forty-seven entry verb→field table (the exact thing §44 spent its
 * first half deleting), they read by the field name their own summaries already use. `read(target)`
 * with no field is the whole section, which is the same answer the other twenty-three give.
 */
function sectionRead(path, section, label, field) {
  const target = String(path ?? '');
  const cfg = getValue(`${target}.${section}`);
  if (!cfg || typeof cfg !== 'object') {
    addScriptTrace('error', '', `${label}.read: ${wrongTargetMessage(target, section, label)}`);
    return undefined;
  }
  if (field === undefined || field === null || field === '') {
    // Without the private live-state keys the renderer parks here: `__phase` is where the preview
    // surface is in a sequence this frame, not something a script set or can set.
    return Object.fromEntries(Object.entries(cfg).filter(([k]) => !k.startsWith('_')));
  }
  const refused = sectionFieldRefusal(label, cfg, field);
  if (refused) {
    addScriptTrace('error', '', refused);
    return undefined;
  }
  return cfg[Object.keys(cfg).find((k) => k.toLowerCase() === String(field).toLowerCase())];
}

const setAction = (t, a, g) => sectionAction(t, 'Setlist', setlistScriptPatch, a, g);
const setlistApi = shownCalls({
  // These move the INDEX. The recall follows from the index changing, so a
  // scripted step and a footswitch step are the same event downstream.
  setlistNext: (target) => setAction(target, 'next', {}),
  setlistPrev: (target) => setAction(target, 'prev', {}),
  setlistGoto: (target, scene) => setAction(target, 'goto', HAND_WRITTEN.setlistGoto.args(scene)),
  setlistEnable: (target, scene, enabled) => setAction(target, 'enable', HAND_WRITTEN.setlistEnable.args(scene, enabled)),
  setlistWrap: (target, wrap) => setAction(target, 'wrap', wrap === undefined ? {} : { wrap: wrap !== false }),
  setlistCrossfade: (target, ms) => setAction(target, 'crossfade', { ms }),
  setlistRead: (target, field) => sectionRead(target, 'Setlist', 'setlist', field),
});

/* -------------------------------------------------------------- flow: on / emit / run */
// These three were `() => {}` until the API audit: a script could register a listener, announce an
// event, or call another script's action, and nothing happened — silently, and only in the
// WebView, so the same panel behaved differently with the window open and closed.
//
// `on` listeners belong to the script that registered them, so re-running a script (an edit in the
// designer, a source change) replaces its listeners instead of stacking a second copy.

// @module -
const listeners = [];   // { scriptId, target, event, fn }

function clearListeners(scriptId) {
  for (let i = listeners.length - 1; i >= 0; i--) if (listeners[i].scriptId === scriptId) listeners.splice(i, 1);
}

/** The name a listener is stored under: the HANDLER name, which is what every producer dispatches.
 *
 *  Both spellings are accepted. Every event in the contract has two — an id (`timer`, `step`) and a
 *  handler name (`onTimer`, `onStep`) — and `on()` only ever matched the second, because that is
 *  what dispatchEvents carries. So a script author reading the events list, seeing `step`, and
 *  writing on("*", "step", …) got a listener that could never fire, silently. The list is the
 *  vocabulary the API teaches; it should work. */
function listenerEventName(event) {
  const name = String(event ?? '');
  return EVENT_BY_ID[name]?.fn ?? name;
}

/** Why on(), watch(), compute(), intercept() or defineAction() sets nothing up, or '' when it does:
 *  the event, path or name left out, or a function that is not one. Each set nothing up without a
 *  word. The preludes say the same (__hookRefusal). */
function hookRefusal(verb, what, name, fn) {
  if (name === undefined || name === null || (typeof name === 'string' && !name.trim())) {
    return `${verb}: no ${what} was given, so nothing was set up.`;
  }
  if (typeof fn === 'function') return '';
  return fn === undefined || fn === null
    ? `${verb}: no function was given, so nothing was set up.`
    : `${verb}: ${shownValue(fn)} is not a function, so nothing was set up.`;
}
function hookRefused(scriptId, verb, what, name, fn) {
  const why = hookRefusal(verb, what, name, fn);
  if (why) addScriptTrace('error', scriptId, why);
  return Boolean(why);
}

function addListener(scriptId, target, event, fn) {
  if (hookRefused(scriptId, 'ce.core.on', 'event', event, fn)) return;
  listeners.push({ scriptId, target: String(target ?? '*'), event: listenerEventName(event), fn });
}

/** off(target, event) — drop THIS script's listeners for that pair. Scoped to the caller so one
    script cannot silently unsubscribe another's handlers. An unknown pair is a no-op. */
function removeListener(scriptId, target, event) {
  const t = String(target ?? '*');
  const e = listenerEventName(event);   // either spelling, matching what on() stored
  for (let i = listeners.length - 1; i >= 0; i--) {
    const l = listeners[i];
    if (l.scriptId === scriptId && l.target === t && l.event === e) listeners.splice(i, 1);
  }
}

/* --------------------------------------------------------------- the reactive core
 * watch / compute / intercept / defineAction — the four verbs that do what setting a property
 * cannot. A properties panel stores a CONSTANT decided at design time; each of these stores a RULE
 * the runtime keeps applying.
 *
 * They belong to the script that registered them, exactly as `on` listeners do, so re-running a
 * script replaces its rules instead of stacking a second copy.
 */

const watchers = [];        // { scriptId, key, path, fn, last }   — observe any model path
const computeds = [];       // { scriptId, key, path, fn, failed } — a property that is a formula
const filters = [];         // { scriptId, key, path, fn }         — middleware in front of a write
const actions = new Map();  // name(lower) -> { scriptId, name, fn }

/** The one spelling every rule is keyed by.
 *  `set("cutoff.value")` and `set("cutoff.Value.value")` address the same field, so an interceptor
 *  registered against either has to catch both — matching the text as typed would make the rule
 *  depend on which shorthand the OTHER script happened to use. */
function reactiveKey(path) {
  const { name, segs } = splitScriptPath(splitAccessor(String(path ?? ''), '').path);
  if (isPanelTarget(name)) return `panel.${segs.join('.')}`.toLowerCase();
  const control = findControlByName(name);
  if (!control) return String(path ?? '').toLowerCase();     // unresolvable: key on the raw text
  const core = control._children.Core;
  return `${String(core.name ?? core.id)}.${resolveModelPath(control, segs)}`.toLowerCase();
}

function clearReactive(scriptId) {
  for (const list of [watchers, computeds, filters]) {
    for (let i = list.length - 1; i >= 0; i--) if (list[i].scriptId === scriptId) list.splice(i, 1);
  }
  for (const [key, a] of [...actions]) if (a.scriptId === scriptId) actions.delete(key);
}

/** A rule replaces the same script's rule for the same path, rather than stacking beside it.
 *  Two interceptors on one path would make the result depend on registration order, which is the
 *  kind of thing that works until the script is reloaded in a different order. */
function putRule(list, rule) {
  const at = list.findIndex((r) => r.scriptId === rule.scriptId && r.key === rule.key);
  if (at >= 0) list[at] = rule; else list.push(rule);
}

function addWatch(scriptId, path, fn) {
  if (hookRefused(scriptId, 'ce.core.watch', 'path', path, fn)) return;
  // Seeded with the CURRENT value, not undefined: a watcher must not fire once on registration
  // just because it has never seen the value before. It reports changes, not existence.
  const value = readWatch(path);
  putRule(watchers, { scriptId, key: reactiveKey(path), path: String(path ?? ''), fn, last: signatureOf(value), lastValue: value });
}

function addCompute(scriptId, path, fn) {
  if (hookRefused(scriptId, 'ce.core.compute', 'path', path, fn)) return;
  putRule(computeds, { scriptId, key: reactiveKey(path), path: String(path ?? ''), fn, failed: false });
}

function addIntercept(scriptId, path, fn) {
  if (hookRefused(scriptId, 'ce.core.intercept', 'path', path, fn)) return;
  putRule(filters, { scriptId, key: reactiveKey(path), path: String(path ?? ''), fn });
}

function defineActionImpl(scriptId, name, fn) {
  if (hookRefused(scriptId, 'ce.core.action', 'name', name, fn)) return;
  const id = String(name).trim();
  const existing = actions.get(id.toLowerCase());
  if (existing && existing.scriptId !== scriptId) {
    // Reported, not silently overwritten: two scripts claiming one name is a real conflict, and
    // whichever loaded last winning by accident is the worst way to resolve it.
    addScriptTrace('error', scriptId,
      `defineAction("${id}") — already defined by another script. The later definition is ignored.`);
    return;
  }
  actions.set(id.toLowerCase(), { scriptId, name: id, fn });
}

/** A stable comparison signature — objects and arrays compare by content, not identity. */
function signatureOf(value) {
  if (value === undefined) return '\u0000undefined';
  try { return JSON.stringify(value) ?? String(value); } catch { return String(value); }
}

/** Sentinel: an interceptor said no. Distinct from `undefined`, which means "accept unchanged". */
const REJECTED = Symbol('rejected');

// >0 while a filter is running. An interceptor that writes to the path it guards (a snap-to-grid
// rule calling set() itself) would otherwise re-enter its own filter without end.
let interceptDepth = 0;

/**
 * Run every interceptor registered for this path. Returns the value to write, or REJECTED.
 * Called from setValue, so it covers script writes; the settle pass below catches changes that
 * arrive from anywhere else (the user dragging a control, inbound MIDI) by correcting them after
 * the fact — a snap rather than a veto, which is the best a diff-based observer can do honestly.
 */
function applyIntercepts(key, value, previous) {
  let next = value;
  for (const f of filters) {
    if (f.key !== key) continue;
    let out;
    try { out = f.fn(next, previous); } catch (e) { reportScriptError(f.scriptId, e); continue; }
    if (out === false) return REJECTED;
    if (out === undefined || out === null) continue;     // no opinion — accept what we had
    next = out;
  }
  return next;
}

// A compute that writes a value which makes another compute write again can ping-pong. The loop is
// contained INSIDE one settle pass and cut off here rather than being allowed to bounce through the
// store subscription, where it would look like the editor had hung.
const MAX_SETTLE_PASSES = 8;

/**
 * Re-evaluate the formulas, then report the changes. Called after every source of value change.
 *
 * Computes run to a fixpoint first so watchers see a settled model: a watcher that fired on the
 * intermediate state would report a value the user never actually had.
 */
function runReactive() {
  if (!computeds.length && !watchers.length && !filters.length) return;
  if (live.dispatching) return;
  live.dispatching = true;
  try {
    for (let pass = 0; pass < MAX_SETTLE_PASSES; pass++) {
      let wrote = false;
      for (const c of computeds) {
        if (c.failed) continue;
        let next;
        try { next = c.fn(); } catch (e) { reportScriptError(c.scriptId, e); c.failed = true; continue; }
        if (next === undefined) continue;
        if (signatureOf(next) === signatureOf(readWatch(c.path))) continue;
        setValue(c.path, next);
        wrote = true;
      }
      if (!wrote) break;
      if (pass === MAX_SETTLE_PASSES - 1) {
        addScriptTrace('error', '',
          `compute(): still changing after ${MAX_SETTLE_PASSES} passes — two formulas are feeding each other. `
          + 'They are left at the last value rather than looped on.');
      }
    }

    // Interceptors, for changes that did NOT come through set(): the user dragging the control,
    // inbound MIDI, a dump landing. Those never touch our write path, so the filter is applied
    // after the fact and the value is corrected — the knob snaps rather than refusing to move.
    // A filter has to be idempotent for this to settle (f(f(x)) == f(x)), which snapping, clamping
    // and quantising all are; one that is not simply keeps correcting and is cut off with the
    // computes below.
    for (const f of filters) {
      const current = readWatch(f.path);
      if (current === undefined) continue;
      const decided = applyIntercepts(f.key, current, current);
      if (decided === REJECTED) continue;      // nothing to revert to — a veto needs a write to stop
      if (signatureOf(decided) !== signatureOf(current)) setValue(f.path, decided);
    }

    for (const w of watchers) {
      const value = readWatch(w.path);
      const sig = signatureOf(value);
      if (sig === w.last) continue;
      const previous = w.lastValue;
      w.last = sig;
      w.lastValue = value;
      try { w.fn(value, previous); } catch (e) { reportScriptError(w.scriptId, e); }
    }
  } finally {
    live.dispatching = false;
  }
}

// Same backstop as ScriptRuntime::dispatchEvent: emit → handler → emit → … is cut off at a fixed
// depth and reported, rather than recursing until the tab dies.
const MAX_EMIT_DEPTH = 16;
let emitDepth = 0;

function listenerMatches(l, target) {
  return l.target === '*' || l.target === 'self' || target == null
    || l.target.toLowerCase() === String(target).toLowerCase();
}

/** Deliver `event` to on(…) listeners and to any already-loaded handler named for it. Synchronous,
    matching the C++ side — everything it calls has been loaded and cached by dispatchEvents. */
function deliverEmit(name, target, data) {
  const epoch = executionEpoch;
  if (emitDepth >= MAX_EMIT_DEPTH) {
    addScriptTrace('error', '', `emit("${name}") dropped: nesting exceeded ${MAX_EMIT_DEPTH} (emit/dispatch feedback loop?)`);
    return;
  }
  emitDepth += 1;
  try {
    for (const l of [...listeners]) {
      if (l.event !== name || !listenerMatches(l, target)) continue;
      try { withDocumentWriteBatch(() => l.fn(data)); } catch (e) { reportScriptError(l.scriptId, e); }
    }
    for (const s of activeScripts()) {
      if (epoch !== executionEpoch) return;
      if (s.enabled === false || s.event !== name) continue;
      const fn = handlerCache.get(s.id)?.handlers?.[name];
      if (typeof fn !== 'function') continue;
      try { withDocumentWriteBatch(() => fn(data)); } catch (e) { reportScriptError(s.id, e); }
    }
  } finally {
    emitDepth -= 1;
  }
}

/** run("owner.action" [, args]) — call a function defined by another script, in any language.
    Resolved against the loaded handler cache, so it is synchronous and can return a value. */
function runAction(ref, args) {
  const text = String(ref ?? '');
  const dot = text.lastIndexOf('.');
  const owner = dot > 0 ? text.slice(0, dot) : '';
  const action = dot > 0 ? text.slice(dot + 1) : text;
  if (!action) return undefined;

  // A registered action wins over a same-named handler. defineAction() is an explicit declaration
  // of intent; a function that happens to share the name is a coincidence, and the deliberate one
  // should not lose to it. An owner-qualified ref still goes to the script scan, because that
  // spelling is asking for a particular script's function by name.
  if (!owner) {
    const registered = actions.get(action.toLowerCase());
    if (registered) {
      try { return withDocumentWriteBatch(() => registered.fn(args)); }
      catch (e) { reportScriptError(registered.scriptId, e); return undefined; }
    }
  }

  for (const s of activeScripts()) {
    if (s.enabled === false) continue;
    if (owner && String(s.target ?? '').toLowerCase() !== owner.toLowerCase()) continue;
    const fn = handlerCache.get(s.id)?.handlers?.[action];
    if (typeof fn !== 'function') continue;
    try { return withDocumentWriteBatch(() => fn(args)); } catch (e) { reportScriptError(s.id, e); return undefined; }
  }
  const defined = [...actions.values()].map((a) => a.name);
  addScriptTrace('error', '', `run("${text}") found no loaded script defining ${action}()`
    + (defined.length ? `. Registered actions: ${defined.join(', ')}` : ''));
  return undefined;
}

/** The actions scripts have registered, for the editor's binding UI. Names as declared. */
export function registeredActions() {
  return [...actions.values()].map((a) => a.name);
}

/** Drive one settle pass by hand. The live runtime does this off the store subscriptions; a test
    has no store, so it needs the same entry point rather than a reimplementation of it. */
export function runReactiveForTesting() { runReactive(); }

/** The same door for the preview-session diff — the source of every press, release, hover and
    repeat. Returns the dispatch, so a test can wait for the handlers rather than guess at ticks. */
export function runPreviewSessionsForTesting(sessions = null) {
  // initPanelRuntime normally sets these off the stores; a test that never started the runtime
  // would otherwise diff against no active panel, and every event would be addressed by raw id.
  live.activePanelId = get(scriptRuntimePanelId);
  live.enabledGlobal = true;
  return onPreviewSessionsChanged(sessions ?? get(panelPreviewSessions));
}

/** The same door for the panels-store diff — a value that moved in the document rather than in a
    preview session. The first call only takes the baseline, as initPanelRuntime's does. */
export function runPanelsChangedForTesting({ baseline = false } = {}) {
  live.activePanelId = get(scriptRuntimePanelId);
  live.enabledGlobal = true;
  if (baseline) { snapshotValues(); return null; }
  return onPanelsChanged();
}

/** Drop every loaded handler, listener, rule and timer — what a panel switch does. Exposed so a
    test can start clean: rules outlive a single `set`, which is the whole point of them, and two
    tests sharing this module would otherwise share each other's formulas and filters. */
export function resetScriptStateForTesting() { resetScriptState(); }

/* ------------------------------------------------------------------------- timers */
// A repeating timer owned by the runtime, not the language: Lua can't hold a coroutine open across
// handler calls and QuickJS has no setTimeout, so both need the host to keep time. Starting an id
// that is already running re-times it rather than stacking a second interval.

// @module ce.anim
/* --------------------------------------------------------------------------------- ce.anim */
// Values that move over time. CROSS-RUNTIME: a sweep triggered by a note has to work in a DAW with
// the panel shut, so the C++ ScriptRuntime carries the same engine — and the two must agree.
//
// They agree because the position is a PURE FUNCTION OF ELAPSED TIME, never an accumulated step.
// Two integrators ticking independently drift apart within a second; two evaluations of the same
// formula at the same elapsed time cannot. These two functions are the formula, and
// ScriptRuntime::animationEase / animationSpring are the identical C++ pair.

/**
 * A CSS cubic-bezier, evaluated numerically — P0 (0,0), P3 (1,1), the two control points given.
 *
 * This exists because the Properties panel's Animations section stores its easings as bezier
 * CONTROL POINTS (a CSS transition needs no evaluator) and ce.anim writes values rather than
 * stylesheets. Adopting the panel's names with lookalike formulas — 1-(1-t)² for outQuad, which is
 * NOT what cubic-bezier(0.25, 0.46, 0.45, 0.94) traces — would be a second curve wearing the same
 * name, and an author who set outCubic in the panel and wrote curve = "outCubic" beside it would
 * get two different motions with nothing to tell them apart.
 *
 * The solver lives in utils/easing.js, beside the table, and is re-exported here because this is
 * where ce.anim's tests and callers have always found it. There used to be a copy here as well;
 * the panel's value glide and ce.anim now evaluate a curve with one function, not two that agree.
 */
export { cubicBezierEase };

/**
 * Every curve ce.anim animates along.
 *
 * Two vocabularies, kept apart on purpose. `linear|exp|log|s` are ce.math.curve()'s, computed the
 * same way so knowing one is knowing both. The named beziers (inQuad, outCubic, outBack, …) are
 * the Properties panel's, evaluated as the control points the panel stores. They are close
 * relatives — exp is t², inQuad is a bezier that LOOKS like t² — and deliberately not merged,
 * because calling them the same thing would be a claim about the numbers that is not true.
 *
 * An unknown name returns undefined rather than silently going linear. Before this, curve =
 * "outCubic" — a name the Properties panel offers three feet away — was linear in every runtime and
 * said nothing. startAnimationImpl reports it, the way ce.math.curve() has since §30.
 */
export function animationEase(progress, curve) {
  const v = Math.min(1, Math.max(0, Number(progress) || 0));
  if (curve === undefined || curve === null || curve === 'linear') return v;
  if (curve === 'exp') return v * v;
  if (curve === 'log') return Math.sqrt(v);
  if (curve === 's') return v * v * (3 - 2 * v);
  const b = EASING_BEZIERS[String(curve)];
  if (b) return cubicBezierEase(v, b[0], b[1], b[2], b[3]);
  // The Animation tab's spring, at its default feel: the same formula ce.anim.spring uses, so
  // curve = "spring" on ce.anim.to and ce.anim.spring are one motion. A spring's own damping and
  // frequency come from the animation's opts, which this function does not see.
  if (curve === 'spring') return animationSpring(v, SPRING_DEFAULT_DAMPING, SPRING_DEFAULT_FREQUENCY);
  return undefined;
}

const SPRING_DEFAULT_DAMPING = 6;
const SPRING_DEFAULT_FREQUENCY = 12;

/**
 * A curve drawn by hand, as ce.anim takes it: the two control points of a cubic-bezier, x1, y1, x2,
 * y2 — as a list of four, which is what the Animation tab's custom easing stores (so a script can
 * pass an animation's `bezier` straight in), or named. Both x values stay in [0, 1] (time cannot run
 * backwards); the y values may overshoot, within [-2, 3]. Anything else is refused, not clamped, so
 * a typo is "not a curve" and not quietly a different one. ScriptRuntime.cpp applies exactly these
 * rules. Named keys are read by name: a Lua table's pairs have no order to read them in.
 */
export function drawnCurve(values) {
  const named = values && typeof values === 'object' && !Array.isArray(values) && 'x1' in values;
  return bezierOf(named ? [values.x1, values.y1, values.x2, values.y2] : toList(values));
}

/** A damped oscillation, pinned to exactly 1 at the end so a spring always lands on its target. */
export function animationSpring(progress, damping, frequency) {
  return springEase(progress, damping, frequency);
}

const animations = new Map();   // path -> descriptor
let animationTimer = null;
const ANIMATION_TICK_MS = 16;   // ~60Hz in the panel view; the player ticks at its own 30Hz

// The clock an animation starts from is the LAST TICK, not the wall clock — exactly what
// ScriptRuntime does, so the two runtimes measure elapsed time against the same origin. Reading
// the wall clock here instead would work in production and diverge the moment a caller drives time
// itself, which is how the C++ and JS engines end up disagreeing without anyone noticing.
let animationNowMs = 0;
// Whether a tick has EVER happened — not `animationNowMs === 0`, because zero is a perfectly good
// tick time when the caller drives the clock (which the tests do, and which is the only way to
// test an animation without waiting on a real one).
let animationTicked = false;

function animationNow() { return Date.now(); }

// Groups exist so a call with SEVERAL paths gets ONE completion. `done` on a six-path sweep means
// "when the sweep is over", not six times; the group counts down and the last one out fires it.
let animationGroupSeq = 0;
const animationGroups = new Map();   // group id -> { remaining, done, scriptId, completed, paths }

/** Run a script's callback and report a throw against THAT script — the same contract after()
 *  keeps, so a broken completion handler is attributed rather than swallowed. */
function runScriptCallback(scriptId, label, fn) {
  try { withDocumentWriteBatch(fn); } catch (e) { reportScriptError(scriptId, e); }
}

// An envelope is sampled into this many SEGMENTS (so ANIM_SAMPLES + 1 values, the last landing
// exactly on t = 1). This IS an approximation of the drawn shape, and worth stating plainly: at a
// sharp corner the sampled peak can sit ~0.1% below the drawn one. It is far finer than the tick
// rate the value is written at, so nothing reads the difference — and it is the same number in
// every runtime, which is the property that actually matters.
export const ANIM_SAMPLES = 1024;

/** Sample a { x, y, curve } point list into a flat table of y values, using ce.math.map — which IS
 *  the Envelope component's envValueAt, so the sampled shape is the shape the panel draws. The
 *  script editor's Values tab draws an envelope's shape under its row from it, so what it shows is
 *  what moves. */
export function sampleEnvelope(points) {
  const out = [];
  for (let i = 0; i <= ANIM_SAMPLES; i += 1) {
    const y = Number(mapCurveImpl(i / ANIM_SAMPLES, points));
    out.push(Number.isFinite(y) ? y : 0);
  }
  return out;
}

/** Read a sampled shape at 0..1, linearly between samples. */
function sampleAt(samples, t) {
  if (!samples || !samples.length) return 0;
  const x = Math.min(1, Math.max(0, Number(t) || 0)) * (samples.length - 1);
  const i = Math.floor(x);
  if (i >= samples.length - 1) return samples[samples.length - 1];
  return samples[i] + (samples[i + 1] - samples[i]) * (x - i);
}


/** The transport position an animation with `sync` measures against. */
function animationBeats() {
  const t = transportSnapshot();
  return t.valid ? t.beats : 0;
}

/** How far through its current cycle an animation is, 0..1. Delay is BEFORE the move, so a delayed
 *  animation reads 0 and holds its `from` value rather than jumping. */
function animationProgress(a, nowMs, beats) {
  if (a.paused) return a.heldProgress;
  if (a.sync) {
    const span = a.syncBeats > 0 ? a.syncBeats : 1;
    return Math.min(1, Math.max(0, (beats - a.startBeats) / span));
  }
  return Math.min(1, Math.max(0, (nowMs - a.startMs) / a.duration));
}

/** The value an animation is at, at a given progress. */
function animationValueOf(a, progress) {
  if (a.kind === 'envelope') {
    // The shape was SAMPLED at start (see ANIM_SAMPLES); between samples the read is linear.
    // Sampling rather than evaluating map() on every tick is what lets the C++ engine run the same
    // envelope: map()'s per-point curves live in the preludes, and the alternative was a fifth
    // implementation of them in ScriptRuntime.cpp. One table, interpolated identically everywhere.
    const shaped = sampleAt(a.samples, progress);
    return a.from + (a.to - a.from) * (Number.isFinite(shaped) ? shaped : 0);
  }
  const eased = a.kind === 'spring' || a.curve === 'spring'
    ? animationSpring(progress, a.damping, a.frequency)
    : a.bezier
      ? cubicBezierEase(progress, a.bezier[0], a.bezier[1], a.bezier[2], a.bezier[3])
      : animationEase(progress, a.curve);
  return a.from + (a.to - a.from) * (Number.isFinite(eased) ? eased : progress);
}

/** Run (and forget) the completion callback for one animation, as done(completed): one argument,
 *  true or false, for a single path and for a list alike. A stopped animation reports false, so
 *  "then do X" can tell finishing from cancelling. It used to be handed a table, { path, completed }
 *  or { paths, completed }, where the contract says done(completed), and a table is always true:
 *  `if completed then` read a cancelled move as a finished one. Every engine passes the boolean now
 *  (ScriptRuntime::fireAnimationDone and the preludes' __animDone listeners). */
function fireAnimationDone(a, completed) {
  if (a.groupId != null) {
    const group = animationGroups.get(a.groupId);
    if (!group) return;
    group.remaining -= 1;
    if (!completed) group.completed = false;
    if (group.remaining > 0) return;
    animationGroups.delete(a.groupId);
    if (typeof group.done !== 'function') return;
    runScriptCallback(group.scriptId, 'done', () => group.done(group.completed === true));
    return;
  }
  if (typeof a.done !== 'function') return;
  const fn = a.done;
  a.done = null;                          // once, whatever happens next
  runScriptCallback(a.scriptId, 'done', () => fn(completed === true));
}

/** Drop an animation without firing anything — panel teardown, and the internal half of stop(). */
function dropAnimation(key) {
  animations.delete(key);
  if (!animations.size && animationTimer != null) {
    clearInterval(animationTimer);
    animationTimer = null;
  }
}

/**
 * The number ce.anim.to or ce.anim.spring moves to, or undefined after saying why there is none.
 * A target that is not a number ("full", "100px", "#FF0000") used to be read as 0, so the control
 * swept to its bottom; text that is a number ("100") is read as one, as it always was. In the words
 * of each prelude's __animTarget.
 */
function animationTarget(verb, target) {
  const n = realNumber(target);
  if (n !== undefined) return n;
  let why;
  if (target === undefined || target === null) why = 'no number to move to was given';
  else if (typeof target === 'string') why = `"${target}" is not a number`;
  else why = 'the target given is not a number';
  addScriptTrace('error', '', `${verb}: ${why}, so nothing was started.`);
  return undefined;
}

/** Whether `path` is a colour property, a control's or the panel's own (panel.bgColour). */
function isColourPath(path) {
  const { name, segs } = splitScriptPath(String(path));
  if (!segs.length) return false;
  if (isPanelTarget(name)) return Boolean(panelColourFieldAt(segs.join('.')));
  const control = findControlByName(name);
  return Boolean(control && colourFieldAt(control, resolveModelPath(control, segs)));
}

/** True, after saying so, when `path` is a colour property, a control's or the panel's own
 *  (panel.bgColour): ce.anim moves numbers, and every tick would write one into the colour (set()
 *  refuses each, sixty times a second). */
function animatesColour(verb, path) {
  if (!isColourPath(path)) return false;
  addScriptTrace('error', '', `${verb}: "${path}" is a colour, and ce.anim moves numbers, so nothing was started.`);
  return true;
}

/** True, after saying so, when `path` names a control the panel does not have. The move used to
 *  start anyway: the call answered true, every tick wrote `set: control "…" not found` to the
 *  console, sixty times a second, and done was called with true at the end. With no panel to ask
 *  nothing is refused, as the plug-in's ScriptRuntime refuses nothing with no panel document. */
function animatesNoControl(verb, path) {
  const { name } = splitScriptPath(String(path));
  if (isPanelTarget(name) || !activePanel() || findControlByName(name)) return false;
  addScriptTrace('error', '', `${verb}: control "${name}" not found on the active panel, so nothing was started.`);
  return true;
}

// A move's timing: a number, or text that is one (realNumber). A duration or a delay that cannot be
// read, or is below 0, and beats that are not a number above 0, are said once per command, and the
// move goes ahead as it always did: a duration in its default time, or 1 ms below 0; a delay of
// none; the length its duration gives. They were all taken without a word, and Number() read
// "1/4" as no duration here while the plug-in's ScriptRuntime read it as 1 ms; both read it as
// this now, in these words. resetScriptState clears what has been said.
const animTimingWarned = new Set();
function warnAnimTiming(verb, name, said) {
  const key = `${verb} ${name}`;
  if (animTimingWarned.has(key)) return;
  animTimingWarned.add(key);
  addScriptTrace('warn', '', `${verb}: ${said} This is said only the first time.`);
}
function animTiming(verb, opts, name, fallback) {
  const v = opts?.[name];
  if (v === undefined || v === null) return fallback;
  const duration = name === 'duration';
  const n = realNumber(v);
  if (n === undefined) {
    const beatsLike = duration && typeof v === 'string' && v.includes('/');
    warnAnimTiming(verb, name, `${shownValue(v)} is not a number of milliseconds, so the move `
      + (duration ? `takes ${Math.round(fallback)} ms, as it does when no duration is given.` : 'starts at once, as it does when no delay is given.')
      + (beatsLike ? ' For a length in beats, give beats, a number.' : ''));
    return fallback;
  }
  if (n < 0) {
    warnAnimTiming(verb, name, `a ${name} of ${shownValue(n)} is less than 0, so the move ${duration ? 'takes 1 ms: it jumps.' : 'starts at once.'}`);
    return duration ? 1 : 0;
  }
  return n;
}
/** `stagger`, `damping` and `frequency`: a number, or text that is one, or after saying why not, the
 *  default. A frequency's sign makes no difference, so it is used as given. A damping below 0 makes
 *  the spring grow instead of settling (a move from 0 to 100 at -2 is at -161 halfway), and a
 *  stagger below 0 gave each path a delay below 0, held at 0 and said as a delay; both are the
 *  default, and said as what they are. */
const ANIM_OPTION_FALLBACK_WORDS = {
  stagger: () => 'not a number of milliseconds, so the moves start together, as they do when no stagger is given.',
  damping: (d) => `not a number, so the spring's damping is ${d}, as it is when none is given.`,
  frequency: (d) => `not a number, so the spring's frequency is ${d}, as it is when none is given.`,
};
function animOption(verb, opts, name, fallback) {
  const v = opts?.[name];
  if (v === undefined || v === null) return fallback;
  const n = realNumber(v);
  if (n !== undefined) {
    if (name === 'damping' && n < 0) {
      warnAnimTiming(verb, name, `a damping of ${shownValue(n)} is less than 0, so the spring would grow instead of settling: its damping is ${fallback}, as it is when none is given.`);
      return fallback;
    }
    if (name === 'stagger' && n < 0) {
      warnAnimTiming(verb, name, `a stagger of ${shownValue(n)} is less than 0, so the moves start together, as they do when no stagger is given.`);
      return fallback;
    }
    return n;
  }
  warnAnimTiming(verb, name, `${shownValue(v)} is ${ANIM_OPTION_FALLBACK_WORDS[name](fallback)}`);
  return fallback;
}

/** `done` as the function it is, or null: none given, or after saying why not. A done that was not
 *  a function ("x", 5) was dropped without a word. The preludes pass theirs on as __badDone, and
 *  ScriptRuntime::startAnimation says the same of it. */
function animDone(verb, opts) {
  const fn = opts?.done;
  if (typeof fn === 'function') return fn;
  if (fn !== undefined && fn !== null) warnAnimTiming(verb, 'done', `${shownValue(fn)} is not a function, so nothing is called when the move ends.`);
  return null;
}

/** `beats` as a number above 0, or null: none given, or said why not. */
function animBeats(verb, opts) {
  const v = opts?.beats;
  if (v === undefined || v === null) return null;
  const n = realNumber(v);
  if (n === undefined) warnAnimTiming(verb, 'beats', `${shownValue(v)} is not a number of beats, so the move's length is its duration.`);
  else if (n <= 0) warnAnimTiming(verb, 'beats', `${shownValue(n)} beats is not more than 0, so the move's length is its duration.`);
  else return n;
  return null;
}

function startAnimationImpl(scriptId, kind, path, target, opts = {}, group = null) {
  // to and spring move to a number, and only a number. An envelope's ends come from its own opts.
  if (kind !== 'envelope' && animationTarget(`ce.anim.${kind}`, target) === undefined) return false;
  // A LIST of paths is one call, one shape, one completion. Six paths with six hand-computed
  // delays was the alternative, and `stagger` is why the list is worth having at all.
  if (Array.isArray(path)) {
    const paths = path.map((p) => String(p ?? '')).filter(Boolean);
    if (!paths.length) {
      addScriptTrace('error', '', `ce.anim.${kind}: the list has no paths, so nothing was started.`);
      return false;
    }
    // A colour among them, or a control the panel does not have, refuses the whole call, each one
    // named in the words a single path is refused in, and nothing starts. The colour alone was
    // refused and the rest moved, and the list's done waited for a path that never started, so it
    // was never called. The plug-in's ScriptRuntime::startAnimation checks a list the same way
    // before it starts any of it.
    const refused = paths.filter((p) => animatesNoControl(`ce.anim.${kind}`, p) || animatesColour(`ce.anim.${kind}`, p));
    if (refused.length) return false;
    const stagger = animOption(`ce.anim.${kind}`, opts, 'stagger', 0);
    const baseDelay = Math.max(0, animTiming(`ce.anim.${kind}`, opts, 'delay', 0));
    const done = animDone(`ce.anim.${kind}`, opts);
    let groupId = null;
    if (done) {
      animationGroupSeq += 1;
      groupId = animationGroupSeq;
      animationGroups.set(groupId, {
        remaining: paths.length, done, completed: true,
        scriptId: scriptId,
      });
    }
    let ok = true;
    paths.forEach((p, i) => {
      const each = { ...opts, delay: baseDelay + stagger * i, done: undefined };
      if (!startAnimationImpl(scriptId, kind, p, target, each, groupId)) ok = false;
    });
    return ok;
  }

  const key = String(path ?? '');
  if (!key) {
    // An empty path used to answer false without a word.
    addScriptTrace('error', '', `ce.anim.${kind}: no path was given, so nothing was started.`);
    return false;
  }
  if (animatesNoControl(`ce.anim.${kind}`, key) || animatesColour(`ce.anim.${kind}`, key)) return false;

  const groupId = group;
  const spring = kind === 'spring';
  const envelope = kind === 'envelope';

  // An unknown curve REPORTS rather than silently animating linear. "outCubic" is a name the
  // Properties panel offers three feet away, and it was linear here in every runtime. A curve can
  // also be drawn — four numbers, see drawnCurve — which is how a script moves along the same
  // custom curve an animation in the Animation tab uses. Said once per command, as every other
  // option is (warnAnimTiming): it was a line on every call, and a curve that was neither a name
  // nor numbers (curve = 5) was linear without a word. ScriptRuntime::startAnimation says the same.
  const curveVerb = `ce.anim.${kind}`;
  // A name in any case (utils/wordLists.js): "OutCubic" is "outCubic". ScriptRuntime reads it so too.
  let curve = typeof opts?.curve === 'string' ? (listWord(ANIM_CURVE_NAMES, opts.curve) ?? opts.curve) : 'linear';
  let bezier = null;
  if (!spring && !envelope && opts?.curve && typeof opts.curve === 'object') {
    bezier = drawnCurve(opts.curve);
    curve = bezier ? 'custom' : 'linear';
    if (!bezier) {
      warnAnimTiming(curveVerb, 'curve',
        'a drawn curve is four numbers, x1, y1, x2, y2 (a list, or named), with x1 and x2 between 0 and 1 — animating linear.');
    }
  } else if (!spring && !envelope && typeof opts?.curve === 'string' && animationEase(0.5, curve) === undefined) {
    warnAnimTiming(curveVerb, 'curve',
      `"${curve}" is not a curve this build knows — animating linear. `
      + `Try one of: ${ANIM_CURVE_NAMES.join(', ')}, or draw one as four numbers, x1, y1, x2, y2.`);
    curve = 'linear';
  } else if (!spring && !envelope && opts?.curve !== undefined && opts?.curve !== null && typeof opts.curve !== 'string') {
    warnAnimTiming(curveVerb, 'curve',
      `${shownValue(opts.curve)} is not a curve: a name, or four numbers, x1, y1, x2, y2 — animating linear.`);
  }

  // `from` defaults to where the value IS, so an animation starts from the truth rather than from
  // wherever the previous one happened to stop. A number, or text that is one (realNumber), or
  // after saying why not, the default: Number() read "abc" and "" as 0 and true as 1, in silence.
  let from;
  if (opts?.from !== undefined && opts?.from !== null) {
    from = realNumber(opts.from);
    if (from === undefined) {
      warnAnimTiming(curveVerb, 'from',
        `${shownValue(opts.from)} is not a number, so the move starts from the value as it is now, as it does when no from is given.`);
    }
  }
  if (from === undefined) {
    const now = Number(getValue(key, 'value'));
    from = Number.isFinite(now) ? now : 0;
  }

  // Nothing has ticked yet on a fresh panel, so seed the origin from the clock the interval below
  // will use — otherwise the first animation measures against zero and finishes instantly.
  if (!animationTicked) { animationNowMs = animationNow(); animationTicked = true; }

  // A duration in BEATS is resolved once, here. `sync` is the stronger thing: the position is
  // derived from the transport's beat count, so the animation FREEZES when the transport stops and
  // stretches when the tempo drops — which is what every synced component in the panel does and no
  // script could ask for.
  const sync = opts?.sync === true;
  const beatsOpt = animBeats(`ce.anim.${kind}`, opts);
  const defaultMs = spring ? 600 : 300;
  let duration = Math.max(1, animTiming(`ce.anim.${kind}`, opts, 'duration', defaultMs));
  let syncBeats = 0;
  if (beatsOpt !== null) {
    syncBeats = beatsOpt;
    const ms = beatsToMsRead(beatsOpt);
    if (ms != null) duration = Math.max(1, ms);
    else if (sync === false) {
      addScriptTrace('log', scriptId,
        'ce.anim: no tempo is being reported, so `beats` has no length — using `duration` instead.');
    }
  } else if (sync) {
    syncBeats = msToBeatsRead(duration) ?? 1;
  }

  const delay = Math.max(0, animTiming(`ce.anim.${kind}`, opts, 'delay', 0));
  // `repeat` is how many times the move runs IN ALL: 1 (the default) once, 3 three times, and 0 or
  // less until it is stopped, as the contract always said. Every runtime used to read it as runs
  // AFTER the first, so repeat = 1 ran twice and repeat = 0 once. Rounded to a whole number. Text
  // that is a number is read as one (realNumber); anything else runs it once, as all of it but true
  // did before. That is why this is not Number(): Number() reads null, false and "" as 0, which
  // would now mean forever. Held below as the runs LEFT after this one, -1 for until stopped.
  // Anything a script can start forever it must be able to stop, which is what list()/value() and
  // panel teardown are for. ScriptRuntime::startAnimation reads it the same way.
  const runsGiven = realNumber(opts?.repeat);
  if (runsGiven === undefined && opts?.repeat !== undefined && opts?.repeat !== null) {
    warnAnimTiming(curveVerb, 'repeat', `${shownValue(opts.repeat)} is not a number of runs, so the move runs once, as it does when no repeat is given.`);
  }
  const runs = runsGiven === undefined ? 1 : Math.round(runsGiven);
  const repeat = runs <= 0 ? -1 : runs - 1;

  const previous = animations.get(key);
  if (previous) fireAnimationDone(previous, false);   // replaced is not finished

  animations.set(key, {                       // …replacing any animation already on this path:
    kind: envelope ? 'envelope' : (spring ? 'spring' : 'to'),   // a value has one destination
    path: key,
    from,
    to: envelope ? (Number(target) || 0) : realNumber(target),
    samples: envelope ? opts.samples : null,
    startMs: animationNowMs + delay,
    startBeats: animationBeats() + (sync ? (msToBeatsRead(delay) ?? 0) : 0),
    delay,
    duration,
    sync,
    syncBeats,
    curve,
    bezier,
    damping: animOption(`ce.anim.${kind}`, opts, 'damping', SPRING_DEFAULT_DAMPING),
    frequency: animOption(`ce.anim.${kind}`, opts, 'frequency', SPRING_DEFAULT_FREQUENCY),
    repeat,
    cycle: 0,
    pingpong: opts?.pingpong === true,
    paused: false,
    heldProgress: 0,
    done: animDone(curveVerb, opts),
    scriptId: scriptId,
    groupId,
  });

  if (animationTimer == null && typeof setInterval === 'function') {
    animationTimer = setInterval(() => tickAnimations(animationNow()), ANIMATION_TICK_MS);
  }
  return true;
}

/** envelope(path, points, opts) — drive a value THROUGH a shape rather than between two numbers.
 *
 *  `to` and `spring` both go from A to B; an ADSR does not, and it is the single most obvious thing
 *  a synth panel animates. The points are the Envelope component's own — { x, y, curve } in 0..1 —
 *  and the lookup is ce.math.map, which IS envValueAt, so a script's sweep and the Envelope drawn
 *  beside it trace the same line. */
function startEnvelopeImpl(scriptId, path, points, opts = {}) {
  // Fewer than two points, a point that is not one, or one whose x is not from 0 to 1, is refused
  // with an error (animEnvelope.js says why each used to pass without a word; too few was a plain
  // line until the owner asked for the error every other rejection is). The preludes'
  // animateEnvelope check the same, in the same words.
  const refused = envelopeRefusal(points);
  if (refused) {
    addScriptTrace('error', scriptId, refused.message);
    return false;
  }
  // `from` and `to`: a number, or text that is one (realNumber), or after saying why not, the
  // default. Number() read "abc" as 0 and true as 1 in silence, so to = "abc" held the whole move
  // at 0. The preludes read theirs the same way and pass what they could not read on as
  // __badFrom / __badTo, which ScriptRuntime::startAnimation says in these words.
  const end = (name, fallback) => {
    const v = opts?.[name];
    if (v === undefined || v === null) return fallback;
    const n = realNumber(v);
    if (n !== undefined) return n;
    warnAnimTiming('ce.anim.envelope', name,
      `${shownValue(v)} is not a number, so y = ${fallback} of the shape means ${fallback}, as it does when no ${name} is given.`);
    return fallback;
  };
  const from = end('from', 0);   // from before to: the order the plug-in's runtime says them in
  const to = end('to', 1);
  return startAnimationImpl(scriptId, 'envelope', path, to, { ...opts, samples: sampleEnvelope(points), from });
}

function stopAnimationImpl(path) {
  if (path == null || String(path) === '') {
    for (const a of [...animations.values()]) fireAnimationDone(a, false);
    animations.clear();
    if (animationTimer != null) { clearInterval(animationTimer); animationTimer = null; }
    return true;
  }
  const key = String(path);
  const a = animations.get(key);
  if (a) fireAnimationDone(a, false);
  dropAnimation(key);
  return true;
}

function animationRunningImpl(path) {
  if (path == null || String(path) === '') return animations.size > 0;
  return animations.has(String(path));
}

/** Where an animation IS — running() says whether, this says how far. Nil when nothing is running
 *  on the path, which is what tells "finished" from "half way". */
function animationValueImpl(path) {
  const a = animations.get(String(path ?? ''));
  if (!a) return undefined;
  const progress = animationProgress(a, animationNowMs, animationBeats());
  const remaining = a.sync ? null : Math.max(0, a.duration * (1 - progress));
  return {
    path: a.path,
    kind: a.kind,
    value: animationValueOf(a, progress),
    progress,
    from: a.from,
    to: a.to,
    elapsed: a.sync ? null : a.duration * progress,
    remaining,
    paused: a.paused,
    cycle: a.cycle,
    sync: a.sync,
  };
}

/** Every animation running, in path order. The read `ce.time.timers()` and `ce.panel.entries()`
 *  both got, and the one that makes `repeat = 0` safe to offer: a script can always find what it
 *  started and stop it. */
function animationListImpl() {
  return [...animations.keys()].sort().map((k) => animationValueImpl(k));
}

/** Hold an animation where it is. stop() is destructive and there was no non-destructive hold, so
 *  "pause the sweep while the user drags" meant stopping it and rebuilding the rest by hand. */
function animationPauseImpl(path) {
  const key = String(path ?? '');
  const a = animations.get(key);
  if (!a || a.paused) return false;
  a.heldProgress = animationProgress(a, animationNowMs, animationBeats());
  a.paused = true;
  return true;
}

function animationResumeImpl(path) {
  const key = String(path ?? '');
  const a = animations.get(key);
  if (!a || !a.paused) return false;
  // Re-anchor so the held progress reads the same at the moment of resuming: the animation carries
  // on rather than restarting, which is the whole difference from stop-and-start-again.
  a.startMs = animationNowMs - a.heldProgress * a.duration;
  a.startBeats = animationBeats() - a.heldProgress * (a.syncBeats || 1);
  a.paused = false;
  return true;
}

/** Turn a running animation around from where it is, travelling back at the SAME RATE — a move
 *  that was 80% done takes 80% of its duration to get home. `to(path, from)` would restart it at
 *  the full duration, so an almost-finished move would take as long to come back as the whole
 *  journey took: a bounce rather than a snap back. */
function animationReverseImpl(path) {
  const key = String(path ?? '');
  const a = animations.get(key);
  if (!a) return false;
  const progress = animationProgress(a, animationNowMs, animationBeats());
  const target = a.from;
  a.from = a.to;
  a.to = target;
  // An envelope reverses its SHAPE as well as its direction — running the samples backwards,
  // which is what "play that envelope in reverse" means and what mirroring the points would only
  // approximate once a per-point curve is involved.
  if (a.kind === 'envelope') a.samples = [...a.samples].reverse();
  a.heldProgress = 1 - progress;
  a.startMs = animationNowMs - (1 - progress) * a.duration;
  a.startBeats = animationBeats() - (1 - progress) * (a.syncBeats || 1);
  return true;
}

/** Jump to the target and complete — done() fires with completed = true. stop() leaves the value
 *  stranded halfway, which is right for a cancel and wrong for "skip the animation". */
function animationFinishImpl(path) {
  const key = String(path ?? '');
  const a = animations.get(key);
  if (!a) return false;
  setValue(a.path, animationValueOf(a, 1));
  fireAnimationDone(a, true);
  dropAnimation(key);
  return true;
}

/**
 * play(control, animation) — play one of the control's keyframe animations now (ce.anim.play).
 *
 * Not one of the value animations above: it asks the control's own keyframe player
 * (utils/keyframeAnimation.js) to start the named animation from its first frame, through the same
 * request the Animation tab's Play button makes. Only a keyframe animation can be played this way —
 * a transition has no shape of its own, only a change to ease — and the refusal says which keyframe
 * animations the control does have, so a typo is one message away from fixed.
 */
function animatePlayImpl(controlName, animationName) {
  // A name left out was looked up as the text "undefined", and said so.
  const given = (v) => v !== undefined && v !== null && String(v).trim() !== '';
  if (!given(controlName)) { addScriptTrace('error', '', 'ce.anim.play: no control name was given.'); return false; }
  const control = controlNamed(controlName);
  if (!control) { addScriptTrace('error', '', `ce.anim.play: no control named "${controlName}".`); return false; }
  const all = control?._children?.Animations?._children ?? {};
  const playable = Object.entries(all).filter(([, a]) => String(a?.kind ?? '') === 'keyframes').map(([k]) => k);
  const have = playable.length
    ? `Its keyframe animations: ${playable.join(', ')}.`
    : 'It has no keyframe animations — make one in the Animation tab.';
  if (!given(animationName)) { addScriptTrace('error', '', `ce.anim.play: no animation name was given. ${have}`); return false; }
  const wanted = String(animationName).toLowerCase();
  const key = Object.keys(all).find((k) => k.toLowerCase() === wanted);
  const node = key == null ? null : all[key];
  if (!node || String(node.kind ?? '') !== 'keyframes') {
    const why = node ? `"${key}" is a transition, which plays when its trigger does` : `"${controlName}" has no animation called "${animationName}"`;
    addScriptTrace('error', '', `ce.anim.play: ${why}. ${have}`);
    return false;
  }
  return requestAnimationPlay(control._children?.Core?.id, String(node.name ?? key));
}

/** Advance every animation to `nowMs` and write the values. Exported so tests drive time directly
 *  rather than sleeping — an animation test that waits on a real clock is a flaky test. */
export function tickAnimations(nowMs) {
  animationNowMs = Number(nowMs) || 0;
  animationTicked = true;
  if (!animations.size) return;
  const beats = animationBeats();
  // Iterate a copy: a set() can run a script that starts or stops an animation.
  for (const a of [...animations.values()]) {
    if (a.paused) continue;
    if (animations.get(a.path) !== a) continue;      // replaced mid-walk
    const progress = animationProgress(a, animationNowMs, beats);
    setValue(a.path, animationValueOf(a, progress));
    if (progress < 1) continue;

    // A cycle finished. Repeat if there is one left, else complete.
    if (a.repeat !== 0) {
      if (a.repeat > 0) a.repeat -= 1;
      a.cycle += 1;
      // ping-pong swaps the ends so the NEXT cycle comes back, which is the only way to express a
      // continuous modulator without a second verb that means the same thing.
      if (a.pingpong) { const t = a.from; a.from = a.to; a.to = t; }
      a.startMs = animationNowMs;
      a.startBeats = beats;
      continue;
    }
    fireAnimationDone(a, true);
    dropAnimation(a.path);
  }
}

/** Panel teardown: an animation writing into a panel that is gone is just noise — and neither is a
 *  completion callback into a script set that no longer exists, so nothing is fired here. */
export function stopAllAnimations() {
  animations.clear();
  animationGroups.clear();
  if (animationTimer != null) { clearInterval(animationTimer); animationTimer = null; }
  animationNowMs = 0;      // the next panel starts its own clock
  animationTicked = false;
}
// @module ce.ui
/* ----------------------------------------------------------------------------------- ce.ui */
// Telling the person using the panel something. Panel view only — there is nobody to tell with the
// window shut, which is why these are stubbed in the C++ engines rather than made cross-runtime.

// notify() returns its ID, not merely true. The id was always computed and then thrown away, and
// without it nothing else here is addressable: a message you cannot name is a message you cannot
// take back or replace, which is why "Sending dump… 40%" used to mean ten stacked toasts.
// ce.ui's review (docs/design/api-descriptions-handoff.md): a message left out, an id that is not
// one, and a dialog that asks nothing did nothing without a word; a kind or a duration that is not
// one was used as the default without one. Each is now said, a default the first time only.
const UI_KINDS = ['info', 'warn', 'error'];
function uiKind(verb, kind) {
  if (kind === undefined || kind === null) return undefined;
  const word = listWord(UI_KINDS, String(kind));
  if (!word) uiSaid(`${verb}: "${kind}" is not a kind, so "info" was used. One of: ${UI_KINDS.join(', ')}.`);
  return word ?? 'info';
}
function uiDuration(verb, duration) {
  if (duration === undefined || duration === null) return undefined;
  const ms = realNumber(duration);
  if (ms === undefined) uiSaid(`${verb}: the duration ${shownValue(duration)} is not a number of milliseconds, so 3000 was used.`);
  return ms ?? 3000;
}
const uiWarned = new Set();
function uiSaid(said) {
  if (uiWarned.has(said)) return;
  uiWarned.add(said);
  addScriptTrace('warn', '', `${said} This is said only the first time.`);
}

function uiNotifyImpl(message, opts) {
  const text = String(message ?? '').trim();
  if (!text) {
    addScriptTrace('error', '', 'ce.ui.notify: no message was given, so nothing was shown.');
    return undefined;
  }
  return uiNotifyStore(text, {
    kind: uiKind('ce.ui.notify', opts?.kind),
    duration: uiDuration('ce.ui.notify', opts?.duration),
  }) ?? undefined;
}

/** Take a message back. No id clears every one — "stop saying things" is a real request, and making
 *  a script remember six ids to make it would be busywork. Returns how many went. */
function uiDismissImpl(id) {
  if (id != null && realNumber(id) === undefined) {
    addScriptTrace('error', '', `ce.ui.dismiss: ${shownValue(id)} is not a message's id, so nothing was removed.`);
    return 0;
  }
  return uiDismissStore(id == null ? null : Number(id));
}

/** Replace a live message in place. Returns false when it has already gone, which is how a script
 *  learns its progress message was dismissed by hand and it should stop updating one. */
function uiUpdateImpl(id, message, opts) {
  if (id == null || realNumber(id) === undefined) {
    addScriptTrace('error', '', `ce.ui.update: ${id == null ? 'no id was given' : `${shownValue(id)} is not a message's id`}, so nothing was changed.`);
    return false;
  }
  if (!String(message ?? '').trim()) {
    addScriptTrace('error', '', 'ce.ui.update: no message was given, so nothing was changed.');
    return false;
  }
  return uiUpdateStore(Number(id), message, {
    kind: uiKind('ce.ui.update', opts?.kind),
    duration: uiDuration('ce.ui.update', opts?.duration),
  });
}

function uiStatusImpl(message, opts) {
  uiStatusStore(message ?? '', { kind: uiKind('ce.ui.status', opts?.kind) });
  return true;
}

/** What is on screen. One read rather than three, and the only way a script can tell dialog()'s
 *  false apart: "nobody to ask" and "one already open" want different handling. */
function uiStateImpl() {
  return uiSnapshotStore();
}

/**
 * Put text on the clipboard — the thing the app itself does in six places (a colour, a console
 * dump, a parameter table) and a script could not do at all.
 *
 * The write is ASYNCHRONOUS and the browser may refuse it outright when the page has no user
 * gesture behind it, so the return says the copy was ATTEMPTED, not that it landed. Saying so is
 * better than a `true` that means less than it looks — the same rule ce.device.write follows.
 */
function uiCopyImpl(scriptId, text) {
  const value = text == null ? '' : String(text);
  if (!value) { addScriptTrace('error', scriptId ?? '', 'ce.ui.copy: no text was given, so nothing was copied.'); return false; }
  const clip = typeof navigator !== 'undefined' ? navigator.clipboard : null;
  if (!clip || typeof clip.writeText !== 'function') {
    addScriptTrace('log', scriptId ?? '',
      'ce.ui.copy(): this build has no clipboard to write to — nothing was copied.');
    return false;
  }
  try {
    const p = clip.writeText(value);
    // A rejected promise here is the browser declining, not a script error: reported, never thrown
    // into a handler that has long since returned.
    if (p && typeof p.catch === 'function') {
      p.catch(() => addScriptTrace('log', scriptId ?? '',
        'ce.ui.copy(): the browser refused the clipboard write (it usually wants a click behind it).'));
    }
  } catch {
    return false;
  }
  return true;
}

// dialog() asks a question, so it cannot answer it: the return value says whether anything was put
// on screen, and the ANSWER arrives through the callback. Returning false always means the callback
// has ALREADY run with no answer — a script never has to wonder whether it is still waiting.
function uiDialogImpl(scriptId, opts, onChoice) {
  const answer = (choice) => {
    // A dialog's answer arrives long after the handler that asked has returned, so the callback is
    // the one place a script's error can escape the dispatch path that would have reported it.
    try { if (typeof onChoice === 'function') onChoice(choice); }
    catch (e) { reportScriptError(scriptId, e); }
  };
  const id = uiDialogStore(opts, answer);
  if (id == null) {
    // Another dialog open is a reason ce.ui.state() reports; a dialog that asks nothing is a mistake.
    const o = opts && typeof opts === 'object' ? opts : {};
    const verb = o.ask === 'text' ? 'ce.ui.prompt' : o.ask === 'list' ? 'ce.ui.choose' : 'ce.ui.dialog';
    const items = (Array.isArray(o.items) ? o.items : []).filter((i) => String(i ?? '').trim());
    if (!String(o.title ?? '').trim() && !String(o.message ?? '').trim()) {
      addScriptTrace('error', '', `${verb}: no title and no message were given, so nothing was asked.`);
    } else if (o.ask === 'list' && !items.length && !uiStateImpl().dialog) {
      addScriptTrace('error', '', `${verb}: no items were given, so there is nothing to choose.`);
    }
    answer(undefined);
    return false;
  }
  return true;
}

// @module ce.draw
/* -------------------------------------------------------------------------------- ce.draw */
// Oscilloscopes, envelope editors, XY pads, readouts. Immediate mode: each verb appends a command
// carrying the style in force when it was issued, and the panel renders the list on top of the
// target control. Coordinates are the CONTROL's own — (0,0) at its top-left — so a drawing scales
// with whatever it is drawn on.
//
// Nothing repaints on its own. onDraw runs when something asks for it, and a script animates by
// calling ce.draw.redraw() from onTimer. A per-frame callback nobody asked for is a performance
// trap, and one that fires whether or not the panel is visible is a worse one.
//
// The command list is held in a store, never in the panel document: a drawing is a product of the
// script, not part of the document, and a scope trace persisted to disk would be meaningless.

// The style in force, and which control is being drawn on. Draws are not re-entrant — dispatch is
// already guarded by live.dispatching — so one set of style state is enough.
const drawState = {
  target: null, fill: null, stroke: null, strokeWidth: 1,
  dash: null, dashOffset: null, cap: null, join: null,
  opacity: null, transform: null, clip: null, blend: null,
};

// save()/restore() — the style was flat, so setting a stroke for one shape meant remembering what it
// had been and putting it back by hand, and getting that wrong changes every shape after it. The
// stack holds copies rather than references: a restore has to be unaffected by what was drawn in
// between (§49).
const drawStateStack = [];
const DRAW_STYLE_KEYS = [
  'fill', 'stroke', 'strokeWidth', 'dash', 'dashOffset', 'cap', 'join',
  'opacity', 'transform', 'clip', 'blend',
];

/**
 * A fill or stroke as the overlay paints it, or undefined after saying why it cannot be painted.
 *
 * The overlay hands a string to SVG as it is, so "FF5B9BD5" (the panel's own AARRGGBB, what get()
 * returns for a colour property and what ce.math.alpha() makes) and a bare "5B9BD5" painted nothing,
 * and a number painted nothing either. scriptColours.drawColour turns the panel's forms into CSS
 * and keeps what CSS reads as written; anything else is refused here and `what` stays as it was.
 */
function drawPaint(call, what, colour) {
  const read = drawColour(colour);
  if ('css' in read) return read.css;
  addScriptTrace('error', '', `${call}: ${read.why}, so ${what} stays as it was. ${DRAW_COLOUR_FORMS}${read.hint}`);
  return undefined;
}

// ce.time's number arguments as the transport reads them (timeWords.js), with one not used as
// written said once per call and argument: these run on every frame, and a line per frame would
// bury the console. resetScriptState clears what has been said. A required one left out is
// rejected, and said every time: it was the default without a word.
const timeNumberWarned = new Set();
function timeArg(memberId, name, value) {
  const { n, said, rejected } = timeNumber(memberId, name, value);
  if (rejected) {
    addScriptTrace('error', '', said);
    return undefined;
  }
  const key = `${memberId} ${name}`;
  if (said && !timeNumberWarned.has(key)) {
    timeNumberWarned.add(key);
    addScriptTrace('warn', '', `${said} This is said only the first time.`);
  }
  return n;
}

/** A line said once per key, as timeArg says its numbers. */
function timeSaid(key, said) {
  if (timeNumberWarned.has(key)) return;
  timeNumberWarned.add(key);
  addScriptTrace('warn', '', `${said} This is said only the first time.`);
}

/** ce.time.tap's times and ce.time.clockTempo's intervals: the numbers above 0 in `value`, or
 *  undefined after saying that it is no list, or was left out. An item that is not a number above
 *  0 is left out, and said once: every one of these was done in silence, and a list that was not
 *  one gave no result as if the taps were too few. */
function timeList(verb, name, what, value) {
  if (value === undefined || value === null) {
    addScriptTrace('error', '', `${verb}: ${name} was not given, so there is no answer.`);
    return undefined;
  }
  if (typeof value !== 'object') {
    addScriptTrace('error', '', `${verb}: ${name} is ${shownValue(value)}, not a list, so there is no answer.`);
    return undefined;
  }
  const items = Array.isArray(value) ? value : Object.values(value);
  const out = [];
  items.forEach((item, i) => {
    const n = realNumber(item);
    if (n > 0) { out.push(n); return; }
    timeSaid(`${verb} ${name}`, `${verb}: ${shownValue(item)} at position ${i + 1} of ${name} is not ${what} above 0, so it was left out.`);
  });
  return out;
}

// What ce.draw.stroke made of a dash, a cap or a join it could not draw as written (drawDash.js),
// said once per message: a stroke is set on every redraw, and a message per frame would bury the
// console. resetScriptState clears what has been said.
const drawStrokeWarned = new Set();
function warnDrawStroke(problem) {
  if (drawStrokeWarned.has(problem.message)) return;
  drawStrokeWarned.add(problem.message);
  addScriptTrace(problem.severity === 'error' ? 'error' : 'warn', '', `${problem.message} This is said only the first time.`);
}

// ce.draw.text's alignments, read without regard to case. The app spells centre three ways (ce.text.style
// says "centred", an image's alignment "center", this call "middle"), and "center" written here used
// to draw left-aligned without a word. All of them are the middle here.
const DRAW_TEXT_ALIGNS = {
  left: 'left', right: 'right', middle: 'middle', center: 'middle', centre: 'middle', centred: 'middle',
};

/** The alignment a text command carries, or undefined after saying the word is not one. */
function drawTextAlign(align) {
  if (align === undefined || align === null || align === '') return 'left';
  const read = typeof align === 'string' ? DRAW_TEXT_ALIGNS[align.toLowerCase()] : undefined;
  if (read) return read;
  const shown = typeof align === 'string' ? `"${align}"` : (typeof align === 'number' ? shownNumber(align) : 'the value given');
  addScriptTrace('error', '', `ce.draw.text: ${shown} is not an alignment, so nothing was drawn. `
    + 'The alignments are "left", "middle" (or "center", "centre" or "centred") and "right".');
  return undefined;
}

// Gradients get an id because SVG paints them by reference: the overlay defines each one once in
// <defs> and every shape using it points at that. Per panel rather than per draw pass, so a
// gradient reused across a redraw does not churn the defs list.
let gradientSeq = 0;

/** A gradient value, for fill() or stroke(). Stops are { at 0..1, colour, opacity }.
 *
 *  The ANGLE is the panel's own convention — 0 up, 90 right, the same one the Background section's
 *  gradients use — and the overlay resolves it with the app's gradientCoords(), which exists for
 *  exactly this and is documented as being for SVG userSpaceOnUse. A gradient built here and a
 *  gradient set in the Properties panel run in the same direction, which two conventions would not.
 */
function drawGradientImpl(stops, angle) {
  // Stops left out, not a list, or fewer than two: no gradient, and said. Fewer than two said
  // nothing (a gradient between one colour and nothing is a colour, and a colour is what the
  // script got: nothing), and text in place of the list was read letter by letter, so "red" was
  // three stops, the first of which "is not a colour".
  const refuseAll = (why) => {
    addScriptTrace('error', '', `ce.draw.gradient: ${why}, so there is no gradient.`);
    return undefined;
  };
  if (stops === undefined || stops === null) return refuseAll('stops was not given');
  if (typeof stops !== 'object') return refuseAll(`stops is ${shownValue(stops)}, not a list of colours`);
  const raw = Array.isArray(stops) ? stops : Object.values(stops);
  if (raw.length < 2) return refuseAll(`stops has ${raw.length === 0 ? 'no colours' : 'one colour'}, and a gradient needs at least two`);
  // An angle that is not a number is the default, 180, and said once: it was 180 in silence.
  const { n: degrees, said: angleSaid } = drawOption('drawGradient', 'angle', angle, 180);
  drawSaid('drawGradient\u0000angle', angleSaid);
  const list = [];
  for (const [i, stop] of raw.entries()) {
    // Two spellings, because two shapes are natural: { at, colour } for a positioned stop, and a
    // bare colour string for "space these evenly", which is what a two-colour fade actually is.
    //
    // A stop that cannot be read refuses the whole gradient, where it used to be dropped or bent:
    // a colour SVG cannot paint stayed in and painted black, `at = 50` was clamped to 1 (so the
    // middle stop went to the end), and `opacity = 50` to fully solid. The panel's own colour forms
    // are turned into CSS, as fill() turns them.
    const which = `stop ${i + 1} of ${raw.length}`;
    const refuse = (why, hint = '') => {
      addScriptTrace('error', '', `ce.draw.gradient: ${why}, so there is no gradient.${hint}`);
      return undefined;
    };
    const object = stop && typeof stop === 'object' ? stop : null;
    const given = object ? (object.colour ?? object.color) : stop;
    if (given === undefined || given === null || given === '') {
      return refuse(`${which} has no colour`, ' A stop is a colour, or { at, colour, opacity }.');
    }
    const read = typeof given === 'object' ? { why: 'the colour given is not a colour' } : drawColour(given);
    if (typeof read.css !== 'string') {
      return refuse(`in ${which}, ${read.why ?? `"${given}" is not a colour`}`, ` ${DRAW_COLOUR_FORMS}${read.hint ?? ''}`);
    }
    let at = null;
    if (object?.at !== undefined && object?.at !== null) {
      const problem = unitProblem(`the position (at) of ${which}`, object.at);
      if (problem) return refuse(problem.why, `${problem.hint}${percentTextHint(object.at)}`);
      at = realNumber(object.at);
    }
    let opacity = 1;
    if (object?.opacity !== undefined && object?.opacity !== null) {
      const problem = unitProblem(`the opacity of ${which}`, object.opacity);
      if (problem) return refuse(problem.why, `${problem.hint}${percentTextHint(object.opacity)}`);
      opacity = realNumber(object.opacity);
    }
    list.push({ colour: read.css, at, opacity });
  }
  // Unpositioned stops spread evenly across whatever room the positioned ones left them.
  list.forEach((st, i) => { if (st.at == null) st.at = list.length === 1 ? 0 : i / (list.length - 1); });
  gradientSeq += 1;
  return {
    gradient: true,
    id: `ce-draw-grad-${gradientSeq}`,
    angle: degrees,
    stops: list,
  };
}

// controlId -> the commands drawn on it so far. Commands are appended and published as they
// arrive rather than buffered and published at the end of a draw pass: dispatchEvents is async
// (Lua and Python run through a WASM engine), so "the end of the pass" is not a moment this code
// can hold style state across without a second redraw clobbering it. Svelte batches store updates
// within a tick, so a half-drawn frame is not observable in practice.
const drawCommands = new Map();

/** Which control a draw verb applies to: the explicit target, else the one being drawn, else the
 *  control the script is attached to. */
function drawTarget(explicit, ownerName) {
  const name = explicit != null && String(explicit) !== '' ? String(explicit)
             : (drawState.target ?? ownerName);
  if (!name || name === PANEL_TARGET) return null;
  return controlNamed(name);
}

// A coordinate that is not a number, and a shape that lies wholly outside its control, said once
// per call (and per argument, or per control), since drawing runs every frame (drawShapes.js).
// resetScriptState clears it.
const drawWarned = new Set();
function drawSaid(key, said) {
  if (!said || drawWarned.has(key)) return;
  drawWarned.add(key);
  addScriptTrace('warn', '', `${said} This is said only the first time.`);
}
/** A shape's coordinate, read as drawShapes.js reads it, and said when it is not a number. */
function drawNum(memberId, name, value) {
  const { n, said } = drawNumber(memberId, name, value);
  drawSaid(`${memberId}\u0000${name}`, said);
  return n;
}

/** True, after saying so, when a shape's required argument is left out (drawShapes' drawMissing):
 *  it was drawn at 0, or with no text, in silence. */
function drawRejected(memberId, given) {
  const said = drawMissing(memberId, given);
  if (!said) return false;
  addScriptTrace('error', '', said);
  return true;
}

/** Append a command for `target`, with the style in force at this moment baked into it. `memberId`
 *  names the call, for saying when its shape lies wholly outside the control. */
function pushCommand(explicit, ownerName, command, memberId = null) {
  const control = drawTarget(explicit, ownerName);
  if (!control) {
    addScriptTrace('error', '',
      'ce.draw: no control to draw on. Attach the script to a control, or pass a target name.');
    return false;
  }
  const id = control._children.Core.id;
  // Clipped at the control's box, a shape wholly outside it shows nothing; under a transform, where
  // it lands is not known here, so nothing is said.
  if (memberId && !drawState.transform) {
    const t = control._children.Transform ?? {};
    const outside = outsideWords(memberId, commandBounds(command), { w: Number(t.width), h: Number(t.height) }, drawState.strokeWidth);
    drawSaid(`${id}\u0000${memberId}`, outside);
  }
  const list = drawCommands.get(id) ?? [];
  list.push({
    ...command,
    fill: drawState.fill, stroke: drawState.stroke, strokeWidth: drawState.strokeWidth,
    dash: drawState.dash, dashOffset: drawState.dashOffset,
    cap: drawState.cap, join: drawState.join,
    opacity: drawState.opacity, transform: drawState.transform,
    clip: drawState.clip, blend: drawState.blend,
  });
  drawCommands.set(id, list);
  // `list`, not `[...list]` (§49). Copying on every command made an append O(n) and a drawing O(n²):
  // 256 segments cost 21ms of array copying alone, more than a 60fps frame, before any rendering.
  // The overlay depends on `revision` rather than the array's identity so that this is safe.
  //
  // The remaining per-command cost is the store notification itself, and that is what batch()
  // removes — it cannot be removed implicitly, because dispatchEvents is async and "the end of the
  // draw pass" is not a moment this code can hold.
  if (drawBatchDepth > 0) drawBatchDirty.add(id);
  else setDrawing(id, list);
  return true;
}

// batch() suspends publishing, not recording: the commands still land in drawCommands as they are
// issued, so a script inside a batch sees exactly what a script outside one sees. Only the store
// notification is deferred, and only to the end of the block.
let drawBatchDepth = 0;
const drawBatchDirty = new Set();

function runDrawBatch(fn) {
  if (typeof fn !== 'function') {
    // Returned false in silence, and the drawing the script meant to batch was never done.
    addScriptTrace('error', '', `ce.draw.batch: fn is ${shownValue(fn)}, not a function, so nothing ran.`);
    return false;
  }
  drawBatchDepth += 1;
  try {
    fn();
  } catch (e) {
    addScriptTrace('error', '', String(e?.message ?? e));
  } finally {
    // finally, not catch-and-continue: a throwing block must not leave publishing suspended, or
    // every later draw in the panel silently stops appearing. Same rule noTransmit follows.
    drawBatchDepth -= 1;
    if (drawBatchDepth === 0) {
      for (const id of drawBatchDirty) setDrawing(id, drawCommands.get(id) ?? []);
      drawBatchDirty.clear();
    }
  }
  return true;
}

/* --- the bulk primitives (design doc §49) ------------------------------------------------------
 *
 * A grid was a loop of drawLine, and a loop was the expensive thing: n commands, n store
 * notifications, n SVG elements. These are ONE command and one element for the whole lot, which is
 * the difference between a step grid being affordable and being the reason a panel drops frames.
 *
 * `segments` carries disjoint line pairs and renders as a single <path> of M/L moves — grid() is
 * just the special case that computes a lattice, so both share one op and one renderer branch.
 */

function drawGridImpl(explicit, ownerName, opts) {
  const control = drawTarget(explicit, ownerName);
  if (!control) {
    addScriptTrace('error', '', 'ce.draw.grid: no control to draw on.');
    return false;
  }
  const transform = control._children?.Transform ?? {};
  const o = opts && typeof opts === 'object' ? opts : {};
  // The box is read as every shape's numbers are (drawShapes.js): one that is not a number is 0,
  // a width or height below 0 is 0, each said once. Both drew nothing, in silence.
  const x = drawNum('drawGrid', 'x', o.x);
  const y = drawNum('drawGrid', 'y', o.y);
  const w = o.width === undefined || o.width === null ? (Number(transform.width) || 0) - x : drawNum('drawGrid', 'width', o.width);
  const h = o.height === undefined || o.height === null ? (Number(transform.height) || 0) - y : drawNum('drawGrid', 'height', o.height);

  // Spacing OR counts, because both are the natural way to ask depending on what you know: a step
  // sequencer knows it has 16 columns, a ruler knows it wants a line every 10 pixels. A count wins
  // over a spacing given with it, and says so; a count or a spacing that cannot be used is ignored,
  // and said (a fraction of a column drew a grid with no closing line, a count of "x" nothing).
  const count = (name) => { const r = gridCount(name, o[name]); drawSaid(`drawGrid\u0000${name}`, r.said); return r.n; };
  const step = (name) => { const r = gridStep(name, o[name]); drawSaid(`drawGrid\u0000${name}`, r.said); return r.n; };
  const cols = count('columns');
  const rows = count('rows');
  const stepAcross = o.stepX !== undefined && o.stepX !== null ? 'stepX' : 'step';
  const stepDown = o.stepY !== undefined && o.stepY !== null ? 'stepY' : 'step';
  if (cols && o[stepAcross] !== undefined && o[stepAcross] !== null) {
    drawSaid(`drawGrid\u0000columns+${stepAcross}`, `ce.draw.grid: columns was given, so ${stepAcross} was ignored across.`);
  }
  if (rows && o[stepDown] !== undefined && o[stepDown] !== null) {
    drawSaid(`drawGrid\u0000rows+${stepDown}`, `ce.draw.grid: rows was given, so ${stepDown} was ignored down.`);
  }
  const stepX = cols ? w / cols : (step(stepAcross) ?? 0);
  const stepY = rows ? h / rows : (step(stepDown) ?? 0);

  if (!(stepX > 0) && !(stepY > 0)) {
    addScriptTrace('error', '',
      'ce.draw.grid: needs a spacing or a count — { step }, { stepX, stepY } or { columns, rows }.');
    return false;
  }

  const segments = [];
  // <= so the closing line is drawn: a 4-column grid over 100px has lines at 0, 25, 50, 75 AND 100,
  // and a grid missing its right edge looks like a bug in the panel rather than in the call.
  if (stepX > 0) for (let gx = x; gx <= x + w + 0.0001; gx += stepX) segments.push([gx, y, gx, y + h]);
  if (stepY > 0) for (let gy = y; gy <= y + h + 0.0001; gy += stepY) segments.push([x, gy, x + w, gy]);
  return pushCommand(explicit, ownerName, { op: 'segments', segments });
}

function drawLinesImpl(explicit, ownerName, value) {
  // An item that is not a segment is left out and said once (drawShapes.js): it was left out in
  // silence.
  const { segments, said } = segmentList(value);
  drawSaid('drawLines\u0000segments', said);
  if (!segments.length) {
    addScriptTrace('error', '',
      'ce.draw.lines: no segments. Pass a list of [x1, y1, x2, y2] — one command for all of them, '
      + 'which is the point of this over a loop of line().');
    return false;
  }
  return pushCommand(explicit, ownerName, { op: 'segments', segments });
}

// An item that is not a point is left out, a radius not above 0 is 1.5 and a tension outside 0 to
// 1 its nearest end, each said once (drawShapes.js): they were done without a word, and a tension
// that is not a number was NaN, which drew no curve.
function drawPointsImpl(explicit, ownerName, value, radius) {
  const { points, said } = pointList('drawPoints', value);
  drawSaid('drawPoints\u0000points', said);
  if (!points.length) {
    addScriptTrace('error', '', 'ce.draw.points: no points. Pass a list of [x, y].');
    return false;
  }
  const { r, said: radiusSaid } = pointRadius(radius);
  drawSaid('drawPoints\u0000radius', radiusSaid);
  return pushCommand(explicit, ownerName, { op: 'dots', points, r }, 'drawPoints');
}

function drawCurveImpl(explicit, ownerName, value, opts) {
  const { points, said } = pointList('drawCurve', value);
  drawSaid('drawCurve\u0000points', said);
  if (points.length < 2) {
    addScriptTrace('error', '', 'ce.draw.curve: needs at least two points.');
    return false;
  }
  // A curve was inexpressible before: you approximated it with straight segments, which meant a
  // loop, which was the expensive thing. `tension` 0 is a polyline and 1 is fully round.
  const { t: tension, said: tensionSaid } = curveTension(opts?.tension);
  drawSaid('drawCurve\u0000tension', tensionSaid);
  return pushCommand(explicit, ownerName, {
    op: 'curve', points, tension, closed: opts?.closed === true,
  }, 'drawCurve');
}

function drawPolygonImpl(explicit, ownerName, cx, cy, r, sides, opts) {
  if (drawRejected('drawPolygon', { cx, cy, radius: r, sides })) return false;
  // Fewer than three sides, a fraction or no number is three, or rounded, and said once
  // (drawShapes.js): each drew a triangle, or rounded, in silence. So is a rotation that is not a
  // number, which is 0.
  const { sides: n, said: sidesSaid } = polygonSides(sides);
  drawSaid('drawPolygon\u0000sides', sidesSaid);
  const radius = drawNum('drawPolygon', 'radius', r);
  const x = drawNum('drawPolygon', 'cx', cx);
  const y = drawNum('drawPolygon', 'cy', cy);
  // Rotation in the panel's drawing convention: degrees, 0 at twelve o'clock, clockwise — the same
  // one drawArc uses, so a polygon and an arc drawn at the same angle line up.
  const { n: rotation, said: rotationSaid } = drawOption('drawPolygon', 'rotation', opts?.rotation, 0);
  drawSaid('drawPolygon\u0000rotation', rotationSaid);
  const from = (rotation - 90) * (Math.PI / 180);
  const points = [];
  for (let i = 0; i < n; i += 1) {
    const a = from + (i * 2 * Math.PI) / n;
    points.push([x + Math.cos(a) * radius, y + Math.sin(a) * radius]);
  }
  // Emitted as an ordinary closed path — no new renderer branch needed for a shape that IS one.
  return pushCommand(explicit, ownerName, { op: 'path', points, closed: true }, 'drawPolygon');
}

/**
 * How wide a string will be, which nothing could ask before — so a box behind a label, a column of
 * right-aligned numbers or a truncation had no way to be worked out.
 *
 * Two fonts, two answers, and only one of them is exact. The PIXEL font is a grid: the width is
 * arithmetic and the answer is exact everywhere. A proportional font has to be MEASURED, which
 * means a canvas and therefore a browser — so with no measuring surface this reports and falls back
 * to an estimate rather than pretending. Panel view only either way, like everything in ce.draw.
 */
function drawMeasureImpl(text, opts) {
  // Text left out measured as "" without a word, and a size or a scale that could not be used was
  // the default in silence; each is said (drawShapes.js: textSize and pixelScale, as text and
  // pixelText say them).
  if (text === undefined || text === null) {
    addScriptTrace('error', '', 'ce.draw.measure: text was not given, so there is no result.');
    return undefined;
  }
  const str = String(text);
  const { size, said: sizeSaid } = textSize('drawMeasure', opts?.size);
  drawSaid('drawMeasure\u0000size', sizeSaid);
  if (opts?.pixel === true) {
    const { scale, said: scaleSaid } = pixelScale(opts?.scale, 'ce.draw.measure');
    drawSaid('drawMeasure\u0000scale', scaleSaid);
    // FONT_ADVANCE per character, minus the trailing gap: a string ends at its last lit column.
    return { width: str.length ? str.length * PIXEL_ADVANCE * scale - scale : 0,
             height: PIXEL_FONT_H * scale, exact: true };
  }
  const canvas = typeof document !== 'undefined' && typeof document.createElement === 'function'
    ? document.createElement('canvas') : null;
  const ctx = canvas?.getContext?.('2d');
  if (!ctx) {
    // 0.6em per character is the usual rule of thumb for a proportional face. Said to be an
    // estimate rather than returned as though it were a measurement.
    return { width: str.length * size * 0.6, height: size, exact: false };
  }
  ctx.font = `${size}px ${opts?.family || 'sans-serif'}`;
  return { width: ctx.measureText(str).width, height: size, exact: true };
}

/* --- ce.text: typography a script can reason about (design doc §46) ----------------------------
 *
 * Text.Font has 41 fields, Text.Multiline 11 and Text.Position around 40, and set() could already
 * write every one of them by path. So this module adds no reach — it adds the three things a bare
 * path write cannot do:
 *
 *  1. KNOW WHAT EXISTS. The font catalogue is a store the Properties panel reads and scripting
 *     could not. set("…Font.family", "Helvetca") stored the typo and fell back silently.
 *  2. KEEP THE INVARIANTS. weight/weightValue are a pair and the two halves are read by different
 *     consumers, so writing one desynchronises the editor from the render. See textStyle.js.
 *  3. MEASURE ITSELF. drawMeasure has to be handed a size and family; nothing could ask what a
 *     control's own text occupies in its own font, which is what any fit-to-box needs.
 *
 * Every write goes back out through setValue(), so intercepts, the transmit rule and the host all
 * apply exactly as they do to a hand-written set() — this is a better-behaved caller, not a back
 * door. And every write verb reports by READING BACK, the §44 rule: the answer is whether the
 * control now holds what was asked, not whether a store call was made.
 */

/** The font catalogue as descriptors, from the app's own availableFonts store. */
/** A lookup's name given, or why not (ce.image's and ce.text's reviews): a name left out found
    nothing without a word, where a name that matches nothing is a query with no answer. */
function lookupNamed(verb, what, name) {
  if (name !== undefined && name !== null && String(name).trim() !== '') return true;
  addScriptTrace('error', '', `${verb}: no ${what} was given, so there is no answer.`);
  return false;
}

function textCatalogue() {
  return fontCatalogue(get(availableFonts), currentDocumentFonts());
}

/** The Font node of a control, or nothing when it has no Text section (a Knob has none). */
function textFontNode(name) {
  const font = getValue(`${name}.Text.Font`);
  return font && typeof font === 'object' ? font : null;
}

/** Report the same way for every ce.text verb that needs a Text section and did not find one. */
function textNeedsTextSection(verb, name) {
  // A name that is no control was told it had no Text section (ce.text's review).
  addScriptTrace('error', '', findControlByName(name)
    ? `ce.text.${verb}("${name}"): this control has no Text section, so it has no typography. `
      + 'ce.panel.info() reports the type; a Knob or a Meter draws its own labels.'
    : `ce.text.${verb}("${name}"): this panel has no control by that name.`);
  return undefined;
}

/** Apply one planned write. `variationAxes` carries { tag, value } and lands on the sub-key. */
function textApplyWrite(name, write) {
  const base = `${name}.Text.${write.section}`;
  if (write.field === 'variationAxes') {
    const path = `${base}.variationAxes.${write.value.tag}`;
    setValue(path, write.value.value);
    return Number(getValue(path)) === Number(write.value.value);
  }
  const path = `${base}.${write.field}`;
  setValue(path, write.value);
  const now = getValue(path);
  // Numbers cross the boundary as numbers but may have been clamped by the model; comparing
  // loosely would call a clamp a success. Comparing the READ-BACK is the point of doing it.
  return typeof write.value === 'number' ? Number(now) === write.value : now === write.value;
}

/* --- ce.image: the layers, and which of them will survive an export (design doc §50) ------------
 *
 * The fields were always writable by path — a Label has 102 of them, a Knob 864 — and nothing in the
 * API named one. What this adds is the same three things ce.text added for fonts: knowing what
 * exists, keeping the invariants, and being honest about portability. See imageLayers.js for why
 * each of those is more than a wrapper here.
 */

function imageCatalogue() {
  return assetCatalogue(get(storedIcons), get(documentIcons));
}

/** The layer for a name, reporting rather than guessing when the name is not one. */
function resolveImageLayer(verb, target, id) {
  const layer = imageLayer(id);
  if (layer) return layer;
  addScriptTrace('error', '',
    `ce.image.${verb}("${target}", "${id}"): no such layer. One of: ${IMAGE_LAYER_IDS.join(', ')}.`);
  return null;
}

/** The layer's node on a control, or nothing when the control has no such section. */
function imageNode(name, layer) {
  const node = getValue(`${name}.${layer.node}`);
  return node && typeof node === 'object' ? node : null;
}

function imageNeedsNode(verb, name, layer) {
  // A name that is no control was told it had no such layer (ce.image's review).
  addScriptTrace('error', '', findControlByName(name)
    ? `ce.image.${verb}("${name}"): this control has no ${layer.node}, so it has no ${layer.label}. `
      + 'ce.panel.info() reports the type.'
    : `ce.image.${verb}("${name}"): this panel has no control by that name.`);
  return undefined;
}

/** Apply one planned write and report whether the node now holds it. */
function imageApplyWrite(name, layer, write) {
  const path = write.raw
    ? `${name}.${layer.node}.${write.raw}`
    : `${name}.${layer.node}.${write.field}`;
  setValue(path, write.value);
  const now = getValue(path);
  return typeof write.value === 'number' ? Number(now) === write.value : now === write.value;
}

/** Background layers composite in `layerOrder`, so a layer that is enabled but absent from the order
 *  is set up and invisible. Adding it is part of turning it on. */
function ensureLayerOrder(name, layer) {
  if (layer.activation !== 'layer') return;
  const path = `${name}.${layer.node}.layerOrder`;
  const order = getValue(path);
  if (!Array.isArray(order)) return;
  if (order.includes(layer.prefix)) return;
  setValue(path, [...order, layer.prefix]);
}

/** ce.text.style and ce.image.set read their own option keys (image.set in any case, which the
 *  shared check does not), but an unknown one refuses the whole call as it does everywhere else:
 *  they used to drop the unknown key alone and apply the rest. True after saying so. */
function refusedForUnknownOptions(path, memberId, refused, unknownReason) {
  const keys = refused.filter((p) => p.reason === unknownReason).map((p) => p.option).sort();
  if (!keys.length) return false;
  const names = (MEMBER_BY_ID[memberId].params ?? []).find((p) => Array.isArray(p.fields))?.fields.map((f) => f.name) ?? [];
  addScriptTrace('error', '', unknownOptionsMessage(path, { parent: '', keys, shape: { names, sections: false } }));
  return true;
}

function imageSetImpl(target, src, opts) {
  const name = String(target ?? '');
  const layer = resolveImageLayer('set', name, opts?.layer);
  if (!layer) return false;
  if (!imageNode(name, layer)) return imageNeedsNode('set', name, layer) ?? false;

  const { writes, refused, warnings } = planImage(layer, src, opts, { tintColour: (tint) => {
    const read = panelColour(tint);
    // The refusal line adds its own full stop.
    return read.why ? { reason: `${read.why}. ${read.advice.replace(/\.$/, '')}` } : { colour: read.colour };
  } });
  if (refusedForUnknownOptions('ce.image.set', 'imageSet', refused, 'not an image option')) return false;
  for (const problem of refused) {
    addScriptTrace('error', '',
      `ce.image.set("${name}"): ${problem.option} refused — ${problem.reason}.`);
  }
  for (const warning of warnings) addScriptTrace('warn', '', `ce.image.set("${name}"): ${warning}`);
  // Neither a picture nor an option: it did nothing without a word (ce.image's review).
  if (!writes.length && !refused.length) {
    addScriptTrace('error', '', `ce.image.set("${name}"): no picture and no option were given, so nothing was set.`);
  }
  if (!writes.length) return false;

  let all = true;
  for (const write of writes) if (!imageApplyWrite(name, layer, write)) all = false;
  if (src) ensureLayerOrder(name, layer);

  // A file path renders nothing until the host has read it, so ask — otherwise a script setting a
  // path source sees a blank layer and no reason for it.
  if (src && sourceKind(src) === 'file') loadFile(String(src));

  return all && refused.length === 0;
}

function imageClearImpl(target, layerId) {
  const name = String(target ?? '');
  const layer = resolveImageLayer('clear', name, layerId);
  if (!layer) return false;
  if (!imageNode(name, layer)) return imageNeedsNode('clear', name, layer) ?? false;

  let all = true;
  for (const write of planClear(layer)) if (!imageApplyWrite(name, layer, write)) all = false;
  return all;
}

function imageReadImpl(target, layerId) {
  const name = String(target ?? '');
  const layer = resolveImageLayer('read', name, layerId);
  if (!layer) return undefined;
  const node = imageNode(name, layer);
  if (!node) return imageNeedsNode('read', name, layer);

  const out = {};
  for (const field of layer.fields) {
    const key = `${layer.prefix}${field}`;
    // Lower-cased first letter, so a script reads { src, fit, opacity } rather than { Src, Fit }.
    out[field.charAt(0).toLowerCase() + field.slice(1)] = node[key];
  }
  const src = String(node[`${layer.prefix}Src`] ?? '');
  return {
    ...out,
    layer: layer.id,
    // The honest part, and the reason this verb reports more than the fields: `active` is whether the
    // layer will actually paint, which for an exclusive Text layer depends on `mode` and not on
    // `Enabled` at all.
    active: layer.activation === 'mode'
      ? String(node.mode ?? 'solid') === layer.mode
      : (node[`${layer.prefix}Enabled`] === true && node[`${layer.prefix}Muted`] !== true),
    source: sourceKind(src),
    portable: isPortableSource(src),
  };
}

function imageEmbedImpl(target, layerId) {
  const name = String(target ?? '');
  const layer = resolveImageLayer('embed', name, layerId);
  if (!layer) return false;
  const node = imageNode(name, layer);
  if (!node) return imageNeedsNode('embed', name, layer) ?? false;

  const src = String(node[`${layer.prefix}Src`] ?? '');
  if (!src) {
    addScriptTrace('error', '', `ce.image.embed("${name}"): the ${layer.label} has no source.`);
    return false;
  }
  if (isPortableSource(src)) return true;      // already a data URL; embedding is a no-op, not a failure

  // A file path only has a data URL once the host has read it. Nothing here can wait — the read is
  // asynchronous — so this reports what it did rather than pretending: it asks for the file and says
  // it is not ready yet, and the same call succeeds once the cache holds it.
  const cached = get(fileCache)[src];
  if (!cached || !String(cached).startsWith('data:')) {
    loadFile(src);
    addScriptTrace('error', '',
      `ce.image.embed("${name}"): "${src}" is not loaded yet. The host reads files asynchronously — `
      + 'the read has been requested, so calling this again once it lands will embed it.');
    return false;
  }
  return imageApplyWrite(name, layer, { field: `${layer.prefix}Src`, value: cached });
}

/** Icon section — a different shape from the fill layers: a reference into the icon library rather
 *  than a source, with its own size/fit/tint fields. */
function imageIconImpl(target, idOrName, opts) {
  const name = String(target ?? '');
  const icon = getValue(`${name}.Icon`);
  if (!icon || typeof icon !== 'object') {
    addScriptTrace('error', '',
      `ce.image.icon("${name}"): this control has no Icon section.`);
    return false;
  }
  const asset = findAsset(imageCatalogue(), idOrName);
  if (!asset) {
    addScriptTrace('error', '',
      `ce.image.icon("${name}", "${idOrName}"): no such asset in the icon library. `
      + 'ce.image.assets() lists them.');
    return false;
  }

  // Both id AND name, because the renderer resolves by id first and falls back to matching the name —
  // writing only one leaves the fallback deciding, and a coincidental name match looks like success.
  let all = true;
  for (const [field, value] of [['assetId', asset.id], ['name', asset.name], ['source', 'library']]) {
    setValue(`${name}.Icon.${field}`, value);
    if (getValue(`${name}.Icon.${field}`) !== value) all = false;
  }
  let refused = false;
  for (const [key, field] of [['size', 'size'], ['fit', 'fit'], ['tint', 'tint'],
    ['opacity', 'opacity'], ['rotation', 'rotation']]) {
    if (opts?.[key] === undefined) continue;
    // A tint the panel cannot read used to be stored with its "#" taken off, so "#000" became "000",
    // which the renderer reads as no tint at all. Read as ce.image.set reads one: a short form is
    // written out ("#000" is stored as "000000"), and anything else is refused; the other options
    // are still applied, and the call answers false.
    let tint;
    if (key === 'tint') {
      const read = panelColour(opts.tint);
      if (read.why) {
        addScriptTrace('error', '', `ce.image.icon("${name}"): tint refused — ${read.why}. ${read.advice}`);
        refused = true;
        continue;
      }
      tint = read.colour;
    }
    // A fit is one of the Icon section's two words, in any case (utils/wordLists.js): the renderer
    // reads "cover" and takes anything else as "contain", so "Cover" was drawn contained.
    const value = key === 'tint' ? tint.replace(/^#/, '')
      : key === 'fit' ? (listWord(['contain', 'cover'], opts.fit) ?? opts.fit) : opts[key];
    setValue(`${name}.Icon.${field}`, value);
    // The other half of the pair planImage warns about: ce.image.set's opacity runs to 100, and
    // here 50 is clamped to fully solid by the renderer. Applied as written, with the reading, and
    // the number out of 100 only when that lands on this scale (150 out of 100 is still above 1).
    const amount = Number(value);
    if (key === 'opacity' && amount > 1) {
      addScriptTrace('warn', '', `ce.image.icon("${name}"): opacity runs from 0 to 1 here, so ${amount} is `
        + `fully solid.${percentHint(amount)}`);
    }
  }
  // A control showing text only draws no icon; the same rule as the editor's icon pickers
  // (utils/iconLayout.js), so the icon this call asked for is seen.
  const mode = layoutModeForIcon({ _children: {
    ContentLayout: getValue(`${name}.ContentLayout`),
    Text: { content: getValue(`${name}.Text.content`) },
  } });
  if (mode) setValue(`${name}.ContentLayout.mode`, mode);
  return all && !refused;
}

function textStyleImpl(target, opts) {
  const name = String(target ?? '');
  const font = textFontNode(name);
  if (!font) return textNeedsTextSection('style', name) ?? false;

  const catalogue = textCatalogue();
  const { writes, refused } = planStyle(opts, {
    descriptor: findFont(catalogue, font.family), catalogue,
  });
  if (refusedForUnknownOptions('ce.text.style', 'textStyle', refused, 'not a style option')) return false;

  for (const problem of refused) {
    addScriptTrace('error', '',
      `ce.text.style("${name}"): ${problem.option} refused — ${problem.reason}.`);
  }
  if (!writes.length) return false;

  let all = true;
  for (const write of writes) if (!textApplyWrite(name, write)) all = false;
  // Refusing one option and honouring another is a partial success, and partial is not true. A
  // script that checks the return gets "the control does not hold everything you asked for".
  return all && refused.length === 0;
}

const textAxisWarned = new Set();   // the controls and axes that have said a number was kept within the axis; resetScriptState clears it
function textAxisImpl(target, tag, value) {
  const name = String(target ?? '');
  const font = textFontNode(name);
  if (!font) return textNeedsTextSection('axis', name) ?? false;

  const descriptor = findFont(textCatalogue(), font.family);
  const { writes, refused, axis, given, used } = planAxis(descriptor, tag, value);
  for (const problem of refused) addScriptTrace('error', '', axisRefusalWords(name, font.family, problem.option, problem.reason));
  if (!writes.length) return false;
  // A number the axis does not reach is kept within it, and said once per control and axis: it was
  // kept within it without a word (textStyle.js).
  const key = `${name}\u0000${axis.tag}`;
  if (given !== used && !textAxisWarned.has(key)) {
    textAxisWarned.add(key);
    addScriptTrace('warn', '', `${axisClampWords(name, descriptor.family, axis, given, used)} This is said only the first time.`);
  }
  let all = true;
  for (const write of writes) if (!textApplyWrite(name, write)) all = false;
  return all;
}

/** Which Text child a read name belongs to, so read("L", "lineHeight") works without the script
 *  having to know that line height is Multiline's and size is Font's. */
const TEXT_READ_SECTIONS = ['Font', 'Multiline', 'Position'];

function textReadImpl(target, field) {
  const name = String(target ?? '');
  const font = textFontNode(name);
  if (!font) return textNeedsTextSection('read', name);

  const clean = (node) => (node && typeof node === 'object'
    ? Object.fromEntries(Object.entries(node).filter(([k]) => !k.startsWith('_')))
    : {});

  if (field === undefined || field === null || field === '') {
    // The whole resolved state in one call, which is what makes typography snapshot/restore-able
    // without naming ninety fields. `content` and the resolved weight ride along because both are
    // things a script asks for immediately and neither is a Font field.
    return {
      content: String(getValue(`${name}.Text.content`) ?? ''),
      resolvedWeight: resolvedWeight(font),
      font: clean(font),
      multiline: clean(getValue(`${name}.Text.Multiline`)),
      position: clean(getValue(`${name}.Text.Position`)),
    };
  }

  const wanted = String(field);
  for (const section of TEXT_READ_SECTIONS) {
    const node = section === 'Font' ? font : getValue(`${name}.Text.${section}`);
    if (!node || typeof node !== 'object') continue;
    const key = Object.keys(node).find((k) => k.toLowerCase() === wanted.toLowerCase());
    if (key !== undefined && !key.startsWith('_')) return node[key];
  }
  if (wanted.toLowerCase() === 'content') return String(getValue(`${name}.Text.content`) ?? '');

  addScriptTrace('error', '',
    `ce.text.read("${name}", "${field}"): no such text field. ce.text.read("${name}") returns `
    + 'everything, grouped as font / multiline / position.');
  return undefined;
}

/**
 * Measure a control's own text, in its own font, through the renderer's own layout.
 *
 * This calls buildBlockTextLayout — the same function CanvasControl lays text out with — so the
 * answer is the layout that will actually be painted rather than a second implementation that
 * agrees with it until one of them changes. `exact` is honest for the same reason drawMeasure's is:
 * the layout measures on an offscreen canvas, and with no document to make one it falls back to a
 * per-glyph estimate.
 */
function textMeasureImpl(target, text) {
  const name = String(target ?? '');
  const font = textFontNode(name);
  if (!font) return textNeedsTextSection('measure', name);

  const multiline = getValue(`${name}.Text.Multiline`) ?? {};
  const info = getValue(`${name}.Transform`) ?? {};
  const position = getValue(`${name}.Text.Position`) ?? {};
  const content = text === undefined || text === null
    ? String(getValue(`${name}.Text.content`) ?? '')
    : String(text);

  const padX = Number(position.paddingLeft ?? 0) + Number(position.paddingRight ?? 0);
  const width = Math.max(0, Number(info.width ?? 0) - padX);

  const layout = buildBlockTextLayout(content, {
    fontSection: font,
    family: font.family || 'Arial',
    maxWidth: width,
    wrapMode: String(multiline.wrapMode ?? 'word'),
    paragraphMode: String(multiline.paragraphMode ?? 'normal'),
    overflowMode: String(multiline.overflowMode ?? 'clip'),
    maxLines: Number(multiline.maxLines ?? 0),
    lineHeightMultiplier: Number(multiline.lineHeight ?? 1.2),
  });

  return {
    width: layout.width,
    height: layout.height,
    lines: Array.isArray(layout.lines) ? layout.lines.length : 0,
    truncated: layout.truncated === true,
    exact: typeof document !== 'undefined' && typeof document.createElement === 'function',
  };
}

/**
 * Shrink Font.size until the text fits the control's box, and report what it settled on.
 *
 * Text.Multiline.fitMode = "shrink" already scales text down at PAINT time — but it is a paint-time
 * scale: the stored size never changes, so nothing can ask what size it ended up at and nothing
 * else can be aligned to the result. This writes the size, which is the difference between "it
 * looks right" and "it is a number other layout can use".
 *
 * A descending search over integer sizes rather than a binary one: the sizes are integers, the
 * range is small, and measuring is cheap next to being subtly off by a pixel at the boundary.
 */
function textFitImpl(target, opts) {
  const name = String(target ?? '');
  const font = textFontNode(name);
  if (!font) return textNeedsTextSection('fit', name);

  const min = Math.max(1, Number(opts?.min ?? 6));
  const max = Math.max(min, Number(opts?.max ?? Number(font.size ?? 12)));
  const info = getValue(`${name}.Transform`) ?? {};
  const position = getValue(`${name}.Text.Position`) ?? {};
  const boxW = Math.max(0, Number(info.width ?? 0)
    - Number(position.paddingLeft ?? 0) - Number(position.paddingRight ?? 0));
  const boxH = Math.max(0, Number(info.height ?? 0)
    - Number(position.paddingTop ?? 0) - Number(position.paddingBottom ?? 0));

  if (boxW <= 0 || boxH <= 0) {
    addScriptTrace('error', '',
      `ce.text.fit("${name}"): the control has no box to fit into (width ${info.width ?? 0} x `
      + `height ${info.height ?? 0} less padding), so there is no size to choose.`);
    return undefined;
  }

  const multiline = getValue(`${name}.Text.Multiline`) ?? {};
  const content = opts?.text === undefined || opts?.text === null
    ? String(getValue(`${name}.Text.content`) ?? '')
    : String(opts.text);
  const started = Number(font.size ?? 12);

  // Measure at each candidate by handing the layout the REAL Font node with only the size swapped:
  // letter spacing, word spacing and script mode all change the answer, and re-deriving them here
  // would be the second implementation this verb exists to avoid.
  const fitsAt = (size) => {
    const probe = buildBlockTextLayout(content, {
      fontSection: { ...font, size },
      family: font.family || 'Arial',
      maxWidth: boxW,
      wrapMode: String(multiline.wrapMode ?? 'word'),
      overflowMode: String(multiline.overflowMode ?? 'clip'),
      maxLines: Number(multiline.maxLines ?? 0),
      lineHeightMultiplier: Number(multiline.lineHeight ?? 1.2),
    });
    return probe.width <= boxW + 0.5 && probe.height <= boxH + 0.5;
  };

  let chosen = Math.round(min);
  let fitted = false;
  for (let size = Math.round(max); size >= Math.round(min); size -= 1) {
    if (fitsAt(size)) { chosen = size; fitted = true; break; }
  }

  setValue(`${name}.Text.Font.size`, chosen);
  return {
    size: Number(getValue(`${name}.Text.Font.size`)),
    fits: fitted,
    changed: Number(getValue(`${name}.Text.Font.size`)) !== started,
    exact: typeof document !== 'undefined' && typeof document.createElement === 'function',
  };
}

function drawClearImpl(explicit, ownerName) {
  const control = drawTarget(explicit, ownerName);
  if (!control) {
    // Said, as every shape says it: a name the panel does not have, and no control at all,
    // returned false in silence.
    const wanted = explicit != null && String(explicit) !== '' ? String(explicit) : '';
    addScriptTrace('error', '', wanted
      ? `ce.draw.clear: no control named "${wanted}".`
      : 'ce.draw.clear: no control to draw on. Attach the script to a control, or pass a target name.');
    return false;
  }
  const id = control._children.Core.id;
  drawCommands.delete(id);
  clearDrawing(id);
  return true;
}

/**
 * Run one control's onDraw. The style resets first — a draw must not inherit the colours the last
 * one happened to leave set, or a drawing changes depending on what ran before it.
 */
function runDrawPass(control) {
  const core = control?._children?.Core;
  if (!core?.id) return false;

  const transform = control._children?.Transform ?? {};
  drawState.target = core.name;
  drawState.fill = null;
  drawState.stroke = null;
  drawState.strokeWidth = 1;
  // …and everything the style grew in §41. A draw that inherited the dash or the transform the last
  // one happened to leave set would look different depending on what ran before it, which is the
  // whole reason this reset exists.
  drawState.dash = null;
  drawState.dashOffset = null;
  drawState.cap = null;
  drawState.join = null;
  drawState.opacity = null;
  drawState.transform = null;
  drawState.clip = null;
  drawState.blend = null;
  // …and the save() stack, which is style state too: a pass that saved and never restored would
  // otherwise leak a growing stack into every later pass, and a stray restore() in the next frame
  // would pop something from the last one.
  drawStateStack.length = 0;

  dispatchEvents([{
    event: 'onDraw',
    controlName: core.name,
    payload: { target: core.name, width: Number(transform.width) || 0, height: Number(transform.height) || 0 },
  }]);
  return true;
}

function drawRedrawImpl(explicit, ownerName) {
  const control = drawTarget(explicit, ownerName);
  if (!control) {
    // A name the panel does not have was "no control to redraw", which reads as the script's
    // attachment being wrong when its spelling is.
    const wanted = explicit != null && String(explicit) !== '' ? String(explicit) : '';
    addScriptTrace('error', '', wanted
      ? `ce.draw.redraw: no control named "${wanted}".`
      : 'ce.draw.redraw(): no control to redraw. Attach the script to a control, or pass a target name.');
    return false;
  }
  return runDrawPass(control);
}

/** What a control currently has drawn on it. Exported for the renderer and the tests. */
export function drawCommandsFor(controlName) {
  const control = controlNamed(controlName);
  return control ? (drawCommands.get(control._children.Core.id) ?? []) : [];
}

/** Forget every drawing — panel teardown, or a switch to another panel. */
export function clearAllDrawings() {
  drawCommands.clear();
  clearDrawing(null);
  // Reset the style too. It is module-level (draws are not re-entrant), so without this a colour
  // set on one panel is still in force on the next — a drawing that changes depending on what ran
  // before it is exactly the kind of order-dependence immediate mode is supposed to remove.
  drawState.target = null;
  drawState.fill = null;
  drawState.stroke = null;
  drawState.strokeWidth = 1;
  // …and everything the style grew in §41. A draw that inherited the dash or the transform the last
  // one happened to leave set would look different depending on what ran before it, which is the
  // whole reason this reset exists.
  drawState.dash = null;
  drawState.cap = null;
  drawState.join = null;
  drawState.opacity = null;
  drawState.transform = null;
}

// @module ce.panel
/* ------------------------------------------------------------------- ce.panel structure */
// Panels that build themselves: ask the device what it has, then generate a control per thing you
// found. The one capability the options UI structurally cannot provide.
//
// PANEL VIEW ONLY, and not by choice — creating a control needs a renderer, and there is none with
// the window shut. The C++ engines stub these with the same explaining stubs every webview-only
// verb gets, and `onPanelBuild` is declared webview-only so they are never reached there.
//
// THE IDEMPOTENCE RULE, which is what makes this safe to ship: everything a script creates carries
// `Core.generatedBy`, and every generated control is removed before onPanelBuild runs. So a build
// always starts from the authored panel, running it twice cannot double the layout, and the panel
// the author saves is still the panel the author drew. `serializePanel` strips them for the same
// reason — a generated control is a product of the script, not a part of the document.
//
// The cost of that rule, stated rather than discovered: a generated control is NOT in the exported
// parameter list and cannot be DAW-automated. It is driven from a script, or not at all.

const GENERATED_KEY = 'generatedBy';

/** Mutate the active panel's control tree through the same store update the editor uses. */
function updateControls(fn) {
  const panel = activePanel();
  if (!panel) { addScriptTrace('error', '', 'ce.panel: no active panel to build.'); return false; }
  const next = fn(panel.controls ?? []);
  if (next == null) return false;
  if (host) { panel.controls = next; return true; }        // player: the host owns the document
  // activePanel() points at the batch snapshot while a callback is running. Keep structural reads
  // in that callback current as well, so create-then-arrange and reorder-then-read stay synchronous.
  const foldsPendingWrites = documentWriteBatch?.panel === panel;
  if (foldsPendingWrites) panel.controls = next;
  updatePanel(panel.id, { controls: next });
  if (foldsPendingWrites) {
    // The structural publication already carried the draft's pending property values. Rebase so
    // the batch does not publish those same patches again, and later reads start from that update.
    documentWriteBatch.patches.clear();
    documentWriteBatch.drafts.clear();
    documentWriteBatch.panel = null;
  }
  return true;
}

function allControls() {
  return flatControls(activePanel()?.controls ?? []);
}

function controlNamed(name) {
  const wanted = String(name ?? '').toLowerCase();
  if (!wanted) return null;
  return allControls().find((c) => String(c?._children?.Core?.name ?? '').toLowerCase() === wanted)
    ?? allControls().find((c) => String(c?._children?.Core?.id ?? '') === String(name))
    ?? null;
}

/** A name nothing else is using, so a generated control never collides with an authored one. */
function uniqueControlName(base) {
  const taken = new Set(allControls().map((c) => String(c?._children?.Core?.name ?? '').toLowerCase()));
  const root = sanitizeControlName(String(base ?? 'control'));
  if (!taken.has(root.toLowerCase())) return root;
  for (let i = 2; i < 10000; i++) {
    const candidate = `${root}${i}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${root}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The section overrides in `props` that `control` has a section for, [[section, values]], with
 * every colour in them read as set() reads a section written whole: a short form written out ("red"
 * is stored as "#FF0000"), and the script's own table left as it wrote it. Null when one of them is
 * a colour the panel cannot read, or names a section `control` does not have, or is not a table:
 * each has been reported, after `call`, and nothing is to be made. A colour used to be stored as
 * written and painted white, and the other two were passed over without a word.
 */
function sectionOverrides(control, props, call, outcome) {
  const sections = [];
  let refused = false;
  for (const [section, values] of Object.entries(props ?? {})) {
    // A section name the option check let through, as a section of some control, that this control
    // does not have, or one given as anything but a table of its settings: it used to be passed over
    // without a word, so the control was made without what the script asked of it. set() refuses a
    // section a control lacks; create and clone refuse the call, as for an option they do not take.
    if (SECTION_NAMES.has(section) && !control._children[section]) {
      addScriptTrace('error', '', `${call}: "${section}" is not a section this control has, so ${outcome}. `
        + 'ce.panel.info() lists the sections a control has.');
      refused = true;
      continue;
    }
    if (!control._children[section]) continue;
    if (typeof values !== 'object' || values == null) {
      addScriptTrace('error', '', `${call}: "${section}" takes a table of its settings, not ${shownValue(values)}, `
        + `so ${outcome}.`);
      refused = true;
      continue;
    }
    const colours = colourWrites(call, outcome, control, section, values, wholePath);
    if (colours) sections.push([section, colours.value]);
    else refused = true;
  }
  return refused ? null : sections;
}

/** Apply the flat convenience props (name/x/y/width/height) plus the section overrides. `call`
 *  begins the warning for a key no section of that shape has (mergeSettings). */
function applyControlProps(control, props, sections, scriptId, call) {
  const core = control._children.Core;
  const transform = control._children.Transform;
  if (props.name != null) core.name = String(props.name);
  // A place or a size that is not a number, or a size not above 0, leaves the control's own, and is
  // said: it was dropped without a word.
  for (const [prop, key] of [['x', 'x'], ['y', 'y'], ['width', 'width'], ['height', 'height']]) {
    const value = props[prop];
    if (value == null) continue;
    const n = Number(value);
    const size = prop === 'width' || prop === 'height';
    if (typeof value === 'boolean' || !Number.isFinite(n)) {
      panelSaid(`${call}: the ${prop} ${JSON.stringify(value)} is not a number, so its own ${transform[key] ?? 0} was kept.`);
    } else if (size && n <= 0) {
      panelSaid(`${call}: the ${prop} ${n} is not above 0, so its own ${transform[key] ?? 0} was kept.`);
    } else {
      transform[key] = n;
    }
  }
  // Section overrides: { Behavior: { min: 0, max: 127 } } and friends, merged not replaced, so a
  // script setting one field does not wipe the rest of the section.
  for (const [section, values] of sections) {
    control._children[section] = mergeSettings(control._children[section], values, (path) => addScriptTrace('warn', '',
      `${call}: "${section}${path}" is a new property on a section with a fixed shape. `
      + 'It was written, but nothing reads it — check the spelling.'));
  }
  core[GENERATED_KEY] = scriptId || 'script';
  return control;
}

/**
 * `values` merged into `node`, a section or one of its children, as a new node: each key is a field
 * written over the one there, except a key that names a child of `node` with a table as its value,
 * which is merged into that child the same way, at every depth, keeping the child's other fields.
 * { Background = { Fill = { colour = "red" } } } changes Background's Fill and nothing else of it.
 *
 * A child is one in `node`'s `_children`, or one set() would make there from a template on the way
 * down a path (the section's template's children, and the optional effect targets: controlTreeUtils
 * getDefaultChildTemplate), made from that template first. A Fill given beside Background's
 * `_children` was a field nothing reads, so its colour, read since create began reading colours, had
 * no effect. `_children` given whole is merged entry by entry for the same reason, rather than
 * replacing every child with the few it names.
 *
 * Children and fields are matched without regard to case, as a set() path is and as the colour
 * check before this reads them, and written under the document's own spelling: `fill` is Fill and
 * `Colour` is colour. Matched exactly, a `fill` had its colour read and was then stored as a field
 * beside Fill that nothing reads. A key that is neither a child nor a field `node` has is written,
 * as set() writes one, and on a typed node (one with a `_type`, as every section and child the app
 * makes is) `fresh(path)` is told, for set()'s warning by set()'s own test: nothing reads it. `at` is
 * where `node` is below the section, for that path.
 */
function mergeSettings(node, values, fresh = () => {}, at = '') {
  const merged = { ...node };
  const intoChild = (key, value) => {
    const child = isPlainTable(value) ? childToMerge(merged, key) : undefined;
    if (!child) return false;
    merged._children = { ...merged._children, [child.name]: mergeSettings(child.node, value, fresh, `${at}.${child.name}`) };
    return true;
  };
  for (const [key, value] of Object.entries(values)) {
    if (key === '_children' && isPlainTable(value)) {
      for (const [name, child] of Object.entries(value)) {
        if (!intoChild(name, child)) merged._children = { ...merged._children, [name]: child };
      }
    } else if (!intoChild(key, value)) {
      const field = key === '_type' ? key : sameKey(merged, key, (k) => k !== '_children' && k !== '_type');
      if (field === undefined && typeof merged._type === 'string') fresh(`${at}.${key}`);
      merged[field ?? key] = value;
    }
  }
  return merged;
}

/** `object`'s own key spelled like `name` in any case, among those `keep` accepts, or undefined. */
function sameKey(object, name, keep = () => true) {
  if (!isPlainTable(object)) return undefined;
  const lower = String(name).toLowerCase();
  return Object.keys(object).find((k) => keep(k) && k.toLowerCase() === lower);
}

/** The child of `node` called `name` in any case, as `{ name, node }` under its own spelling: the
 *  one there, or a copy of the template set() would make it from (a Fill's effect targets are made
 *  with the `_children` they go in); or undefined. */
function childToMerge(node, name) {
  const children = node?._children;
  const own = sameKey(children, name);
  if (own !== undefined) return isPlainTable(children[own]) ? { name: own, node: children[own] } : undefined;
  const type = node?._type;
  const made = sameKey(SECTION_DEFAULTS[type]?._children, name) ?? MADE_CHILDREN[type]?.[String(name).toLowerCase()];
  const template = made !== undefined ? getDefaultChildTemplate(type, made) : undefined;
  return isPlainTable(template) ? { name: made, node: deepClone(template) } : undefined;
}

const isPlainTable = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Why a `parent` given to create or clone cannot hold the control, or null when it can or none was given. */
function containerRefusal(parentName, call, outcome) {
  if (parentName == null || parentName === '') return null;
  const parent = controlNamed(parentName);
  if (!parent) return `${call}: no control named "${parentName}" to put it in, so ${outcome}.`;
  if (!isContainerControl(parent)) return `${call}: "${parentName}" is not a container (it has no Children section), so ${outcome}.`;
  return null;
}

function panelCreateImpl(type, props, scriptId) {
  // The type in any case, as every word from a list the app defines is read: "knob" was refused.
  const given = String(type ?? '').trim();
  const typeName = typeNamed(given);
  if (!typeName) {
    addScriptTrace('error', '', given
      ? `ce.panel.create("${given}"): no such component type. ce.panel.types() lists them.`
      : 'ce.panel.create: no type was given. ce.panel.types() lists them.');
    return null;
  }
  // A container that is not there, or is not a container, refuses the call: the control was made at
  // the top level with an error said, and an error means the call did nothing.
  const parentRefusal = containerRefusal(props?.parent, `ce.panel.create("${typeName}")`, 'nothing was created');
  if (parentRefusal) { addScriptTrace('error', '', parentRefusal); return null; }
  let control;
  try { control = createControl(typeName); }
  catch (e) { addScriptTrace('error', '', `ce.panel.create("${typeName}"): ${e?.message ?? e}`); return null; }

  // The new control's own sections type its props, so a colour in them is read before anything is
  // made: one the panel cannot read means no control, and the panel is as it was.
  const sections = sectionOverrides(control, props, `ce.panel.create("${typeName}")`, 'nothing was created');
  if (!sections) return null;
  applyControlProps(control, props ?? {}, sections, scriptId, `ce.panel.create("${typeName}")`);
  control._children.Core.name = uniqueControlName(control._children.Core.name);

  const parentName = props?.parent ? String(props.parent) : null;
  const parent = parentName ? controlNamed(parentName) : null;
  const parentId = parent && isContainerControl(parent) ? parent._children.Core.id : null;

  return updateControls((controls) => insertControlIntoTree(controls, parentId, control))
    ? control._children.Core.name
    : null;
}

function panelCloneImpl(name, props, scriptId) {
  if (name == null || name === '') { addScriptTrace('error', '', 'ce.panel.clone: no control was named, so nothing was copied.'); return null; }
  const source = controlNamed(name);
  if (!source) { addScriptTrace('error', '', `ce.panel.clone: no control named "${name}".`); return null; }
  // A container given that is not one refuses the call, as create's does: the copy went to the top
  // level without a word.
  const parentRefusal = containerRefusal(props?.parent, `ce.panel.clone("${name}")`, 'nothing was copied');
  if (parentRefusal) { addScriptTrace('error', '', parentRefusal); return null; }

  const copy = remintControlIds(source);
  // Only what the script passes is read: the source's own colours are stored already.
  const sections = sectionOverrides(copy, props, `ce.panel.clone("${name}")`, 'nothing was copied');
  if (!sections) return null;
  applyControlProps(copy, props ?? {}, sections, scriptId, `ce.panel.clone("${name}")`);
  if (props?.name == null) copy._children.Core.name = `${source._children.Core.name}_copy`;
  copy._children.Core.name = uniqueControlName(copy._children.Core.name);
  // A clone lands beside its source by default: in the same container, not at the top level.
  const parentName = props?.parent != null ? String(props.parent) : null;
  const parent = parentName ? controlNamed(parentName)
                            : findParentOfControl(activePanel()?.controls ?? [], source._children.Core.id);
  const parentId = parent && isContainerControl(parent) ? parent._children.Core.id : null;

  return updateControls((controls) => insertControlIntoTree(controls, parentId, copy))
    ? copy._children.Core.name
    : null;
}

function panelDestroyImpl(name) {
  if (name == null || name === '') { addScriptTrace('error', '', 'ce.panel.destroy: no control was named, so nothing was removed.'); return false; }
  const control = controlNamed(name);
  if (!control) return false;
  const id = control._children.Core.id;
  // removeControlFromTree returns { controls, removed } — the node comes back so a caller that is
  // MOVING rather than deleting can re-insert the real subtree instead of a copy of it.
  return updateControls((controls) => removeControlFromTree(controls, id).controls);
}

function panelParentImpl(name, containerName) {
  const control = controlNamed(name);
  if (!control) { addScriptTrace('error', '', `ce.panel.parent: no control named "${name}".`); return false; }

  let parentId = null;
  if (containerName != null && String(containerName) !== '') {
    const parent = controlNamed(containerName);
    if (!parent) { addScriptTrace('error', '', `ce.panel.parent: no control named "${containerName}".`); return false; }
    if (!isContainerControl(parent)) {
      addScriptTrace('error', '',
        `ce.panel.parent: "${containerName}" is not a container — only a control with a Children section can hold one.`);
      return false;
    }
    if (parent._children.Core.id === control._children.Core.id) {
      addScriptTrace('error', '', 'ce.panel.parent: a control cannot contain itself.');
      return false;
    }
    // …nor can it be moved inside its own subtree, which would detach both from the panel.
    if (flatControls([control]).some((c) => c._children.Core.id === parent._children.Core.id)) {
      addScriptTrace('error', '',
        `ce.panel.parent: "${containerName}" is inside "${name}", so moving one into the other would detach both.`);
      return false;
    }
    parentId = parent._children.Core.id;
  }

  const id = control._children.Core.id;
  return updateControls((controls) => {
    const { controls: without, removed } = removeControlFromTree(controls, id);
    // Re-insert the node that came OUT, not a copy of the one we looked up: the subtree keeps its
    // ids, so anything already addressing a child by name still resolves after the move.
    return removed ? insertControlIntoTree(without, parentId, removed) : null;
  });
}

function controlSummary(control, controls) {
  const core = control?._children?.Core ?? {};
  const transform = control?._children?.Transform ?? {};
  const parent = findParentOfControl(controls, core.id);
  return {
    name: core.name ?? '', id: core.id ?? '', type: core.controlType ?? '',
    x: Number(transform.x) || 0, y: Number(transform.y) || 0,
    width: Number(transform.width) || 0, height: Number(transform.height) || 0,
    parent: parent?._children?.Core?.name ?? null,
    generated: core[GENERATED_KEY] != null,
  };
}

// What ce.panel.find filters on, and what each takes. A key it did not know used to filter nothing,
// so { Type = "Knob" }, { kind = "Knob" } and { generated = "true" } all answered with every control
// on the panel, which a script then went on to change.
const FIND_FILTERS = { name: 'string', type: 'string', generated: 'boolean', parent: 'string' };
const FIND_TAKES = { string: 'text', boolean: 'true or false' };

/** How a find query's value reads in its refusal. A panel verb, so it runs in this runtime only,
 *  and can tell a table from a list where shownValue, held to the preludes' words, cannot. */
function shownQueryValue(v) {
  if (typeof v === 'string') return `"${v}"`;
  if (v === undefined || v === null) return 'nothing';
  if (typeof v === 'object') return Array.isArray(v) ? 'a list' : 'a table';
  return String(v);
}

/** Why a find query cannot be answered, or null. */
function findQueryProblem(query) {
  const filters = `Its filters are: ${Object.keys(FIND_FILTERS).join(', ')}.`;
  if (query == null || typeof query === 'string') return null;
  // A Lua list, { "Knob" }, arrives as { 1: "Knob" }: it is a list, not a filter called "1".
  const queryKeys = isOptionsTable(query) ? Object.keys(query) : [];
  const listQuery = queryKeys.length > 0 && queryKeys.every((key) => LIST_KEY.test(key));
  if (!isOptionsTable(query) || listQuery) {
    return `the query is ${listQuery ? 'a list' : shownQueryValue(query)}, not part of a name or a table of filters, so nothing was found. ${filters}`;
  }
  const unknown = Object.keys(query).filter((key) => !(key in FIND_FILTERS));
  if (unknown.length) {
    const quoted = andList(unknown.map((key) => `"${key}"`));
    return `${quoted} ${unknown.length === 1 ? 'is not one of its filters' : 'are not among its filters'}, `
      + `so nothing was found. ${filters}`;
  }
  for (const [key, type] of Object.entries(FIND_FILTERS)) {
    const v = query[key];
    if (v === undefined || v === null || typeof v === type) continue;
    return `${key} takes ${FIND_TAKES[type]}, not ${shownQueryValue(v)}, so nothing was found.`;
  }
  // A type is one of the types, in any case: "knob" found nothing, and a type that is none found
  // nothing without a word.
  if (typeof query.type === 'string' && !typeNamed(query.type)) {
    return `"${query.type}" is not a control type, so nothing was found. ce.panel.types() lists them.`;
  }
  return null;
}

/** A control type spelled in any case, under its own spelling, or undefined. */
function typeNamed(given) {
  const wanted = String(given ?? '').trim().toLowerCase();
  return Object.keys(COMPONENT_TYPES).find((t) => t.toLowerCase() === wanted);
}

function panelFindImpl(query) {
  const controls = activePanel()?.controls ?? [];
  const problem = findQueryProblem(query);
  if (problem) {
    addScriptTrace('error', '', `ce.panel.find: ${problem}`);
    return [];
  }
  const q = typeof query === 'string' ? { name: query } : (query ?? {});
  return flatControls(controls)
    .map((c) => ({ control: c, info: controlSummary(c, controls) }))
    .filter(({ info }) => {
      if (q.name != null && !info.name.toLowerCase().includes(String(q.name).toLowerCase())) return false;
      if (q.type != null && info.type !== typeNamed(q.type)) return false;
      if (q.generated != null && info.generated !== (q.generated === true)) return false;
      if (q.parent != null && String(info.parent ?? '').toLowerCase() !== String(q.parent).trim().toLowerCase()) return false;
      return true;
    })
    .map(({ info }) => info.name);
}

function panelInfoImpl(name) {
  if (name == null || name === '') { addScriptTrace('error', '', 'ce.panel.info: no control was named.'); return null; }
  const control = controlNamed(name);
  if (!control) return null;
  return controlSummary(control, activePanel()?.controls ?? []);
}

/* ------------------------------------------------------ ce.panel: arranging what is there (§42)
 * stores/alignment.js is twenty-seven operations — align, distribute, match size, order, flip,
 * tidy into a grid, arrange in a circle — every one of them on the canvas context menu and not one
 * of them reachable from a script. A script that built sixteen pads computed every coordinate by
 * hand, and got tidy's reading-order sort or circle's bounding-box centring subtly different.
 *
 * They were all written against the editor's SELECTION, which is not a thing a script should touch.
 * So the maths moved into pure functions there, and these verbs take a list of NAMES and call the
 * same ones. Six collapsed verbs rather than twenty-seven members: align(names, "left") beats
 * alignLeft(names), and it is the shape ce.time.division and ce.music.degreeChord already use.
 *
 * Transforms are gathered in PANEL space — Transform.x inside a container is container-relative,
 * and aligning two controls in different containers by their local x is aligning nothing — and
 * written back through the same offset, which is exactly what the editor does.
 */

/** Transforms for a list of names, in PANEL space, skipping names that are not controls. */
function panelTransforms(names, verb) {
  // One name is a list of one: a text was read letter by letter, each "no control named".
  const list = Array.isArray(names) ? names
    : (names == null ? [] : (typeof names === 'object' ? Object.values(names) : [names]));
  const controls = activePanel()?.controls ?? [];
  const out = [];
  for (const raw of list) {
    const control = controlNamed(raw);
    if (!control) {
      addScriptTrace('error', '', `ce.panel.${verb}: no control named "${raw}".`);
      continue;
    }
    const id = control._children?.Core?.id;
    const t = control._children?.Transform ?? {};
    const offset = controlPanelOffset(controls, id);
    out.push({
      id,
      name: control._children?.Core?.name ?? '',
      x: (Number(t.x) || 0) + offset.x,
      y: (Number(t.y) || 0) + offset.y,
      width: Number(t.width) || 0,
      height: Number(t.height) || 0,
      offsetX: offset.x,
      offsetY: offset.y,
    });
  }
  return out;
}

/**
 * Write a { id: patch } map back, converting panel-space coordinates to each control's own frame —
 * which is the step that makes aligning two controls in different containers mean anything.
 *
 * One tree rewrite rather than a property write per control, and deliberately: an arrangement is
 * ONE change to the document. Writing forty properties one at a time would be forty store updates,
 * forty re-renders, and — with the history debounce running underneath — an unpredictable number of
 * undo steps for a single "tidy these".
 *
 * Returns how many controls moved, the same "say what you did" contract set() follows.
 */
function panelApplyPatches(transforms, patches) {
  const byId = new Map(transforms.map((t) => [t.id, t]));
  const resolved = new Map();
  for (const [id, patch] of patches) {
    const t = byId.get(id);
    if (!t || !patch) continue;
    const local = {};
    for (const [path, value] of Object.entries(patch)) {
      const field = path.replace(/^Transform\./, '');
      local[field] = (field === 'x' || field === 'y')
        ? Math.round(value - (field === 'x' ? (t.offsetX ?? 0) : (t.offsetY ?? 0)))
        : value;
    }
    resolved.set(id, local);
  }
  if (!resolved.size) return 0;
  // The arrangement verbs rewrite Transform for a whole list at once, without going through
  // setValue, so they report their own.
  for (const id of resolved.keys()) noteScriptTouchedControl(id);

  const apply = (list) => list.map((c) => {
    const id = c?._children?.Core?.id;
    const patch = resolved.get(id);
    const kids = c?._children?.Children?._children;
    let next = c;
    if (patch) {
      next = { ...next, _children: { ...next._children,
        Transform: { ...(next._children?.Transform ?? {}), ...patch } } };
    }
    if (kids && typeof kids === 'object') {
      const ordered = apply(Object.values(kids));
      const rebuilt = {};
      for (const child of ordered) rebuilt[child._children.Core.name] = child;
      next = { ...next, _children: { ...next._children,
        Children: { ...next._children.Children, _children: rebuilt } } };
    }
    return next;
  });

  return updateControls((controls) => apply(controls)) ? resolved.size : 0;
}

// The words each arrangement verb takes, and its sentence for one it does not, are layoutWords.js's,
// which the Values tab reads too; what each verb then moves, and what of its options it refuses, is
// arrangementPlan's (utils/arrangement.js), which the Values tab draws.
function panelArrange(memberId, transforms, which, opts) {
  const plan = arrangementPlan(memberId, transforms, which, opts);
  if (plan.refused) {
    addScriptTrace('error', '', plan.refused);
    return 0;
  }
  for (const said of plan.said ?? []) panelSaid(said);
  return panelApplyPatches(transforms, plan.patches);
}

// An option or a prop used as its default, said once (the owner's word on ce.panel); resetScriptState
// clears it.
const panelWarned = new Set();
function panelSaid(said) {
  if (!said || panelWarned.has(said)) return;
  panelWarned.add(said);
  addScriptTrace('warn', '', `${said} This is said only the first time.`);
}

function panelAlignImpl(names, edge, opts) {
  const { which, refused } = layoutWord('panelAlign', edge);
  if (refused) {
    addScriptTrace('error', '', refused);
    return 0;
  }
  return panelArrange('panelAlign', panelTransforms(names, 'align'), which, opts);
}

function panelDistributeImpl(names, what, opts) {
  const { which, refused } = layoutWord('panelDistribute', what);
  if (refused) {
    addScriptTrace('error', '', refused);
    return 0;
  }
  return panelArrange('panelDistribute', panelTransforms(names, 'distribute'), which, opts);
}

function panelMatchImpl(names, what, opts) {
  const { which, refused } = layoutWord('panelMatch', what);
  if (refused) {
    addScriptTrace('error', '', refused);
    return 0;
  }
  return panelArrange('panelMatch', panelTransforms(names, 'match'), which, opts);
}

function panelGridImpl(names, opts) {
  return panelArrange('panelGrid', panelTransforms(names, 'grid'), null, opts);
}

function panelCircleImpl(names, opts) {
  return panelArrange('panelCircle', panelTransforms(names, 'circle'), null, opts);
}

function panelFlipImpl(names, axis) {
  const { which, refused } = layoutWord('panelFlip', axis);
  if (refused) {
    addScriptTrace('error', '', refused);
    return 0;
  }
  return panelArrange('panelFlip', panelTransforms(names, 'flip'), which, undefined);
}

/**
 * Where a control IS, in PANEL coordinates — which Transform.x is not, once anything is inside a
 * container. With several names it is the bounding box of the lot, which is what "how big is this
 * group" means.
 */
function panelRectImpl(names) {
  const list = Array.isArray(names) ? names : [names];
  const transforms = panelTransforms(list, 'rect');
  if (!transforms.length) return undefined;
  if (transforms.length === 1) {
    const t = transforms[0];
    return { x: t.x, y: t.y, width: t.width, height: t.height,
             right: t.x + t.width, bottom: t.y + t.height };
  }
  const b = boundsOf(transforms);
  return { ...b, right: b.x + b.width, bottom: b.y + b.height };
}

/**
 * Z-order. `where` is front | forward | backward | back.
 *
 * Order is DOCUMENT order, not a property, so this rewrites the sibling list rather than setting a
 * value — which is why set() could never do it. Controls are reordered within their own parent:
 * moving something to the front of a container it is not in is not a thing.
 */
function panelOrderImpl(names, where) {
  const { which, refused } = layoutWord('panelOrder', where);
  if (refused) {
    addScriptTrace('error', '', refused);
    return 0;
  }
  const wanted = new Set(panelTransforms(names, 'order').map((t) => t.id));
  if (!wanted.size) {
    addScriptTrace('error', '', 'ce.panel.order: no control was named, so nothing was moved.');
    return 0;
  }

  const reorder = (siblings) => {
    const mine = siblings.filter((c) => wanted.has(c?._children?.Core?.id));
    if (!mine.length) return siblings;
    const rest = siblings.filter((c) => !wanted.has(c?._children?.Core?.id));
    // Later in the list paints later, so "front" is the END. Getting this backwards is the classic
    // way a bring-to-front sends something behind everything.
    if (which === 'front') return [...rest, ...mine];
    if (which === 'back') return [...mine, ...rest];
    const arr = [...siblings];
    if (which === 'forward') {
      for (let i = arr.length - 2; i >= 0; i -= 1) {
        if (wanted.has(arr[i]?._children?.Core?.id) && !wanted.has(arr[i + 1]?._children?.Core?.id)) {
          [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
        }
      }
    } else {
      for (let i = 1; i < arr.length; i += 1) {
        if (wanted.has(arr[i]?._children?.Core?.id) && !wanted.has(arr[i - 1]?._children?.Core?.id)) {
          [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
        }
      }
    }
    return arr;
  };

  // Every level of the tree, because a selection can span containers and each one's siblings are
  // its own list.
  const walk = (list) => reorder(list).map((c) => {
    const kids = c?._children?.Children?._children;
    if (!kids || typeof kids !== 'object') return c;
    const ordered = walk(Object.values(kids));
    const rebuilt = {};
    for (const child of ordered) rebuilt[child._children.Core.name] = child;
    return { ...c, _children: { ...c._children, Children: { ...c._children.Children, _children: rebuilt } } };
  });

  return updateControls((controls) => walk(controls)) ? wanted.size : 0;
}

/**
 * batch(fn) — everything `fn` does is ONE undo step.
 *
 * The history store debounces its snapshots, which groups a drag nicely and leaves a script that
 * creates forty controls landing as an unpredictable number of steps. pushSnapshot() flushes on
 * demand, so bracketing the work gives exactly one — and a script that builds a page deserves to be
 * undone as "build the page", not forty times.
 *
 * The flush happens whatever the callback does, including throwing: a half-built panel that cannot
 * be undone is worse than a half-built panel.
 */
/**
 * ce.panel.keep — promote what this preview did into the authored document.
 *
 * Preview is a rehearsal (stores/previewRehearsal.js): the panel is photographed when preview
 * starts and put back when it stops, so a script's writes are undone with everything else. This is
 * the one way to say "no, that one was real" — it writes today\'s value into the photograph, so
 * putting the photograph back preserves it.
 *
 * With no path it keeps the whole run, which is the batch-edit shape: run a recolouring script,
 * call keep(), stop preview, save. A control the script CREATED is still cleared on stop either
 * way — the next build mints it again, and a kept copy would sit beside the new one for ever.
 */
function panelKeepImpl(path) {
  if (!isRehearsing()) {
    addScriptTrace('log', '',
      'ce.panel.keep(): nothing to keep — the panel is not being previewed, so it is not being '
      + 'rehearsed either. In the exported plugin there is no rehearsal at all.');
    return false;
  }

  if (path === undefined || path === null || String(path).trim() === '') {
    keepAllInRehearsal();
    addScriptTrace('log', '', 'ce.panel.keep(): keeping everything this preview changed.');
    return true;
  }

  const { name, segs } = splitScriptPath(String(path));
  const control = findControlByName(name);
  if (!control) {
    addScriptTrace('error', '', `ce.panel.keep("${path}"): control "${name}" not found on the active panel`);
    return false;
  }
  const generatedBy = control?._children?.Core?.generatedBy;
  if (generatedBy) {
    addScriptTrace('error', '',
      `ce.panel.keep("${path}"): "${name}" was created by a script, and a created control cannot be `
      + 'kept — the next run builds it again, so the kept copy would sit beside the new one every '
      + 'time. Create it in onPanelBuild and let it be rebuilt, or add it in the editor.');
    return false;
  }

  const modelPath = resolveModelPath(control, segs);
  const value = valueAtPath(control, modelPath);
  const kept = keepPropertyInRehearsal(control?._children?.Core?.id, modelPath, value);
  if (!kept) {
    addScriptTrace('error', '',
      `ce.panel.keep("${path}"): "${modelPath}" does not lead to a property on "${name}" that can be `
      + 'kept. Only a single stored property can be — a live value is not one, since it is session '
      + 'state rather than part of the document.');
  }
  return kept;
}

function panelBatchImpl(scriptId, fn) {
  if (typeof fn !== 'function') {
    addScriptTrace('error', scriptId ?? '', 'ce.panel.batch(fn) needs a function to run — nothing was done.');
    return false;
  }
  if (host) {                             // the player has no history to group
    const result = fn();
    if (result && typeof result.then === 'function') {
      addScriptTrace('warn', scriptId ?? '',
        'ce.panel.batch(fn) is synchronous; writes after an await are not part of the batch.');
      result.catch((error) => reportScriptError(scriptId ?? '', error));
    }
    return true;
  }
  pushSnapshot();                          // close whatever came before
  let result;
  try { result = withDocumentWriteBatch(fn); } finally { pushSnapshot(); }
  if (result && typeof result.then === 'function') {
    addScriptTrace('warn', scriptId ?? '',
      'ce.panel.batch(fn) is synchronous; writes after an await are not part of the batch.');
    result.catch((error) => reportScriptError(scriptId ?? '', error));
  }
  return true;
}

/* ------------------------------------------------- ce.panel: the collections inside a control */
// The Properties panel can ADD TO and REMOVE FROM eleven sections of a control. `Children` is one
// of them and ce.panel.create/destroy already covers it; these four cover the other ten, which
// until now a script could only reach by writing a whole node as one value and could not remove
// from at all — removeControlNode has existed the whole time and nothing script-facing called it.
//
// One verb family rather than ten, for the reason deviceQuery is one primitive rather than four:
// the sections differ in what an entry MEANS, not in how it is added, listed or dropped.
const COLLECTION_SECTIONS = [
  'States', 'Bindings', 'Animations', 'Parts',
  'ValueChannels', 'Behaviors', 'HitZones', 'Generators', 'Links', 'Variants',
];

// A partial spec is completed from these, so declaring a state is one line rather than a
// hand-written node. Only shapes the app itself defines are here; a section without one takes the
// spec as given, with `_type` filled in.
const COLLECTION_TEMPLATES = {
  States: (name) => ({
    _type: 'State', name, group: 'interaction', description: '', enabled: true,
    when: {}, patches: { component: {}, parts: {} },
  }),
  // An animation is completed the way the Animation tab makes one, so a script and the tab produce
  // the same thing: a transition from any state into hover and back, 120ms
  // (animationModel.newAnimationShape — panelCollections.test.js holds the two together; it is
  // restated rather than imported because the model would pull the whole component runtime into
  // this file). A spec with `kind = "keyframes"` gets a keyframe animation instead: playing all the
  // time, on the control, over the frames the spec gives. The trigger merges one level, so
  // `{ trigger = { to = { "pressed" } } }` keeps the rest of the default.
  Animations: (name, given) => (String(given?.kind ?? '') === 'keyframes'
    ? {
      _type: 'Animation', name, enabled: true, kind: 'keyframes',
      trigger: { type: 'always' }, targets: [{ path: 'Transform' }], frames: [],
      duration: 600, delay: 0, easing: 'inOutQuad',
    }
    : {
      _type: 'Animation', name, enabled: true, kind: 'transition',
      trigger: { type: 'stateChange', from: ['*'], to: ['hover'], reverse: true },
      targets: [], duration: 120, delay: 0, easing: 'outQuad',
    }),
};

/* What define takes in a spec, section by section.
 *
 * A spec key no entry of the section has was stored as written and read by nothing:
 * define("k", "States", "Warn", { wen = { hover = true } }) made a state with no condition, which is
 * a state that always applies, and { durration = 400 } made a 120 ms animation. So a key the section
 * does not take refuses the whole call, as an unknown option refuses any other (applyOptionChecks):
 * nothing is defined, define answers false, and the console names every such key, sorted, and lists
 * what the section takes, in the same words.
 *
 * What a section takes is read off the entry the app makes for it, so a field added there is a
 * field define accepts: the templates above for a state and an animation (both kinds), the entry
 * baselines the saved format holds bindings, grab areas, value channels and behaviours against
 * (stores/documentEntries.js) together with the functions that make a new one, and the editors'
 * own Add for a part, a generator, a link and a variant (utils/customComponentFactory.js). An
 * entry's `_type` is always taken and never listed: it is how an entry says what it is.
 *
 * `extra` is what the readers read beyond those, each because a new entry has no reason to carry
 * it: an option that only one mode or kind uses, an older spelling still read, or something only
 * the app's own generated entries carry. Each is named with the reader that reads it.
 *
 * `nested` names the fields whose own keys are checked too, one level down, from the template's
 * value: a state's patches holds two maps, by name. Every other value is a script's to fill (a
 * state's `when`, a binding's enumMap, a part's sections), as an option's value is elsewhere.
 *
 * A key is matched exactly, capitals included, where the section and the entry name are matched as
 * paths are: the key is stored as written and read by its exact name, so { When = … } would sit
 * beside an empty `when`. */
const DEFINE_SPECS = {
  States: {
    templates: [COLLECTION_TEMPLATES.States('')],
    // The compound condition evaluateState reads beside `when` (utils/interactionRuntime.js).
    extra: ['rule'],
    nested: ['patches'],
  },
  Animations: {
    templates: [COLLECTION_TEMPLATES.Animations('', {}), COLLECTION_TEMPLATES.Animations('', { kind: 'keyframes' })],
    // A keyframe animation's playing (utils/keyframeAnimation.js readKeyframes, keyframePlayer.js),
    // and the curve of the "custom" easing and the feel of "spring" (utils/easing.js readEasing).
    // The Animation tab writes all six.
    extra: ['iterations', 'direction', 'loop', 'hold', 'bezier', 'spring'],
  },
  Bindings: {
    templates: [ENTRY_BASELINES.Bindings],
    // mapMode "format" and "template" (utils/interactionRuntime.js resolveBindingValue); the app's
    // own readouts are format bindings (utils/customComponentFactory.js).
    extra: ['multiplier', 'offset', 'precision', 'prefix', 'suffix', 'template'],
  },
  Parts: {
    templates: [createPartNode('')],
    // What the slider family's renderer reads off a part, and the control-set designs write
    // (editor/SliderFamilyRenderer.svelte), and the marks of a generated part and of one detached
    // from its generator (utils/customComponentMaterializer.js, the designer surface).
    extra: ['shadow', 'glow', 'sheen', 'slot', 'inset', 'grooveColour', 'plateColour',
      'generated', 'detachedFromGenerator', 'locked'],
  },
  ValueChannels: {
    // An array channel's size, items and itemFields come from its own maker.
    templates: [ENTRY_BASELINES.ValueChannels, createValueChannel(''), createArrayChannel('', { itemFields: {} })],
    // An enum channel's choices, and `constraint`, the older spelling of constraints, still read
    // in its place (utils/customComponentInteraction.js).
    extra: ['values', 'options', 'constraint'],
  },
  Behaviors: {
    templates: [ENTRY_BASELINES.Behaviors, createBehaviorModule('')],
    // How an XY or rotary drag feels and where its centre is, set in the Behaviors editor; the
    // second channel of an XY behaviour, in both its spellings; and the slider part a behaviour
    // drives (utils/customComponentInteraction.js).
    extra: ['combine', 'invertX', 'invertY', 'weightX', 'weightY', 'increaseAngle', 'dragSensitivity',
      'centerX', 'centerY', 'targetValueChannelY', 'targetYValueChannel', 'part'],
  },
  HitZones: {
    templates: [ENTRY_BASELINES.HitZones, createHitZone('', { payload: {} })],
    // The older spellings of the X and Y channels, still read in their place; the probe position a
    // zone without a payload is tried at (utils/customComponentInteraction.js); and the marks of a
    // generated zone and of one detached from its generator (utils/customComponentMaterializer.js).
    extra: ['targetXValueChannel', 'targetYValueChannel', 'probeNormalized', 'probeYNormalized',
      'generated', 'detachedFromGenerator'],
  },
  Generators: {
    templates: [createGenerator('')],
    // A new generator draws ticks; each other type reads its own (utils/customComponentMaterializer.js),
    // and the app's starters write them (utils/customComponentFactory.js). `rect` is bounds' older
    // spelling, `scrollChannel` valueSource's and `size` ledSize's, each still read in its place.
    extra: ['zIndex', 'bounds', 'rect', 'targetValueChannel', 'targetValueChannelY', 'targetYValueChannel',
      'valueSource', 'scrollChannel', 'activationMode', 'labels', 'values', 'min', 'max', 'precision',
      'suffix', 'baseNote', 'startAngle', 'endAngle', 'radius', 'gap', 'fontSize', 'ledSize', 'size',
      'minBarHeight', 'colour', 'activeColour', 'inactiveColour', 'activeBorderColour',
      'inactiveBorderColour', 'inactiveOpacity', 'assetName'],
  },
  Links: {
    templates: [createLink('')],
    // A new link is a map; each other type reads its own, `map`, `offset`, `whenTrue` and `whenFalse`
    // being older spellings of cases, amount, trueValue and falseValue still read in their place
    // (utils/customComponentInteraction.js applyCustomLinks). A route to another control's port
    // names it, in either spelling, and carries what it was made from
    // (utils/panelCustomComponentLinks.js createPanelCustomRouteLink).
    extra: ['value', 'amount', 'offset', 'cases', 'map', 'inputMin', 'inputMax', 'outputMin', 'outputMax',
      'min', 'max', 'clamp', 'round', 'invert', 'trueValue', 'falseValue', 'whenTrue', 'whenFalse',
      'targetControlId', 'targetComponentId', 'targetPort', 'targetInput', 'routeMeta'],
  },
  Variants: {
    templates: [createVariant('')],
    extra: [],
  },
};

/** Each section's spec as the check of option keys reads it (unknownOptionKeys): the names in the
 *  templates' order, then the extras, and the nested ones from the template's own value. */
const DEFINE_SPEC_SHAPES = Object.fromEntries(Object.entries(DEFINE_SPECS).map(([section, spec]) => {
  const names = [...new Set([...spec.templates.flatMap((t) => Object.keys(t)), ...spec.extra])]
    .filter((key) => key !== '_type');
  const nested = {};
  for (const field of spec.nested ?? []) {
    const inner = spec.templates.find((t) => isOptionsTable(t[field]))?.[field];
    nested[field] = { names: Object.keys(inner ?? {}), nested: {}, sections: false };
  }
  return [section, { names, nested, sections: false }];
}));

/** The console's lines for a spec holding keys its section does not take, or none. */
function defineSpecProblems(call, section, spec) {
  const keys = Object.fromEntries(Object.entries(spec).filter(([key]) => key !== '_type'));
  return unknownOptionKeys(keys, DEFINE_SPEC_SHAPES[section]).map((group) => unknownOptionsMessage(call, group));
}

/** For the tests: what define takes in a spec, by section, in the order a refusal lists it. */
export function defineSpecFieldsForTesting() {
  return Object.fromEntries(Object.entries(DEFINE_SPEC_SHAPES).map(([section, shape]) => [section, [...shape.names]]));
}

/** Resolve (control, section) with the section name matched case-insensitively, as paths are. */
function collectionNode(controlName, section, verb) {
  const control = controlNamed(controlName);
  if (!control) { addScriptTrace('error', '', `ce.panel.${verb}: no control named "${controlName}".`); return null; }
  const wanted = String(section ?? '').toLowerCase();
  const key = COLLECTION_SECTIONS.find((s) => s.toLowerCase() === wanted);
  if (!key) {
    addScriptTrace('error', '',
      `ce.panel.${verb}: "${section}" is not a collection section. The ones a script can add to are `
      + `${COLLECTION_SECTIONS.join(', ')} — a control is added with ce.panel.create instead.`);
    return null;
  }
  return { control, key, node: control._children?.[key] ?? null };
}

/** entries(control, section) — the names in a collection, in document order. */
function panelEntriesImpl(controlName, section) {
  const found = collectionNode(controlName, section, 'entries');
  if (!found) return [];
  return Object.keys(found.node?._children ?? {});
}

/** entry(control, section, name) — one entry, or nil. Matched case-insensitively, as paths are. */
function panelEntryImpl(controlName, section, name) {
  const found = collectionNode(controlName, section, 'entry');
  if (!found) return null;
  const kids = found.node?._children ?? {};
  const wanted = String(name ?? '').toLowerCase();
  const key = Object.keys(kids).find((k) => k.toLowerCase() === wanted);
  return key == null ? null : kids[key];
}

/**
 * define(control, section, name, spec) — create an entry, or replace one that is there.
 *
 * The spec is MERGED over the section's template rather than used as-is, so
 * `define("k", "States", "Held", { when = { pressed = true } })` produces a state that
 * actually works. Hand-writing `_type`, `patches.component` and `patches.parts` every time is how
 * a verb like this ends up unused.
 */
function panelDefineImpl(controlName, section, name, spec) {
  const found = collectionNode(controlName, section, 'define');
  if (!found) return false;
  const key = String(name ?? '').trim();
  if (!key) { addScriptTrace('error', '', 'ce.panel.define(control, section, name, spec): a name is required'); return false; }
  if (!found.node) {
    addScriptTrace('error', '', `ce.panel.define: "${controlName}" has no ${found.key} section.`);
    return false;
  }

  const given = spec && typeof spec === 'object' && !Array.isArray(spec) ? spec : {};
  const problems = defineSpecProblems(`ce.panel.define("${controlName}", "${found.key}", "${key}")`, found.key, given);
  if (problems.length) {
    for (const line of problems) addScriptTrace('error', '', line);
    return false;
  }
  const template = COLLECTION_TEMPLATES[found.key]?.(key, given) ?? { _type: found.key.replace(/s$/, '') };
  const entry = { ...template, ...given, name: given.name ?? key };
  // One level of merge for the nested shapes a template carries, so a spec that names only
  // `patches.component` does not drop `patches.parts`.
  for (const field of Object.keys(template)) {
    const t = template[field];
    const g = given[field];
    if (t && typeof t === 'object' && !Array.isArray(t) && g && typeof g === 'object' && !Array.isArray(g)) {
      entry[field] = { ...t, ...g };
    }
  }

  writeControlProperty(found.control, `${found.key}.${key}`, entry);
  addScriptTrace('log', '', `ce.panel.define ${controlName}.${found.key}.${key}`);
  return true;
}

/** undefine(control, section, name) — returns whether there was one, so "already gone" reads
    differently from "removed". */
function panelUndefineImpl(controlName, section, name) {
  const found = collectionNode(controlName, section, 'undefine');
  if (!found) return false;
  const kids = found.node?._children ?? {};
  const wanted = String(name ?? '').toLowerCase();
  const key = Object.keys(kids).find((k) => k.toLowerCase() === wanted);
  if (key == null) return false;

  if (host) delete kids[key];                                        // player: the host owns the document
  else removeControlNode(found.control._children.Core.id, `${found.key}.${key}`);
  addScriptTrace('log', '', `ce.panel.undefine ${controlName}.${found.key}.${key}`);
  return true;
}

/**
 * patch(control, state, patch [, part]) — merge entries into a state's patch map.
 *
 * This verb exists because the addressing model cannot express what it addresses. A patch map's
 * KEYS are themselves dotted paths — `{ "Background.Fill.colour": "FFFF0000" }` — so
 * `set("k.States.Hover.patches.component.Background.Fill.colour", …)` walks off the end of the
 * model looking for three sections that are one key. `set` can only replace the whole map, which
 * means "make this one thing red when hovered" requires knowing everything else the state already
 * changes.
 *
 * MERGE, never replace, and no way to spell "remove this key": a nil-valued key is simply absent
 * from a Lua table, so a delete-by-nil convention would be unwritable in one of the five languages.
 * Dropping keys is `set()` on the whole map, which already works.
 */
function panelPatchImpl(controlName, stateName, patch, part) {
  const found = collectionNode(controlName, 'States', 'patch');
  if (!found) return 0;
  const kids = found.node?._children ?? {};
  const wanted = String(stateName ?? '').toLowerCase();
  const key = Object.keys(kids).find((k) => k.toLowerCase() === wanted);
  if (key == null) {
    addScriptTrace('error', '',
      `ce.panel.patch: "${controlName}" has no state called "${stateName}". `
      + `It has ${Object.keys(kids).join(', ') || 'none'} — ce.panel.define creates one.`);
    return 0;
  }
  const entries = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : null;
  if (!entries) { addScriptTrace('error', '', 'ce.panel.patch(control, state, patch): patch must be a table of path -> value'); return 0; }

  // A colour is read as set() reads it: a short form is written out ("red" is stored as "#FF0000"),
  // and one the panel cannot read is refused, and the whole patch with it. Asked before the loop
  // below writes into the state, so a refused patch leaves the state as it was. Each key is a path
  // on the control, or on the part the patch is for.
  const patchRoot = part == null || part === ''
    ? found.control : found.control?._children?.Parts?._children?.[String(part)];
  let refusedColour = false;
  const written = [];
  for (const [path, value] of Object.entries(entries)) {
    const colours = colourWrites(`ce.panel.patch("${controlName}", "${stateName}")`, 'nothing was patched',
      patchRoot, String(path), value, wholePath);
    if (colours) written.push([path, colours.value]);
    else refusedColour = true;
  }
  if (refusedColour) return 0;

  const state = kids[key];
  const target = String(part ?? '');
  // The keys are paths into the control, or into the part a part patch names. A part the control
  // does not have was stored anyway, and the renderer skips a part it cannot find.
  const partNames = Object.keys(found.control._children?.Parts?._children ?? {});
  const partKey = target ? partNames.find((p) => p.toLowerCase() === target.toLowerCase()) : null;
  if (target && partKey == null) {
    addScriptTrace('error', '',
      `ce.panel.patch: "${controlName}" has no part called "${target}", so nothing was applied. `
      + (partNames.length ? `Its parts are ${partNames.join(', ')}.` : 'It has no parts.'));
    return 0;
  }
  const node = partKey != null ? found.control._children.Parts._children[partKey] : found.control;
  const owner = partKey != null ? `part "${partKey}"` : `"${controlName}"`;

  // Each key is checked before anything is written, and only what lands is counted. A misspelled
  // key or a nested table used to be stored as written and counted, so the call answered 1 for a
  // change the panel never showed.
  const applied = [];
  const entriesList = written;
  for (const [path, value] of entriesList) {
    const where = patchKeyPath(node, String(path), value, owner);
    if (where.why) {
      addScriptTrace('error', '', `ce.panel.patch("${controlName}", "${key}"): ${where.why}, so it was not applied.`);
      continue;
    }
    applied.push([where.path, value]);
  }
  if (!applied.length) return 0;

  const base = state.patches ?? (state.patches = { component: {}, parts: {} });
  let map;
  if (partKey != null) {
    base.parts ??= {};
    base.parts[partKey] ??= {};
    map = base.parts[partKey];
  } else {
    base.component ??= {};
    map = base.component;
  }
  for (const [path, value] of applied) map[path] = value;
  // Written back through the same door every structure write uses, so the editor store and the
  // player host both see it — mutating the node in place would move the object and not the panel.
  writeControlProperty(found.control, `States.${key}.patches`, base);
  const n = applied.length;
  addScriptTrace('log', '',
    `ce.panel.patch ${controlName}.${key}${partKey != null ? `.parts.${partKey}` : ''}: `
    + (n === entriesList.length ? plural(n, 'key') : `${n} of ${plural(entriesList.length, 'key')} applied`));
  return n;
}

/**
 * Where one patch key leads on `node` (the control, or one of its parts): `{ path }`, the key with
 * the node's own capitals, which is how the renderer looks it up (setTreeValueAtPath walks exact
 * keys); or `{ why }` it leads nowhere. Matched without regard to capitals, as every path is.
 *
 * Refused: a path that reaches nothing, a section rather than one setting in it (which is what a
 * nested table is: `{ Background = { Fill = … } }` is one key, "Background", and would have replaced
 * the whole section in that state), and a property its section's type does not have. A path through
 * a section nobody has edited yet (an effect's) is checked against its template.
 */
function patchKeyPath(node, path, value, owner) {
  const segs = path.split('.');
  const real = walkCaseInsensitive(node, segs);
  if (real != null) {
    const at = valueAtPath(node, real);
    if (at && typeof at === 'object' && !Array.isArray(at) && (at._type !== undefined || at._children !== undefined)) {
      return { why: `"${path}" is a section, not one setting in it. Name each setting by its whole path, such as "Background.Fill.colour"` };
    }
    return { path: real };
  }
  if (segs.length > 1) {
    const probe = probeNestedWrite(node, path, value);
    if (probe.writes && !(probe.fresh && probe.typed)) return { path };
    if (probe.writes) return { why: `"${path}" is not a property of its section on ${owner}` };
  }
  return { why: `"${path}" does not lead anywhere on ${owner}` };
}

/**
 * snapshot() / restore() — every control's value, captured and put back.
 *
 * A control with no value of its own is LEFT OUT rather than recorded as nothing: restoring must
 * not be able to blank a Label by writing undefined over it. And restore SKIPS a name the panel no
 * longer has rather than failing the whole call — a snapshot taken before an edit is still worth
 * most of what it holds, and an all-or-nothing restore would throw the rest away.
 */
/** each(fn) — fn(name) for every control, containers included, in document order. */
function panelEachImpl(scriptId, fn) {
  if (typeof fn !== 'function') {
    addScriptTrace('error', scriptId ?? '', 'each(fn) needs a function to call — nothing was walked');
    return 0;
  }
  const panel = activePanel();
  if (!panel) return 0;
  let n = 0;
  // The names are collected BEFORE any is handed over: a callback that creates or destroys a
  // control would otherwise be mutating the list it is being walked through.
  const names = flatControls(panel.controls ?? [])
    .map((c) => c?._children?.Core?.name).filter(Boolean);
  for (const name of names) {
    try { fn(name); n += 1; } catch (e) { reportScriptError(scriptId ?? '', e); return n; }
  }
  return n;
}

function panelSnapshotImpl() {
  const panel = activePanel();
  const out = {};
  if (!panel) return out;
  for (const control of flatControls(panel.controls ?? [])) {
    const name = control?._children?.Core?.name;
    if (!name) continue;
    const v = getValue(`${name}.value`);
    if (v !== undefined && v !== null) out[name] = v;
  }
  return out;
}

function panelRestoreImpl(snap) {
  if (!snap || typeof snap !== 'object' || Array.isArray(snap)) {
    addScriptTrace('error', '', `ce.panel.restore: ${snap == null ? 'no snapshot was given' : `${JSON.stringify(snap)} is not a snapshot`}: a table of control names and values, as ce.panel.snapshot() gives. Nothing was restored.`);
    return 0;
  }
  let n = 0;
  for (const [name, value] of Object.entries(snap)) {
    if (getValue(`${name}.value`) === undefined) continue;
    setValue(`${name}.value`, value);
    n += 1;
  }
  addScriptTrace('log', '', `panel restore: ${n} of ${Object.keys(snap).length} value(s)`);
  return n;
}

/**
 * Remove every control a script generated. Called before onPanelBuild, which is what makes a build
 * idempotent — and called on panel teardown, so a session never leaves generated controls behind.
 */
export function clearGeneratedControls() {
  const panel = activePanel();
  if (!panel) return 0;
  const ids = flatControls(panel.controls ?? [])
    .filter((c) => c?._children?.Core?.[GENERATED_KEY] != null)
    .map((c) => c._children.Core.id);
  if (!ids.length) return 0;
  updateControls((controls) => ids.reduce((acc, id) => removeControlFromTree(acc, id).controls, controls));
  return ids.length;
}

/** Is this control one a script made? Used by the save path, which strips them. */
export function isGeneratedControl(control) {
  return control?._children?.Core?.[GENERATED_KEY] != null;
}

// @module ce.time
const timers = new Map();   // id -> interval handle

// Sync timers that FOLLOW the tempo: id -> beats. See syncTimerRead — a verb called sync that
// silently desyncs on the first tempo change was the wrong default, so following is the default and
// the freeze is the opt-in.
const syncFollowers = new Map();

/** Drop the interval without touching what the id means. startTimer and stopTimer differ in exactly
    that: stopping a timer forgets it was ever a sync timer, re-timing it does not. */
function clearTimerHandle(key) {
  const handle = timers.get(key);
  if (handle === undefined) return;
  clearInterval(handle);
  timers.delete(key);
}

/* An interval or a delay a script got wrong is refused, in the words every prelude uses.
 *
 * startTimer(id, "fast"), startTimer(id) and startTimer(id, -100) all became `Number(ms) || 0`, a
 * timer firing every millisecond here and every 5 in the player, which is a script flooding the
 * panel because of a typo. after("1s", fn) ran at once. A repeating interval has to be a number
 * above 0; a one-shot's delay a number from 0, where 0 is "as soon as the handler has returned",
 * the way setTimeout(fn, 0) is read. A number is a number: "250" is text, and is refused like any
 * text, because two of the four runtimes could not read it and the other two read "" as 0.
 *
 * `call` names the call, `unit` is "milliseconds" or "beats", and `outcome` is what did not happen.
 * Returns true when it refused. */
function timeRefused(call, value, { unit, what, positive, outcome }) {
  let why = null;
  if (value === undefined || value === null) why = `no ${what} was given`;
  else if (typeof value === 'string') why = `"${value}" is not a number of ${unit}`;
  else if (typeof value !== 'number') why = `the ${what} is not a number of ${unit}`;
  else if (!Number.isFinite(value)) why = `the ${what} is not a finite number of ${unit}`;
  else if (positive && value <= 0) why = `${value} is not more than 0 ${unit}`;
  else if (!positive && value < 0) why = `${value} is less than 0 ${unit}`;
  if (why === null) return false;
  addScriptTrace('error', '', `${call}: ${why}, so ${outcome}.`);
  return true;
}

/* A number of beats, or a division's name, which is the other way a musical length is written
 * ("1/16" is a quarter of a beat): syncTimer("step", "1/16") was 1 ms and afterBeats("1/4", fn) ran
 * at once, and the name has one meaning, so it is read. Any case, as divisionId reads it. Anything
 * else is refused by timeRefused. */
function beatsOf(call, value, { positive, outcome }) {
  if (typeof value === 'string') {
    const id = DIVISION_NAMES.find((d) => d.toLowerCase() === value.toLowerCase());
    if (id !== undefined) return DIVISIONS[id];
    addScriptTrace('error', '', `${call}: "${value}" is neither a number of beats nor a division, `
      + `so ${outcome}. The divisions are ${DIVISION_NAMES.join(', ')}.`);
    return undefined;
  }
  return timeRefused(call, value, { unit: 'beats', what: 'number of beats', positive, outcome })
    ? undefined : value;
}

/** startTimer as a script calls it: the interval checked, then armed. */
function startTimer(id, ms) {
  const key = String(id ?? '');
  if (!key) {
    // Started nothing, in silence.
    addScriptTrace('error', '', 'ce.time.startTimer: no id was given, so no timer was started.');
    return;
  }
  if (timeRefused(`ce.time.startTimer("${key}")`, ms,
    { unit: 'milliseconds', what: 'interval', positive: true, outcome: 'no timer was started' })) return;
  armTimer(key, ms);
}

/** Start or re-time a timer whose interval the caller has already checked or worked out. */
function armTimer(key, ms) {
  const period = Math.max(1, Math.round(Number(ms) || 0));
  clearTimerHandle(key);
  // An explicit millisecond interval REPLACES a musical one — startTimer over a sync timer is a
  // script saying it wants this many milliseconds, not this many beats.
  syncFollowers.delete(key);
  timers.set(key, setInterval(() => {
    // A one-shot is not a timer the panel declared, so it must NOT surface as onTimer — every
    // script with an onTimer handler would have to learn to filter ids it never created.
    if (runAfterCallback(key)) return;
    dispatchEvents([{ event: 'onTimer', controlName: null, payload: { id: key } }]);
  }, period));
}

function stopTimer(id) {
  const key = String(id ?? '');
  if (!key) {
    // Stopped nothing, in silence; an id that is not running is not a mistake, no id is.
    addScriptTrace('error', '', 'ce.time.stopTimer: no id was given, so nothing was stopped.');
    return;
  }
  syncFollowers.delete(key);
  clearTimerHandle(key);
}

/**
 * after(ms, fn) — run `fn` once, then forget it.
 *
 * Built on the same timer map rather than on setTimeout, so it behaves identically to the C++
 * preludes (which have no setTimeout and build it on startTimer) and so `stopTimer(id)` cancels it
 * the way it cancels anything else. One map, one cancel verb, one set of semantics.
 *
 * The order inside the tick is the whole point of having this instead of a self-cancelling timer:
 * the entry is removed and the timer stopped BEFORE the callback runs, so a callback that throws
 * cannot leave a one-shot repeating forever — which is exactly what hand-rolled versions do.
 */
let afterSeq = 0;
const afterCallbacks = new Map();   // timer id -> the function to run once

function afterFor(scriptId, ms, fn, verb = 'ce.time.after') {
  if (typeof fn !== 'function') {
    addScriptTrace('error', scriptId ?? '', `${verb}: fn is ${shownValue(fn)}, not a function, so nothing was scheduled.`);
    return undefined;
  }
  afterSeq += 1;
  const id = `__after:${afterSeq}`;
  // The owner is stored with the callback so a throw inside it is reported against the script that
  // scheduled it. By the time it fires there is no dispatch in progress to infer that from.
  afterCallbacks.set(id, { fn, scriptId: scriptId ?? '' });
  armTimer(id, ms);
  return id;
}

/** after as a script calls it. afterFor itself stays unchecked: sendNote's duration and
    requestDump's timeout work out their own delays. */
function afterRead(scriptId, ms, fn) {
  if (typeof fn !== 'function') return afterFor(scriptId, ms, fn);   // its own message
  if (timeRefused('ce.time.after', ms,
    { unit: 'milliseconds', what: 'delay', positive: false, outcome: 'nothing was scheduled' })) return undefined;
  return afterFor(scriptId, ms, fn);
}

/** Schedule a one-shot the runtime owns, rather than one a script asked for. Used by sendNote's
    duration, where the note off is the runtime's promise to keep and no script should be able to
    cancel it by id. */
function scheduleOneShot(ms, fn) { return afterFor('', ms, fn); }

/** Fire a one-shot if this tick belongs to one. Returns true when it handled the tick. */
function runAfterCallback(id) {
  const entry = afterCallbacks.get(id);
  if (!entry) return false;
  afterCallbacks.delete(id);
  stopTimer(id);
  runScriptCallback(entry.scriptId, 'after', entry.fn);
  return true;
}

function stopAllTimers() {
  // sendNote's duration is a host-owned timer. Cancelling it during preview teardown without first
  // sending its promised note-off leaves the synth holding a voice after the panel has disappeared.
  for (const active of activeScriptNotes.values()) {
    sendRawMidiForRole([0x80 | active.channel, active.note, 0], `noteoff_${active.note}`, active.role);
  }
  activeScriptNotes.clear();
  // ce.mpe's notes likewise: ended, with each member channel's bend put back, before the panel goes.
  if (mpeShared !== null) { mpeShared.allOff(); mpeShared = null; }
  afterCallbacks.clear();   // a one-shot outliving its panel would fire into nothing
  for (const handle of timers.values()) clearInterval(handle);
  timers.clear();
}

// @module ce.time
/* -------------------------------------------------------------------------- ce.time reads */
// The editor follows its own master clock (stores/transport.js), which follows the DAW when the
// panel's transport source is "host" and an incoming MIDI clock when it is "external". The player
// follows the DAW playhead directly. Both answer the same questions, which is what makes ce.time
// cross-runtime rather than player-only.
//
// Nothing here starts or stops the transport. A panel does not own the clock, and a script that
// could start it would be fighting whatever else is driving the panel.

function transportSnapshot() {
  const t = get(transportStore) ?? {};
  const bpm = Number(t.bpm);
  return {
    playing: t.running === true,
    bpm: Number.isFinite(bpm) && bpm > 0 ? bpm : null,
    beats: Number(t.beats) || 0,
    beatsPerBar: Number(t.beatsPerBar) > 0 ? Number(t.beatsPerBar) : 4,
    source: String(t.source ?? 'internal'),
    // The editor's clock always exists, so a position is always available — unlike a DAW that may
    // report no playhead at all. Saying valid:true here is a measurement, not a guess.
    valid: true,
  };
}

function transportInfoRead() {
  const t = transportSnapshot();
  return {
    ...t,
    bar: Math.floor(t.beats / t.beatsPerBar) + 1,
    beat: Math.floor(t.beats % t.beatsPerBar) + 1,
  };
}

const tempoRead = () => transportSnapshot().bpm;
const isPlayingRead = () => transportSnapshot().playing;

// A bpm that is not above 0, or not a number, is the transport's tempo, and says so (timeArg).
function beatsToMsRead(beats, bpm) {
  const b = timeArg('beatsToMs', 'beats', beats);
  if (b === undefined) return undefined;
  const rate = timeArg('beatsToMs', 'bpm', bpm) ?? tempoRead();
  if (!rate || rate <= 0) return null;
  return b * 60000 / rate;
}

function msToBeatsRead(ms, bpm) {
  const m = timeArg('msToBeats', 'ms', ms);
  if (m === undefined) return undefined;
  const rate = timeArg('msToBeats', 'bpm', bpm) ?? tempoRead();
  if (!rate || rate <= 0) return null;
  return m * rate / 60000;
}

/**
 * syncTimer(id, beats [, opts]) — a timer whose interval is MUSICAL.
 *
 * It follows the tempo. That is a change from the first version, which computed the interval once
 * and then kept firing at the old rate for the rest of the session: a verb called sync that
 * silently desyncs is the wrong default, and nobody deliberately relies on a sixteenth that stops
 * being a sixteenth. `{ follow = false }` keeps the old behaviour for anyone who wants it.
 *
 * Re-arming RESETS THE PHASE — the timer restarts from the moment the tempo changed rather than
 * continuing on the old grid. Said out loud rather than hidden: a one-off hiccup at the moment of a
 * tempo change beats a timer that is permanently at the wrong rate, but it is a hiccup.
 */
function syncTimerRead(id, beats, opts) {
  const key = String(id ?? '');
  if (!key) {
    // Started a timer called "", in silence.
    addScriptTrace('error', '', 'ce.time.syncTimer: no id was given, so no timer was started.');
    return;
  }
  const length = beatsOf(`ce.time.syncTimer("${key}")`, beats, { positive: true, outcome: 'no timer was started' });
  if (length === undefined) return;
  const ms = beatsToMsRead(length);
  if (ms == null) {
    // An error, as every rejection is: it was a plain line, and the call did nothing.
    addScriptTrace('error', '',
      `ce.time.syncTimer("${key}"): no tempo is being reported, so no timer was started. `
      + 'Use startTimer with a millisecond interval, or wait for onTransport.');
    return;
  }
  armTimer(key, Math.round(ms));              // clears any previous follow…
  const follow = !(opts && opts.follow === false);
  if (!follow) return;
  syncFollowers.set(key, length);             // …and this puts it back on purpose
  watchTempoForSyncTimers();
}

/** Re-time every following sync timer at the new tempo. Only when the tempo ACTUALLY changes, not
    on every transport publish — the store ticks at ~30Hz and re-arming that often would mean a
    timer that never fires.

    This rides its own subscription rather than the live event dispatch, and deliberately: the timer
    is already running, and it should stay in time whether or not the editor's Live toggle is on and
    whether or not any script is listening. Armed lazily, so a panel with no sync timers subscribes
    to nothing. */
let syncTempoUnsub = null;
let syncLastBpm = null;

function reArmSyncTimers() {
  for (const [key, beats] of [...syncFollowers]) {
    const ms = beatsToMsRead(beats);
    if (ms == null) continue;                 // no tempo any more: leave it running at the last one
    armTimer(key, Math.round(ms));
    syncFollowers.set(key, beats);
  }
}

function watchTempoForSyncTimers() {
  if (syncTempoUnsub) return;
  syncLastBpm = transportSnapshot().bpm;
  syncTempoUnsub = transportStore.subscribe((state) => {
    const raw = Number(state?.bpm);
    const bpm = Number.isFinite(raw) && raw > 0 ? raw : null;
    if (bpm === syncLastBpm) return;
    syncLastBpm = bpm;
    if (bpm !== null) reArmSyncTimers();
  });
}

/**
 * afterBeats(beats, fn) — after() with a MUSICAL delay. The pair syncTimer/startTimer already had;
 * the one-shot did not, so "play this in half a bar" meant computing the milliseconds by hand.
 *
 * A one-shot fires once, so it does not follow the tempo: the delay is computed when you call it,
 * the same as beatsToMs would. Nothing is scheduled when there is no tempo to work from, and it
 * says so rather than firing immediately.
 */
function afterBeatsFor(scriptId, beats, fn) {
  // fn first, in this call's name: it was said as after's, after the delay was read.
  if (typeof fn !== 'function') return afterFor(scriptId, 0, fn, 'ce.time.afterBeats');
  const length = beatsOf('ce.time.afterBeats', beats, { positive: false, outcome: 'nothing was scheduled' });
  if (length === undefined) return undefined;
  const ms = beatsToMsRead(length);
  if (ms == null) {
    addScriptTrace('error', scriptId ?? '',
      'ce.time.afterBeats: no tempo is being reported, so nothing was scheduled. '
      + 'Use after() with milliseconds, or wait for onTransport.');
    return undefined;
  }
  return afterFor(scriptId, Math.round(ms), fn);
}

/** The timer ids currently running, sorted — the ones a script started BY NAME.
 *
 * One-shots are left out, all of them. They are anonymous machinery: after() hands back its id, so
 * listing it adds nothing, and the runtime's own (sendNote's note-off) must not be cancellable by a
 * script at all. Excluding the whole class rather than only the runtime's is also what keeps the
 * answer the same in every runtime — the C++ preludes build sendNote's note-off on after(), so a
 * rule that depended on who owned a one-shot would report differently there. */
function runningTimersRead() {
  return [...timers.keys()].filter((id) => !id.startsWith('__after:')).sort();
}

// @module ce.device
/* ------------------------------------------------------------------------ ce.device reads */
// What the synth actually IS, rather than what the panel author remembered. Four reads, backed in
// the C++ engines by one host primitive; here they answer from the editor's device stores, which
// are the same data the device host would report.
//
// ONE HONEST ASYMMETRY, stated rather than hidden. In the player, listProfileParameters is a
// synchronous call into DeviceProfileService and deviceParameters() is complete on the first call.
// In the EDITOR the parameter table arrives over the async bridge and is cached per profile, so the
// first call on a cold cache has nothing to return. It says so, requests the load, and the next
// call is complete — which is the best a synchronous verb can do over an asynchronous source, and
// far better than returning an empty list that looks like "this synth has no parameters".

const deviceSourceCache = new Map();

function roleMapping(role) {
  const mappings = get(deviceRoleMappings) ?? {};
  return mappings[role] ?? mappings[DEFAULT_ROLE] ?? null;
}

/**
 * The mapping a role has of its OWN, or null. profile, variables, timing, coverage, recipes and
 * requests answer from it, as the plug-in answers them, from the role's own session record. They
 * answered from roleMapping, which falls back to the main synth, so a role nothing is mapped to read
 * as the main synth window-open and as nothing window-closed. parameter() and parameters() still
 * fall back, in both: the plug-in's engine does (DeviceProfileService::engineForRole).
 */
function ownRoleMapping(role) {
  return (get(deviceRoleMappings) ?? {})[role] ?? null;
}

/**
 * The profile SOURCE behind a role — the authored JSON, not the catalogue entry.
 *
 * profile() has always answered from the catalogue listing (id, name) and the live session, which
 * is what a script needs to know whether it is talking to anything. Everything below needs the
 * document: what variables the recipes interpolate, what the profile claims it can do, what
 * messages it can build.
 */
function deviceProfileSource(role = DEFAULT_ROLE, { own = false } = {}) {
  const profileId = (own ? ownRoleMapping(role) : roleMapping(role))?.profileId;
  if (!profileId) return null;
  const text = (get(profileSources) ?? {})[profileId]?.source ?? '';
  if (!text) return null;
  const cached = deviceSourceCache.get(profileId);
  if (cached?.text === text) return cached.profile;
  const parsed = parseProfileSourceText(profileId, text);
  const profile = parsed.ok ? parsed.profile : null;
  deviceSourceCache.set(profileId, { text, profile });
  if (deviceSourceCache.size > 8) deviceSourceCache.delete(deviceSourceCache.keys().next().value);
  return profile;
}

/**
 * A variable's EFFECTIVE value: the profile's default, then this project's override.
 *
 * That precedence is the app's own — deviceProfileSession merges `mapping.variables` over
 * `profile.variables` on the way to every recipe — and it is the reason a write goes to the
 * MAPPING rather than to the profile. A profile is a shared document; two panels driving two units
 * of the same synth must be able to sit on different device ids without editing it.
 */
function deviceVariablesRead(role = DEFAULT_ROLE) {
  const profile = deviceProfileSource(role, { own: true });
  const mapping = ownRoleMapping(role);
  if (!profile && !mapping) return null;
  return {
    ...(profile?.variables && typeof profile.variables === 'object' ? profile.variables : {}),
    ...(mapping?.variables && typeof mapping.variables === 'object' ? mapping.variables : {}),
  };
}

function deviceTimingRead(role = DEFAULT_ROLE) {
  const profile = deviceProfileSource(role, { own: true });
  const mapping = ownRoleMapping(role);
  if (!profile && !mapping) return null;
  return {
    ...(profile?.timing && typeof profile.timing === 'object' ? profile.timing : {}),
    ...(mapping?.timingOverrides && typeof mapping.timingOverrides === 'object' ? mapping.timingOverrides : {}),
  };
}

/**
 * One override written onto the role mapping, through the app's own writer so it persists.
 *
 * The role's OWN mapping, not roleMapping's: a read of a role nothing is mapped to takes the main
 * synth's profile, and this took it too, and wrote it back as a new mapping for that role, so a
 * misspelt role became a second device on the main synth's profile. It is refused, as the plug-in
 * refuses it, and both say so in deviceWords.js's words, as they say a value used as the nearest
 * whole number in range, once per name.
 */
const deviceOverrideWarned = new Set();   // label, role and name of each override that has said so; resetScriptState clears it
function deviceOverrideWrite(kind, name, value, role) {
  const { label, min, max } = DEVICE_OVERRIDES[kind];
  let key = String(name ?? '').trim();
  if (!key) {
    addScriptTrace('error', '', deviceSetNoNameWords(label));
    return false;
  }
  const mapping = (get(deviceRoleMappings) ?? {})[role];
  if (!mapping?.profileId) {
    addScriptTrace('error', '', deviceSetNoProfileWords(label, role));
    return false;
  }
  // A timing is one the profile has, read in any case and written in its spelling: a name it has
  // not was stored and never read. A variable may be the script's own, for a recipe it declared.
  if (kind === 'timingOverrides') {
    const names = Object.keys(deviceTimingRead(role) ?? {});
    const known = names.find((n) => n.toLowerCase() === key.toLowerCase());
    if (known === undefined) {
      addScriptTrace('error', '', deviceTimingUnknownWords(key, role, names));
      return false;
    }
    key = known;
  }
  const { n: next, refused, said } = deviceOverrideValue(label, key, value, min, max);
  if (refused) {
    addScriptTrace('error', '', refused);
    return false;
  }
  const warnedAs = `${label}\u0000${role}\u0000${key}`;
  if (said && !deviceOverrideWarned.has(warnedAs)) {
    deviceOverrideWarned.add(warnedAs);
    addScriptTrace('warn', '', `${said} This is said only the first time.`);
  }
  const current = (mapping[kind] && typeof mapping[kind] === 'object' ? mapping[kind] : {});
  if (current[key] === next) {
    addScriptTrace('log', '', `ce.device.${label}("${key}", ${next}) — already that way`);
    return true;
  }
  mapDeviceRole(role, mapping.profileId, { [kind]: { ...current, [key]: next } });
  addScriptTrace('log', '', `ce.device.${label} ${role}: ${key} → ${next}`);
  return true;
}

/**
 * What the profile says it can do, in the profile's OWN WORDS.
 *
 * Deliberately not a boolean. The eight shipped profiles answer with 'complete', 'partial' and
 * 'notImplemented' — and also with 'filter-block-rq1', 'partial-block-requests' and
 * 'broad-with-packed-text-and-requests'. Squeezing that into can()/true would be a guess presented
 * as a fact, and the guess would be wrong for a third of them. A script tests the words it cares
 * about; the ones that mean "no" are spelled that way.
 */
function deviceCoverageRead(role = DEFAULT_ROLE, feature) {
  const coverage = deviceProfileSource(role, { own: true })?.coverage;
  if (!coverage || typeof coverage !== 'object') return feature ? undefined : null;
  if (feature === undefined || feature === null || feature === '') return { ...coverage };
  const wanted = String(feature);
  const key = Object.keys(coverage).find((k) => k.toLowerCase() === wanted.toLowerCase());
  return key === undefined ? undefined : coverage[key];
}

/** The ids of the messages a profile can build, and of the requests it can send. */
function deviceListRead(role, field) {
  const list = deviceProfileSource(role, { own: true })?.[field];
  if (!Array.isArray(list)) return [];
  return list.map((entry) => String(entry?.id ?? '')).filter(Boolean);
}

function deviceProfileRead(role = DEFAULT_ROLE) {
  const mapping = ownRoleMapping(role);
  const profileId = mapping?.profileId;
  if (!profileId) return null;
  const listed = (get(deviceProfiles) ?? []).find((p) => String(p?.id) === String(profileId)) ?? null;
  const session = (get(deviceSessionState) ?? {})[role] ?? null;
  const source = deviceProfileSource(role, { own: true });
  return {
    id: profileId,
    name: listed?.name ?? profileId,
    role,
    connected: String(session?.state ?? '') === 'ready',
    state: String(session?.state ?? 'unknown'),
    midiDestination: mapping?.midiDestination?.name ?? mapping?.midiDestination?.id ?? '',
    midiInput: mapping?.midiInput?.name ?? mapping?.midiInput?.id ?? '',
    // From the authored document rather than the catalogue row: a script choosing between two
    // dialects of the same synth needs the make and the model, and it had neither.
    manufacturer: String(source?.manufacturer ?? ''),
    family: String(source?.family ?? ''),
    version: String(source?.profileVersion ?? ''),
    status: String(source?.status ?? listed?.status ?? ''),
    trust: String(source?.trust ?? listed?.trust ?? ''),
  };
}

function deviceConnectedRead(role = DEFAULT_ROLE) {
  return String((get(deviceSessionState) ?? {})[role]?.state ?? '') === 'ready';
}

/**
 * read / write — the half of phase 2 that was missing. parameters() said WHAT the synth has and
 * there was then no way to touch one unless a control happened to be bound to it.
 *
 * `read` is the LAST KNOWN value: what the synth most recently told us, from a dump or a parameter
 * message, mirrored in deviceRuntimeState. It is NOT a live query — asking the synth is
 * asynchronous and this verb is not — and nothing comes back when the device has never reported it,
 * which a script must be able to tell apart from zero.
 */
// An id left out, or blank, is refused, where it answered nothing without a word.
const deviceIdMissing = (id) => id === undefined || id === null || (typeof id === 'string' && !id.trim());
function deviceValueRead(id, role) {
  if (deviceIdMissing(id)) { addScriptTrace('error', '', deviceNoIdWords('read')); return undefined; }
  const key = String(id);
  const forRole = (get(deviceRuntimeState) ?? {})[role];
  if (!forRole || typeof forRole !== 'object') return undefined;
  const v = forRole[key];
  return v === null ? undefined : v;
}

/**
 * `write` encodes through the device profile and sends. The return says the message was DISPATCHED,
 * not that the synth accepted it — the send crosses the bridge asynchronously and nothing here can
 * know the answer synchronously. Saying so is better than a `true` that means less than it looks.
 */
function deviceValueWrite(id, value, role) {
  const key = String(id ?? '');
  if (!key) {
    addScriptTrace('error', '', 'deviceWrite(id, value): a parameter id is required');
    return false;
  }
  // A parameter the SCRIPT declared carries its own wire format, so it is compiled here and sent
  // as raw bytes. That is the whole reason defineParameter exists: this path needs no profile, and
  // so it works on a synth the app has never heard of.
  if (hasDefinedParameter(role, key)) {
    const encoded = encodeRuntimeParameter(role, key, value);
    if (!encoded.ok) { addScriptTrace('error', '', `deviceWrite(${JSON.stringify(key)}): ${encoded.error}`); return false; }
    sendRawMidi(encoded.bytes, `param_${key}`);
    return true;
  }
  // A parameter the profile does not have is refused, once the profile's whole table is in: nothing
  // is sent, the answer is false, and the console says so in the words the plug-in says it in
  // (deviceWords.js). It was logged as written and answered true, and the host's "Not sent" went to
  // the MIDI preview, which no script reads; the plug-in answered false without a word. While the
  // table is on its way, the write goes to the host as it did, which drops what it cannot encode.
  // With no profile chosen there is nothing to encode it, and that is said the same way. The role's
  // OWN mapping: a send takes no other (deviceMidiOps resolveParameterSend, and the plug-in's
  // service), so a role nothing is mapped to has no profile here, where a read takes the main
  // synth's (roleMapping).
  const profileId = get(deviceRoleMappings)?.[role]?.profileId;
  if (!profileId) {
    addScriptTrace('error', '', deviceWriteNoProfileWords(key, role));
    return false;
  }
  const table = parameterTable(profileId);
  if (!table) requestParameterTable(profileId, role);
  else if (!table.some((p) => String(p?.id ?? '') === key)) {
    addScriptTrace('error', '', deviceWriteUnknownWords(key, role));
    return false;
  }
  if (!isJuceAvailable()) {
    addScriptTrace('error', '',
      `deviceWrite(${JSON.stringify(key)}) needs the device host — encoding a parameter is the device `
      + 'profile\'s codec, which runs in the host. It works in the exported plugin.');
    return false;
  }
  // dryRun false: actually send it. The same path a control bound to this parameter takes, so a
  // scripted change and a knob turn are indistinguishable downstream.
  commitDeviceParameter({ deviceRole: role, parameterId: key, value, dryRun: false });
  addScriptTrace('midi', '', `deviceWrite ${key} = ${JSON.stringify(value)}`);
  return true;
}

/**
 * The parameters this role has, from BOTH sources: the shipped profile, and whatever the script
 * declared with defineParameter. Declared ones come last, so a declaration that reuses a profile
 * id overrides it — which is what lets a script correct one wrong parameter in an otherwise good
 * profile without having to redeclare the rest.
 */
// The access filter, the same three words the exported plug-in's engines take
// (descriptorMatches in DeviceProfileServiceInternal.h). This read used to match the text of
// `access` as a substring — but a profile's access is an object, whose text is "[object Object]",
// so any value at all filtered every profile parameter out, while the plug-in ignored the
// "readwrite" the manual's example passed and returned them all.
const ACCESS_FILTERS = new Set(['writable', 'readonly', 'realtimeWarning']);
function accessMatches(access, filter) {
  if (!ACCESS_FILTERS.has(filter)) return true;
  // A profile gives { canWrite, realtimeSafe }; a declared parameter gives text such as "read" or
  // "readWrite". Missing means writable and safe, as the engine reads it.
  const canWrite = typeof access === 'string'
    ? /write/i.test(access)
    : access?.canWrite !== false;
  const realtimeSafe = typeof access === 'string' ? true : access?.realtimeSafe !== false;
  if (filter === 'writable') return canWrite;
  if (filter === 'readonly') return !canWrite;
  return !realtimeSafe;
}

function deviceParametersRead(opts = {}) {
  const role = opts.role || DEFAULT_ROLE;
  const declared = definedParameters(role);
  const profileId = roleMapping(role)?.profileId;

  let fromProfile = [];
  if (profileId) {
    // The profile's whole table (stores/deviceParameterTable.js). This read used the Device
    // Profile Designer's page, which is 160 parameters by default and what the Designer's search
    // matched, and asked for it with one object where the request takes the id and the role, so a
    // profile the Designer had not listed was never loaded at all.
    const table = parameterTable(profileId);
    if (table) {
      fromProfile = table;
    } else {
      // Cold. Ask for it, and SAY so — an empty list here means "not loaded", which is a very
      // different thing from "this synth has no parameters", and a script that cannot tell them
      // apart will draw the wrong conclusion silently.
      requestParameterTable(profileId, role);
      addScriptTrace('log', '',
        `deviceParameters(): the parameter table for "${profileId}" has not been loaded yet — `
        + 'requesting it now. Call again from a later handler (onTimer is the usual place). '
        + 'In the exported plugin this read is synchronous and complete on the first call.');
    }
  } else if (!declared.length) {
    // No profile AND nothing declared is the only case that is genuinely an error now. With
    // declarations in hand there is nothing wrong with having no profile — that is the case
    // defineParameter was built for.
    addScriptTrace('error', '',
      `deviceParameters(): no device profile is mapped to the "${role}" role, and this panel has `
      + 'declared no parameters. Map a profile, or declare what the synth has with defineParameter().');
    return [];
  }

  const byId = new Map();
  for (const p of [...fromProfile, ...declared]) byId.set(String(p?.id ?? ''), p);

  const wanted = (field, value) => !value || String(field ?? '').toLowerCase().includes(String(value).toLowerCase());
  const access = String(opts.access ?? '');
  if (access && !ACCESS_FILTERS.has(access)) {
    addScriptTrace('error', '',
      `deviceParameters(): access "${access}" is not one of "writable", "readonly" or "realtimeWarning"; `
      + 'the list is not filtered by access.');
  }
  let out = [...byId.values()].filter((p) => wanted(p?.group, opts.group)
    && wanted(p?.type, opts.type)
    && accessMatches(p?.access, access)
    && (!opts.query
      || String(p?.id ?? '').toLowerCase().includes(String(opts.query).toLowerCase())
      || String(p?.name ?? '').toLowerCase().includes(String(opts.query).toLowerCase())));
  const limit = Number(opts.limit);
  if (Number.isFinite(limit) && limit > 0) out = out.slice(0, limit);
  return out;
}

function deviceParameterRead(id, role = DEFAULT_ROLE) {
  if (deviceIdMissing(id)) { addScriptTrace('error', '', deviceNoIdWords('parameter')); return null; }
  const wanted = String(id);
  // A declared parameter answers without touching the profile cache, so `parameter()` on a synth
  // with no profile is a plain lookup rather than a cold-cache notice about a table that will
  // never arrive.
  const own = definedParameter(role, wanted);
  if (own) return own;
  const all = deviceParametersRead({ role });
  return all.find((p) => String(p?.id) === wanted) ?? null;
}

/* ------------------------------------------------- ce.device: declaring what the app does not know */
// Everything above READS a device profile the app was shipped with. That is a hard ceiling: a panel
// can only address a synth somebody already wrote a profile for, which excludes most of what is
// actually in people's racks. These four verbs write the structure instead of reading it.
//
// The codec lives in deviceDefinitions.js; what is here is the script-facing shape and the
// reporting. Declarations are script-lifetime and are dropped when the panel is rebuilt, which is
// what keeps a build idempotent (§13) and what stops a declaration half-saving into the author's
// document.

function deviceDefineParameterImpl(id, spec, role) {
  const result = defineRuntimeParameter(role, id, spec ?? {});
  if (!result.ok) { addScriptTrace('error', '', result.error); return false; }
  const p = result.parameter;
  addScriptTrace('log', '', `defineParameter ${p.id} — ${p.name} (${p.type}, ${p.min}..${p.max})`);
  if (result.warning) addScriptTrace('warn', '', result.warning);
  return true;
}

function deviceDefineDumpImpl(kind, spec, role) {
  const result = defineRuntimeDump(role, kind, spec ?? {});
  if (!result.ok) { addScriptTrace('error', '', result.error); return false; }
  const d = result.dump;
  addScriptTrace('log', '',
    `defineDump ${d.kind} — ${d.fields} field(s)`
    + (d.requestBytes ? '' : ', no request declared (nothing to send when requestDump asks for it)'));
  return true;
}

/**
 * bind(control, parameterId) — connect a control to a parameter at RUNTIME.
 *
 * ce.panel.create could already make a control and there was then no way to connect it to
 * anything: DeviceBindings is declared at design time and nothing wrote it, so a self-building
 * panel built dead controls. This is the other half of that pair.
 *
 * Panel view only, for the same reason ce.panel.create is: the binding lives on the control model,
 * and there is no control model with the window shut.
 */
/**
 * Write a control property through whichever door owns the document: the editor's control store, or
 * the player host. The same split updateControls makes, and for the same reason — the exported
 * plugin runs this runtime in its OPEN window, so a panel-view-only verb still has a host.
 */
function writeControlProperty(control, path, value) {
  if (host) { host.writeValue(control, path, value); noteHostWrite(path); return; }
  noteEditorScriptTouchedControl(control?._children?.Core?.id);
  writeEditorControlProperty(control, path, value);
}

function deviceBindImpl(controlName, parameterId, opts = {}) {
  const name = String(controlName ?? '');
  const key = String(parameterId ?? '');
  if (!name || !key) {
    addScriptTrace('error', '', 'bind(control, parameterId): both a control and a parameter id are required');
    return false;
  }
  const control = findControlByName(name);
  if (!control) { addScriptTrace('error', '', `bind: control "${name}" not found on the active panel`); return false; }

  const role = String(opts?.role ?? '') || DEFAULT_ROLE;
  // Say so rather than refusing: a script may bind before it declares, and a profile-backed
  // parameter table can still be loading. A binding to a parameter that turns up later works;
  // one to a parameter that never turns up is silent, and silence is what the notice buys back.
  //
  // The profile is only consulted when there IS one. Asking otherwise would emit "no profile is
  // mapped" from the read — true, and completely beside the point when the panel is deliberately
  // driving a synth that has none.
  //
  // The profile's knowledge is its whole table (stores/deviceParameterTable.js), asked for here when
  // it is not in. Asked of the Designer's page instead, this named parameters the profile has; before
  // the table arrives nothing knows the id yet, which is what the notice says.
  // The role's OWN profile, as for a write: the binding's every move is sent to its role and no
  // other (deviceMidiOps resolveParameterSend), so a role nothing is mapped to knows no id but a
  // declared one, though a read of it takes the main synth's profile.
  const profileId = get(deviceRoleMappings)?.[role]?.profileId;
  const table = profileId ? parameterTable(profileId) : null;
  if (profileId && !table) requestParameterTable(profileId, role);
  const known = hasDefinedParameter(role, key) || Boolean(table?.some((p) => String(p?.id ?? '') === key));
  // A warning, not a plain line: the binding is made, and may never do anything.
  if (!known) addScriptTrace('warn', '', deviceBindUnknownWords(name, key));

  const port = String(opts?.port ?? 'value');
  const existing = Array.isArray(control?._children?.DeviceBindings?.bindings)
    ? control._children.DeviceBindings.bindings : [];
  // Replace the binding on this port rather than appending: two bindings on one port is a control
  // that sends two different parameters from one gesture, which is never what bind() was asked for.
  const kept = existing.filter((b) => !(b?.kind === 'deviceParameter' && String(b?.port ?? 'value') === port));
  const next = [...kept, { kind: 'deviceParameter', port, parameterId: key, deviceRole: role }];

  writeControlProperty(control, 'DeviceBindings.bindings', next);
  // A control whose DeviceBindings section was switched off would take the binding and ignore it.
  if (control?._children?.DeviceBindings?.enabled === false) writeControlProperty(control, 'DeviceBindings.enabled', true);
  addScriptTrace('log', '', `bind ${name}.${port} → ${key}${role === DEFAULT_ROLE ? '' : ` [${role}]`}`);
  return true;
}

/** unbind(control [, port]) — returns whether there was a binding to remove, so "already clean"
    reads differently from "cleaned up". */
function deviceUnbindImpl(controlName, port = 'value') {
  const name = String(controlName ?? '');
  const control = findControlByName(name);
  if (!control) { addScriptTrace('error', '', `unbind: control "${name}" not found on the active panel`); return false; }
  const wanted = String(port ?? 'value') || 'value';
  const existing = Array.isArray(control?._children?.DeviceBindings?.bindings)
    ? control._children.DeviceBindings.bindings : [];
  const next = existing.filter((b) => !(b?.kind === 'deviceParameter' && String(b?.port ?? 'value') === wanted));
  if (next.length === existing.length) return false;
  writeControlProperty(control, 'DeviceBindings.bindings', next);
  addScriptTrace('log', '', `unbind ${name}.${wanted}`);
  return true;
}

/**
 * ports() — what is actually plugged in.
 *
 * connected(role) answers yes/no for a role somebody configured in advance. Nothing enumerated the
 * real ports, so a panel could not offer the user a choice or notice a device that showed up.
 *
 * `role` on a port is the role currently using it, or "" — which is what makes "is anything using
 * this?" a field rather than a cross-reference the script has to build itself.
 */
// parameters() and ports() take a table of options or nothing: a number or a text was read as no
// options at all, so ports("in") listed every port without a word.
function deviceOptionsRefused(verb, opts) {
  if (opts === undefined || opts === null || isOptionsTable(opts)) return false;
  addScriptTrace('error', '', deviceNotOptionsWords(verb, shownValue(opts)));
  return true;
}
const devicePortsWarned = new Set();   // each direction that was not one, said once; resetScriptState clears it
function devicePortsRead(opts = {}) {
  // In any case, as every word from a list is read; one that is not "in" or "out" (or "input",
  // "output") lists every port, as it did, and now says so once.
  let direction = typeof opts?.direction === 'string' ? opts.direction.trim().toLowerCase() : '';
  if (opts?.direction !== undefined && opts?.direction !== null && !['in', 'input', 'out', 'output'].includes(direction)) {
    const said = devicePortsDirectionWords(shownValue(opts.direction));
    if (!devicePortsWarned.has(said)) {
      devicePortsWarned.add(said);
      addScriptTrace('warn', '', `${said} This is said only the first time.`);
    }
    direction = '';
  }
  const mappings = get(deviceRoleMappings) ?? {};

  const roleUsing = (portId, which) => {
    for (const [role, mapping] of Object.entries(mappings)) {
      if (String(mapping?.[which]?.id ?? '') === String(portId)) return role;
    }
    return '';
  };

  const inputs = get(midiInputs) ?? [];
  const outputs = get(midiDestinations) ?? [];
  // Nothing but the placeholder rows means the host has never been asked. Request the enumeration
  // and say so — the same asymmetry deviceParameters() states, for the same reason: an empty list
  // from a cold cache and an empty list from a machine with no MIDI interface look identical.
  if (isJuceAvailable() && !portsRequested && inputs.length + outputs.length <= 2) {
    portsRequested = true;
    try { listMidiInputs(); listMidiDestinations(); } catch { /* no bridge */ }
    addScriptTrace('log', '',
      'ports(): the port list has not been enumerated yet — requesting it now. Call again from a '
      + 'later handler. In the exported plugin this read is synchronous and complete on the first call.');
  }

  const out = [];
  const add = (port, dir, which) => {
    const type = String(port?.type ?? '');
    out.push({
      id: String(port?.id ?? ''),
      name: String(port?.name ?? port?.id ?? ''),
      direction: dir,
      type,
      // The placeholder rows the app always lists are choices, not hardware, and so are the
      // internal cables and the simulated device. All are reported — they are what a mapping can be
      // set to — but a script asking "did a device show up" wants this flag, not a list of magic
      // type strings to compare against.
      hardware: isHardwareEndpoint(port),
      role: roleUsing(port?.id, which),
    });
  };
  if (direction !== 'out' && direction !== 'output') for (const p of inputs) add(p, 'in', 'midiInput');
  if (direction !== 'in' && direction !== 'input') for (const p of outputs) add(p, 'out', 'midiDestination');
  return out;
}

let portsRequested = false;

/**
 * requestDump(kind [, fn [, opts]]) — closing the loop.
 *
 * Fire-and-forget was the odd one out: deviceRead already answers where it is called, and a dump's
 * answer turned up at onDumpReceived with nothing tying it to the request. A panel that asked for
 * two dumps in a row could not tell which reply was which.
 *
 * Three rules, and each of them is protecting against a specific way this shape goes wrong:
 *   1. The waiter is removed BEFORE the callback runs, so a throw inside it cannot leave a waiter
 *      that fires again on the next dump — the same rule after() follows for the same reason.
 *   2. A waiter that never hears back is resolved with `ok = false` rather than left hanging. A
 *      synth that is off, or does not answer this request, is the common case, not the exotic one.
 *   3. The callback is OPTIONAL and the old spelling is untouched: requestDump("patch") still
 *      means what it always meant, and still reaches onDumpReceived.
 */
// Matched on KIND alone, never on role. requestDump's host primitive is requestDump(kind) in every
// C++ engine, so a role argument here would be an option the panel view honoured and the shipped
// plugin quietly ignored — the exact asymmetry this API spent two rounds removing. A script that
// needs another device sends inside routeMidi(role, fn).
const dumpWaiters = [];        // { kind, fn, scriptId, timerId, done }

function resolveDumpWaiters(kind, role, values, error = '') {
  if (!dumpWaiters.length) return;
  const matched = dumpWaiters.filter((w) => !w.done && (w.kind === '' || w.kind === String(kind ?? '')));
  for (const waiter of matched) {
    // Removed first: a throw inside the callback must not leave it armed for the next dump.
    waiter.done = true;
    const at = dumpWaiters.indexOf(waiter);
    if (at >= 0) dumpWaiters.splice(at, 1);
    if (waiter.timerId) stopTimer(waiter.timerId);
    try {
      waiter.fn(error ? undefined : values, { ok: !error, kind: String(kind ?? ''), role: String(role ?? ''), error });
    } catch (e) {
      reportScriptError(waiter.scriptId, e);
    }
  }
}

/**
 * ce.device.preset() / recallPreset() / onPresetChange — the current patch, per device role.
 *
 * WHAT "CURRENT" MEANS, and why it starts empty. A synth does not announce its patch when you plug
 * in, and almost none can be asked. So this is what has been SEEN — a Program Change arriving, or a
 * recallPreset going out — rather than a reading of the instrument. Slot -1 says "nothing has told
 * us yet", which a script can act on; inventing slot 0 would have every panel confidently displaying
 * the wrong preset name until somebody turned the dial.
 *
 * ONE EVENT FOR BOTH DIRECTIONS. A script repainting a name display does not care which end pressed
 * the button, and two events would mean wiring both and getting it wrong once. `source` says which
 * it was for the scripts that do care.
 */
const currentPreset = new Map();     // role -> { slot, program, name, category, bankId, source }

function presetStateFor(role) {
  return currentPreset.get(role) ?? {
    slot: -1, program: -1, name: '', category: '', bankId: '', bankLabel: '',
    writable: true, source: '',
  };
}

function notePresetChange(role, slot, source) {
  const profile = deviceProfileSource(role);
  const info = profile ? presetSlotInfo(profile, slot) : null;
  const next = {
    slot,
    program: info?.program ?? slot,
    name: info?.catalogName ?? '',
    category: info?.category ?? '',
    bankId: info?.bankId ?? '',
    bankLabel: info?.bankLabel ?? '',
    writable: info?.writable !== false,
    source,
  };
  const previous = currentPreset.get(role);
  // Change-detected, so a device echoing its own Program Change back does not raise twice.
  if (previous && previous.slot === next.slot && previous.source === next.source) return next;
  currentPreset.set(role, next);
  deliverEmit('onPresetChange', null, { ...next, role });
  return next;
}

/** Called by the inbound path when a Program Change arrives. */
export function notePresetChangeFromDevice(role, program) {
  const number = Math.round(Number(program));
  if (!Number.isFinite(number) || number < 0 || number > 127) return;
  notePresetChange(String(role || DEFAULT_ROLE), number, 'device');
}

function presetReadImpl(role = DEFAULT_ROLE) {
  return { ...presetStateFor(String(role || DEFAULT_ROLE)), role: String(role || DEFAULT_ROLE) };
}

function recallPresetImpl(slot, opts = {}) {
  const role = String(opts?.role || DEFAULT_ROLE);
  const number = Math.round(Number(slot));
  if (!Number.isFinite(number) || number < 0) {
    addScriptTrace('error', '', 'recallPreset(slot): slot must be an integer >= 0.');
    return { ok: false, error: 'Preset recall needs an integer slot >= 0.', slot: number };
  }

  const profile = deviceProfileSource(role);
  if (!profile) {
    // It answered with this and said nothing; the plug-in says the same (presetWords.js).
    addScriptTrace('error', '', recallNoProfileWords(number, role));
    return { ok: false, error: `No device profile for role "${role}".`, slot: number };
  }

  // Straight through the librarian, which is the same door the Presets screen uses. A second
  // implementation here would be a second opinion about what a slot means.
  const result = recallPresetAction(profile, { slot: number, deviceRole: role });
  if (!result.ok) {
    addScriptTrace('error', '', `recallPreset(${number}): ${result.error}`);
    return { ok: false, error: result.error, slot: number };
  }

  const state = notePresetChange(role, number, 'panel');
  return {
    ok: true,
    error: '',
    slot: number,
    name: state.name,
    category: state.category,
    messages: (result.messages ?? []).map((m) => m.hex ?? ''),
  };
}

function requestDumpImpl(kind, fn, opts, scriptId = '') {
  const key = String(kind ?? '');
  const role = DEFAULT_ROLE;

  if (typeof fn === 'function') {
    const ms = Number(opts?.timeout) > 0 ? Math.round(Number(opts.timeout)) : requestWaitMs(role, key);
    // A request's answer arrives under the dump it answers with ("requestSystem" brings "system"),
    // so that is what the callback waits for, in every runtime; waiting for the request's own id,
    // it heard only the timeout.
    const waitFor = requestAnswer(role, key) ?? key;
    const waiter = { kind: waitFor, fn, scriptId, timerId: null, done: false };
    dumpWaiters.push(waiter);
    // A one-shot the RUNTIME owns rather than one the script asked for, so a script cannot cancel
    // somebody else's timeout by id, and stopAllTimers on panel close takes it with the panel.
    waiter.timerId = scheduleOneShot(ms, () => {
      if (waiter.done) return;
      resolveDumpWaiters(waitFor, role, undefined, `no dump arrived within ${ms}ms`);
    });
  }

  // A layout the SCRIPT declared carries its own request bytes, so asking for it is a raw send and
  // needs no profile at all — which is the case defineDump exists for.
  if (hasDefinedDump(role, key)) {
    const bytes = dumpRequestBytes(role, key);
    if (!bytes.length) {
      addScriptTrace('error', '',
        `requestDump(${JSON.stringify(key)}): the declared layout has no request bytes, so there is `
        + 'nothing to send. Add `request` to defineDump, or wait for the synth to send it unasked.');
      return false;
    }
    sendRawMidi(bytes, `dump_${key}`);
    return true;
  }

  const refused = dumpKindRefusal('requestDump', key, { requests: true });
  if (refused) {
    addScriptTrace('error', '', refused);
    return false;
  }
  if (isJuceAvailable()) {
    startDeviceSync({ deviceRole: role, request: key });
    addScriptTrace('midi', '', `requestDump(${JSON.stringify(key)}) → device sync requested`);
    return true;
  }
  addScriptTrace('midi', '', `requestDump(${JSON.stringify(key)}) — no device host`);
  return false;
}

/**
 * How long requestDump(kind, fn) waits when the script gives no timeout: the request's own timeoutMs
 * for every try the profile allows (the service sends it 1 + retries times), and never less than the
 * 3000 ms it always waited. A fixed 3000 ms reported an AN1x request, whose profile gives it 4000 ms,
 * as unanswered while its reply was still on the way. The plug-in's "answerWaitMs" query is the
 * same sum.
 */
function requestWaitMs(role, kind) {
  const request = (deviceProfileSource(role)?.requests ?? []).find((r) => String(r?.id ?? '') === kind);
  if (!request) return 3000;
  const timeoutMs = Number(request.timeoutMs) > 0 ? Math.round(Number(request.timeoutMs)) : 2000;
  const retries = Number(request.retries) > 0 ? Math.round(Number(request.retries)) : 0;
  return Math.max(3000, timeoutMs * (1 + retries) + 500);
}

export function requestWaitMsForTesting(role, kind) { return requestWaitMs(role, kind); }

/** The dump a request of the role's profile answers with, or null (the plug-in's "answers" query). */
function requestAnswer(role, kind) {
  const request = (deviceProfileSource(role)?.requests ?? []).find((r) => String(r?.id ?? '') === kind);
  const dump = String(request?.response?.dump ?? request?.expectedDump ?? '');
  return dump || null;
}

/**
 * What requestDump, sendDump and buildDump say of a kind the main synth's profile has no dump by
 * (deviceWords.js), or null: for no kind, a dump the script declared, one the profile defines (or,
 * for requestDump, a request it can send), and while the profile's document has not arrived, when
 * the host is the one to know.
 */
function dumpKindRefusal(verb, kind, { requests = false, outcome } = {}) {
  const key = String(kind ?? '');
  if (!key || hasDefinedDump(DEFAULT_ROLE, key)) return null;
  const profile = deviceProfileSource(DEFAULT_ROLE);
  if (!profile) return null;
  const known = profileDumpKinds(profile);
  if (known.dumps.includes(key) || (requests && known.requests.includes(key))) return null;
  return dumpKindUnknownWords(verb, key, DEFAULT_ROLE, known.dumps, outcome);
}

/** Drop every runtime declaration. Called wherever generated controls are cleared, for the same
    reason: a build starts from what the author drew, plus what this run of the script declares. */
export function clearDeviceRuntimeDefinitions() {
  clearDeviceDefinitions();
  portsRequested = false;
  // A waiter outliving its panel would call back into a script that is gone, so it is dropped
  // rather than resolved — the timeout notice is worth having while the panel is live and is
  // noise once it is not.
  for (const waiter of dumpWaiters.splice(0, dumpWaiters.length)) {
    waiter.done = true;
    if (waiter.timerId) stopTimer(waiter.timerId);
  }
  // A check outliving its panel would never finish, and its device would stay busy.
  for (const role of Object.keys(verifyJobs)) delete verifyJobs[role];
  forgetChosenFiles();
  ciBridge.reset();   // …and a device's answer to a panel that is gone reaches nobody
  midiInDecode.reset();     // …and a bend half way through its thinning belongs to no panel
  mpeShared = null;         // …and a new panel sets its own zone
  dawPageGestures.clear();  // …and the plug-in ended the window's gestures with it
  forgetOsc();              // …and its OSC port closes, and its targets are forgotten
  controlOrigins.clear();
  if (midiInTimer !== null) { clearTimeout(midiInTimer); midiInTimer = null; }
}

// @module ce.storage
/* ------------------------------------------------------------------------------ ce.storage */
// Two lifetimes, deliberately kept apart. `state` lives as long as the script is loaded — in the
// C++ engines that falls out of the per-script environment for free, and here it falls out of the
// handler cache, so both behave the same. Settings outlive the session: they go into the panel
// document under scripting.settings, which is what makes them travel with the panel and survive an
// export. In the player they are the plug-in instance's, which saves them with the DAW project (see
// the scopes below). This said they rode along in the DAW state from the document in memory; nothing
// carried them there, and a setting saved with the window open was gone when the project reopened.

const scriptState = new Map();   // scriptId -> the script's own scratch table

function stateFor(scriptId) {
  if (!scriptState.has(scriptId)) scriptState.set(scriptId, {});
  return scriptState.get(scriptId);
}

/* ------------------------------------------------------------------- storage scopes (§43)
 * `state` is per-script and says so. Settings were panel-wide and said nothing, so two scripts both
 * saving "count" clobbered each other in silence — an asymmetry nobody had written down.
 *
 * Three scopes now, and they differ in WHO SEES the value and WHERE it lives:
 *
 *   panel  — the default, and what settings have always been. Shared by every script on the panel,
 *            stored in the document, travels with it.
 *   script — private to the calling script, the way `state` already is. Same store, a key nobody
 *            else can spell, so nothing about persistence changes.
 *   local  — THIS MACHINE only, never written into the document. A panel you send somebody should
 *            not carry your MIDI port choice with it.
 *
 * script scope is a key prefix rather than a second store on purpose: a private setting should
 * persist and travel exactly like a shared one, and only its visibility differs.
 *
 * In the exported plug-in both stores are the instance's own, and two copies of a panel keep theirs
 * apart: the instance saves them with the DAW project ("local" under this machine's id, applied on
 * no other) and the page reads and writes them through the host (playerScriptHost.js,
 * createInstanceStorage), so the window open and the window closed see one store.
 */
const STORAGE_SCOPES = ['panel', 'script', 'local'];
const LOCAL_STORAGE_PREFIX = 'ce.storage:';

/** The scope asked for, or NOTHING when it is not one this build knows.
 *
 *  Refusing rather than falling back to "panel": storing a value in a scope the caller did not ask
 *  for is how a private setting quietly becomes a shared one, and a typo in a scope name would be
 *  the way it happened. Every verb below bails on nothing.
 *
 *  A typo in the KEY is the same leak by another door, and it used to walk straight through:
 *  `saveSetting(k, v, { scop = "script" })` has no `scope`, so it was "panel", and another script
 *  read the value. So an options table with any key but `scope` is refused too, in the words every
 *  other member's unknown key is refused in (applyOptionChecks), which leaves these to say it
 *  here. The keys are sorted, so the four runtimes, whose tables keep different orders, say the
 *  same words. A key that is a number is a list entry, as everywhere else, and is left alone.
 *
 *  `verb` is the call's namespaced path, ce.storage.saveSetting and so on.
 */
function storageScopeOf(opts, scriptId, verb) {
  if (isOptionsTable(opts)) {
    const unknown = Object.keys(opts).filter((key) => key !== 'scope' && !LIST_KEY.test(key)).sort();
    if (unknown.length) {
      const quoted = andList(unknown.map((key) => `"${key}"`));
      addScriptTrace('error', scriptId ?? '', unknown.length === 1
        ? `${verb}: ${quoted} is not one of its options, so nothing was done. Its only option is scope.`
        : `${verb}: ${quoted} are not among its options, so nothing was done. Its only option is scope.`);
      return undefined;
    }
  }
  const raw = typeof opts === 'string' ? opts : opts?.scope;
  if (raw == null || raw === '') return 'panel';
  // In any case, as every word from a list is read: "Local" is "local".
  const scope = String(raw).trim().toLowerCase();
  if (STORAGE_SCOPES.includes(scope)) return scope;
  addScriptTrace('error', scriptId ?? '',
    `${verb}: "${String(raw)}" is not a scope, so nothing was done. One of: ${STORAGE_SCOPES.join(', ')}.`);
  return undefined;
}

/** The key a scope actually stores under. Script scope carries the owner in the key; the prefix is
 *  chosen to be one a hand-written key could not collide with by accident.
 *
 *  U+0001 rather than U+0000, and the same in all four runtimes: the C++ engines pass a key through
 *  juce::String, which is NUL-terminated, so a NUL in a key would truncate it there and the editor
 *  and the export would disagree about what a private key is even called.
 */
const SCRIPT_KEY_PREFIX = '\u0001script:';

function storageKeyFor(scope, key, scriptId) {
  const k = String(key ?? '');
  return scope === 'script' ? `${SCRIPT_KEY_PREFIX}${scriptId ?? ''}:${k}` : k;
}

/** …and back, for listing: nil when the stored key does not belong to this scope. */
function storageKeyFrom(scope, stored, scriptId) {
  const prefix = `${SCRIPT_KEY_PREFIX}${scriptId ?? ''}:`;
  if (scope === 'script') return stored.startsWith(prefix) ? stored.slice(prefix.length) : undefined;
  // A panel listing hides other scripts' private keys rather than showing an unusable spelling.
  return stored.startsWith(SCRIPT_KEY_PREFIX) ? undefined : stored;
}

function settingsStore() {
  // The plug-in instance's own store, window open in the player (playerScriptHost.js).
  if (host?.storage) return host.storage.read('panel');
  const panel = activePanel();
  if (!panel) return null;
  panel.scripting ??= {};
  panel.scripting.settings ??= {};
  return panel.scripting.settings;
}

/** The machine-local store. Absent in a test run and in any host without one, which `info()`
 *  reports rather than leaving a script to guess why nothing persisted. */
function localStore() {
  try {
    return (typeof localStorage !== 'undefined' && localStorage) ? localStorage : null;
  } catch { return null; }        // a browser with storage disabled throws on access, not on use
}

function localRead() {
  if (host?.storage) return host.storage.read('local');
  const store = localStore();
  if (!store) return null;
  const panel = activePanel();
  const key = LOCAL_STORAGE_PREFIX + String(panel?.id ?? '');
  try { return JSON.parse(store.getItem(key) ?? '{}') ?? {}; } catch { return {}; }
}

function localWrite(map) {
  const store = localStore();
  if (!store) return false;
  const panel = activePanel();
  try { store.setItem(LOCAL_STORAGE_PREFIX + String(panel?.id ?? ''), JSON.stringify(map)); return true; }
  catch { return false; }         // quota, private browsing — reported by the caller, never thrown
}

/** A setting's name: text, or a number used as text. Left out, or anything else, is refused,
 *  `outcome` finishing "so …"; left out, it was saved under "" or read from there without a word.
 *  "" itself is text, and a name: clear() and all() reach what an older script saved there. */
function storageName(verb, key, scriptId, outcome) {
  if (typeof key === 'string') return key;
  if (typeof key === 'number' && Number.isFinite(key)) return String(key);
  addScriptTrace('error', scriptId ?? '', key === undefined || key === null
    ? `${verb}: no name was given, so ${outcome}.`
    : `${verb}: ${shownValue(key)} is not a name, so ${outcome}. A name is text, or a number used as text.`);
  return undefined;
}

function saveSetting(key, value, opts, scriptId) {
  const verb = 'ce.storage.saveSetting';
  const name = storageName(verb, key, scriptId, 'nothing was saved');
  if (name === undefined) return false;
  // Nothing to save is no value, where it answered true and saved nothing: a Lua table cannot hold
  // nil, so no runtime could keep one.
  if (value === undefined || value === null) {
    addScriptTrace('error', scriptId ?? '', `${verb}: no value was given for "${name}", so nothing was saved. `
      + 'ce.storage.forget() deletes a setting.');
    return false;
  }
  const scope = storageScopeOf(opts, scriptId, verb);
  if (!scope) return false;
  const stored = storageKeyFor(scope, name, scriptId);
  // In the player, both scopes are the instance's, and every write goes back to it.
  if (host?.storage) return host.storage.write(scope === 'local' ? 'local' : 'panel', stored, value);
  if (scope === 'local') {
    const map = localRead();
    if (!map) {
      addScriptTrace('error', scriptId ?? '',
        `saveSetting("${key}"): this build has no machine-local store, so nothing was saved. `
        + 'ce.storage.info() says which stores are available.');
      return false;
    }
    map[stored] = value;
    if (localWrite(map)) return true;
    addScriptTrace('error', scriptId ?? '', `saveSetting("${key}"): the local store refused the write.`);
    return false;
  }
  const store = settingsStore();
  if (!store) {
    addScriptTrace('error', scriptId ?? '', `saveSetting("${key}"): no active panel to store it on`);
    return false;
  }
  store[stored] = value;
  return true;
}

function loadSetting(key, fallback, opts, scriptId) {
  const name = storageName('ce.storage.loadSetting', key, scriptId, 'the fallback was given back');
  if (name === undefined) return fallback;
  const scope = storageScopeOf(opts, scriptId, 'ce.storage.loadSetting');
  if (!scope) return fallback;
  const stored = storageKeyFor(scope, name, scriptId);
  const source = scope === 'local' ? localRead() : settingsStore();
  const v = source?.[stored];
  return v === undefined ? fallback : v;
}

/** Every key this panel has saved IN THIS SCOPE. Empty means nothing written — not "settings
 *  unavailable", which is what info() is for. */
function listSettings(opts, scriptId) {
  const scope = storageScopeOf(opts, scriptId, 'ce.storage.settings');
  if (!scope) return [];
  const source = (scope === 'local' ? localRead() : settingsStore()) ?? {};
  return Object.keys(source)
    .map((k) => storageKeyFrom(scope, k, scriptId))
    .filter((k) => k !== undefined);
}

/** Every setting as a table — the read every other module got, instead of listing keys and looping
 *  to fetch each one. */
function allSettings(opts, scriptId) {
  const scope = storageScopeOf(opts, scriptId, 'ce.storage.all');
  if (!scope) return {};
  const source = (scope === 'local' ? localRead() : settingsStore()) ?? {};
  const out = {};
  for (const [stored, value] of Object.entries(source)) {
    const key = storageKeyFrom(scope, stored, scriptId);
    if (key !== undefined) out[key] = value;
  }
  return out;
}

/** Delete one. Returns whether there was one, so "cleaned up" reads differently from "nothing
 *  there" — the distinction the whole module keeps. */
function forgetSetting(key, opts, scriptId) {
  const name = storageName('ce.storage.forget', key, scriptId, 'nothing was deleted');
  if (name === undefined) return false;
  const scope = storageScopeOf(opts, scriptId, 'ce.storage.forget');
  if (!scope) return false;
  const stored = storageKeyFor(scope, name, scriptId);
  if (host?.storage) return host.storage.forget(scope === 'local' ? 'local' : 'panel', stored);
  if (scope === 'local') {
    const map = localRead();
    if (!map || !(stored in map)) return false;
    delete map[stored];
    return localWrite(map);
  }
  const store = settingsStore();
  if (!store || !(stored in store)) return false;
  delete store[stored];
  return true;
}

/** Forget everything in one scope, and say how many went. Panel scope leaves other scripts' private
 *  keys alone: "clear my settings" must not mean "clear everybody's". */
function clearSettings(opts, scriptId) {
  const scope = storageScopeOf(opts, scriptId, 'ce.storage.clear');
  if (!scope) return 0;
  const keys = listSettings(opts, scriptId);
  let gone = 0;
  for (const key of keys) if (forgetSetting(key, opts, scriptId)) gone += 1;
  return gone;
}

/**
 * Which store a scope is talking to, and what is in it.
 *
 * The three scopes have genuinely different backing — the panel document, this machine, the DAW
 * project — and a script that has just failed to persist something deserves to know which one it
 * was talking to rather than guessing. `available` is the honest field: false means writes in this
 * scope will not stick, which is a thing to say once rather than discover per key.
 */
function storageInfo(opts, scriptId) {
  const scope = storageScopeOf(opts, scriptId, 'ce.storage.info');
  if (!scope) return undefined;
  const source = scope === 'local' ? localRead() : settingsStore();
  const contents = allSettings(opts, scriptId);
  let bytes = 0;
  try { bytes = JSON.stringify(contents).length; } catch { bytes = -1; }
  return {
    scope,
    // What the store IS, rather than what it is called: the editor keeps panel-scope settings in
    // the document, and the exported plugin keeps them in the DAW project state.
    backing: scope === 'local' ? 'machine' : (host ? 'project' : 'panel'),
    available: source != null,
    count: Object.keys(contents).length,
    bytes,
  };
}

/* --------------------------------------------------------------------------- JSON (§43)
 * A Q10 exception, and the same one now() was. The Lua engine opens base, math, string and table —
 * there is no json module, and no way to write one that is not a parser. JavaScript and Python each
 * have their own, with different names and different edge cases. So "use the language's own" was
 * never available to a cross-runtime script.
 *
 * Here rather than in ce.core because encoding is what you do to put a structure somewhere: into a
 * setting, into a SysEx payload, into a text control somebody typed a config into.
 */
/** Every object key anywhere in a value, so the four runtimes can sort them into one order.
 *
 *  Keys come out SORTED, everywhere. Not a stylistic choice: a Lua table has no insertion order to
 *  preserve, so sorted is the only ordering all four runtimes are able to produce — and it is the
 *  ordering that makes two encodings of the same structure comparable, which is half of what encode
 *  is for. (Sort order is the language's own string order. Those agree over ASCII, which panel keys
 *  are; above the BMP JavaScript orders by UTF-16 unit where the others order by code point.)
 */
function jsonKeysOf(value, out, seen) {
  if (!value || typeof value !== 'object') return out;
  if (seen.has(value)) return out;              // a cycle: stop here, stringify will refuse below
  seen.add(value);
  if (Array.isArray(value)) for (const v of value) jsonKeysOf(v, out, seen);
  else for (const k of Object.keys(value)) { out.add(k); jsonKeysOf(value[k], out, seen); }
  return out;
}

// encode's indent as it reads it: left out, one line; a number, or text that is one, rounded down
// and held to 0 to 10; anything else one line. Each value it cannot use as written is said once,
// where it was used without a word, and differently in each runtime ("2" was one line in Python and
// two spaces elsewhere, 20 was 20 spaces in Lua and Python and 10 here).
const storageWarned = new Set();
function storageSaid(said) {
  if (storageWarned.has(said)) return;
  storageWarned.add(said);
  addScriptTrace('warn', '', `${said} This is said only the first time.`);
}
function jsonIndent(opts) {
  const raw = isOptionsTable(opts) ? opts.indent : undefined;
  if (raw === undefined || raw === null) return 0;
  const n = realNumber(raw);
  const said = (why, used) => storageSaid(`ce.storage.encode: indent is ${shownValue(raw)}, which is ${why}, so ${used}.`);
  if (n === undefined) { said('not a number', 'the text is on one line'); return 0; }
  if (n < 0) { said('below 0', 'the text is on one line'); return 0; }
  if (n > 10) { said('above 10', '10 was used'); return 10; }
  return Math.floor(n);
}

function encodeJson(value, opts) {
  const indent = jsonIndent(opts);
  try {
    const keys = [...jsonKeysOf(value, new Set(), new Set())].sort();
    return JSON.stringify(value, keys.length ? keys : undefined, indent > 0 ? indent : undefined);
  } catch {
    // A cycle, or a value with no JSON form. Nothing back rather than a string that is not the
    // value — which is the same rule every "cannot read that" in this API follows.
    return undefined;
  }
}

/** JSON null read as NOTHING: an absent member, a skipped element.
 *
 *  Not a preference — a Lua table cannot hold a null, and a value the four runtimes cannot all hold
 *  is not a value this API has. So `{"a":1,"b":null}` reads as one key everywhere, and
 *  `[1,null,2]` as a two-element list everywhere, rather than as three shapes in three engines.
 */
function stripJsonNulls(v) {
  if (Array.isArray(v)) return v.filter((x) => x !== null).map(stripJsonNulls);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) if (x !== null) out[k] = stripJsonNulls(x);
    return out;
  }
  return v;
}

// Text that is not JSON answers nothing and says so: telling a bad config from an empty one is the
// point of answering nothing, and the script was told neither. Nothing given, or a value that is not
// text, is refused the same way; a number was read as its own text.
function decodeJson(text) {
  const verb = 'ce.storage.decode';
  if (text === undefined || text === null) {
    addScriptTrace('error', '', `${verb}: no text was given, so there is no answer.`);
    return undefined;
  }
  if (typeof text !== 'string') {
    addScriptTrace('error', '', `${verb}: ${shownValue(text)} is not text, so there is no answer.`);
    return undefined;
  }
  try {
    const v = JSON.parse(text);
    return v === null ? undefined : stripJsonNulls(v);
  } catch {
    addScriptTrace('error', '', `${verb}: the text is not JSON, so there is no answer.`);
    return undefined;
  }
}

/* --------------------------------------------------------- reading what a script passed */

/** An options table, rather than a list, a typed array, text or nothing. */
function isOptionsTable(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !ArrayBuffer.isView(value);
}

// A key that is a number is a list entry: wasmoon hands a Lua list over as an object with keys
// "1", "2", …, and a list is not a table of options or filters, whatever argument it arrived in.
const LIST_KEY = /^\d+$/;

/* ------------------------------------------------------- option keys a call does not take
 * An options table is the one argument where a mistake cannot show. `{ easing = "outBack" }` on
 * ce.anim.to moved in a straight line, `{ time = 800 }` took 300 ms, `{ onDone = fn }` never ran,
 * ce.draw.transform({ rotation = 45 }) turned nothing because the option is `rotate`, and a NRPN
 * declared with `{ mbs = 1 }` sent MSB 0. Every one of those calls succeeded.
 *
 * So every call is checked against the fields panelApi.js lists for that member's options
 * (optionChecks), here where the functions are handed to scripts rather than inside each one: one
 * check, driven by the contract, so a field the contract gains is a field the check accepts. A key
 * that is not listed REFUSES the call: nothing is done, the console says which keys and lists the
 * options the member has, and the call answers what the member answers for any other refusal
 * (refusalOf). The owner decided that over the warning this used to be: a call that runs without
 * an option it was given has not done what it was asked.
 *
 * The C++ engines' preludes carry the same check, generated from the same lists by
 * tools/scripts/gen-script-modules.mjs, in the same words, so a panel cannot work in the exported
 * plug-in and refuse here, or the other way round; scriptPreludeAgreement.test.js holds them to it.
 * The keys are named sorted, because a Lua table and a Python dict keep no order a message could
 * follow, and the groups come own options first, then each option's own, in the contract's order.
 *
 * What is not a mistake, and is not checked:
 *  · a key that is a number. wasmoon hands a Lua list over as an object with keys "1", "2", …, and
 *    a list is not an options table, whatever argument it arrived in.
 *  · anything inside an option's value, unless the contract lists that option's own fields (a
 *    NRPN's msb and lsb): a curve's four numbers, a SysEx template, a state's `when`.
 *  · a section name where `<section>` is listed: ce.panel.create's and clone's props.
 *  · a member whose options list no fields. The contract does not say what it takes, so nothing
 *    here can say what it does not.
 *  · the members that check their own keys, in words of their own (MEMBERS_CHECKING_OWN_OPTIONS).
 */

/** The section names a control can carry: what a `<section>` field accepts. */
const SECTION_NAMES = new Set(Object.keys(SECTION_DEFAULTS));

/** Member id -> { path, refusal, callback, params: [{ index, shape }] }, from the contract. */
const OPTION_CHECKS = new Map(optionChecks().map((check) => [check.id, {
  ...check,
  // Where 'unanswered' finds the callback it calls with nothing: dialog's onChoice, and so on.
  callback: (MEMBER_BY_ID[check.id].params ?? []).findIndex((p) => p.type === 'function'),
}]));

/** The keys `opts` holds that `shape` does not list, as groups: its own first, then those inside
 *  each option that lists fields of its own, in the contract's order. Each group's keys sorted. */
function unknownOptionKeys(opts, shape, parent = '', out = []) {
  const unknown = Object.keys(opts).filter((key) => !LIST_KEY.test(key) && !shape.names.includes(key)
    && !(shape.sections && SECTION_NAMES.has(key))).sort();
  if (unknown.length) out.push({ parent, keys: unknown, shape });
  for (const name of shape.names) {
    const inner = shape.nested[name];
    if (inner && Object.hasOwn(opts, name) && isOptionsTable(opts[name])) {
      unknownOptionKeys(opts[name], inner, parent ? `${parent}.${name}` : name, out);
    }
  }
  return out;
}

/** What a refused call answers, by the kinds panelApi.js's REFUSAL_ANSWERS names. */
function refusedAnswer({ refusal, callback }, lines, args) {
  switch (refusal) {
    case 'false': return false;
    case 'zero': return 0;
    case 'empty list': return [];
    case 'result': return { ok: false, error: lines.join(' ') };
    case 'unanswered': {
      // False from dialog, prompt and choose means the callback has already run with no answer, so
      // a script waiting on it never has to wonder whether it still might. It runs inside the
      // script's own call, so a throw from it is the calling handler's, reported as that is.
      const fn = args[callback];
      if (typeof fn === 'function') fn(undefined);
      return false;
    }
    default: return undefined;
  }
}

// One wrapper per function, so a function every script shares (checksum, panic, encodeJson) stays
// one function, as the approval guard needs it to be.
const optionCheckers = new WeakMap();

function withOptionCheck(fn, check) {
  let checked = optionCheckers.get(fn);
  if (!checked) {
    checked = function checkedOptions(...args) {
      const lines = [];
      for (const { index, shape } of check.params) {
        if (!isOptionsTable(args[index])) continue;
        for (const group of unknownOptionKeys(args[index], shape)) lines.push(unknownOptionsMessage(check.path, group));
      }
      if (!lines.length) return fn.apply(this, args);
      for (const line of lines) addScriptTrace('error', '', line);
      return refusedAnswer(check, lines, args);
    };
    optionCheckers.set(fn, checked);
  }
  return checked;
}

/** Put the check in front of every member whose options the contract lists. */
function applyOptionChecks(flat) {
  for (const [memberId, check] of OPTION_CHECKS) {
    if (typeof flat[memberId] === 'function') flat[memberId] = withOptionCheck(flat[memberId], check);
  }
}

/** For the tests: the members whose option keys are checked, by namespaced path. */
export function optionCheckedMembersForTesting() {
  return [...OPTION_CHECKS.values()].map((c) => c.path).sort();
}

// @module -
/**
 * ce.patch over the panel view: patchCore.js's commands, reading and sending through the same
 * functions the ce.device, ce.panel, ce.math and ce.storage commands use, for this script.
 */
function patchHostFor(scriptId) {
  return {
    say: (level, text) => addScriptTrace(level === 'warn' ? 'warn' : 'error', scriptId, text),
    profile: (role) => deviceProfileRead(role || DEFAULT_ROLE),
    parameters: (role) => deviceParametersRead({ role: role || DEFAULT_ROLE }),
    read: (id, role) => deviceValueRead(id, role || DEFAULT_ROLE),
    write: (id, value, role) => deviceValueWrite(id, value, role || DEFAULT_ROLE),
    fill: (values) => midiApi.applyDump(values),
    snapshot: () => panelSnapshotImpl(),
    restore: (values) => panelRestoreImpl(values),
    requestDump: (kind, fn, opts) => requestDumpImpl(kind, fn, opts, scriptId),
    sendDump: (kind) => midiApi.sendDump(kind),
    setVariable: (name, value, role) => deviceOverrideWrite('variables', name, value, role || DEFAULT_ROLE),
    patchSection: (role) => {
      const source = deviceProfileSource(role || DEFAULT_ROLE, { own: true });
      return source && typeof source.patch === 'object' ? source.patch : null;
    },
    random: () => randomImpl(scriptId),
    now: () => new Date().toISOString(),
    store: {
      get: (key) => loadSetting(key, undefined, undefined, scriptId),
      set: (key, value) => saveSetting(key, value, undefined, scriptId),
      keys: () => listSettings(undefined, scriptId) ?? [],
      remove: (key) => forgetSetting(key, undefined, scriptId),
    },
  };
}

/**
 * ce.verify's host for one script (docs/design/ce-verify-module.md). The checks themselves are the
 * panel's, in verifyJobs, so a script's Stop button can cancel what another script's Check button
 * started; the report reaches every script as onVerifyDone.
 */
const verifyJobs = {};

function verifyHostFor(scriptId) {
  return {
    say: (level, text) => addScriptTrace(level === 'warn' ? 'warn' : 'error', scriptId, text),
    parameters: (role) => deviceParametersRead({ role: role || DEFAULT_ROLE }),
    layout: (role) => {
      const source = deviceProfileSource(role || DEFAULT_ROLE);
      if (!source) return null;
      const encodings = {};
      for (const p of Array.isArray(source.parameters) ? source.parameters : []) {
        if (p && typeof p.id === 'string' && p.encoding && typeof p.encoding === 'object') encodings[p.id] = p.encoding;
      }
      return {
        dumps: Array.isArray(source.dumpDefinitions) ? source.dumpDefinitions : [],
        requests: Array.isArray(source.requests) ? source.requests : [],
        encodings,
        gapMs: deviceTimingRead(role || DEFAULT_ROLE)?.minDelayBetweenMessagesMs,
      };
    },
    read: (id, role) => deviceValueRead(id, role || DEFAULT_ROLE),
    write: (id, value, role) => deviceValueWrite(id, value, role || DEFAULT_ROLE),
    sendDump: (kind) => midiApi.sendDump(kind),
    patchSection: (role) => {
      const source = deviceProfileSource(role || DEFAULT_ROLE, { own: true });
      return source && typeof source.patch === 'object' ? source.patch : null;
    },
    connected: (role) => deviceConnectedRead(role || DEFAULT_ROLE) === true,
    requestDump: (kind, fn) => requestDumpImpl(kind, fn, undefined, scriptId),
    after: (ms, fn) => afterFor(scriptId, ms, fn, 'ce.verify'),
    clock: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    emit: (report) => deliverEmit('onVerifyDone', null, report),
    jobs: verifyJobs,
  };
}

/**
 * ce.file (docs/design/ce-file-module.md). The byte commands are fileCore.js, the same code the
 * JavaScript prelude runs; the dialogs are scriptFileHost.js over the native side's "scriptFile"
 * event (CE/src/ScriptFiles.h), one per script so its messages and functions are its own, with the
 * folders' listings shared, as a folder one script chose is every script's to list.
 */
const fileDialogSet = new Set();
const fileListings = new Map();
let fileResultsHeard = false;

function fileDialogsFor(scriptId) {
  if (!fileResultsHeard && isJuceAvailable() && typeof window.__JUCE__.backend.addEventListener === 'function') {
    fileResultsHeard = true;
    window.__JUCE__.backend.addEventListener('scriptFileResult', (result) => {
      for (const dialogs of fileDialogSet) dialogs.receive(result);
    });
  }
  const dialogs = createFileDialogs({
    say: (level, text) => addScriptTrace(level === 'warn' ? 'warn' : 'error', scriptId, text),
    send: (payload) => {
      if (!isJuceAvailable()) return false;
      window.__JUCE__.backend.emitEvent('scriptFile', payload);
      return true;
    },
    call: (fn, ...args) => runScriptCallback(scriptId, 'ce.file', () => fn(...args)),
    listings: fileListings,
  });
  fileDialogSet.add(dialogs);
  return dialogs;
}

/**
 * ce.ci (docs/design/ce-ci-module.md): one bridge to the device layer's MIDI-CI session for the panel,
 * with what it has heard of devices and profiles; each script gets its own commands over it.
 */
const ciBridge = createCiBridge({
  send: (name, payload) => {
    if (!isJuceAvailable()) return false;
    window.__JUCE__.backend.emitEvent(name, payload);
    return true;
  },
  raise: (name, payload) => deliverEmit(name, null, payload),
});
let ciHeard = false;

function ciFor(scriptId) {
  if (!ciHeard && isJuceAvailable() && typeof window.__JUCE__.backend.addEventListener === 'function') {
    ciHeard = true;
    for (const name of ['ciCommandAnswered', 'ciReply', 'ciDiscovered', 'ciDeviceRemoved', 'ciProfileChanged']) {
      window.__JUCE__.backend.addEventListener(name, (payload) => ciBridge.heard(name, payload));
    }
  }
  return ciBridge.forScript({
    say: (level, text) => addScriptTrace(level === 'warn' ? 'warn' : 'error', scriptId, text),
    call: (fn, value) => runScriptCallback(scriptId, 'ce.ci', () => fn(value)),
  });
}

/** Tests stand in for the native side: what it sends back, as it would arrive. */
export function ciHeardForTesting(name, payload) { ciBridge.heard(name, payload); }

/** The panel closed: the files the person chose go with it, here and natively. */
function forgetChosenFiles() {
  if (fileDialogSet.size === 0 && fileListings.size === 0) return;
  for (const dialogs of fileDialogSet) dialogs.forget();
  fileDialogSet.clear();
  fileListings.clear();
}

function buildApi(ownerName, scriptId = '', guardExecution = false) {
  const fileBytes = fileCommands({
    say: (level, text) => addScriptTrace(level === 'warn' ? 'warn' : 'error', scriptId, text),
    clock: () => { const t = transportSnapshot(); return { tempo: t.bpm, beatsPerBar: t.beatsPerBar }; },
  });
  let fileDialogs = null;
  const dialogs = () => (fileDialogs ??= fileDialogsFor(scriptId));
  let ciCommandsOwn = null;
  const ci = () => (ciCommandsOwn ??= ciFor(scriptId));
  const patch = patchCommands(patchHostFor(scriptId));
  const verify = verifyCommands(verifyHostFor(scriptId));
  const daw = dawCommands(dawHostFor(scriptId));
  const self = {
    set: (p, v, form) => scriptSet(ownerName ? `${ownerName}.${p}` : p, v, form),
    get: (p, form) => getValue(ownerName ? `${ownerName}.${p}` : p, form, true),
  };
  const api = {
    // The third argument is the value form for the second-argument spelling, or the contract's opts
    // object: setValue reads a string as a form and an object as opts. This passed '' for an
    // object, so set(path, v, { transmit = false }) was accepted and its `transmit` never reached
    // the write, in the editor only: the player's host has always read it.
    set: (path, value, form) => scriptSet(path, value, form),
    get: (path, form) => getValue(path, form, true),
    log: (msg, val) => scriptPrint('log', scriptId, msg, val),
    // Levels the console already renders differently — the runtime uses the distinction constantly
    // and a script could not, so a real failure read exactly like a debug print.
    //
    // logWarn / logError, NOT warn / error: a global `error` would SHADOW Lua's builtin in the
    // sibling engine, turning the standard way to raise into a print. ce.core.warn/.error are the
    // spellings anybody writes; the flat aliases are defensive, like isPlaying beside .playing.
    logWarn: (msg, val) => scriptPrint('warn', scriptId, msg, val),
    // Prints. Does NOT throw — a script wanting to stop uses its own language's error/throw.
    logError: (msg, val) => scriptPrint('error', scriptId, msg, val),
    // MIDI/device — real raw send via the device bridge; bulk codec is a fast-follow.
    ...midiApi,
    // Zone Splitter — change the split from a footswitch.
    ...splitApi,
    // Phrase Sequencer — swap the riff, transpose it, run it backwards.
    ...phraseApi,
    // Phrase Recorder — arm it, undo a pass, quantise the take.
    ...recorderApi,
    // Harmoniser — re-key it mid-song.
    ...harmoniserApi,
    // Setlist — next song, from a button or a script.
    ...setlistApi,
    // …and the other twenty-three families, expanded from componentVerbs.js.
    ...componentVerbApi,
    // flow
    emit: (name, data) => deliverEmit(String(name ?? ''), null, data),
    run: (ref, args) => runAction(ref, args),
    on: (target, event, fn) => addListener(scriptId, target, event, fn),
    off: (target, event) => removeListener(scriptId, target, event),
    // the reactive core — rules the runtime keeps applying, not values it writes once
    // the wire filters need the caller's id, so they are bound here rather than in midiApi
    interceptMidiIn: (fn) => putMidiFilter(midiIn, scriptId, fn),
    interceptMidiOut: (fn) => putMidiFilter(midiOut, scriptId, fn),
    routeMidi: (role, fn) => {
      if (typeof fn !== 'function') { addScriptTrace('error', scriptId, 'routeMidi(role, fn) needs a block to run'); return; }
      const previous = routedRole;
      routedRole = String(role ?? '') || null;
      // finally, not a trailing restore: a throw inside the block must not leave every later send
      // in the session pointed at the wrong synth.
      try { fn(); } finally { routedRole = previous; }
    },
    watch: (path, fn) => addWatch(scriptId, path, fn),
    compute: (path, fn) => addCompute(scriptId, path, fn),
    intercept: (path, fn) => addIntercept(scriptId, path, fn),
    defineAction: (name, fn) => defineActionImpl(scriptId, name, fn),
    startTimer: (id, ms) => startTimer(id, ms),
    stopTimer: (id) => stopTimer(id),
    after: (ms, fn) => afterRead(scriptId, ms, fn),
    // ce.anim — values that move over time
    animateTo: (path, target, opts) => startAnimationImpl(scriptId, 'to', path, target, opts ?? {}),
    animateSpring: (path, target, opts) => startAnimationImpl(scriptId, 'spring', path, target, opts ?? {}),
    animateEnvelope: (path, points, opts) => startEnvelopeImpl(scriptId, path, points, opts ?? {}),
    animateStop: (path) => stopAnimationImpl(path),
    animateRunning: (path) => animationRunningImpl(path),
    animateValue: (path) => animationValueImpl(path),
    animateList: () => animationListImpl(),
    animatePause: (path) => animationPauseImpl(path),
    animateResume: (path) => animationResumeImpl(path),
    animateReverse: (path) => animationReverseImpl(path),
    animateFinish: (path) => animationFinishImpl(path),
    animatePlay: (control, animation) => animatePlayImpl(control, animation),
    // ce.ui — a message for whoever is using the panel
    uiNotify: (message, opts) => uiNotifyImpl(message, opts),
    uiDismiss: (id) => uiDismissImpl(id),
    uiUpdate: (id, message, opts) => uiUpdateImpl(id, message, opts),
    uiStatus: (message, opts) => uiStatusImpl(message, opts),
    uiState: () => uiStateImpl(),
    uiCopy: (text) => uiCopyImpl(scriptId, text),
    // prompt and choose are dialog() with a different SHAPE of question — one modal at a time,
    // one callback contract, one teardown, whatever is being asked. Each names its own shape after
    // the script's options, dialog included: `ask` is how these three tell the store apart, not an
    // option of any of them, so a script's `ask` is refused as an unknown key, never obeyed.
    uiDialog: (opts, onChoice) => uiDialogImpl(scriptId,
      isOptionsTable(opts) ? { ...opts, ask: 'choice' } : opts, onChoice),
    uiPrompt: (opts, onAnswer) => uiDialogImpl(scriptId, { ...(opts ?? {}), ask: 'text' }, onAnswer),
    uiChoose: (opts, onAnswer) => uiDialogImpl(scriptId, { ...(opts ?? {}), ask: 'list' }, onAnswer),
    // ce.draw — immediate-mode drawing on top of a control
    drawClear: (target) => drawClearImpl(target, ownerName),
    // A gradient is an OBJECT, so fill/stroke pass it through rather than stringifying it — the
    // overlay turns it into the url(#…) reference SVG needs. A colour is read by drawPaint: the
    // panel's own forms become CSS, and what SVG could not paint is refused with the style unchanged.
    drawFill: (colour) => {
      const paint = drawPaint('ce.draw.fill', 'the fill', colour);
      if (paint !== undefined) drawState.fill = paint;
    },
    drawStroke: (colour, width, opts) => {
      const paint = drawPaint('ce.draw.stroke', 'the stroke', colour);
      if (paint === undefined) return;
      drawState.stroke = paint;
      // A width that is not a number above 0 is 1, and said once: it was 1 in silence. Text that
      // is a number is read as one, as every drawing number is (realNumber).
      const w = realNumber(width);
      if (width !== undefined && width !== null && !(w > 0)) {
        warnDrawStroke({ severity: 'warning', message: `ce.draw.stroke: the width is ${shownValue(width)}, not a number above 0, so 1 is drawn.` });
      }
      drawState.strokeWidth = w > 0 ? w : 1;
      // A dash is a list of on/off lengths, the way SVG and every drawing API since PostScript
      // spells it. The panel's own dashed lines (the Transport's beat marks, the Constellation's
      // probe link) are "3 3" and "2 3". drawDash.js reads it, for this and for the script editor's
      // Values tab: a length below 0 or not a number is drawn as 0, and a dash that is not a list
      // is none, each said once in the words the Values tab says it in. So is a cap or a join that
      // is not one of its three words, which draws the default.
      const dash = dashPattern(opts?.dash);
      if (dash.problem) warnDrawStroke(dash.problem);
      drawState.dash = dash.dasharray;
      const cap = strokeEnd('cap', opts?.cap);
      const join = strokeEnd('join', opts?.join);
      for (const said of [cap.problem, join.problem]) if (said) warnDrawStroke(said);
      drawState.cap = cap.value;
      drawState.join = join.value;
      // dashOffset is what makes a dash MOVE: advance it on a timer and you have marching ants,
      // which is how a panel shows "this is recording" without redrawing the shape (§49).
      // …and one that is not a number was none in silence; it is said once.
      const offset = opts?.dashOffset;
      const off = realNumber(offset);
      if (offset !== undefined && offset !== null && off === undefined) {
        warnDrawStroke({ severity: 'warning', message: `ce.draw.stroke: the dashOffset is ${shownValue(offset)}, not a number of pixels, so 0 is used.` });
      }
      drawState.dashOffset = off ?? null;
    },
    drawGradient: (stops, angle) => drawGradientImpl(stops, angle),
    // Applies to everything drawn after it, like fill and stroke — not to one shape, because the
    // whole style model here is "what is in force when the command is issued".
    // Nothing given switches it off. A number outside 0..1, or something that is not a number, used
    // to be clamped (50 was fully solid) or to switch it off ("50%"); it is refused, and what is in
    // force stays.
    drawOpacity: (a) => {
      if (a === undefined || a === null) { drawState.opacity = null; return; }
      const problem = unitProblem('the opacity', a);
      if (problem) {
        addScriptTrace('error', '', `ce.draw.opacity: ${problem.why}, so the opacity stays as it was.`
          + `${problem.hint}${percentTextHint(a)}`);
        return;
      }
      drawState.opacity = realNumber(a);
    },
    // rotate/move/scale for what follows. Without it a knob pointer means computing every corner
    // with sin and cos by hand — and getting the centre of rotation wrong is the classic way a
    // pointer ends up orbiting the wrong point.
    drawTransform: (opts) => {
      if (opts == null) { drawState.transform = null; return; }
      // Each option that is not a number is its default, and said once (drawShapes.js): a rotate of
      // "x" was no rotation, a scale of "x" no scaling, in silence. A centre half given (cx without
      // cy) rotated about the top-left corner in silence, which makes a pointer orbit that corner.
      const read = (name, fallback) => {
        const { n, said } = drawOption('drawTransform', name, opts[name], fallback);
        drawSaid(`drawTransform\u0000${name}`, said);
        return n;
      };
      const parts = [];
      const x = read('x', 0);
      const y = read('y', 0);
      if (x || y) parts.push(`translate(${x} ${y})`);
      const rotate = read('rotate', 0);
      const given = (name) => opts[name] !== undefined && opts[name] !== null;
      if (given('cx') !== given('cy')) {
        const [has, lacks] = given('cx') ? ['cx', 'cy'] : ['cy', 'cx'];
        drawSaid('drawTransform\u0000centre', `ce.draw.transform: ${has} was given without ${lacks}, so the rotation is about the top-left corner.`);
      }
      if (rotate !== 0) {
        // Around a named centre, or the origin. A rotation with no centre is almost never what a
        // pointer wants, so the centre is the argument people reach for first.
        parts.push(given('cx') && given('cy')
          ? `rotate(${rotate} ${read('cx', 0)} ${read('cy', 0)})` : `rotate(${rotate})`);
      }
      const scale = read('scale', 1);
      if (scale !== 1) parts.push(`scale(${scale})`);
      drawState.transform = parts.length ? parts.join(' ') : null;
    },
    drawEllipse: (cx, cy, rx, ry) => drawRejected('drawEllipse', { cx, cy, rx, ry }) ? false : pushCommand(null, ownerName,
      { op: 'ellipse', cx: drawNum('drawEllipse', 'cx', cx), cy: drawNum('drawEllipse', 'cy', cy),
        rx: drawNum('drawEllipse', 'rx', rx), ry: drawNum('drawEllipse', 'ry', ry) }, 'drawEllipse'),
    // The app's own 5x7 LCD font, one rect per lit pixel. An LCD readout a script draws and one an
    // LCD component prints are then the same letters, which a second font would not be.
    // Its numbers are read as every shape's are, and a character it has no glyph for is said
    // (drawShapes.js): each left a gap, without a word.
    drawPixelText: (text, x, y, scale) => {
      if (drawRejected('drawPixelText', { text, x, y })) return false;
      const written = String(text ?? '');
      const { scale: s, said } = pixelScale(scale);
      drawSaid('drawPixelText\u0000scale', said);
      drawSaid(`drawPixelText\u0000gaps\u0000${written}`, pixelGapWords(written));
      return pushCommand(null, ownerName,
        { op: 'pixelText', text: written, x: drawNum('drawPixelText', 'x', x), y: drawNum('drawPixelText', 'y', y), scale: s }, 'drawPixelText');
    },
    drawMeasure: (text, opts) => drawMeasureImpl(text, opts),

    /* ce.draw, phase §49 — the bulk primitives, a style stack, clipping and images. */
    drawBatch: (fn) => runDrawBatch(fn),
    drawGrid: (opts) => drawGridImpl(null, ownerName, opts),
    drawLines: (segments) => drawLinesImpl(null, ownerName, segments),
    drawPoints: (points, r) => drawPointsImpl(null, ownerName, points, r),
    drawCurve: (points, opts) => drawCurveImpl(null, ownerName, points, opts),
    drawPolygon: (cx, cy, r, sides, opts) => drawPolygonImpl(null, ownerName, cx, cy, r, sides, opts),
    // An image needs a source the renderer can actually load: a data URL, or an icon from the
    // library resolved through ce.image. A bare name would be a string that silently draws nothing,
    // and until this refused it, it did: the command was pushed, and the overlay drew an image
    // that never loaded. An icon's name gets the exact call to use instead.
    drawImage: (src, x, y, w, h, opts) => {
      const source = String(src ?? '');
      if (!source) {
        addScriptTrace('error', '',
          'ce.draw.image: no source. Pass a data URL, or ce.image.asset(name).dataUrl for a library icon.');
        return false;
      }
      if (drawRejected('drawImage', { x, y, w, h })) return false;
      if (!/^data:/i.test(source)) {
        const shown = source.length > 60 ? `${source.slice(0, 57)}…` : source;
        addScriptTrace('error', '', findAsset(imageCatalogue(), source)
          ? `ce.draw.image: "${shown}" is an icon's name, not its image, so nothing was drawn. `
            + `Pass ce.image.asset("${shown}").dataUrl.`
          : `ce.draw.image: "${shown}" is not image data, so nothing was drawn. Pass a data URL, or `
            + 'ce.image.asset(name).dataUrl for a library icon.');
        return false;
      }
      // A fit that is not one of its three words, in any case, is "fill", and said once: it was
      // "fill" in silence.
      const fit = listWord(['fill', 'contain', 'cover'], opts?.fit);
      if (opts?.fit !== undefined && opts?.fit !== null && !fit) {
        drawSaid('drawImage\u0000fit', `ce.draw.image: fit is ${shownValue(opts.fit)}, not "fill", "contain" or "cover", so "fill" was used.`);
      }
      return pushCommand(null, ownerName, {
        op: 'image', src: source,
        x: drawNum('drawImage', 'x', x), y: drawNum('drawImage', 'y', y), w: drawNum('drawImage', 'w', w), h: drawNum('drawImage', 'h', h),
        fit: fit ?? 'fill',
      }, 'drawImage');
    },
    // Clip and blend are STYLE, not shapes: they apply to every command issued after them, the way
    // fill and stroke do, and save()/restore() put them back.
    // A clip that leaves the control nothing to draw in hid everything after it without a word; it
    // is said, once (drawShapes.js), and its numbers are read as every shape's are.
    drawClip: (x, y, w, h) => {
      if ([x, y, w, h].every((v) => v === undefined || v === null)) { drawState.clip = null; return true; }
      // Some of the four given and not the rest: rejected, and said. A missing width or height was
      // 0, which hid everything drawn after it.
      const missing = drawMissing('drawClip', { x, y, w, h }, 'so the clip stays as it was.');
      if (missing) { addScriptTrace('error', '', missing); return false; }
      drawState.clip = {
        x: drawNum('drawClip', 'x', x), y: drawNum('drawClip', 'y', y),
        w: Math.max(0, drawNum('drawClip', 'w', w)), h: Math.max(0, drawNum('drawClip', 'h', h)),
      };
      const t = drawState.transform ? null : drawTarget(null, ownerName)?._children?.Transform;
      drawSaid('drawClip', clipWords(drawState.clip, t ? { w: Number(t.width), h: Number(t.height) } : null));
      return true;
    },
    drawBlend: (mode) => {
      const legal = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
        'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion'];
      if (mode === undefined || mode === null) {
        // It was "normal" in silence, which is what ce.draw.blend("normal") is for.
        addScriptTrace('error', '', 'ce.draw.blend: mode was not given, so the blend stays as it was.');
        return false;
      }
      // In any case: "Multiply" is "multiply", handed on as the list spells it.
      const wanted = listWord(legal, String(mode));
      if (!wanted) {
        addScriptTrace('error', '',
          `ce.draw.blend("${String(mode)}"): not a blend mode. One of: ${legal.join(', ')}.`);
        return false;
      }
      drawState.blend = wanted === 'normal' ? null : wanted;
      return true;
    },
    drawSave: () => {
      drawStateStack.push(Object.fromEntries(DRAW_STYLE_KEYS.map((k) => [k, drawState[k]])));
      return true;
    },
    drawRestore: () => {
      const saved = drawStateStack.pop();
      if (!saved) {
        addScriptTrace('error', '', 'ce.draw.restore: nothing was saved. Every restore needs a save.');
        return false;
      }
      for (const k of DRAW_STYLE_KEYS) drawState[k] = saved[k];
      return true;
    },

    /* ce.image (§50). assets/asset answer from the icon library and the icons the panel carries; the
       rest work on one control. */
    // Both filters at once, where the first one given used to be the only one applied.
    imageAssets: (opts) => imageCatalogue()
      .filter((a) => (opts?.embeddable !== true || a.embeddable) && (opts?.vector !== true || a.vector)),
    imageAsset: (idOrName) => (lookupNamed('ce.image.asset', 'id or name', idOrName)
      ? findAsset(imageCatalogue(), idOrName) ?? undefined : undefined),
    imageSet: (target, src, opts) => imageSetImpl(target, src, opts),
    imageClear: (target, layer) => imageClearImpl(target, layer),
    imageRead: (target, layer) => imageReadImpl(target, layer),
    imageIcon: (target, idOrName, opts) => imageIconImpl(target, idOrName, opts),
    imageEmbed: (target, layer) => imageEmbedImpl(target, layer),
    imageLoad: (path) => {
      const p = String(path ?? '');
      if (!p) { addScriptTrace('error', '', 'ce.image.load: no path was given, so nothing is read.'); return false; }
      if (sourceKind(p) !== 'file') return true;    // a data URL needs no loading
      loadFile(p);
      return String(get(fileCache)[p] ?? '').startsWith('data:');
    },

    // ce.text (§46). fonts/font answer from the catalogue; the rest work on one control's Text.
    textFonts: (opts) => textCatalogue()
      .filter((f) => (opts?.portable !== true || f.portable) && (opts?.variable !== true || f.variable)),
    textFont: (family) => (lookupNamed('ce.text.font', 'family', family)
      ? findFont(textCatalogue(), family) ?? undefined : undefined),
    textStyle: (target, opts) => textStyleImpl(target, opts),
    textAxis: (target, tag, value) => textAxisImpl(target, tag, value),
    textRead: (target, field) => textReadImpl(target, field),
    textMeasure: (target, text) => textMeasureImpl(target, text),
    textFit: (target, opts) => textFitImpl(target, opts),

    // ce.keys (docs/design/ce-keys-module.md). The keyboard itself, and who gets each key, is
    // scriptKeys.js's; the preview surface feeds it and plays the piano's notes.
    keysShortcut: (keys, fn, opts) => keysAddShortcut(scriptId, keys, fn, opts, (level, text) => addScriptTrace(level, scriptId, text)),
    keysRemove: (id) => keysRemoveShortcut(id),
    keysList: () => keysListShortcuts(),
    keysIsDown: (key) => keysIsDownRead(key),
    keysHeld: () => keysHeldRead(),
    keysPiano: (opts) => keysSetPiano(opts, (level, text) => addScriptTrace(level, scriptId, text)),
    keysPianoInfo: () => keysPianoInfoRead(),
    keysFocus: (control) => keysFocusControl(control),
    keysFocused: () => keysFocusedControl(),

    // ce.patch (docs/design/ce-patch-module.md): patchCore.js, the same code the JavaScript prelude runs.
    patchCurrent: (scope, opts) => patch.current(scope, opts),
    patchRead: (scope, fn, opts) => patch.read(scope, fn, opts),
    patchLoad: (name, opts) => patch.load(name, opts),
    patchMorph: (a, b, t, opts) => patch.morph(a, b, t, opts),
    patchBlend: (patches, weights, opts) => patch.blend(patches, weights, opts),
    patchRandom: (opts) => patch.random(opts),
    patchMutate: (p, amount, opts) => patch.mutate(p, amount, opts),
    patchMerge: (base, other, opts) => patch.merge(base, other, opts),
    patchDiff: (a, b, opts) => patch.diff(a, b, opts),
    patchEqual: (a, b, opts) => patch.equal(a, b, opts),
    patchApply: (p, opts) => patch.apply(p, opts),
    patchSave: (name, p, opts) => patch.save(name, p, opts),
    patchList: (opts) => patch.list(opts),
    patchForget: (name, opts) => patch.forget(name, opts),
    patchWrite: (p, slot, opts) => patch.write(p, slot, opts),
    patchScopes: (role) => patch.scopes(role),
    patchDefine: (scope, spec, role) => patch.define(scope, spec, role),

    // ce.verify (docs/design/ce-verify-module.md): verifyCore.js, the same code the JavaScript prelude runs.
    verifyCoverage: (opts) => verify.coverage(opts),
    verifyCheck: (opts, fn) => verify.check(opts, fn),
    verifyDump: (kind, opts, fn) => verify.dump(kind, opts, fn),
    verifyWrite: (id, value, opts, fn) => verify.write(id, value, opts, fn),
    verifyProbe: (id, opts, fn) => verify.probe(id, opts, fn),
    verifyPatch: (opts, fn) => verify.patch(opts, fn),
    verifySummary: (report, opts) => verify.summary(report, opts),
    verifyRunning: (role) => verify.running(role),
    verifyCancel: (role) => verify.cancel(role),

    // ce.file (docs/design/ce-file-module.md): the byte commands run everywhere, the dialogs here.
    fileOpen: (opts, fn) => dialogs().open(opts, fn),
    fileSave: (name, data, opts, fn) => dialogs().save(name, data, opts, fn),
    fileRead: (file, fn) => dialogs().read(file, fn),
    fileWrite: (file, data, fn) => dialogs().write(file, data, fn),
    fileFolder: (opts, fn) => dialogs().folder(opts, fn),
    fileList: (dir, opts) => dialogs().list(dir, opts),
    fileSaveIn: (dir, name, data, opts, fn) => dialogs().saveIn(dir, name, data, opts, fn),
    fileSyxSplit: (bytes, opts) => fileBytes.syxSplit(bytes, opts),
    fileSyxJoin: (messages) => fileBytes.syxJoin(messages),
    fileMidiRead: (bytes, opts) => fileBytes.midiRead(bytes, opts),
    fileMidiWrite: (song, opts) => fileBytes.midiWrite(song, opts),

    // ce.ci (docs/design/ce-ci-module.md): ciCore.js over the device layer's MIDI-CI session.
    ciDiscover: (opts, fn) => ci().discover(opts, fn),
    ciDevices: (role) => ci().devices(role),
    ciGet: (muid, resource, opts, fn) => ci().get(muid, resource, opts, fn),
    ciSet: (muid, resource, body, opts, fn) => ci().set(muid, resource, body, opts, fn),
    ciSubscribe: (muid, resource, opts, fn) => ci().subscribe(muid, resource, opts, fn),
    ciUnsubscribe: (id) => ci().unsubscribe(id),
    ciProfiles: (muid, fn) => ci().profiles(muid, fn),
    ciSetProfile: (muid, id, on, opts) => ci().setProfile(muid, id, on, opts),
    ciDraftProfile: (muid, fn) => ci().draftProfile(muid, fn),

    // origin() (docs/design/ce-daw-module.md): who made the change the running handler is for.
    origin: () => currentOrigin ?? undefined,
    // ce.daw: dawCore.js, answered from the plug-in's picture with the window open, and from the
    // panel in the editor, which has no DAW.
    dawHost: () => daw.host(),
    dawParameters: () => daw.parameters(),
    dawParameter: (path) => daw.parameter(path),
    dawProgram: () => daw.program(),
    dawPrograms: () => daw.programs(),
    dawBeginGesture: (path) => daw.beginGesture(path),
    dawEndGesture: (path) => daw.endGesture(path),
    dawRename: (path, name) => daw.rename(path, name),
    dawAssign: (slot, path, opts) => daw.assign(slot, path, opts),
    dawMarkChanged: () => daw.markChanged(),

    // ce.osc: oscCore.js over the device layer's OSC transport.
    oscListen: (opts) => oscFor(scriptId).listen(opts),
    oscStop: () => oscFor(scriptId).stop(),
    oscOn: (pattern, fn) => oscFor(scriptId).on(pattern, fn),
    oscOff: (id) => oscFor(scriptId).off(id),
    oscTarget: (name, address) => oscFor(scriptId).target(name, address),
    oscSend: (to, address, args, types) => oscFor(scriptId).send(to, address, args, types),
    oscBundle: (to, messages, opts) => oscFor(scriptId).bundle(to, messages, opts),
    oscStatus: () => oscFor(scriptId).status(),

    // ce.mpe: mpeCore.js, one per panel; reading MPE back in is the input decoder's.
    mpeZone: (opts) => mpeFor(scriptId).zone(opts),
    mpeNoteOn: (note, velocity, opts) => mpeFor(scriptId).noteOn(note, velocity, opts),
    mpeExpress: (id, values) => mpeFor(scriptId).express(id, values),
    mpeNoteOff: (id, velocity) => mpeFor(scriptId).noteOff(id, velocity),
    mpeAllOff: () => mpeFor(scriptId).allOff(),
    mpeNotes: () => mpeFor(scriptId).notes(),
    mpeListen: (opts) => mpeFor(scriptId).listen(opts),
    // Each coordinate read as drawShapes.js reads it: a number or text that is one, else 0, said.
    drawRect: (x, y, w, h, radius) => drawRejected('drawRect', { x, y, w, h }) ? false : pushCommand(null, ownerName,
      { op: 'rect', x: drawNum('drawRect', 'x', x), y: drawNum('drawRect', 'y', y), w: drawNum('drawRect', 'w', w),
        h: drawNum('drawRect', 'h', h), radius: Math.max(0, drawNum('drawRect', 'radius', radius)) }, 'drawRect'),
    drawCircle: (cx, cy, r) => drawRejected('drawCircle', { cx, cy, r }) ? false : pushCommand(null, ownerName,
      { op: 'circle', cx: drawNum('drawCircle', 'cx', cx), cy: drawNum('drawCircle', 'cy', cy), r: drawNum('drawCircle', 'r', r) }, 'drawCircle'),
    // Angles in DEGREES, 0 at twelve o'clock, clockwise — the way a knob's arc is described, and
    // the convention the Meter's arcStart/arcSweep already use. The renderer converts.
    drawArc: (cx, cy, r, from, to) => drawRejected('drawArc', { x: cx, y: cy, radius: r, from, to }) ? false : pushCommand(null, ownerName,
      { op: 'arc', cx: drawNum('drawArc', 'x', cx), cy: drawNum('drawArc', 'y', cy), r: drawNum('drawArc', 'radius', r),
        from: drawNum('drawArc', 'from', from), to: drawNum('drawArc', 'to', to) }, 'drawArc'),
    drawLine: (x1, y1, x2, y2) => drawRejected('drawLine', { x1, y1, x2, y2 }) ? false : pushCommand(null, ownerName,
      { op: 'line', x1: drawNum('drawLine', 'x1', x1), y1: drawNum('drawLine', 'y1', y1),
        x2: drawNum('drawLine', 'x2', x2), y2: drawNum('drawLine', 'y2', y2) }, 'drawLine'),
    // A flat { x1, y1, x2, y2, ... } list — the one shape every language expresses the same way: a
    // Lua table, a JS array, a Python list. One point or none drew nothing, and a pair that is not
    // two numbers or a trailing value with no partner was left out, all in silence; each is said
    // (drawShapes.js), the first two as a rejection.
    drawPath: (points, closed) => {
      if (drawRejected('drawPath', { points })) return false;
      const { points: list, said, odd, notList } = flatPointList(points);
      if (notList) { addScriptTrace('error', '', notList); return false; }
      drawSaid('drawPath\u0000points', said);
      drawSaid('drawPath\u0000odd', odd);
      if (list.length < 2) {
        addScriptTrace('error', '', `ce.draw.path: points has ${list.length === 0 ? 'no points' : 'one point'}, and a path needs at least two, so nothing was drawn.`);
        return false;
      }
      return pushCommand(null, ownerName, { op: 'path', points: list, closed: closed === true }, 'drawPath');
    },
    drawText: (x, y, text, opts) => {
      if (drawRejected('drawText', { x, y, text })) return false;
      const align = drawTextAlign(opts?.align);
      if (align === undefined) return false;
      // A size that is not a number above 0 is 12, and said once (drawShapes.js): it was 12 in silence.
      const { size, said: sizeSaid } = textSize('drawText', opts?.size);
      drawSaid('drawText\u0000size', sizeSaid);
      return pushCommand(null, ownerName,
        { op: 'text', x: drawNum('drawText', 'x', x), y: drawNum('drawText', 'y', y), text: String(text ?? ''),
          size,
          align,
          family: opts?.family ? String(opts.family) : null });
    },
    drawRedraw: (target) => drawRedrawImpl(target, ownerName),
    // ce.panel — structure
    panelCreate: (type, props) => panelCreateImpl(type, props, scriptId),
    panelClone: (name, props) => panelCloneImpl(name, props, scriptId),
    panelDestroy: (name) => panelDestroyImpl(name),
    panelParent: (name, container) => panelParentImpl(name, container),
    panelFind: (query) => panelFindImpl(query),
    panelInfo: (name) => panelInfoImpl(name),
    panelTypes: () => Object.keys(COMPONENT_TYPES),
    // ce.panel — the collections inside a control, which the Properties panel can add to and
    // remove from and a script could only overwrite whole.
    panelEntries: (control, section) => panelEntriesImpl(control, section),
    panelEntry: (control, section, name) => panelEntryImpl(control, section, name),
    panelDefine: (control, section, name, spec) => panelDefineImpl(control, section, name, spec),
    panelUndefine: (control, section, name) => panelUndefineImpl(control, section, name),
    panelPatch: (control, stateName, patch, part) => panelPatchImpl(control, stateName, patch, part),
    // The two ce.panel verbs that are NOT panel-view only. The C++ preludes build these on a host
    // query for the control names plus get/set; here the panel object is in hand, so the same walk
    // is direct. Same rules either way — see panelSnapshotImpl.
    // ce.panel — arranging what is there
    panelAlign: (names, edge, opts) => panelAlignImpl(names, edge, opts),
    panelDistribute: (names, what, opts) => panelDistributeImpl(names, what, opts),
    panelMatch: (names, what, opts) => panelMatchImpl(names, what, opts),
    panelGrid: (names, opts) => panelGridImpl(names, opts),
    panelCircle: (names, opts) => panelCircleImpl(names, opts),
    panelFlip: (names, axis) => panelFlipImpl(names, axis),
    panelRect: (names) => panelRectImpl(names),
    panelOrder: (names, where) => panelOrderImpl(names, where),
    panelBatch: (fn) => panelBatchImpl(scriptId, fn),
    panelKeep: (path) => panelKeepImpl(path),
    panelEach: (fn) => panelEachImpl(scriptId, fn),
    panelSnapshot: () => panelSnapshotImpl(),
    panelRestore: (snap) => panelRestoreImpl(snap),
    // ce.time — reads and musical timers
    tempo: () => tempoRead(),
    isPlaying: () => isPlayingRead(),
    transportInfo: () => transportInfoRead(),
    beatsToMs: (beats, bpm) => beatsToMsRead(beats, bpm),
    msToBeats: (ms, bpm) => msToBeatsRead(ms, bpm),
    syncTimer: (id, beats, opts) => syncTimerRead(id, beats, opts),
    afterBeats: (beats, fn) => afterBeatsFor(scriptId, beats, fn),
    runningTimers: () => runningTimersRead(),
    // ce.device — reads
    deviceProfile: (role) => deviceProfileRead(role || DEFAULT_ROLE),
    deviceParameters: (opts) => (deviceOptionsRefused('parameters', opts) ? [] : deviceParametersRead(opts ?? {})),
    deviceParameter: (id, role) => deviceParameterRead(id, role || DEFAULT_ROLE),
    deviceConnected: (role) => deviceConnectedRead(role || DEFAULT_ROLE),
    deviceRead: (id, role) => deviceValueRead(id, role || DEFAULT_ROLE),
    deviceWrite: (id, value, role) => deviceValueWrite(id, value, role || DEFAULT_ROLE),
    // ce.device — declaring what the app was not shipped knowing
    deviceDefineParameter: (id, spec, role) => deviceDefineParameterImpl(id, spec, role || DEFAULT_ROLE),
    deviceDefineDump: (kind, spec, role) => deviceDefineDumpImpl(kind, spec, role || DEFAULT_ROLE),
    deviceBind: (control, parameterId, opts) => deviceBindImpl(control, parameterId, opts ?? {}),
    deviceUnbind: (control, port) => deviceUnbindImpl(control, port),
    devicePorts: (opts) => (deviceOptionsRefused('ports', opts) ? [] : devicePortsRead(opts ?? {})),
    deviceVariables: (role) => deviceVariablesRead(role || DEFAULT_ROLE),
    deviceSetVariable: (name, value, role) => deviceOverrideWrite('variables', name, value, role || DEFAULT_ROLE),
    deviceTiming: (role) => deviceTimingRead(role || DEFAULT_ROLE),
    deviceSetTiming: (name, ms, role) => deviceOverrideWrite('timingOverrides', name, ms, role || DEFAULT_ROLE),
    deviceCoverage: (feature, role) => deviceCoverageRead(role || DEFAULT_ROLE, feature),
    deviceRecipes: (role) => deviceListRead(role || DEFAULT_ROLE, 'messageRecipes'),
    deviceRequests: (role) => deviceListRead(role || DEFAULT_ROLE, 'requests'),
    // The callback belongs to the calling script, so this is bound here rather than in midiApi —
    // a throw inside it is reported against the script that scheduled it.
    requestDump: (kind, fn, opts) => requestDumpImpl(kind, fn, opts, scriptId),
    // ce.device preset recall. The slot is the device-global number the profile's banks partition,
    // not a program number — see panelApi.
    recallPreset: (slot, opts) => recallPresetImpl(slot, opts),
    preset: (role) => presetReadImpl(role),
    // ce.math — the seeded generator. Bound here rather than in the shared helpers object because
    // it is the only place that knows WHICH SCRIPT is drawing, and the generator is per script.
    random: (lo, hi) => randomImpl(scriptId, lo, hi),
    randomSeed: (n) => randomSeedImpl(scriptId, n),
    randomChoice: (values, weights) => randomChoiceImpl(scriptId, values, weights),
    randomFloat: (lo, hi) => randomFloatImpl(scriptId, lo, hi),
    randomGaussian: (mean, sd) => randomGaussianImpl(scriptId, mean, sd),
    randomWalk: (current, step, lo, hi) => randomWalkImpl(scriptId, current, step, lo, hi),
    randomBool: (chance) => randomBoolImpl(scriptId, chance),
    shuffle: (values) => shuffleImpl(scriptId, values),
    randomStream: (name, fn) => randomStreamImpl(scriptId, name, fn),
    // ce.storage
    state: stateFor(scriptId),
    saveSetting: (key, value, opts) => saveSetting(key, value, opts, scriptId),
    loadSetting: (key, fallback, opts) => loadSetting(key, fallback, opts, scriptId),
    listSettings: (opts) => listSettings(opts, scriptId),
    forgetSetting: (key, opts) => forgetSetting(key, opts, scriptId),
    allSettings: (opts) => allSettings(opts, scriptId),
    clearSettings: (opts) => clearSettings(opts, scriptId),
    storageInfo: (opts) => storageInfo(opts, scriptId),
    encodeJson: (value, opts) => encodeJson(value, opts),
    decodeJson: (text) => decodeJson(text),
    // The blocks gate set()'s transmission, not the explicit senders — same rule as the C++ host.
    // finally, not catch-and-continue: an exception inside the block must not leave the override
    // stuck on, or every later write in the panel inherits it.
    noTransmit: (fn) => {
      pushTransmit(false);
      try { fn?.(); } catch (e) { addScriptTrace('error', '', String(e?.message ?? e)); } finally { popTransmit(); }
    },
    transmit: (fn) => {
      pushTransmit(true);
      try { fn?.(); } catch (e) { addScriptTrace('error', '', String(e?.message ?? e)); } finally { popTransmit(); }
    },
    self,
    ...helpers,
  };

  // An unknown option key refuses the call, for every member the contract lists options for, before
  // the guard and the namespace see the functions, so every spelling of a member carries the check.
  applyOptionChecks(api);

  // Installed third-party modules (ce.ext.*) contribute their members to the SAME flat surface a
  // built-in module does, before anything is gated — so they are gated, namespaced and discovered
  // by exactly the same code, with no separate path to keep in step.
  const epoch = executionEpoch;
  const wrapFunctions = (object) => Object.fromEntries(Object.entries(object).map(([key, value]) => [key,
    typeof value === 'function' ? approvalGuard(value, epoch)
      : value && typeof value === 'object' && key !== 'state' ? wrapFunctions(value) : value]));
  // Also guard capabilities handed to extension code, before evaluating it.
  if (guardExecution) Object.assign(api, wrapFunctions(api));
  installExtensionMembers(api, scriptId);

  // Modules the panel has not enabled become explaining stubs, before `ce` is assembled from the
  // flat surface — so the namespaced spelling and the flat alias are gated identically.
  const enabled = enabledModules();
  applyModuleGates(api, enabled);

  // ce.<module>.<name> on top of the flat names, which stay as aliases. Built here from the
  // contract rather than from a copy of it, so the WebView's namespace cannot drift from
  // panelApi.js — the C++ engines get the same layout from a generated block, since a prelude
  // embedded as a string literal cannot import anything.
  api.ce = buildModuleNamespace(api, enabled);
  return guardExecution ? wrapFunctions(api) : api;
}

// What a guarded script API calls through: a call made after the approval the API was built under
// has expired throws instead of running. One wrapper per function per approval, shared by every
// script and every spelling of it — the flat sendCC and ce.midi.sendCC are one function, and the
// helpers every script is handed are the same functions in all of them — and a wrapper is never
// wrapped again.
//
// It used to be one per spelling, per script, and the flat names were wrapped a second time on the
// way out: a script is handed 761 functions, and GAIA's 232 scripts built 509,220 wrappers for them.
// Built once, with the shared gate stubs below, the player page's JS heap went from 153 MB to
// 116 MB. The wrappers are held weakly, so a script's own functions go with the script.
let guardEpoch = -1;
let guards = new WeakMap();
const isGuard = new WeakSet();

function approvalGuard(fn, epoch) {
  if (isGuard.has(fn)) return fn;
  if (guardEpoch !== epoch) {
    guardEpoch = epoch;
    guards = new WeakMap();
  }
  let guard = guards.get(fn);
  if (!guard) {
    guard = (...args) => {
      if (epoch !== executionEpoch) throw new Error('Script approval expired; enable the current code before running it.');
      return fn(...args);
    };
    guards.set(fn, guard);
    isGuard.add(guard);
  }
  return guard;
}

/**
 * The modules this panel has turned on, or null for "do not gate".
 *
 * Absent declaration means AUTO — derived from what the scripts actually reference — so a panel
 * written before modules existed keeps every verb it used. With no panel at all there is nothing
 * to derive from and nothing to protect, so gating is off: an empty set there would mean the API
 * disappears whenever a script runs outside a document, which is a worse answer than not gating.
 */
function enabledModules() {
  const panel = activePanel();
  if (!panel) return null;
  // AUTO means "derived from what the scripts reference" — so it has to derive from the scripts
  // that will actually RUN. activeScripts() is the Behavior Designer's live override, then the
  // script documents, then the saved panel; panelModules() only ever saw the last of those. A
  // script written in the designer therefore ran with every namespaced verb stubbed out, built
  // nothing, and reported a gate that pointed at a list the panel does not even have. Gate from
  // the same list you execute. A MANUAL list is authored intent and is still obeyed verbatim.
  if (!Array.isArray(panel?.scripting?.modules)) {
    const sources = scriptsForPanel(panel)
      .map((script) => String(script?.source ?? ''))
      .filter(Boolean);
    if (sources.length) {
      const used = [...new Set(sources.flatMap((src) => modulesUsedBy(src)))];
      return new Set(resolveModules(used).enabled);
    }
  }
  return new Set(panelModules(panel).enabled);
}

/**
 * Replace the members of disabled modules with a stub that names the module. Not deletion:
 * `sendCC is not a function` says nothing about why, which is the whole failure mode this
 * codebase spent two rounds removing. Value members (`state`) are left alone — swapping a table
 * for a function would break `state.x = 1` with a type error instead of an explanation.
 */
function applyModuleGates(flat, enabled) {
  if (enabled == null) return;
  for (const module of allModules()) {
    if (module.global || enabled.has(module.id)) continue;
    for (const memberId of Object.values(memberMapFor(module.id))) {
      if (isValueMember(MEMBER_BY_ID[memberId])) continue;
      flat[memberId] = gateStub(memberId, module.id);
    }
  }
  // Declared aliases follow their member: to14Bit is to14bit, gated or not.
  for (const member of Object.values(MEMBER_BY_ID)) {
    for (const alias of member.aliases ?? []) {
      if (flat[member.id] !== undefined) flat[alias] = flat[member.id];
    }
  }
}

// A stub says the same thing in every script, so every script is handed the same one: GAIA's
// scripts built 16,560 of them, one per gated member per script.
const gateStubs = new Map();   // member id -> stub

function gateStub(memberId, moduleId) {
  let stub = gateStubs.get(memberId);
  if (!stub) {
    const message = moduleGateMessage(memberId, moduleId);
    stub = () => addScriptTrace('log', '', message);
    gateStubs.set(memberId, stub);
  }
  return stub;
}

/**
 * Assemble `ce` from the module manifest: ce.midi.sendCC, ce.components.setlist.next, and so on.
 * ce.core is `global: true` — its members are never namespaced — but they are mirrored under
 * ce.core anyway so the namespace is a complete picture of what a script can reach.
 */
function buildModuleNamespace(flat, enabled = null) {
  const ce = {};
  for (const module of allModules()) {
    const segments = module.id.split('.').slice(1);   // drop the "ce" root
    let node = ce;
    for (const segment of segments) {
      node[segment] ??= {};
      node = node[segment];
    }
    for (const [shortName, memberId] of Object.entries(memberMapFor(module.id))) {
      const bound = flat[memberId];
      if (typeof bound === 'function' || bound !== undefined) node[shortName] = bound;
    }
  }
  // Tier 1: the system namespace. Not a module — it describes the runtime rather than extending it.
  ce.version = CE_API_VERSION;
  ce.runtime = RUNTIME_WEBVIEW;
  ce.language = 'javascript';
  ce.modules = allModules()
    .filter((m) => enabled == null || enabled.has(m.id))
    .map((m) => ({ id: m.id, version: m.version, runtime: m.runtime }));
  // Enabled AND reachable from here. A module the panel turned on that only runs in the player
  // still answers false, because the question ce.has() is asked to settle is "can I call this".
  ce.has = (moduleId) => {
    const module = moduleById(moduleId);
    if (module == null) return false;
    if (enabled != null && !enabled.has(moduleId)) return false;
    return module.runtime === RUNTIME_ANY || module.runtime === RUNTIME_WEBVIEW;
  };
  return ce;
}

/* ------------------------------------------------------- installed third-party modules */
// An installed ce.ext.* module ships JavaScript for this runtime. It is evaluated exactly the way
// a user's JS script is — an isolated SES compartment endowed with the panel API.
// Module source is included in the session approval fingerprint.
//
// The compiled factory is cached per id@version, so a module is parsed once and only re-invoked to
// re-bind the API (which differs per script: `self`, the script's own `state`).

const extensionFactories = new Map();   // "id@version" -> { factory, keys } | null

function extensionFactory(ext, apiKeys, owner) {
  const cacheKey = `${ext.id}@${ext.version}:${owner}`;
  const cached = extensionFactories.get(cacheKey);
  if (cached !== undefined && cached?.keys === apiKeys) return cached;

  const source = extensionSource(ext, 'webview');
  const names = (ext.members ?? []).map((m) => m.id);
  if (!source || !names.length) { extensionFactories.set(cacheKey, null); return null; }

  // Collect exactly the members the manifest declares. A module that promises a member and does
  // not define it hands back undefined, which is reported below rather than silently skipped.
  try {
    const entry = { factory: (...values) => evaluatePanelSource(source,
      Object.fromEntries(apiKeys.split(',').map((key, index) => [key, values[index]])), names, { owner }), keys: apiKeys };
    extensionFactories.set(cacheKey, entry);
    return entry;
  } catch (e) {
    addScriptTrace('error', '', `[module ${ext.id}] will not parse: ${e?.message ?? e}`);
    extensionFactories.set(cacheKey, null);
    return null;
  }
}

/** Drop the compiled cache — after an install, an uninstall, or an upgrade. */
export function resetExtensionCache() {
  extensionFactories.clear();
  if (!ensurePanelExecutionApproved()) resetScriptState();
}

/**
 * Run every installed module's JavaScript and merge what it defines into the flat surface.
 * A module that throws, will not parse, or does not define what it promised is REPORTED and
 * skipped — never half-installed, and never fatal to the rest of the panel.
 */
function installExtensionMembers(flat, owner) {
  const extensions = registeredExtensions();
  if (!extensions.length) return;

  const apiKeys = Object.keys(flat).join(',');
  for (const ext of extensions) {
    const entry = extensionFactory(ext, apiKeys, owner);
    if (!entry) continue;
    let produced = null;
    try {
      produced = entry.factory(...Object.keys(flat).map((k) => flat[k]));
    } catch (e) {
      addScriptTrace('error', '', `[module ${ext.id}] ${e instanceof SyntaxError || e?.name === 'SyntaxError' ? 'will not parse' : 'load error'}: ${e?.message ?? e}`);
      continue;
    }
    for (const member of ext.members ?? []) {
      const fn = produced?.[member.id];
      if (typeof fn !== 'function') {
        addScriptTrace('error', '', `[module ${ext.id}] declares ${member.id} but does not define it`);
        continue;
      }
      flat[member.id] = fn;
    }
  }
}

// Driven from panelApi.js, never from a local copy. This list is what the executors probe for, so
// a name missing from it is a handler that can never fire — which is exactly what happened to
// onControlChanged, onTimer, onMidiIn, onCcIn, onSysexIn and the two device-connection events
// while this was hand-maintained.
// The onDaw* hooks are declared runtime:'player' — there is no DAW behind the editor to save a
// project, so they are not in this runtime's list and never probed for here.
const HANDLER_NAMES = handlerNamesForRuntime(RUNTIME_WEBVIEW);

/**
 * Every global this runtime binds into a script, as the runtime itself builds it — `self` and the
 * helpers included. Exported for CE/web/test/panelApiParity.test.js, which checks it against
 * panelApi.js in both directions: nothing declared and unimplemented, nothing bound and
 * undeclared. Reading the real object rather than scanning the source is the point — a surface
 * that drifts from what scripts actually receive is the bug being guarded against.
 *
 * `guarded` builds it the way a script about to run receives it, behind the approval guard.
 */
export function scriptApiForTesting(owner = '', scriptId = 'parity-probe', guarded = false) {
  return buildApi(owner, scriptId, guarded);
}

/** Just the names — what the parity check compares against panelApi.js. */
export function apiSurfaceNames() {
  return Object.keys(scriptApiForTesting());
}

// run("owner.action") targets a function the author named themselves, so probing the handler list
// alone can't find it. Scan the source for the shapes a top-level function takes in the languages
// this runtime executes, and probe those too. A regex is enough: over-guessing costs one undefined
// lookup, and anything it misses was never callable before this existed.
const DECLARATION_RES = [
  /\bfunction\s+([A-Za-z_]\w*)\s*\(/g,          // Lua / JS / C-family
  /\bdef\s+([A-Za-z_]\w*)\s*\(/g,               // Python
  /\b(?:const|let|var)\s+([A-Za-z_]\w*)\s*=\s*(?:function\b|\([^)]*\)\s*=>|[A-Za-z_]\w*\s*=>)/g, // JS arrow/expr
  /^\s*([A-Za-z_]\w*)\s*=\s*function\s*\(/gm,   // Lua `foo = function(...)`
];

function declaredNames(source) {
  const out = new Set();
  const text = String(source ?? '');
  for (const re of DECLARATION_RES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) out.add(m[1]);
  }
  return [...out];
}

/** Everything worth probing for in one script: the contract's handler names plus what it declares. */
function probeNames(script) {
  return [...new Set([...HANDLER_NAMES, ...declaredNames(script?.source)])];
}

/** A sensible sample payload for manually running a handler from the editor. */
function samplePayload(event) {
  if (event === 'onPanelReady') return { firstTime: true };
  if (event === 'onValueChange' || event === 'onValueChanged') return 64;
  if (event === 'onActiveHandleChanged') return { activeHandle: 'current', previousActiveHandle: 'start' };
  if (event && event.startsWith('on') && (event.includes('Pointer') || event.includes('Click'))) return { x: 0, y: 0 };
  return undefined;
}

/**
 * The owner a script's `self`/relative paths resolve against: a concrete control name, or — for a
 * panel-scope script — the panel itself. SELF has always been documented as "the element this
 * script is attached to (control, panel, …)"; the panel half of that never resolved, because there
 * was no way to address the panel at all. self.set("width", 800) landed on a control called
 * "width" and reported it missing.
 */
function ownerOf(script) {
  if (script?.target && script.target !== '*' && script.target !== 'self') return script.target;
  return script?.scope === 'panel' ? PANEL_TARGET : '';
}

/* -------------------------------------------------------------- JavaScript executor */

/** Run JS source with the panel API bound and collect its declared handlers (sync). */
function runJsSource(source, scriptId, api, names) {
  try {
    return evaluatePanelSource(source, api, names, { owner: scriptId, onError: error => reportScriptError(scriptId, error) });
  } catch (e) {
    reportScriptLoadError(scriptId, `load error: ${e?.message ?? e}`);
    return null;
  }
}

/** Execute a JS script's source and return its declared handlers (sync). */
function loadHandlersJs(script) {
  return runJsSource(script.source, script.id, buildApi(ownerOf(script), script.id, true), probeNames(script));
}

/** TypeScript: prefer the JS the editor already transpiled (what the C++ host ships), else
    transpile on the fly via the lazy compiler. Both run through the JS path. */
async function loadHandlersTs(script) {
  const api = buildApi(ownerOf(script), script.id, true);
  if (typeof script.compiledJs === 'string' && script.compiledJs.length)
    return runJsSource(script.compiledJs, script.id, api, probeNames(script));
  const ts = await ensureTs();
  if (!ensurePanelExecutionApproved(script)) return null;
  if (!ts) { reportScriptLoadError(script.id, 'TypeScript compiler unavailable (offline?)'); return null; }
  const js = transpileTs(script.source);
  if (js == null) { reportScriptLoadError(script.id, 'TypeScript transpile failed'); return null; }
  // Probe the transpiled JS as well: TypeScript's own declaration shapes are a superset.
  return runJsSource(js, script.id, api, [...new Set([...probeNames(script), ...declaredNames(js)])]);
}

/* --------------------------------------------------------------------- Lua executor */
// One shared wasmoon engine (Lua 5.4 in WASM), created lazily on first Lua run. Each run
// re-binds the API globals (owner/`self` can differ per script) and re-evaluates the source in
// the shared globals — fine for M1; per-script sandboxing is a later refinement.

let luaEnginePromise = null;
async function getLuaEngine() {
  if (!luaEnginePromise) {
    luaEnginePromise = (async () => {
      const { LuaFactory } = await import('wasmoon');
      const lua = await new LuaFactory(luaWasmUrl).createEngine({ functionTimeout: 250, traceAllocations: true });
      lua.global.setMemoryMax(64 * 1024 * 1024);
      // Guest code must not remove the instruction hook or regain debug via require.
      lua.doStringSync('debug = nil; package.loaded.debug = nil; package.preload.debug = nil');
      return lua;
    })();
  }
  return luaEnginePromise;
}

/**
 * `null` -> `undefined` on the way back into Lua.
 *
 * wasmoon pushes a host function's return value through its promise extension, which reaches for
 * `value.then` with no null check — so a verb that answers `null` raises "Cannot read properties
 * of null" INSIDE the Lua chunk and kills the handler where it stands. Plenty of verbs answer
 * "there is no such thing" with null (panelInfo, panelEntry, panelCreate, deviceParameter, …), and
 * the guard the manual teaches — `local f = ce.text.font(x) ; if not f then` — is precisely what
 * triggers it: the script asks about something absent and the engine dies instead of returning nil.
 *
 * `undefined` already pushes as nil, so the two spellings of "nothing" are normalised here rather
 * than by auditing 39 existing call sites and remembering the rule for every verb added later.
 * Only the top-level return is affected — a null NESTED in a returned table pushes fine.
 */
const nilSafe = (fn) => (...args) => {
  const out = fn(...args);
  if (out === null) return undefined;
  if (out && typeof out.then === 'function') return out.then((v) => (v === null ? undefined : v));
  return out;
};

/**
 * The same treatment for the `ce.*` namespace, which is pushed as a table of tables — wrapping only
 * the flat aliases would leave `ce.panel.info()` crashing while `panelInfo()` was fine, and the
 * namespaced spelling is the one the manual teaches. A COPY, not a mutation: `api` is handed to the
 * other engines unchanged, and the flat alias must stay identical to what it aliases.
 */
const nilSafeNamespace = (node, depth = 0) => {
  if (typeof node === 'function') return nilSafe(node);
  if (depth > 3 || !node || typeof node !== 'object') return node;
  const out = {};
  for (const [key, value] of Object.entries(node)) out[key] = nilSafeNamespace(value, depth + 1);
  return out;
};

/** Execute a Lua script's source and return its declared handlers (async). */
async function loadHandlersLua(script) {
  let lua;
  try {
    lua = await getLuaEngine();
    if (!ensurePanelExecutionApproved(script)) return null;
  } catch (e) {
    reportScriptLoadError(script.id, `Lua engine failed to start: ${e?.message ?? e}`);
    return null;
  }
  const api = buildApi(ownerOf(script), script.id, true);
  try {
    for (const [k, v] of Object.entries(api)) {
      if (typeof v === 'function') lua.global.set(k, nilSafe(v));
      else if (k === 'ce') lua.global.set(k, nilSafeNamespace(v));
      else lua.global.set(k, v);          // `state` and friends keep their identity
    }
    // Clear any handlers left in globals by a previous run, eval the source, then collect this
    // run's handlers into a table the JS side can call.
    const names = probeNames(script);
    const clear = names.map((n) => `${n}=nil`).join(';');
    const collect = names.map((n) => `${n}=${n}`).join(',');
    const handlers = runBoundedLuaSource(lua, `${clear}\n${script.source}\nreturn {${collect}}`);
    return handlers || {};
  } catch (e) {
    reportScriptLoadError(script.id, `load error: ${e?.message ?? e}`);
    return null;
  }
}

/* ------------------------------------------------------------------ Python executor */
// Python via Pyodide (CPython in WASM), loaded lazily from the jsDelivr CDN on the first Python
// script. Tier-2 language: in the WebView (editor preview + the OPEN plugin window) it runs via
// Pyodide. Window-closed / offline native execution is delivered by embedding REAL CPython at export
// (Scripting Runtime -> Python; CMake CEDITOR_PYTHON -> PythonScriptEngine.cpp), NOT Pyodide. The
// always-on native core is Lua+JS; embedded CPython is the optional third window-closed engine.

let pyodidePromise = null;
/**
 * Where Pyodide is loaded from: a realm of its own.
 *
 * The script sandbox locks the page's realm down (SES lockdown, scriptSandbox.js) before any panel
 * code runs, and that freezes the built-ins Pyodide extends while it loads, so Pyodide loaded into
 * the page failed with "Cannot add property sig, object is not extensible", and every Python preview
 * with it, since the security pass. A hidden same-origin iframe is a separate realm with its own
 * built-ins that lockdown never touched. This is not a sandbox and does not claim to be one: Python
 * already needs its own approval, as trusted code (scriptTrust.js), and the page's realm stays locked.
 *
 * Off the page (the unit tests) there is no document, and whoever runs the runtime supplies
 * globalThis.loadPyodide. Exported for the test that pins the realm.
 */
export async function pyodideLoader(CDN) {
  if (typeof document === 'undefined') return globalThis.loadPyodide;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.display = 'none';
  document.body.appendChild(frame);
  const realm = frame.contentWindow;
  await new Promise((resolve, reject) => {
    const s = realm.document.createElement('script');
    s.src = CDN + 'pyodide.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('could not load pyodide.js (offline?)'));
    realm.document.head.appendChild(s);
  });
  return realm.loadPyodide;
}

async function getPyodideEngine() {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      const CDN = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
      const loadPyodide = await pyodideLoader(CDN);
      if (typeof loadPyodide !== 'function') throw new Error('no Pyodide loader');
      // Do not expose the privileged WebView global through Python's `import js`.
      // CPython/native exported handlers remain trusted code, not an OS sandbox.
      const py = await loadPyodide({ indexURL: CDN, jsglobals: Object.create(null) });
      // Python is the one preview engine with no execution bound of its own (QuickJS, Wasmoon and
      // the interpreters' shared budget cover the rest), so its loops carry the watchdog (C-57).
      py.runPython(PYTHON_WATCHDOG_PRELUDE);
      return py;
    })();
  }
  return pyodidePromise;
}

/**
 * The panel API as Python should see it.
 *
 * Pyodide hands a Python dict, list or callable to a JavaScript function as a BORROWED proxy, which it
 * destroys the moment the call returns. Anything the API keeps — a saved setting, a callback for
 * after()/on()/watch(), an options object it reads later — was dead by the time it was used: a dict
 * saved with saveSetting() made the panel impossible to save at all, every callback threw "This
 * borrowed proxy was automatically destroyed", and options and lists arrived empty (release audit
 * C-96, C-97, C-99, C-59). So every function is wrapped: dicts, lists, tuples and sets are converted
 * to plain JavaScript before the call, and a callable is copied into a proxy that outlives it.
 *
 * Exported for the test, which drives it with a stand-in for Pyodide's proxy class.
 */
export function apiForPython(api, PyProxy) {
  const isPyProxy = (value) => PyProxy != null && value instanceof PyProxy;
  const fromPython = (value) => {
    if (!isPyProxy(value)) return value;
    if (typeof value === 'function') return value.copy();
    return value.toJs({ dict_converter: Object.fromEntries });
  };
  const wrapped = new WeakMap();
  const wrap = (value) => {
    if (typeof value === 'function') {
      if (!wrapped.has(value)) wrapped.set(value, function pythonCall(...args) { return value.apply(this, args.map(fromPython)); });
      return wrapped.get(value);
    }
    if (value == null || typeof value !== 'object' || Array.isArray(value) || isPyProxy(value)) return value;
    if (wrapped.has(value)) return wrapped.get(value);
    const out = {};
    wrapped.set(value, out);
    for (const [key, entry] of Object.entries(value)) out[key] = wrap(entry);
    return out;
  };
  return wrap(api);
}

/** Execute a Python script's source and return its declared handlers (async). */
async function loadHandlersPython(script) {
  let py;
  try {
    py = await getPyodideEngine();
    if (!ensurePanelExecutionApproved(script)) return null;
  } catch (e) {
    reportScriptLoadError(script.id, `Pyodide failed to load: ${e?.message ?? e}`);
    return null;
  }
  const api = buildApi(ownerOf(script), script.id, true);
  try {
    // Fresh namespace per run, seeded with the panel API + helpers as Python globals, so the source
    // can call set()/get()/sendCC()/log()/clamp()/scale()/… directly. Each defined handler is read
    // back out as a callable; JS payloads auto-convert (numbers → int/float, objects → attr access).
    // One level deep: the names become Python globals, and `ce` stays a JavaScript object, so
    // `ce.midi.sendCC(...)` resolves by attribute the way the exported plug-in's `ce` namespace does.
    // Converting it all the way turned `ce` into a dict and every `ce.*` call into AttributeError (C-98).
    const ns = py.toPy(apiForPython({ ...api, [GUARD_NAME]: scriptLoopGuard }, py.ffi?.PyProxy), { depth: 1 });
    py.globals.get('__ce_exec')(script.source, ns);
    const handlers = {};
    for (const name of probeNames(script)) {
      const fn = ns.get(name);
      if (fn) handlers[name] = (payload) => fn(payload);
    }
    return handlers;
  } catch (e) {
    reportScriptLoadError(script.id, `load error: ${e?.message ?? e}`);
    return null;
  }
}

/* ----------------------------------------------------------------------- C++ executor */
// Interpreted preview of the C++ behavior-handler subset (cppPreview.js). The real C++ is
// compiled into the exported plugin; this lets a C++ script move live controls in the editor.
// `ctx.*` maps onto the same panel API as Lua/JS; `event` is the handler payload.
/**
 * Run a compiled script's setup entry point, so `on()` registration works in C++, C# and Java.
 *
 * THE GAP THIS CLOSES. Lua and JS register listeners by running top-level code: the source calls
 * `on("self", "valueChanged", fn)` at load and the runtime keeps the listener. The three compiled
 * previews could not, and `scripting-runtime-gaps.md` recorded it as "named handlers only" — a real
 * asymmetry, because a script that reacts to a custom event has no way to say so.
 *
 * The obvious fix — "execute top-level statements like loadHandlersJs does" — is wrong for these
 * three languages: a bare statement at file scope is illegal in all of C++, C# and Java, so there is
 * no top-level code to run. What a person actually writes is a function. So the convention is a
 * function named `setup` (or `Setup`, which is what a C# author would reach for), called once at
 * load with the same `ctx` the handlers get.
 *
 * Everything it needs already existed and nothing here is new machinery: `api.on` is spread into
 * `ctx`, and the interpreters already turn a named function into a JS callable when it is referenced
 * as a value, so `ctx.on("self", "valueChanged", myHandler)` hands the host a real function.
 * The only missing piece was that nobody called `setup`.
 *
 * `setup` is not returned as a handler. It is an entry point, not an event, and leaving it in the
 * map would make it fire on any event that happened to share the name.
 */
function runSetupEntryPoint(script, handlers, ctx, invoke, print, label) {
  for (const name of ['setup', 'Setup']) {
    const fnNode = handlers.get(name);
    if (!fnNode) continue;
    try { invoke(fnNode, [ctx, {}], { print }); }
    catch (e) { addScriptTrace('error', script.id, `${label} preview setup error: ${e?.message ?? e}`); }
    return name;
  }
  return null;
}

/**
 * The `ctx` a C++, C# or Java handler is handed in the preview, over a given panel API, and the event
 * it is handed with a payload. One definition, exported, because the export validator has to put the
 * compiled handler against exactly this: the compiled C++/C#/Java context accepts every spelling of
 * the core API that this one does (validate-script-exports.mjs runs the same source through both and
 * compares every call), and a second copy of these lists would be free to drift from the first.
 */
export function previewContextFor(language, api) {
  const ctx = { ...api, setValue: api.set, getValue: api.get };
  if (language === 'java') return { ...ctx, ...javaTypedReads(api) };
  if (language !== 'csharp') return ctx;
  // C# in both spellings: the API's own lower-case names and C#'s PascalCase ones.
  return {
    ...ctx,
    SetValue: api.set, GetValue: api.get, Log: api.log,
    SendCC: api.sendCC, SendNRPN: api.sendNRPN, SendSysex: api.sendSysex,
    Clamp: api.clamp, Scale: api.scale, Round: api.round, Snap: api.snap, Lerp: api.lerp, Curve: api.curve,
  };
}

/**
 * Java's typed reads, getDouble/getInt/getString/getBoolean. In an exported Java handler ctx.get
 * returns Object (CeRuntime.java), which a Java variable cannot take without a cast, and a cast throws
 * when the value is not the type cast to. These read at the type wanted and never throw. They convert
 * as the native runtimes' Var already does (asDouble/asBool/asString in ce_runtime.h and
 * CeRuntime.cs): a number as itself, a bool as 1 or 0, anything else as 0; text as itself, anything
 * else as ""; a bool as itself, anything else as whether its number is non-zero. getInt is Java's
 * (int) of getDouble — toward zero, NaN as 0, held to the int range. CeRuntime.java has the same
 * four, and validate-script-exports compares the two on every kind of value.
 */
const javaDouble = (v) => (typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : 0);
function javaInt(v) {
  const d = javaDouble(v);
  if (Number.isNaN(d)) return 0;
  if (d >= 2147483647) return 2147483647;
  if (d <= -2147483648) return -2147483648;
  return Math.trunc(d) + 0; // + 0 because a Java int has no -0
}
function javaTypedReads(api) {
  // Without a form, ask without one: the export passes "value", which the host reads as no form at
  // all, so the two agree even on a path ending in .normalizedValue.
  const read = (path, form) => (form === undefined ? api.get(path) : api.get(path, form));
  return {
    getDouble: (path, form) => javaDouble(read(path, form)),
    getInt: (path, form) => javaInt(read(path, form)),
    getString: (path, form) => { const v = read(path, form); return typeof v === 'string' ? v : ''; },
    getBoolean: (path, form) => { const v = read(path, form); return typeof v === 'boolean' ? v : javaDouble(v) !== 0; },
  };
}

export function previewEventFor(language, payload) {
  if (language !== 'csharp') return payload && typeof payload === 'object' ? payload : { value: payload };
  return payload && typeof payload === 'object'
    ? { ...payload, Value: payload.value, FirstTime: payload.firstTime }
    : { value: payload, Value: payload };
}

function loadHandlersCpp(script) {
  const api = buildApi(ownerOf(script), script.id, true);
  const ctx = previewContextFor('cpp', api);
  const print = (s) => addScriptTrace('log', script.id, String(s).replace(/\n$/, ''));
  const { handlers: parsed, diagnostics } = compileCpp(script.source);
  for (const d of diagnostics) addScriptTrace('error', script.id, `C++ preview: ${d}`);
  const out = {};
  const entry = runSetupEntryPoint(script, parsed, ctx, invokeCpp, print, 'C++');
  for (const [name, fnNode] of parsed) {
    if (name === entry) continue;
    out[name] = (payload) => {
      const event = previewEventFor('cpp', payload);
      try { return invokeCpp(fnNode, [ctx, event], { print }); }
      catch (e) { addScriptTrace('error', script.id, `C++ preview runtime error: ${e?.message ?? e}`); }
    };
  }
  return out;
}

/* ----------------------------------------------------------------------- C# executor */
// Interpreted preview of the C# behavior-handler subset (csharpPreview.js). `ctx` exposes the
// panel API in both C# (PascalCase) and lower-case spellings; handler names match camelCase
// (the skeleton) or PascalCase (idiomatic C#).
function loadHandlersCsharp(script) {
  const api = buildApi(ownerOf(script), script.id, true);
  const ctx = previewContextFor('csharp', api);
  const print = (s) => addScriptTrace('log', script.id, String(s).replace(/\n$/, ''));
  const { handlers: parsed, diagnostics } = compileCsharp(script.source);
  for (const d of diagnostics) addScriptTrace('error', script.id, `C# preview: ${d}`);
  const out = {};
  const entry = runSetupEntryPoint(script, parsed, ctx, invokeCsharp, print, 'C#');
  for (const [name, fnNode] of parsed) {
    if (name === entry) continue;
    const fire = (payload) => {
      const event = previewEventFor('csharp', payload);
      try { return invokeCsharp(fnNode, [ctx, event], { print }); }
      catch (e) { addScriptTrace('error', script.id, `C# preview runtime error: ${e?.message ?? e}`); }
    };
    out[name] = fire;
    const lower = name.charAt(0).toLowerCase() + name.slice(1); // OnValueChanged → onValueChanged
    if (lower !== name && !out[lower]) out[lower] = fire;
  }
  return out;
}

/* ----------------------------------------------------------------------- Java executor */
// Interpreted preview of the Java behavior-handler subset (javaPreview.js).
function loadHandlersJava(script) {
  const api = buildApi(ownerOf(script), script.id, true);
  const ctx = previewContextFor('java', api);
  const print = (s) => addScriptTrace('log', script.id, String(s).replace(/\n$/, ''));
  const { handlers: parsed, diagnostics } = compileJava(script.source);
  for (const d of diagnostics) addScriptTrace('error', script.id, `Java preview: ${d}`);
  const out = {};
  const entry = runSetupEntryPoint(script, parsed, ctx, invokeJava, print, 'Java');
  for (const [name, fnNode] of parsed) {
    if (name === entry) continue;
    out[name] = (payload) => {
      const event = previewEventFor('java', payload);
      try { return invokeJava(fnNode, [ctx, event], { print }); }
      catch (e) { addScriptTrace('error', script.id, `Java preview runtime error: ${e?.message ?? e}`); }
    };
  }
  return out;
}

/* ---------------------------------------------------------------- unified run / load */

/** Execute a script's source and return its declared handlers (JS/C++/C#/Java sync; Lua/Python async). */
async function getHandlers(script) {
  const lang = script?.language ?? 'lua';
  if (lang === 'javascript' || lang === 'js') return loadHandlersJs(script);
  if (lang === 'typescript' || lang === 'ts') return loadHandlersTs(script);
  if (lang === 'lua') return loadHandlersLua(script);
  if (lang === 'python' || lang === 'py') return loadHandlersPython(script);
  if (lang === 'cpp' || lang === 'c++') return loadHandlersCpp(script);
  if (lang === 'csharp' || lang === 'cs' || lang === 'c#') return loadHandlersCsharp(script);
  if (lang === 'java') return loadHandlersJava(script);
  addScriptTrace('error', script?.id ?? '',
    `Language "${lang}" isn't supported in the web runtime (Lua, JavaScript, TypeScript, Python, C++, C#, and Java run here).`);
  return null;
}

/* -------------------------------------------------------------------------- onError */
// A panel reporting its own failures. The LOG always happens; onError is in addition to it, never
// instead of it, or a panel whose error handler is itself broken goes silent.
//
// Two guards, mirroring ScriptRuntime exactly:
//   • inErrorHook — an error raised while reporting an error is logged and stops there, so a
//     broken reporter cannot loop.
//   • deferErrors — load-time errors are held until every script is loaded, because a script that
//     fails to compile FIRST would otherwise be reported to an onError that does not exist yet,
//     which is precisely when a panel most wants to be told.
//
// The hook is looked up by NAME rather than by property access, the way every other event is
// raised — the handler is a script's export, and naming it here keeps it findable.
const ERROR_HOOK = 'onError';
const errorHook = { inHook: false, defer: false, pending: [] };

async function dispatchErrorHook(scriptId, message, phase) {
  if (errorHook.inHook) return;
  const scripts = activeScripts();
  const failing = scripts.find((s) => String(s.id) === String(scriptId));
  const info = {
    scriptId: String(scriptId ?? ''),
    script: failing?.name || String(scriptId ?? ''),
    event: failing?.event ?? '',
    phase,
    message: String(message ?? ''),
  };

  errorHook.inHook = true;
  try {
    for (const s of scripts) {
      if (s.enabled === false) continue;
      // The cache entry is { key, handlers } — the hook is read from the LOADED handlers, never
      // loaded on demand: loading a script from inside the error path is how a reporter that
      // itself fails to compile turns one error into two.
      const fn = handlerCache.get(s.id)?.handlers?.[ERROR_HOOK];
      if (typeof fn !== 'function') continue;
      // Reported, never re-dispatched: this IS the error path.
      try { fn(info); } catch (e) { addScriptTrace('error', s.id, `(in ${ERROR_HOOK}) ${e?.message ?? e}`); }
    }
  } finally {
    errorHook.inHook = false;
  }
}

/** Log a LOAD failure and, once everything is loaded, tell any onError handler about it. */
function reportScriptLoadError(scriptId, message) {
  addScriptTrace('error', scriptId, message);
  if (errorHook.defer) errorHook.pending.push([scriptId, message]);
  else dispatchErrorHook(scriptId, message, 'load');
}

// Report a thrown error as an error line plus a few call-stack frames (when available),
// so the console shows the exception AND where it came from.
function reportScriptError(scriptId, e) {
  if (isScriptTimeLimit(e)) stopScript(scriptId);
  const msg = e?.message ?? String(e);
  addScriptTrace('error', scriptId, msg);
  dispatchErrorHook(scriptId, msg, 'dispatch');
  const stack = e && typeof e.stack === 'string' ? e.stack : '';
  if (stack) {
    const frames = stack.split('\n').map((s) => s.trim())
      .filter((l) => /^at\s|:\d+:\d+\)?$|^\[string/.test(l)) // JS "at …" frames / Lua "[string ...]:n"
      .slice(0, 5);
    for (const f of frames) addScriptTrace('trace', scriptId, `  ${f}`);
  }
}

/* ----------------------------------------------------------------- handler cache */
// Scripts load ONCE and are dispatched many times, the way ScriptRuntime::loadScripts does it —
// not re-executed from source on every event. Two reasons beyond the obvious cost:
//   • on(…) listeners registered by top-level code have to outlive the run that registered them,
//     or emit() can never reach them;
//   • run("other.action") needs another script's functions to already exist.
// The key includes the source, so editing a script in the designer invalidates its entry and the
// next dispatch picks up the edit.

const handlerCache = new Map();   // scriptId -> { key, handlers }

function cacheKey(script) {
  return [script?.language ?? '', ownerOf(script), script?.compiledJs ?? '', script?.source ?? ''].join('\u0000');
}

/** Load (or reuse) a script's handlers. Re-loading replaces the script's on(…) listeners and its
    watch/compute/intercept rules and actions — an edit must not leave the previous version's rules
    running beside the new ones. */
/**
 * Scripts the watchdog stopped, by id, with the source they were stopped in. A stopped script loads
 * nothing and its listeners are gone, so an endless loop in onValueChanged costs one stall rather
 * than one per knob movement. Editing the script changes its key and runs it again.
 */
const stoppedScripts = new Map();

function stopScript(scriptId) {
  const loaded = handlerCache.get(scriptId);
  if (!loaded || stoppedScripts.get(scriptId) === loaded.key) return;
  stoppedScripts.set(scriptId, loaded.key);
  clearListeners(scriptId);
  clearReactive(scriptId);
  clearMidiFiltersFor(scriptId);
}

async function handlersFor(script) {
  if (!ensurePanelExecutionApproved(script)) return null;
  await ensureScriptSandbox();
  if (!ensurePanelExecutionApproved(script)) return null;
  const epoch = executionEpoch;
  const key = cacheKey(script);
  if (stoppedScripts.get(script.id) === key) return null;
  stoppedScripts.delete(script.id);
  const hit = handlerCache.get(script.id);
  if (hit && hit.key === key) return hit.handlers;
  disposeJavascriptSandboxes(script.id);
  clearListeners(script.id);
  clearReactive(script.id);
  clearMidiFiltersFor(script.id);
  const handlers = await getHandlers(script);
  if (epoch !== executionEpoch || !ensurePanelExecutionApproved(script)) return null;
  // The script record is kept alongside its handlers because the cache IS the loaded set: at
  // teardown the panel it belonged to may already have been switched away from, so the declared
  // event has to come from here rather than from whatever is active by then.
  handlerCache.set(script.id, { key, handlers, script });
  return handlers;
}

/** Load every active script, so listeners exist and run() can resolve before anything dispatches. */
async function primeHandlers() {
  const epoch = executionEpoch;
  // Errors raised WHILE loading are held: onError may be declared by a script that has not been
  // loaded yet, and telling nobody is the one outcome this hook exists to prevent.
  errorHook.defer = true;
  errorHook.pending.length = 0;
  try {
    for (const s of activeScripts()) {
      if (s.enabled === false) continue;
      try { await handlersFor(s); } catch (e) { reportScriptLoadError(s.id, e?.message ?? String(e)); }
    }
  } finally {
    errorHook.defer = false;
  }
  const pending = errorHook.pending.splice(0);
  for (const [id, message] of pending) await dispatchErrorHook(id, message, 'load');
}

/* ------------------------------------------------------------------- onPanelDestroy */
// Phase 5, and NOT the same moment as onPanelClose. Closing is the VIEW going away — preview
// stopped, plugin window shut — while the scripts keep running; a plugin with its window closed is
// still playing. Destroying is the SCRIPTS going away.
//
// The handler cache is the loaded set, so it is what gets told and what gets emptied. That makes
// "exactly once per set" fall out of the code rather than needing a flag: a second call finds an
// empty cache and does nothing.
//
// Two moments raise it in the editor, and one that looks like a third deliberately does not:
//   • the active panel changed        → the outgoing panel's scripts are done;
//   • the page is going away          → the app is closing;
//   • an in-editor edit does NOT      → setLiveScripts runs on every keystroke, and a hook whose
//     whole job is "restore the synth, send a final dump" must not fire once per character typed.
//     Editing a script is a RELOAD of the set, not the destruction of it.
export function destroyLoadedScripts() {
  const previousPanelId = teardownPanelId;
  const wasDispatching = live.dispatching;
  teardownPanelId = live.activePanelId;
  live.dispatching = true;
  try { withDocumentWriteBatch(() => destroyLoadedScriptHandlers()); }
  finally { teardownPanelId = previousPanelId; live.dispatching = wasDispatching; }
}

function destroyLoadedScriptHandlers() {
  const loaded = [...handlerCache.values()];
  if (!loaded.length) return;
  handlerCache.clear();   // cleared FIRST: a handler that somehow re-enters must not be told twice

  for (const entry of loaded) {
    const s = entry?.script;
    if (!s || s.enabled === false || s.event !== 'onPanelDestroy' || !ensurePanelExecutionApproved(s)) continue;
    const fn = entry.handlers?.onPanelDestroy;
    if (typeof fn !== 'function') continue;
    // Synchronous on purpose: a page unload will not wait for a promise, and a teardown hook that
    // only half-runs depending on how it was triggered would be worse than one that never does.
    // Everything a handler needs is still alive here — timers, state, the host — because this runs
    // before resetScriptState.
    try {
      fn(undefined);
      addScriptTrace('log', s.id, `ran onPanelDestroy() in "${s.name}"`);
    } catch (e) {
      // Reported the normal way, and teardown carries on: a failing teardown handler must not be
      // able to keep the old script set alive.
      reportScriptError(s.id, e);
    }
  }
}

/** Drop all cached handlers, listeners and timers — the script set or the panel changed. */
function resetScriptState() {
  executionEpoch += 1;
  edgeWarned.clear();
  animTimingWarned.clear();
  drawStrokeWarned.clear();
  timeNumberWarned.clear();
  componentClampWarned.clear();
  lcdLineWarned.clear();
  textAxisWarned.clear();
  deviceOverrideWarned.clear();
  musicWarned.clear();
  packWarned.clear();
  storageWarned.clear();
  devicePortsWarned.clear();
  drawWarned.clear();
  panelWarned.clear();
  uiWarned.clear();
  disposeJavascriptSandboxes();
  if (luaEnginePromise) {
    luaEnginePromise.then(lua => lua.global.close(), () => {});
    luaEnginePromise = null;
  }
  handlerCache.clear();
  listeners.length = 0;
  oscInstances.clear();   // a script's OSC patterns go when it reloads
  watchers.length = 0;
  computeds.length = 0;
  filters.length = 0;
  actions.clear();
  midiIn.length = 0;
  midiOut.length = 0;
  clearMidiFilters();
  routedRole = null;
  stopAllTimers();
  resetKeys();           // a script's shortcuts and piano go with it; the keys held stay the user's
  scriptState.clear();   // `state` lives exactly as long as the loaded script does
  resetRandomStreams();
}

/** Call a loaded script's handler. Used by dispatch — reuses the cached load. */
async function invokeHandler(script, hook = null, payload = undefined) {
  const epoch = executionEpoch;
  const handlers = await handlersFor(script);
  if (!handlers || epoch !== executionEpoch) return;
  const fnName = hook || script.event;
  const fn = handlers[fnName];
  if (typeof fn !== 'function') {
    addScriptTrace('log', script.id, `ran "${script.name}" (no ${fnName}() to call — top-level code executed)`);
    return;
  }
  try {
    // Only the synchronous part belongs to this transaction. If the handler returns a promise,
    // publish before awaiting so UI state is not held hostage by network or timer work. Writes
    // after an await keep their existing immediate semantics unless the script explicitly batches.
    let result = withDocumentWriteBatch(() =>
      fn(payload !== undefined ? payload : samplePayload(fnName)));
    if (result && typeof result.then === 'function') result = await result;
    addScriptTrace('log', script.id, `ran ${fnName}() in "${script.name}"`);
    // What it answered: keyDown keeps a key when a handler returns true.
    return result;
  } catch (e) {
    reportScriptError(script.id, e);
  }
  return undefined;
}

/**
 * Run a script now — the editor's ▶ Run. Always re-executes the source rather than reusing the
 * cached load: pressing Run is a request to run the code as written, and top-level statements are
 * usually the thing being debugged. Event dispatch takes the cached path instead.
 */
export async function runScript(script, hook = null, payload = undefined) {
  disposeJavascriptSandboxes(script.id);
  handlerCache.delete(script.id);
  stoppedScripts.delete(script.id);   // pressing Run is asking to try again, stopped or not
  return invokeHandler(script, hook, payload);
}

/* ------------------------------------------------------------- live event dispatch */
// Scripts fire on their own — no ▶ Run — from three sources, all guarded by `dispatching` so a
// script's own set() can't re-enter the watchers (no infinite loop):
//   1. panels store      → onValueChange/onValueChanged when a *script* moves a control's value;
//   2. preview overlay   → onValueChange/onValueChanged + onClick/onPointer*/onHover* when the
//                          *user* interacts with a control in preview (writes panelPreviewSessions,
//                          NOT the panels store);
//   3. preview mode flag → onPanelLoad/onPanelReady/onPanelClose lifecycle as the panel goes live.
//   4. direct dispatch  → onWheel/onDoubleClick/onPointerMove (transient, with pointer coords) from
//                          the preview surface via dispatchInteraction(); press events carry coords too.

// Dispatch is GLOBAL and always-on (set up once via initPanelRuntime) — it follows the ACTIVE
// panel, so scripts react during preview on the canvas tab even when the script editor isn't open.
// Scripts come from the active panel's persisted script document, or from an in-editor live
// override (instant feedback while editing, before the debounced save).
const live = {
  enabledGlobal: true,     // master switch (the editor's "Live" toggle)
  inited: false,
  activePanelId: null,     // follows scriptRuntimePanelId (script tabs: the doc's bound panel)
  editOverride: null,      // { panelId, scripts } pushed by an open BehaviorDesigner
  last: new Map(),         // panels store: controlId -> value signature
  sessionLast: new Map(),  // preview overlay: controlId -> { value, pressed, hover }
  sessionsDirty: false,    // a session change arrived mid-dispatch and still needs diffing
  readyFired: new Set(),   // panelIds that already saw onPanelReady (firstTime tracking)
  prevPreviewOn: false,
  dispatching: false,
  interactions: [],        // transient UI events arriving while an earlier batch runs
  unsubs: [],
};

function livePanel() {
  if (host) return host.panel ?? null;
  return get(panels).find((p) => String(p.id) === String(live.activePanelId)) ?? null;
}

/**
 * The source scripts a GIVEN panel would run, newest authority first: the Behavior Designer's live
 * override, then its script document, then whatever the panel document itself has saved.
 *
 * Taking the panel as an argument rather than reading `live.activePanelId` is what lets the module
 * gate ask about the same panel it resolved — `activePanel()` follows the store while
 * `live.activePanelId` is only set once initPanelRuntime has run, and gating from a panel whose
 * scripts you could not see is what stubbed the whole API in the designer.
 */
function scriptsForPanel(panel) {
  if (host) return host.scripts ?? [];
  const pid = panel?.id;
  if (pid == null) return [];
  if (live.editOverride && String(live.editOverride.panelId) === String(pid)) return live.editOverride.scripts;
  const doc = get(scriptDocuments).find((d) => String(d.panelId) === String(pid));
  if (doc) return (doc.scripts ?? []).filter(isSourceScript);
  return (panel.scripts ?? []).filter(isSourceScript);
}

/** Source scripts for the active panel, including those embedded in the saved panel. */
function activeScripts() {
  // The saved .cepanel is a script source too. Requiring a separate script workspace
  // made ordinary preview silently ignore every embedded onPanelLoad/onClick handler.
  // Use the same precedence as exports: live override, bound workspace, panel document.
  return scriptsForPanel(livePanel());
}

let pendingApprovalScript = null;

/**
 * The request for the active set, reused within one task.
 *
 * Every script's handlers check approval before they load and again before they run, and a
 * dispatch visits every script, so building the request — every script's source in one string,
 * and a walk of every control for the ones they carry — once per check made each event cost one
 * fingerprint per script. On the GAIA panel (232 scripts) that was about half a second of main
 * thread per click in Preview: two quick presses arrived as two clicks, and a double-click on a
 * stepper stepped twice instead of resetting.
 *
 * Reused only while nothing it was built from has been replaced — the panel document, the live
 * edit override, the panel's script document and the installed extensions, compared by identity —
 * and only until the current task ends, so an edit, which arrives as a task of its own, is always
 * checked against a freshly built request.
 */
let requestMemo = null;
function requestInputs(panel) {
  const doc = host ? null : get(scriptDocuments).find((d) => String(d.panelId) === String(panel?.id)) ?? null;
  return [host, panel, live.editOverride, doc, ...registeredExtensions()];
}
function sameInputs(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function executionRequest(extraScript = null) {
  const panel = livePanel();
  const scripts = activeScripts();
  // A script of the active set, as the set holds it, adds nothing: the request is the set's own.
  const member = !extraScript || scripts.find((s) => s.id === extraScript.id) === extraScript;
  if (member) {
    const inputs = requestInputs(panel);
    if (requestMemo && sameInputs(requestMemo.inputs, inputs)) return requestMemo.request;
    const request = buildExecutionRequest(panel, scripts, null);
    requestMemo = { inputs, request };
    setTimeout(() => { if (requestMemo?.request === request) requestMemo = null; }, 0);
    return request;
  }
  return buildExecutionRequest(panel, scripts, extraScript);
}

function buildExecutionRequest(panel, scripts, extraScript) {
  const effective = extraScript
    ? [...scripts.filter(s => s.id !== extraScript.id), extraScript] : [...scripts];
  // Canonical order makes explicit Run and event dispatch use the same approval. By code unit, not
  // localeCompare: the script sandbox's lockdown (SES) replaces localeCompare with a plain
  // comparison when it starts, so a panel approved before its first script loaded fingerprinted in
  // the locale's order ("gaia_tone_copy" before "gaia_tone1_copy_click") and checked in the other,
  // lost its approval the moment its scripts began, and had to be approved twice.
  effective.sort((a, b) => {
    const x = String(a.id), y = String(b.id);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  const embedded = flatControls(panel?.controls ?? []).flatMap(c => c?._children?.Scripts?.scripts ?? []);
  const all = [...effective, ...embedded];
  const extensions = [...registeredExtensions(), ...(panel?.scripting?.extensions ?? [])];
  const languages = all.filter(s => s.enabled !== false && isSourceScript(s)).map(s => String(s.language).toLowerCase());
  const hasPython = languages.some(l => ['python', 'py'].includes(l));
  const hasNative = hasPython || languages.some(l => ['cpp', 'c++', 'csharp', 'cs', 'c#', 'java'].includes(l))
    || extensions.some(e => typeof e.prelude?.python === 'string' && e.prelude.python.trim());
  return { key: String(panel?.id ?? 'script-workspace'), name: panel?.name ?? 'this panel',
    hasPython, hasNative,
    hasCode: all.some(s => s.enabled !== false && isSourceScript(s)) || extensions.length > 0,
    fingerprint: executionFingerprint(all, extensions) };
}

export function ensurePanelExecutionApproved(extraScript = null, forExport = false) {
  // A shipped plug-in is already an executable the user installed; its native
  // engine runs the same code window-closed. The editor must never infer trust
  // from fields supplied by an imported document.
  if (host) return true;
  const request = executionRequest(extraScript);
  const nativeRequired = request.hasPython || (forExport && request.hasNative);
  const allowed = !request.hasCode || (isExecutionApproved(request.key, request.fingerprint)
    && (!nativeRequired || isNativeExecutionApproved(request.key, request.fingerprint)));
  if (!allowed) pendingApprovalScript = extraScript;
  scriptExecutionStatus.set({ blocked: !allowed, name: request.name, hasNative: request.hasNative, nativeRequired });
  return allowed;
}

export function approveCurrentPanelScripts(extraScript = pendingApprovalScript, { allowNative = false } = {}) {
  const request = executionRequest(extraScript);
  approveExecution(request.key, request.fingerprint, allowNative);
  pendingApprovalScript = null;
  if (!ensurePanelExecutionApproved(extraScript)) return;
  if (live.inited && get(previewModeEnabled) === true) {
    live.prevPreviewOn = false;
    onPreviewModeChanged(true);
  }
}

/**
 * A control's current "value", wherever it lives:
 *  - standard controls keep it at Value.value,
 *  - custom components keep it in ValueChannels.<name>.currentValue (often several channels).
 * Returns a change-signature (to detect movement), a representative value (the onValueChanged
 * payload of a control with one value), and — for a custom component — each channel's value, in
 * declaration order, so a change can be reported as the channel that made it (valueEventsFor).
 */
function controlValueState(control) {
  // TextInput commits into Behavior rather than a Value section. Observe the
  // same string that the native field and the public value watcher read.
  if (control?._children?.Core?.controlType === 'TextInput') {
    const value = String(control._children?.Behavior?.defaultValue ?? '');
    return { sig: JSON.stringify(value), value, channels: null };
  }
  const v = valueAtPath(control, 'Value.value');
  if (v !== undefined) return { sig: JSON.stringify(v), value: v, channels: null };
  const channels = control?._children?.ValueChannels?._children;
  if (channels && typeof channels === 'object') {
    const entries = Object.keys(channels).map((key) => [key, channels[key]?.currentValue]);
    if (entries.length) {
      return {
        sig: entries.map(([key, cv]) => `${key}=${JSON.stringify(cv)}`).join('&'),
        value: entries[0][1],
        channels: Object.fromEntries(entries),
      };
    }
  }
  return { sig: undefined, value: undefined, channels: null };
}

/** A custom component's value channel names, in declaration order. */
function valueChannelNames(control) {
  return Object.keys(control?._children?.ValueChannels?._children ?? {});
}

/**
 * The channels whose value differs between two `{ name: value }` maps, as [name, value] pairs in
 * declaration order. Content, not identity: an array channel rebuilt with the same items has not
 * changed, which is the rule watch() already keeps.
 */
function changedChannels(names, before, after) {
  const out = [];
  for (const name of names) {
    const was = before?.[name];
    const now = after?.[name];
    if (JSON.stringify(was) !== JSON.stringify(now)) out.push([name, now]);
  }
  return out;
}

/**
 * THE VALUES A CHANGE REPORTS. A control with one value reports it, as it always has. A custom
 * component with several channels reports each channel that moved, with that channel's own value,
 * once per channel — what the exported plugin already does with the window closed, where every
 * public channel is its own host parameter (utils/exportParameters.js, paramFromChannel) and
 * PluginProcessor raises onValueChanged per parameter that changed.
 *
 * Until this, the payload here was the FIRST channel's value whichever channel had moved, so a
 * script on a three-ring macro was told the first ring's unchanged value when the second turned.
 */
function valueEventsFor(control, before, state) {
  if (state.channels && valueChannelNames(control).length > 1) {
    return changedChannels(valueChannelNames(control), before?.channels, state.channels).map(([, value]) => value);
  }
  return [state.value];
}

/** Snapshot every control's current value so the next change is measured against it. */
function snapshotValues() {
  const panel = livePanel();
  const next = new Map();
  if (panel) {
    // flatControls, for the same reason findControlByName uses it: a control inside a Group had no
    // baseline here, so the diff below could never see it change.
    for (const c of flatControls(panel.controls ?? [])) {
      const id = c?._children?.Core?.id;
      if (id != null) next.set(id, controlValueState(c));
    }
  }
  live.last = next;
}

// A doc-level script isn't attached to a specific control yet, so '*' and 'self' match any
// control (coarse). A concrete control name matches just that control (case-insensitive).
function scriptMatchesControl(script, controlName) {
  const t = String(script?.target ?? '*');
  if (t === '*' || t === 'self') return true;
  return t.toLowerCase() === String(controlName ?? '').toLowerCase();
}

// Run a batch of { event, controlName, payload } against the matching live scripts. A null
// controlName means panel-wide (lifecycle). Guarded so a script's own set() can't re-enter.
// `inbound: true` marks the whole batch as a reaction to something the device sent us, so set()
// inside these handlers is silent by default. The depth has to be held across the AWAIT — an RAII
// wrapper around the call would pop it the moment dispatchEvents returned its promise, i.e. before
// a single handler had run, and every write would go out loud.
function drainInteractionEvents() {
  if (live.dispatching || !live.interactions.length) return;
  const pending = live.interactions.splice(0);
  const panelId = String(livePanel()?.id ?? live.activePanelId);
  const current = [];
  for (const entry of pending) {
    if (live.enabledGlobal && entry.panelId === panelId) current.push(entry);
    else entry.resolve(entry.answer ? false : undefined);
  }
  if (current.length) {
    dispatchEvents(current.map((entry) => entry.event)).then(
      (answers) => { current.forEach((entry, i) => entry.resolve(entry.answer ? answers?.[i] === true : undefined)); },
      (error) => { for (const entry of current) entry.reject(error); });
  }
}

/**
 * Run each event's handlers. Answers, per event, whether any handler returned true (keyDown keeps
 * its key that way; every other event ignores the answer).
 */
async function dispatchEvents(events, { inbound = false } = {}) {
  const answers = events.map(() => false);
  if (!events.length) return answers;
  if (!ensurePanelExecutionApproved()) { resetScriptState(); return answers; }
  const scripts = activeScripts();
  const epoch = executionEpoch;
  const outerOrigin = currentOrigin;
  live.dispatching = true;
  if (inbound) origin.inboundDepth += 1;
  try {
    // Load everything first: a script that only registers on(…) listeners has no `event` of its
    // own, so it would never be loaded by the match loop below and its listeners would never fire.
    await primeHandlers();
    for (let i = 0; i < events.length; i += 1) {
      const ev = events[i];
      if (epoch !== executionEpoch) return answers;
      // origin(): who made the change this event is for. Inbound events came from the device.
      currentOrigin = ev.origin ?? (inbound ? 'device' : null);
      if (ev.event === 'onValueChange' && currentOrigin !== 'host' && currentOrigin !== 'load') dawFollowSpare(ev.controlName, ev.payload);
      if (ev.event === 'onValueChange' && currentOrigin !== 'osc') oscFollowBinding(ev.controlName, ev.payload);
      const matches = scripts.filter((s) =>
        s.enabled !== false && s.event === ev.event &&
        (ev.controlName == null || scriptMatchesControl(s, ev.controlName)));
      for (const s of matches) {
        if (epoch !== executionEpoch) return answers;
        if (await invokeHandler(s, s.event, ev.payload) === true) answers[i] = true;
      }
      if (epoch !== executionEpoch) return answers;
      // …then the explicit on(target, event, fn) listeners for the same event.
      for (const l of [...listeners]) {
        if (l.event !== ev.event || !listenerMatches(l, ev.controlName)) continue;
        try {
          if (withDocumentWriteBatch(() => l.fn(ev.payload)) === true) answers[i] = true;
        } catch (e) { reportScriptError(l.scriptId, e); }
      }
    }
  } finally {
    currentOrigin = outerOrigin;
    if (inbound) origin.inboundDepth -= 1;
    if (epoch === executionEpoch) {
      snapshotValues();          // absorb panels writes our scripts just made
      live.dispatching = false;
      scheduleDawStateSave();    // the processor saves what the scripts would now say
      // Changes that raised declared events skipped the reactive pass while this async
      // dispatch was busy. Settle their watchers before absorbing the session baseline.
      runReactive();
      if (live.sessionsDirty) {
        // Something arrived while we were busy. Do NOT seed — seeding is what would swallow it.
        // Leave the baseline alone and diff again on the next microtask, so the change is measured
        // against the state it actually changed from. Each pass advances the baseline, so a burst
        // drains rather than looping.
        live.sessionsDirty = false;
        Promise.resolve().then(() => {
          if (epoch !== executionEpoch) return;
          onPreviewSessionsChanged(get(panelPreviewSessions));
          drainInteractionEvents();
        });
      } else {
        seedSessionSnapshot();   // absorb the preview-overlay writes our scripts just made
        drainInteractionEvents();
      }
    }
  }
  return answers;
}

/* --- source 1: panels store (script-driven value changes) --- */

function onPanelsChanged() {
  if (live.dispatching) return;            // re-entry from our own set() — ignore
  if (!ensurePanelExecutionApproved()) { resetScriptState(); snapshotValues(); return; }
  const panel = livePanel();
  if (!panel) return;
  if (!live.enabledGlobal) { snapshotValues(); return; }   // keep snapshot fresh while paused
  const events = [];
  const next = new Map();
  // flatControls: a knob inside a Group raised no onValueChange at all, because the walk that
  // looks for changes stopped at the top level while the panel that changed did not.
  for (const c of flatControls(panel.controls ?? [])) {
    const id = c?._children?.Core?.id;
    if (id == null) continue;
    const name = c?._children?.Core?.name ?? id;
    const state = controlValueState(c);
    next.set(id, state);
    const before = live.last.get(id);
    if (before && before.sig !== state.sig) {
      for (const value of valueEventsFor(c, before, state)) {
        if (behaviorEmits(c, 'onValueChange')) {
          events.push({ event: 'onValueChange', controlName: name, payload: value });
          // Panel-wide mirror of the same change, for a script that watches everything at once
          // rather than attaching to each control.
          events.push({ event: 'onControlChanged', controlName: null, payload: { target: name, value } });
        }
        if (behaviorEmits(c, 'onValueChanged')) {
          events.push({ event: 'onValueChanged', controlName: name, payload: value });
        }
      }
    }
  }
  live.last = next;
  syncOscBindings();   // a binding or the panel's OSC settings may have changed
  // Who made the change: a script's set() outside a handler, a spare parameter the DAW moved, or a
  // hand in the editor's inspector.
  const why = panelsOrigin ?? 'user';
  panelsOrigin = null;
  for (const e of events) e.origin = why;
  // Returned, as the session diff's is, so a test can wait for the handlers; the store subscriber
  // ignores it.
  const dispatched = events.length ? dispatchEvents(events) : null;
  // The reactive rules settle AFTER the declared events, and run even when there were no
  // events at all: a nested field moving (a colour, a section property) produces no
  // control event, and watching exactly those is the point of watch().
  runReactive();
  return dispatched;
}

/* --- source 2: preview overlay (user interaction) --- */

// The user's value in preview: a custom component's first channel, else the value override, else
// the checked state.
function sessionValue(session, control) {
  if (!session) return undefined;
  const behavior = control?._children?.Behavior;
  // Value events use the same active numeric value as script reads and watches.
  if (behavior?.family === 'range') {
    return readLiveValue({ [control._children.Core.id]: session }, control);
  }
  const cv = session.customValues;
  if (cv && typeof cv === 'object') { const vals = Object.values(cv); if (vals.length) return vals[0]; }
  if (session.valueOverrideEnabled === true) return session.valueOverride;
  if (session.mixed === true) return 'mixed';
  if (typeof session.checked === 'boolean') return session.checked;
  return undefined;
}

function controlByRuntimeId(id) {
  return flatControls(livePanel()?.controls ?? []).find((x) => x?._children?.Core?.id === id) ?? null;
}

function controlNameById(id) {
  // flatControls, or a nested control's events are addressed by RAW ID instead of by name — and a
  // listener registered as on("pad38", "pointerDown", …) matches a name, so every press, release,
  // click and hover on a control inside a Group went nowhere. It looked like the pad was dead;
  // it was the envelope that was wrong.
  const c = flatControls(livePanel()?.controls ?? []).find((x) => x?._children?.Core?.id === id);
  return c?._children?.Core?.name ?? id;
}

/**
 * Behavior's emission switches gate only script/runtime events. The preview session is still
 * updated first, and binding/link/device fan-out remains in the surface/store that owns it.
 * Non-slider value controls have one Value switch; sliders split continuous change from commit.
 */
function behaviorEmits(control, eventName) {
  const behavior = control?._children?.Behavior;
  // Components without a Behavior section predate these switches and keep the
  // event contract they already had. A missing section is not an implicit set
  // of false flags.
  if (!behavior) return true;
  if (eventName === 'onClick') return behavior.emitClick !== false;
  if (eventName === 'onStateChanged') return behavior.emitStateChange !== false;
  if (eventName === 'onValueChange' || eventName === 'onControlChanged') {
    return behavior.emitValueChange === true;
  }
  if (eventName === 'onValueChanged') {
    const slider = String(behavior.family ?? '').toLowerCase() === 'range'
      && String(behavior.role ?? '').toLowerCase() === 'slider';
    return slider ? behavior.emitValueCommit !== false : behavior.emitValueChange === true;
  }
  if (eventName === 'onActiveHandleChanged') return behavior.emitActiveHandleChange === true;
  return true;
}

const NO_CHANNELS = Object.freeze(new Set());

/**
 * What the session diff remembers about one control. `channels` is the session's customValues
 * object itself — every writer replaces it rather than editing it, so a reference is a snapshot,
 * and an unchanged one costs nothing to compare. `dragFrom` is where the channels stood when a drag
 * began (null: no session had written any, so they stood where the document has them), and
 * `dragTouched` the channels that moved at any point during it: a multi-channel drag commits those
 * on release (onPreviewSessionsChanged).
 */
function sessionEntry(s, prev, control) {
  const dragging = s.dragging === true;
  const channels = s.customValues && typeof s.customValues === 'object' ? s.customValues : null;
  return {
    value: sessionValue(s, control), pressed: s.pressed === true, hover: s.hover === true,
    disabled: s.disabled === true, dragging,
    repeats: Number(s.repeatCount) || 0, executed: s.executed === true,
    activeHandle: String(s.activeHandle ?? ''),
    channels,
    dragFrom: dragging ? (prev?.dragging ? prev.dragFrom : (prev?.channels ?? null)) : null,
    dragTouched: dragging && prev?.dragging ? prev.dragTouched : NO_CHANNELS,
  };
}

/**
 * What each channel HOLDS under a session's customValues, in readLiveValue's order: the session's
 * value, else the channel's currentValue, else its default — what the screen draws and get()
 * returns. customValues are overrides, so the raw maps cannot be compared: a fresh or hover-only
 * session's {} holds exactly what the document does, not nothing.
 */
function channelHoldings(control, id, names, customValues) {
  const sessions = { [id]: { customValues: customValues ?? {} } };
  return Object.fromEntries(names.map((name) => [name, readLiveValue(sessions, control, `ValueChannels.${name}.currentValue`)]));
}

function seedSessionSnapshot() {
  const sessions = get(panelPreviewSessions) ?? {};
  const next = new Map();
  // Against the entry being replaced: this runs after every dispatch, in the middle of a drag as
  // often as not, and a re-seed that forgot where the drag began would commit every channel.
  const controlsById = new Map(flatControls(livePanel()?.controls ?? []).map((c) => [c?._children?.Core?.id, c]));
  for (const [id, s] of Object.entries(sessions)) next.set(id, sessionEntry(s, live.sessionLast.get(id), controlsById.get(id)));
  live.sessionLast = next;
}

function onPreviewSessionsChanged(sessions) {
  if (!live.enabledGlobal) return;
  // A change that lands MID-DISPATCH is remembered, not thrown away. Refusing to look at it was
  // only half the problem: the dispatch then re-seeded the baseline from the very sessions it had
  // declined to read, so the change became the new "nothing happened" and was lost for good. Any
  // two patches in one tick hit this — the second one silently never existed. Press-to-talk found
  // it by reporting its release and never its press.
  if (live.dispatching) { live.sessionsDirty = true; return; }
  const events = [];
  const next = new Map();
  let controlsById = null;
  // Who moved each control: a hand, unless the plug-in said the DAW or a project did (noteHostValue)
  // or a dump filled it (sessionsOrigin).
  const spans = [];
  const byDefault = sessionsOrigin ?? 'user';
  sessionsOrigin = null;
  for (const [id, s] of Object.entries(sessions ?? {})) {
    spans.push({ from: events.length, origin: controlOrigins.get(id) ?? byDefault });
    controlOrigins.delete(id);
    const prev = live.sessionLast.get(id);
    controlsById ??= new Map(flatControls(livePanel()?.controls ?? []).map((c) => [c?._children?.Core?.id, c]));
    const cur = sessionEntry(s, prev, controlsById.get(id));
    next.set(id, cur);
    if (!prev) continue;
    // Most entries are unchanged. Previously each entry walked the entire tree
    // twice, even on a single hover/value update (quadratic in panel size).
    if (Object.keys(cur).every((key) => Object.is(prev[key], cur[key]))) continue;
    controlsById ??= new Map(flatControls(livePanel()?.controls ?? [])
      .map((control) => [control?._children?.Core?.id, control]));
    const control = controlsById.get(id) ?? null;
    const name = control?._children?.Core?.name ?? id;
    const behavior = control?._children?.Behavior ?? {};
    const confirmedButton = behavior.buttonType === 'timed' || behavior.buttonType === 'one_shot';
    const pressStart = behavior.buttonType === 'momentary' && behavior.fireOn === 'onPressStart';
    const repeating = behavior.buttonType === 'momentary' && behavior.subtype === 'repeating';
    // A custom component with several channels reports each channel that moved, with its own value
    // (valueEventsFor). `value` here is the FIRST channel, so moving any other one used to raise
    // nothing at all.
    const channelNames = cur.channels || prev.channels ? valueChannelNames(control) : [];
    if (channelNames.length > 1) {
      // By what the channels hold, not by the override maps (channelHoldings), and only when the
      // session's customValues were replaced at all: a hover or a press leaves them as they were.
      const holds = (customValues) => channelHoldings(control, id, channelNames, customValues);
      const moved = prev.channels === cur.channels ? []
        : changedChannels(channelNames, holds(prev.channels), holds(cur.channels)).filter(([, value]) => value !== undefined);
      if (cur.dragging && moved.length) cur.dragTouched = new Set([...cur.dragTouched, ...moved.map(([channel]) => channel)]);
      for (const [, value] of moved) {
        if (behaviorEmits(control, 'onValueChange')) {
          events.push({ event: 'onValueChange', controlName: name, payload: value });
          events.push({ event: 'onControlChanged', controlName: null, payload: { target: name, value } });
        }
        if (s.dragging !== true && behaviorEmits(control, 'onValueChanged')) {
          events.push({ event: 'onValueChanged', controlName: name, payload: value });
        }
      }
      // The drag's commit: every channel that moved during it and was not already committed above —
      // one that went away and came back included, as a one-channel control commits on release.
      if (prev.dragging && !cur.dragging && behaviorEmits(control, 'onValueChanged')) {
        const committed = new Set(moved.map(([channel]) => channel));
        const now = holds(cur.channels);
        const net = new Set(changedChannels(channelNames, holds(prev.dragFrom), now).map(([channel]) => channel));
        for (const channel of channelNames) {
          if (committed.has(channel) || now[channel] === undefined) continue;
          if (prev.dragTouched.has(channel) || net.has(channel)) {
            events.push({ event: 'onValueChanged', controlName: name, payload: now[channel] });
          }
        }
      }
    } else {
      const valueChanged = !Object.is(prev.value, cur.value) && cur.value !== undefined;
      if (valueChanged) {
        if (behaviorEmits(control, 'onValueChange')) {
          events.push({ event: 'onValueChange', controlName: name, payload: cur.value });
          events.push({ event: 'onControlChanged', controlName: null, payload: { target: name, value: cur.value } });
        }
        if (s.dragging !== true && behaviorEmits(control, 'onValueChanged')) {
          events.push({ event: 'onValueChanged', controlName: name, payload: cur.value });
        }
      }
      // Drag commits are an edge, not another value. The last drag sample already advanced the
      // baseline, so waiting for a value difference on pointer-up swallowed the commit entirely.
      if (!valueChanged && prev.dragging && !cur.dragging && cur.value !== undefined
          && behaviorEmits(control, 'onValueChanged')) {
        events.push({ event: 'onValueChanged', controlName: name, payload: cur.value });
      }
    }
    if (prev.pressed !== cur.pressed) {
      const mouse = { x: s.pointerX ?? 0, y: s.pointerY ?? 0, button: s.pointerButton ?? 0, modifiers: s.pointerModifiers ?? 0 };
      events.push({ event: cur.pressed ? 'onPointerDown' : 'onPointerUp', controlName: name, payload: mouse });
      // Script actions follow the same firing edge as the component's output.
      // A timed hold / click sequence is not an action until it confirms.
      if (!confirmedButton && !repeating && !(prev.repeats > 0)
        && (pressStart ? cur.pressed : !cur.pressed && cur.hover)) {
        if (behaviorEmits(control, 'onClick')) {
          events.push({ event: 'onClick', controlName: name, payload: mouse });
        }
      }
    }
    if (confirmedButton && cur.executed && !prev.executed) {
      if (behaviorEmits(control, 'onClick')) {
        events.push({ event: 'onClick', controlName: name, payload: {
          x: s.pointerX ?? 0, y: s.pointerY ?? 0, button: s.pointerButton ?? 0, modifiers: s.pointerModifiers ?? 0,
        } });
      }
    }
    // A repeat is another FIRING of the button, so it raises the event a firing already raises
    // rather than a new one nobody has heard of: `momentary/repeating` says "keeps firing while
    // held", and onClick is what "it fired" means everywhere else in the contract. The counter is
    // what makes two fires distinguishable — comparing a boolean pulse would merge them.
    if (cur.repeats > prev.repeats) {
      const mouse = { x: s.pointerX ?? 0, y: s.pointerY ?? 0, button: s.pointerButton ?? 0, modifiers: s.pointerModifiers ?? 0 };
      for (let i = prev.repeats; i < cur.repeats; i += 1) {
        if (behaviorEmits(control, 'onClick')) {
          events.push({ event: 'onClick', controlName: name, payload: mouse });
        }
      }
    }
    if (prev.hover !== cur.hover) {
      events.push({ event: cur.hover ? 'onHoverStart' : 'onHoverEnd', controlName: name, payload: undefined });
    }
    // onStateChanged — the control's interaction state, as one word. Reported after the specific
    // pointer/hover events above, so a handler that only cares "which state now?" has one place
    // to look instead of reconstructing it from four events.
    if (prev.pressed !== cur.pressed || prev.hover !== cur.hover || prev.disabled !== cur.disabled) {
      const stateName = cur.disabled ? 'disabled' : cur.pressed ? 'pressed' : cur.hover ? 'hover' : 'normal';
      if (behaviorEmits(control, 'onStateChanged')) {
        events.push({ event: 'onStateChanged', controlName: name, payload: stateName });
      }
    }
    if (prev.activeHandle !== cur.activeHandle && cur.activeHandle
        && behaviorEmits(control, 'onActiveHandleChanged')) {
      events.push({
        event: 'onActiveHandleChanged',
        controlName: name,
        payload: { activeHandle: cur.activeHandle, previousActiveHandle: prev.activeHandle || null },
      });
    }
  }
  live.sessionLast = next;
  for (let k = 0; k < spans.length; k += 1) {
    const to = k + 1 < spans.length ? spans[k + 1].from : events.length;
    for (let i = spans[k].from; i < to; i += 1) events[i].origin = spans[k].origin;
  }
  const dispatched = events.length ? dispatchEvents(events) : null;
  // The reactive rules settle AFTER the declared events, and run even when there were no
  // events at all: a nested field moving (a colour, a section property) produces no
  // control event, and watching exactly those is the point of watch().
  runReactive();
  return dispatched;
}

/* --- source 3: preview mode flag (lifecycle) --- */

let previewStopWork = null;
let previewStartWork = null;

/* --- the DAW-state hooks, in the panel view (exported plug-in, window open) ---
 *
 * onDawSaveState and onDawRestoreState were raised only by the window-shut engines. With the
 * plug-in's window open the scripts that run are these, so the state the DAW saved with the project
 * was the window-shut engines', frozen at the moment the window opened, and a project restored with
 * the window open never reached these scripts at all.
 *
 * Now, in the player (setDawStateSink installs the way out; the editor has none and raises neither):
 *   - after anything a script does, the page's onDawSaveState handlers are run and their merged
 *     answer handed to the processor, which saves it with the project while the window is open;
 *   - the panel starts from the processor's state: onDawRestoreState runs after onPanelBuild, before
 *     onPanelReady, with what the window-shut engines last saved (setDawRestoreForNextStart);
 *   - a project restored while the window is open is raised here too (raiseDawRestoreState).
 * When the window closes, the processor hands the page's last state to the window-shut engines.
 * The contract is the C++ one (ScriptRuntime::onDawSaveState): a handler RETURNS its keys, which are
 * merged into one store; `store` is for reading.
 */
let dawStateSink = null;
let dawStateTimer = null;
let dawRestoreForNextStart = null;

export function setDawStateSink(fn) {
  dawStateSink = typeof fn === 'function' ? fn : null;
  if (!dawStateSink && dawStateTimer) { clearTimeout(dawStateTimer); dawStateTimer = null; }
}

export function setDawRestoreForNextStart(store) {
  dawRestoreForNextStart = store && typeof store === 'object' && Object.keys(store).length ? store : null;
}

function hasDawSaveScripts() {
  return activeScripts().some((s) => s.enabled !== false && s.event === 'onDawSaveState');
}

/** Every onDawSaveState handler's answer, merged into one store, as ScriptRuntime does it. */
export async function collectDawSaveState() {
  const store = {};
  if (!ensurePanelExecutionApproved()) return store;
  const epoch = executionEpoch;
  for (const s of activeScripts()) {
    if (s.enabled === false || s.event !== 'onDawSaveState') continue;
    const handlers = await handlersFor(s);
    if (epoch !== executionEpoch) return store;
    const fn = handlers?.onDawSaveState;
    if (typeof fn !== 'function') continue;
    try {
      // A copy: a handler that writes into `store` instead of returning would otherwise change what
      // the next handler is given, and the C++ engines do not let it.
      const answer = await fn(deepClone(store));
      if (answer && typeof answer === 'object' && !Array.isArray(answer)) Object.assign(store, answer);
    } catch (e) {
      reportScriptError(s.id, e);
    }
  }
  return store;
}

/** Hand the processor the page's state soon after scripts have run; coalesced, and only when a
    script saves anything, so a panel without save handlers never claims the state. */
function scheduleDawStateSave() {
  if (!dawStateSink || dawStateTimer || !hasDawSaveScripts()) return;
  dawStateTimer = setTimeout(async () => {
    dawStateTimer = null;
    const sink = dawStateSink;
    if (!sink) return;
    const store = await collectDawSaveState();
    if (sink === dawStateSink) sink(store);
  }, 150);
}

export function raiseDawRestoreState(store) {
  if (!store || typeof store !== 'object') return Promise.resolve();
  return dispatchEvents([{ event: 'onDawRestoreState', controlName: null, payload: store }]);
}

function onPreviewModeChanged(on) {
  if (on && !ensurePanelExecutionApproved()) {
    live.prevPreviewOn = false;
    return;
  }
  if (live.enabledGlobal && on && !live.prevPreviewOn) {
    seedSessionSnapshot();                 // don't fire interaction events for the live snapshot
    const key = String(live.activePanelId ?? '');
    const firstTime = !live.readyFired.has(key);
    live.readyFired.add(key);
    // Phase 1b sits between load and ready, and the clear is what makes it idempotent: a build
    // always starts from the authored panel, so running it twice cannot double the layout. Runtime
    // device declarations go with it, for the same reason and with the same effect — a build
    // declares what it declares, rather than accumulating a second copy on every run.
    clearGeneratedControls();
    clearDeviceRuntimeDefinitions();
    const restore = dawStateSink ? dawRestoreForNextStart : null;
    dawRestoreForNextStart = null;
    previewStartWork = dispatchEvents([
      { event: 'onPanelLoad', controlName: null, payload: undefined },
      { event: 'onPanelBuild', controlName: null, payload: undefined },
      // The plug-in's window opening: the scripts start from what was saved (see setDawStateSink).
      ...(restore ? [{ event: 'onDawRestoreState', controlName: null, payload: restore }] : []),
      { event: 'onPanelReady', controlName: null, payload: { firstTime } },
    ]);
  } else if (live.enabledGlobal && !on && live.prevPreviewOn) {
    const epoch = executionEpoch;
    previewStopWork = Promise.resolve(previewStartWork).then(() => {
      if (epoch === executionEpoch) return dispatchEvents([{ event: 'onPanelClose', controlName: null, payload: undefined }]);
    }).finally(() => {
      if (epoch !== executionEpoch) return;
      live.sessionLast.clear();
      stopAllTimers();   // a timer outliving the panel it belongs to keeps firing into nothing
      clearGeneratedControls();   // …and a generated control outliving its build is just litter
      clearDeviceRuntimeDefinitions();  // …and a declared parameter outliving its panel binds nothing
      clearAllDrawings();         // …and a drawing outliving its panel is painted onto nothing
      stopAllAnimations();        // …and an animation writing into a panel that is gone is noise
      clearScriptUi();            // …and a message about a panel nobody is looking at is worse
      // …and a reactive rule outliving its preview rewrites the document forever after. compute()
      // re-runs on every store change, so a rule registered during a preview kept firing while the
      // author typed into the Properties panel afterwards — overwriting the field they were editing.
      // Last, after the Close callback has finished using its handlers and state.
      resetScriptState();
      live.dispatching = false;
    });
  }
  live.prevPreviewOn = on;
}

/* --- source 4: incoming bulk dumps (device host) --- */

// A bulk dump arrived and the device host (C++ DPD codec) decoded it. Fill the bound controls and
// fire onDumpReceived so scripts can run post-load logic. No-op in a plain browser (no host).
function onDumpParsed(payload) {
  const values = payload?.values ?? payload?.parsed?.values ?? null;
  const role = payload?.deviceRole ?? DEFAULT_ROLE;
  if (values && typeof values === 'object') {
    sessionsOrigin = 'device';
    syncDeviceRuntimeStateToPanelPreview({ [role]: values });
  }

  const events = [{ event: 'onDumpReceived', controlName: null,
    payload: { values: values ?? {}, kind: payload?.dumpId ?? payload?.dumpName ?? '', role } }];
  // One onParameterReceived per decoded parameter — the DPD payoff, and the same fan-out the C++
  // player does (PluginProcessor::installScriptDeviceCallback).
  if (values && typeof values === 'object') {
    for (const [parameter, value] of Object.entries(values)) {
      events.push({ event: 'onParameterReceived', controlName: null, payload: { parameter, value, role } });
      // Record what we just announced. The decoded values also land in deviceRuntimeState, whose
      // subscriber raises onParameterReceived for anything that CHANGED — so without this the whole
      // dump would be announced a second time, one event per parameter.
      runtimeParams.set(`${role}\u0000${parameter}`, value);
    }
  }
  // Inbound origin: set()s inside these handlers are silent by default, or filling the panel from a
  // dump echoes the entire dump straight back at the synth.
  dispatchEvents(events, { inbound: true });
  // …and only then the callbacks requestDump(kind, fn) registered. AFTER the declared events, so
  // "the dump arrived" and "the dump I asked for arrived" cannot observe the panel in two different
  // states — the same ordering rule after() follows inside a timer tick.
  resolveDumpWaiters(payload?.dumpId ?? payload?.dumpName ?? '', role, values ?? {});
}

/** The two inbound doors, exposed so tests can knock on them directly. Both are wired to bridge
    listeners in initPanelRuntime, which a test has no host to stand up. */
export function onDumpParsedForTesting(payload) { onDumpParsed(payload); }
export function deliverSysexForTesting(payload) { onSysexInputMessage(payload); }

/* --- source 5: raw MIDI in (device host) --- */
// Payload shapes are copied from the C++ player's own dispatch so a handler reads identically
// whether the window is open or closed. onMidiIn for every message; onCcIn/onSysexIn refine it.

function hexToBytes(hex) {
  const h = String(hex ?? '').replace(/\s+/g, '');
  const out = [];
  for (let i = 0; i + 1 < h.length; i += 2) out.push(parseInt(h.slice(i, i + 2), 16));
  return out;
}

/**
 * Classify a note message. Derived from the STATUS BYTE, not from the host's `messageType`, for two
 * reasons: the C++ player does the same arithmetic so the two runtimes cannot disagree, and only
 * the status byte can settle the case below.
 *
 * A note-on with velocity 0 IS a note-off — devices using running status send them constantly, and
 * a panel that treated one as a note-on would hang a voice on every key release. Getting that wrong
 * is precisely the decoding this event exists to save every panel author from doing by hand.
 *
 * `channel` is 1-16, matching sendNote, so `onNoteIn` → `sendNote` echoes correctly. (onCcIn
 * reports 0-based; that is older than this and cannot be changed without breaking panels that
 * already compensate — hence the note in its summary.)
 */
export function noteEventForTesting(bytes) { return noteEventFor(bytes); }

function noteEventFor(bytes) {
  if (bytes.length < 3) return null;
  const kind = bytes[0] & 0xf0;
  if (kind !== 0x90 && kind !== 0x80) return null;
  const payload = { channel: (bytes[0] & 0x0f) + 1, note: bytes[1], velocity: bytes[2] };
  const off = kind === 0x80 || bytes[2] === 0;
  return { event: off ? 'onNoteOffIn' : 'onNoteIn', payload };
}

/**
 * The MIDI a device sends, decoded once for every script (midiInDecoder.js; the plug-in's
 * MidiInDecoder.h decodes it the same way with its window shut): notes with their MPE ids, bends,
 * pressure, programs with their bank select, NRPNs and RPNs, transport. A thinned bend, or an NRPN's
 * coarse half, waits for its time; the timer below lets it go.
 */
const midiInDecode = createMidiInDecoder();
let midiInTimer = null;
const midiInNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function scheduleMidiInFlush() {
  if (midiInTimer !== null) return;
  const due = midiInDecode.nextDue();
  if (due === null) return;
  midiInTimer = setTimeout(() => {
    midiInTimer = null;
    const events = midiInDecode.flush(midiInNow()).map((e) => ({ event: e.event, controlName: null, payload: e.payload }));
    if (events.length && !live.dispatching && live.enabledGlobal) dispatchEvents(events, { inbound: true });
    scheduleMidiInFlush();
  }, Math.max(1, Math.ceil(due - midiInNow())));
}

/** ce.mpe.listen's reading of MPE, for the decoder. */
export function midiInListen(role, opts) { midiInDecode.listen(role, opts); }

// ce.mpe (docs/design/midi-input-and-mpe.md): one zone and one set of sounding notes for the panel,
// as the JavaScript prelude has (it runs once per panel). What it says goes to the script that called.
let mpeSayTo = '';
let mpeShared = null;
function mpeFor(scriptId) {
  mpeSayTo = scriptId;
  mpeShared ??= mpeCommands({
    say: (level, text) => addScriptTrace(level === 'warn' ? 'warn' : 'error', mpeSayTo, text),
    send: (bytes, role) => sendRawMidiForRole(bytes, 'mpe', role || DEFAULT_ROLE),
    note: midiNote,
    listen: (role, opts) => midiInDecode.listen(role, opts),
  });
  return mpeShared;
}


/* ------------------------------------------------------------------------------- ce.osc */
// docs/design/ce-osc-module.md. The port, the reading and writing of OSC and the user's yes live with
// the device layer in C++ (Osc/OscService.h). The page sends each command over the bridge
// ("oscCommand") and cannot wait for the answer while a script runs, so a command answers true when
// sent, a refusal arrives a moment later as a console line, and status() answers from the last status
// the transport gave. Each script's patterns are its own, and go when the scripts reload.

const oscInstances = new Map();   // scriptId -> oscCommands
const oscAsked = new Map();       // requestId -> { scriptId, op }
let oscStatusSeen = { listening: false, waiting: false, received: 0, sent: 0, dropped: 0 };
let oscRequests = 0;
let oscBridgeListening = false;

/** Which panel a yes for the network is for: its name, as the exported plug-in names it too (a saved
    panel keeps no id), so the window open and shut ask once between them. */
function oscPanelKey() {
  const panel = livePanel();
  return String(panel?.name || panel?.id || 'panel');
}

function ensureOscBridge() {
  const backend = window.__JUCE__?.backend;
  if (oscBridgeListening || typeof backend?.addEventListener !== 'function') return;
  oscBridgeListening = true;
  backend.addEventListener('oscCommandAnswered', (p) => oscHeard('oscCommandAnswered', p));
  backend.addEventListener('oscMessage', (p) => oscHeard('oscMessage', p));
}

/** One command to the transport; false when there is no app or plug-in to send it to. */
function oscSendCommand(fields, scriptId) {
  if (!isJuceAvailable()) return false;
  oscRequests += 1;
  const requestId = `osc${oscRequests}`;
  if (scriptId !== null) oscAsked.set(requestId, { scriptId, op: fields.op });
  ensureOscBridge();
  window.__JUCE__.backend.emitEvent('oscCommand', { ...fields, requestId, panel: oscPanelKey() });
  return true;
}

/** What the transport sends back: an answer to a command, or a message that arrived. */
function oscHeard(name, payload) {
  if (name === 'oscCommandAnswered') {
    const key = String(payload?.requestId ?? '');
    const asked = oscAsked.get(key);
    oscAsked.delete(key);
    const answer = payload?.answer;
    if (payload?.op === 'status') {
      if (answer && typeof answer === 'object') oscStatusSeen = { ...answer };
      return;
    }
    if (asked && answer && typeof answer === 'object' && answer.ok === false) {
      addScriptTrace('error', asked.scriptId, `ce.osc.${asked.op}: ${answer.why || answer.error || 'it was refused'}.`);
    }
    oscSendCommand({ op: 'status' }, null);   // and the picture after it
    return;
  }
  if (name !== 'oscMessage' || !payload || typeof payload.address !== 'string') return;
  oscStatusSeen = { ...oscStatusSeen, received: (Number(oscStatusSeen.received) || 0) + 1 };
  const outer = currentOrigin;
  currentOrigin = 'osc';
  try {
    for (const o of oscInstances.values()) o.receive(payload);
  } finally {
    currentOrigin = outer;
  }
  oscBindingsHeard(payload);
  dispatchEvents([{ event: 'onOscIn', controlName: null, payload, origin: 'osc' }]);
}

/** Tests stand in for the native side: what it sends back, as it would arrive. */
export function oscHeardForTesting(name, payload) { oscHeard(name, payload); }

function oscFor(scriptId) {
  const known = oscInstances.get(scriptId);
  if (known) return known;
  const listenersOwn = [];
  const o = oscCommands({
    say: (level, text) => addScriptTrace(level === 'warn' ? 'warn' : 'error', scriptId, text),
    listeners: () => listenersOwn,
    call: (fn, value) => runScriptCallback(scriptId, 'osc', () => fn(value)),
    query(op, fields) {
      if (op === 'status') {
        oscSendCommand({ op: 'status' }, null);
        return { ...oscStatusSeen };
      }
      if (!isJuceAvailable()) return { ok: false, why: 'OSC needs the app or the plug-in, which have a network port' };
      oscSendCommand({ ...fields, op }, scriptId);
      if (op === 'stop') {
        const was = oscStatusSeen.listening === true || oscStatusSeen.waiting === true;
        oscStatusSeen = { ...oscStatusSeen, listening: false, waiting: false };
        return was;
      }
      return { ok: true };
    },
  });
  oscInstances.set(scriptId, o);
  return o;
}

/** The panel went: the transport stops listening and forgets its targets. */
function forgetOsc() {
  oscBindingsSignature = '';
  oscLearnWaiter = null;
  oscLastSender.clear();
  oscInstances.clear();
  oscAsked.clear();
  if (oscStatusSeen.listening || oscStatusSeen.waiting || oscRequests > 0) oscSendCommand({ op: 'reset' }, null);
  oscStatusSeen = { listening: false, waiting: false, received: 0, sent: 0, dropped: 0 };
}


/* ---------------------------------------------------------------------- OSC learn (no script) */
// docs/design/ce-osc-module.md, "Panel side". A control with an oscControl binding follows an OSC
// address and, unless told not to, sends its value back there when anything else moves it. The panel's
// settings (panel.osc: port, network, targets) say where to listen and the names to send to. A
// control moved by OSC is written as a script's set() is, with origin() giving "osc", so it reaches
// the synth through its own binding and is never sent back to the address it came from.

const oscLastSender = new Map();   // control name -> { host, port } the last message for it came from
let oscBindingsSignature = '';
let oscLearnWaiter = null;

/** Every OSC binding on the panel, with the control it is on. */
function oscBindingsOf(panel) {
  const out = [];
  for (const control of flatControls(panel?.controls ?? [])) {
    const bindings = control?._children?.DeviceBindings;
    if (!bindings || bindings.enabled === false || !Array.isArray(bindings.bindings)) continue;
    for (const b of bindings.bindings) {
      if (b?.kind !== OSC_CONTROL_KIND || typeof b.address !== 'string' || !b.address.startsWith('/')) continue;
      out.push({ control, name: String(control._children.Core?.name ?? control._children.Core?.id), binding: b });
    }
  }
  return out;
}

/** The panel's OSC settings, read as the editor writes them. */
function panelOscSettings(panel) {
  const osc = panel?.osc && typeof panel.osc === 'object' ? panel.osc : {};
  const port = Number.isInteger(osc.port) && osc.port >= 1024 && osc.port <= 65535 ? osc.port : 8000;
  return { port, network: osc.network === true, targets: parseOscTargets(osc.targets) };
}

/** Open the panel's port when it has OSC bindings (or a learn is waiting), and name its targets.
    Sent again only when something it depends on changed. */
function syncOscBindings() {
  const panel = livePanel();
  const settings = panelOscSettings(panel);
  const wanted = oscBindingsOf(panel).length > 0 || oscLearnWaiter !== null;
  const signature = wanted ? JSON.stringify(settings) : '';
  if (signature === oscBindingsSignature) return;
  oscBindingsSignature = signature;
  if (!wanted) return;
  oscSendCommand({ op: 'listen', port: settings.port, network: settings.network, nextFree: true }, null);
  for (const t of settings.targets) oscSendCommand({ op: 'target', name: t.name, host: t.host, port: t.port }, null);
}

/** A message for the bindings: each control whose address matches takes the value. */
function oscBindingsHeard(message) {
  if (oscLearnWaiter) {
    const waiter = oscLearnWaiter;
    oscLearnWaiter = null;
    try { waiter(message.address, message); } catch { /* the editor's, not a script's */ }
  }
  for (const { name, binding } of oscBindingsOf(livePanel())) {
    if (!oscMatches(binding.address, message.address)) continue;
    const at = Math.max(1, Math.floor(Number(binding.valueIndex) || 1)) - 1;
    let v = message.args?.[at];
    if (typeof v === 'boolean') v = v ? 1 : 0;
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const min = Number.isFinite(Number(binding.min)) ? Number(binding.min) : 0;
    const max = Number.isFinite(Number(binding.max)) ? Number(binding.max) : 1;
    const t = max === min ? 0 : Math.max(0, Math.min(1, (v - min) / (max - min)));
    if (message.from) oscLastSender.set(name, message.from);
    panelsOrigin = 'osc';
    setValue(`${name}.value`, t, 'normalizedValue');
    panelsOrigin = null;
  }
}

/** A control with an OSC binding moved, not by OSC: its value goes back to the address. */
function oscFollowBinding(controlName, value) {
  if (controlName == null) return;
  for (const { control, name, binding } of oscBindingsOf(livePanel())) {
    if (name !== controlName || binding.sendBack === false) continue;
    const range = rangeOf(control);
    const v = Number(value);
    if (!range || !Number.isFinite(v)) continue;
    const t = Math.max(0, Math.min(1, (v - range.min) / (range.max - range.min)));
    const min = Number.isFinite(Number(binding.min)) ? Number(binding.min) : 0;
    const max = Number.isFinite(Number(binding.max)) ? Number(binding.max) : 1;
    const to = typeof binding.sendTo === 'string' && binding.sendTo.trim() !== '' ? binding.sendTo.trim() : oscLastSender.get(name);
    if (!to) continue;   // nobody has sent to it yet, and no target is named
    oscSendCommand({ op: 'send', to, address: binding.address.replace(/[*?[\]{}]/g, ''), args: [min + t * (max - min)], types: 'f' }, null);
  }
}

/** The editor's Learn: the next message's address goes to `fn`. Opens the panel's port for it. */
export function oscLearnNext(fn) {
  oscLearnWaiter = typeof fn === 'function' ? fn : null;
  oscBindingsSignature = '';
  syncOscBindings();
  return oscLearnWaiter !== null && Boolean(isJuceAvailable());
}

/** Tests: what the runtime does when the panel loads or changes. */
export function syncOscBindingsForTesting() { syncOscBindings(); }

/* ------------------------------------------------------------------ ce.daw and origin() */
// docs/design/ce-daw-module.md. With the plug-in's window open the page reads the DAW from what the
// processor pushes (PlayerHost::pushDawInfo), since the bridge cannot answer while a script waits,
// and sends what a script changes back (dawCommand). In the editor there is no DAW: the questions
// that need one answer nothing, and parameters gives the list the next export would bake.

let currentOrigin = null;          // what origin() answers inside a handler
/** Whether handlers are running (setValue has a `live` of its own, so it asks here). */
function dispatchingNow() { return live.dispatching; }
let panelsOrigin = null;           // who made the next panel-document change, when not a hand
let sessionsOrigin = null;         // who made the next preview change, when not a hand: a dump
const controlOrigins = new Map();  // control id -> "host" | "load", from the plug-in's pushes
let dawInfo = null;                // the plug-in's picture; null in the editor
let dawCommandSink = null;         // sends a change to the plug-in
let dawParamSink = null;           // sends a spare parameter's new position
const dawPageGestures = new Set(); // paths a script in this window holds a gesture on

/** The plug-in's picture of the DAW, as PlayerHost pushes it. null: the editor. */
export function setDawInfo(info) {
  dawInfo = info && typeof info === 'object' ? info : null;
  if (!dawInfo) dawPageGestures.clear();
}
export function setDawCommandSink(fn) { dawCommandSink = typeof fn === 'function' ? fn : null; }
export function setDawParamSink(fn) { dawParamSink = typeof fn === 'function' ? fn : null; }

/** The plug-in pushed a value for this control: the DAW's move, or a project's ("load"). */
export function noteHostValue(controlId, why) {
  if (controlId != null && (why === 'host' || why === 'load')) controlOrigins.set(String(controlId), why);
}

function dawEntry(id) {
  return (Array.isArray(dawInfo?.parameters) ? dawInfo.parameters : []).find((p) => p?.id === id) ?? null;
}

/** The DAW moved parameter `id`: automationIn, after the control's own value events. */
export function raiseAutomationIn(id, value) {
  const entry = dawEntry(String(id));
  if (!entry?.path) return null;
  const control = entry.control ?? String(entry.path).split('.')[0];
  return dispatchEvents([{ event: 'onAutomationIn', controlName: null, origin: 'host',
    payload: { control, path: entry.path, value, id: entry.id } }]);
}

/** The DAW chose a program, and the plug-in has sent it. */
export function raiseDawProgramIn(program) {
  if (!program || typeof program !== 'object') return null;
  const payload = { index: program.index, number: program.number, name: program.name };
  if (dawInfo) dawInfo = { ...dawInfo, program: { ...(dawInfo.program ?? {}), ...payload } };
  return dispatchEvents([{ event: 'onDawProgramIn', controlName: null, origin: 'host', payload }]);
}

/** A spare parameter moved in the DAW (or arrived with a project): its control moves with it. */
export function dawSpareMoved(slot, at, why = 'host') {
  const entry = dawEntry(`spare${slot}`);
  if (!entry?.path) return;
  const min = Number(entry.min), max = Number(entry.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return;
  let value = min + Math.max(0, Math.min(1, Number(at) || 0)) * (max - min);
  if (entry.kind === 'choice') value = Math.round(value);
  panelsOrigin = why === 'load' ? 'load' : 'host';
  setValue(entry.path, value);
  panelsOrigin = null;
  if (why !== 'load') raiseAutomationIn(entry.id, value);
}

/** A control on a spare moved, not by the spare: the spare follows, so the DAW sees it. */
function dawFollowSpare(controlName, value) {
  if (!dawInfo || !dawParamSink || controlName == null) return;
  for (const entry of dawInfo.parameters ?? []) {
    if (!entry?.path || !String(entry.id).startsWith('spare') || entry.control !== controlName) continue;
    const min = Number(entry.min), max = Number(entry.max);
    const v = Number(value);
    if (!Number.isFinite(v) || !(max > min)) continue;
    dawParamSink(entry.id, Math.max(0, Math.min(1, (v - min) / (max - min))));
  }
}

/** The list the next export would bake, as ce.daw.parameters gives it in the editor. */
function editorDawParameters() {
  const panel = livePanel();
  const list = collectExportParameters(panel).map((p) => {
    const entry = {
      id: p.id, name: p.label ?? p.id, path: p.path, control: p.controlName ?? String(p.path).split('.')[0],
      min: p.min, max: p.max, default: p.defaultValue, unit: p.unit ?? '', kind: p.valueKind ?? 'float',
      value: getValue(p.path),
    };
    if (entry.kind === 'choice' && Array.isArray(p.choiceLabels)) entry.choices = [...p.choiceLabels];
    if (p.group) entry.group = p.group;
    return entry;
  });
  const spares = Math.max(0, Math.min(32, Math.floor(Number(panel?.exportSettings?.spareDawParameters) || 0)));
  for (let slot = 1; slot <= spares; slot += 1) {
    list.push({ id: `spare${slot}`, name: `Spare ${slot}`, slot, min: 0, max: 1, default: 0, unit: '', kind: 'float', value: 0 });
  }
  return list;
}

/** What a control on a spare is shown as: its exported parameter's range, else its own. */
function spareDisplayFor(path) {
  const name = String(path).split('.')[0];
  const exported = collectExportParameters(livePanel()).find((p) => p.path === path);
  if (exported) {
    const d = { min: exported.min, max: exported.max, unit: exported.unit ?? '' };
    if (exported.valueKind === 'choice' && Array.isArray(exported.choiceLabels)) d.choices = [...exported.choiceLabels];
    return d;
  }
  const control = findControlByName(name);
  const range = control ? rangeOf(control) : null;
  if (!range) return null;
  const unit = control?._children?.Behavior?.unit;
  return { min: range.min, max: range.max, unit: typeof unit === 'string' ? unit : '' };
}

function dawHostFor(scriptId) {
  const say = (level, text) => addScriptTrace(level === 'warn' ? 'warn' : 'error', scriptId, text);
  const send = (command) => { if (dawCommandSink) dawCommandSink(command); };
  return {
    say,
    query(op, fields) {
      if (!dawInfo) {
        if (op === 'parameters') return editorDawParameters();
        if (op === 'programs') return [];
        if (op === 'host' || op === 'program') return undefined;
        return false;
      }
      const params = Array.isArray(dawInfo.parameters) ? dawInfo.parameters : [];
      const named = (path) => params.find((p) => p?.path === (String(path).includes('.') ? path : `${path}.value`)
        && !String(p.id).startsWith('spare'));
      if (op === 'host') return dawInfo.host ? { ...dawInfo.host, editorOpen: true } : undefined;
      if (op === 'parameters') return params.map((p) => ({ ...p, ...(p.path ? { value: getValue(p.path) } : {}) }));
      if (op === 'program') return dawInfo.program ?? undefined;
      if (op === 'programs') return Array.isArray(dawInfo.programs) ? dawInfo.programs : [];
      if (op === 'beginGesture' || op === 'endGesture') {
        const p = named(fields.path);
        if (!p) return false;
        if (op === 'beginGesture' ? dawPageGestures.has(p.path) : !dawPageGestures.has(p.path)) return false;
        if (op === 'beginGesture') dawPageGestures.add(p.path); else dawPageGestures.delete(p.path);
        send({ op, path: p.path });
        return true;
      }
      if (op === 'rename') {
        const p = named(fields.path);
        if (!p) return false;
        send({ op, path: p.path, name: fields.name });
        return true;
      }
      if (op === 'assign') {
        const count = Math.floor(Number(dawInfo.spares) || 0);
        if (fields.slot > count) return false;
        if (fields.path === '') { send({ op, slot: fields.slot, path: '', name: '' }); return true; }
        const path = String(fields.path).includes('.') ? fields.path : `${fields.path}.value`;
        const display = spareDisplayFor(path);
        if (!display) return false;
        send({ op, slot: fields.slot, path, name: fields.name, display });
        return true;
      }
      if (op === 'markChanged') {
        send({ op });
        scheduleDawStateSave();
        return true;
      }
      return undefined;
    },
  };
}

/** Tests feed the decoder through the same door the bridge does, at a time they choose. */
export function midiInputForTesting(payload) { onMidiInputMessage(payload); }
export function midiInFlushForTesting(now) {
  const events = midiInDecode.flush(now).map((e) => ({ event: e.event, controlName: null, payload: e.payload }));
  if (events.length) dispatchEvents(events, { inbound: true });
}

function onMidiInputMessage(payload) {
  if (live.dispatching || !live.enabledGlobal) return;
  if (!payload) return;
  const bytes = hexToBytes(payload.hex);
  if (!bytes.length) return;
  const status = bytes[0] ?? 0;
  const from = String(payload.deviceRole ?? '') || DEFAULT_ROLE;
  const events = [{
    event: 'onMidiIn',
    controlName: null,
    payload: { bytes, status, channel: status !== 0 ? (status & 0x0f) : 0, from },
  }];
  const decoded = midiInDecode.feed(from, bytes, Number.isFinite(payload.atForTesting) ? payload.atForTesting : midiInNow());
  if (String(payload.messageType ?? '') === 'cc' && bytes.length >= 3 && !decoded.ccTaken) {
    events.push({ event: 'onCcIn', controlName: null,
      payload: { channel: bytes[0] & 0x0f, cc: bytes[1], value: bytes[2], from } });
  }
  for (const e of decoded.events) events.push({ event: e.event, controlName: null, payload: e.payload });
  dispatchEvents(events, { inbound: true });
  if (!Number.isFinite(payload.atForTesting)) scheduleMidiInFlush();

  // A Program Change is the instrument saying which preset it is on. Raised AFTER the events above
  // rather than folded into them, because onPresetChange carries the profile's reading of the slot
  // — its name, its bank, whether it is writable — and that is a different thing from "a 0xC0
  // arrived", which onMidiIn already said.
  if ((status & 0xf0) === 0xc0 && bytes.length >= 2) {
    notePresetChangeFromDevice(String(payload.deviceRole ?? '') || DEFAULT_ROLE, bytes[1]);
  }
}

function onSysexInputMessage(payload) {
  if (live.dispatching || !live.enabledGlobal) return;
  if (!payload) return;
  const bytes = hexToBytes(payload.hex);
  if (!bytes.length) return;
  dispatchEvents([{ event: 'onSysexIn', controlName: null, payload: bytes }], { inbound: true });  // bare byte array

  // …and then the layouts the SCRIPT declared. onSysexIn fires either way: a declared layout adds
  // a decoded reading of the message, it does not take the raw one away, and a panel that handles
  // both must see both. Nothing happens at all when nothing is declared, which is what keeps every
  // existing panel behaving exactly as it did.
  const role = String(payload.deviceRole ?? '') || DEFAULT_ROLE;
  const decoded = decodeRuntimeDump(role, payload.hex);
  if (decoded == null) return;
  if (!decoded.ok) {
    // Reported, not silent: a sysex message arriving while layouts are declared and matching none
    // of them is the single most likely thing to be wrong with a hand-written layout, and it is
    // invisible otherwise. Traced rather than raised — a synth is entitled to send other messages.
    addScriptTrace('log', '', `dump: ${decoded.error}`);
    return;
  }
  onDumpParsed({ deviceRole: role, dumpId: decoded.kind, dumpName: decoded.name, values: decoded.values });
}

/* --- source 6: device connection state --- */
// deviceSessionState carries a per-role record; 'ready' is connected and anything else is not.
// Only the transitions raise an event, so a state refresh that says the same thing stays quiet.

const deviceConnected = new Map();   // role -> boolean

function onDeviceSessionStateChanged(state) {
  if (live.dispatching || !live.enabledGlobal) return;
  const events = [];
  for (const [role, record] of Object.entries(state ?? {})) {
    const now = String(record?.state ?? '') === 'ready';
    const before = deviceConnected.get(role);
    deviceConnected.set(role, now);
    if (before === undefined || before === now) continue;
    events.push({
      event: now ? 'onDeviceConnected' : 'onDeviceDisconnected',
      controlName: null,
      payload: { role, profileId: record?.profileId ?? '', message: record?.message ?? '' },
    });
  }
  if (events.length) dispatchEvents(events);
}

/* --- source 8: musical time --- */
// onBeat / onBar / onTransport, from the master clock. The store publishes at ~30Hz (PUBLISH_MS in
// stores/transport.js), which is the honest accuracy limit and is stated on every one of these
// members: a beat at 120bpm is 500ms, so the event lands within a frame of it. Right for an LED or
// a setlist advance; never for timing audio.
//
// Only TRANSITIONS are raised. A stopped transport is silent rather than repeating itself, and
// stopping forgets the position so restarting raises the first beat again instead of swallowing it
// as "no change" — the same rule the player's timer follows, for the same reason.

const clock = { beat: -1, bar: -1, playing: false, bpm: 0 };

function onTransportChanged(state) {
  if (live.dispatching || !live.enabledGlobal) return;

  const playing = state?.running === true;
  const bpmRaw = Number(state?.bpm);
  const bpm = Number.isFinite(bpmRaw) && bpmRaw > 0 ? bpmRaw : 0;
  const beatsPerBar = Number(state?.beatsPerBar) > 0 ? Number(state.beatsPerBar) : 4;
  const beats = Number(state?.beats) || 0;

  const payload = (bar, beat) => ({
    playing, bpm: bpm || null, beats, bar, beat, beatsPerBar,
    source: String(state?.source ?? 'internal'), valid: true,
  });

  const events = [];
  if (playing !== clock.playing || Math.abs(bpm - clock.bpm) > 0.001) {
    clock.playing = playing;
    clock.bpm = bpm;
    events.push({ event: 'onTransport', controlName: null, payload: payload(0, 0) });
  }

  if (!playing) {
    clock.beat = -1;
    clock.bar = -1;
  } else {
    const absoluteBeat = Math.floor(beats);
    if (absoluteBeat !== clock.beat) {
      clock.beat = absoluteBeat;
      const bar = Math.floor(absoluteBeat / beatsPerBar) + 1;
      const beat = (absoluteBeat % beatsPerBar) + 1;
      events.push({ event: 'onBeat', controlName: null, payload: payload(bar, beat) });
      if (bar !== clock.bar) {
        clock.bar = bar;
        events.push({ event: 'onBar', controlName: null, payload: payload(bar, beat) });
      }
    }
  }

  if (events.length) dispatchEvents(events);
}

/* --- source 7: decoded parameters arriving outside a dump --- */
// deviceRuntimeState is the decoded { role: { parameterId: value } } mirror. A dump updates it in
// one go (already covered by onDumpParsed); a single parameter echoed back by the synth updates
// one key, and that is what this turns into onParameterReceived.

const runtimeParams = new Map();   // "role\0parameter" -> value

function onDeviceRuntimeStateChanged(state) {
  if (live.dispatching || !live.enabledGlobal) return;
  const events = [];
  const seeding = runtimeParams.size === 0;
  for (const [role, params] of Object.entries(state ?? {})) {
    if (!params || typeof params !== 'object') continue;
    for (const [parameter, value] of Object.entries(params)) {
      const key = `${role}\u0000${parameter}`;
      const before = runtimeParams.get(key);
      runtimeParams.set(key, value);
      if (seeding || Object.is(before, value)) continue;
      events.push({ event: 'onParameterReceived', controlName: null, payload: { parameter, value, role } });
    }
  }
  if (events.length) dispatchEvents(events, { inbound: true });
}

/**
 * Wire the always-on dispatcher to the stores. Call once at app start. Idempotent. The dispatcher
 * follows the active panel and runs that panel's source scripts on value changes, preview
 * interaction, lifecycle, and incoming device dumps — independent of whether the script editor is open.
 */
export function initPanelRuntime() {
  if (live.inited) return;
  live.inited = true;
  setPreviewStopBarrier(() => previewStopWork);
  setExportApprovalCheck(panel => String(panel?.id) === String(livePanel()?.id) && ensurePanelExecutionApproved(null, true));
  live.activePanelId = get(scriptRuntimePanelId);
  live.prevPreviewOn = get(previewModeEnabled) === true;
  snapshotValues();
  seedSessionSnapshot();
  live.unsubs.push(scriptRuntimePanelId.subscribe((id) => {
    if (String(id) === String(live.activePanelId)) return;
    // The selection store has already moved. Destroy binds API reads and document writes
    // to the outgoing panel until its synchronous final hook has completed.
    destroyLoadedScripts();
    live.activePanelId = id;
    resetScriptState();
    live.dispatching = false;
    live.sessionsDirty = false;
    live.prevPreviewOn = false;
    snapshotValues();
    syncPanelPreviewSessions(livePanel()?.controls ?? []);
    seedSessionSnapshot();
    ensurePanelExecutionApproved();
    // A tab switch can leave Preview on: it is still a new run for the incoming panel.
    if (get(previewModeEnabled) === true) onPreviewModeChanged(true);
  }));
  live.unsubs.push(panels.subscribe(() => onPanelsChanged()));
  live.unsubs.push(scriptDocuments.subscribe(() => {
    if (!ensurePanelExecutionApproved()) resetScriptState();
  }));
  live.unsubs.push(panelPreviewSessions.subscribe((s) => onPreviewSessionsChanged(s)));
  live.unsubs.push(previewModeEnabled.subscribe((on) => onPreviewModeChanged(on === true)));
  live.unsubs.push(onDumpMessageParsed((payload) => onDumpParsed(payload)));
  live.unsubs.push(latestMidiInputMessage.subscribe((p) => onMidiInputMessage(p)));
  live.unsubs.push(latestSysexInputMessage.subscribe((p) => onSysexInputMessage(p)));
  live.unsubs.push(deviceSessionState.subscribe((s) => onDeviceSessionStateChanged(s)));
  live.unsubs.push(deviceRuntimeState.subscribe((s) => onDeviceRuntimeStateChanged(s)));
  live.unsubs.push(transportStore.subscribe((s) => onTransportChanged(s)));

  // The app is closing. `pagehide` rather than `beforeunload`: it is the one that also fires when
  // the page is discarded rather than navigated away from, which is what closing a WebView does.
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    const onPageHide = () => destroyLoadedScripts();
    window.addEventListener('pagehide', onPageHide);
    live.unsubs.push(() => window.removeEventListener('pagehide', onPageHide));
  }
}

/** Pause/resume all live dispatch (the editor's "Live" toggle). */
export function setLiveEnabled(on) {
  live.enabledGlobal = !!on;
  if (on) { snapshotValues(); seedSessionSnapshot(); }   // ignore changes made while paused
}

/**
 * Push the in-editor scripts as a live override for a panel (instant feedback before the debounced
 * save). Pass null to clear the override (the runtime falls back to the panel's saved document).
 */
export function setLiveScripts(scripts, panelId = null) {
  live.editOverride = scripts == null ? null : { panelId, scripts: Array.isArray(scripts) ? scripts : [] };
  // Swapping the script set retires the old set's listeners and timers. Edits to a script that
  // survives the swap are caught by the cache key; a script that disappears is not, and its
  // listeners would go on firing for a script the panel no longer has.
  resetScriptState();
  ensurePanelExecutionApproved();
}

/**
 * Fire a transient interaction event (onWheel / onDoubleClick / onPointerMove) for a control, with a
 * coordinate payload. Used by the preview surface for events that aren't persistent session state
 * (so they can't be detected from a panelPreviewSessions diff). Works in the editor and the player.
 */
export function dispatchInteraction(controlId, eventName, payload) {
  if (!live.enabledGlobal) return undefined;
  if (!behaviorEmits(controlByRuntimeId(controlId), eventName)) return undefined;
  const event = { event: eventName, controlName: controlNameById(controlId), payload };
  if (live.dispatching) {
    return new Promise((resolve, reject) => {
      live.interactions.push({ event, panelId: String(livePanel()?.id ?? live.activePanelId), resolve, reject });
    });
  }
  // The promise is returned rather than dropped. Callers in the UI ignore it — an interaction is
  // fire-and-forget — but returning it is what lets anything else wait for the handlers to finish.
  return dispatchEvents([event]).then(() => undefined);
}

/**
 * ce.keys: raise keyDown or keyUp ('onKeyDown' / 'onKeyUp') for the panel's scripts. Resolves true
 * when a handler returned true, which for keyDown keeps the key from the DAW and the editor.
 */
export function dispatchKeyEvent(eventName, payload) {
  if (!live.enabledGlobal) return Promise.resolve(false);
  const event = { event: eventName, controlName: null, payload };
  if (live.dispatching) {
    return new Promise((resolve, reject) => {
      live.interactions.push({ event, panelId: String(livePanel()?.id ?? live.activePanelId), resolve, reject, answer: true });
    });
  }
  return dispatchEvents([event]).then((answers) => answers[0] === true);
}

// A shortcut's function is a script's: run it as an on(…) listener is run, so its writes batch and a
// failure is that script's error rather than the keyboard's.
setShortcutRunner((shortcut, fields) => {
  try { withDocumentWriteBatch(() => shortcut.fn(fields)); } catch (e) { reportScriptError(shortcut.scriptId, e); }
});

// The keyboard belongs to the surface showing the panel these scripts run on.
setKeysPanelResolver(() => {
  try { return String(livePanel()?.id ?? live.activePanelId ?? ''); } catch { return ''; }
});

/** Whether any loaded script hears `eventName` ('onKeyDown'): only then is a key held back for it. */
export function scriptsHear(eventName) {
  if (!live.enabledGlobal) return false;
  return activeScripts().some((s) => s.enabled !== false && s.event === eventName)
    || listeners.some((l) => l.event === eventName);
}
