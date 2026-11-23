// read.js — S1 of the Ctrlr import: open the file and say what is in it.
//
// It converts nothing. Run over a corpus it says what the corpus contains, and run before the other
// stages it gives them the panel as one tree whatever form the file was in.
//
// THE FORMS A PANEL COMES IN, as 482 public panels showed (docs/design/ctrlr-import-plan.md, "What
// real panels showed"); the first version of this reader was written before anybody here had seen
// one, and refused or misread most of them:
//
//   .panel     XML.
//   .bpanelz   JUCE's binary ValueTree, zlib-compressed. NOT compressed XML (binary.js).
//   .bpanel    the same binary tree, uncompressed.
//   a program  an editor Ctrlr exported — a Windows, Linux or macOS program or plug-in — carries its
//              panel inside, compressed. Several of the best editors are published only that way.
//
// Each decoder is tried, and the one that worked is REPORTED, so a file that is none of these is
// refused with the list of what was tried rather than half-read.

import { gunzipSync, inflateSync, unzlibSync } from 'fflate';

import { attr, attrNumber, findAll, findFirst, parseXml } from './xml.js';
import { findEmbeddedPanel, isBinaryPanel, looksLikeProgram, parseValueTree } from './binary.js';

/** The Lua hooks a panel names a method for, from Ctrlr's own vocabulary. */
export const LUA_HOOKS = [
  'luaPanelLoaded', 'luaPanelBeforeLoad', 'luaPanelSaved', 'luaPanelMidiReceived', 'luaPanelMidiSent',
  'luaPanelPaintBackground', 'luaPanelProgramChanged', 'luaPanelMidiChannelChanged', 'luaModulatorValueChange',
  'luaModulatorGetValueForMIDI', 'luaModulatorGetValueFromMIDI', 'uiCustomPaintCallback', 'luaPanelTimerCallback',
];

/** An attribute that names a Lua method rather than holding a value. */
const HOOK_ATTRIBUTE = /^(lua|componentLua)|Callback$|^uiTabsCurrentTabChanged$|^uiButtonLua|^uiComboLua/;
const NO_METHOD = new Set(['', '-- None', '--None', 'None']);

/** The three kinds of Lua, ranked by how portable they are (the plan's §Layer 3). */
export const LUA_CLASS = {
  shimmable: 'shimmable',   // value/MIDI logic — maps onto things ce.* already does
  port: 'port',             // panel orchestration — portable in principle, panel-specific in practice
  paint: 'paint',           // immediate-mode JUCE drawing; no mapping exists
};

const PAINT_HOOKS = new Set(['luaPanelPaintBackground', 'uiCustomPaintCallback', 'uiCustomPaintOverChildrenCallback']);
const SHIMMABLE_HOOKS = new Set([
  'luaModulatorValueChange', 'luaModulatorGetValueForMIDI', 'luaModulatorGetValueFromMIDI',
  'luaPanelMidiReceived', 'luaPanelMidiSent',
]);

/** Which of the three a method body falls in, judged by its hooks and then by what it touches. */
export function classifyLuaMethod({ hooks = [], body = '' } = {}) {
  if (hooks.some((hook) => PAINT_HOOKS.has(hook))) return LUA_CLASS.paint;
  // A method no hook names still paints if it draws: a paint callback can be wired by name from a
  // component attribute, or called from another method.
  if (/\b(Graphics|drawText|fillRect|drawImage|setColour|fillAll|drawRect|fillRoundedRectangle)\b/.test(body)) return LUA_CLASS.paint;
  if (hooks.some((hook) => SHIMMABLE_HOOKS.has(hook))) return LUA_CLASS.shimmable;
  if (/CtrlrMidiMessage|getValue\(\)|setValue\(|:getModulatorByName/.test(body)) return LUA_CLASS.shimmable;
  return LUA_CLASS.port;
}

/**
 * Ctrlr's message types (CtrlrMidiMessage.h, CtrlrMidiMessageType), in order. A panel writes the
 * NUMBER — `midiMessageType="5"`, occasionally "5.0" — and a few old ones the name.
 */
export const MESSAGE_TYPES = [
  'CC', 'Aftertouch', 'ChannelPressure', 'NoteOn', 'NoteOff', 'SysEx', 'Multi', 'ProgramChange',
  'PitchWheel', 'None', 'MidiClock', 'MidiClockContinue', 'MidiClockStop', 'MidiClockStart', 'ActiveSense',
];

/** The type's name, whichever way the file wrote it, or '' when it is not one. */
export function messageTypeName(value) {
  const text = String(value ?? '').trim();
  if (text === '') return 'None';
  if (/^-?\d+(\.0*)?$/.test(text)) return MESSAGE_TYPES[Number.parseInt(text, 10)] ?? '';
  const named = MESSAGE_TYPES.find((name) => name.toLowerCase() === text.toLowerCase().replace(/[\s_-]/g, ''));
  if (named) return named;
  return { controlchange: 'CC', cchires: 'CC', pc: 'ProgramChange', pitchbend: 'PitchWheel' }[text.toLowerCase()] ?? '';
}

/**
 * Decompress if needed, and say how: `{ ok, encoding, format, text | bytes }`, `format` being
 * 'xml' or 'binary'. A program or plug-in is searched for the panel it carries.
 */
export function decodePanelBytes(bytes) {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  if (buffer.length === 0) return { ok: false, error: 'The file is empty.' };

  const tried = [];
  const accept = (encoding, data) => {
    if (isBinaryPanel(data)) return { ok: true, encoding, format: 'binary', bytes: data };
    const text = new TextDecoder('utf-8').decode(data.subarray(0, Math.min(data.length, 1 << 22)));
    if (/<\s*panel[\s>]/i.test(text.slice(0, 4096)) || (/^\s*<\?xml/i.test(text) && /<\s*panel[\s>]/i.test(text))) {
      const whole = data.length > (1 << 22) ? new TextDecoder('utf-8').decode(data) : text;
      // Ctrlr reads the text as a JUCE String, which ends at the first NUL. Some saved panels
      // carry one after </panel> (the terminator written out with the text), and Ctrlr opens them.
      const end = whole.indexOf('\0');
      return { ok: true, encoding, format: 'xml', text: end >= 0 ? whole.slice(0, end) : whole };
    }
    return null;
  };

  if (looksLikeProgram(buffer)) {
    const found = findEmbeddedPanel(buffer);
    if (found.ok) {
      const result = accept('program', found.bytes);
      if (result) return { ...result, resourceLists: found.resources };
    }
    tried.push(`program: ${found.error ?? 'what it carries is not a panel'}`);
  } else {
    const attempts = [
      ['gzip', () => gunzipSync(buffer)],
      ['zlib', () => unzlibSync(buffer)],
      ['deflate', () => inflateSync(buffer)],
      ['plain', () => buffer],
    ];
    for (const [encoding, decode] of attempts) {
      let data;
      try {
        data = decode();
      } catch (error) {
        tried.push(`${encoding}: ${error.message}`);
        continue;
      }
      const result = accept(encoding, data);
      if (result) return result;
      tried.push(`${encoding}: decoded, but the result is not a Ctrlr panel`);
    }
  }

  return { ok: false, error: 'Could not read this as a Ctrlr panel.', attempts: tried };
}

const countBy = (items, key) => {
  const out = {};
  for (const item of items) {
    const k = String(key(item) ?? '').trim() || '(none)';
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
};

/** "x y w h" (or comma-separated) as numbers, or null. */
function rectangleOf(text) {
  const parts = String(text ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
  return parts.length === 4 && parts.every(Number.isFinite) ? parts : null;
}

/** The panel's own details, under the names real panels use (and the older ones as a fallback). */
function panelDetails(root) {
  const editor = findFirst(root, 'uiPanelEditor');
  const canvas = rectangleOf(attr(editor, 'uiPanelCanvasRectangle', ''));
  const major = attr(root, 'panelVersionMajor');
  const minor = attr(root, 'panelVersionMinor');
  const version = attr(root, 'panelVersion')
    || [major, minor].filter((part) => part !== '').join('.')
    + (attr(root, 'panelVersionName') && attr(root, 'panelVersionName') !== major ? ` (${attr(root, 'panelVersionName')})` : '');
  const globals = String(attr(root, 'panelGlobalVariables', '')).split(':').filter((part) => part.trim() !== '').map(Number);
  return {
    name: attr(root, 'name') || attr(root, 'panelName'),
    author: attr(root, 'panelAuthorName') || attr(root, 'panelAuthor'),
    version,
    manufacturer: attr(root, 'panelVendor') || attr(root, 'panelManufacturer'),
    instrument: attr(root, 'panelDevice') || attr(root, 'panelInstrument'),
    width: canvas ? canvas[2] : attrNumber(root, 'panelCanvasRectangleWidth', 0),
    height: canvas ? canvas[3] : attrNumber(root, 'panelCanvasRectangleHeight', 0),
    // The device's MIDI channel, 1-16: what a message's channel is when it does not set its own.
    outputChannel: Math.min(16, Math.max(1, attrNumber(root, 'panelMidiOutputChannelDevice', 1))),
    // Ctrlr's panel variables, k0..kN in a SysEx formula. -1 is "not set".
    globals: globals.map((value) => (Number.isFinite(value) ? value : -1)),
    // Ctrlr's layers, back to front (uiPanelCanvasLayerIndex): a panel keeps whole pages of controls
    // on layers that start hidden and shows them from Lua — the CTX81Z has 16 layers, 7 of them
    // hidden, and drawn all at once its controls lie on top of one another.
    layers: findAll(root, 'uiPanelCanvasLayer').map((layer) => ({
      uid: attr(layer, 'uiPanelCanvasLayerUid', ''),
      name: attr(layer, 'uiPanelCanvasLayerName', ''),
      visible: !['false', '0', '0.0'].includes(String(attr(layer, 'uiPanelCanvasLayerVisibility', 'true')).trim().toLowerCase()),
      index: attrNumber(layer, 'uiPanelCanvasLayerIndex', 0),
    })).sort((a, b) => a.index - b.index),
    background: {
      colour: attr(editor, 'uiPanelBackgroundColour', ''),
      image: attr(editor, 'uiPanelImageResource', ''),
      imageLayout: attr(editor, 'uiPanelImageLayout', ''),
    },
  };
}

/** Every node, in document order. */
function walk(node, out = []) {
  out.push(node);
  for (const child of node.children ?? []) walk(child, out);
  return out;
}

/**
 * Everything S1 promises: the panel's details, counts and histograms, its Lua, its pictures, and
 * the tree for the other stages. A field the panel does not carry comes back empty, not defaulted.
 */
export function readCtrlrPanel(bytes) {
  const decoded = decodePanelBytes(bytes);
  if (!decoded.ok) return { ok: false, error: decoded.error, attempts: decoded.attempts };

  let root;
  try {
    root = decoded.format === 'binary' ? parseValueTree(decoded.bytes) : parseXml(decoded.text);
  } catch (error) {
    return { ok: false, error: `The panel is damaged — ${error.message}` };
  }
  if (root.name !== 'panel') return { ok: false, error: `This is a "${root.name}", not a Ctrlr panel.` };

  const nodes = walk(root);
  const modulators = nodes.filter((node) => node.name === 'modulator');
  const components = nodes.filter((node) => node.name === 'component' || node.name === 'uiComponent');
  const midiNodes = modulators.map((m) => (m.children ?? []).find((c) => c.name === 'midi')).filter(Boolean);

  // Which hooks name each method. A method is attached by NAME from an attribute anywhere in the
  // document — the panel's own luaPanelLoaded, or each of 300 modulators' luaModulatorValueChange.
  const hooksByMethod = new Map();
  for (const node of nodes) {
    for (const [key, value] of Object.entries(node.attributes ?? {})) {
      if (!HOOK_ATTRIBUTE.test(key) || key.startsWith('luaMethod') || NO_METHOD.has(String(value).trim())) continue;
      const name = String(value).trim();
      if (!hooksByMethod.has(name)) hooksByMethod.set(name, new Map());
      const hooks = hooksByMethod.get(name);
      hooks.set(key, (hooks.get(key) ?? 0) + 1);
    }
  }

  const methods = nodes.filter((node) => node.name === 'luaMethod' || (node.name === 'method' && attr(node, 'luaMethodName')));
  const luaMethods = methods.map((node) => {
    const name = attr(node, 'luaMethodName') || attr(node, 'name');
    // In the attribute in every panel surveyed; the element text in a hand-written one.
    const body = attr(node, 'luaMethodCode') || node.text || '';
    const counted = hooksByMethod.get(name) ?? new Map();
    const hooks = [...counted.keys()];
    return {
      name,
      hooks,
      uses: Object.fromEntries(counted),
      bytes: body.length,
      source: body,
      file: attr(node, 'luaMethodSourcePath') || '',
      classification: classifyLuaMethod({ hooks, body }),
    };
  });

  // A program's pictures come in a tree of their own beside the panel (binary.js findEmbeddedPanel).
  const extraResources = [];
  for (const list of decoded.resourceLists ?? []) {
    try { extraResources.push(...findAll(parseValueTree(list), 'resource')); } catch { /* a damaged list leaves its pictures out, and the notes say which */ }
  }
  const resources = [...extraResources, ...findAll(root, 'resource')].map((node) => ({
    name: attr(node, 'resourceName') || attr(node, 'name'),
    type: attr(node, 'resourceType') || attr(node, 'type'),
    file: attr(node, 'resourceFile'),
    bytes: attrNumber(node, 'resourceSize', 0),
    // The picture itself, when the file carries it: JUCE base64 text, or raw bytes in a few.
    data: attr(node, 'resourceData', ''),
    blob: node.blobs?.resourceData ?? null,
  }));

  return {
    ok: true,
    encoding: decoded.encoding,
    format: decoded.format,
    panel: panelDetails(root),
    counts: {
      modulators: modulators.length,
      components: components.length,
      luaMethods: luaMethods.length,
      resources: resources.length,
      picturesInFile: resources.filter((r) => r.data || r.blob).length,
    },
    histograms: {
      componentType: countBy(components, (c) => attr(c, 'uiType') || attr(c, 'componentType') || c.name),
      sliderStyle: countBy(components.filter((c) => attr(c, 'uiSliderStyle')), (c) => attr(c, 'uiSliderStyle')),
      messageType: countBy(midiNodes, (m) => messageTypeName(attr(m, 'midiMessageType')) || `"${attr(m, 'midiMessageType')}"`),
      luaClass: countBy(luaMethods, (m) => m.classification),
    },
    luaMethods,
    resources,
    root,
  };
}

/** The report as text, for the CLI and the Console. One screen, no conversion, nothing inferred. */
export function formatReport(result, label = '') {
  if (!result.ok) {
    const lines = [`${label || 'panel'}: ${result.error}`];
    for (const attempt of result.attempts ?? []) lines.push(`    ${attempt}`);
    return lines.join('\n');
  }

  const { panel, counts, histograms } = result;
  const table = (title, map) => {
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) return `  ${title}: none`;
    return `  ${title}: ${entries.map(([k, v]) => `${k}×${v}`).join(', ')}`;
  };
  const form = result.encoding === 'program'
    ? 'found inside a Ctrlr-made program'
    : `${result.format === 'binary' ? 'binary' : 'XML'}${['gzip', 'zlib', 'deflate'].includes(result.encoding) ? `, ${result.encoding}-compressed` : ''}`;

  return [
    `${label || panel.name || 'panel'}  [${form}]`,
    `  ${panel.name || '(unnamed)'}${panel.version ? ` v${panel.version}` : ''}`
      + `${panel.author ? ` by ${panel.author}` : ''}`
      + `${panel.manufacturer || panel.instrument ? ` — ${[panel.manufacturer, panel.instrument].filter(Boolean).join(' ')}` : ''}`
      + `${panel.width && panel.height ? `, ${panel.width}×${panel.height}` : ''}`,
    `  ${counts.modulators} modulators, ${counts.components} components, `
      + `${counts.luaMethods} Lua methods, ${counts.resources} resources (${counts.picturesInFile} carried in the file)`,
    table('component types', histograms.componentType),
    table('slider styles', histograms.sliderStyle),
    table('message types', histograms.messageType),
    table('Lua', histograms.luaClass),
  ].join('\n');
}
