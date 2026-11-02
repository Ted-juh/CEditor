// componentPanelValues.js — which of a custom component's values a panel can use.
//
// A value (a value channel) used to reach the panel only once its author had published it: an
// entry under PublishedProperties.inputs to bind it to a synth parameter on the Device tab or to
// link into it, and one under .outputs to link out of it. A value made on the Interact tab and not
// published was invisible to the panel, and publishing was a page of its own (Publish › Contract,
// with Quick Publish recipes to do it in bulk). The owner's call, when custom components were
// simplified: every value is the panel's unless its author keeps it in. One switch on the Settings
// tab keeps it in; nothing has to be published.
//
// The rule, for each direction:
//   - a published entry that is switched on is offered as it was, with its own name, label and
//     range (publishing is where an author renamed a value or narrowed it, and that stays theirs);
//   - a published entry that is switched off keeps its value out, as it did;
//   - any other value is offered unless the author kept it in: the channel's publicInput /
//     publicOutput, which every channel has carried all along ("private in" / "private out" in the
//     flat Value Channels editor) and which the plug-in's automation already honours
//     (exportParameters.js).
//
// So nothing the default offered is withdrawn, and nothing a panel already binds or links changes;
// a component made before this offers its unpublished values too. Run time reads values by channel
// name (deviceBindingSync.js), so a value offered this way binds and links like a published one.
//
// Pure: no stores, no DOM. models/componentPorts.js (the Device tab), panelCustomComponentLinks.js
// (links), the copy's Properties tab and the library's counts all read it, so they cannot disagree.

const DIRECTION_MAP = { input: 'inputs', output: 'outputs' };
const DIRECTION_FLAG = { input: 'publicInput', output: 'publicOutput' };

function channelsOf(control) {
  return control?._children?.ValueChannels?._children ?? {};
}

function publishedMap(control, direction) {
  return control?._children?.PublishedProperties?.[DIRECTION_MAP[direction]] ?? {};
}

/** The entry a value is offered under when nobody published it: its own name, label and range. */
function entryForChannel(name, channel) {
  const entry = {
    channel: name,
    label: String(channel?.label || name),
    type: String(channel?.type ?? 'float'),
    enabled: true,
  };
  for (const key of ['min', 'max', 'step', 'defaultValue']) {
    if (channel?.[key] !== undefined) entry[key] = channel[key];
  }
  if (Array.isArray(channel?.values)) entry.values = [...channel.values];
  return entry;
}

/**
 * The values offered in one direction ('input' to bind or link into, 'output' to link out of), as
 * `[name, entry]` pairs: published entries first, under their published names, then every other
 * value the author has not kept in, under its channel name. `includeInternal` adds the kept-in
 * values too (the "allInternals" link policy, the escape hatch that says so).
 */
export function panelValueEntries(control, direction = 'input', { includeInternal = false } = {}) {
  if (!DIRECTION_MAP[direction]) return [];
  const channels = channelsOf(control);
  const out = [];
  const claimed = new Set();
  for (const [name, entry] of Object.entries(publishedMap(control, direction))) {
    const channelName = String(entry?.channel || name);
    if (entry?.enabled === false) {
      if (!includeInternal) claimed.add(channelName);
      continue;
    }
    claimed.add(channelName);
    out.push([name, entry]);
  }
  for (const [name, channel] of Object.entries(channels)) {
    if (claimed.has(name) || !channel || typeof channel !== 'object') continue;
    if (!includeInternal && channel[DIRECTION_FLAG[direction]] === false) continue;
    out.push([name, entryForChannel(name, channel)]);
  }
  return out;
}

/** Whether the panel can use this value at all, in either direction. */
export function valueIsForPanel(control, channelName) {
  const wanted = String(channelName ?? '');
  return ['input', 'output'].some((direction) => panelValueEntries(control, direction)
    .some(([name, entry]) => String(entry?.channel || name) === wanted));
}

/**
 * The patch for the Settings tab's "Panel can use it" switch: the channel's two flags, and every
 * published entry that offers it, switched together, so switching it back on undoes what switching
 * it off did, whichever way the component was made.
 */
export function panelValuePatch(control, channelName, forPanel) {
  const name = String(channelName ?? '');
  if (!name || !channelsOf(control)[name]) return {};
  const on = forPanel === true;
  const patch = {
    [`ValueChannels.${name}.publicInput`]: on,
    [`ValueChannels.${name}.publicOutput`]: on,
  };
  for (const direction of ['input', 'output']) {
    for (const [entryName, entry] of Object.entries(publishedMap(control, direction))) {
      if (String(entry?.channel || entryName) !== name) continue;
      patch[`PublishedProperties.${DIRECTION_MAP[direction]}.${entryName}.enabled`] = on;
    }
  }
  return patch;
}

/** How many values the panel can bind or link into, and link out of: the library's counts. */
export function panelValueCounts(control) {
  return {
    inputs: panelValueEntries(control, 'input').length,
    outputs: panelValueEntries(control, 'output').length,
  };
}
