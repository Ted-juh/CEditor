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
