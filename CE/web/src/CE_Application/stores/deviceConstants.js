/**
 * Shared device-layer constants. These strings/numbers used to be repeated inline across the
 * device stores, scripting emitters, and UI — import from here instead of retyping them.
 */

/** The primary synth role every unscoped device operation targets. */
export const DEFAULT_DEVICE_ROLE = 'mainSynth';

/**
 * How long (ms) an outbound parameter send suppresses the device's echo of the same value.
 * Overridable per role mapping (timingOverrides.echoWindowMs) or per profile source
 * (timing.echoWindowMs); this default is deliberately conservative — a too-short window makes
 * slow devices' late ACKs look like conflicts.
 */
export const DEFAULT_ECHO_WINDOW_MS = 500;
