// deviceWords.js — what the runtime says of a device parameter id the profile does not have, in one
// place, so the Values tab's rows (scriptValueKinds.js) say it in the runtime's words and the
// runtime (panelRuntime.js) is not loaded to say them.
//
// write's words are the plug-in's too, both of them: CE/src/Player/PluginProcessor.h says them from
// its deviceWrite, and test/deviceParameterTable.test.js holds the two to the same text.

import { realNumber } from './scriptColours.js';
import { shownValue as shown } from './shownValue.js';

/** ce.device.write of an id the profile's whole table does not have: refused, nothing sent. */
export function deviceWriteUnknownWords(id, role) {
  return `ce.device.write: "${id}" is not a parameter of the ${role} profile, so nothing was sent.`;
}

/** ce.device.write of an id the script did not declare, for a device no profile is chosen for:
 *  refused, nothing sent. The plug-in answered false without a word, and the editor sent it to the
 *  host, whose "No device profile mapped" went to the MIDI preview, and answered true. */
export function deviceWriteNoProfileWords(id, role) {
  return `ce.device.write: no device profile is chosen for ${role}, so "${id}" was not sent. `
    + 'A parameter declared with ce.device.defineParameter is sent without one.';
}

/** ce.device.bind of such an id: said, and bound anyway, since the parameter may still arrive. */
export function deviceBindUnknownWords(control, id) {
  return `bind("${control}", "${id}"): neither the profile nor this panel's declarations know "${id}" yet. `
    + 'The binding is made anyway — it works if the parameter arrives — but check the id if the control stays dead.';
}

// ce.device.setVariable and setTiming, which write this project's override of a profile's value.
// The editor's runtime (panelRuntime's deviceOverrideWrite) and the plug-in's
// (CE/src/Player/PluginProcessor.h, cb.deviceSet, with BridgeScriptHost.h's deviceOverrideValue)
// read the value alike and say the same words; test/deviceOverrides.test.js holds the two to them.
//
// The editor wrote an override for a role nothing is mapped to onto the main synth's profile, as a
// new mapping for that role, and answered true; the plug-in answered false without a word. Each
// used a value as the nearest whole number in range without saying so, and the plug-in stored
// what it was given, text and all.
export const DEVICE_OVERRIDES = {
  variables: { label: 'setVariable', min: 0, max: 127 },
  timingOverrides: { label: 'setTiming', min: 0, max: 60000 },
};

/** A name left out or empty: refused. */
export function deviceSetNoNameWords(label) {
  return `ce.device.${label}: a name is required, so nothing was changed.`;
}

/** setTiming of a name the profile has no timing for: refused, where it was stored and never read.
 *  The names in the profile's spelling, sorted, as every runtime lists them. */
export function deviceTimingUnknownWords(name, role, names) {
  return `ce.device.setTiming: the profile for ${role} has no timing called "${name}", so nothing was changed. `
    + (names.length ? `Its timings: ${[...names].sort().join(', ')}.` : 'It has none.');
}

/** parameter() or read() with no id: refused, where it answered nothing without a word. */
export function deviceNoIdWords(verb) {
  return `ce.device.${verb}: no parameter id was given, so there is no answer.`;
}

/** parameters() or ports() given something that is not a table of options. */
export function deviceNotOptionsWords(verb, shown) {
  return `ce.device.${verb}: ${shown} is not a table of options, so the answer is an empty list.`;
}

/** ports() with a direction that is not one: every port, said once. */
export function devicePortsDirectionWords(shown) {
  return `ce.device.ports: direction is ${shown}, which is not "in" or "out", so every port was listed.`;
}

/** A role no profile is chosen for: refused, as ce.device.write refuses it. */
export function deviceSetNoProfileWords(label, role) {
  return `ce.device.${label}: no device profile is chosen for ${role}, so nothing was changed.`;
}

/**
 * The value an override takes, as both runtimes read it: a number, or text that is one, as the
 * nearest whole number from `min` to `max`. `n` is what is written, `refused` the sentence for a
 * value that is no number, and `said` the one for a number not written as given.
 */
export function deviceOverrideValue(label, name, value, min, max) {
  const call = `ce.device.${label}("${name}", ${shown(value)})`;
  const read = realNumber(value);
  if (read === undefined) return { n: undefined, refused: `${call}: ${shown(value)} is not a number, so nothing was changed.`, said: null };
  const whole = Math.round(read);
  const n = Math.min(max, Math.max(min, whole));
  if (n !== whole) return { n, refused: null, said: `${call}: ${shown(value)} is outside ${min} to ${max}, so ${n} was used.` };
  if (whole !== read) return { n, refused: null, said: `${call}: ${shown(value)} is not a whole number, so ${n} was used.` };
  return { n, refused: null, said: null };
}

// requestDump, sendDump and buildDump take a dump the main synth's profile defines, by its id
// ("system"), which is the id its answer arrives under and the one requestDump's callback is matched
// against. requestDump takes a request's own id as well ("requestSystem"), as it always has. A kind
// the profile has neither of went to the host, which refused it where no script could see, and the
// console said the request had been made. Both runtimes refuse it now, in these words, while the
// profile's document is there to say so; a dump the script declared with defineDump is its own.

/** The dumps a profile document defines, and the requests it can send: { dumps, requests }. */
export function profileDumpKinds(profile) {
  const ids = (list) => (Array.isArray(list) ? list : []).map((x) => String(x?.id ?? '')).filter(Boolean);
  return { dumps: ids(profile?.dumpDefinitions), requests: ids(profile?.requests) };
}

/** A kind the profile has no dump (or, for requestDump, request) by: refused. */
export function dumpKindUnknownWords(verb, kind, role, dumps, outcome = 'nothing was sent') {
  return `${verb}("${kind}"): the ${role} profile has no dump called "${kind}", so ${outcome}.`
    + (dumps.length ? ` One of: ${dumps.join(', ')}.` : ' It defines none.');
}
