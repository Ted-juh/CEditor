// componentPhases.js — where a running component is in its sequence, and a way to move it there, for
// the script runtime.
//
// The preview keeps an arpeggiator's position in its own state (PanelPreviewSurface's ticker),
// transient and never in the panel: the stored `phase` is only where it starts when the preview
// opens. A script's phase() wrote that stored number and nothing read it again, so a running arp
// never moved and read(t, "phase") answered the number written rather than where the arp was. So
// the preview provides both answers here while it is mounted, as it does a display's layout
// (displayLayouts.js), and phase() is a seek: nothing is written to the panel.
//
// With no preview nothing runs. A seek is kept until one opens, and it starts from there.

let provider = null;
const pending = {};   // controlId -> phase, until a preview takes it

/**
 * Called by the preview while it is mounted: `where(controlId)` gives the phase a component is at
 * (or null when the preview does not run it), `seek(controlId, phase)` moves it there. Returns the
 * call that withdraws them.
 */
export function provideComponentPhases(next) {
  provider = next;
  return () => { if (provider === next) provider = null; };
}

/** The phase a component is at now, 0..1; null when nothing knows (read falls back to the stored one). */
export function phaseNow(controlId) {
  const id = String(controlId ?? '');
  if (!id) return null;
  const at = provider ? provider.where(id) : pending[id];
  return Number.isFinite(at) ? at : null;
}

/** Move a component to a phase: at once in a running preview, or where the next one starts. */
export function seekPhase(controlId, phase) {
  const id = String(controlId ?? '');
  if (!id) return;
  if (provider) provider.seek(id, phase);
  else pending[id] = phase;
}

/** The seek made while no preview ran, for the preview that opens next; taken once. */
export function takePendingPhase(controlId) {
  const id = String(controlId ?? '');
  if (!(id in pending)) return undefined;
  const at = pending[id];
  delete pending[id];
  return at;
}
