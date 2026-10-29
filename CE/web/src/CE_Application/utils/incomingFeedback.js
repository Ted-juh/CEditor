import { pageIndexForValue } from './tabContainerLayout.js';

/** Keep the latest message for each port of each control within one animation frame. */
export function queueIncomingFeedback(pending, controlId, port, value) {
  if (!controlId) return pending;
  const next = pending ?? {};
  (next[controlId] ??= {})[String(port ?? 'value')] = value;
  return next;
}

/** Flatten the coalesced frame. The session store compares against the live displayed value. */
export function incomingFeedbackEntries(pending) {
  const entries = [];
  for (const [controlId, ports] of Object.entries(pending ?? {})) {
    for (const [port, value] of Object.entries(ports)) {
      entries.push({ controlId, port, value });
    }
  }
  return entries;
}

/**
 * What a decoded value does to the control it is bound to, by the binding's port.
 *
 * Display ports drive the panel's lighting and text rather than a value, so a display bound
 * directly to a device parameter responds live. A Tabbed Container's page turns, beside its other
 * live sections: the value is the wire value the player decoded, which is the page's number, as
 * the strip sends it. Everything else is the control's value.
 */
export function incomingFeedbackPatch(port, value, { control = null, session = null } = {}) {
  if (port === 'brightness') return { brightnessOverride: Math.max(0, Math.min(100, Math.round((Number(value) / 127) * 100))) };
  if (port === 'backlight') return { backlightOverride: Number(value) >= 64 };
  if (port === 'text') return { textOverride: String(value) };
  if (port === 'pageIndex') {
    const index = pageIndexForValue(control, value);
    if (index === null) return null;
    const sections = session?.sectionValues ?? {};
    return { sectionValues: { ...sections, TabContainer: { ...(sections.TabContainer ?? {}), pageIndex: index } } };
  }
  return { valueOverrideEnabled: true, valueOverride: value };
}
