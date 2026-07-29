// jsonCases.js — the fixtures ce.storage.encode() is held to, in all four runtimes.
//
// One list, two readers: scriptStorage.test.js checks the WebView against it, and
// scriptPreludeAgreement.test.js replays the same values through the Lua, JavaScript and Python
// engine preludes and demands the same TEXT back — not the same structure, the same characters.
//
// That is a stricter bar than the rest of the agreement suite, and it has to be: encode()'s output
// is a string a script puts somewhere. A patch encoded in the editor and decoded by the exported
// plugin has to be the same bytes, and two structures compared by their encodings have to compare
// equal when they are equal. The cases below are the places where three languages would otherwise
// each spell one value their own way:
//
//   · key order            — a Lua table has none to preserve, so all four sort
//   · integral floats      — `1.0` is "1" in JavaScript, "1.0" in Python and in Lua
//   · small magnitudes     — 1e-5 is "0.00001" in JavaScript, "1e-05" in Python and in C's %g
//   · exponent padding     — "1e-7" in JavaScript, "1e-07" in the other two
//   · shortest round-trip  — %.14g truncates 1/3 where repr() and JavaScript do not
//   · non-ASCII            — Python escapes it by default; JavaScript does not
//   · control characters   — escaped to \u00xx, lower case, in all four
//   · empty containers     — and the one case Lua genuinely cannot match; see EMPTY_OBJECT_NOTE

/** Cases a JavaScript value can express, so the WebView test and all three preludes share them. */
export const JSON_CASES = [
  { name: 'a flat object, keys sorted', value: { b: 2, a: 1, c: 3 }, json: '{"a":1,"b":2,"c":3}' },
  {
    name: 'nested, sorted at every depth',
    value: { z: { n: 1, m: [3, 1, 2] }, a: 'x' },
    json: '{"a":"x","z":{"m":[3,1,2],"n":1}}',
  },
  { name: 'an array of scalars', value: [1, 'two', true, false], json: '[1,"two",true,false]' },
  { name: 'the empty array', value: [], json: '[]' },
  { name: 'a string needing the structural escapes', value: 'a"b\\c', json: '"a\\"b\\\\c"' },
  { name: 'a string with the named escapes', value: 'a\nb\tc\rd', json: '"a\\nb\\tc\\rd"' },
  { name: 'a control character with no name', value: 'a\u0001b', json: '"a\\u0001b"' },
  { name: 'non-ASCII passes through as UTF-8', value: 'héllo ☃', json: '"héllo ☃"' },
  { name: 'zero', value: 0, json: '0' },
  { name: 'a negative integer', value: -42, json: '-42' },
  { name: 'a plain decimal', value: 1.5, json: '1.5' },
  { name: 'a decimal that needs every digit', value: 0.1, json: '0.1' },
  { name: 'shortest round-trip, not a fixed precision', value: 1 / 3, json: '0.3333333333333333' },
  { name: 'fixed notation down to 1e-6, as JavaScript does', value: 0.00001, json: '0.00001' },
  { name: 'and exponential below it, unpadded', value: 1e-7, json: '1e-7' },
  { name: 'exponential above 1e21', value: 1e21, json: '1e+21' },
  { name: 'a large integral value still prints as digits', value: 1e20, json: '100000000000000000000' },
  { name: 'a deep mixture', value: { a: [{ b: [1, { c: 'd' }] }], e: true }, json: '{"a":[{"b":[1,{"c":"d"}]}],"e":true}' },
  {
    name: 'a patch, which is what this is for',
    value: { name: 'Lead', cutoff: 0.75, notes: [60, 64, 67] },
    json: '{"cutoff":0.75,"name":"Lead","notes":[60,64,67]}',
  },
];

/** …and the cases a JavaScript value CANNOT express, written once per language.
 *
 *  `1.0` is a float in Lua and Python and an integer in JavaScript, which is the single most likely
 *  place for one structure to encode two ways — a knob at exactly 1 saved by the editor and read by
 *  the plugin. NaN and infinity are the other: `null` in JavaScript, invalid JSON in Python, and
 *  whatever the author writes in Lua. Each entry is a source EXPRESSION in that language.
 */
export const NATIVE_ENCODE_CASES = [
  {
    name: 'an integral float is an integer, however the language stores it',
    javascript: '[1.0, 2.0, -3.0]', lua: '{1.0, 2.0, -3.0}', python: '[1.0, 2.0, -3.0]',
    json: '[1,2,-3]',
  },
  {
    name: 'a float that is exactly zero, including negative zero',
    javascript: '[0.0, -0.0]', lua: '{0.0, -0.0}', python: '[0.0, -0.0]',
    json: '[0,0]',
  },
  {
    name: 'NaN and infinity are null, as JSON.stringify spells them',
    javascript: '[NaN, Infinity, -Infinity]', lua: '{0/0, 1/0, -1/0}',
    python: '[float("nan"), float("inf"), float("-inf")]',
    json: '[null,null,null]',
  },
  {
    name: 'a member with no JSON form is dropped, an element is null',
    javascript: '[{ a: 1, f: function () {} }, [1, function () {}]]',
    lua: '{{ a = 1, f = function() end }, {1, function() end}}',
    python: '[{ "a": 1, "f": (lambda: 1) }, [1, (lambda: 1)]]',
    json: '[{"a":1},[1,null]]',
  },
];

/** The one shape Lua cannot join in on.
 *
 *  An empty Lua table is an empty array and an empty object at once — there is no way to tell them
 *  apart — and the whole codebase already reads it as the empty list. So `{}` encodes as "{}" in
 *  the WebView, the JavaScript engine and Python, and as "[]" in Lua. Said out loud here rather
 *  than left for somebody to discover.
 */
export const EMPTY_OBJECT_NOTE = 'an empty table encodes as [] in Lua and {} in the other three';

/** Text the four decoders must all refuse: telling a malformed config from an empty one is the
 *  whole reason decode returns nothing rather than an empty table. */
export const JSON_REJECTS = ['{oops', '', '[1,', '"unterminated', 'nul', '{"a":1,}', '01', '1.', '[1,]'];

/** …and text they must all read the same way, including what a JSON null does. */
export const JSON_DECODE_CASES = [
  { text: '{"a":1,"b":2}', json: '{"a":1,"b":2}' },
  { text: '  [ 1 , 2 ] ', json: '[1,2]' },
  { text: '{"a":1,"b":null}', json: '{"a":1}' },
  { text: '[1,null,2]', json: '[1,2]' },
  { text: '{"a":{"b":null,"c":[null,1]}}', json: '{"a":{"c":[1]}}' },
  { text: '"a\\u0041b"', json: '"aAb"' },
  { text: '"\\ud83d\\ude00"', json: '"😀"' },
  { text: '"sl\\/ash"', json: '"sl/ash"' },
  { text: '[1.5,-2.5e3]', json: '[1.5,-2500]' },
  { text: '{"deep":{"er":{"est":[true,false]}}}', json: '{"deep":{"er":{"est":[true,false]}}}' },
];
