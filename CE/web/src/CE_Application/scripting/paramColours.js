// paramColours.js — the colour each parameter of an API command is shown in: in the code editor's
// signature hint, under the argument in the code, in the hint at the top of the Values sidebar and
// on the value in its row. One colour for a parameter everywhere, so the colour says which value is
// which parameter. docs/design/api-descriptions-handoff.md, "The Values sidebar and the hint".
//
// Three colours at most, blue, amber and green, and grey for the rest: more colours than that stop
// being told apart. Parameters that work together share one (getBits' start and count say where the
// field is, together). Colour is never the only clue: the names are in the hint and in the rows.
//
// A command not listed here gets the three colours in the order of its parameters, an options
// table excepted, which stays grey: its keys have rows of their own.

export const PARAM_COLOURS = Object.freeze(['blue', 'amber', 'green']);

const LETTER = { b: 'blue', a: 'amber', g: 'green', '-': null };

// One letter a parameter, in the order of the command's parameters: b blue, a amber, g green, - grey.
const GROUPS = Object.freeze({
  getBits: 'baa',
  setBits: 'baag',
  bytesRead: 'baa-',
  bytesWrite: 'baag-',
  bytesSlice: 'baa',
  bytesPut: 'bag',
  bytesFind: 'bg-',
  to7bit: 'ba-',
  from7bit: 'b-',
  sendCC: '-ab',
  sendNRPN: '-aab',
  sendRPN: '-aab',
  sendNote: '-ab-',
  sendNoteOff: '-ab',
  checksum: '-g-',
  scale: 'baagg',
  clamp: 'baa',
  wrap: 'baa',
  fold: 'baa',
  norm: 'baa',
  denorm: 'baa',
  interceptMidiIn: 'g',
  interceptMidiOut: 'g',
  panelBatch: 'g',
  animateStop: 'b',
  animateFinish: 'b',
});

const isOptions = (name) => /^\[?\s*,?\s*opts\]?$/.test(String(name ?? '').trim());

/**
 * The colour of each of `params` (names, in the command's order) for the command `memberId`:
 * 'blue', 'amber', 'green', or null for grey.
 */
export function paramColours(memberId, params) {
  const names = Array.isArray(params) ? params : [];
  const spec = memberId ? GROUPS[memberId] : undefined;
  if (spec) return names.map((_, i) => LETTER[spec[i]] ?? null);
  let next = 0;
  return names.map((name) => (isOptions(name) || next >= PARAM_COLOURS.length ? null : PARAM_COLOURS[next++]));
}

/** The colour of the parameter called `name` of `memberId`, given the command's parameter names. */
export function paramColour(memberId, params, name) {
  const names = Array.isArray(params) ? params : [];
  const i = names.indexOf(name);
  return i < 0 ? null : paramColours(memberId, names)[i];
}
