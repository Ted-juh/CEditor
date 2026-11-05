// valueSources.js — where a component's value takes its value from (a channel's `valueSource`), in
// the designer's words: the choices on Interact › Advanced › channel › Value From, and the line the
// Interact card shows for a value that follows something.
//
// A value follows another value of the same component (`channel:<name>`) or a knob or slider on the
// panel (its id); the runtime and the panel's preview set it as far along its range as its source is
// along its own (customComponentInteraction.js sourcedCustomValues). Create Component from Selection
// writes one for a meter that showed another control's value.

const NON_NUMERIC = new Set(['bool', 'enum', 'text', 'color']);

function channelsOf(component) {
  return component?._children?.ValueChannels?._children ?? {};
}

function flat(controls, out = []) {
  for (const control of controls ?? []) {
    if (!control) continue;
    out.push(control);
    const kids = control?._children?.Children?._children;
    if (kids) flat(Object.values(kids), out);
  }
  return out;
}

/** What a panel control is called in these words: a knob or a slider, by how it is drawn. */
function nounOf(control) {
  const type = String(control?._children?.Core?.controlType ?? '');
  if (type === 'Knob') return 'knob';
  if (type === 'Slider') return 'slider';
  return String(control?._children?.Behavior?.geometry ?? '') === 'circular' ? 'knob' : 'slider';
}

/** The knobs and sliders on the panel a value can follow: `{ id, name, noun }`, `component` left out. */
export function panelValueSources(panelControls, component = null) {
  const own = String(component?._children?.Core?.id ?? '');
  return flat(panelControls)
    .filter((control) => String(control?._children?.Behavior?.family ?? '') === 'range')
    .filter((control) => String(control?._children?.Core?.id ?? '') !== own)
    .map((control) => {
      const id = String(control._children.Core.id ?? '');
      return { id, name: String(control._children.Core.name ?? '').trim() || id, noun: nounOf(control) };
    })
    .filter((entry) => entry.id);
}

/**
 * The choices for a value's Value From: its own value, another numeric value of the component, a
 * knob or slider on the panel, and, kept so a select can still show it, a source that names a
 * control the panel does not have. `[{ value, label }]`.
 */
export function valueSourceChoices(component, channelName, panelControls) {
  const channels = channelsOf(component);
  const current = String(channels[channelName]?.valueSource ?? '').trim();
  const choices = [{ value: '', label: 'Its own value' }];
  for (const [name, channel] of Object.entries(channels)) {
    if (name === channelName || NON_NUMERIC.has(String(channel?.type ?? 'float'))) continue;
    choices.push({ value: `channel:${name}`, label: `${String(channel?.label ?? '').trim() || name} (a value of this component)` });
  }
  for (const source of panelValueSources(panelControls, component)) {
    choices.push({ value: source.id, label: `${source.name} (a ${source.noun} on the panel)` });
  }
  if (current && !choices.some((choice) => choice.value === current)) {
    choices.push({ value: current, label: current.startsWith('channel:') ? `${current.slice(8)} (a value this component no longer has)` : `${current} (not on this panel)` });
  }
  return choices;
}

/** What a value follows, as the Interact card says it ("follows Cutoff, a knob on the panel"), or ''. */
export function describeValueSource(component, channelName, panelControls) {
  const source = String(channelsOf(component)[channelName]?.valueSource ?? '').trim();
  if (!source) return '';
  if (source.startsWith('channel:')) {
    const name = source.slice(8);
    const channel = channelsOf(component)[name];
    return channel ? `follows ${String(channel.label ?? '').trim() || name}, a value of this component` : `follows ${name}, a value this component no longer has`;
  }
  const control = panelValueSources(panelControls, component).find((entry) => entry.id === source);
  return control ? `follows ${control.name}, a ${control.noun} on the panel` : 'follows a control that is not on this panel';
}
