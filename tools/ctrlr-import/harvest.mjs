// harvest.mjs — S2 of the Ctrlr import, and the stage with the return.
//
// THE REFRAME the plan turns on: *do not write a UI converter — write a profile harvester*. There
// are on the order of a thousand community Ctrlr panels covering several hundred devices. A
// harvester over that corpus produces a device library; a pixel-faithful UI converter produces a
// thousand debugging sessions.
//
// A Ctrlr modulator is a named parameter with a min, a max and a rule for turning a value into
// bytes. A DPD parameter is a named parameter with a min, a max and a rule for turning a value into
// bytes. The impedance mismatch is close to zero and the direction of travel is toward the richer
// model, so this is a translation rather than a port.
//
// WHAT IS NOT GUESSED. A modulator whose message this cannot express comes back in `flagged` with
// the reason, and does NOT become a parameter with a plausible-looking address. A profile that
// quietly contains a wrong address is worse than one that is missing a parameter, because the first
// sends bytes to a synth and the second does not.

import { attr, attrBool, attrNumber } from './xml.mjs';

/** Ctrlr's `midiMessageType` vocabulary, and what the DPD calls the same thing. */
const MESSAGE_KIND = {
  cc: 'cc',
  controlchange: 'cc',
  cchires: 'cc',
  sysex: 'sysex',
  nrpn: 'nrpn',
  rpn: 'nrpn',
  programchange: 'programChange',
  pc: 'programChange',
  note: 'note',
  channelpressure: 'aftertouch',
  aftertouch: 'aftertouch',
  pitchwheel: 'bend',
  none: 'none',
};

const slug = (text) => String(text ?? '')
  .trim()
  .replace(/[^A-Za-z0-9]+/g, '.')
  .replace(/^\.+|\.+$/g, '')
  .toLowerCase();

/**
 * Is this expression the identity?
 *
 * The plan's fourth open question — how widely `modulatorValueExpression` is used in practice
 * versus left at the identity — is what decides how much parser is worth writing. So rather than
 * writing a parser for a language nobody has measured, this recognises the identity (and the empty
 * string, and the handful of trivial forms) and flags everything else for a human. The corpus run
 * then answers the question with a number instead of an opinion.
 */
export function isIdentityExpression(expression) {
  const text = String(expression ?? '').trim();
  if (!text) return true;
  return ['modulatorValue', 'value', 'midiValue', 'return modulatorValue', 'return value']
    .includes(text.replace(/;$/, '').trim());
}

/**
 * Read a SysEx formula's byte template.
 *
 * Ctrlr writes these as hex bytes with placeholders — `F0 41 10 00 xx F7` — where the value lands.
 * Anything with Lua in it is refused rather than approximated: `midiMessageSysExFormula` can hold a
 * whole function, and turning that into an address is exactly the guess this stage must not make.
 */
export function readSysexTemplate(formula) {
  const text = String(formula ?? '').trim();
  if (!text) return { ok: false, reason: 'the SysEx formula is empty' };
  if (/[(){}=]|function|return/i.test(text)) {
    return { ok: false, reason: 'the SysEx formula is Lua, not a byte template' };
  }

  const tokens = text.split(/[\s,]+/).filter(Boolean);
  const bytes = [];
  let valueSlots = 0;

  for (const token of tokens) {
    if (/^(xx|vv|nn|zz)$/i.test(token)) { bytes.push(token.toLowerCase()); valueSlots += 1; continue; }
    if (/^[0-9A-Fa-f]{1,2}$/.test(token)) { bytes.push(Number.parseInt(token, 16)); continue; }
    return { ok: false, reason: `the SysEx formula has a token this does not understand ("${token}")` };
  }

  if (bytes.length === 0) return { ok: false, reason: 'the SysEx formula has no bytes' };
  if (valueSlots === 0) return { ok: false, reason: 'the SysEx formula has no place for the value' };
  if (valueSlots > 1) return { ok: false, reason: `the SysEx formula has ${valueSlots} value slots` };
  return { ok: true, bytes, valueSlots };
}

/** One `<modulator>` -> one DPD parameter, or a flag saying why it could not be one. */
export function harvestModulator(node, { group = 'Imported' } = {}) {
  const name = attr(node, 'modulatorName') || attr(node, 'name');
  if (!name) return { ok: false, flag: { id: '', name: '', reason: 'the modulator has no name' } };

  const id = slug(name);
  const midi = (node.children ?? []).find((c) => c.name === 'midi') ?? node;
  const rawKind = String(attr(midi, 'midiMessageType', '')).replace(/\s+/g, '').toLowerCase();
  const kind = MESSAGE_KIND[rawKind] ?? '';

  const min = attrNumber(node, 'modulatorMin', 0);
  const max = attrNumber(node, 'modulatorMax', 127);
  const value = attrNumber(node, 'modulatorValue', min);

  const flag = (reason) => ({ ok: false, flag: { id, name, reason } });

  if (!kind || kind === 'none') return flag(`message type "${rawKind || 'none'}" is not a parameter send`);

  // The plan is explicit that these are where the real work is, and equally explicit that a formula
  // which does not fit the declarative model gets flagged rather than guessed at.
  for (const [attribute, label] of [
    ['modulatorValueExpression', 'value expression'],
    ['modulatorValueExpressionReverse', 'reverse value expression'],
    ['modulatorControllerExpression', 'controller expression'],
  ]) {
    const expression = attr(node, attribute, '');
    if (!isIdentityExpression(expression)) return flag(`${label} is not the identity ("${expression.trim()}")`);
  }

  const parameter = {
    id,
    name,
    group,
    type: 'integer',
    default: value,
    range: { min, max },
    display: { mode: 'number', shortLabel: name },
    normalization: { mode: 'linear' },
    encoding: { type: max > 127 ? 'u14' : 'u7' },
    access: { canRead: false, canWrite: true, realtimeSafe: true, source: 'singleParameter' },
    sendPolicy: { mode: 'continuous', coalesce: true, minIntervalMs: 20, sendFinalOnRelease: true },
    ui: { preferredComponent: 'Slider' },
    // Kept so a human reading the harvest can find the modulator it came from. The DPD ignores it.
    ctrlr: { messageType: rawKind, vstIndex: attrNumber(node, 'vstIndex', -1),
             vstExported: attrBool(node, 'modulatorVstExported', false) },
  };

  // A parameter names a RECIPE, and the recipe is a separate top-level entry. Getting this wrong
  // is the trap the engine tests already record: "a parameter that names a messageRecipe the
  // profile does not define makes loadFromJson reject the WHOLE profile — silently, taking all 793
  // parameters with it". So each parameter comes back with the recipe it needs attached, and
  // harvestProfile collects them.
  if (kind === 'cc') {
    const controller = attrNumber(midi, 'midiMessageCtrlrNumber', -1);
    if (controller < 0 || controller > 127) return flag(`CC number ${controller} is out of range`);
    parameter.messageRecipe = `cc${controller}`;
    parameter.inbound = [{ kind: 'cc', controller }];
    // canRead is true for a CC and false for everything else here, because a CC is the one kind
    // this can honestly claim the synth will echo.
    parameter.access.canRead = true;
    return {
      ok: true,
      parameter,
      recipe: { id: `cc${controller}`, kind: 'cc', channel: '$channel', controller, value: '$encodedValue' },
    };
  }

  if (kind === 'nrpn') {
    const number = attrNumber(midi, 'midiMessageParameterNumber', attrNumber(midi, 'midiMessageCtrlrNumber', -1));
    if (number < 0 || number > 16383) return flag('the NRPN parameter number is missing or out of range');
    const resolution = max > 127 ? 14 : 7;
    const id = `nrpn${number}x${resolution}`;
    parameter.messageRecipe = id;
    return {
      ok: true,
      parameter,
      recipe: {
        id,
        kind: 'nrpn',
        channel: '$channel',
        parameterMsb: (number >> 7) & 0x7f,
        parameterLsb: number & 0x7f,
        valueResolution: resolution,
        value: '$encodedValue',
        nullAfterSend: false,
      },
    };
  }

  if (kind === 'sysex') {
    const template = readSysexTemplate(attr(midi, 'midiMessageSysExFormula', ''));
    if (!template.ok) return flag(template.reason);
    // One recipe per distinct template, keyed by the bytes: two modulators writing the same message
    // shape share it, which is what the shipped profiles do and what keeps the list readable.
    const bytes = template.bytes.map((b) => (typeof b === 'number'
      ? b.toString(16).toUpperCase().padStart(2, '0')
      : '$encodedValue'));
    const id = `sysex.${bytes.join('').toLowerCase().replace(/\$encodedvalue/g, 'v')}`;
    parameter.messageRecipe = id;
    return { ok: true, parameter, recipe: { id, kind: 'sysex', template: bytes } };
  }

  // programChange / note / aftertouch / bend are real messages and not parameter sends in the DPD's
  // sense. Flagged rather than dropped, because a panel full of them is a finding about the corpus.
  return flag(`message type "${kind}" is not a parameter send`);
}

/**
 * A whole panel -> a `.ceditor-device` profile, plus a coverage report.
 *
 * The profile is marked `status: 'imported'` and `trust: 'local'`, deliberately. Nothing here has
 * been near the instrument it claims to describe: it is a transcription of somebody else's
 * transcription, and it should not sit in a list looking like a verified profile.
 */
export function harvestProfile(read, { id = '', group = 'Imported' } = {}) {
  if (!read?.ok) return { ok: false, error: read?.error ?? 'The panel could not be read.' };

  const modulators = [];
  const collect = (node) => {
    for (const child of node.children ?? []) {
      if (child.name === 'modulator') modulators.push(child);
      collect(child);
    }
  };
  collect(read.root);

  const parameters = [];
  const flagged = [];
  const seen = new Set();
  // Keyed by recipe id so two modulators on the same CC or the same SysEx shape share one entry —
  // which is what the shipped profiles do, and what keeps a 300-parameter harvest readable.
  const recipes = new Map();

  for (const node of modulators) {
    const result = harvestModulator(node, { group });
    if (!result.ok) { flagged.push(result.flag); continue; }
    if (result.recipe) recipes.set(result.recipe.id, result.recipe);
    // Ctrlr does not require unique modulator names; the DPD requires unique parameter ids. A
    // suffix rather than a drop, because the second "Cutoff" is a real parameter of something.
    let unique = result.parameter.id;
    let n = 2;
    while (seen.has(unique)) { unique = `${result.parameter.id}.${n}`; n += 1; }
    seen.add(unique);
    parameters.push({ ...result.parameter, id: unique });
  }

  const panelName = read.panel.name || 'Imported panel';
  const profileId = id || `ctrlr.${slug(read.panel.instrument || panelName)}`;

  return {
    ok: true,
    profile: {
      schemaVersion: 1,
      profileVersion: '0.1.0',
      minCEditorVersion: '0.2.0',
      id: profileId,
      name: `${panelName} (imported)`,
      manufacturer: read.panel.manufacturer || '',
      family: read.panel.instrument || '',
      // Not 'verified', and not silently 'stable'. This is a transcription of somebody else's
      // transcription and has never been near the instrument.
      status: 'imported',
      trust: 'local',
      ctrlrSource: { panelName, author: read.panel.author, version: read.panel.version },
      variables: { deviceId: 16, channel: 0 },
      timing: { minDelayBetweenMessagesMs: 10 },
      parameters,
      messageRecipes: [...recipes.values()],
    },
    report: {
      modulators: modulators.length,
      converted: parameters.length,
      flagged,
      // The number the plan's fourth open question actually wants: how much of a real corpus needs
      // a human. Reported per panel so a corpus run can total it.
      coverage: modulators.length ? parameters.length / modulators.length : 0,
    },
  };
}
