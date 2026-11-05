// labelShows.js — a Label that shows something of another control instead of its own words.
//
// A knob, a slider or a meter draws no text of its own: its name, its
// value, the ends of its range are Labels beside it, each a Label like any other (every Text
// property applies), told what to show (`Text.shows`) and of which control (`Text.showsControl`, or
// else the control it is attached to, `Core.attachedTo`; utils/attachedLabels.js keeps the two
// together). None of the three is a
// section default, so a control that uses none of them carries none of them, and a linked library
// copy still matches its package. The words are worked out where the Label is drawn
// (utils/labelText.js): on the editor's canvas from the control as it is authored, in Preview, the
// player and the plug-in from its live value (PanelPreviewSurface's applyLabelShowsSource). A Label
// whose control is not on the panel reads its own words.
//
// This file is the model: what a Label can show, of which control, and its lettering. It imports
// nothing from the interaction runtime, so the set resolution that reads it
// (models/controlSetFamilies.js) stays loadable by the plain-Node export tools
// (tools/scripts/prepare-export-panel.mjs).
//
//   ''       its own text (Text.content)
//   name     the control's name
//   text     its own text: a button's caption, which stays the button's (scripts and states set it)
//   value    its value as it prints it (a knob's readout: "1.20 kHz", a note name, "+3")
//   min/max  the ends of its range, printed the same way
//   unit     its unit
//   start/end  a range's two handles


/** What a Label can show, in the order the Shows menu offers it, with the menu's words. */
export const LABEL_SHOWS = Object.freeze([
  ['', 'Its own text'],
  ['value', 'Value of'],
  ['name', 'Name of'],
  ['text', 'Text of'],
  ['min', 'Min of'],
  ['max', 'Max of'],
  ['unit', 'Unit of'],
  ['start', 'Start of'],
  ['end', 'End of'],
]);

/**
 * The part of a knob that drew the same text before knobs stopped drawing their own: a shown Label
 * takes the set's lettering for that part (models/controlSetFamilies.js).
 */
export const SHOWN_PART = Object.freeze({
  name: 'labelTitle',
  value: 'labelValue',
  min: 'labelMin',
  max: 'labelMax',
  unit: 'labelUnit',
  start: 'labelStart',
  end: 'labelEnd',
});

/**
 * How a shown Label is lettered when it is made, as the knob lettered the same text: its size, weight
 * and ink. A set's lettering for the knob's part lands where these still stand
 * (controlSetFamilies.js patchShownLabel); what an author sets is theirs.
 */
export const SHOWN_LETTERING = Object.freeze({
  name: { size: 11, weight: 700, colour: '{text.muted}' },
  value: { size: 12, weight: 700, colour: '{text.label}' },
  min: { size: 11, weight: 600, colour: '{text.label}' },
  max: { size: 11, weight: 600, colour: '{text.label}' },
  unit: { size: 10, weight: 600, colour: '{text.muted}' },
  start: { size: 11, weight: 600, colour: '{control.cap.start}' },
  end: { size: 11, weight: 600, colour: '{control.cap.end}' },
});

const WEIGHT_NAMES = { 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };

/** `text` (a Label's Text section) lettered as a Label showing `shows` is made: a copy. */
export function withShownLettering(text, shows) {
  const lettering = SHOWN_LETTERING[shows];
  if (!lettering || !text) return text;
  const font = text._children?.Font ?? {};
  const fill = text._children?.Fill ?? {};
  return {
    ...text,
    _children: {
      ...(text._children ?? {}),
      Font: { ...font, size: lettering.size, weightValue: lettering.weight, weight: WEIGHT_NAMES[lettering.weight] ?? font.weight },
      Fill: { ...fill, colour: lettering.colour },
    },
  };
}

/** What `label` shows: '' for its own text, else one of LABEL_SHOWS' keys. */
export function labelShows(label) {
  const shows = String(label?._children?.Text?.shows ?? '');
  return LABEL_SHOWS.some(([key]) => key && key === shows) ? shows : '';
}

/** The control a control is attached to, or ''. */
export function attachedTo(control) {
  return String(control?._children?.Core?.attachedTo ?? '');
}

/** The control a Label shows something of: the one it names, else the one it is attached to. */
export function labelSourceId(label) {
  return String(label?._children?.Text?.showsControl ?? '').trim() || attachedTo(label);
}

/** Every control in a panel's tree, nested ones included, by id. */
export function controlsById(controls, out = new Map()) {
  for (const control of controls ?? []) {
    const id = String(control?._children?.Core?.id ?? '');
    if (id) out.set(id, control);
    const kids = control?._children?.Children?._children;
    if (kids) controlsById(Object.values(kids), out);
  }
  return out;
}
