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
  batLampLayers, buttonDeviceLayers, buttonDeviceLayersRefusal, knobChannelFormat, knobLayers, layerStatePatches, meterDeviceLayers, meterDeviceLayersRefusal,
  plainMeterLayers, plainMeterLayersRefusal, readOnDecibelScale, seedLayersAt, sliderLayers, valueLayersRefusal,
} from './valueControlLayers.js';
import { getControlLayer, sortControlsForRender } from './controlOrder.js';
import { SLIDER_CONTROL_KIND, SLIDER_SEMANTIC_PARTS, sliderControlSnapshot } from './sliderControlPart.js';
import { anatomyForm } from '../models/controlAnatomy.js';
import { buttonDeviceDrawn } from '../models/buttonDeviceParts.js';
import { meterDeviceDrawn, meterNeedsPeak } from '../models/meterDeviceParts.js';
import { isDisplayOnly } from './displayMode.js';
import { targetBuckets } from './interactionRuntime.js';
import { surfaceShadows } from './surfaceEffects.js';
import { getSliderDefaultValues, getSliderMax, getSliderMin, getSliderValueMode } from './sliderBehavior.js';
import { formLayersRefusal, formPartsDiffer, withFormAsParts } from '../models/formAsParts.js';
import { DRAWN_KNOB_FORMS, knobFormDrawingLayers } from './formDrawingLayers.js';
import { drawnDeviceDirection, synthDeviceDrawingLayers } from './deviceDrawingLayers.js';
import { resolveContentBox } from '../editor/canvasControlContentBox.js';
import { iconPlacement } from '../editor/iconLook.js';

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
 * The ContentLayout leaves a layer draws as the canvas does: the paddings, offsets and gap that place
 * the text, and the mode, alignment, offsets and depths that place an icon beside it (iconLayer).
 */
const LAYOUT_KEYS = new Set([
  'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'textOffsetX', 'textOffsetY',
  'horizontalAlign', 'verticalAlign', 'gap', 'iconOffsetX', 'iconOffsetY', 'iconZIndex', 'textZIndex', 'textAboveIcon', 'mode',
]);

/**
 * The text settings a text layer draws as the panel's label does (InteractivePartRenderer's text): its
 * colour (alpha too), the nine placements, lines of its own at their line height, a baseline shift,
 * an underline, strikethrough or overline (their thickness, offset, colour, insets and layer), and a
 * soft shadow, a glow and an outline outside the glyphs.
 */
const DECORATIONS = ['underline', 'strikethrough', 'overline'];
function textKeyDrawn(key) {
  if (TEXT_KEYS.has(key)) return true;
  if (key === 'Font.baselineShift' || key === 'Multiline.lineHeight') return true;
  const [section, field] = key.split('.');
  if (section === 'Font') return DECORATIONS.some((kind) => field === kind || (field.startsWith(kind) && !field.endsWith('Gap')));
  if (section === 'Effects') return /^(shadow|glow)/.test(field) || (/^outline/.test(field) && !/^outlineDash/.test(field));
  return false;
}

/** Why a label's or a button's text would not draw as the panel's does as a text layer, or ''. */
function textRefusal(resolved, control, measure) {
  const text = nonDefault(control, 'Text', textKeyDrawn);
  if (text.length) return TEXT_LABELS[text[0]] ?? `the text setting ${text[0]}`;
  const section = resolved?._children?.Text?._children ?? {};
  const effects = section.Effects ?? {};
  if (effects.outlineEnabled === true && String(effects.outlinePlacement ?? 'outer') !== 'outer') return 'an outline inside the text';
  const font = section.Font ?? {};
  const justification = String(section.Position?.justification ?? 'centred');
  // A decoration runs across the text's whole width about its centre; the layer centres it.
  if (DECORATIONS.some((kind) => font[kind] === true) && !['centred', 'top', 'bottom'].includes(justification)) return 'an underline, strikethrough or overline on text that is not centred';
  if (DECORATIONS.some((kind) => font[kind] === true && Number(font[`${kind}Gap`]) > 0)) return 'an underline that leaves gaps round the letters';
  if (overflows(resolved, measure)) return 'text wider than its box — the panel wraps it, a component would not';
  return '';
}

const TEXT_LABELS = {
  'Font.underlineGap': 'an underline that leaves gaps round the letters',
  'Font.strikethroughGap': 'a strikethrough that leaves gaps round the letters',
  'Font.overlineGap': 'an overline that leaves gaps round the letters',
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
function whyNotValueConvertible(control, resolved, layers = false) {
  const kids = control._children;
  const core = kids.Core ?? {};
  const behavior = kids.Behavior ?? {};
  if (String(behavior.family ?? '') !== 'range' || String(behavior.role ?? '') !== 'slider') return 'not drawn as a slider';
  if (String(behavior.valueMode ?? 'single') !== 'single') {
    // As layers a range's handles are values of their own (valueControlLayers' valueHandles); one
    // exact part holds one value, so a range the layers cannot draw has nothing to fall back to.
    if (!layers) return 'two handles (a range) — as one exact part a component holds one value; ask for layers';
    const why = valueLayersRefusal(resolved);
    if (why) return why;
  }
  const form = anatomyForm(core.controlType, core.controlForm);
  // A base knob form comes in as its drawing, shape by shape (utils/formDrawingLayers.js). The
  // drawing shows one value.
  if (form && layers && core.controlType === 'Knob' && DRAWN_KNOB_FORMS.includes(form)) {
    if (String(behavior.valueMode ?? 'single') !== 'single') return `two handles drawn in the "${form}" control form, which shows one value`;
  } else if (form) return layers ? formLayersRefusal(core.controlType, form) : `drawn in the "${form}" control form, which a part does not draw`;
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
  // An anchor only places a control inside a container, and one in a container is refused; a turn
  // and a scale turn and scale its layers (turnControlLayers), and its effects go to its layers
  // (carryControlEffects).
  if (core.enabled === false) return 'disabled';
  if (core.visible === false) return 'hidden';
  const kind = String(behavior.buttonType ?? 'momentary');
  if (kind !== 'toggle' && kind !== 'momentary') return `a ${kind.replace(/_/g, '-')} button, which comes in as a toggle or a momentary button only`;
  if (behavior.repeating === true || behavior.pressToTalk === true || behavior.press_to_talk === true) return 'a repeating or press-to-talk button';
  const form = anatomyForm(core.controlType, resolved?._children?.Core?.controlForm ?? core.controlForm);
  // A synth set's form comes in as its drawing (deviceDrawingLayers.js), its caption with it.
  if (form && drawnDeviceDirection(core.controlType, form)) return scriptOrPortRefusal(kids);
  if (form) return formLayersRefusal(core.controlType, form);
  // Drawn as a device, the control's own plate, text, icon and lamp are not drawn: its parts are.
  if (buttonDeviceDrawn(resolved)) return buttonDeviceLayersRefusal(resolved);
  // An LED, a jewel or a lit window beside the legend is a layer (buttonLampLayer); a bat lever not yet.
  const lamp = String(resolved?._children?.ContentLayout?.lamp ?? 'none').toLowerCase();
  const layout = nonDefault(resolved, 'ContentLayout', (key) => LAYOUT_KEYS.has(key) || key.startsWith('lamp'));
  if (layout.length) return `the text layout setting ${layout[0]}`;
  const textWhy = textRefusal(resolved, resolved, measure);
  if (textWhy) return textWhy;
  if ((kids.Scripts?.scripts ?? []).some((script) => String(script?.source ?? '').trim())) return 'a script of its own';
  const ports = (kids.DeviceBindings?.bindings ?? []).map((binding) => String(binding?.port ?? 'value')).filter((port) => port !== 'value');
  if (ports.length) return `a device binding on its ${ports[0]} port`;
  return '';
}

/** A script of its own, or a device binding on a port other than its value (`ports`), by name; or ''. */
function scriptOrPortRefusal(kids, ports = true) {
  if ((kids.Scripts?.scripts ?? []).some((script) => String(script?.source ?? '').trim())) return 'a script of its own';
  const others = ports ? (kids.DeviceBindings?.bindings ?? []).map((binding) => String(binding?.port ?? 'value')).filter((port) => port !== 'value') : [];
  if (others.length) return `a device binding on its ${others[0]} port`;
  return '';
}

/** Why this meter cannot become layers that draw as it does, or ''. */
function whyNotMeterLayers(control, resolved) {
  const kids = control._children;
  const core = kids.Core ?? {};
  if (core.visible === false) return 'hidden';
  const form = anatomyForm(core.controlType, resolved?._children?.Core?.controlForm ?? core.controlForm);
  if (form && drawnDeviceDirection(core.controlType, form)) return scriptOrPortRefusal(kids, false);
  if (form) return formLayersRefusal(core.controlType, form);
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
    if (Number(transform.scale ?? 1) !== 1) return 'scaled';
    if (nonDefault(control, 'Effects').length) return 'effects (shadow, bevel, glow…)';
    return whyNotValueConvertible(control, resolved, layers);
  }
  if (!ARTWORK_TYPES.includes(type)) {
    return `a ${type || 'control'} — only artwork (shapes, labels, images, backgrounds), knobs and sliders can become a component`;
  }
  if (type === 'Shape' && Number(control._children.Shape?.rotation ?? 0)) return 'a shape rotated inside its own box';
  if (type === 'Label') {
    const layout = nonDefault(control, 'ContentLayout', (key) => LAYOUT_KEYS.has(key));
    if (layout.length) return layout[0].startsWith('lamp') ? 'a lamp' : `the text layout setting ${layout[0]}`;
    const textWhy = textRefusal(resolved, control, measure);
    if (textWhy) return textWhy;
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

/** A control's turn and scale, `{ rotation, scale }`, or null when it has neither. */
function turnOf(control) {
  const transform = control?._children?.Transform ?? {};
  const rotation = Number(transform.rotation ?? 0) || 0;
  const scale = Number(transform.scale ?? 1);
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return Math.abs(rotation) > 1e-9 || Math.abs(s - 1) > 1e-9 ? { rotation, scale: s } : null;
}

/** The control upright and full size: its layers are built so, then turned (turnControlLayers). */
function upright(control) {
  if (!control?._children?.Transform) return control;
  const copy = { ...control, _children: { ...control._children, Transform: { ...control._children.Transform, rotation: 0, scale: 1 } } };
  return copy;
}

const LAYOUT_MOVES = ['x', 'y', 'width', 'height', 'offsetX', 'offsetY'];
const sameReading = (a, b) => String(a?.source ?? '') === String(b?.source ?? '')
  && Number(a?.inputMin ?? 0) === Number(b?.inputMin ?? 0) && Number(a?.inputMax ?? 1) === Number(b?.inputMax ?? 1)
  && (a?.clamp !== false) === (b?.clamp !== false) && (a?.invert === true) === (b?.invert === true);
// A straight line from the reading (interactionRuntime's range): no band, no rounding.
const plainRange = (binding) => String(binding?.mapMode ?? 'range') === 'range' && binding?.band !== true && binding?.round !== true;
const at3 = (n) => Math.round(n * 1000) / 1000;

/**
 * A turned or scaled control's layers, drawn as the panel draws it. The panel turns and scales the
 * whole control about its box's centre (CanvasControl: rotate, then scale, from the centre); each
 * layer, built upright and full size, turns by the same angle and scales by the same factor about
 * its own pivot, and its box moves so that the pivot lands where the control's turn puts it, which
 * is the same picture. A layer a binding moves or sizes (a key that travels, a bar that grows, a
 * marker that slides) is placed so at both ends of the binding, so it travels along the turned
 * direction: one place binding per axis, from the same reading. A layer moved by two readings, or
 * through a curve, cannot be, and is refused; so is a state that moves one. Every layer ends in
 * pixels from the top left. `turned`: `{ names, rect, rotation, scale }`, `rect` the control's box
 * in the component. Returns why not, or ''.
 */
function turnControlLayers(turned, { parts, bindings, states, width: W, height: H }) {
  const { names, rect, rotation, scale } = turned;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const angle = (rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const own = new Set(names);
  for (const state of Object.values(states ?? {})) {
    for (const [layer, patch] of Object.entries(state?.patches?.parts ?? {})) {
      if (own.has(layer) && Object.keys(patch ?? {}).some((path) => path.startsWith('Layout.'))) return `a state that moves its ${layer} layer, turned`;
    }
  }
  const anchorOffset = (anchor, size) => (['left', 'top'].includes(String(anchor ?? 'center')) ? 0 : (['right', 'bottom'].includes(String(anchor ?? 'center')) ? size : size / 2));
  for (const name of names) {
    const part = parts[name];
    if (!part) continue;
    const layout = (part._children.Layout ??= { _type: 'PartLayout' });
    const prefix = `Parts.${name}.Layout.`;
    const keyOf = (binding) => String(binding?.target ?? '').slice(prefix.length);
    const mine = Object.entries(bindings).filter(([, binding]) => String(binding?.target ?? '').startsWith(prefix) && binding?.enabled !== false);
    const moving = mine.filter(([, binding]) => LAYOUT_MOVES.includes(keyOf(binding)));
    const strange = mine.find(([, binding]) => !LAYOUT_MOVES.includes(keyOf(binding)) && !['rotation', 'scale'].includes(keyOf(binding)));
    if (strange) return `its ${name} layer's ${keyOf(strange[1])}, bound, turned`;
    if (moving.some(([, binding]) => !plainRange(binding) || !sameReading(binding, moving[0][1]))) return `its ${name} layer, moved by more than one reading, turned`;
    if (mine.some(([, binding]) => !plainRange(binding))) return `its ${name} layer, bound in steps, turned`;
    const fill = String(layout.mode ?? 'absolute') === 'fill';
    const unit = (value, key, total) => (String(layout[`${key}Unit`] ?? 'px') === 'percent' ? (total * Number(value || 0)) / 100 : Number(value || 0));
    const sizeUnit = (key) => (key === 'x' || key === 'width' ? W : H);
    const unitKey = (key) => (key === 'width' || key === 'height' ? key : (key === 'x' || key === 'y' ? key : ''));
    // The layer's fields in pixels, at the reading's start (0), its end (1) or as it stands (null).
    const fields = (end) => {
      const f = fill
        ? { x: 0, y: 0, width: W, height: H, offsetX: 0, offsetY: 0 }
        : {
          x: unit(layout.x, 'x', W), y: unit(layout.y, 'y', H), width: unit(layout.width, 'width', W), height: unit(layout.height, 'height', H),
          offsetX: Number(layout.offsetX ?? 0) || 0, offsetY: Number(layout.offsetY ?? 0) || 0,
        };
      if (end === null) return f;
      for (const [, binding] of moving) {
        const key = keyOf(binding);
        const out = Number(end ? binding.outputMax : binding.outputMin) || 0;
        f[key] = unitKey(key) ? unit(out, key, sizeUnit(key)) : out;
      }
      return f;
    };
    const pivotX = Number(layout.pivotX ?? 50);
    const pivotY = Number(layout.pivotY ?? 50);
    const anchorX = fill ? 'left' : layout.anchorX;
    const anchorY = fill ? 'top' : layout.anchorY;
    const place = (f) => {
      const left = f.x - anchorOffset(anchorX, f.width) + f.offsetX;
      const top = f.y - anchorOffset(anchorY, f.height) + f.offsetY;
      const px = left + (f.width * pivotX) / 100;
      const py = top + (f.height * pivotY) / 100;
      const dx = px - cx;
      const dy = py - cy;
      return { x: at3(left + cx + scale * (cos * dx - sin * dy) - px), y: at3(top + cy + scale * (sin * dx + cos * dy) - py) };
    };
    const now = fields(null);
    const there = place(now);
    // Where a moving layer is at either end of its reading, from its layout as built.
    const from = moving.length ? place(fields(0)) : null;
    const to = moving.length ? place(fields(1)) : null;
    Object.assign(layout, {
      mode: 'absolute', x: there.x, y: there.y, width: at3(now.width), height: at3(now.height),
      xUnit: 'px', yUnit: 'px', widthUnit: 'px', heightUnit: 'px', anchorX: 'left', anchorY: 'top', offsetX: 0, offsetY: 0,
      rotation: at3((Number(layout.rotation ?? 0) || 0) + rotation),
      scale: at3(Math.max(0.01, Number(layout.scale ?? 1) || 1) * scale),
    });
    for (const [, binding] of mine) {
      if (keyOf(binding) === 'rotation') Object.assign(binding, { outputMin: at3(Number(binding.outputMin) + rotation), outputMax: at3(Number(binding.outputMax) + rotation) });
      if (keyOf(binding) === 'scale') Object.assign(binding, { outputMin: at3(Number(binding.outputMin) * scale), outputMax: at3(Number(binding.outputMax) * scale) });
    }
    if (!moving.length) continue;
    const template = moving[0][1];
    for (const [key, binding] of moving) {
      const field = keyOf(binding);
      if (field === 'width' || field === 'height') {
        // A size keeps its binding, in pixels.
        Object.assign(binding, { outputMin: at3(unit(binding.outputMin, field, sizeUnit(field))), outputMax: at3(unit(binding.outputMax, field, sizeUnit(field))) });
      } else {
        delete bindings[key];
      }
    }
    for (const axis of ['x', 'y']) {
      if (Math.abs(from[axis] - to[axis]) < 1e-6) continue;
      let bindingName = `${name}Turned${axis.toUpperCase()}`;
      for (let n = 2; bindings[bindingName]; n += 1) bindingName = `${name}Turned${axis.toUpperCase()}${n}`;
      bindings[bindingName] = { ...deepClone(template), name: bindingName, target: `${prefix}${axis}`, outputMin: from[axis], outputMax: to[axis] };
    }
  }
  return '';
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
  // A button's lamp takes its room on its side, as the canvas's content box gives it.
  const lamp = buttonLampGeometry(resolved, rect);
  const lampRoom = (side) => (lamp && lamp.onRight === (side === 'paddingRight') ? lamp.width + lamp.gap : 0);
  // And an icon beside it its size and the gap (resolveContentBox).
  const room = resolveContentBox(layout, position, String(layout.mode ?? 'text_only'), resolved._children.Icon ?? null, null);
  const iconRoom = {
    paddingLeft: room.textPaddingLeft - room.paddingLeft, paddingRight: room.textPaddingRight - room.paddingRight,
    paddingTop: room.textPaddingTop - room.paddingTop, paddingBottom: room.textPaddingBottom - room.paddingBottom,
  };
  const pad = (key) => (Number.isFinite(Number(layout[key])) ? Number(layout[key]) : 0) + lampRoom(key) + iconRoom[key];
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

/**
 * Where a button's lamp sits (ContentLayout `lamp`: an LED, a jewel, a window), as CanvasControl
 * places it: its side's padding in from the edge, centred down the box; or null for none.
 */
function buttonLampGeometry(resolved, rect) {
  const layout = resolved?._children?.ContentLayout ?? {};
  const kind = String(layout.lamp ?? 'none').toLowerCase();
  if (!['led', 'jewel', 'window', 'bat'].includes(kind)) return null;
  const size = Math.max(3, Number.isFinite(Number(layout.lampSize)) ? Number(layout.lampSize) : 9);
  const gap = Math.max(0, Number.isFinite(Number(layout.lampGap)) ? Number(layout.lampGap) : 8);
  const onRight = String(layout.lampSide ?? 'left') === 'right';
  const width = kind === 'window' ? size * 2 : size;
  // A bat's lever reaches a bezel above and below it: three bezels tall.
  const height = kind === 'bat' ? size * 3 : size;
  const inset = Number.isFinite(Number(layout[onRight ? 'paddingRight' : 'paddingLeft'])) ? Number(layout[onRight ? 'paddingRight' : 'paddingLeft']) : 8;
  return { kind, size, gap, onRight, width, height, x: onRight ? rect.width - inset - width : inset, y: (rect.height - height) / 2 };
}

/** Whether the control shows its text: not when its layout shows the icon alone (CanvasControl). */
function showsText(resolved) {
  return String(resolved?._children?.ContentLayout?.mode ?? 'text_only') !== 'icon_only'
    && Boolean(String(resolved?._children?.Text?.content ?? '').trim());
}

/**
 * A label's or a button's icon as a layer: its Icon section, drawn as the canvas draws a control's
 * icon (editor/iconLook.js), in the box the canvas gives it, `{ layer, above }`, `above` when it is
 * stacked over the text. Null when the layout shows no icon.
 */
function iconLayer(name, resolved, styled, rect, common) {
  const layout = resolved?._children?.ContentLayout ?? {};
  const mode = String(layout.mode ?? 'text_only');
  const icon = styled?._children?.Icon ?? resolved?._children?.Icon;
  if (mode === 'text_only' || !icon || icon.source === 'none') return null;
  const lamp = buttonLampGeometry(resolved, rect);
  const box = resolveContentBox(layout, resolved._children.Text?._children?.Position ?? {}, mode, icon, lamp ? { onRight: lamp.onRight, width: lamp.width, gap: lamp.gap } : null);
  const at = iconPlacement(layout, box, mode, icon, rect.width, rect.height);
  const layer = createPartNode(name, {
    ...common, role: 'custom', kind: 'rectangle',
    layout: pxLayout({ x: rect.x + at.left, y: rect.y + at.top, width: at.size, height: at.size }, null),
    sections: { Icon: deepClone(icon) },
  });
  const textZ = Number.isFinite(Number(layout.textZIndex)) ? Number(layout.textZIndex) : 2;
  return { layer, above: at.zIndex > textZ };
}

/**
 * The shadows and bevel a control casts (surfaceShadows): none when it is drawn as a device, whose
 * effects the canvas does not draw, or is a knob or slider, which keeps its own.
 */
function castShadows(control, resolved) {
  const type = String(control?._children?.Core?.controlType ?? '');
  if (VALUE_TYPES.includes(type)) return [];
  const device = Boolean(anatomyForm(type, resolved?._children?.Core?.controlForm ?? control._children.Core.controlForm))
    || buttonDeviceDrawn(resolved) || meterDeviceDrawn(resolved);
  return device ? [] : surfaceShadows(resolved?._children?.Effects);
}

/** How far past its box a control's cast shadows can reach (EffectSurface's filter region). */
function castReach(control, resolved) {
  const shadows = castShadows(control, resolved);
  return shadows.length ? Math.ceil(Math.max(...shadows.map((s) => Math.abs(s.x) + Math.abs(s.y) + Math.abs(s.spread) + s.blur * 3))) : 0;
}

const opaqueColour = (value) => /^ff[0-9a-f]{6}$/i.test(String(value ?? '').replace(/^#/, '').trim());

/** Whether a Background paints its whole box opaque: an opaque colour, or a gradient opaque throughout. */
function paintsOpaque(background) {
  const fill = background?._children?.Fill ?? {};
  if (fill.solidEnabled === true && opaqueColour(fill.colour) && Number(fill.solidOpacity ?? 100) >= 100) return true;
  const stops = fill.gradient?.stops ?? [];
  return fill.gradientEnabled === true && stops.length > 0 && stops.every((stop) => opaqueColour(stop?.color ?? stop?.colour))
    && Number(fill.gradientOpacity ?? 100) >= 100;
}

/**
 * A control's own effects, carried to its layers so they draw as the canvas draws them
 * (CanvasControl). Its shadows and bevel are cast through what the control draws (EffectSurface
 * over its content), though not by one drawn as a device; here the layer that holds the control's
 * shape casts them through the same surface (`meta.surfaceEffects`): its plate, when the plate is
 * opaque and the rest lies on it, or its only layer. Its colour filters (brightness, contrast,
 * saturation, hue, greyscale, sepia, invert) change each pixel by itself, so every layer takes them
 * and the picture is the same. A blur and a blend act on the control as a whole: with one layer they
 * are that layer's, with more they are refused. Returns why not, or ''.
 */
function carryControlEffects(control, resolved, built, rect) {
  const effects = resolved?._children?.Effects;
  if (!effects) return '';
  const cast = castShadows(control, resolved);
  const defaults = SECTION_DEFAULTS.Effects._children.Filters;
  const filters = Object.fromEntries(Object.entries(effects._children?.Filters ?? {})
    .filter(([key, value]) => !key.startsWith('_') && value != null && value !== defaults[key]));
  const blend = String(effects._children?.Blend?.mode ?? 'normal');
  if (!cast.length && !Object.keys(filters).length && blend === 'normal') return '';
  const layers = [...built];
  const only = layers.length === 1 ? layers[0] : null;
  if (blend !== 'normal' && !only) return `a ${blend} blend over the whole control, which its layers would each blend alone`;
  if (Number(filters.blur) > 0 && !only) return 'a blur over the whole control, which its layers would each blur alone';
  const effectsOf = (layer) => (layer._children.Effects ??= deepClone(SECTION_DEFAULTS.Effects));
  if (cast.length) {
    const within = (inner, outer) => inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5
      && inner.x + inner.width <= outer.x + outer.width + 0.5 && inner.y + inner.height <= outer.y + outer.height + 0.5;
    const boxOf = (layer) => {
      const l = layer._children.Layout ?? {};
      // A text layer is widened 8px either side of where its glyphs go (labelTextPart).
      const inset = layer.role === 'label' ? 8 : 0;
      return { x: Number(l.x) + inset, y: Number(l.y), width: Number(l.width) - 2 * inset, height: Number(l.height) };
    };
    // The plate: a layer the control's own background paints, over its whole box.
    const plate = layers.find((layer) => layer._children.Background && layer.role !== 'label' && within(rect, boxOf(layer)) && within(boxOf(layer), rect));
    const caster = only ?? (plate && paintsOpaque(resolved?._children?.Background) && layers.every((layer) => layer === plate || within(boxOf(layer), rect)) ? plate : null);
    if (!caster) return 'shadows or a bevel cast by the whole control, which has no one layer that holds its shape (an opaque plate under the rest)';
    const own = effectsOf(caster);
    if (surfaceShadows(own).length) return `shadows on its ${caster.name} layer as well as on the whole control`;
    own._children.Shadows = deepClone(effects._children.Shadows);
    own._children.Bevel = deepClone(effects._children.Bevel);
    caster.meta = { ...(caster.meta ?? {}), surfaceEffects: true };
  }
  for (const layer of Object.keys(filters).length ? layers : []) {
    const own = effectsOf(layer)._children;
    own.Filters = { ...(own.Filters ?? deepClone(defaults)) };
    for (const [key, value] of Object.entries(filters)) {
      if (own.Filters[key] != null && own.Filters[key] !== defaults[key] && own.Filters[key] !== value) return `its ${layer.name} layer's own ${key} filter as well as the control's`;
      own.Filters[key] = value;
    }
  }
  if (blend !== 'normal') effectsOf(only)._children.Blend = deepClone(effects._children.Blend);
  return '';
}

/**
 * A button's lamp as a layer, unlit (the off colour, a bezel, a shadow set into it), and the patch
 * that lights it (the lit colour and its glow), as CanvasControl's lampStyle draws the two; a jewel
 * has its highlight over its colour.
 */
function buttonLampLayer(name, resolved, styled, rect, common, uniqueName = (wanted) => wanted) {
  const lamp = buttonLampGeometry(resolved, rect);
  if (!lamp) return null;
  const layout = styled?._children?.ContentLayout ?? resolved._children.ContentLayout ?? {};
  const colourOf = (value, fallback) => {
    const raw = String(value ?? '').replace(/^#/, '').trim();
    return /^[0-9a-f]{8}$/i.test(raw) ? raw : (/^[0-9a-f]{6}$/i.test(raw) ? `FF${raw}` : (String(value ?? '').startsWith('{') ? value : fallback));
  };
  const lit = colourOf(layout.lampColour, 'FF5B9BD5');
  const off = colourOf(layout.lampOffColour, 'FF2C2C2C');
  const bezel = colourOf(layout.lampBezelColour, '66FFFFFF');
  if (lamp.kind === 'bat') {
    // A bat switch: its bezel, hub and lever as layers, the lever thrown up while lit.
    const resolvedLayout = resolved._children.ContentLayout ?? {};
    const hex = (value, fallback) => { const c = colourOf(value, fallback); return String(c).startsWith('{') ? fallback : c; };
    const bat = batLampLayers({
      name, box: { x: rect.x + lamp.x, y: rect.y + lamp.y, width: lamp.width, height: lamp.height },
      colours: { lit, off, bezel }, tints: { lit: hex(resolvedLayout.lampColour, 'FF5B9BD5'), off: hex(resolvedLayout.lampOffColour, 'FF2C2C2C') },
      zIndex: common.zIndex, opacity: common.opacity ?? 1, uniqueName,
    });
    return { layers: bat.layers, on: bat.on, depth: bat.depth };
  }
  const background = deepClone(SECTION_DEFAULTS.Background);
  background._children.Fill.colour = off;
  background._children.Fill.solidEnabled = true;
  // CSS's `circle at 35% 30%` reaches its farthest corner: 95.5 % of a square's side.
  const highlight = (alpha) => ({
    type: 'radial', edge: 0, angle: 90, centerX: 35, centerY: 30, radiusX: 95.52, radiusY: 95.52,
    stops: [{ color: `${alpha}FFFFFF`, position: 0 }, { color: '00FFFFFF', position: 45 }],
  });
  if (lamp.kind === 'jewel') {
    background._children.Fill.gradientEnabled = true;
    background._children.Fill.gradient = highlight('59');
  }
  background._children.Border.enabled = true;
  background._children.Border.thickness = 1;
  background._children.Border.colour = bezel;
  background._children.Corners.radius = lamp.kind === 'window' ? 2 : 0;
  const effects = deepClone(SECTION_DEFAULTS.Effects);
  const shadow = (type, offsetY, blur, colour) => ({ enabled: true, type, offsetX: 0, offsetY, blur, spread: 0, colour });
  effects._children.Shadows.items = [shadow('inner', 1, 2, '99000000')];
  const layer = createPartNode(name, {
    ...common, role: 'indicator', kind: lamp.kind === 'window' ? 'roundedRectangle' : 'circle',
    layout: pxLayout({ x: rect.x + lamp.x, y: rect.y + lamp.y, width: lamp.width, height: lamp.size }, {}),
    sections: { Background: background, Effects: effects },
  });
  const on = {
    'Background.Fill.colour': lit,
    'Effects.Shadows.items': [shadow('outer-glow', 0, Math.max(4, lamp.size * 0.8), lit), shadow('outer-glow', 0, Math.max(2, lamp.size * 0.25), lit)],
  };
  if (lamp.kind === 'jewel') on['Background.Fill.gradient'] = highlight('BF');
  return { layers: [layer], on: { [layer.name]: on }, depth: common.zIndex + 1 };
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
    // A meter drawn with device parts: a layer per part, moving with the reading; no grab areas. In
    // a synth set's form: its drawing (deviceDrawingLayers.js).
    const channel = uniquePartName(name, taken);
    const layersOf = { resolved, styled, rect, channel, prefix: channel, zIndex, uniqueName: (wanted) => uniquePartName(wanted, taken) };
    const built = (drawnDeviceDirection(type, resolved?._children?.Core?.controlForm) && synthDeviceDrawingLayers({ ...layersOf, kind: 'meter' }))
      || (meterDeviceDrawn(resolved) ? meterDeviceLayers : plainMeterLayers)(layersOf);
    const cfg = resolved?._children?.Meter ?? {};
    // On a decibel scale its layers read the value on that scale, as the meter places it.
    readOnDecibelScale(built.bindings, channel, cfg);
    const lo = Number(cfg.valueMin ?? 0);
    const hi = Number(cfg.valueMax ?? 1);
    const value = Number(cfg.value ?? lo);
    const travel = hi > lo ? Math.max(0, Math.min(1, (value - lo) / (hi - lo))) : 0;
    // The held peak where nothing runs: the value on a device meter, none on a plain one.
    seedLayersAt(built.parts, built.bindings, travel, { peak: meterDeviceDrawn(resolved) ? travel : null });
    for (const part of built.parts) part.opacity = Number(part.opacity ?? 1) * common.opacity;
    return Object.assign(built.parts, { metered: { channel, ...built } });
  }
  if (BUTTON_TYPES.includes(type) && drawnDeviceDirection(type, resolved?._children?.Core?.controlForm)) {
    // A button or switch in a synth set's form: its drawing, at rest and pressed or on
    // (deviceDrawingLayers.js), its caption the control's text as the drawing sets it.
    const channel = uniquePartName(name, taken);
    const toggle = String(resolved?._children?.Behavior?.buttonType ?? 'momentary') === 'toggle';
    const built = synthDeviceDrawingLayers({
      resolved, styled, rect, channel, prefix: channel, zIndex,
      uniqueName: (wanted) => uniquePartName(wanted, taken),
      kind: toggle ? 'toggle' : 'button', caption: String(resolved._children.Text?.content ?? ''),
    });
    if (built) {
      for (const part of built.parts) part.opacity = Number(part.opacity ?? 1) * common.opacity;
      return Object.assign(built.parts, { buttoned: { channel, plate: '', text: built.partNames.caption?.[0] ?? '', device: built } });
    }
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
    // Over the plate its lamp (a bat switch takes a depth for each of its layers), then its icon and
    // text, the icon under or over the text as their depths say.
    const lamp = buttonLampLayer(uniquePartName(`${channel}_lamp`, taken), resolved, styled, rect, { ...common, zIndex: zIndex + 1 }, (wanted) => uniquePartName(wanted, taken));
    let next = lamp ? lamp.depth : zIndex + 1;
    const icon = iconLayer(uniquePartName(`${channel}_icon`, taken), resolved, styled, rect, common);
    if (icon && !icon.above) { icon.layer.zIndex = next; next += 1; }
    const textPart = showsText(resolved)
      ? labelTextPart(uniquePartName(`${channel}_text`, taken), resolved, styled, rect, transform, { ...common, zIndex: next })
      : null;
    if (icon?.above) icon.layer.zIndex = next + 1;
    const built = [plate, ...(lamp?.layers ?? []), icon?.layer, textPart].filter(Boolean);
    return Object.assign(built, { buttoned: { channel, plate: plate?.name ?? '', text: textPart?.name ?? '', lamp: lamp ? { on: lamp.on } : null } });
  }
  if (VALUE_TYPES.includes(type) && asLayers) {
    // Layers the designer edits (utils/valueControlLayers.js): one per part of the knob, wired to its
    // value. The channel is named as the one exact part would have been.
    const channel = uniquePartName(name, taken);
    const circular = String(resolved?._children?.Behavior?.geometry ?? (type === 'Knob' ? 'circular' : 'linear')) === 'circular';
    const layersOf = { resolved, styled, rect, channel, prefix: channel, zIndex, uniqueName: (wanted) => uniquePartName(wanted, taken) };
    // A knob in a base form: its drawing, turned as the same knob in parts turns (the drag of the
    // knob's own parts, worked out without taking their names).
    const drawnForm = circular && type === 'Knob' ? anatomyForm('Knob', resolved?._children?.Core?.controlForm) : '';
    const built = DRAWN_KNOB_FORMS.includes(drawnForm)
      ? knobFormDrawingLayers({ ...layersOf, drag: knobLayers({ ...layersOf, uniqueName: (wanted) => wanted }).behavior })
      : (circular ? knobLayers : sliderLayers)(layersOf);
    // Standing at the knob's value, as the panel drew it: the designer draws what is authored.
    const behavior = resolved?._children?.Behavior ?? {};
    const min = Number(behavior.min ?? 0);
    const max = Number(behavior.max ?? 1);
    const value = Number(behavior.defaultCurrentValue ?? behavior.defaultValue ?? min);
    const travelOf = (raw) => (max > min && Number.isFinite(raw) ? Math.max(0, Math.min(1, (raw - min) / (max - min))) : 0);
    // A range's or a band's handles each stand at their own value.
    const handles = built.handles ?? [];
    const defaults = handles.length > 1 ? getSliderDefaultValues(behavior) : null;
    const travel = defaults
      ? Object.fromEntries(handles.map((handle) => [handle.channel, travelOf(Number(defaults[handle.role]))]))
      : travelOf(value);
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
    const icon = iconLayer(uniquePartName(`${name}_icon`, taken), resolved, resolved, rect, common);
    if (icon) {
      icon.layer.zIndex = zIndex + (icon.above ? 3 : 1);
      parts.push(icon.layer);
    }
    // A label keeps its text layer when it is empty, so its text stays a setting a copy can fill.
    if (String(resolved._children.ContentLayout?.mode ?? 'text_only') !== 'icon_only') {
      parts.push(labelTextPart(uniquePartName(name, taken), resolved, resolved, rect, transform, { ...common, zIndex: zIndex + 2 }));
    }
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
    // As layers, a control drawn in a classic form is first drawn in that form's own parts, as
    // Core › Control design › Convert to Parts draws it (models/formAsParts.js), on a copy: its
    // layers are then the parts', which every set's control already comes in as. An illustrated
    // form has no parts, and stays refused by name.
    const control = valueControlsAs === 'layers' ? formAsLayers(entry.control, set) : entry.control;
    const resolved = resolveControlForSet(control, set);
    const why = whyNotConvertible(control, resolved, { measure, layers: valueControlsAs === 'layers' })
      || (scriptReference(scripts, control) ? `used by ${scriptReference(scripts, control)}` : '')
      || references.get(id)
      || '';
    if (why) refused.push({ id, name: nameOf(control), reason: why });
    else chosen.push({ ...entry, control, resolved });
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
  // A component clips to its own box (CanvasControl's .control-content), while the canvas draws a
  // turned or scaled control, and a control's cast shadows, past its box: the component holds the
  // box as drawn, its shadows' reach about it, turned and scaled about its centre.
  const drawnRects = chosen.map(({ control, resolved }, i) => {
    const reach = castReach(control, resolved);
    const r = reach ? { x: rects[i].x - reach, y: rects[i].y - reach, width: rects[i].width + 2 * reach, height: rects[i].height + 2 * reach } : rects[i];
    const turn = VALUE_TYPES.includes(String(control._children.Core.controlType)) ? null : turnOf(control);
    if (!turn) return r;
    const angle = (turn.rotation * Math.PI) / 180;
    const w = turn.scale * (Math.abs(Math.cos(angle)) * r.width + Math.abs(Math.sin(angle)) * r.height);
    const h = turn.scale * (Math.abs(Math.sin(angle)) * r.width + Math.abs(Math.cos(angle)) * r.height);
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    return { x: Math.floor(cx - w / 2), y: Math.floor(cy - h / 2), width: Math.ceil(cx + w / 2) - Math.floor(cx - w / 2), height: Math.ceil(cy + h / 2) - Math.floor(cy - h / 2) };
  });
  const bounds = {
    x: Math.min(...drawnRects.map((r) => r.x)),
    y: Math.min(...drawnRects.map((r) => r.y)),
  };
  bounds.width = Math.max(...drawnRects.map((r) => r.x + r.width)) - bounds.x;
  bounds.height = Math.max(...drawnRects.map((r) => r.y + r.height)) - bounds.y;

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
  // Turned or scaled buttons, switches, meters and artwork: built upright, then turned (turnControlLayers).
  const turnedControls = [];
  order.forEach(({ control: placed, resolved: placedResolved, rect }, i) => {
    const local = { ...rect, x: rect.x - bounds.x, y: rect.y - bounds.y };
    const turn = VALUE_TYPES.includes(String(placed._children.Core.controlType)) ? null : turnOf(placed);
    const control = turn ? upright(placed) : placed;
    const resolved = meterFromItsSource(turn ? upright(placedResolved) : placedResolved, panel);
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
    if (!VALUE_TYPES.includes(String(control._children.Core.controlType))) {
      const why = carryControlEffects(control, resolved, built, local);
      if (why) refused.push({ id: String(placed._children.Core.id), name: nameOf(placed), reason: why });
    }
    if (turn) {
      const names = built.map((part) => part.name);
      // A turned button is pressed where it is drawn: its zone follows a layer the size of its box
      // (drawing nothing), turned with the rest.
      const channel = built.buttoned?.channel;
      let area = '';
      if (channel) {
        area = uniquePartName(`${channel}Area`, taken);
        built.push(createPartNode(area, { role: 'custom', kind: 'rectangle', zIndex: (i + 1) * 1000, layout: pxLayout(local, null) }));
        names.push(area);
      }
      turnedControls.push({ id: String(placed._children.Core.id), name: nameOf(placed), names, rect: local, ...turn, zone: channel ? `${channel}Zone` : '', area });
    }
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

  // A control whose effects its layers could not carry (carryControlEffects).
  if (refused.length) return { ok: false, refused };

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
  for (const turned of turnedControls) {
    const why = turnControlLayers(turned, {
      parts, bindings: valueSections.bindings, states: valueSections.states, width: bounds.width, height: bounds.height,
    });
    if (why) return { ok: false, refused: [{ id: turned.id, name: turned.name, reason: why }] };
    const zone = valueSections.hitZones[turned.zone];
    if (zone && turned.area) zone.source = `part:${turned.area}`;
  }
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
 * `control` with the classic form it is drawn in turned into its parts: its own form, or the one its
 * set draws it in (a set's family names a form, as Atlas's knob), the form's parts pinned so the set
 * does not draw the form over them, in the form's own colours. The control as it is when it names
 * no form, an illustrated one, a base knob form (it comes in as its drawing) or a form whose parts
 * draw it otherwise (refused by name).
 */
function formAsLayers(control, set) {
  const type = String(control?._children?.Core?.controlType ?? '');
  // A base knob form stays named, its own or its set's: it comes in as its drawing
  // (formDrawingLayers.js), which its parts are not.
  // A form whose parts draw it otherwise stays named too, and is refused by name (formPartsDiffer).
  const kept = (form) => (type === 'Knob' && DRAWN_KNOB_FORMS.includes(form)) || Boolean(drawnDeviceDirection(type, form)) || formPartsDiffer(type, form);
  if (kept(anatomyForm(type, control?._children?.Core?.controlForm))) return control;
  const own = withFormAsParts(control, set);
  if (own !== control) return own;
  const setForm = anatomyForm(type, resolveControlForSet(control, set)?._children?.Core?.controlForm);
  if (!setForm || kept(setForm)) return control;
  const named = deepClone(control);
  named._children.Core.controlForm = setForm;
  const parts = withFormAsParts(named, set);
  return parts === named ? control : parts;
}

/**
 * A meter that shows another control's value (Meter.valueSourceId, a knob or slider): over that
 * control's range, as the panel's meter is while the source drives it (applyMeterValueSource), so
 * its readout prints the source's value. Where nothing drives it (the editor's canvas) the panel's
 * meter stands at its own test value, so it starts at the same place along the new range. Any other
 * meter as it is.
 */
function meterFromItsSource(resolved, panel) {
  const meter = resolved?._children?.Meter;
  const sourceId = String(meter?.valueSourceId ?? '').trim();
  if (!sourceId) return resolved;
  const source = findPanelControl(panel?.controls ?? [], sourceId);
  const behavior = source?._children?.Behavior;
  if (!behavior || String(behavior.family ?? '') !== 'range') return resolved;
  const min = getSliderMin(behavior);
  const max = getSliderMax(behavior);
  const ownMin = Number.isFinite(Number(meter.valueMin)) ? Number(meter.valueMin) : 0;
  const ownMax = Number.isFinite(Number(meter.valueMax)) ? Number(meter.valueMax) : 1;
  const own = Number.isFinite(Number(meter.value)) ? Number(meter.value) : ownMin;
  const fraction = ownMax > ownMin ? Math.min(1, Math.max(0, (own - ownMin) / (ownMax - ownMin))) : 0;
  const next = deepClone(resolved);
  Object.assign(next._children.Meter, { valueMin: min, valueMax: max, value: min + fraction * (max - min) });
  return next;
}

function findPanelControl(controls, id) {
  for (const control of controls ?? []) {
    if (String(control?._children?.Core?.id ?? '') === id) return control;
    const inside = findPanelControl(Object.values(control?._children?.Children?._children ?? {}), id);
    if (inside) return inside;
  }
  return null;
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
  // The knob or slider each control in the selection became: a meter that showed one of them shows
  // its value inside the component (`channel:<name>`).
  const converted = new Map(values.filter((entry) => !entry.buttoned && !entry.metered)
    .map((entry) => [String(entry.control._children.Core.id ?? ''), entry.layered ? entry.layered.channel : entry.part.name]));
  for (const entry of values) {
    if (entry.buttoned) {
      buttonSections(out, entry, width, height, allParts);
      continue;
    }
    if (entry.metered) {
      meterSections(out, entry, converted);
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
    // A range's or a band's handles: a value each beside the control's own, which keeps what the
    // panel's range kept (the value it sends, and its host parameter), kept in order as the panel
    // keeps them (normalizeHandleOrder): the start never past the value or the end.
    const handles = layered?.handles ?? [];
    const ranged = handles.length > 1;
    if (ranged) {
      const rangeBehavior = resolved?._children?.Behavior ?? behavior;
      const defaults = getSliderDefaultValues(rangeBehavior);
      const band = getSliderValueMode(rangeBehavior) === 'band';
      const named = Object.fromEntries(handles.map((handle) => [handle.role, handle.channel]));
      const bounds = {
        start: { normalizedMax: `channel.${band ? named.current : named.end}.normalized` },
        current: { normalizedMin: `channel.${named.start}.normalized`, normalizedMax: `channel.${named.end}.normalized` },
        end: { normalizedMin: `channel.${band ? named.current : named.start}.normalized` },
      };
      for (const handle of handles) {
        if (handle.role === 'current') {
          out.channels[channelName].constraints = { ...out.channels[channelName].constraints, ...bounds.current };
          continue;
        }
        out.channels[handle.channel] = createValueChannel(handle.channel, {
          label: `${nameOf(control)} ${handle.role}`,
          type: out.channels[channelName].type,
          min,
          max,
          step: out.channels[channelName].step,
          defaultValue: Math.min(max, Math.max(min, Number(defaults[handle.role]))),
          format: deepClone(out.channels[channelName].format),
          constraints: bounds[handle.role],
        });
        out.published[handle.channel] = {
          channel: handle.channel, label: out.channels[handle.channel].label, type: out.channels[handle.channel].type, enabled: true,
          min, max, defaultValue: out.channels[handle.channel].defaultValue,
        };
      }
    }
    out.behaviors[channelName] = layered ? {
      ...createBehaviorModule(channelName, {
        type: 'slider', role: 'slider', valueChannel: ranged ? handles[0].channel : channelName, geometry: layered.behavior.geometry,
        dragMode: layered.behavior.dragMode === 'relative' ? 'relative' : 'auto',
        interaction: { wheel: behavior.wheelEnabled !== false },
        // A slider that runs right to left, or top to bottom.
        reverseMouseDirection: layered.behavior.reversed === true,
      }),
      // Its centre and its travel are in its own box, the grab area: measured there, not across the
      // whole component, where a knob beside another turned about a point between them.
      frame: 'zone',
      ...(ranged ? { valueChannels: handles.map((handle) => handle.channel) } : {}),
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
      targetValueChannel: ranged ? handles[0].channel : channelName,
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
    // A range's grab area takes the handle nearest where it is pressed, as the panel's does.
    if (ranged) out.hitZones[zoneName].targetValueChannels = handles.map((handle) => handle.channel);
    if (layered) {
      // The knob as layers: its bindings, and its interaction states written to the layers its parts
      // became, when THIS knob's grab area is hovered, dragged or focused.
      Object.assign(out.bindings, layered.bindings);
      // A range's handles glide each on its own value, over what that value moves, as the panel
      // moves its start, value and end along one curve (SliderFamilyRenderer's glide).
      for (const glideChannel of ranged ? handles.map((handle) => handle.channel) : [channelName]) {
        const own = ranged
          ? Object.fromEntries(Object.entries(layered.bindings).filter(([, binding]) => String(binding?.source ?? '').startsWith(`channel.${glideChannel}.`)))
          : layered.bindings;
        const glide = valueGlideAnimation(resolved, glideChannel, own);
        if (glide) out.animations[glide.name] = glide;
      }
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
  // Its lamp lights while it is on or pressed.
  if (buttoned.lamp) {
    out.states[`${channelName}Lamp`] = {
      _type: 'State', name: `${channelName}Lamp`, group: 'interaction', enabled: true,
      description: `${nameOf(control)}: ${toggle ? 'on' : 'pressed'}, its lamp lit.`,
      when: {}, rule: on, patches: { component: {}, parts: deepClone(buttoned.lamp.on) },
    };
  }
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
function meterSections(out, { control, resolved, metered }, converted = new Map()) {
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
  // A meter that showed another control's value shows it still: the knob it came in with (the value
  // that knob became), or the panel control, read where the component is drawn (sourcedCustomValues).
  const sourceId = String(cfg.valueSourceId ?? control._children.Meter?.valueSourceId ?? '').trim();
  if (sourceId) out.channels[channelName].valueSource = converted.has(sourceId) ? `channel:${converted.get(sourceId)}` : sourceId;
  // A meter that holds its peak (Peak Hold, a clip lamp, a part showing the peak) keeps it on its
  // value (interactionRuntime's `channel.<name>.peak`), held and falling as the meter's is. Where
  // nothing runs, a device meter shows its value as the peak and a plain one no marker.
  if (cfg.peakHold === true || meterNeedsPeak(resolved)) {
    out.channels[channelName].peakHold = {
      holdMs: Number.isFinite(Number(cfg.peakHoldMs)) ? Number(cfg.peakHoldMs) : 1200,
      decayPerSec: Number.isFinite(Number(cfg.peakDecayPerSec)) ? Number(cfg.peakDecayPerSec) : 0.4,
      idle: meterDeviceDrawn(resolved) ? 'value' : 'none',
      // On a decibel scale the peak falls on that scale, as the meter's does.
      ...(String(cfg.scale ?? 'linear') === 'db'
        ? { scale: 'db', dbFloor: Number.isFinite(Number(cfg.dbFloor)) ? Number(cfg.dbFloor) : -60, dbCeil: Number.isFinite(Number(cfg.dbCeil)) ? Number(cfg.dbCeil) : 6 }
        : {}),
    };
  }
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
