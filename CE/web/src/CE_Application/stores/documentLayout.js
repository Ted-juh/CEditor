// documentLayout.js — how a .cepanel is laid out as text: one line per control section.
//
// A document used to be JSON.stringify(doc, null, 2): one line per property, at any depth. That puts
// a Knob's Core section on eleven lines and a custom component's slider drawing on a few hundred,
// and the whitespace alone was most of a large file: the GAIA panel was 9.8 MB, of which 7.2 MB was
// newlines and indentation. Laid out as below it is 3.0 MB.
//
// So controls are written one section to a line:
//
//     "controls": [
//       {
//         "_type": "Control",
//         "_children": {
//           "Core": {"_type":"Core","id":"cutoff","name":"Cutoff", ...},
//           "Transform": {"_type":"Transform","x":40,"y":20, ...},
//           "Children": {
//             "_type": "Children",
//             "_children": {
//               "inner": {                      <- a nested control, laid out the same way
//                 ...
//
// A diff still lands where the change is: an edit to a control's position changes its Transform
// line and nothing else, and a control added or deleted is a block of its own. Two sections hold
// other things rather than properties, and are opened up a level so that stays true: Children, whose
// entries are controls, and Parts, whose entries are a custom component's drawings — a few KB each,
// a few dozen to a component, so one line for all of them would make every redrawn part a rewrite of
// the whole set.
//
// Everything outside `controls` and `drawings` keeps JSON.stringify's own layout, byte for byte. Readers are not
// affected at all: this is whitespace, and every reader — deserializePanel, the exporters, the
// plug-in's juce::JSON::parse — skips it.

const INDENT = '  ';

// A layout is what a value's own keys get: ONE_LINE, PRETTY (JSON.stringify(v, null, 2) at this depth),
// or a function from a key to the layout of the value under it.
const ONE_LINE = 'one-line';
const PRETTY = 'pretty';

// Sections whose entries are things in their own right; see the header.
const entriesPerLine = (entryLayout) => (key) => (key === '_children' ? () => entryLayout : ONE_LINE);
const CONTROL = (key) => (key === '_children' ? SECTIONS : ONE_LINE);
const SECTIONS = (section) => {
  if (section === 'Children') return entriesPerLine(CONTROL);
  if (section === 'Parts') return entriesPerLine(ONE_LINE);
  return ONE_LINE;
};
// The drawings a document writes once (documentDrawings.js) are Parts sections, laid out as one.
const DOCUMENT = (key) => {
  if (key === 'controls') return () => CONTROL;
  if (key === 'drawings') return () => SECTIONS('Parts');
  return PRETTY;
};

/** The text of a panel document: what serializePanel writes, in the layout the header describes. */
export function panelDocumentText(doc) {
  return write(doc, DOCUMENT, 0);
}

// The value's text at `depth` levels of indentation, or undefined where JSON.stringify would leave it
// out (undefined, a function). Mirrors JSON.stringify on everything it does not lay out itself.
function write(value, layout, depth) {
  if (layout === PRETTY) return JSON.stringify(value, null, INDENT)?.replaceAll('\n', `\n${INDENT.repeat(depth)}`);
  const v = typeof value?.toJSON === 'function' ? value.toJSON() : value;
  if (layout === ONE_LINE || v === null || typeof v !== 'object') return JSON.stringify(v);

  const inner = INDENT.repeat(depth + 1);
  const lines = [];
  if (Array.isArray(v)) {
    v.forEach((item, i) => lines.push(inner + (write(item, layout(i), depth + 1) ?? 'null')));
    return lines.length ? `[\n${lines.join(',\n')}\n${INDENT.repeat(depth)}]` : '[]';
  }
  for (const [key, item] of Object.entries(v)) {
    const text = write(item, layout(key), depth + 1);
    if (text !== undefined) lines.push(`${inner}${JSON.stringify(key)}: ${text}`);
  }
  return lines.length ? `{\n${lines.join(',\n')}\n${INDENT.repeat(depth)}}` : '{}';
}
