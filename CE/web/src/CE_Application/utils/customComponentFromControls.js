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
 *   Knob, Slider       →  one part of kind `slidercontrol` carrying the knob itself, drawn by the
 *                         panel's own SliderFamilyRenderer through the panel's own state machine, and
 *                         dragged by the panel's own pointer maths (sliderControlPart.js). Its value
 *                         becomes a channel of the component; its device bindings move to that channel
 *                         on the placed copy; and the copy keeps the host parameter id the knob
 *                         exported under, so a DAW session's automation and saved values still find
 *                         it. What that pipeline does not draw — a background plate, a caption, an
 *                         icon or lamp, extra parts, a control form — is refused by name, and so is a
 *                         knob anything addresses: see valueReferences below.
 *
 * Buttons and everything else with a value are still refused. So are controls a script mentions — the
 * component cannot keep a name a script addresses — and controls inside containers.
 *
 * Every label's text is PUBLISHED as an editable property, so each placed copy can carry its own
 * legend: the same plate reads CUTOFF on one copy and RESONANCE on the next, and an update to the
 * plate keeps both (that is the "override" the linked-component update preserves).
 */
import { deepClone } from './deepClone.js';
import { flattenControl } from './customComponentSourceLink.js';
import { createBehaviorModule, createHitZone, createPartNode, createValueChannel } from './customComponentFactory.js';
import { shapeConfig, shapeNeedsRoundCap, shapePath, shapeStrokeDash, shapeTakesFill } from './shapePrimitives.js';
import { createControl } from '../models/componentTypes.js';
import { SECTION_DEFAULTS } from '../models/sectionDefaults.js';
import { resolveControlForSet } from '../models/controlSetFamilies.js';
import { getControlLayer, sortControlsForRender } from './controlOrder.js';
import { SLIDER_CONTROL_KIND, SLIDER_SEMANTIC_PARTS, sliderControlSnapshot } from './sliderControlPart.js';
import { anatomyForm } from '../models/controlAnatomy.js';
import { isDisplayOnly } from './displayMode.js';

export const ARTWORK_TYPES = ['Background', 'Image', 'Shape', 'Label'];
/** Controls with a value that convert: drawn by SliderFamilyRenderer, one value each. */
export const VALUE_TYPES = ['Knob', 'Slider'];

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
  // Only the one section: flattening the whole control per question was most of the time the plan
  // took on a panel of knobs, whose semantic parts are hundreds of leaves each.
  const only = { _children: { [section]: control?._children?.[section] } };
  for (const [path, value] of flattenControl(only)) {
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
 * Where anything on the panel addresses each of these knobs, as a readable place, by control id.
 *
 * A knob that becomes a channel of a component is no longer a control with that id or that name, so
 * everything that pointed at it would silently point at nothing. Two kinds of address:
 *
 *   by id    routes, meter / LCD / envelope sources, links… — every one of them stores the control's
 *            Core.id as a string, so the whole panel is searched for it, outside the controls being
 *            converted: one walk for all the knobs, instead of a list of fields that would go stale.
 *   by name  the places utils/controlNames.js rewrites when a name changes: a script's target, an LCD
 *            soft key's `press.set`, the GAIA feedback's `gridName`, a Setlist's capture paths and
 *            scene values. Script SOURCES are checked by scriptReference, for every control.
 *
 * Snapshots and the export list are keyed by host parameter id, which the conversion keeps, so they
 * are not references to refuse.
 */
function valueReferences(panel, valueControls, convertingIds) {
  const reasons = new Map();
  if (!valueControls.length) return reasons;
  const byId = new Map(valueControls.map((control) => [String(control._children.Core.id ?? ''), control]));
  const byName = new Map(valueControls.map((control) => [nameOf(control), control]));
  const note = (control, reason) => {
    const id = String(control._children.Core.id ?? '');
    if (!reasons.has(id)) reasons.set(id, reason);
  };
  const namedBy = (text) => {
    if (typeof text !== 'string') return null;
    return byName.get(text) ?? byName.get(text.split('.')[0]) ?? null;
  };

  // By id: one walk over everything outside the controls being converted.
  const walk = (node, where, path) => {
    if (node == null) return;
    if (typeof node === 'string') {
      const control = byId.get(node);
      if (control) note(control, `addressed by ${where}${path ? ` (${path})` : ''}`);
      return;
    }
    if (typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, where, `${path}[${index}]`));
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === '_type') continue;
      walk(value, where, key === '_children' ? path : (path ? `${path}.${key}` : key));
    }
  };
  const scripts = [...(panel?.scripts ?? [])];
  const walkControls = (controls) => {
    for (const other of controls ?? []) {
      const kids = other?._children ?? {};
      if (!convertingIds.has(String(kids.Core?.id ?? ''))) {
        const owner = nameOf(other);
        const { Children, Core, ...rest } = kids;
        walk(rest, owner, '');
        // By name: the places utils/controlNames.js rewrites when a name changes.
        scripts.push(...(kids.Scripts?.scripts ?? []));
        for (const layout of kids.Display?.layouts ?? []) {
          for (const zone of layout?.zones ?? []) {
            const control = namedBy(zone?.press?.set);
            if (control) note(control, `set by ${owner}'s soft key`);
          }
        }
        const grid = byName.get(kids.Designer?.deviceSyncFeedback?.gridName);
        if (grid) note(grid, `${owner}'s device feedback grid`);
        const setlist = kids.Setlist;
        for (const path of [...(setlist?.capturePaths ?? []), ...(setlist?.scenes ?? []).flatMap((scene) => Object.keys(scene?.values ?? {}))]) {
          const control = namedBy(path);
          if (control) note(control, `captured by ${owner}'s setlist`);
        }
      }
      walkControls(Object.values(kids.Children?._children ?? {}));
    }
  };
  const { controls, exportParameters, snapshots, ...panelRest } = panel ?? {};
  walk(panelRest, 'the panel', '');
  walkControls(controls);
  for (const script of scripts) {
    const control = byName.get(String(script?.target ?? ''));
    if (control) note(control, `the target of script "${script.name ?? script.id ?? 'untitled'}"`);
  }
  return reasons;
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

/**
 * Why this knob or slider cannot convert faithfully, or ''. The part draws exactly what CanvasControl
 * draws for it through SliderFamilyRenderer, so anything CanvasControl draws BESIDES that is refused,
 * and so is anything that would behave differently as one part of a larger control.
 */
function whyNotValueConvertible(control, resolved) {
  const kids = control._children;
  const core = kids.Core ?? {};
  const behavior = kids.Behavior ?? {};
  if (String(behavior.family ?? '') !== 'range' || String(behavior.role ?? '') !== 'slider') return 'not drawn as a slider';
  if (String(behavior.valueMode ?? 'single') !== 'single') return 'two handles (a range) — a component channel holds one value';
  const form = anatomyForm(core.controlType, core.controlForm);
  if (form) return `drawn in the "${form}" control form, which a part does not draw`;
  if (isDisplayOnly(behavior)) return 'read-only';
  if (core.enabled === false) return 'disabled';
  if (core.visible === false) return 'hidden';
  if (core.hostAutomation === false) return 'kept out of host automation';
  if (Number(kids.Transform?.rotation ?? 0)) return 'rotated';
  if (drawsBackground(resolved?._children?.Background)) return 'a background plate';
  if (String(resolved?._children?.Text?.content ?? '').trim()) return 'a caption';
  if (nonDefault(control, 'Icon').length) return 'an icon';
  if (nonDefault(control, 'ContentLayout').some((key) => key.startsWith('lamp'))) return 'a lamp';
  const extra = Object.entries(resolved?._children?.Parts?._children ?? {})
    .filter(([name, part]) => part?.visible !== false && !SLIDER_SEMANTIC_PARTS.has(name))
    .map(([name]) => name);
  if (extra.length) return `extra parts drawn over it (${extra.join(', ')})`;
  if ((kids.Scripts?.scripts ?? []).some((script) => String(script?.source ?? '').trim())) return 'a script of its own';
  if (kids.DeviceBindings?.enabled === false && (kids.DeviceBindings?.bindings ?? []).length) return 'device bindings switched off';
  const ports = (kids.DeviceBindings?.bindings ?? []).map((binding) => String(binding?.port ?? 'value')).filter((port) => port !== 'value');
  if (ports.length) return `a device binding on its ${ports[0]} port`;
  return '';
}

/** Why this control cannot convert faithfully, or '' when it can. */
export function whyNotConvertible(control, resolved, { measure = null } = {}) {
  const type = String(control?._children?.Core?.controlType ?? '');
  if (VALUE_TYPES.includes(type)) {
    const transform = control._children.Transform ?? {};
    if (String(transform.anchor ?? 'topLeft') !== 'topLeft') return 'anchored to a corner other than top-left';
    if (Number(transform.scale ?? 1) !== 1) return 'scaled';
    if (nonDefault(control, 'Effects').length) return 'effects (shadow, bevel, glow…)';
    return whyNotValueConvertible(control, resolved);
  }
  if (!ARTWORK_TYPES.includes(type)) {
    return `a ${type || 'control'} — only artwork (shapes, labels, images, backgrounds), knobs and sliders can become a component`;
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
  if (VALUE_TYPES.includes(type)) {
    // The knob itself, drawn by the panel's own renderer (sliderControlPart.js). Its value, hover and
    // press are written into meta.sliderControl by the bindings and states planComponentFromSelection
    // adds for it.
    return [createPartNode(uniquePartName(name, taken), {
      ...common,
      role: 'custom',
      kind: SLIDER_CONTROL_KIND,
      meta: { sliderControl: { control: sliderControlSnapshot(resolved), hover: false, pressed: false } },
    })];
  }
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

  const converting = new Set(wanted);
  const references = valueReferences(
    panel,
    wanted.map((id) => topLevel.get(id)?.control).filter((control) => VALUE_TYPES.includes(String(control?._children?.Core?.controlType ?? ''))),
    converting,
  );
  for (const id of wanted) {
    const entry = topLevel.get(id);
    if (!entry) {
      refused.push({ id, name: id, reason: 'inside a container — move it out, or select the container\'s contents' });
      continue;
    }
    const { control } = entry;
    const resolved = resolveControlForSet(control, set);
    const why = whyNotConvertible(control, resolved, { measure })
      || (scriptReference(scripts, control) ? `used by ${scriptReference(scripts, control)}` : '')
      || references.get(id)
      || '';
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
  const values = [];
  order.forEach(({ control, resolved, rect }, i) => {
    const local = { ...rect, x: rect.x - bounds.x, y: rect.y - bounds.y };
    for (const part of partsFor(control, resolved, local, (i + 1) * 10, taken)) {
      parts[part.name] = part;
      if (part.kind === SLIDER_CONTROL_KIND) values.push({ control, resolved, part, local, paintIndex: i });
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
  // None of the starter channels or behaviours a fresh component is given: artwork has no value, and
  // each knob brings exactly its own.
  const valueSections = knobSections(values, bounds);
  children.ValueChannels = { ...children.ValueChannels, _children: valueSections.channels };
  children.Behaviors = { ...children.Behaviors, _children: valueSections.behaviors };
  children.HitZones = { ...children.HitZones, _children: valueSections.hitZones };
  children.Bindings = { ...children.Bindings, _children: valueSections.bindings };
  children.States = { ...children.States, _children: valueSections.states };
  children.PublishedProperties = {
    ...children.PublishedProperties,
    inputs: valueSections.published,
    outputs: valueSections.published,
    editableProperties: published,
  };
  const firstChannel = Object.keys(valueSections.channels)[0] ?? '';
  children.Designer = { ...children.Designer, selectedLayer: Object.keys(parts)[0] ?? '', selectedValueChannel: firstChannel, selectedBehavior: firstChannel };

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
    // What the placed copy carries for each knob (see placeValueControls): its bindings, now on the
    // knob's channel, and the host parameter it exported as.
    values: valueSections.carried,
  };
}

/**
 * The channel, behaviour, hit zone, binding and two states one knob needs inside the component.
 *
 *   channel    the knob's value model: range, step, default, unit.
 *   behaviour  `slidercontrol`, naming the part: the drag is the panel knob's own (sliderControlPart.js).
 *   hit zone   the knob's box, in percent of the component, so it follows any zoom.
 *   binding    channel value → the part's meta.sliderControl.value, which the part renders from.
 *   states     hover, press and focus of THIS knob's zone → the part's hover / pressed / focused,
 *              which run the knob's own Hover, Pressed, Dragging and Focused states. A component's own
 *              hover and focus are the whole component's.
 */
function knobSections(values, bounds) {
  const out = { channels: {}, behaviors: {}, hitZones: {}, bindings: {}, states: {}, published: {}, carried: [] };
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  for (const { control, part, local, paintIndex } of values) {
    const behavior = control._children.Behavior ?? {};
    const channelName = part.name;
    const zoneName = `${channelName}Zone`;
    const min = Number.isFinite(Number(behavior.min)) ? Number(behavior.min) : 0;
    let max = Number.isFinite(Number(behavior.max)) ? Number(behavior.max) : 1;
    if (max <= min) max = min + 1;
    const rawDefault = Number(behavior.defaultCurrentValue ?? behavior.defaultValue);
    const defaultValue = Math.min(max, Math.max(min, Number.isFinite(rawDefault) ? rawDefault : min));
    const unit = String(behavior.unit ?? '').trim();
    out.channels[channelName] = createValueChannel(channelName, {
      label: nameOf(control),
      type: behavior.valueType === 'int' ? 'int' : 'float',
      min,
      max,
      step: Number(behavior.step) > 0 ? Number(behavior.step) : 0.01,
      defaultValue,
      // The host reads its unit from the suffix first (exportParameters.paramFromChannel).
      format: { suffix: unit, unit },
    });
    out.behaviors[channelName] = {
      ...createBehaviorModule(channelName, { type: SLIDER_CONTROL_KIND, valueChannel: channelName, role: 'custom' }),
      part: part.name,
    };
    out.hitZones[zoneName] = createHitZone(zoneName, {
      shape: 'rectangle',
      targetBehavior: channelName,
      targetValueChannel: channelName,
      action: 'dragValue',
      cursor: String(control._children.Mouse?.cursor ?? 'pointer'),
      bounds: {
        x: (local.x / width) * 100,
        y: (local.y / height) * 100,
        width: (local.width / width) * 100,
        height: (local.height / height) * 100,
        unit: 'percent',
      },
    });
    // The knob painted last is on top, so it takes the pointer where two overlap, as on the panel.
    out.hitZones[zoneName].priority = paintIndex;
    out.bindings[`${channelName}Value`] = {
      _type: 'Binding',
      name: `${channelName}Value`,
      enabled: true,
      source: `channel.${channelName}.raw`,
      mapMode: 'direct',
      target: `Parts.${part.name}.meta.sliderControl.value`,
    };
    out.states[`${channelName}Hover`] = {
      _type: 'State', name: `${channelName}Hover`, group: 'interaction', enabled: true,
      description: `The pointer is over ${nameOf(control)}.`,
      when: { hoveredCustomHitZone: zoneName },
      patches: { component: {}, parts: { [part.name]: { 'meta.sliderControl.hover': true } } },
    };
    out.states[`${channelName}Pressed`] = {
      _type: 'State', name: `${channelName}Pressed`, group: 'interaction', enabled: true,
      description: `${nameOf(control)} is being dragged.`,
      when: { activeCustomHitZone: zoneName, dragging: true },
      patches: { component: {}, parts: { [part.name]: { 'meta.sliderControl.pressed': true } } },
    };
    out.states[`${channelName}Focused`] = {
      _type: 'State', name: `${channelName}Focused`, group: 'interaction', enabled: true,
      description: `${nameOf(control)} has focus (sliderControlPart.js keeps each knob's focus apart).`,
      when: { focusedCustomHitZones: zoneName },
      patches: { component: {}, parts: { [part.name]: { 'meta.sliderControl.focused': true } } },
    };
    // The knob that stands for the component's DOM focus wears the preview's keyboard focus ring,
    // where the panel knob wore it (CanvasControl moves the ring off the component onto this part).
    out.states[`${channelName}DomFocus`] = {
      _type: 'State', name: `${channelName}DomFocus`, group: 'interaction', enabled: true,
      description: `${nameOf(control)} holds the keyboard focus.`,
      when: { domFocusCustomHitZone: zoneName },
      patches: { component: {}, parts: { [part.name]: { 'meta.sliderControl.domFocus': true } } },
    };
    out.published[channelName] = {
      channel: channelName, label: nameOf(control), type: out.channels[channelName].type, enabled: true, min, max, defaultValue,
    };
    const deviceBindings = control._children.DeviceBindings ?? {};
    out.carried.push({
      controlId: String(control._children.Core.id ?? ''),
      name: nameOf(control),
      channel: channelName,
      // Exactly what exportParameters.paramFromBehavior gave this knob.
      hostParameter: { id: `${nameOf(control)}.value`, label: nameOf(control) },
      bindings: deviceBindings.enabled === false
        ? []
        : (deviceBindings.bindings ?? []).map((binding) => ({ ...deepClone(binding), port: channelName })),
    });
  }
  return out;
}

/** One line per refusal, for the notification and the console. */
export function describeRefusals(refused) {
  return (refused ?? []).map((entry) => (entry.name ? `${entry.name}: ${entry.reason}` : entry.reason));
}
