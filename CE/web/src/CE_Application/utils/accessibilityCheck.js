// accessibilityCheck.js — the rules behind the dock's Access tool: what a screen reader will call a
// control, whether that says anything, and whether text can be read against what is behind it.
//
// Pure: no DOM and no stores. The measuring (which needs the page's renderer) is
// stores/accessibilityCheckRun.js; the player's own spoken names come from spokenName below, so the
// tool reports what the plug-in will actually say.
//
// CONTRAST is WCAG 2's: the relative luminance of two colours, (L1 + 0.05) / (L2 + 0.05), and the
// AA thresholds — 4.5:1 for text, 3:1 for large text (24 px, or 18.66 px and bold). A panel is a
// UI read at arm's length on a dim stage as often as on a desk, which is the case the thresholds
// were written for.
//
// NAMES: an operable control is announced by its role and a name ("Cutoff, slider, 64"). The name
// is the author's Screen-reader text when there is one; else the caption Label attached to it; else
// a button's own text; else its name in the tree, made readable. A tree name is often an id
// ("tone1_lfo_shape", "Knob_3"), and a button's text often still "Button": those are reported.

import { attachedTo, labelShows } from './labelShows.js';
import { walkControls } from './containment.js';

// --- Colour ---------------------------------------------------------------------------------------

/** A computed CSS colour (`rgb(…)`, `rgba(…)`, `#rgb[a]`, `#rrggbb[aa]`, `transparent`) as { r, g, b, a }, or null. */
export function parseCssColor(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return null;
  if (text === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const fn = text.match(/^rgba?\(\s*([^)]+)\)$/);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const channel = (part) => (part.endsWith('%') ? Number.parseFloat(part) * 2.55 : Number.parseFloat(part));
    const alpha = parts[3] == null ? 1 : (parts[3].endsWith('%') ? Number.parseFloat(parts[3]) / 100 : Number.parseFloat(parts[3]));
    const [r, g, b] = parts.slice(0, 3).map(channel);
    if (![r, g, b, alpha].every(Number.isFinite)) return null;
    return { r, g, b, a: Math.max(0, Math.min(1, alpha)) };
  }
  const hex = text.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    return {
      r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }
  return null;
}

/** `top` laid over the opaque `bottom` (alpha in `top.a`), as an opaque colour. */
export function over(top, bottom) {
  const a = Math.max(0, Math.min(1, top.a ?? 1));
  return { r: top.r * a + bottom.r * (1 - a), g: top.g * a + bottom.g * (1 - a), b: top.b * a + bottom.b * (1 - a), a: 1 };
}

const linear = (channel) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2 relative luminance of an sRGB colour, 0 (black) to 1 (white). */
export function relativeLuminance({ r, g, b }) {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 2 contrast ratio of two opaque colours, 1 to 21. */
export function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Large text in WCAG's sense: 24 px, or 18.66 px and bold. */
export function isLargeText(fontSizePx, fontWeight) {
  const size = Number(fontSizePx) || 0;
  const weight = Number.parseInt(fontWeight, 10) || (String(fontWeight).toLowerCase() === 'bold' ? 700 : 400);
  return size >= 24 || (size >= 18.66 && weight >= 700);
}

/** The AA ratio text of this size has to reach. */
export function requiredContrast(fontSizePx, fontWeight) {
  return isLargeText(fontSizePx, fontWeight) ? 3 : 4.5;
}

/**
 * The contrast text of colour `text` (with alpha) has against each of the `backgrounds` pixels
 * (opaque, flat RGBA bytes), at the `share` of them that is hardest to read on: 0.1 means 90% of
 * the text's background gives at least this. One stray dark pixel in a light texture does not
 * fail a label; a gradient that runs into the text's colour does.
 */
export function contrastOverPixels(text, backgrounds, share = 0.1) {
  const ratios = [];
  for (let i = 0; i + 3 < backgrounds.length; i += 4) {
    const bg = { r: backgrounds[i], g: backgrounds[i + 1], b: backgrounds[i + 2], a: 1 };
    ratios.push(contrastRatio(over(text, bg), bg));
  }
  if (!ratios.length) return null;
  ratios.sort((x, y) => x - y);
  return ratios[Math.min(ratios.length - 1, Math.floor(ratios.length * share))];
}

// --- Names ---------------------------------------------------------------------------------------

/** A tree name as words: "tone1_lfo_shape" → "tone1 lfo shape", "filterCutoff" → "filter Cutoff". */
export function readableName(name) {
  return String(name ?? '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// CEditor's own type names (and "control", "component", "toggle", "switch" as people say them): a
// name that is one of these is the kind of thing, not what it is for.
const TYPE_WORDS = ['knob', 'slider', 'button', 'toggle', 'togglebutton', 'momentarybutton', 'combobox', 'number',
  'meter', 'label', 'switch', 'control', 'customcomponent', 'component', 'textinput'];
const TYPE_WORD = new RegExp(`^(${TYPE_WORDS.join('|')})$`, 'i');
const TYPE_AND_NUMBER = new RegExp(`^(${TYPE_WORDS.join('|')})[ _-]?\\d+$`, 'i');

/**
 * Whether a name says only what kind of thing the control is, or nothing at all: a type's own word
 * ("Knob", "Button", "Toggle"), a type and a number ("Knob_3", "knob3"), a long run of digits (the
 * timestamp a new control's name carries, "Knob_1794084620614"), or an index in front of the words
 * ("ctrlr_0_cutoff"). Words joined by underscores are not in it: "tone1_lfo_shape" is read
 * "tone1 lfo shape", which says what it is.
 */
export function sayslittle(name) {
  const text = String(name ?? '').trim();
  if (!text) return true;
  if (TYPE_WORD.test(text) || TYPE_AND_NUMBER.test(text)) return true;
  if (/\d{5,}/.test(text)) return true;
  if (/^[a-z]+[_-]\d+[_-]/i.test(text)) return true;
  if (/^(option \d+|enter text\u2026?)$/i.test(text)) return true;
  return false;
}

/** The caption each control has: a Label attached to it that prints its own words (Text.shows ''). */
export function captionsByOwner(controls) {
  const out = new Map();
  walkControls(controls ?? [], (control) => {
    const owner = attachedTo(control);
    if (!owner || control?._children?.Core?.controlType !== 'Label') return;
    if (labelShows(control) !== '') return;
    const words = String(control?._children?.Text?.content ?? '').trim();
    if (words && !out.has(owner)) out.set(owner, words);
  });
  return out;
}

const PRINTS_OWN_TEXT = new Set(['Button', 'MomentaryButton', 'ToggleButton']);

/**
 * What a screen reader calls the control, and where that came from:
 * 'authored' (Screen-reader text), 'caption', 'text' (a button's own) or 'name' (its tree name, readable).
 */
export function spokenName(control, captions = new Map()) {
  const core = control?._children?.Core ?? {};
  const authored = String(core.screenReaderText ?? '').trim();
  if (authored) return { name: authored, source: 'authored' };
  const caption = captions.get(String(core.id ?? ''));
  if (caption) return { name: caption, source: 'caption' };
  if (PRINTS_OWN_TEXT.has(String(core.controlType ?? ''))) {
    const own = String(control?._children?.Text?.content ?? '').trim();
    if (own) return { name: own, source: 'text' };
  }
  return { name: readableName(core.name) || String(core.controlType ?? 'Control'), source: 'name' };
}

/**
 * Whether the player makes this control something a screen reader stops on: it takes input
 * (a Behavior that is not display-only), or it is a component with something to press or turn.
 */
export function isOperable(control) {
  const children = control?._children ?? {};
  const type = String(children.Core?.controlType ?? '');
  if (type === 'CustomComponent') {
    const zones = Object.values(children.HitZones?._children ?? {}).filter((zone) => zone?.enabled !== false);
    const behaviors = Object.values(children.Behaviors?._children ?? {});
    return zones.length > 0 || behaviors.length > 0;
  }
  const behavior = children.Behavior;
  if (!behavior) return false;
  const flow = String(behavior.valueFlow ?? (behavior.readOnly === true ? 'display' : 'twoWay'));
  return flow !== 'display';
}

/**
 * The controls a screen reader would announce by a name that does not tell them apart, each
 * { id, controlName, type, spoken, source, reason, others }:
 *   'says little'  the name is only an id or a type ("Knob 9", a button still called "Button");
 *   'shared'       other controls are read the same ("FADER" on nine buttons): which is which is
 *                  what the listener cannot find out. `others` is how many.
 * Controls with Screen-reader text or a caption are only reported when they share it.
 */
export function nameFindings(controls) {
  const captions = captionsByOwner(controls);
  const operable = [];
  walkControls(controls ?? [], (control) => {
    if (!isOperable(control)) return;
    const core = control?._children?.Core ?? {};
    if (core.visible === false) return;
    operable.push({ control, core, spoken: spokenName(control, captions) });
  });
  const sharing = new Map();
  for (const entry of operable) {
    const key = entry.spoken.name.trim().toLowerCase();
    sharing.set(key, (sharing.get(key) ?? 0) + 1);
  }
  const findings = [];
  for (const { core, spoken } of operable) {
    const original = spoken.source === 'name' ? core.name : spoken.name;
    const weak = spoken.source !== 'authored' && spoken.source !== 'caption' && sayslittle(original);
    const others = (sharing.get(spoken.name.trim().toLowerCase()) ?? 1) - 1;
    if (!weak && others === 0) continue;
    findings.push({
      id: String(core.id ?? ''), controlName: String(core.name ?? ''), type: String(core.controlType ?? ''),
      spoken: spoken.name, source: spoken.source, reason: weak ? 'says little' : 'shared', others,
    });
  }
  return findings;
}
