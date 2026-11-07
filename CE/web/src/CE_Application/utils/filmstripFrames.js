/**
 * filmstripFrames.js — what each frame of a control's filmstrip shows.
 *
 * A filmstrip is one picture holding every position of a control, one frame after another: the
 * format JUCE's LookAndFeel, HISE and KnobMan read a knob or a switch from. Frame i of n is the
 * control at i/(n-1) of its travel, which is how those readers pick a frame for a value; a channel
 * with a curve (utils/channelCurves.js) is therefore stepped by its travel, as the control is drawn,
 * not by its value.
 *
 * Each frame is a preview session (stores/interactionPreview.js): the same thing that moves the
 * control in Preview, so a frame is the control as Preview would draw it at that value. Nothing in
 * the document changes.
 *
 * What has a filmstrip:
 *   - a knob, a slider, a meter, any control with a range: `count` frames across it;
 *   - a custom component, through its main value channel: a number `count` frames across it, an
 *     on/off two frames, a list one frame per entry;
 *   - a switch: off and on;
 *   - a button: up and pressed.
 * Everything else is refused with the reason, rather than handed back as a strip of one picture.
 */
import { getSection } from '../stores/controls.js';
import { denormalizeCustomChannelValue, getCustomValueChannels, seedCustomValues } from './customComponentInteraction.js';
import { isSliderBehavior } from './sliderBehavior.js';
import { deepClone } from './deepClone.js';

const BUTTON_TYPES = new Set(['Button', 'MomentaryButton']);
const SWITCH_TYPES = new Set(['ToggleButton']);

const num = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

/** The channel a custom component's value is: as interactionRuntime.js picks it. */
function mainChannelOf(control) {
  const channels = getCustomValueChannels(control) ?? {};
  const entries = Object.entries(channels);
  const named = channels.mainValue ? ['mainValue', channels.mainValue] : null;
  return named
    ?? entries.find(([, channel]) => !['enum', 'array'].includes(String(channel?.type ?? '').trim().toLowerCase()))
    ?? entries[0]
    ?? null;
}

function enumValues(channel) {
  const list = Array.isArray(channel?.values) ? channel.values : (Array.isArray(channel?.options) ? channel.options : []);
  return list.map((entry) => entry?.value ?? entry?.id ?? entry).filter((entry) => entry !== undefined && entry !== null);
}

const travel = (index, count) => (count <= 1 ? 0 : index / (count - 1));

/**
 * The frames of `control`'s filmstrip, `count` of them where the control has a range.
 *
 * Returns { ok: true, kind, frames: [{ label, session }], control } — `control` is the one to draw
 * (a copy where stepping needed it), each `session` laid over `base`, the control's own default
 * session — or { ok: false, reason }.
 */
export function filmstripFrames(control, count = 64, base = {}) {
  const core = getSection(control, 'Core') ?? {};
  const type = String(core.controlType ?? '');
  const behavior = getSection(control, 'Behavior') ?? null;
  const n = Math.max(2, Math.min(1024, Math.round(num(count, 64))));

  if (type === 'CustomComponent') {
    const main = mainChannelOf(control);
    if (!main) return { ok: false, reason: 'this component has no value to show at different positions' };
    const [name, channel] = main;
    const channelType = String(channel?.type ?? 'float').trim().toLowerCase();
    if (channelType === 'array') return { ok: false, reason: `its value "${name}" is a list of values, not one that moves` };
    const seeded = { ...seedCustomValues(control), ...(base.customValues ?? {}) };
    const frameAt = (value, normalized, label) => ({
      label,
      session: {
        ...base,
        customValues: { ...seeded, [name]: value },
        customNormalizedValue: normalized,
        valueOverrideEnabled: true,
        valueOverride: value,
      },
    });
    if (channelType === 'enum') {
      const values = enumValues(channel);
      if (values.length < 2) return { ok: false, reason: `its value "${name}" has one entry` };
      return { ok: true, kind: 'list', control, frames: values.map((value, i) => frameAt(value, travel(i, values.length), String(value))) };
    }
    if (channelType === 'bool') {
      return { ok: true, kind: 'switch', control, frames: [frameAt(false, 0, 'off'), frameAt(true, 1, 'on')] };
    }
    const frames = [];
    for (let i = 0; i < n; i += 1) {
      const t = travel(i, n);
      const value = denormalizeCustomChannelValue(channel, t);
      frames.push(frameAt(value, t, String(value)));
    }
    return { ok: true, kind: 'range', control, frames };
  }

  if (SWITCH_TYPES.has(type) || String(behavior?.role ?? '') === 'toggle' || String(behavior?.buttonType ?? '') === 'toggle') {
    return {
      ok: true, kind: 'switch', control,
      frames: [{ label: 'off', session: { ...base, checked: false } }, { label: 'on', session: { ...base, checked: true } }],
    };
  }

  if (BUTTON_TYPES.has(type)) {
    return {
      ok: true, kind: 'button', control,
      frames: [{ label: 'up', session: { ...base, pressed: false } }, { label: 'pressed', session: { ...base, pressed: true } }],
    };
  }

  const min = num(behavior?.min, NaN);
  const max = num(behavior?.max, NaN);
  if (behavior && Number.isFinite(min) && Number.isFinite(max) && max !== min
      && (isSliderBehavior(behavior) || String(behavior.family ?? '') === 'range' || type === 'Meter')) {
    // Steps between frames are the strip's, not the control's: a knob that snaps to whole numbers
    // over 0..127 would otherwise draw 64 frames of it as a staircase.
    const stepped = deepClone(control);
    const steppedBehavior = getSection(stepped, 'Behavior');
    steppedBehavior.snapToStep = false;
    steppedBehavior.snapToTicks = false;
    const frames = [];
    for (let i = 0; i < n; i += 1) {
      const value = min + (max - min) * travel(i, n);
      frames.push({ label: String(Math.round(value * 1000) / 1000), session: { ...base, valueOverrideEnabled: true, valueOverride: value } });
    }
    return { ok: true, kind: 'range', control: stepped, frames };
  }

  const kind = type ? `a ${type.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}` : 'this control';
  return { ok: false, reason: `${kind} has no values to step through; a filmstrip is for knobs, sliders, meters, switches, buttons and components with a value` };
}
