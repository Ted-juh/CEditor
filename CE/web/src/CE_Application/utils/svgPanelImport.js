/**
 * svgPanelImport.js — a panel drawn in a vector editor, turned into a CEditor panel.
 *
 * Panel artwork is drawn in Inkscape, Illustrator or Affinity, not in a plugin editor, and the
 * repetitive part of turning that drawing into a panel is placing every control on the spot the
 * artwork already reserved for it. This does that placement from the drawing itself.
 *
 * THE CONVENTION, adapted from VCV Rack's `helper.py`, which has made thousands of module panels
 * this way:
 *
 *   - One layer (a `<g>`) is named `components` (also accepted: `controls`, `placeholders`,
 *     `ceditor`). Inkscape's layer name (`inkscape:label`), Illustrator's (`data-name` or `id`)
 *     and a plain `id` all count.
 *   - Every rectangle, circle and ellipse in that layer is one control, placed on its bounding box.
 *   - The object's NAME says what it is: `knob-cutoff`, `slider_volume`, `button play`, `led-clip`,
 *     `label-Filter Cutoff`, `display-main`. The keyword may come anywhere in the name; the rest
 *     becomes the control's name. Keywords are in ROLES below.
 *   - An object with no keyword falls back on its FILL colour, and then on its shape:
 *       red      a control — a circle is a knob, a long rectangle a slider, any other rectangle a button
 *       green    a button              blue     a label
 *       magenta  an LED                yellow   a display
 *     Red, magenta and yellow mean what they mean in Rack (parameter, light, custom widget); green and
 *     blue are Rack's jack colours, which a CEditor panel has no use for, so they are given the two
 *     roles that were left.
 *   - Everything outside that layer is the artwork, and becomes the panel's background image — with
 *     the placeholder layer cut out, so the coloured shapes are not painted under the controls.
 *
 * Nothing is dropped silently. A path, a line, text or a `<use>` inside the layer cannot be measured
 * reliably without a renderer, so it is reported with the reason and a fix (convert it to a rectangle
 * or circle); every inferred role says what it was inferred from, so a wrong guess is visible in the
 * report before it is visible on the panel.
 *
 * Pure: text in, plan out. `buildSvgImportControls` turns a plan into real controls, and the menu
 * command in stores/svgPanelImportActions.js puts them in a new panel.
 */
import { parseXml } from '../../../../../tools/ctrlr-import/xml.mjs';
import { createControl } from '../models/componentTypes.js';
import { sanitizeControlName } from './controlNames.js';

export const PLACEHOLDER_LAYER_NAMES = ['components', 'controls', 'placeholders', 'ceditor'];

/** Keyword → role. Checked against each word of an object's name, so order only breaks ties. */
const ROLES = [
  { role: 'knob', words: ['knob', 'pot', 'rotary', 'encoder', 'dial'] },
  { role: 'slider', words: ['slider', 'fader'] },
  { role: 'toggle', words: ['toggle', 'switch', 'latch'] },
  { role: 'button', words: ['button', 'btn', 'momentary', 'trigger', 'pad'] },
  { role: 'led', words: ['led', 'lamp', 'light', 'indicator'] },
  { role: 'label', words: ['label', 'text', 'caption', 'title', 'legend'] },
  { role: 'display', words: ['display', 'lcd', 'screen', 'readout'] },
  { role: 'meter', words: ['meter', 'vu'] },
  { role: 'menu', words: ['menu', 'combo', 'combobox', 'dropdown', 'select'] },
];

const CONTROL_TYPE = {
  knob: 'Knob',
  slider: 'Slider',
  toggle: 'ToggleButton',
  button: 'Button',
  led: 'ToggleButton',
  label: 'Label',
  display: 'LcdDisplay',
  meter: 'Meter',
  menu: 'Combobox',
};

const MEASURED = new Set(['rect', 'circle', 'ellipse']);
const UNMEASURED = new Set(['path', 'line', 'polyline', 'polygon', 'text', 'use', 'image']);

/** Inkscape and Illustrator name objects they created themselves like this; it is not a name. */
const AUTO_ID = /^(rect|circle|ellipse|path|g|layer|svg|text|tspan|use|image|line|polygon|polyline)[-_]?\d+(-\d+)?$/i;

const UNIT_PX = { px: 1, '': 1, mm: 96 / 25.4, cm: 96 / 2.54, in: 96, pt: 96 / 72, pc: 16 };

// ---------------------------------------------------------------------------------------------------
// Geometry

const IDENTITY = [1, 0, 0, 1, 0, 0];

function multiply(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function apply(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** An SVG `transform` attribute as one matrix. Unknown functions are ignored rather than guessed. */
export function parseTransform(value) {
  let matrix = IDENTITY;
  const pattern = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let match;
  while ((match = pattern.exec(String(value ?? '')))) {
    const n = match[2].split(/[\s,]+/).filter(Boolean).map(Number);
    if (n.some((v) => !Number.isFinite(v))) continue;
    let next = IDENTITY;
    const rad = (deg) => (deg * Math.PI) / 180;
    switch (match[1]) {
      case 'matrix': if (n.length === 6) next = n; break;
      case 'translate': next = [1, 0, 0, 1, n[0] ?? 0, n[1] ?? 0]; break;
      case 'scale': next = [n[0] ?? 1, 0, 0, n[1] ?? n[0] ?? 1, 0, 0]; break;
      case 'rotate': {
        const a = rad(n[0] ?? 0);
        const r = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
        next = n.length >= 3 ? multiply(multiply([1, 0, 0, 1, n[1], n[2]], r), [1, 0, 0, 1, -n[1], -n[2]]) : r;
        break;
      }
      case 'skewX': next = [1, 0, Math.tan(rad(n[0] ?? 0)), 1, 0, 0]; break;
      case 'skewY': next = [1, Math.tan(rad(n[0] ?? 0)), 0, 1, 0, 0]; break;
      default: break;
    }
    matrix = multiply(matrix, next);
  }
  return matrix;
}

/** `210mm` → pixels at 96 per inch. Percentages and junk give null. */
export function parseLength(value) {
  const match = String(value ?? '').trim().match(/^(-?[\d.]+(?:e[-+]?\d+)?)\s*(px|mm|cm|in|pt|pc)?$/i);
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return null;
  return number * UNIT_PX[(match[2] ?? '').toLowerCase()];
}

function num(node, name, fallback = 0) {
  const value = Number.parseFloat(node?.attributes?.[name]);
  return Number.isFinite(value) ? value : fallback;
}

/** The element's own box in its own user space, before any transform. */
function localBox(node) {
  switch (node.name) {
    case 'rect': return { x: num(node, 'x'), y: num(node, 'y'), width: num(node, 'width'), height: num(node, 'height') };
    case 'circle': {
      const r = num(node, 'r');
      return { x: num(node, 'cx') - r, y: num(node, 'cy') - r, width: 2 * r, height: 2 * r };
    }
    case 'ellipse': {
      const rx = num(node, 'rx');
      const ry = num(node, 'ry');
      return { x: num(node, 'cx') - rx, y: num(node, 'cy') - ry, width: 2 * rx, height: 2 * ry };
    }
    default: return null;
  }
}

/** A box through a matrix: the axis-aligned box of its four transformed corners. */
function transformBox(box, m) {
  const corners = [
    apply(m, box.x, box.y), apply(m, box.x + box.width, box.y),
    apply(m, box.x, box.y + box.height), apply(m, box.x + box.width, box.y + box.height),
  ];
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

/**
 * The document's size in pixels and the matrix from its user units to those pixels — `viewBox`,
 * `width`/`height` with units, and `preserveAspectRatio` (default xMidYMid meet, or none).
 */
export function documentFrame(svg) {
  const viewBox = String(svg?.attributes?.viewBox ?? '').trim().split(/[\s,]+/).map(Number);
  const hasViewBox = viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0;
  const [vx, vy, vw, vh] = hasViewBox ? viewBox : [0, 0, 0, 0];
  let width = parseLength(svg?.attributes?.width);
  let height = parseLength(svg?.attributes?.height);
  if (width == null && height == null && hasViewBox) { width = vw; height = vh; }
  if (width == null && hasViewBox) width = (height * vw) / vh;
  if (height == null && hasViewBox) height = (width * vh) / vw;
  if (!(width > 0) || !(height > 0)) return null;
  if (!hasViewBox) return { width, height, matrix: IDENTITY };

  const sx = width / vw;
  const sy = height / vh;
  if (/^\s*none\b/.test(String(svg.attributes.preserveAspectRatio ?? ''))) {
    return { width, height, matrix: [sx, 0, 0, sy, -vx * sx, -vy * sy] };
  }
  const s = Math.min(sx, sy);
  return { width, height, matrix: [s, 0, 0, s, (width - vw * s) / 2 - vx * s, (height - vh * s) / 2 - vy * s] };
}

// ---------------------------------------------------------------------------------------------------
// Names and colours

function childText(node, name) {
  const child = (node?.children ?? []).find((entry) => entry.name === name);
  return String(child?.text ?? '').trim();
}

/** What the author called this object, in the order the editors store it. Auto-ids are not names. */
export function objectName(node) {
  const attributes = node?.attributes ?? {};
  for (const candidate of [attributes['inkscape:label'], childText(node, 'title'), attributes['data-name'], attributes.id]) {
    const value = String(candidate ?? '').trim();
    if (value && !AUTO_ID.test(value)) return value;
  }
  return '';
}

function layerName(node) {
  const attributes = node?.attributes ?? {};
  return String(attributes['inkscape:label'] ?? attributes['data-name'] ?? attributes.id ?? '').trim().toLowerCase();
}

function styleValue(style, property) {
  const match = String(style ?? '').match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i'));
  return match ? match[1].trim() : '';
}

const NAMED = { red: 'ff0000', lime: '00ff00', green: '008000', blue: '0000ff', magenta: 'ff00ff', fuchsia: 'ff00ff', yellow: 'ffff00' };

/**
 * `.st1{fill:#FF0000;}` rules from the document's `<style>` blocks, as class → fill. Illustrator writes
 * its fills this way by default ("Style Elements"), so without it the colour convention would find
 * nothing in most Illustrator files. Only plain class selectors are read; this is not a CSS engine.
 */
export function classFills(root) {
  const fills = new Map();
  const visit = (node) => {
    if (node.name === 'style') {
      const rules = /([^{}]+)\{([^}]*)\}/g;
      let match;
      while ((match = rules.exec(node.text ?? ''))) {
        const fill = styleValue(match[2], 'fill');
        if (!fill) continue;
        for (const selector of match[1].split(',')) {
          const name = selector.trim().match(/^\.([A-Za-z0-9_-]+)$/);
          if (name) fills.set(name[1], fill);
        }
      }
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return fills;
}

/**
 * An object's fill as `rrggbb`, or '' — in CSS order: its `style`, then a class rule, then the `fill`
 * attribute, and failing all three whatever its group gave it.
 */
function fillOf(node, inherited = '', classes = new Map()) {
  const classFill = String(node?.attributes?.class ?? '').split(/\s+/).map((name) => classes.get(name)).filter(Boolean).pop();
  const raw = styleValue(node?.attributes?.style, 'fill') || classFill || String(node?.attributes?.fill ?? '').trim();
  if (!raw || raw === 'inherit') return inherited;
  const value = raw.toLowerCase();
  if (NAMED[value]) return NAMED[value];
  let match = value.match(/^#([0-9a-f]{6})$/);
  if (match) return match[1];
  match = value.match(/^#([0-9a-f]{3})$/);
  if (match) return match[1].split('').map((c) => c + c).join('');
  match = value.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (match) return match.slice(1, 4).map((v) => Math.min(255, Number(v)).toString(16).padStart(2, '0')).join('');
  return inherited;
}

/** A fill colour's meaning under the convention, or ''. Generous: a hand-picked "red" is rarely ff0000. */
export function colourRole(hex) {
  if (!/^[0-9a-f]{6}$/i.test(hex ?? '')) return '';
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  const high = (v) => v >= 180;
  const low = (v) => v <= 90;
  if (high(r) && low(g) && low(b)) return 'control';
  if (low(r) && high(g) && low(b)) return 'button';
  if (low(r) && low(g) && high(b)) return 'label';
  if (high(r) && low(g) && high(b)) return 'led';
  if (high(r) && high(g) && low(b)) return 'display';
  return '';
}

/** `knob-cutoff` → { role: 'knob', rest: ['cutoff'] }. The keyword may be any word. */
export function roleFromName(name) {
  const words = String(name ?? '').split(/[-_:\s.]+/).filter(Boolean);
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i].toLowerCase();
    const hit = ROLES.find((entry) => entry.words.includes(word));
    if (hit) return { role: hit.role, rest: [...words.slice(0, i), ...words.slice(i + 1)] };
  }
  return { role: '', rest: words };
}

// ---------------------------------------------------------------------------------------------------
// The plan

function findLayer(node) {
  for (const child of node?.children ?? []) {
    if (child.name === 'g' && PLACEHOLDER_LAYER_NAMES.includes(layerName(child))) return child;
    const deeper = findLayer(child);
    if (deeper) return deeper;
  }
  return null;
}

/** The chain of transforms from the root down to `target`, so a placeholder lands where it is drawn. */
function matrixTo(node, target, matrix = IDENTITY) {
  const own = multiply(matrix, parseTransform(node.attributes?.transform));
  if (node === target) return own;
  for (const child of node.children ?? []) {
    const found = matrixTo(child, target, own);
    if (found) return found;
  }
  return null;
}

function fillTo(node, target, classes, inherited = '') {
  const own = fillOf(node, inherited, classes);
  if (node === target) return own;
  for (const child of node.children ?? []) {
    const found = fillTo(child, target, classes, own);
    if (found !== null) return found;
  }
  return null;
}

function roleFor(node, box, name, fill) {
  const named = roleFromName(name);
  if (named.role) return { role: named.role, rest: named.rest, reason: `named "${name}"` };
  const byColour = colourRole(fill);
  const shape = node.name === 'rect' ? 'rectangle' : 'circle';
  if (byColour === 'control') {
    const long = Math.max(box.width, box.height) >= 2.2 * Math.max(1, Math.min(box.width, box.height));
    if (node.name !== 'rect') return { role: 'knob', rest: named.rest, reason: `red ${shape}` };
    return long
      ? { role: 'slider', rest: named.rest, reason: 'red long rectangle' }
      : { role: 'button', rest: named.rest, reason: 'red rectangle' };
  }
  if (byColour) return { role: byColour, rest: named.rest, reason: `${{ button: 'green', label: 'blue', led: 'magenta', display: 'yellow' }[byColour]} ${shape}` };
  return { role: '', rest: named.rest, reason: '' };
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function tagDescription(node) {
  const id = String(node.attributes?.id ?? '').trim();
  return id ? `<${node.name} id="${id}">` : `<${node.name}>`;
}

/**
 * Read an SVG and plan the panel. Never throws: a document it cannot use comes back `ok: false` with
 * an `error` that says what to change.
 *
 * `{ ok, width, height, background, placeholders, skipped, warnings }` — placeholders are
 * `{ role, type, name, text, x, y, width, height, orientation, reason, source }` in panel pixels.
 */
export function planSvgPanelImport(text) {
  let root;
  let source;
  try {
    source = String(text ?? '').replace(/^﻿/, '');
    root = parseXml(source, { offsets: true, doctypeSubset: 'skip' });
  } catch (error) {
    return { ok: false, error: `This is not a readable SVG file: ${error.message}` };
  }
  if (root.name !== 'svg') return { ok: false, error: `The file's root element is <${root.name}>, not <svg>.` };

  const frame = documentFrame(root);
  if (!frame) return { ok: false, error: 'The SVG has no usable size: give it a viewBox, or a width and height.' };

  const layer = findLayer(root);
  if (!layer) {
    return {
      ok: false,
      error: `No placeholder layer. Put the control placeholders in a layer named "${PLACEHOLDER_LAYER_NAMES[0]}" `
        + `(also accepted: ${PLACEHOLDER_LAYER_NAMES.slice(1).join(', ')}).`,
    };
  }

  const classes = classFills(root);
  const placeholders = [];
  const skipped = [];
  const walk = (node) => {
    for (const child of node.children ?? []) {
      if (MEASURED.has(child.name)) {
        const own = localBox(child);
        const matrix = multiply(frame.matrix, matrixTo(root, child));
        const box = transformBox(own, matrix);
        if (!(box.width > 0.5) || !(box.height > 0.5)) {
          skipped.push({ source: tagDescription(child), reason: 'has no size' });
          continue;
        }
        const name = objectName(child);
        const fill = fillTo(root, child, classes) ?? '';
        const found = roleFor(child, box, name, fill);
        if (!found.role) {
          skipped.push({
            source: name ? `"${name}"` : tagDescription(child),
            reason: 'says neither by name nor by colour what it is — name it like "knob-cutoff", or fill it with a convention colour',
          });
          continue;
        }
        placeholders.push({
          role: found.role,
          type: CONTROL_TYPE[found.role],
          name: found.rest.join('_'),
          text: found.rest.join(' '),
          x: round(box.x),
          y: round(box.y),
          width: round(box.width),
          height: round(box.height),
          orientation: found.role === 'slider' && box.height > box.width ? 'vertical' : 'horizontal',
          reason: found.reason,
          source: tagDescription(child),
          // What a later re-import matches this placeholder by: the author's name, else the element
          // id — even an editor's own `rect12`, which Inkscape keeps across saves. '' when neither
          // exists (unnamed Illustrator shapes); those are matched by where they were.
          key: name || String(child.attributes?.id ?? '').trim(),
        });
      } else if (UNMEASURED.has(child.name)) {
        const name = objectName(child);
        skipped.push({
          source: name ? `"${name}" (<${child.name}>)` : tagDescription(child),
          reason: `a <${child.name}> cannot be measured without drawing it — convert it to a rectangle or circle`,
        });
      } else {
        walk(child);
      }
    }
  };
  walk(layer);

  const warnings = [];
  if (!placeholders.length) warnings.push(`The "${layerName(layer)}" layer has no rectangles or circles to place.`);
  const outside = placeholders.filter((p) => p.x + p.width <= 0 || p.y + p.height <= 0 || p.x >= frame.width || p.y >= frame.height);
  if (outside.length) warnings.push(`${outside.length} placeholder(s) sit outside the page and will be off the panel.`);

  // The artwork is the document with the placeholder layer cut out — by span, so every byte of the
  // author's drawing reaches the panel as they wrote it.
  const artwork = source.slice(0, layer.start) + source.slice(layer.end);

  return {
    ok: true,
    width: Math.round(frame.width),
    height: Math.round(frame.height),
    layer: layerName(layer),
    background: { svg: artwork, dataUrl: svgDataUrl(artwork), bytes: artwork.length },
    placeholders,
    skipped,
    warnings,
  };
}

/** UTF-8 safe base64, in the browser and under node alike. */
export function svgDataUrl(svgText) {
  const bytes = new TextEncoder().encode(String(svgText ?? ''));
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

// ---------------------------------------------------------------------------------------------------
// Controls

const LED_COLOUR = 'FFE0443A';
const LED_OFF_COLOUR = 'FF3A1614';

/**
 * An LED: a display-only toggle that draws nothing but its lamp. The lamp (ContentLayout.lamp) glows
 * when the control is checked; display-only (Behavior.valueFlow) makes it refuse clicks, take its
 * state from feedback — a device binding on its `state` port lights it from the synth — and export
 * no host parameter, which an indicator should not have. The plate, the legend and every state that
 * would repaint the plate (hover, pressed, selected…) are removed, so lighting it lights only the lamp.
 */
function ledControl(overrides, placeholder) {
  const size = Math.max(4, Math.round(Math.min(placeholder.width, placeholder.height)));
  const control = createControl('ToggleButton', {
    ...overrides,
    Text: { content: '' },
    Background: { _children: { Fill: { colour: '00000000', solidEnabled: false }, Border: { enabled: false } } },
    ContentLayout: {
      lamp: 'led',
      lampSize: size,
      lampColour: LED_COLOUR,
      lampOffColour: LED_OFF_COLOUR,
      lampBezelColour: '66000000',
      paddingLeft: Math.max(0, Math.round((Math.round(placeholder.width) - size) / 2)),
    },
    Behavior: { valueFlow: 'display' },
  });
  control._children.States = { ...(control._children.States ?? {}), _children: {} };
  return control;
}

/**
 * Type that fits the box the author drew: at most ~62% of its height, and narrow enough for the words
 * at ~0.65em a character — generous, because the theme's label face is wider than Arial.
 */
function labelTypeSize(placeholder, text) {
  const byHeight = placeholder.height * 0.62;
  const byWidth = (placeholder.width - 4) / (Math.max(1, String(text).length) * 0.65);
  return Math.max(7, Math.min(48, Math.floor(Math.min(byHeight, byWidth))));
}

/**
 * A plan's placeholders as real controls, named uniquely (`cutoff`, `cutoff_2`, or `knob_1` when the
 * drawing gave no name).
 */
export function buildSvgImportControls(plan, existingNames = []) {
  const taken = new Set([...existingNames].map((name) => String(name).toLowerCase()));
  const counters = {};
  const unique = (wanted) => {
    let candidate = wanted;
    for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) candidate = `${wanted}_${n}`;
    taken.add(candidate.toLowerCase());
    return candidate;
  };

  return (plan?.placeholders ?? []).map((placeholder) => {
    let base = sanitizeControlName(placeholder.name).replace(/[^A-Za-z0-9_$]+/g, '_').replace(/^_+|_+$/g, '');
    if (!base) {
      counters[placeholder.role] = (counters[placeholder.role] ?? 0) + 1;
      base = `${placeholder.role}_${counters[placeholder.role]}`;
    }
    const name = unique(base);
    const overrides = {
      Core: { name },
      Transform: {
        x: Math.round(placeholder.x),
        y: Math.round(placeholder.y),
        width: Math.max(1, Math.round(placeholder.width)),
        height: Math.max(1, Math.round(placeholder.height)),
      },
    };
    switch (placeholder.role) {
      case 'slider':
        overrides.Behavior = { orientation: placeholder.orientation };
        break;
      case 'label':
        // The artwork is under it, so no plate of its own; and the box was drawn to fit the words,
        // so the type is sized to the box rather than the box to a default type size.
        overrides.Text = {
          content: placeholder.text || name,
          _children: {
            Font: { size: labelTypeSize(placeholder, placeholder.text || name) },
            Multiline: { wrapMode: 'none' },
          },
        };
        overrides.Background = { _children: { Fill: { colour: '00000000' }, Border: { enabled: false } } };
        overrides.ContentLayout = { paddingLeft: 2, paddingRight: 2, paddingTop: 0, paddingBottom: 0 };
        break;
      case 'button':
      case 'toggle':
        // Panel artwork prints its own legends. The placeholder's name identifies the control; it is
        // not a legend, and the default "Button" would sit on top of the real one.
        overrides.Text = { content: '' };
        break;
      case 'led':
        return ledControl(overrides, placeholder);
      default:
        break;
    }
    return createControl(placeholder.type, overrides);
  });
}

/** One line per thing the author should know, for the console and the notification. */
export function describeSvgImport(plan) {
  if (!plan?.ok) return [plan?.error ?? 'Import failed.'];
  const counts = {};
  for (const p of plan.placeholders) counts[p.role] = (counts[p.role] ?? 0) + 1;
  const lines = [
    `${plan.placeholders.length} control(s) from the "${plan.layer}" layer on a ${plan.width}×${plan.height} panel: `
      + (Object.entries(counts).map(([role, n]) => `${n} ${role}${n === 1 ? '' : 's'}`).join(', ') || 'none'),
  ];
  if (counts.led) lines.push(`${counts.led} LED(s) placed as display-only lamps — bind each one's "state" port to light it from the synth.`);
  for (const p of plan.placeholders.filter((entry) => !entry.reason.startsWith('named'))) {
    lines.push(`${p.source} → ${p.type} (from its ${p.reason})`);
  }
  for (const skip of plan.skipped) lines.push(`skipped ${skip.source}: ${skip.reason}`);
  lines.push(...plan.warnings);
  return lines;
}
