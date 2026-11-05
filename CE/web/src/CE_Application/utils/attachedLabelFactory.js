// attachedLabelFactory.js — a Label made for a control, attached to it (utils/attachedLabels.js).
//
// The Labels tab's + buttons (stores/controls.js addAttachedLabel), the starters that give a knob its
// value or a slider its title, and the conversion of panels whose knobs drew their own text all make
// them here, so one made any of those ways is the same Label.

import { createControl } from '../models/componentTypes.js';
import { attachedLabelRect } from './attachedLabels.js';
import { SHOWN_LETTERING, withShownLettering } from './labelShows.js';
import { shownText } from './labelText.js';

/** About how wide `text` prints at `size` px, with a little room: a first width, the author's after. */
export function wordsWidth(text, size = 11) {
  return Math.ceil(String(text ?? '').length * size * 0.62) + 8;
}

/**
 * A Label attached to `owner`, bare (no fill, no border) and one line, beside it where
 * attachedLabelRect puts it. It shows `shows` of the control (utils/labelShows.js), or, with `shows`
 * '', reads its own `content`, lettered and placed as the part `as` would be ('name' unless said);
 * `at` places it as another part would be (a slider's title under it, where the value would go).
 * As wide as its words; a value as wide as the widest it prints, at either end of the range. `core`
 * is added to its Core (an id, a name, a layer, a control set).
 */
export function makeAttachedLabel(owner, shows, { content = '', as = '', at = '', core = {} } = {}) {
  const kind = as || shows || 'name';
  // A button's caption is lettered as the button lettered it beside its key: its own face, weight,
  // spacing and colour, at a size that reads.
  const ownFont = owner?._children?.Text?._children?.Font ?? {};
  const size = shows === 'text' ? Math.max(9, Math.min(12, Number(ownFont.size) || 11)) : (SHOWN_LETTERING[kind]?.size ?? 11);
  const words = !shows ? [content]
    : shows === 'value' ? ['value', 'min', 'max'].map((each) => shownText(owner, each))
      : [shownText(owner, shows)];
  const rect = attachedLabelRect(owner, at || kind, { size, width: Math.max(...words.map((each) => wordsWidth(each, size))) });
  const label = createControl('Label', {
    Core: { ...core, attachedTo: owner?._children?.Core?.id ?? '' },
    Transform: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    // One line: a value that grows is clipped at its box rather than broken onto a second line.
    Text: { content: shows ? '' : String(content ?? ''), ...(shows ? { shows } : {}), _children: { Multiline: { wrapMode: 'none' } } },
    Background: { _children: { Fill: { colour: '00000000' }, Border: { enabled: false } } },
    ContentLayout: { mode: 'text_only', horizontalAlign: rect.align, paddingLeft: 0, paddingRight: 0 },
  });
  label._children.Text = withShownLettering(label._children.Text, kind);
  if (shows === 'text') {
    const text = label._children.Text;
    const font = { ...(text._children.Font ?? {}), size };
    for (const key of ['family', 'weight', 'weightValue', 'letterSpacing', 'style']) if (ownFont[key] !== undefined) font[key] = ownFont[key];
    const colour = owner?._children?.Text?._children?.Fill?.colour;
    label._children.Text = { ...text, _children: { ...text._children, Font: font, ...(colour ? { Fill: { ...(text._children.Fill ?? {}), colour } } : {}) } };
  }
  return label;
}
