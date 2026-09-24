/**
 * What the exported Player does with the synth when it starts, as pure functions so the rules are
 * testable off Windows. Player.svelte does the wiring.
 *
 * TWO SITUATIONS, TWO SOURCES OF TRUTH.
 *
 *   A new plugin instance has nothing of its own yet, so the synth is the truth: read its current
 *   patch as soon as the port opens, using the profile's own startup chain.
 *
 *   A reopened DAW project holds the patch that song was made with, so the project is the truth.
 *   Nothing is read automatically — that would overwrite the saved sound with whatever the synth
 *   was left on. The processor's restore policy decides (Send / Load from the synth / Not now /
 *   Never). All the Player does on connect is ask the synth who it is, which changes nothing and
 *   is what lets the processor see a ready device and put the question at all.
 */

import { countRolesInControls } from './deviceRoles.js';
import { DEFAULT_DEVICE_ROLE } from '../stores/deviceConstants.js';

/** The profile a panel ships with when it names none: the original slim GAIA demo profile. */
export const LEGACY_PROFILE_ID = 'roland-gaia';

/**
 * The role and profile this panel's controls are actually bound to.
 *
 * The Player used to connect every panel as `mainSynth` with the slim demo profile. A panel that
 * binds its own role — the GAIA SH-01 panel binds all 278 of its bindings to "Roland GAIA SH-01" —
 * then sent every edit to a role nothing had mapped, and the processor's restore waited for that
 * role to become ready until it gave up. Precedence: the panel's declared requirement, then the
 * role most of its bindings use, then the legacy default.
 */
export function playerDeviceTarget(panel) {
  const required = Array.isArray(panel?.requiredProfiles) ? panel.requiredProfiles.find((r) => r?.role) : null;
  const counts = countRolesInControls(panel?.controls ?? []);
  const mostBound = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const deviceRole = String(required?.role || mostBound || DEFAULT_DEVICE_ROLE);
  const profileId = String(required?.profileId
    || panel?.deviceSession?.[deviceRole]?.profileId
    || panel?.deviceSession?.[DEFAULT_DEVICE_ROLE]?.profileId
    || LEGACY_PROFILE_ID);
  return { deviceRole, profileId };
}

/** Does the profile's startup chain read anything beyond the identity handshake? */
export function hasStartupRead(profile) {
  const chain = Array.isArray(profile?.startup?.sync) ? profile.startup.sync : [];
  return chain.some((step) => {
    const request = String(step?.request ?? step ?? '');
    return request !== '' && request !== 'identityRequest';
  });
}

/**
 * What to do once the hardware port is open.
 *
 *   'pull'     run the profile's startup chain (identity first, then every patch block)
 *   'legacy'   identity, then the per-parameter RQ1 read — profiles whose chain reads nothing
 *   'identity' identity only: a restored project, where the restore decision owns the patch
 *   null       not yet: the profile source has not arrived, so the right read is not known
 */
export function startupReadPlan({ restored, profile }) {
  if (restored) return 'identity';
  if (!profile) return null;
  return hasStartupRead(profile) ? 'pull' : 'legacy';
}

/**
 * The first value the host pushes for each parameter after the panel loads is a SEED: it moves
 * the control to the saved or automated value and sends nothing. Sending it is what used to push
 * a reopened project at the synth the moment the window opened, whatever the restore policy said.
 * Every later value for that parameter is automation playback and does reach the synth.
 */
export function createHostSeedTracker() {
  const seeded = new Set();
  return {
    /** True the first time a parameter is seen; the caller moves the control and does not send. */
    isSeed(parameterId) {
      if (seeded.has(parameterId)) return false;
      seeded.add(parameterId);
      return true;
    },
    reset() { seeded.clear(); },
  };
}
