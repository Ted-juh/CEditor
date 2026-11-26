// A knob's readout in its cap, lettered to read on the knob.
//
// A knob's or a fader's readout stands on the panel by default, past the pointer's tip or beside the
// cap, and is drawn in the set's readout colour, which reads on the set's panel (controlSets.js
// withReadout). A knob's readout can sit in its cap instead (the Labels tab's Sits, the presets that
// put the value in the middle of the dial), and there it stands on the knob's face, which most sets
// draw in the cap's own colour: in 57 of the 79 built-in sets the readout was the colour of what it
// stood on, and could not be seen. What is under it is the set's knob design (its cap, its housing,
// their fills), which a set's colour roles do not say, so the ink is chosen here, against the knob as
// the set draws it, before its colours are resolved (controlSetFamilies.resolveControlForSet).
//
// Only a readout still in the default colour is lettered; a colour its author chose is kept.

import { resolveColourValue, resolveToken } from './controlSets.js';
import { contrast } from './instrumentDesigns.js';
import { finishedColour } from '../utils/materialFilter.js';

export const READOUT_DEFAULT = '{control.readout}';
const READS = 4.5;
// In this order, the first that reads on the face: the set's own readout, its label text, the
// text it letters on a filled surface, and then white or black (one of which reads at 4.58:1 or
// better on any opaque colour).
const CANDIDATES = ['{control.readout}', '{text.label}', '{text.inverse}'];
const WHITE = 'FFFFFFFF';
const BLACK = 'FF000000';

const ARGB = /^[0-9A-F]{8}$/i;
const literal = (value, set) => {
  const resolved = String(resolveColourValue(value, set) ?? '').replace('#', '').toUpperCase();
  if (ARGB.test(resolved)) return resolved;
  return /^[0-9A-F]{6}$/.test(resolved) ? `FF${resolved}` : null;
};
/** `top` laid over `under` by its alpha: what the eye sees where both are drawn. */
function over(top, under) {
  const a = parseInt(top.slice(0, 2), 16) / 255;
  const mix = (i) => Math.round(parseInt(top.slice(i, i + 2), 16) * a + parseInt(under.slice(i, i + 2), 16) * (1 - a));
  return `FF${[2, 4, 6].map((i) => mix(i).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/**
 * What a knob's centre is drawn in, as the set draws it: its panel, then its housing, then its cap,
 * each in its finish (a glass cap is lit lighter than its fill, utils/materialFilter.js
 * finishedColour) and laid over the one below by its alpha where it is shown. A gradient is taken
 * at its base colour, which is what most of a face is.
 */
export function knobFaceColour(control, set) {
  const parts = control?._children?.Parts?._children ?? {};
  let face = panelColour(set);
  for (const name of ['bodyHousing', 'bodyCap']) {
    const part = parts[name];
    if (!part || part.visible === false) continue;
    const background = part._children?.Background?._children;
    const fill = literal(background?.Fill?.colour, set);
    if (fill) face = over(finishedColour(fill, background?.Effects?._children?.Material, set?.lamp), face);
  }
  return face;
}

/** The set's panel as it is drawn: its surface in its finish. */
export function panelColour(set) {
  const surface = literal('{panel.surface}', set) ?? 'FF202020';
  return finishedColour(surface, set?.panel?.material, set?.lamp);
}

/** The ink a readout on `face` is lettered in: a role's reference, or white or black. */
export function readoutInkOn(face, set) {
  for (const candidate of CANDIDATES) {
    const colour = literal(candidate, set);
    if (colour && contrast(colour, face) >= READS) return candidate;
  }
  return contrast(WHITE, face) >= contrast(BLACK, face) ? WHITE : BLACK;
}

/**
 * The control with its readout lettered to read on the knob, where it is a knob's (a circular
 * slider's), sits in the cap and is still in the default colour; otherwise the same control.
 */
export function withReadoutInCap(control, set) {
  const children = control?._children;
  if (String(children?.Behavior?.geometry ?? '').toLowerCase() !== 'circular') return control;
  const label = children?.Parts?._children?.labelCurrent;
  if (String(label?.anchor ?? '') !== 'centre') return control;
  const text = label?._children?.Text;
  const fill = text?._children?.Fill;
  if (fill?.colour !== READOUT_DEFAULT) return control;
  const ink = readoutInkOn(knobFaceColour(control, set), set);
  return {
    ...control,
    _children: {
      ...children,
      Parts: {
        ...children.Parts,
        _children: {
          ...children.Parts._children,
          labelCurrent: { ...label, _children: { ...label._children, Text: { ...text, _children: { ...text._children, Fill: { ...fill, colour: ink } } } } },
        },
      },
    },
  };
}
