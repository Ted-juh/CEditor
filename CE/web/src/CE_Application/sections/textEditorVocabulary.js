// textEditorVocabulary.js — the text option tables that are pure data.
//
// These lived in textEditorOptions.js, which also holds the tables carrying lucide icon components.
// That was fine while only the Properties panel read them; ce.text reports the same vocabularies to
// a script, and importing them dragged the whole icon set into the scripting layer — enough to make
// every test that touches panelRuntime fail on an unresolvable icon import.
//
// So the data lives here and textEditorOptions re-exports it: one table still, reachable from both
// sides, and the scripting layer depends on no Svelte component to learn what a case mode is.

export const TEXT_POSITION_OPTIONS = [
  { value: 'topLeft', label: 'Top Left' },
  { value: 'top', label: 'Top' },
  { value: 'topRight', label: 'Top Right' },
  { value: 'left', label: 'Left' },
  { value: 'centred', label: 'Center' },
  { value: 'right', label: 'Right' },
  { value: 'bottomLeft', label: 'Bottom Left' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'bottomRight', label: 'Bottom Right' },
];

// Case and script were hand-written <option> lists in TextEditor.svelte with the legal values
// repeated a third time inside canvasControlStyles' normalizers. ce.text has to report the same
// vocabulary to a script, and a fourth copy is a fourth thing to drift — so the select, the
// normalizer's test and the scripting layer all read these.
export const TEXT_CASE_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'uppercase', label: 'Uppercase' },
  { value: 'lowercase', label: 'Lowercase' },
  { value: 'title', label: 'Title Case' },
  { value: 'sentence', label: 'Sentence Case' },
  { value: 'smallcaps', label: 'Small Caps' },
];

export const TEXT_SCRIPT_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'superscript', label: 'Super' },
  { value: 'subscript', label: 'Sub' },
];

export const TYPOGRAPHY_FEATURE_OPTIONS = [
  { key: 'ligatures', label: 'Ligatures', tags: ['liga', 'clig'] },
  { key: 'stylisticAlternates', label: 'Alternates', tags: ['salt'] },
  { key: 'oldstyleFigures', label: 'Oldstyle', tags: ['onum'] },
  { key: 'tabularFigures', label: 'Tabular', tags: ['tnum'] },
  { key: 'fractions', label: 'Fractions', tags: ['frac'] },
  { key: 'slashedZero', label: 'Slash 0', tags: ['zero'] },
];
