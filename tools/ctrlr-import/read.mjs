// read.mjs — S1 of the Ctrlr import: open the file and say what is in it.
//
// The plan calls this "the cheapest possible way to be wrong early", and that is exactly what it is
// for: run it over a corpus and learn what the corpus actually contains BEFORE committing to any
// mapping. It converts nothing.
//
// WHAT A .panel AND A .bpanelz ARE. `.panel` is XML. `.bpanelz` is the compressed form, and the
// plan's own open questions flag the details as unconfirmed — Ctrlr is JUCE, JUCE's
// GZIPCompressorOutputStream writes a zlib or gzip stream depending on how it is constructed, and
// nobody here has a real file to check against. So `openPanelFile` TRIES, in order, and REPORTS
// which worked: that turns an unconfirmed detail into an observation the first real file makes for
// us, instead of a guess baked into a parser.
//
// The one thing it will not do is pretend. A file that decompresses to something that is not a
// Ctrlr panel is refused by name, because a converter that half-reads a file is worse than one that
// says it cannot read it.

import { gunzipSync, inflateSync, inflateRawSync } from 'node:zlib';

import { attr, attrNumber, findAll, parseXml } from './xml.mjs';

/** The Lua hooks a panel can define, from Ctrlr's own vocabulary. */
export const LUA_HOOKS = [
  'luaPanelLoaded', 'luaPanelSaved', 'luaPanelMidiReceived', 'luaPanelMidiSent',
  'luaPanelPaintBackground', 'luaModulatorValueChange', 'luaModulatorGetValueForMIDI',
  'luaModulatorGetValueFromMIDI', 'uiCustomPaintCallback', 'luaPanelTimerCallback',
];

/**
 * The three kinds of Lua, ranked by how portable they are — the plan's §Layer 3.
 *
 * This classification is the deliverable of S4 and is computed here because S1 has to report it:
 * whether the corpus rewards a compatibility shim is a question about the histogram, and the
 * histogram is what S1 exists to produce.
 */
export const LUA_CLASS = {
  shimmable: 'shimmable',   // value/MIDI logic — maps onto things ce.* already does
  port: 'port',             // panel orchestration — portable in principle, panel-specific in practice
  paint: 'paint',           // immediate-mode JUCE drawing; no mapping exists, and none is coming
};

const PAINT_HOOKS = new Set(['luaPanelPaintBackground', 'uiCustomPaintCallback']);
const SHIMMABLE_HOOKS = new Set([
  'luaModulatorValueChange', 'luaModulatorGetValueForMIDI', 'luaModulatorGetValueFromMIDI',
  'luaPanelMidiReceived', 'luaPanelMidiSent',
]);

/** Which of the three a method body falls in, judged by its hook and then by what it touches. */
export function classifyLuaMethod({ name = '', hooks = [], body = '' } = {}) {
  if (hooks.some((hook) => PAINT_HOOKS.has(hook))) return LUA_CLASS.paint;
  // A method nothing calls still paints if it draws: Ctrlr panels wire paint callbacks by name from
  // a component attribute, so the hook list is not always the whole story.
  if (/\b(Graphics|drawText|fillRect|drawImage|setColour|fillAll)\b/.test(body)) return LUA_CLASS.paint;
  if (hooks.some((hook) => SHIMMABLE_HOOKS.has(hook))) return LUA_CLASS.shimmable;
  if (/CtrlrMidiMessage|getValue\(\)|setValue\(|:getModulatorByName/.test(body)) return LUA_CLASS.shimmable;
  return LUA_CLASS.port;
}

/**
 * Decompress if needed, and say how.
 *
 * Order matters only in that each attempt is cheap and the first success wins. `raw` is last
 * because a `.panel` is plain XML and a `.bpanelz` is not, so trying it first would mis-report a
 * compressed file that happened to start with whitespace.
 */
export function decodePanelBytes(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
  if (buffer.length === 0) return { ok: false, error: 'The file is empty.' };

  const attempts = [
    ['gzip', () => gunzipSync(buffer)],
    ['zlib', () => inflateSync(buffer)],
    ['deflate', () => inflateRawSync(buffer)],
    ['plain', () => buffer],
  ];

  const tried = [];
  for (const [encoding, decode] of attempts) {
    let text;
    try {
      text = decode().toString('utf8');
    } catch (error) {
      tried.push(`${encoding}: ${error.message}`);
      continue;
    }
    // Decompressing to bytes is not the same as decompressing to a panel — a wrong guess can
    // succeed and produce noise, so the result has to look like the thing we came for.
    if (/<\s*panel[\s>]/i.test(text) || /<\s*\?xml/i.test(text)) return { ok: true, encoding, text };
    tried.push(`${encoding}: decoded, but the result is not a Ctrlr panel`);
  }

  return {
    ok: false,
    error: 'Could not read this as a Ctrlr panel.',
    // Reported rather than swallowed: "which decompressors were tried and what each said" is
    // exactly what the first real .bpanelz will need somebody to look at.
    attempts: tried,
  };
}

const countBy = (items, key) => {
  const out = {};
  for (const item of items) {
    const k = String(key(item) ?? '').trim() || '(none)';
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
};

/**
 * Everything S1 promises: device name, author, version, counts and histograms.
 *
 * Nothing here is a conversion and nothing here guesses. A field the panel does not carry comes
 * back empty rather than defaulted, because the point of this stage is to learn what the corpus
 * has, and a default would answer the question with our own assumption.
 */
export function readCtrlrPanel(bytes) {
  const decoded = decodePanelBytes(bytes);
  if (!decoded.ok) return { ok: false, error: decoded.error, attempts: decoded.attempts };

  let root;
  try {
    root = parseXml(decoded.text);
  } catch (error) {
    return { ok: false, error: `The panel is not valid XML — ${error.message}` };
  }

  const modulators = findAll(root, 'modulator');
  const components = modulators
    .map((m) => (m.children ?? []).find((c) => c.name === 'component'))
    .filter(Boolean)
    .concat(findAll(root, 'uiComponent'));
  const midiNodes = modulators
    .map((m) => (m.children ?? []).find((c) => c.name === 'midi'))
    .filter(Boolean);

  const methods = findAll(root, 'luaMethod').concat(findAll(root, 'method'));
  const luaMethods = methods.map((node) => {
    const name = attr(node, 'luaMethodName') || attr(node, 'name');
    const body = node.text ?? '';
    // A method is attached to a hook by NAME from an attribute elsewhere in the document, so the
    // hooks a method serves are found by looking for its name rather than read off the method.
    // A plain substring search rather than a regexp: the name comes out of the file, and building
    // a pattern from it would let a method called `.*` claim every hook there is.
    const hooks = name ? LUA_HOOKS.filter((hook) => decoded.text.includes(`${hook}="${name}"`)) : [];
    return { name, hooks, bytes: body.length, classification: classifyLuaMethod({ name, hooks, body }) };
  });

  const resources = findAll(root, 'resource').map((node) => ({
    name: attr(node, 'resourceName') || attr(node, 'name'),
    type: attr(node, 'resourceType') || attr(node, 'type'),
    bytes: attrNumber(node, 'resourceSize', (node.text ?? '').length),
  }));

  return {
    ok: true,
    encoding: decoded.encoding,
    panel: {
      name: attr(root, 'panelName') || attr(root, 'name'),
      author: attr(root, 'panelAuthor'),
      version: attr(root, 'panelVersion'),
      manufacturer: attr(root, 'panelManufacturer'),
      instrument: attr(root, 'panelInstrument'),
      width: attrNumber(root, 'panelCanvasRectangleWidth', 0),
      height: attrNumber(root, 'panelCanvasRectangleHeight', 0),
    },
    counts: {
      modulators: modulators.length,
      components: components.length,
      luaMethods: luaMethods.length,
      resources: resources.length,
    },
    histograms: {
      componentType: countBy(components, (c) => attr(c, 'uiType') || attr(c, 'componentType') || c.name),
      sliderStyle: countBy(components.filter((c) => attr(c, 'uiSliderStyle')), (c) => attr(c, 'uiSliderStyle')),
      messageType: countBy(midiNodes, (m) => attr(m, 'midiMessageType')),
      luaClass: countBy(luaMethods, (m) => m.classification),
    },
    luaMethods,
    resources,
    root,
  };
}

/** The report as text, for the CLI. One screen, no conversion, nothing inferred. */
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

  return [
    `${label || panel.name || 'panel'}  [${result.encoding}]`,
    `  ${panel.name || '(unnamed)'}${panel.version ? ` v${panel.version}` : ''}`
      + `${panel.author ? ` by ${panel.author}` : ''}`
      + `${panel.instrument ? ` — ${panel.manufacturer} ${panel.instrument}`.replace('  ', ' ') : ''}`,
    `  ${counts.modulators} modulators, ${counts.components} components, `
      + `${counts.luaMethods} Lua methods, ${counts.resources} resources`,
    table('component types', histograms.componentType),
    table('slider styles', histograms.sliderStyle),
    table('message types', histograms.messageType),
    table('Lua', histograms.luaClass),
  ].join('\n');
}
