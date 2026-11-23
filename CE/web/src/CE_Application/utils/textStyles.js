// textStyles.js — named text styles: "Section heading", "Caption", "Readout" — change one, every
// text that uses it follows.
//
// A panel's text was styled control by control. Twelve section headings were twelve sets of font,
// size, weight, spacing and colour, and changing the headings meant changing twelve controls and
// hoping none was missed. A style is those properties under a name, kept in the panel
// (`panel.textStyles`), and a control's text names the style it uses (`Text.textStyle`).
//
// THE VALUES LIVE IN THE CONTROLS TOO. Applying or changing a style writes its values into every
// control that uses it, in one undo step (stores/textStyles.js), so a control always carries what it
// draws: the canvas, Preview, the player, the exported plug-in and Export Picture read the control
// as they always did and need to know nothing about styles. The link is what makes the next change
// reach them all — and it is how a control that was changed by hand afterwards can be shown as
// different from its style, to put back or to make the style.
//
// What a style holds is the type, not the layout: font (family, weight, style, size, case, spacing,
// decoration lines), colour and line height. Alignment, wrapping, effects and the words themselves
// stay each control's own.

import { pristineControlFor, readControlPath, sameControlValue, setPatchablePaths } from '../models/controlSetFamilies.js';

/** The properties a style holds, by Text child section. */
export const TEXT_STYLE_PROPERTIES = Object.freeze({
  Font: Object.freeze(['family', 'weight', 'weightValue', 'style', 'size', 'caseMode', 'letterSpacing', 'wordSpacing',
    'underline', 'strikethrough', 'overline']),
  Fill: Object.freeze(['colour']),
  Multiline: Object.freeze(['lineHeight']),
});

const textChild = (text, name) => text?._children?.[name] ?? null;

/** A control's Text section, or null. */
export function textSectionOf(control) {
  return control?._children?.Text ?? null;
}

const STYLE_PATHS = Object.freeze(Object.entries(TEXT_STYLE_PROPERTIES)
  .flatMap(([section, keys]) => keys.map((key) => ({ section, key, path: `Text.${section}.${key}` }))));

function copyValue(value) {
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}

/**
 * Whether the control set decides this text property on this control rather than the control
 * itself: a set can patch it (its Lettering: typeface, weight, spacing), the control still has the
 * factory value, and the author has not pinned it (models/controlSetFamilies.js, PINS). The control
 * holds the factory value there and the canvas draws the set's.
 */
export function setDecides(control, path) {
  const type = control?._children?.Core?.controlType;
  if (!setPatchablePaths(type).has(path)) return false;
  const pins = control?._children?.Core?.setOverrides;
  if (Array.isArray(pins) && pins.includes(path)) return false;
  const pristine = pristineControlFor(type);
  return !!pristine && sameControlValue(readControlPath(control, path), readControlPath(pristine, path));
}

/**
 * The style a control's text makes as it is now: { text: { Font, Fill, Multiline }, fromSet }.
 *
 * WHAT THE SET DECIDES STAYS WITH THE SET. Where the control set draws a property (a label's
 * typeface and weight come from the set's Lettering until the author changes them), the document
 * holds only the factory value. Copying that onto other texts would pin them to it — the typeface
 * the canvas never showed — and cut them off from the set. So those properties are listed in
 * `fromSet` instead: a text given the style hands them back to its set too, and a set switch still
 * reaches every text using the style.
 */
export function captureTextStyle(control) {
  const text = textSectionOf(control);
  const out = { text: {}, fromSet: [] };
  for (const { section, key, path } of STYLE_PATHS) {
    const source = textChild(text, section);
    if (!source || source[key] === undefined) continue;
    if (setDecides(control, path)) { out.fromSet.push(`${section}.${key}`); continue; }
    (out.text[section] ??= {})[key] = copyValue(source[key]);
  }
  return out;
}

/**
 * The patch that gives `control` the style (paths as applyControlPatchesById takes them): the
 * style's values, the factory value where the style leaves it to the set, and the control's pins
 * kept in step — an author value equal to the factory one pinned so the set does not take it, a
 * property handed back to the set unpinned. `styleId`, when given, links the control.
 */
export function textStylePatch(style, control, styleId) {
  const patch = {};
  const type = control?._children?.Core?.controlType;
  const patchable = setPatchablePaths(type);
  const pristine = pristineControlFor(type);
  const current = control?._children?.Core?.setOverrides;
  const pins = new Set(Array.isArray(current) ? current : []);
  const fromSet = new Set(style?.fromSet ?? []);
  for (const { section, key, path } of STYLE_PATHS) {
    const own = style?.text?.[section];
    if (own && Object.hasOwn(own, key)) {
      patch[path] = copyValue(own[key]);
      if (patchable.has(path)) {
        if (pristine && sameControlValue(own[key], readControlPath(pristine, path))) pins.add(path);
        else pins.delete(path);
      }
    } else if (fromSet.has(`${section}.${key}`) && pristine) {
      patch[path] = copyValue(readControlPath(pristine, path));
      pins.delete(path);
    }
  }
  if (patchable.size && control?._children?.Core) patch['Core.setOverrides'] = [...pins];
  if (styleId !== undefined) patch['Text.textStyle'] = styleId;
  return patch;
}

/** The properties where a control's text no longer has its style: [{ section, key }]. */
export function differencesFromStyle(control, style) {
  const text = textSectionOf(control);
  const out = [];
  for (const [section, values] of Object.entries(style?.text ?? {})) {
    const current = textChild(text, section) ?? {};
    for (const [key, value] of Object.entries(values ?? {})) {
      if (JSON.stringify(current[key]) !== JSON.stringify(value)) out.push({ section, key });
    }
  }
  for (const entry of style?.fromSet ?? []) {
    const [section, key] = entry.split('.');
    if (!setDecides(control, `Text.${entry}`)) out.push({ section, key });
  }
  return out;
}

/** The style a control names, from the panel's list, or null. */
export function styleOf(control, styles) {
  const id = String(textSectionOf(control)?.textStyle ?? '');
  return id ? (styles ?? []).find((style) => style.id === id) ?? null : null;
}

/** A new style's id: its name made safe, and unique among `styles`. */
export function newTextStyleId(name, styles) {
  const base = String(name ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'style';
  const taken = new Set((styles ?? []).map((style) => style.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** A name not yet used, from `wanted`: "Heading", "Heading 2"… */
export function unusedTextStyleName(wanted, styles) {
  const names = new Set((styles ?? []).map((style) => String(style.name).toLowerCase()));
  const base = String(wanted ?? '').trim() || 'Text style';
  if (!names.has(base.toLowerCase())) return base;
  let n = 2;
  while (names.has(`${base} ${n}`.toLowerCase())) n += 1;
  return `${base} ${n}`;
}
