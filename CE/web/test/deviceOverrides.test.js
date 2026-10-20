// deviceOverrides.test.js — a device role and a dump's kind: what each runtime does with one it has
// no profile or no dump for, and the Values rows that offer the ones there are.
//
// ce.device.setVariable and setTiming, given a role nothing was mapped to, wrote the main synth's
// profile onto a new mapping for that role and answered true in the editor; the plug-in answered
// false without a word, and stored the value it was given, text and all. The profile's own readers
// answered for such a role with the main synth's document window-open and with nothing
// window-closed. requestDump took a request's id and refused a dump's, though its callback was
// matched against the dump's id, so a callback for a profile dump could only time out; and a kind
// the profile has neither of was refused by the host where no script could see it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { get } from 'svelte/store';

import { scriptApiForTesting, onDumpParsedForTesting, resetScriptStateForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { panels, activePanelId } from '../src/CE_Application/stores/panels.js';
import { deviceRoleMappings } from '../src/CE_Application/stores/deviceProfiles.js';
import { profileSources } from '../src/CE_Application/stores/deviceProfileStores.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { readStatement } from '../src/CE_Application/scripting/scriptValues.js';
import { meaningLine } from '../src/CE_Application/editor/valueRows.js';
import { deviceValueContext, declaredDeviceDumps } from '../src/CE_Application/editor/valuesContext.js';
import {
  deviceOverrideValue, deviceSetNoNameWords, deviceSetNoProfileWords, dumpKindUnknownWords,
} from '../src/CE_Application/scripting/deviceWords.js';

const here = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(here, '..', '..', 'profiles', 'test');
const SHIPPED = readdirSync(PROFILE_DIR).filter((f) => f.endsWith('.json'))
  .map((f) => ({ file: f, profile: JSON.parse(readFileSync(join(PROFILE_DIR, f), 'utf8')) }));
const GAIA = SHIPPED.find((p) => p.file === 'roland-gaia-sh01.ceditor-device.json').profile;
const GAIA_DUMPS = GAIA.dumpDefinitions.map((d) => d.id);

/** A panel whose main synth is the GAIA, with its document, and the trace of what `fn` said. */
function withGaia(fn) {
  resetScriptStateForTesting();
  panels.set([{ id: 'p', name: 'P', controls: [], scripting: { modules: ['ce.core', 'ce.device'] } }]);
  activePanelId.set('p');
  profileSources.set({ [GAIA.id]: { profileId: GAIA.id, source: JSON.stringify(GAIA) } });
  deviceRoleMappings.set({ mainSynth: { role: 'mainSynth', profileId: GAIA.id, variables: {}, timingOverrides: {} } });
  clearScriptTrace();
  try {
    const api = scriptApiForTesting('', 'device-script');
    const result = fn(api.ce.device, api);
    return { result, lines: get(scriptTrace).filter((t) => t.kind === 'error' || t.kind === 'warn').map((t) => t.message) };
  } finally {
    panels.set([]); profileSources.set({}); deviceRoleMappings.set({});
  }
}

test.after(() => resetScriptStateForTesting());

test('an override reads its value as the plug-in reads it, and says one not used as given', () => {
  assert.deepEqual(deviceOverrideValue('setVariable', 'deviceId', 'seventeen', 0, 127),
    { n: undefined, refused: 'ce.device.setVariable("deviceId", "seventeen"): "seventeen" is not a number, so nothing was changed.', said: null });
  assert.deepEqual(deviceOverrideValue('setVariable', 'deviceId', 999, 0, 127),
    { n: 127, refused: null, said: 'ce.device.setVariable("deviceId", 999): 999 is outside 0 to 127, so 127 was used.' });
  assert.deepEqual(deviceOverrideValue('setTiming', 'gap', '17.5', 0, 60000),
    { n: 18, refused: null, said: 'ce.device.setTiming("gap", "17.5"): "17.5" is not a whole number, so 18 was used.' });
  assert.equal(deviceOverrideValue('setVariable', 'deviceId', true, 0, 127).refused !== null, true, 'true is no number');
  assert.deepEqual(deviceOverrideValue('setVariable', 'deviceId', 17, 0, 127), { n: 17, refused: null, said: null });
});

test('the plug-in says the overrides and the dump kinds in the same words', () => {
  const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
  const plugin = read('../../src/Player/PluginProcessor.h');
  const host = read('../../src/Scripting/BridgeScriptHost.h');
  const cpp = (s) => s.replace(/"/g, '\\"');
  // Each sentence, cut where the C++ puts its values in.
  const [nameLead, nameTail] = deviceSetNoNameWords('\u0001').split('\u0001');
  assert.ok(plugin.includes(`"[script] ${cpp(nameLead)}" + label + "${cpp(nameTail)}"`), 'a name is required');
  const [roleLead, roleMid, roleTail] = deviceSetNoProfileWords('\u0001', '\u0002').split(/[\u0001\u0002]/);
  assert.ok(plugin.includes(`"[script] ${cpp(roleLead)}" + label + "${cpp(roleMid)}" + role`), 'no profile is chosen for the role');
  assert.ok(plugin.includes(`+ "${cpp(roleTail)}");`), '…so nothing was changed');
  for (const fragment of [' is not a number, so nothing was changed.', ' is outside ', ' is not a whole number, so ', ' was used.']) {
    assert.ok(host.includes(`"${fragment}"`), `the value's words: ${fragment}`);
  }
  assert.ok(plugin.includes('" This is said only the first time."'), 'once per name, as the editor says it');
  const [dumpLead] = dumpKindUnknownWords('\u0001', 'k', 'mainSynth', []).split('\u0001');
  assert.equal(dumpLead, '');
  for (const fragment of [' profile has no dump called \\"', '\\", so nothing was sent.', ' It defines none.', ' One of: ']) {
    assert.ok(host.includes(fragment), `the dump kind's words: ${fragment}`);
  }
});

test('an override for a role no profile is chosen for is refused, and maps nothing', () => {
  const { result, lines } = withGaia((d) => d.setVariable('deviceId', 17, 'drumz'));
  assert.equal(result, false);
  assert.deepEqual(lines, [deviceSetNoProfileWords('setVariable', 'drumz')]);
  assert.equal(lines[0], 'ce.device.setVariable: no device profile is chosen for drumz, so nothing was changed.');
  // The mapping it used to make, on the main synth's profile, is not there.
  withGaia((d) => {
    d.setTiming('minDelayBetweenMessagesMs', 40, 'drumz');
    assert.deepEqual(Object.keys(get(deviceRoleMappings)), ['mainSynth']);
  });
});

test('a value used as the nearest whole one in range is said once per name', () => {
  const { lines } = withGaia((d) => {
    d.setVariable('deviceId', 999);
    d.setVariable('deviceId', 300);
    d.setVariable('channel', 0.4);
    assert.equal(d.variables().deviceId, 127);
  });
  assert.deepEqual(lines, [
    'ce.device.setVariable("deviceId", 999): 999 is outside 0 to 127, so 127 was used. This is said only the first time.',
    'ce.device.setVariable("channel", 0.4): 0.4 is not a whole number, so 0 was used. This is said only the first time.',
  ]);
});

test('the profile\'s readers answer for a role from its own mapping, as the plug-in does', () => {
  withGaia((d) => {
    assert.equal(d.profile('drumz'), null);
    assert.equal(d.variables('drumz'), null);
    assert.equal(d.timing('drumz'), null);
    assert.equal(d.coverage(undefined, 'drumz'), null);
    assert.deepEqual([d.recipes('drumz'), d.requests('drumz')], [[], []]);
    // …and the main synth's are its own.
    assert.equal(d.profile().id, GAIA.id);
    assert.deepEqual(d.requests(), GAIA.requests.map((r) => r.id));
  });
});

test('requestDump, sendDump and buildDump refuse a kind the profile has no dump by', () => {
  const said = (verb, kind, outcome) => dumpKindUnknownWords(verb, kind, 'mainSynth', GAIA_DUMPS, outcome);
  const asked = withGaia((d) => d.requestDump('patch'));
  assert.equal(asked.result, false);
  assert.deepEqual(asked.lines, [said('requestDump', 'patch')]);
  assert.match(asked.lines[0], /^requestDump\("patch"\): the mainSynth profile has no dump called "patch", so nothing was sent\. One of: system, common, /);
  assert.deepEqual(withGaia((d) => d.sendDump('requestSystem')).lines, [said('sendDump', 'requestSystem')], 'sendDump takes a dump, not a request');
  const built = withGaia((d) => d.buildDump('patch'));
  assert.deepEqual([built.result, built.lines], [null, [said('buildDump', 'patch', 'nothing was built')]]);
  // A dump's id, and for requestDump a request's, go on as they did: to a host this test has not.
  for (const call of [(d) => d.requestDump('system'), (d) => d.requestDump('requestSystem'), (d) => d.sendDump('system')]) {
    assert.deepEqual(withGaia(call).lines, []);
  }
  // A dump the script declared is its own.
  assert.deepEqual(withGaia((d) => {
    d.defineParameter('cut', { cc: 74, min: 0, max: 127 });
    d.defineDump('mine', { request: 'f0 7d 00 f7', match: { prefix: ['f0', '7d', '01'], suffix: ['f7'] }, offset: 3, size: 1,
      fields: [{ parameter: 'cut', offset: 0 }] });
    return d.requestDump('mine');
  }).lines.filter((l) => /no dump called/.test(l)), []);
  // No document, nothing to say: the host is the one to know.
  const blind = withGaia((d) => { profileSources.set({}); return d.requestDump('patch'); });
  assert.deepEqual(blind.lines, []);
});

test('a callback for a request waits for the dump it answers with', () => {
  const heard = [];
  withGaia((d) => {
    d.requestDump('requestSystem', (values, info) => heard.push([info.ok, info.kind]));
    d.requestDump('common', (values, info) => heard.push([info.ok, info.kind]));
    onDumpParsedForTesting({ deviceRole: 'mainSynth', dumpId: 'system', values: {} });
    onDumpParsedForTesting({ deviceRole: 'mainSynth', dumpId: 'common', values: {} });
  });
  assert.deepEqual(heard, [[true, 'system'], [true, 'common']]);
});

/* ------------------------------------------------------------------------- the Values rows */

const devices = (extra = {}) => deviceValueContext({
  mappings: { mainSynth: { profileId: GAIA.id }, drums: { profileId: 'tr8' } },
  profiles: [{ id: GAIA.id, name: 'Roland GAIA SH-01' }, { id: 'tr8', name: 'TR-8' }],
  sources: { [GAIA.id]: { source: JSON.stringify(GAIA) } },
  ...extra,
});
const bound = (role) => ({ _children: { Core: { name: 'Pad', id: 'c1' }, DeviceBindings: { bindings: [{ deviceRole: role }] } } });

function rowOf(src, name, ctx) {
  const st = readStatement(src, 'lua', src.indexOf('(') + 1, ctx);
  const find = (args) => {
    for (const a of args ?? []) {
      if (a.name === name) return a;
      const inner = find(a.options);
      if (inner) return inner;
    }
    return null;
  };
  return find(st.calls[0].args);
}

test('a role\'s row offers the roles there are, names its profile, and says what the call does without one', () => {
  const ctx = { devices: devices(), panel: { controls: [bound('keys')] } };
  const role = (src) => rowOf(src, 'role', ctx);
  assert.deepEqual([role('ce.device.variables("drums")').editable, role('ce.device.variables("drums")').meaning.choices], ['choice', ['mainSynth', 'drums', 'keys']]);
  assert.equal(meaningLine(role('ce.device.variables("drums")')), 'TR-8');
  // The panel's controls know of keys, so it is a device without a profile, not a slip.
  const keys = role('ce.device.variables("keys")');
  assert.deepEqual([meaningLine(keys), keys.problem], ['no profile is chosen for keys, so this gives nothing', null]);
  assert.equal(meaningLine(role('ce.device.parameter("cutoff", "keys")')), 'no profile is chosen for keys, so this reads mainSynth\'s, Roland GAIA SH-01');
  assert.equal(meaningLine(role('ce.device.connected("keys")')), 'no profile is chosen for keys, so this gives false');
  // A role nothing knows of.
  const slip = role('ce.device.variables("drumz")');
  assert.deepEqual(slip.problem, { severity: 'warning', message: '"drumz" is not a device of this panel: no profile is chosen for it, and no control is bound to it. Did you mean "drums"?' });
  // The overrides refuse it, in the runtime's words.
  assert.deepEqual(role('ce.device.setVariable("deviceId", 17, "keys")').problem,
    { severity: 'error', message: deviceSetNoProfileWords('setVariable', 'keys') });
  // An option names a role too.
  assert.equal(meaningLine(rowOf('ce.device.parameters({ role = "drums" })', 'role', ctx)), 'TR-8');
});

test('a dump\'s row offers the profile\'s dumps and the scripts\' own, and says the runtime\'s refusal', () => {
  const declaredDumps = declaredDeviceDumps([{ language: 'lua', source: 'ce.device.defineDump("mine", { request = { 0xF0 } })' }]);
  assert.deepEqual(declaredDumps, [{ id: 'mine', role: 'mainSynth' }]);
  const ctx = { devices: devices({ declaredDumps }) };
  const kind = (src) => rowOf(src, 'kind', ctx);
  const row = kind('ce.device.requestDump("system")');
  assert.equal(row.editable, 'choice');
  assert.deepEqual(row.meaning.choices, [...GAIA_DUMPS, 'mine']);
  assert.equal(meaningLine(row), 'System');
  assert.equal(meaningLine(kind('ce.device.requestDump("requestSystem")')), 'the request for the "system" dump');
  assert.equal(meaningLine(kind('ce.device.sendDump("mine")')), "declared by this panel's scripts");
  // Refused as the runtime refuses it.
  for (const [src, verb, run] of [
    ['ce.device.requestDump("patch")', 'requestDump', (d) => d.requestDump('patch')],
    ['ce.device.sendDump("requestSystem")', 'sendDump', (d) => d.sendDump('requestSystem')],
    ['ce.device.buildDump("patch")', 'buildDump', (d) => d.buildDump('patch')],
  ]) {
    const refused = kind(src);
    assert.equal(refused.problem?.severity, 'error', src);
    assert.equal(refused.problem.message, withGaia(run).lines[0], `${verb}: the row says the console's line`);
  }
  // While the profile's document loads, nothing is claimed.
  assert.equal(rowOf('ce.device.requestDump("patch")', 'kind', { devices: devices({ sources: {} }) }).problem, null);
});
