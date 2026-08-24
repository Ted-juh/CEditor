// reconstruct.mjs — S3 of the Ctrlr import: the panel, in CEditor's own vocabulary.
//
// The plan's aim, stated exactly: *recognisable and immediately editable, not pixel-exact.* Fonts,
// look-and-feel and custom paint will differ, and chasing them would buy a worse result than saying
// so — a native panel beats a transplant, and it inherits every capability the source never had.
//
// TWO MAPPINGS ARE NOT CONVERSIONS AT ALL, which is most of why this stage is small:
//
//   COLOURS ARE BYTE-IDENTICAL. Ctrlr stores JUCE `Colour::toString()` output — 8-digit ARGB hex,
//   `ff000000`. So does CEditor: componentTypes.js is full of 'FF4A4A4A'. A case fold is the entire
//   transformation, and both inherited it from the same framework.
//
//   GEOMETRY IS A RECTANGLE IN PANEL PIXELS on both sides, with the same origin convention, for the
//   same reason.
//
// WHAT IS NOT ATTEMPTED. Lua does not run (S4 imports it as inert text with a classification), and
// `uiCustomPaintCallback` components are placed as plain boxes with a note — the plan is explicit
// that immediate-mode JUCE drawing has no mapping into a declarative section model, and pretending
// otherwise is the one place the original objection to this whole feature is correct.

import { attr, attrNumber } from './xml.mjs';

/**
 * Ctrlr `uiType` -> a CEditor component.
 *
 * The right-hand side is deliberately conservative: every entry here is a type whose behaviour a
 * Ctrlr user would recognise. A type not in this table becomes a Label carrying its name, which is
 * visible, harmless and obviously unfinished — the three properties a fallback should have.
 */
export const COMPONENT_MAP = {
  uislider: 'Slider',
  uibutton: 'Button',
  uitogglebutton: 'ToggleButton',
  uicombo: 'Combobox',
  uilabel: 'Label',
  uiimage: 'Image',
  uilistbox: 'Listbox',
  uigroup: 'Group',
  uitabs: 'Container',
  uilcdlabel: 'LcdDisplay',
  uimidikeyboard: 'NoteRibbon',
};

/** `uiSliderStyle` decides whether a Ctrlr slider is a knob or a fader. */
export function componentForCtrlr(node) {
  const type = String(attr(node, 'uiType', '') || attr(node, 'componentType', '')).toLowerCase();
  if (type === 'uislider') {
    const style = String(attr(node, 'uiSliderStyle', '')).toLowerCase();
    if (style.includes('rotary')) return { type: 'Knob', reason: 'uiSliderStyle is rotary' };
    return {
      type: 'Slider',
      reason: style ? `uiSliderStyle is ${style}` : 'a slider with no style is linear',
      vertical: style.includes('vertical'),
    };
  }
  const mapped = COMPONENT_MAP[type];
  return mapped
    ? { type: mapped, reason: `uiType is ${type}` }
    : { type: 'Label', reason: `uiType "${type || '(none)'}" has no CEditor equivalent yet` };
}

/**
 * `componentRectangle` -> x, y, width, height.
 *
 * The plan lists the exact string format as an open question ("assumed `x y w h`, unconfirmed"), so
 * this accepts space- OR comma-separated, requires four numbers, and REFUSES anything else rather
 * than defaulting. A control silently placed at 0,0 with size 0 is invisible, and a panel full of
 * those looks like the importer worked.
 */
export function readRectangle(text) {
  const parts = String(text ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [x, y, width, height] = parts;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

/** Ctrlr colours are JUCE colours are CEditor colours. A case fold is the whole conversion. */
export function readColour(text, fallback = '') {
  const value = String(text ?? '').trim().replace(/^#/, '');
  if (/^[0-9A-Fa-f]{8}$/.test(value)) return value.toUpperCase();
  if (/^[0-9A-Fa-f]{6}$/.test(value)) return `FF${value.toUpperCase()}`;
  return fallback;
}

/** `uiComboContent` and `uiListBoxContent` are newline-separated lists. */
export function readItemList(text) {
  return String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * A reconstruction plan: what each Ctrlr component becomes, and what could not be placed.
 *
 * Returns a description rather than controls, so the caller decides whether to build a `.cepanel`
 * (the CLI does) and so the report can be read without one. Nothing here imports
 * `componentTypes.js`: this module stays a pure translation of the source document, and the CLI
 * does the building.
 */
export function planReconstruction(read, { profileId = '', deviceRole = 'primary', parameterIds = null } = {}) {
  if (!read?.ok) return { ok: false, error: read?.error ?? 'The panel could not be read.' };

  // Which parameters the harvest actually produced. A control bound to an id the profile does not
  // carry is a dangling binding: it looks connected in the editor and sends nothing, which is the
  // silent failure this whole importer is written to avoid. So a component whose modulator was
  // FLAGGED is placed unbound and reported, and the caller passes this set to make that possible.
  // Null means "the caller did not harvest", and every id is taken on trust.
  const known = parameterIds instanceof Set ? parameterIds : null;

  const placed = [];
  const skipped = [];
  const unbound = [];

  const visit = (node, modulatorName) => {
    for (const child of node.children ?? []) {
      const isComponent = child.name === 'component' || child.name === 'uiComponent';
      const name = child.name === 'modulator'
        ? (attr(child, 'modulatorName') || modulatorName)
        : modulatorName;

      if (isComponent) {
        const rect = readRectangle(attr(child, 'componentRectangle', ''));
        const label = attr(child, 'uiLabelText') || attr(child, 'componentLabel') || name || '';
        const mapping = componentForCtrlr(child);

        if (!rect) {
          skipped.push({
            name: label || '(unnamed)',
            reason: `componentRectangle is not four numbers ("${attr(child, 'componentRectangle', '')}")`,
          });
        } else {
          const paints = !!attr(child, 'uiCustomPaintCallback', '');
          const wanted = name ? slugParameter(name) : '';
          const bound = wanted && (known === null || known.has(wanted));
          if (wanted && !bound) {
            unbound.push({ name: label || wanted, reason: `"${name}" was not harvested, so nothing to bind to` });
          }
          placed.push({
            name: label || mapping.type,
            type: mapping.type,
            reason: mapping.reason,
            rect,
            vertical: !!mapping.vertical,
            // Bound to the harvested parameter of the same modulator, which is the whole reason S2
            // comes first — a reconstructed panel that drives nothing is a picture.
            parameterId: bound ? wanted : '',
            deviceRole,
            profileId,
            colours: {
              background: readColour(attr(child, 'uiSliderTrackColour', '') || attr(child, 'uiLabelBgColour', '')),
              foreground: readColour(attr(child, 'uiSliderThumbColour', '') || attr(child, 'uiLabelTextColour', '')),
            },
            items: readItemList(attr(child, 'uiComboContent', '') || attr(child, 'uiListBoxContent', '')),
            image: attr(child, 'uiImageResource', '') || attr(child, 'uiImageSliderResource', ''),
            // The one place the original objection to this whole feature is correct. Placed as an
            // ordinary box and reported, rather than approximated.
            customPaint: paints,
            alpha: attrNumber(child, 'componentAlpha', 1),
            visible: attr(child, 'componentVisibility', '') !== '0',
          });
        }
      }

      visit(child, name);
    }
  };
  visit(read.root, '');

  const filmstrips = placed.filter((c) => c.image && c.type === 'Slider').length;

  return {
    ok: true,
    placed,
    skipped,
    unbound,
    notes: [
      ...(unbound.length
        ? [`${unbound.length} control(s) are placed but bound to nothing: their modulator was `
           + 'flagged during the harvest, so there is no parameter to bind to. A dangling binding '
           + 'would look connected and send nothing.']
        : []),
      // Said out loud rather than discovered: the plan makes no pixel-fidelity promise, and a user
      // comparing the two side by side deserves to know that before they start.
      'Fonts, look-and-feel and custom paint will differ from the original. This aims at '
      + 'recognisable and immediately editable, not pixel-exact.',
      ...(placed.some((c) => c.customPaint)
        ? [`${placed.filter((c) => c.customPaint).length} component(s) drew themselves with a Lua paint `
           + 'callback. They are placed as plain boxes: immediate-mode JUCE drawing has no mapping '
           + 'into a declarative section model, and the Custom Component designer is the answer if '
           + 'that look is wanted back.']
        : []),
      ...(filmstrips
        ? [`${filmstrips} image-strip control(s) found. CEditor renders filmstrips natively `
           + '(InteractivePartRenderer, mode "filmstrip"), so these can be near-exact once their '
           + 'resources are extracted.']
        : []),
    ],
  };
}

function slugParameter(name) {
  return String(name ?? '')
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .toLowerCase();
}
