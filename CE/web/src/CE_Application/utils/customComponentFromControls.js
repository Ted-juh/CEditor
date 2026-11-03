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
import { resolveControlFamily, resolveControlForSet } from '../models/controlSetFamilies.js';
import {
  buttonDeviceLayers, buttonDeviceLayersRefusal, knobChannelFormat, knobLayers, layerStatePatches, meterDeviceLayers, meterDeviceLayersRefusal,
  plainMeterLayers, plainMeterLayersRefusal, seedLayersAt, sliderLayers, valueLayersRefusal,
} from './valueControlLayers.js';
import { getControlLayer, sortControlsForRender } from './controlOrder.js';
import { SLIDER_CONTROL_KIND, SLIDER_SEMANTIC_PARTS, sliderControlSnapshot } from './sliderControlPart.js';
import { anatomyForm } from '../models/controlAnatomy.js';
import { buttonDeviceDrawn } from '../models/buttonDeviceParts.js';
import { meterDeviceDrawn } from '../models/meterDeviceParts.js';
import { isDisplayOnly } from './displayMode.js';
import { targetBuckets } from './interactionRuntime.js';

export const ARTWORK_TYPES = ['Background', 'Image', 'Shape', 'Label'];
/** Controls with a value that convert: drawn by SliderFamilyRenderer, one value each. */
export const VALUE_TYPES = ['Knob', 'Slider'];
/** Buttons and switches, which come in as layers (a plate and its text) when asked for layers. */
export const BUTTON_TYPES = ['Button', 'MomentaryButton', 'ToggleButton'];
/** Meters, which come in as layers when drawn with device parts. */
export const METER_TYPES = ['Meter'];

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

/**
 * Why this button cannot become layers that draw and behave as it does, or ''. It comes in as its
 * plate and its text, drawn as a label's are (the same text renderer), so a label's rules apply to
 * its text, against the button's own defaults and as its set draws it.
 */
function whyNotButtonLayers(control, resolved, measure) {
  const kids = control._children;
  const core = kids.Core ?? {};
  const behavior = resolved?._children?.Behavior ?? kids.Behavior ?? {};
  const transform = kids.Transform ?? {};
  if (String(transform.anchor ?? 'topLeft') !== 'topLeft') return 'anchored to a corner other than top-left';
  if (Number(transform.scale ?? 1) !== 1) return 'scaled';
  if (Number(transform.rotation ?? 0)) return 'rotated';
  if (nonDefault(control, 'Effects').length) return 'effects (shadow, bevel, glow…)';
  if (core.enabled === false) return 'disabled';
  if (core.visible === false) return 'hidden';
  const kind = String(behavior.buttonType ?? 'momentary');
  if (kind !== 'toggle' && kind !== 'momentary') return `a ${kind.replace(/_/g, '-')} button, which comes in as a toggle or a momentary button only`;
  if (behavior.repeating === true || behavior.pressToTalk === true || behavior.press_to_talk === true) return 'a repeating or press-to-talk button';
  const form = anatomyForm(core.controlType, resolved?._children?.Core?.controlForm ?? core.controlForm);
  if (form) return `drawn in the "${form}" control form, which is not made of parts`;
  // Drawn as a device, the control's own plate, text, icon and lamp are not drawn: its parts are.
  if (buttonDeviceDrawn(resolved)) return buttonDeviceLayersRefusal(resolved);
  if (nonDefault(resolved, 'Icon').length) return 'an icon';
  const lamp = String(resolved?._children?.ContentLayout?.lamp ?? 'none');
  if (lamp && lamp !== 'none') return 'a lamp';
  const layout = nonDefault(resolved, 'ContentLayout', (key) => LAYOUT_KEYS.has(key) || key.startsWith('lamp'));
  if (layout.length) return `the text layout setting ${layout[0]}`;
  const text = nonDefault(resolved, 'Text', (key) => TEXT_KEYS.has(key));
  if (text.length) return TEXT_LABELS[text[0]] ?? `the text setting ${text[0]}`;
  const justification = String(resolved?._children?.Text?._children?.Position?.justification ?? 'centred');
  if (!JUSTIFICATIONS.has(justification)) return `text aligned ${justification.replace(/([A-Z])/g, ' $1').toLowerCase()}`;
  const colour = String(resolved?._children?.Text?._children?.Fill?.colour ?? 'FFFFFFFF');
  if (/^[0-9a-f]{8}$/i.test(colour) && !/^ff/i.test(colour)) return 'semi-transparent text';
  if (String(resolved?._children?.Text?.content ?? '').includes('\n')) return 'text on more than one line';
  if (overflows(resolved, measure)) return 'text wider than its box — the panel wraps it, a component would not';
  if ((kids.Scripts?.scripts ?? []).some((script) => String(script?.source ?? '').trim())) return 'a script of its own';
  const ports = (kids.DeviceBindings?.bindings ?? []).map((binding) => String(binding?.port ?? 'value')).filter((port) => port !== 'value');
  if (ports.length) return `a device binding on its ${ports[0]} port`;
  return '';
}

/** Why this meter cannot become layers that draw as it does, or ''. */
function whyNotMeterLayers(control, resolved) {
  const kids = control._children;
  const core = kids.Core ?? {};
  const transform = kids.Transform ?? {};
  if (String(transform.anchor ?? 'topLeft') !== 'topLeft') return 'anchored to a corner other than top-left';
  if (Number(transform.scale ?? 1) !== 1) return 'scaled';
  if (Number(transform.rotation ?? 0)) return 'rotated';
  if (nonDefault(control, 'Effects').length) return 'effects (shadow, bevel, glow…)';
  if (core.visible === false) return 'hidden';
  const form = anatomyForm(core.controlType, resolved?._children?.Core?.controlForm ?? core.controlForm);
  if (form) return `drawn in the "${form}" control form, which is not made of parts`;
  if ((kids.Scripts?.scripts ?? []).some((script) => String(script?.source ?? '').trim())) return 'a script of its own';
  return meterDeviceDrawn(resolved) ? meterDeviceLayersRefusal(resolved) : plainMeterLayersRefusal(resolved);
}

/** Why this control cannot convert faithfully, or '' when it can. */
export function whyNotConvertible(control, resolved, { measure = null, layers = false } = {}) {
  const type = String(control?._children?.Core?.controlType ?? '');
  if (BUTTON_TYPES.includes(type)) {
    if (!layers) return `a ${type} — as one exact part only artwork, knobs and sliders convert; ask for layers`;
    return whyNotButtonLayers(control, resolved, measure);
  }
  if (METER_TYPES.includes(type)) {
    if (!layers) return `a ${type} — as one exact part only artwork, knobs and sliders convert; ask for layers`;
    return whyNotMeterLayers(control, resolved);
  }
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

/**
 * A label's (or a button's) text as a part over its CONTENT box — the box inset by the layout padding,
 * which is what the label renderer centres (or left/right-aligns) the glyphs in. The part renderer
 * insets its text 8px either side, so the text part is widened by that much: the centre stays put,
 * and text clips where the label's would. `styled` gives the text section (with colour roles kept).
 */
function labelTextPart(name, resolved, styled, rect, transform, common) {
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
  const text = deepClone(styled?._children?.Text ?? resolved._children.Text);
  // Rotation turns the whole label about ITS centre; the text part must turn about the same point.
  const textLayout = pxLayout(textBox, transform);
  if (textLayout.rotation) {
    textLayout.pivotX = ((rect.x + rect.width / 2 - textBox.x) / textBox.width) * 100;
    textLayout.pivotY = ((rect.y + rect.height / 2 - textBox.y) / textBox.height) * 100;
  }
  return createPartNode(name, { ...common, role: 'label', kind: 'rectangle', layout: textLayout, sections: { Text: text } });
}

function partsFor(control, resolved, rect, zIndex, taken, { styled = resolved, asLayers = false } = {}) {
  const type = control._children.Core.controlType;
  const transform = control._children.Transform ?? {};
  const common = {
    zIndex,
    opacity: Number.isFinite(Number(transform.opacity)) ? Number(transform.opacity) : 1,
    visible: control._children.Core.visible !== false,
    layout: pxLayout(rect, transform),
  };
  const name = nameOf(control);
  if (METER_TYPES.includes(type)) {
    // A meter drawn with device parts: a layer per part, moving with the reading; no grab areas.
    const channel = uniquePartName(name, taken);
    const built = (meterDeviceDrawn(resolved) ? meterDeviceLayers : plainMeterLayers)({
      resolved, styled, rect, channel, prefix: channel, zIndex,
      uniqueName: (wanted) => uniquePartName(wanted, taken),
    });
    const cfg = resolved?._children?.Meter ?? {};
    const lo = Number(cfg.valueMin ?? 0);
    const hi = Number(cfg.valueMax ?? 1);
    const value = Number(cfg.value ?? lo);
    seedLayersAt(built.parts, built.bindings, hi > lo ? Math.max(0, Math.min(1, (value - lo) / (hi - lo))) : 0);
    for (const part of built.parts) part.opacity = Number(part.opacity ?? 1) * common.opacity;
    return Object.assign(built.parts, { metered: { channel, ...built } });
  }
  if (BUTTON_TYPES.includes(type) && buttonDeviceDrawn(resolved)) {
    // A button or switch drawn as a device: a layer per part, the caption as text.
    const channel = uniquePartName(name, taken);
    const toggle = String(resolved?._children?.Behavior?.buttonType ?? 'momentary') === 'toggle';
    const caption = String(resolved._children.Text?.content ?? '');
    const built = buttonDeviceLayers({
      resolved, styled, rect, channel, prefix: channel, zIndex,
      uniqueName: (wanted) => uniquePartName(wanted, taken),
      caption, captionText: caption.trim() || (toggle ? 'SWITCH' : 'PRESS'),
    });
    for (const part of built.parts) part.opacity = Number(part.opacity ?? 1) * common.opacity;
    const captionLayer = built.partNames.caption?.[0] ?? '';
    return Object.assign(built.parts, { buttoned: { channel, plate: '', text: captionLayer, device: built } });
  }
  if (BUTTON_TYPES.includes(type)) {
    // A button as layers: its plate and its text, drawn as a label's are, in the set's colour roles.
    const channel = uniquePartName(name, taken);
    const plate = drawsBackground(resolved._children.Background)
      ? createPartNode(uniquePartName(`${channel}_plate`, taken), {
        ...common, role: 'background', kind: 'rectangle', sections: { Background: deepClone(styled?._children?.Background ?? resolved._children.Background) },
      })
      : null;
    const textPart = String(resolved._children.Text?.content ?? '').trim()
      ? labelTextPart(uniquePartName(`${channel}_text`, taken), resolved, styled, rect, transform, { ...common, zIndex: zIndex + 1 })
      : null;
    const built = [plate, textPart].filter(Boolean);
    return Object.assign(built, { buttoned: { channel, plate: plate?.name ?? '', text: textPart?.name ?? '' } });
  }
  if (VALUE_TYPES.includes(type) && asLayers) {
    // Layers the designer edits (utils/valueControlLayers.js): one per part of the knob, wired to its
    // value. The channel is named as the one exact part would have been.
    const channel = uniquePartName(name, taken);
    const circular = String(resolved?._children?.Behavior?.geometry ?? (type === 'Knob' ? 'circular' : 'linear')) === 'circular';
    const built = (circular ? knobLayers : sliderLayers)({
      resolved, styled, rect, channel, prefix: channel, zIndex,
      uniqueName: (wanted) => uniquePartName(wanted, taken),
    });
    // Standing at the knob's value, as the panel drew it: the designer draws what is authored.
    const behavior = resolved?._children?.Behavior ?? {};
    const min = Number(behavior.min ?? 0);
    const max = Number(behavior.max ?? 1);
    const value = Number(behavior.defaultCurrentValue ?? behavior.defaultValue ?? min);
    const travel = max > min && Number.isFinite(value) ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;
    seedLayersAt(built.parts, built.bindings, travel);
    for (const part of built.parts) part.opacity = Number(part.opacity ?? 1) * common.opacity;
    return Object.assign(built.parts, { layered: { channel, ...built } });
  }
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
      // Named `<name>_background`: an author reads the layer list, and "plate" is this file's word.
      parts.push(createPartNode(uniquePartName(`${name}_background`, taken), {
        ...common, role: 'background', kind: 'rectangle', sections: { Background: deepClone(resolved._children.Background) },
      }));
    }
    parts.push(labelTextPart(uniquePartName(name, taken), resolved, resolved, rect, transform, { ...common, zIndex: zIndex + 1 }));
    return parts;
  }
  if (type === 'Shape') {
    const parts = [];
    if (drawsBackground(resolved._children.Background)) {
      parts.push(createPartNode(uniquePartName(`${name}_background`, taken), {
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
export function planComponentFromSelection(panel, ids, { set = null, name = 'Artwork', measure = null, valueControlsAs = 'part' } = {}) {
  const controls = panel?.controls ?? [];
  const topLevel = new Map(controls.map((control, index) => [String(control?._children?.Core?.id ?? ''), { control, index }]));
  const wanted = [...new Set([...(ids ?? [])].map(String))];
  const refused = [];
  const scripts = panelScripts(panel);
  const chosen = [];

  const converting = new Set(wanted);
  const valueTypes = valueControlsAs === 'layers' ? [...VALUE_TYPES, ...BUTTON_TYPES, ...METER_TYPES] : VALUE_TYPES;
  const references = valueReferences(
    panel,
    wanted.map((id) => topLevel.get(id)?.control).filter((control) => valueTypes.includes(String(control?._children?.Core?.controlType ?? ''))),
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
    const why = whyNotConvertible(control, resolved, { measure, layers: valueControlsAs === 'layers' })
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
  // Knobs asked for as layers that a layer cannot draw yet, and come in as one exact part.
  const asParts = [];
  order.forEach(({ control, resolved, rect }, i) => {
    const local = { ...rect, x: rect.x - bounds.x, y: rect.y - bounds.y };
    let asLayers = false;
    if (valueControlsAs === 'layers' && VALUE_TYPES.includes(String(control._children.Core.controlType))) {
      const why = valueLayersRefusal(resolved);
      if (why) asParts.push({ id: String(control._children.Core.id), name: nameOf(control), reason: why });
      else asLayers = true;
    }
    // Layers keep the set's colour roles as roles: the family applied, the tokens not resolved.
    const isButton = [...BUTTON_TYPES, ...METER_TYPES].includes(String(control._children.Core.controlType));
    const styled = asLayers || isButton ? resolveControlFamily(control, set, { document: panel?.controlSets ?? [] }) : resolved;
    // A knob's layers take ten depths each and more; the next control paints above all of them.
    const built = partsFor(control, resolved, local, (i + 1) * 1000, taken, { styled, asLayers });
    if (built.layered) values.push({ control, resolved, local, paintIndex: i, layered: built.layered });
    if (built.buttoned) values.push({ control, resolved, local, paintIndex: i, buttoned: built.buttoned });
    if (built.metered) values.push({ control, resolved, local, paintIndex: i, metered: built.metered });
    for (const part of built) {
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
  const valueSections = knobSections(values, bounds, parts);
  children.ValueChannels = { ...children.ValueChannels, _children: valueSections.channels };
  children.Behaviors = { ...children.Behaviors, _children: valueSections.behaviors };
  children.HitZones = { ...children.HitZones, _children: valueSections.hitZones };
  children.Bindings = { ...children.Bindings, _children: valueSections.bindings };
  children.States = { ...children.States, _children: valueSections.states };
  if (Object.keys(valueSections.animations).length) {
    children.Animations = { ...children.Animations, _children: { ...(children.Animations?._children ?? {}), ...valueSections.animations } };
  }
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
    // Knobs asked for as layers that came in as one exact part, and why.
    asParts,
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
function knobSections(values, bounds, allParts = {}) {
  const out = { channels: {}, behaviors: {}, hitZones: {}, bindings: {}, states: {}, animations: {}, published: {}, carried: [] };
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  for (const entry of values) {
    if (entry.buttoned) {
      buttonSections(out, entry, width, height, allParts);
      continue;
    }
    if (entry.metered) {
      meterSections(out, entry);
      continue;
    }
    const { control, resolved, part, local, paintIndex, layered } = entry;
    const behavior = control._children.Behavior ?? {};
    const channelName = layered ? layered.channel : part.name;
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
      // The host reads its unit from the suffix first (exportParameters.paramFromChannel). As layers
      // the channel's display IS the readout, so it is formatted as the knob's readout was.
      format: layered ? knobChannelFormat(resolved?._children?.Behavior ?? behavior) : { suffix: unit, unit },
    });
    out.behaviors[channelName] = layered ? {
      ...createBehaviorModule(channelName, {
        type: 'slider', role: 'slider', valueChannel: channelName, geometry: layered.behavior.geometry,
        dragMode: layered.behavior.dragMode === 'relative' ? 'relative' : 'auto',
        interaction: { wheel: behavior.wheelEnabled !== false },
        // A slider that runs right to left, or top to bottom.
        reverseMouseDirection: layered.behavior.reversed === true,
      }),
      ...(layered.behavior.geometry === 'circular' ? {
        startAngle: layered.behavior.startAngle,
        sweepAngle: layered.behavior.sweepAngle,
        direction: layered.behavior.direction,
        centerX: layered.behavior.centerX,
        centerY: layered.behavior.centerY,
      } : {}),
    } : {
      ...createBehaviorModule(channelName, { type: SLIDER_CONTROL_KIND, valueChannel: channelName, role: 'custom' }),
      part: part.name,
    };
    out.hitZones[zoneName] = createHitZone(zoneName, {
      shape: 'rectangle',
      targetBehavior: channelName,
      targetValueChannel: channelName,
      action: 'dragValue',
      cursor: String(control._children.Mouse?.cursor ?? 'pointer'),
      // A slider as layers is dragged along its track: the zone is the track's length, so a point
      // on it maps to the value the panel's slider gives there.
      bounds: (() => {
        const zone = layered?.behavior?.zone;
        const box = zone ? { x: local.x + zone.x, y: local.y + zone.y, width: zone.width, height: zone.height } : local;
        return {
          x: (box.x / width) * 100,
          y: (box.y / height) * 100,
          width: (Math.max(1, box.width) / width) * 100,
          height: (Math.max(1, box.height) / height) * 100,
          unit: 'percent',
        };
      })(),
    });
    // The knob painted last is on top, so it takes the pointer where two overlap, as on the panel.
    out.hitZones[zoneName].priority = paintIndex;
    if (layered) {
      // The knob as layers: its bindings, and its interaction states written to the layers its parts
      // became, when THIS knob's grab area is hovered, dragged or focused.
      Object.assign(out.bindings, layered.bindings);
      const glide = valueGlideAnimation(resolved, channelName, layered.bindings);
      if (glide) out.animations[glide.name] = glide;
      const states = resolved?._children?.States?._children ?? {};
      const when = {
        Hover: { hoveredCustomHitZone: zoneName },
        Pressed: { activeCustomHitZone: zoneName, dragging: true },
        Dragging: { activeCustomHitZone: zoneName, dragging: true },
        ActiveHandleCurrent: { activeCustomHitZone: zoneName, dragging: true },
        Focused: { focusedCustomHitZones: zoneName },
      };
      for (const [stateName, condition] of Object.entries(when)) {
        const state = states[stateName];
        if (!state || state.enabled === false) continue;
        const patches = layerStatePatches(state.patches?.parts, layered.partNames, allParts);
        if (!Object.keys(patches).length) continue;
        out.states[`${channelName}${stateName}`] = {
          _type: 'State', name: `${channelName}${stateName}`, group: 'interaction', enabled: true,
          description: `${nameOf(control)}: its ${stateName.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()} look.`,
          when: condition,
          patches: { component: {}, parts: patches },
        };
      }
    }
    if (!layered) {
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
    }
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

/**
 * A button as layers: a bool channel; a toggle flips it on a click, a momentary button holds it on
 * while pressed (the `momentaryValue` action). Its looks, which the button's States write to the
 * whole control, are written to its plate and text when THIS button is hovered, focused, pressed (a
 * momentary button, by its value) or on (a toggle).
 */
function buttonSections(out, { control, resolved, local, paintIndex, buttoned }, width, height, allParts) {
  const behavior = resolved?._children?.Behavior ?? control._children.Behavior ?? {};
  const channelName = buttoned.channel;
  const zoneName = `${channelName}Zone`;
  const toggle = String(behavior.buttonType ?? 'momentary') === 'toggle';
  out.channels[channelName] = createValueChannel(channelName, {
    label: nameOf(control), type: 'bool', min: 0, max: 1, step: 1,
    defaultValue: toggle && (behavior.defaultValue === true || behavior.defaultCurrentValue === true),
  });
  out.behaviors[channelName] = createBehaviorModule(channelName, {
    type: toggle ? 'toggle' : 'button', role: 'button', valueChannel: channelName, geometry: 'none',
    interaction: { wheel: false },
  });
  out.hitZones[zoneName] = createHitZone(zoneName, {
    shape: 'rectangle', targetBehavior: channelName, targetValueChannel: channelName,
    action: toggle ? 'toggleValue' : 'momentaryValue',
    cursor: String(control._children.Mouse?.cursor ?? 'pointer'),
    bounds: { x: (local.x / width) * 100, y: (local.y / height) * 100, width: (local.width / width) * 100, height: (local.height / height) * 100, unit: 'percent' },
  });
  out.hitZones[zoneName].priority = paintIndex;
  // The button's own look changes, from the whole control onto its two layers.
  const onLayers = (patch) => {
    const parts = {};
    for (const [path, value] of Object.entries(patch ?? {})) {
      const layer = path.startsWith('Background.') ? buttoned.plate : (path.startsWith('Text.') ? buttoned.text : '');
      if (!layer || !allParts[layer]) continue;
      (parts[layer] ??= {})[path] = deepClone(value);
    }
    return parts;
  };
  const on = `${channelName} == true`;
  const conditions = {
    Hover: { when: { hoveredCustomHitZone: zoneName } },
    Focused: { when: { focusedCustomHitZones: zoneName } },
    Pressed: toggle ? null : { rule: on },
    Selected: toggle ? { rule: on } : null,
  };
  // Drawn as a device: pressed or on, its parts move (bindings) and light up (a state).
  if (buttoned.device) {
    Object.assign(out.bindings, buttoned.device.bindings);
    if (Object.keys(buttoned.device.onPatches).length) {
      out.states[`${channelName}On`] = {
        _type: 'State', name: `${channelName}On`, group: 'interaction', enabled: true,
        description: `${nameOf(control)}: ${toggle ? 'on' : 'pressed'}, its parts lit.`,
        when: {}, rule: on, patches: { component: {}, parts: deepClone(buttoned.device.onPatches) },
      };
    }
  }
  for (const [stateName, state] of Object.entries(resolved?._children?.States?._children ?? {})) {
    const condition = conditions[stateName];
    if (!condition || !state || state.enabled === false) continue;
    const parts = onLayers(state.patches?.component);
    if (!Object.keys(parts).length) continue;
    out.states[`${channelName}${stateName}`] = {
      _type: 'State', name: `${channelName}${stateName}`, group: 'interaction', enabled: true,
      description: `${nameOf(control)}: its ${stateName.toLowerCase()} look.`,
      when: condition.when ?? {},
      ...(condition.rule ? { rule: condition.rule } : {}),
      patches: { component: {}, parts },
    };
  }
  out.published[channelName] = { channel: channelName, label: nameOf(control), type: 'bool', enabled: true, min: 0, max: 1, defaultValue: out.channels[channelName].defaultValue };
  const deviceBindings = control._children.DeviceBindings ?? {};
  out.carried.push({
    controlId: String(control._children.Core.id ?? ''),
    name: nameOf(control),
    channel: channelName,
    hostParameter: { id: `${nameOf(control)}.value`, label: nameOf(control) },
    bindings: deviceBindings.enabled === false
      ? []
      : (deviceBindings.bindings ?? []).map((binding) => ({ ...deepClone(binding), port: channelName })),
  });
}

/**
 * The knob's value glide, carried to its layers: when its value changes other than by a drag, its
 * pointer and arc ease to it (a Knob or Slider ships one, `pointerSlide`, 140 ms; the set or the
 * author may change it). The layers went straight to the value. Now the same timing is an animation
 * on the channel, over every layer property a binding of this knob moves that can ease: a turn or a
 * place, an opacity, a size, an arc's sweep (InteractivePartRenderer eases that in JS). The tracker
 * drops it while the knob is dragged, as it does the knob's own.
 */
function valueGlideAnimation(resolved, channelName, bindings) {
  const VALUE_SOURCES = ['value.normalized', 'value.current.normalized'];
  const animations = resolved?._children?.Animations;
  if (animations?.enabled === false) return null;
  const glide = Object.values(animations?._children ?? {}).find((animation) => animation?.enabled !== false
    && String(animation?.kind ?? 'transition') === 'transition'
    && String(animation?.trigger?.type ?? '') === 'valueChange'
    && VALUE_SOURCES.includes(String(animation?.trigger?.source ?? 'value.normalized'))
    && Number(animation?.duration ?? 0) + Number(animation?.delay ?? 0) > 0);
  if (!glide) return null;
  const seen = new Set();
  const targets = [];
  for (const binding of Object.values(bindings ?? {})) {
    const path = String(binding?.target ?? '');
    if (!path.startsWith('Parts.') || seen.has(path)) continue;
    seen.add(path);
    if (targetBuckets({ path })?.buckets?.length) targets.push({ path, properties: [] });
  }
  if (!targets.length) return null;
  const name = `${channelName}Glide`;
  return {
    _type: 'Animation', name, enabled: true, kind: 'transition',
    trigger: { type: 'valueChange', source: `channel.${channelName}.normalized`, origin: glide.trigger?.origin ?? 'any' },
    targets,
    duration: Number(glide.duration ?? 140),
    delay: Number(glide.delay ?? 0),
    easing: deepClone(glide.easing ?? 'outCubic'),
  };
}

/**
 * A meter as layers: a channel over the meter's range, printed as its readout was, driving the layers'
 * bindings; no grab area, no behaviour, as a meter takes no input of its own. Its value arrives as a
 * knob's does: its device bindings, moved to the channel, and the host.
 */
function meterSections(out, { control, resolved, metered }) {
  const cfg = resolved?._children?.Meter ?? control._children.Meter ?? {};
  const channelName = metered.channel;
  const min = Number.isFinite(Number(cfg.valueMin)) ? Number(cfg.valueMin) : 0;
  let max = Number.isFinite(Number(cfg.valueMax)) ? Number(cfg.valueMax) : 1;
  if (max <= min) max = min + 1;
  const value = Math.min(max, Math.max(min, Number.isFinite(Number(cfg.value)) ? Number(cfg.value) : min));
  out.channels[channelName] = createValueChannel(channelName, {
    label: nameOf(control), type: 'float', min, max, step: 0, defaultValue: value,
    format: { precision: Math.max(0, Math.min(6, Math.round(Number(cfg.valuePrecision) || 0))), prefix: String(cfg.valuePrefix ?? ''), suffix: String(cfg.valueSuffix ?? ''), unit: '' },
    snap: { enabled: false },
  });
  Object.assign(out.bindings, metered.bindings);
  out.published[channelName] = { channel: channelName, label: nameOf(control), type: 'float', enabled: true, min, max, defaultValue: value };
  const deviceBindings = control._children.DeviceBindings ?? {};
  out.carried.push({
    controlId: String(control._children.Core.id ?? ''),
    name: nameOf(control),
    channel: channelName,
    hostParameter: { id: `${nameOf(control)}.value`, label: nameOf(control) },
    bindings: deviceBindings.enabled === false
      ? []
      : (deviceBindings.bindings ?? []).map((binding) => ({ ...deepClone(binding), port: channelName })),
  });
}

/** One line per refusal, for the notification and the console. */
export function describeRefusals(refused) {
  return (refused ?? []).map((entry) => (entry.name ? `${entry.name}: ${entry.reason}` : entry.reason));
}
