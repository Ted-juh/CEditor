// autoPanelActions.js — "generate a panel from this device profile", as a command.
//
// The generator (`utils/autoPanel.js`) is pure and knows nothing about the editor. This is the
// half that finds the profile, waits for it if the engine has not sent it yet, and puts the result
// in a tab.
//
// WHY WAITING IS THE INTERESTING PART. `deviceProfiles` is a LIST — id, name, file path — and does
// not carry the parameters. The parameters live in the profile's source text, which the engine
// sends on request and caches in `profileSources`. So a profile the user has never opened has no
// source in the store, and generating from it means asking and then waiting for an event. Every
// other reader of `profileSources` in the app is reactive and can simply return null and re-run
// when the source lands; a command invoked from a menu has one shot and has to await it.

import { get } from 'svelte/store';

import { cerror, cinfo, cwarn } from './console.js';
import { addPanel } from './panels.js';
import { createPanel } from './panelModel.js';
import { deviceProfiles, profileSources } from './deviceProfileStores.js';
import { requestProfileSource } from './deviceProfileSession.js';
import { autoPanelPlan } from '../utils/autoPanel.js';

/** How long to wait for the engine to send a profile's source before giving up on it. */
const SOURCE_TIMEOUT_MS = 8000;

/** Past this many controls, say the number out loud before building it. */
const LARGE_PANEL_CONTROLS = 600;

function parseProfileSource(text) {
  try {
    const parsed = JSON.parse(String(text ?? ''));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The parsed profile for an id, asking the engine for it if the store has not got it yet.
 *
 * Resolves null on timeout rather than rejecting: "the profile did not arrive" is an outcome the
 * caller reports, not an exception it handles.
 */
export function profileById(profileId) {
  const id = String(profileId ?? '').trim();
  if (!id) return Promise.resolve(null);

  const cached = parseProfileSource(get(profileSources)?.[id]?.source);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), SOURCE_TIMEOUT_MS);
    const unsubscribe = profileSources.subscribe((sources) => {
      const parsed = parseProfileSource(sources?.[id]?.source);
      if (parsed) finish(parsed);
    });

    requestProfileSource(id);
  });
}

/**
 * Build a panel from a device profile and open it.
 *
 * Everything the generator could not place is reported rather than dropped, because a generated
 * panel is exactly the kind of artefact whose gaps have no symptom: 793 controls appear, one
 * parameter is missing, and nobody notices until they go looking for it on the hardware.
 */
export async function generatePanelFromProfile(profileId, options = {}) {
  const id = String(profileId ?? '').trim();
  const listed = get(deviceProfiles)?.find((item) => String(item?.id ?? '') === id) ?? null;
  const label = listed?.name || id || 'device profile';

  const profile = await profileById(id);
  if (!profile) {
    cerror(`[auto-panel] Could not read the profile for "${label}" — the engine did not send its source.`);
    return null;
  }

  const parameterCount = profile.parameters?.length ?? 0;
  if (parameterCount === 0) {
    cwarn(`[auto-panel] "${label}" declares no parameters, so there is nothing to generate.`);
    return null;
  }

  const plan = autoPanelPlan(profile, options);
  if (plan.controls.length >= LARGE_PANEL_CONTROLS) {
    cinfo(`[auto-panel] ${parameterCount} parameters — building ${plan.controls.length} controls, `
      + 'this will be a tall panel.');
  }

  const panel = createPanel(`${profile.name ?? label} (generated)`);
  panel.controls = plan.controls;
  panel.width = plan.width;
  panel.height = plan.height;
  panel.requiredProfiles = plan.requiredProfiles;
  addPanel(panel);

  cinfo(`[auto-panel] ✓ ${plan.placed} parameter(s) across ${plan.groups.length} group(s) → `
    + `"${panel.name}". Save it to keep it.`);
  for (const skip of plan.skipped) cwarn(`[auto-panel] skipped ${skip.id}: ${skip.reason}`);
  if (plan.substitutions.length) {
    cwarn(`[auto-panel] ${plan.substitutions.length} parameter(s) got a component the profile did not ask for:`);
    for (const sub of plan.substitutions.slice(0, 10)) cwarn(`  ${sub.id} → ${sub.type} (${sub.reason})`);
    if (plan.substitutions.length > 10) cwarn(`  …and ${plan.substitutions.length - 10} more.`);
  }

  return panel;
}
