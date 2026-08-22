// pluginProcessorGuards.test.js — every configuration of PluginProcessor.h compiles.
//
// WHY A JAVASCRIPT TEST READS A C++ HEADER. PluginProcessor.h needs WebView2 and a native juceaide,
// so it is built on Windows and nowhere else. Nothing in the local gates touches it: `ctest` here
// covers thirteen executables and not one of them includes it, and PanelParametersTests.cpp exists
// precisely because PanelParameters.h was reachable only through this header and a typo in it would
// have surfaced only in a Windows plugin build.
//
// THE BUG THIS EXISTS FOR, which found its way to a user's machine.
//
//   CE\src\Player\PluginProcessor.h(510): error C3861: 'scriptSendRawMidi': identifier not found
//
// The automation path — a raw-MIDI-bound control moved by the host with the window closed — sent its
// bytes through `scriptSendRawMidi`, deliberately, so that a script's interceptMidiOut would see
// automation sends as well as script ones. But that function was defined under
// `#if CEDITOR_SCRIPTING`, and the call sits under `#if CEDITOR_VALUE_LAYER`. The two flags are
// INDEPENDENT: the export pipeline passes `-DCEDITOR_SCRIPTING=ON`, and the installer build does
// not. So the header compiled in every configuration anybody had run, and failed in the one nobody
// had — with the call present and the callee preprocessed away.
//
// No amount of testing the LOGIC would have caught it. What was wrong was which #if a function sat
// in, and that is a property of the text.
//
// WHAT IS CHECKED. The header is preprocessed for all four combinations of the two flags, and in
// each one every member function that is CALLED must also be DEFINED. Nothing about behaviour —
// this is the compiler's own first question, asked where the compiler cannot be run.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readText } from './support/readText.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const HEADER = path.join(REPO, 'CE/src/Player/PluginProcessor.h');

/** The two flags that gate this header, and every combination of them. */
const FLAGS = ['CEDITOR_VALUE_LAYER', 'CEDITOR_SCRIPTING'];
const CONFIGURATIONS = [
  { CEDITOR_VALUE_LAYER: 0, CEDITOR_SCRIPTING: 0 },
  { CEDITOR_VALUE_LAYER: 0, CEDITOR_SCRIPTING: 1 },
  { CEDITOR_VALUE_LAYER: 1, CEDITOR_SCRIPTING: 0 },   // the one that failed
  { CEDITOR_VALUE_LAYER: 1, CEDITOR_SCRIPTING: 1 },
];

/**
 * The lines that survive the preprocessor for one set of defines.
 *
 * A condition mentioning anything OTHER than the two flags is left in — `null` on the stack means
 * "unknown", and unknown branches are kept rather than guessed at. Keeping too much can only
 * produce a false alarm, which someone reads; dropping too much produces silence, which nobody does.
 */
function preprocess(source, defines) {
  const truth = (expression) => {
    let e = expression.trim();
    for (const [name, value] of Object.entries(defines)) {
      e = e.replace(new RegExp(`\\b${name}\\b`, 'g'), String(value));
    }
    // Anything left that is not one of our flags makes the condition unknown.
    if (/[A-Za-z_]/.test(e.replace(/\b(defined|and|or|not)\b/g, ''))) return null;
    try {
      // eslint-disable-next-line no-new-func
      return Boolean(new Function(`return (${e});`)());
    } catch {
      return null;
    }
  };

  const stack = [];
  const kept = [];
  for (const [index, line] of source.split('\n').entries()) {
    const s = line.trim();
    const ifMatch = /^#\s*if\s+(.*)$/.exec(s);
    if (ifMatch) { stack.push(truth(ifMatch[1])); continue; }
    if (/^#\s*ifn?def\b/.test(s)) { stack.push(null); continue; }
    if (/^#\s*elif\b/.test(s)) { if (stack.length) stack[stack.length - 1] = null; continue; }
    if (/^#\s*else\b/.test(s)) {
      if (stack.length) {
        const top = stack[stack.length - 1];
        stack[stack.length - 1] = top === null ? null : !top;
      }
      continue;
    }
    if (/^#\s*endif\b/.test(s)) { stack.pop(); continue; }
    if (stack.every((x) => x !== false)) kept.push({ line: index + 1, text: line });
  }
  return kept;
}

const SOURCE = readText(HEADER);

/**
 * Words that are followed by a parenthesis and are not calls.
 *
 * Without this the checker reports `if()` as an undefined function several hundred times, which is
 * the classic way a structural check becomes noise and then gets deleted.
 */
const KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'return', 'catch', 'sizeof', 'do', 'else',
  'static_cast', 'dynamic_cast', 'const_cast', 'reinterpret_cast', 'decltype',
  'noexcept', 'alignof', 'throw', 'new', 'delete', 'operator', 'and', 'or', 'not',
]);

/** Member functions defined in the header, by name. `void foo (…)`, `static bool bar (…)`. */
const definitionsIn = (lines) => new Set(lines
  .map(({ text }) => /^\s*(?:static\s+|inline\s+|virtual\s+)*(?:[\w:]+(?:<[^>]*>)?\s*[&*]?\s+)([A-Za-z_]\w*)\s*\(/.exec(text))
  .filter(Boolean)
  .map((m) => m[1])
  .filter((name) => !KEYWORDS.has(name)));

/** Calls to a bare identifier — `foo (…)` — restricted to names the header defines somewhere. */
function callsIn(lines, known) {
  const calls = [];
  for (const { line, text } of lines) {
    const code = text.replace(/\/\/.*$/, '').replace(/"(?:[^"\\]|\\.)*"/g, '""');
    for (const match of code.matchAll(/(?<![.\->:\w])([A-Za-z_]\w*)\s*\(/g)) {
      const name = match[1];
      if (KEYWORDS.has(name) || !known.has(name)) continue;
      // A definition is not a call.
      if (new RegExp(`\\b${name}\\s*\\(`).test(code) && /^\s*(?:static\s+|inline\s+|virtual\s+)*[\w:]+(?:<[^>]*>)?\s*[&*]?\s+\w+\s*\(/.test(code)) continue;
      calls.push({ name, line });
    }
  }
  return calls;
}

const ALL_DEFINITIONS = definitionsIn(SOURCE.split('\n').map((text, i) => ({ line: i + 1, text })));

test('the header defines the raw-MIDI funnel in every configuration that calls it', () => {
  // The narrowest statement of the bug, so a regression names itself rather than arriving as a
  // wall of C3861s from a user's build log.
  for (const defines of CONFIGURATIONS) {
    const lines = preprocess(SOURCE, defines);
    const text = lines.map((l) => l.text).join('\n');
    const called = /(?<![.\->:\w])sendRawMidiBytes\s*\(/.test(text.replace(/^\s*[\w:]+\s+sendRawMidiBytes\s*\(/gm, ''));
    const defined = /^\s*void\s+sendRawMidiBytes\s*\(/m.test(text);
    const where = FLAGS.map((f) => `${f}=${defines[f]}`).join(' ');
    if (called) assert.ok(defined, `${where}: sendRawMidiBytes is called and never defined`);
  }
});

test('every member function called is defined, in all four flag combinations', () => {
  // The general form. What was wrong was not a behaviour but which #if a function sat in, and this
  // is the compiler's own first question asked where the compiler cannot be run.
  const failures = [];
  for (const defines of CONFIGURATIONS) {
    const lines = preprocess(SOURCE, defines);
    const defined = definitionsIn(lines);
    const where = FLAGS.map((f) => `${f}=${defines[f]}`).join(' ');
    for (const call of callsIn(lines, ALL_DEFINITIONS)) {
      if (!defined.has(call.name)) failures.push(`${where}: ${call.name}() at line ${call.line} is called but not defined`);
    }
  }
  assert.deepEqual([...new Set(failures)], []);
});

test('the guard rejects the header as it actually shipped', () => {
  // A GUARD ON THE GUARD. A structural check that cannot fail is worse than no check, because it
  // reads as coverage. This is the real defect, reduced: the call under one flag, the definition
  // under the other. If the checker above stops catching it, this fails and says so.
  const broken = [
    '#if CEDITOR_VALUE_LAYER',
    '    void sendParamRawMidi (int v)',
    '    {',
    '        scriptSendRawMidi ("automation", v);',
    '    }',
    '#endif',
    '',
    '#if CEDITOR_SCRIPTING',
    '    void scriptSendRawMidi (const char* id, int v) { queue (id, v); }',
    '#endif',
  ].join('\n');

  const known = definitionsIn(broken.split('\n').map((text, i) => ({ line: i + 1, text })));
  assert.ok(known.has('scriptSendRawMidi'), 'guard: the fixture should define it somewhere');

  const withScripting = preprocess(broken, { CEDITOR_VALUE_LAYER: 1, CEDITOR_SCRIPTING: 1 });
  const withoutScripting = preprocess(broken, { CEDITOR_VALUE_LAYER: 1, CEDITOR_SCRIPTING: 0 });

  assert.ok(definitionsIn(withScripting).has('scriptSendRawMidi'),
    'with scripting on the fixture is fine — which is why this shipped');
  assert.ok(!definitionsIn(withoutScripting).has('scriptSendRawMidi'),
    'with scripting off the definition must vanish');
  assert.ok(callsIn(withoutScripting, known).some((c) => c.name === 'scriptSendRawMidi'),
    'and the call must remain — that pair is the bug');
});

test('the preprocessor keeps a branch it cannot evaluate', () => {
  // Unknown conditions are KEPT, not guessed. Keeping too much can only raise a false alarm, which
  // somebody reads; dropping too much produces silence, which nobody does.
  const source = [
    '#if SOME_OTHER_FLAG',
    '    void onlyThere() {}',
    '#endif',
    '#if CEDITOR_SCRIPTING',
    '    void scriptOnly() {}',
    '#endif',
  ].join('\n');
  const kept = definitionsIn(preprocess(source, { CEDITOR_VALUE_LAYER: 1, CEDITOR_SCRIPTING: 0 }));
  assert.ok(kept.has('onlyThere'), 'an unknown flag must not be treated as off');
  assert.ok(!kept.has('scriptOnly'), 'a known flag must be');
});
