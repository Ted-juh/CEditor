/**
 * customComponentFromControls.js — a selection of panel artwork, turned into one reusable component.
 *
 * A panel repeats clusters of artwork — a plate with a legend, a scale, a logo block — and before this
 * the only way to reuse one was copy and paste, which makes copies that never hear about each other.
 * This turns the selection into a custom component, which the command then saves to the library and
 * places back as a LINKED copy (see customComponentSourceLink.js), so improving it once improves it
 * everywhere.
 *
 * FAITHFUL OR REFUSED. The copy has to look exactly like what was selected, or the command is a trap:
 * it replaces the selection. So each control either converts through a path that draws the same way,
 * or the whole command is refused with the control and the setting named:
 *
 *   Background, Image  →  a part carrying the control's own Background section. Parts draw it with
 *                         the same BackgroundRenderer the panel uses.
 *   Shape              →  the same SVG ShapeRenderer draws — built from the same shapePrimitives
 *                         functions — as an image part. Parts have polygon kinds of their own, but
 *                         they are drawn by other code, and "nearly the same star" is not the promise.
 *                         A non-empty Background under the shape becomes a part beneath it.
 *   Label              →  a part carrying its Background and Text. The part text renderer is simpler
 *                         than the label's, so a label converts only when every text setting it uses
 *                         is one that renderer draws the same way: content, colour (opaque), family,
 *                         size, weight, style and case. Anything else — letter spacing, an icon, a
 *                         non-default text layout, effects — is named and refused.
 *
 * Knobs, sliders, buttons and everything else with a value are refused in this step: their look is
 * drawn procedurally from their Behavior and has no part equivalent, and they carry bindings and
 * script references. So are controls a script mentions — the component cannot keep a name a script
 * addresses — and controls inside containers.
 *
 * Every label's text is PUBLISHED as an editable property, so each placed copy can carry its own
 * legend: the same plate reads CUTOFF on one copy and RESONANCE on the next, and an update to the
 * plate keeps both (that is the "override" the linked-component update preserves).
 */
import { deepClone } from './deepClone.js';
import { flattenControl } from './customComponentSourceLink.js';
import { createPartNode } from './customComponentFactory.js';
import { shapeConfig, shapeNeedsRoundCap, shapePath, shapeStrokeDash, shapeTakesFill } from './shapePrimitives.js';
import { createControl } from '../models/componentTypes.js';
import { SECTION_DEFAULTS } from '../models/sectionDefaults.js';
import { resolveControlForSet } from '../models/controlSetFamilies.js';
import { getControlLayer, sortControlsForRender } from './controlOrder.js';

export const ARTWORK_TYPES = ['Background', 'Image', 'Shape', 'Label'];

/** The Text leaves the part renderer draws exactly as a label does. Everything else must be default. */
const TEXT_KEYS = new Set([
  'content', 'Fill.colour', 'Font.family', 'Font.size', 'Font.weight', 'Font.weightValue', 'Font.style', 'Font.caseMode',
  'Font.letterSpacing', 'Font.wordSpacing', 'Position.justification', 'Position.offsetX', 'Position.offsetY',
  // A legacy field no renderer reads (weight is weight/weightValue); older panels carry it.
  'Font.bold',
  // How a label would wrap only shows when its text overflows, and overflow is measured and refused
  // on its own; text that fits draws on one line whatever the mode. SVG-imported labels say 'none'.
  'Multiline.wrapMode',
  // Only read by the label renderer when ContentLayout has no padding of its own, which it always has.
  'Position.paddingLeft', 'Position.paddingRight', 'Position.paddingTop', 'Position.paddingBottom',
]);

/**
 * The ContentLayout leaves that are pure geometry, and so become the text part's box. The rest of the
 * section positions an icon, which a convertible label does not have (the Icon check refuses one).
 */
const LAYOUT_KEYS = new Set([
  'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'textOffsetX', 'textOffsetY',
  'horizontalAlign', 'verticalAlign', 'gap', 'iconOffsetX', 'iconOffsetY', 'iconZIndex', 'textZIndex', 'textAboveIcon',
]);

/** Justifications the part renderer places the same way: vertically centred, left/centre/right. */
const JUSTIFICATIONS = new Set(['centred', 'left', 'right']);

const TEXT_LABELS = {
  'Font.letterSpacing': 'letter spacing',
  'Font.wordSpacing': 'word spacing',
  'Font.underline': 'underline',
  'Font.strikethrough': 'strikethrough',
  'Font.overline': 'overline',
  'Position.justification': 'text alignment',
  'Multiline.maxLines': 'multi-line text',
};

const DEFAULTS = new Map();
function defaultsFor(type) {
  if (!DEFAULTS.has(type)) DEFAULTS.set(type, createControl(type));
  return DEFAULTS.get(type);
}

function sectionLeaves(control, section) {
  const out = new Map();
  for (const [path, value] of flattenControl(control)) {
    if (path === section || path.startsWith(`${section}.`)) out.set(path.slice(section.length + 1), value);
  }
  return out;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Leaves of `section` that differ from the type's default, minus the ones `allowed` accepts. */
function nonDefault(control, section, allowed = () => false) {
  const mine = sectionLeaves(control, section);
  const base = sectionLeaves(defaultsFor(control._children.Core.controlType), section);
  const out = [];
  for (const key of new Set([...mine.keys(), ...base.keys()])) {
    if (allowed(key)) continue;
    if (!same(mine.get(key), base.get(key))) out.push(key);
  }
  return out;
}

function nameOf(control) {
  return String(control?._children?.Core?.name ?? control?._children?.Core?.id ?? 'control');
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Every script on the panel, with where it lives, for the reference check. */
function panelScripts(panel) {
  const out = [];
  for (const script of panel?.scripts ?? []) {
    if (typeof script?.source === 'string') out.push({ where: `panel script "${script.name ?? script.id ?? 'untitled'}"`, source: script.source });
  }
  const walk = (controls) => {
    for (const control of controls ?? []) {
      for (const script of control?._children?.Scripts?.scripts ?? []) {
        if (typeof script?.source === 'string') {
          out.push({ where: `${nameOf(control)}'s script "${script.name ?? script.id ?? 'untitled'}"`, source: script.source });
        }
      }
      walk(Object.values(control?._children?.Children?._children ?? {}));
    }
  };
  walk(panel?.controls);
  return out;
}

/** The first line of any script that names this control, as `where, line N`. */
function scriptReference(scripts, control) {
  const tokens = [nameOf(control), String(control._children.Core.id ?? '')].filter(Boolean);
  const pattern = new RegExp(`(^|[^A-Za-z0-9_$])(${tokens.map(escapeRegExp).join('|')})(?![A-Za-z0-9_$])`);
  for (const script of scripts) {
    const lines = script.source.split('\n');
    const index = lines.findIndex((line) => pattern.test(line));
    if (index >= 0) return `${script.where}, line ${index + 1}`;
  }
  return '';
}

/**
 * Whether a label's text overflows its content box. The panel wraps an overflowing label onto more
 * lines; the part renderer keeps one — so an overflowing label is a label that would change. Needs
 * real font metrics, so the caller passes `measure(text, font) → width in px` (a canvas in the app);
 * without one, overflow is not checked.
 */
function overflows(resolved, measure) {
  if (typeof measure !== 'function') return false;
  const text = resolved?._children?.Text ?? {};
  const font = text._children?.Font ?? {};
  const layout = resolved?._children?.ContentLayout ?? {};
  const transform = resolved?._children?.Transform ?? {};
  let content = String(text.content ?? '');
  const caseMode = String(font.caseMode ?? 'normal').toLowerCase();
  if (caseMode === 'uppercase') content = content.toUpperCase();
  if (caseMode === 'lowercase') content = content.toLowerCase();
  if (!content) return false;
  const available = (Number(transform.width) || 0) - (Number(layout.paddingLeft) || 0) - (Number(layout.paddingRight) || 0);
  const spacing = (Number(font.letterSpacing) || 0) * content.length + (Number(font.wordSpacing) || 0) * (content.split(' ').length - 1);
  return measure(content, font) + spacing > available - 1;
}

/** Why this control cannot convert faithfully, or '' when it can. */
export function whyNotConvertible(control, resolved, { measure = null } = {}) {
  const type = String(control?._children?.Core?.controlType ?? '');
  if (!ARTWORK_TYPES.includes(type)) {
    return `a ${type || 'control'} — only artwork (shapes, labels, images, backgrounds) can become a component in this step`;
  }
  const transform = control._children.Transform ?? {};
  if (String(transform.anchor ?? 'topLeft') !== 'topLeft') return 'anchored to a corner other than top-left';
  if (Number(transform.scale ?? 1) !== 1) return 'scaled';
  if (nonDefault(control, 'Effects').length) return 'effects (shadow, bevel, glow…)';
  if (type === 'Shape' && Number(control._children.Shape?.rotation ?? 0)) return 'a shape rotated inside its own box';
  if (type === 'Label') {
    if (nonDefault(control, 'Icon').length) return 'an icon';
    const layout = nonDefault(control, 'ContentLayout', (key) => LAYOUT_KEYS.has(key));
    if (layout.length) return layout[0].startsWith('lamp') ? 'a lamp' : `the text layout setting ${layout[0]}`;
    const text = nonDefault(control, 'Text', (key) => TEXT_KEYS.has(key));
    if (text.length) return TEXT_LABELS[text[0]] ?? `the text setting ${text[0]}`;
    const justification = String(control._children.Text?._children?.Position?.justification ?? 'centred');
    if (!JUSTIFICATIONS.has(justification)) return `text aligned ${justification.replace(/([A-Z])/g, ' $1').toLowerCase()}`;
    const colour = String(resolved?._children?.Text?._children?.Fill?.colour ?? 'FFFFFFFF');
    if (/^[0-9a-f]{8}$/i.test(colour) && !/^ff/i.test(colour)) return 'semi-transparent text';
    if (String(resolved?._children?.Text?.content ?? '').includes('\n')) return 'text on more than one line';
    if (overflows(resolved, measure)) return 'text wider than its box — the panel wraps it, a component would not';
  }
  return '';
}

// ---------------------------------------------------------------------------------------------------
// Parts

function pxLayout(rect, transform) {
  return {
    x: rect.x, y: rect.y, width: rect.width, height: rect.height,
    xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px',
    anchorX: 'left', anchorY: 'top', align: 'left',
    rotation: Number(transform?.rotation ?? 0) || 0,
  };
}

function svgColour(hex) {
  const s = String(hex ?? '').replace(/^#/, '').trim();
  if (/^[0-9a-fA-F]{8}$/.test(s)) {
    const a = Math.round((parseInt(s.slice(0, 2), 16) / 255) * 1000) / 1000;
    return `rgba(${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},${parseInt(s.slice(6, 8), 16)},${a})`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `rgba(${parseInt(s.slice(0, 2), 16)},${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},1)`;
  return 'none';
}

/** The SVG editor/ShapeRenderer.svelte draws for this shape at this size, as a standalone document. */
export function shapeSvg(control, width, height) {
  const cfg = shapeConfig(control);
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const stroked = cfg.strokeEnabled !== false;
  const attrs = [
    `d="${shapePath(cfg, w, h)}"`,
    `fill="${shapeTakesFill(cfg) ? svgColour(cfg.fillColour) : 'none'}"`,
    `stroke="${stroked ? svgColour(cfg.strokeColour) : 'none'}"`,
    `stroke-width="${stroked ? Math.max(0, Number(cfg.strokeWidth) || 0) : 0}"`,
    `stroke-linecap="${shapeNeedsRoundCap(cfg) ? 'round' : (cfg.lineCap ?? 'butt')}"`,
    'stroke-linejoin="round"',
  ];
  const dash = shapeStrokeDash(cfg);
  if (dash) attrs.push(`stroke-dasharray="${dash}"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><path ${attrs.join(' ')}/></svg>`;
}

function svgDataUrl(svg) {
  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

/** Whether a Background section draws anything at all. */
function drawsBackground(background) {
  const fill = background?._children?.Fill ?? {};
  const border = background?._children?.Border ?? {};
  return fill.solidEnabled === true || fill.gradientEnabled === true || fill.imageEnabled === true
    || fill.textureEnabled === true || border.enabled === true;
}

function imageBackground(src) {
  const background = deepClone(SECTION_DEFAULTS.Background);
  const fill = background._children.Fill;
  fill.solidEnabled = false;
  fill.imageEnabled = true;
  fill.imageSrc = src;
  fill.imageFit = 'fill';
  fill.imageOpacity = 100;
  background._children.Border.enabled = false;
  background._children.Corners.radius = 0;
  return background;
}

function uniquePartName(wanted, taken) {
  const base = String(wanted).replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'part';
  let name = /^[0-9]/.test(base) ? `p_${base}` : base;
  for (let n = 2; taken.has(name); n += 1) name = `${base}_${n}`;
  taken.add(name);
  return name;
}

function partsFor(control, resolved, rect, zIndex, taken) {
  const type = control._children.Core.controlType;
  const transform = control._children.Transform ?? {};
  const common = {
    zIndex,
    opacity: Number.isFinite(Number(transform.opacity)) ? Number(transform.opacity) : 1,
    visible: control._children.Core.visible !== false,
    layout: pxLayout(rect, transform),
  };
  const name = nameOf(control);
  if (type === 'Label') {
    // Two parts: the label's own plate over the whole box, and its text over the CONTENT box — the box
    // inset by the layout padding, which is what the label renderer centres (or left/right-aligns)
    // the glyphs in. The part renderer insets its text 8px either side, so the text part is widened
    // by that much: the centre stays put, and text clips where the label's would.
    const parts = [];
    if (drawsBackground(resolved._children.Background)) {
      parts.push(createPartNode(uniquePartName(`${name}_plate`, taken), {
        ...common, role: 'background', kind: 'rectangle', sections: { Background: deepClone(resolved._children.Background) },
      }));
    }
    const layout = resolved._children.ContentLayout ?? {};
    const position = resolved._children.Text?._children?.Position ?? {};
    const pad = (key) => Number.isFinite(Number(layout[key])) ? Number(layout[key]) : 0;
    const offsetX = (Number(layout.textOffsetX) || 0) + (Number(position.offsetX) || 0);
    const offsetY = (Number(layout.textOffsetY) || 0) + (Number(position.offsetY) || 0);
    const textBox = {
      x: rect.x + pad('paddingLeft') - 8 + offsetX,
      y: rect.y + pad('paddingTop') + offsetY,
      width: Math.max(1, rect.width - pad('paddingLeft') - pad('paddingRight') + 16),
      height: Math.max(1, rect.height - pad('paddingTop') - pad('paddingBottom')),
    };
    const text = deepClone(resolved._children.Text);
    // Rotation turns the whole label about ITS centre; the text part must turn about the same point.
    const textLayout = pxLayout(textBox, transform);
    if (textLayout.rotation) {
      textLayout.pivotX = ((rect.x + rect.width / 2 - textBox.x) / textBox.width) * 100;
      textLayout.pivotY = ((rect.y + rect.height / 2 - textBox.y) / textBox.height) * 100;
    }
    parts.push(createPartNode(uniquePartName(name, taken), {
      ...common,
      zIndex: zIndex + 1,
      role: 'label',
      kind: 'rectangle',
      layout: textLayout,
      sections: { Text: text },
    }));
    return parts;
  }
  if (type === 'Shape') {
    const parts = [];
    if (drawsBackground(resolved._children.Background)) {
      parts.push(createPartNode(uniquePartName(`${name}_plate`, taken), {
        ...common, role: 'background', kind: 'rectangle', sections: { Background: deepClone(resolved._children.Background) },
      }));
    }
    parts.push(createPartNode(uniquePartName(name, taken), {
      ...common,
      zIndex: zIndex + 1,
      role: 'custom',
      kind: 'rectangle',
      sections: { Background: imageBackground(svgDataUrl(shapeSvg(resolved, rect.width, rect.height))) },
    }));
    return parts;
  }
  return [createPartNode(uniquePartName(name, taken), {
    ...common, role: type === 'Image' ? 'custom' : 'background', kind: 'rectangle',
    sections: { Background: deepClone(resolved._children.Background) },
  })];
}

// ---------------------------------------------------------------------------------------------------
// The plan

/**
 * Plan the conversion of the selected controls on `panel`.
 *
 * `{ ok, refused: [{ id, name, reason }], rootIds, bounds, layer, component }` — `component` is the
 * finished CustomComponent control (not yet saved or placed); `bounds` is where the placed copy goes.
 */
export function planComponentFromSelection(panel, ids, { set = null, name = 'Artwork', measure = null } = {}) {
  const controls = panel?.controls ?? [];
  const topLevel = new Map(controls.map((control, index) => [String(control?._children?.Core?.id ?? ''), { control, index }]));
  const wanted = [...new Set([...(ids ?? [])].map(String))];
  const refused = [];
  const scripts = panelScripts(panel);
  const chosen = [];

  for (const id of wanted) {
    const entry = topLevel.get(id);
    if (!entry) {
      refused.push({ id, name: id, reason: 'inside a container — move it out, or select the container\'s contents' });
      continue;
    }
    const { control } = entry;
    const resolved = resolveControlForSet(control, set);
    const why = whyNotConvertible(control, resolved, { measure }) || (scriptReference(scripts, control) ? `used by ${scriptReference(scripts, control)}` : '');
    if (why) refused.push({ id, name: nameOf(control), reason: why });
    else chosen.push({ ...entry, resolved });
  }

  if (!wanted.length) return { ok: false, refused: [{ id: '', name: '', reason: 'nothing is selected' }] };
  const layers = new Set(chosen.map(({ control }) => String(control._children.Core.layer ?? 'Main')));
  if (layers.size > 1) refused.push({ id: '', name: 'the selection', reason: `spans ${layers.size} layers (${[...layers].join(', ')}) — a component paints on one` });
  if (refused.length) return { ok: false, refused };

  const rectOf = (control) => {
    const t = control._children.Transform ?? {};
    return { x: Number(t.x) || 0, y: Number(t.y) || 0, width: Math.max(1, Number(t.width) || 0), height: Math.max(1, Number(t.height) || 0) };
  };
  const rects = chosen.map(({ control }) => rectOf(control));
  const bounds = {
    x: Math.min(...rects.map((r) => r.x)),
    y: Math.min(...rects.map((r) => r.y)),
  };
  bounds.width = Math.max(...rects.map((r) => r.x + r.width)) - bounds.x;
  bounds.height = Math.max(...rects.map((r) => r.y + r.height)) - bounds.y;

  // One component paints at one depth. An unselected control painted BETWEEN two selected ones, and
  // overlapping them, is sandwiched — no single depth keeps it where it was, so it is refused, by name.
  // Between them but elsewhere on the panel is harmless, and allowed.
  const layerName = [...layers][0] ?? 'Main';
  const painted = sortControlsForRender(controls.filter((control) => getControlLayer(control) === layerName));
  const chosenIds = new Set(chosen.map(({ control }) => String(control._children.Core.id)));
  const positions = painted.map((control, index) => (chosenIds.has(String(control._children.Core.id)) ? index : -1)).filter((index) => index >= 0);
  const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  for (let i = Math.min(...positions) + 1; i < Math.max(...positions); i += 1) {
    const other = painted[i];
    if (chosenIds.has(String(other._children.Core.id)) || other._children.Core.visible === false) continue;
    if (!chosen.some(({ control }) => overlaps(rectOf(control), rectOf(other)))) continue;
    refused.push({
      id: String(other._children.Core.id),
      name: nameOf(other),
      reason: 'is painted between the selected controls and overlaps them, so no single component depth keeps it where it is — select it too, or move it',
    });
  }
  if (refused.length) return { ok: false, refused };

  // Paint order on the panel: zIndex, then document order. Parts keep it, one step apart.
  const order = chosen
    .map((entry, i) => ({ ...entry, rect: rects[i] }))
    .sort((a, b) => (Number(a.control._children.Core.zIndex) || 0) - (Number(b.control._children.Core.zIndex) || 0) || a.index - b.index);

  const taken = new Set();
  const parts = {};
  const published = {};
  order.forEach(({ control, resolved, rect }, i) => {
    const local = { ...rect, x: rect.x - bounds.x, y: rect.y - bounds.y };
    for (const part of partsFor(control, resolved, local, (i + 1) * 10, taken)) {
      parts[part.name] = part;
      if (part.role === 'label') {
        published[`${part.name}Text`] = {
          path: `Parts.${part.name}.Text.content`,
          label: `${nameOf(control)} text`,
          type: 'text',
          enabled: true,
          defaultValue: part._children.Text.content ?? '',
        };
      }
    }
  });

  const component = createControl('CustomComponent');
  const children = component._children;
  children.Core.name = String(name).trim() || 'Artwork';
  Object.assign(children.Transform, { x: 0, y: 0, width: Math.round(bounds.width), height: Math.round(bounds.height) });
  children.Parts = { _type: 'Parts', _children: parts };
  // Artwork has no value: none of the starter channels or behaviours a fresh component is given.
  children.ValueChannels = { ...children.ValueChannels, _children: {} };
  children.Behaviors = { ...children.Behaviors, _children: {} };
  children.PublishedProperties = { ...children.PublishedProperties, inputs: {}, outputs: {}, editableProperties: published };
  children.Designer = { ...children.Designer, selectedLayer: Object.keys(parts)[0] ?? '', selectedValueChannel: '', selectedBehavior: '' };

  return {
    ok: true,
    refused: [],
    rootIds: order.map(({ control }) => String(control._children.Core.id)),
    bounds: { x: Math.round(bounds.x), y: Math.round(bounds.y), width: Math.round(bounds.width), height: Math.round(bounds.height) },
    layer: layerName,
    // The copy paints where the lowest selected control did: its depth, and its place in the list.
    zIndex: Number(order[0].control._children.Core.zIndex) || 0,
    insertIndex: Math.min(...order.map(({ index }) => index)),
    component,
  };
}

/** One line per refusal, for the notification and the console. */
export function describeRefusals(refused) {
  return (refused ?? []).map((entry) => (entry.name ? `${entry.name}: ${entry.reason}` : entry.reason));
}
