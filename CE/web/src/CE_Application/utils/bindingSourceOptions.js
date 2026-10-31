// The choices a binding's Source, Mode and Unit offer in the React tab (BindingsEditor).
//
// Source used to be a fixed list of the single-value sources (value.raw, value.normalized, …) and
// the interaction states. A component's channels were not in it — and a component's bindings are
// almost all channel bindings: the factory's knobs read `channel.mainValue.normalized`, a knob made
// from a panel control reads `channel.Cutoff.raw`. A select whose value is not among its options
// shows blank, so every one of those bindings looked unset, and picking anything from the list
// replaced the working source and disconnected the part.
//
// So the channels come first, by name, in the three forms the runtime gives each of them
// (interactionRuntime.js, channelSignals): its value, its position 0 to 1, and its text as shown.
// Whatever a binding holds that is in none of the lists is offered as it is, so the select always
// shows what the binding does and never loses it.

const VALUE_SOURCES = [
  ['value.raw', 'Value'],
  ['value.normalized', 'Value, 0 to 1'],
  ['value.display', 'Value as shown'],
  ['value.bool', 'On or off'],
  ['value.enum', 'Choice'],
];

const STATE_SOURCES = [
  ['state.hover', 'Hovered'],
  ['state.pressed', 'Pressed'],
  ['state.focused', 'Focused'],
  ['state.dragging', 'Dragging'],
  ['state.disabled', 'Disabled'],
  ['state.checked', 'Checked'],
];

export const MAP_MODES = [
  ['range', 'Range'],
  ['boolean', 'On / off'],
  ['enum', 'Choice'],
  ['format', 'Text'],
  ['direct', 'Direct'],
];

export const OUTPUT_UNITS = [
  ['percent', '%'],
  ['px', 'px'],
  ['deg', 'degrees'],
  ['unitless', 'none'],
];

const option = ([value, label]) => ({ value, label });

/** The component's channels, by name, in declaration order. */
export function bindingChannelNames(control) {
  return Object.keys(control?._children?.ValueChannels?._children ?? {});
}

/**
 * The Source choices, in groups: the component's channels, the control's own value, and the
 * interaction states. `current` is the binding's source; when no group holds it, it is offered
 * first, as it is.
 */
export function bindingSourceGroups(control, current = '') {
  const channels = control?._children?.ValueChannels?._children ?? {};
  const channelOptions = [];
  for (const [name, channel] of Object.entries(channels)) {
    channelOptions.push(
      { value: `channel.${name}.raw`, label: `${name}: value` },
      { value: `channel.${name}.normalized`, label: `${name}: 0 to 1` },
      { value: `channel.${name}.display`, label: `${name}: as shown` },
    );
    if (String(channel?.type ?? '').trim().toLowerCase() === 'array') {
      channelOptions.push(
        { value: `channel.${name}.items`, label: `${name}: items` },
        { value: `channel.${name}.count`, label: `${name}: count` },
      );
    }
  }
  const groups = [];
  if (channelOptions.length) groups.push({ label: 'Channels', options: channelOptions });
  groups.push({ label: 'Value', options: VALUE_SOURCES.map(option) });
  groups.push({ label: 'State', options: STATE_SOURCES.map(option) });
  return withCurrent(groups, current);
}

/** A fixed list as one group, with the current value added when the list does not hold it. */
export function choiceGroups(list, current = '') {
  return withCurrent([{ label: '', options: list.map(option) }], current);
}

/** The source a new binding starts from: the first channel's position, or the control's value. */
export function defaultBindingSource(control) {
  const first = bindingChannelNames(control)[0];
  return first ? `channel.${first}.normalized` : 'value.normalized';
}

function withCurrent(groups, current) {
  const value = String(current ?? '');
  if (!value || groups.some((group) => group.options.some((entry) => entry.value === value))) return groups;
  return [{ label: 'This binding', options: [{ value, label: value }] }, ...groups];
}
