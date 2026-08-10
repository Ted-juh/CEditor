// profilesLoad.test.js — every profile we ship must actually load.
//
// Found by testing, and it cost an afternoon: the 793-parameter GAIA profile simply was not in the
// device dropdown. Eight of the nine shipped profiles were; the missing one was the only one that
// mattered, and the one everything else in this branch is built around.
//
// Nine of its ten device requests carried `messageRecipe: 'rq1'` with an address and a size instead
// of a `template`. A device request is NOT a message recipe — DeviceProfileEngine::compileDeviceRequest
// walks a flat token list of literal bytes and one-byte `$variable`s, with no $address, no $size and
// no $checksum — so validate() raised an ERROR, loadFromJson refused the whole file, and
// loadInternalTestProfiles threw the message away:
//
//     juce::String error;
//     loadProfileFile (file, error);        // <- error never read
//
// A profile that fails to load is indistinguishable from a profile that was never written. Nothing
// in the app says so, and nothing in the test suite did either, because every other test loads a
// profile by reading the JSON directly rather than by asking whether the engine would accept it.
//
// This is that missing question, asked of every profile in the shipped directory. The rules below
// are transcribed from DeviceProfileEngine::validate()'s error-level cases — the ones that make
// loadFromJson return false. Warnings are deliberately not checked: they do not stop a load.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { readText } from './support/readText.mjs';

const DIRECTORY = fileURLToPath(new URL('../../profiles/test/', import.meta.url));
const FILES = readdirSync(DIRECTORY).filter((name) => name.endsWith('.ceditor-device.json')).sort();

/** The error-level rules from DeviceProfileEngine::validate(). Anything here refuses the load. */
function loadErrors(profile) {
  const errors = [];
  const recipes = new Set((profile.messageRecipes ?? []).map((r) => r?.id));
  const dumps = new Set((profile.dumpDefinitions ?? []).map((d) => d?.id));
  const requests = new Set((profile.requests ?? []).map((r) => r?.id));

  if (profile.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!profile.id) errors.push('profile id is required');
  if (!(profile.parameters ?? []).length) errors.push('at least one parameter is required');
  if (!(profile.messageRecipes ?? []).length) errors.push('at least one message recipe is required');

  for (const [index, parameter] of (profile.parameters ?? []).entries()) {
    const where = `parameters[${index}]${parameter?.id ? ` (${parameter.id})` : ''}`;
    if (!parameter || typeof parameter !== 'object') { errors.push(`${where} must be an object`); continue; }
    if (!parameter.id) errors.push(`${where}.id is required`);
    if (!parameter.type) errors.push(`${where}.type is required`);
    const writable = parameter.access?.canWrite !== false;
    if (writable && !parameter.messageRecipe) errors.push(`${where}.messageRecipe: writable parameter must reference one`);
    if (parameter.messageRecipe && !recipes.has(parameter.messageRecipe)) {
      errors.push(`${where}.messageRecipe: unknown recipe "${parameter.messageRecipe}"`);
    }
  }

  for (const [index, request] of (profile.requests ?? []).entries()) {
    const where = `requests[${index}]${request?.id ? ` (${request.id})` : ''}`;
    if (!request || typeof request !== 'object') { errors.push(`${where} must be an object`); continue; }
    if (!request.id) errors.push(`${where}.id is required`);
    // THE one that hid the GAIA. A request must inline its bytes; referencing a message recipe is
    // not a thing the engine can do, however reasonable it looks in the JSON.
    if (!Array.isArray(request.template) || !request.template.length) {
      errors.push(`${where}.template: a device request requires a message template`);
    }
    const dump = request.response?.dump ?? request.expectedDump;
    if (dump && !dumps.has(dump)) errors.push(`${where}.response.dump: unknown dump "${dump}"`);
    const next = request.response?.continueRequest ?? request.continueRequest;
    if (next && !requests.has(next)) errors.push(`${where}.response.continueRequest: unknown request "${next}"`);
  }

  for (const [index, step] of (profile.startup?.sync ?? []).entries()) {
    const id = typeof step === 'string' ? step : step?.request;
    if (id && !requests.has(id)) errors.push(`startup.sync[${index}].request: unknown request "${id}"`);
  }

  return errors;
}

test('the shipped directory is not empty', () => {
  // Guard: if the glob ever stops matching, every test below would pass by finding nothing.
  assert.ok(FILES.length >= 8, `expected the shipped profiles, found ${FILES.length}`);
});

for (const file of FILES) {
  test(`${file} loads`, () => {
    const profile = JSON.parse(readText(DIRECTORY + file));
    assert.deepEqual(loadErrors(profile), [],
      'the engine would refuse this profile, and say nothing — it would simply not be in the device list');
  });
}

test('the full GAIA is among them, with its requests intact', () => {
  // Named explicitly because this is the profile the rest of the branch depends on, and its absence
  // was invisible: the dropdown showed eight plausible entries and no gap where the ninth had been.
  const gaia = JSON.parse(readText(`${DIRECTORY}roland-gaia-sh01.ceditor-device.json`));
  assert.equal(gaia.parameters.length, 793);
  assert.equal(gaia.requests.length, 10, 'an identity request and one RQ1 per block');
  for (const request of gaia.requests) {
    assert.ok(Array.isArray(request.template) && request.template.length,
      `${request.id} has no template, so the whole profile would be refused`);
    assert.equal(request.template[0], 'F0');
    assert.equal(request.template.at(-1), 'F7');
  }
});

test('a profile identifies an instrument, not a firmware version', () => {
  // A real SH-01 answered F0 7E 10 06 02 41 41 02 00 00 00 03 00 01 F7 — manufacturer, family and
  // model matching this profile exactly, revision 00 03 00 01 where the profile said 00 03 00 00.
  // The engine compares revision byte-for-byte WHEN DECLARED, so that one byte made a genuine GAIA
  // report as "Wrong instrument". Manufacturer, family and model say which synth; revision says
  // which firmware, and refusing to talk to a synth for having been updated is wrong about identity.
  // The engine still reports the actual revision either way, so nothing is lost by not pinning it.
  const gaia = JSON.parse(readText(`${DIRECTORY}roland-gaia-sh01.ceditor-device.json`));
  assert.deepEqual(gaia.identity.manufacturerId, ['41']);
  assert.deepEqual(gaia.identity.familyCode, ['41', '02']);
  assert.deepEqual(gaia.identity.modelNumber, ['00', '00']);
  assert.equal(gaia.identity.revision, undefined,
    'pinning a revision makes every firmware update look like a different instrument');
});

test('an RQ1 template carries the checksum the synth will expect', () => {
  // The template is literal bytes, so its checksum is baked in rather than computed at send time.
  // Wrong here means the instrument ignores the request and the panel never fills in.
  const gaia = JSON.parse(readText(`${DIRECTORY}roland-gaia-sh01.ceditor-device.json`));
  const roland = (bytes) => (128 - (bytes.reduce((n, b) => n + b, 0) % 128)) % 128;

  for (const request of gaia.requests.filter((r) => r.id !== 'identityRequest')) {
    const bytes = request.template.map((token) => (token.startsWith('$') ? token : parseInt(token, 16)));
    // F0 41 $deviceId 00 00 41 11 <address×4> <size×4> <checksum> F7
    const body = bytes.slice(7, 15);
    assert.deepEqual(body.slice(0, 4), request.address.split(' ').map((b) => parseInt(b, 16)),
      `${request.id}: the template's address does not match the request's own`);
    assert.equal(bytes[15], roland(body), `${request.id}: wrong checksum`);
  }
});
