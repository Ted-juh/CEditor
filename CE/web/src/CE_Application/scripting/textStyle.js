// textStyle.js — the typography rules ce.text enforces (design doc §46).
//
// Text.Font is a 41-field node, and every field of it was already reachable with set(). What was
// missing was never the fields; it was the rules AROUND them, which lived in TextEditor.svelte and
// so belonged to the Properties panel alone:
//
//  * `weight` and `weightValue` are a PAIR. The renderer resolves a weight as
//    `numberOr(weightValue, weight === 'Bold' ? 700 : 400)` — weightValue first — while the
//    Properties panel shows bold state for a non-variable font from `weight === 'Bold'`. So a
//    script that wrote one and not the other made the editor and the render disagree, in BOTH
//    directions: weightValue=700 alone renders bold and displays as not-bold, and weight='Bold'
//    alone displays as bold and renders at 400.
//  * A family is only usable if the font catalogue has it. Nothing validated it, so a typo'd
//    family name was stored and silently fell back to whatever the platform chose.
//  * A variable axis is only meaningful if the font declares it, and setting `wght` has to move the
//    weight pair with it — which is what the panel's own axis control does.
//
// This module is where those rules live so that both the runtime and the tests can reach them, and
// so the vocabularies come from the app's own tables rather than being retyped. Nothing here
// touches a store or a control: it takes plain data and returns plain data.

import { numberOr } from '../utils/primitives.js';
import { normalizeScriptMode, normalizeTextCaseMode } from '../editor/canvasControlStyles.js';
import {
  TEXT_CASE_OPTIONS, TEXT_POSITION_OPTIONS, TEXT_SCRIPT_OPTIONS, TYPOGRAPHY_FEATURE_OPTIONS,
} from '../sections/textEditorVocabulary.js';

/** The bold threshold, and the one place it is written down. TextEditor applies exactly this rule
 *  every time it touches a weight — on a family change, on the bold toggle and on a wght axis
 *  move. Two other factories in the tree disagree with it (one calls 600 "SemiBold", one calls
 *  anything under 700 "SemiBold"), but those build controls rather than edit them, and the
 *  Properties panel is what a script is being measured against. */
export const BOLD_AT = 700;

/** Font.weight and Font.weightValue for one numeric weight — always both, never one. */
export function weightFields(weightValue) {
  const value = Math.round(numberOr(weightValue, 400));
  return { weightValue: value, weight: value >= BOLD_AT ? 'Bold' : 'Regular' };
}

/** The weight a Font node is really rendered at, by the renderer's own resolution order. */
export function resolvedWeight(font) {
  return numberOr(font?.weightValue, font?.weight === 'Bold' ? BOLD_AT : 400);
}

/** Does this Font node disagree with itself — would the editor and the render show different
 *  weights? True is the state a raw set() on one half of the pair leaves behind. */
export function weightDisagrees(font) {
  if (!font) return false;
  return (resolvedWeight(font) >= BOLD_AT) !== (font.weight === 'Bold');
}

const FEATURE_BY_KEY = new Map(TYPOGRAPHY_FEATURE_OPTIONS.map((o) => [o.key, o]));

/** The OpenType tags one feature switch turns on, or nothing if it is not a feature switch. */
export function featureTags(key) {
  return FEATURE_BY_KEY.get(String(key))?.tags ?? null;
}

export const FEATURE_KEYS = TYPOGRAPHY_FEATURE_OPTIONS.map((o) => o.key);
export const CASE_MODES = TEXT_CASE_OPTIONS.map((o) => o.value);
export const SCRIPT_MODES = TEXT_SCRIPT_OPTIONS.map((o) => o.value);
export const JUSTIFICATIONS = TEXT_POSITION_OPTIONS.map((o) => o.value);

/* -------------------------------------------------------------------- the catalogue */

/** One availableFonts entry, reduced to what a script needs to decide whether it can use it.
 *
 *  `portable` is the honest field. A builtin family is named in every runtime; a library font
 *  lives in the editor's app settings and is registered as a FontFace by the editor at edit time —
 *  no export path calls ensureStoredFontLoaded, and the font library is not part of the panel
 *  document. So a panel that styles itself with a library font looks right while you are building
 *  it and falls back to a platform default once exported. A script can now see that coming. */
export function fontDescriptor(entry) {
  if (!entry) return null;
  const builtin = entry.sourceType === 'builtin';
  const axes = Array.isArray(entry.axes) ? entry.axes : [];
  return {
    family: String(entry.value ?? entry.family ?? ''),
    label: String(entry.label ?? entry.value ?? entry.family ?? ''),
    source: String(entry.sourceType ?? 'builtin'),
    portable: builtin,
    variable: entry.supportsWeight === true,
    axes: axes.map((axis) => ({
      tag: String(axis?.tag ?? ''),
      min: numberOr(axis?.min, 0),
      default: numberOr(axis?.default, numberOr(axis?.min, 0)),
      max: numberOr(axis?.max, numberOr(axis?.min, 0)),
    })).filter((axis) => axis.tag !== ''),
    // An empty list means two different things and the flag is what tells them apart: a font whose
    // features were scanned and has none, versus one nobody has scanned. Reporting [] for both
    // would let a script conclude a feature is unsupported when the truth is that it is unknown.
    features: Array.isArray(entry.supportedFeatures) ? [...entry.supportedFeatures] : [],
    featuresKnown: entry.featureSupportKnown === true,
  };
}

/** The whole catalogue, in the order the Properties panel offers it. */
export function fontCatalogue(entries) {
  return (Array.isArray(entries) ? entries : []).map(fontDescriptor).filter(Boolean);
}

/** Find a family the way TextEditor does — by the stored `value` first, then by the human family
 *  name — and case-insensitively, because "arial" is not a different font from "Arial". */
export function findFont(catalogue, family) {
  const wanted = String(family ?? '').trim().toLowerCase();
  if (!wanted) return null;
  return (catalogue ?? []).find((f) => f.family.toLowerCase() === wanted)
    ?? (catalogue ?? []).find((f) => f.label.toLowerCase() === wanted)
    ?? null;
}

/** The axis descriptor for one tag on one font, or nothing when the font has no such axis. */
export function findAxis(descriptor, tag) {
  const wanted = String(tag ?? '').trim();
  if (!wanted) return null;
  return (descriptor?.axes ?? []).find((axis) => axis.tag === wanted) ?? null;
}

/* -------------------------------------------------------------------- planning a write */

/** Where each readable option name lives in the control tree. Font unless stated. */
const MULTILINE_FIELDS = new Set(['lineHeight', 'maxLines', 'wrapMode', 'overflowMode', 'fitMode']);
const POSITION_FIELDS = new Set(['justification', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom']);

const NUMBER_FIELDS = new Set([
  'size', 'letterSpacing', 'wordSpacing', 'baselineShift', 'lineHeight', 'maxLines',
  'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom',
]);
const BOOLEAN_FIELDS = new Set(['underline', 'strikethrough', 'overline', ...FEATURE_KEYS]);

function sectionFor(name) {
  if (MULTILINE_FIELDS.has(name)) return 'Multiline';
  if (POSITION_FIELDS.has(name)) return 'Position';
  return 'Font';
}

/**
 * Turn a style({...}) request into the writes it implies, refusing what cannot be honoured.
 *
 * Returns `{ writes, refused }` — `writes` is a list of `{ section, field, value }`, `refused` a
 * list of `{ option, reason }`. Refusing rather than clamping-in-silence is the §44 rule: a script
 * that asked for a font nobody has should hear about it, not discover it visually three panels
 * later.
 *
 * `descriptor` is the resolved font AFTER any family change in the same call, because that is what
 * a weight or an axis in the same call has to be judged against.
 */
export function planStyle(opts, { descriptor = null, catalogue = null } = {}) {
  const writes = [];
  const refused = [];
  const source = opts && typeof opts === 'object' ? opts : {};
  const put = (field, value) => writes.push({ section: sectionFor(field), field, value });

  // Family first: everything else is judged against the font that will be in place.
  let font = descriptor;
  if ('family' in source) {
    const found = findFont(catalogue ?? [], source.family);
    if (!found) {
      refused.push({ option: 'family', reason: `no font named "${source.family}" is available` });
    } else {
      font = found;
      put('family', found.family);
    }
  }

  // The weight pair, from whichever spelling was used. `bold` is the toggle the panel offers;
  // `weight` is the number. Given both, the number wins — it says more.
  let weightWanted;
  if ('bold' in source) weightWanted = source.bold ? BOLD_AT : 400;
  if ('weight' in source) {
    const asNumber = Number(source.weight);
    if (Number.isFinite(asNumber)) weightWanted = asNumber;
    else if (String(source.weight) === 'Bold') weightWanted = BOLD_AT;
    else if (String(source.weight) === 'Regular') weightWanted = 400;
    else refused.push({ option: 'weight', reason: `"${source.weight}" is neither a number nor Bold/Regular` });
  }
  if (weightWanted !== undefined) {
    const axis = findAxis(font, 'wght');
    const clamped = axis
      ? Math.min(axis.max, Math.max(axis.min, weightWanted))
      : Math.min(1000, Math.max(1, weightWanted));
    const pair = weightFields(clamped);
    put('weightValue', pair.weightValue);
    put('weight', pair.weight);
    // A variable font carries its weight on the axis as well, and the renderer reads the axis for
    // variation settings — so leaving it behind would render the old weight on a variable face.
    if (axis) put('variationAxes', { tag: 'wght', value: pair.weightValue });
  }

  if ('italic' in source) put('style', source.italic ? 'Italic' : 'Normal');

  if ('caseMode' in source) {
    if (normalizeTextCaseMode(source.caseMode) !== String(source.caseMode)) {
      refused.push({ option: 'caseMode', reason: `"${source.caseMode}" is not one of ${CASE_MODES.join(', ')}` });
    } else put('caseMode', String(source.caseMode));
  }
  if ('scriptMode' in source) {
    if (normalizeScriptMode(source.scriptMode) !== String(source.scriptMode)) {
      refused.push({ option: 'scriptMode', reason: `"${source.scriptMode}" is not one of ${SCRIPT_MODES.join(', ')}` });
    } else put('scriptMode', String(source.scriptMode));
  }
  if ('justification' in source) {
    if (!JUSTIFICATIONS.includes(String(source.justification))) {
      refused.push({ option: 'justification', reason: `"${source.justification}" is not one of ${JUSTIFICATIONS.join(', ')}` });
    } else put('justification', String(source.justification));
  }

  for (const key of FEATURE_KEYS) {
    if (!(key in source)) continue;
    // Turning a feature ON that the font is known not to have would store a switch that does
    // nothing. Turning one OFF is always fine, and an unscanned font is not a refusal — unknown is
    // not the same as absent.
    if (source[key] && font && font.featuresKnown
        && !featureTags(key).some((tag) => font.features.includes(tag))) {
      refused.push({ option: key, reason: `"${font.family}" does not have ${featureTags(key).join('/')}` });
      continue;
    }
    put(key, source[key] === true);
  }

  for (const [name, value] of Object.entries(source)) {
    if (!NUMBER_FIELDS.has(name) && !BOOLEAN_FIELDS.has(name)) continue;
    if (FEATURE_KEYS.includes(name)) continue;        // already handled, with its own guard
    if (NUMBER_FIELDS.has(name)) {
      const asNumber = Number(value);
      if (!Number.isFinite(asNumber)) {
        refused.push({ option: name, reason: `"${value}" is not a number` });
        continue;
      }
      // Size and line height have hard floors: a zero-size font is not a small font, it is an
      // invisible one, and the layout code divides by the line height.
      if (name === 'size') put('size', Math.max(1, asNumber));
      else if (name === 'lineHeight') put('lineHeight', Math.max(0.5, asNumber));
      else if (name === 'maxLines') put('maxLines', Math.max(0, Math.round(asNumber)));
      else put(name, asNumber);
    } else {
      put(name, value === true);
    }
  }

  const known = new Set([
    'family', 'bold', 'weight', 'italic', 'caseMode', 'scriptMode', 'justification',
    ...FEATURE_KEYS, ...NUMBER_FIELDS, ...BOOLEAN_FIELDS,
  ]);
  for (const name of Object.keys(source)) {
    if (!known.has(name)) refused.push({ option: name, reason: 'not a style option' });
  }

  return { writes, refused };
}

/** Plan one variable-axis move. `wght` drags the weight pair with it, the way the panel's axis
 *  control does; an axis the font does not declare is refused rather than stored. */
export function planAxis(descriptor, tag, value) {
  const axis = findAxis(descriptor, tag);
  if (!axis) {
    return {
      writes: [],
      refused: [{
        option: String(tag),
        reason: descriptor
          ? `"${descriptor.family}" has no ${tag} axis`
          : 'no font descriptor to check the axis against',
      }],
    };
  }
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber)) {
    return { writes: [], refused: [{ option: String(tag), reason: `"${value}" is not a number` }] };
  }
  const clamped = Math.min(axis.max, Math.max(axis.min, asNumber));
  const writes = [{ section: 'Font', field: 'variationAxes', value: { tag: axis.tag, value: clamped } }];
  if (axis.tag === 'wght') {
    const pair = weightFields(clamped);
    writes.push({ section: 'Font', field: 'weightValue', value: pair.weightValue });
    writes.push({ section: 'Font', field: 'weight', value: pair.weight });
  }
  return { writes, refused: [] };
}
