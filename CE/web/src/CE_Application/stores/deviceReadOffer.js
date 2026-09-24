/**
 * The editor's offer to read a synth when it connects.
 *
 * Until it has read the instrument, a panel shows its own values — for the GAIA every tone and
 * effect reads OFF — and nothing says the synth is playing something else. The exported Player
 * reads a new instance's synth by itself (see utils/playerStartup.js). The editor asks instead:
 * it is where a panel is being built, and a read that silently replaced the values under the
 * author's hands would be the wrong surprise. Asked once per role and port in a session, never
 * again after "Not now", and only for a profile whose startup chain reads more than the identity
 * — offering to read an instrument that cannot be read is a question with no good answer.
 *
 * A read changes nothing on the synth.
 */

import { get } from 'svelte/store';
import { deviceRoleMappings, profileSources } from './deviceProfileStores.js';
import { requestProfileSource } from './deviceProfileSession.js';
import { startDeviceSync } from './deviceMidiOps.js';
import { openDialog } from './scriptUi.js';
import { hasStartupRead } from '../utils/playerStartup.js';

export const READ_NOW = 'Read now';
export const NOT_NOW = 'Not now';

/** "role\0port" for a mapping on real hardware, or null. */
export function readOfferKey(role, mapping) {
  const dest = mapping?.midiDestination;
  if (!role || dest?.type !== 'hardwareOutput' || !dest.id) return null;
  return `${role}\u0000${dest.id}`;
}

/**
 * Which roles to offer a read for right now. Pure: the mappings, the profile sources as loaded,
 * and the keys already offered this session.
 *
 * A role whose profile source has not arrived yet is returned under `waiting`, so the caller can
 * fetch it; it is offered when it lands, not skipped.
 */
export function readOfferCandidates(mappings, sources, offered) {
  const ready = [];
  const waiting = [];
  for (const [role, mapping] of Object.entries(mappings ?? {})) {
    const key = readOfferKey(role, mapping);
    if (!key || offered.has(key)) continue;
    const profileId = String(mapping?.profileId ?? '');
    if (!profileId) continue;
    const text = sources?.[profileId]?.source;
    if (!text) { waiting.push({ role, profileId }); continue; }
    let profile = null;
    try { profile = JSON.parse(text); } catch { continue; }
    if (!hasStartupRead(profile)) continue;
    const name = String(mapping?.midiDestination?.name ?? '') || role;
    ready.push({ key, role, profileId, name });
  }
  return { ready, waiting };
}

const offered = new Set();
let started = false;

function offerNext() {
  const { ready, waiting } = readOfferCandidates(get(deviceRoleMappings), get(profileSources), offered);
  for (const { profileId } of waiting) requestProfileSource(profileId);
  const next = ready[0];
  if (!next) return;
  const id = openDialog({
    title: `Read the current patch from ${next.role}?`,
    message: `The panel shows its own values until it has read the synth on ${next.name}. `
      + 'Reading changes nothing on the synth.',
    buttons: [READ_NOW, NOT_NOW],
    default: READ_NOW,
  }, (choice) => {
    if (choice === READ_NOW) {
      startDeviceSync({ deviceRole: next.role, profileId: next.profileId, syncDirection: 'pull', dryRun: false });
    }
    // Another role may have connected while this one was on screen.
    offerNext();
  });
  // Marked only once it is actually on screen. With another dialog already open, openDialog
  // declines, and the offer stays due for the next change rather than being lost.
  if (id != null) offered.add(next.key);
}

/** Start offering. Editor only — the Player makes this decision itself. Idempotent. */
export function initDeviceReadOffer() {
  if (started) return;
  started = true;
  deviceRoleMappings.subscribe(() => offerNext());
  profileSources.subscribe(() => offerNext());
}
