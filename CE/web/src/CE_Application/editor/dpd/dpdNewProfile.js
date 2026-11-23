// dpdNewProfile.js — what a new device profile starts as in the Device Profile Designer.
//
// File → New Device Profile used to open the Designer on Detect devices and nothing else: with no
// model there was nothing to edit, and Save to engine refused a profile it had no file for. The
// engine also refuses a profile with no parameters (DeviceProfileEngine: "At least one parameter is
// required"), so an empty model could not have been saved even then.
//
// So a new profile starts as a copy of Generic MIDI CC — the standard controllers every synth
// answers (modulation, volume, pan, expression, sustain…) — under its own id and name. It is a
// working profile from the first moment: bind controls to it, delete what the synth does not have,
// add its own parameters, and Save to engine gives it a file of its own (DeviceProfileService).
// Detect devices can still replace it with what a MIDI-CI device says about itself.

import { deepClone } from '../../utils/deepClone.js';

export const NEW_PROFILE_BASE = 'generic.cc';

/** The model a new profile `{ id, name }` starts as, from the bundled library. Null without the base. */
export function newProfileModel(library, { id, name } = {}) {
  const base = library?.[NEW_PROFILE_BASE];
  if (!base || !id) return null;
  const model = deepClone(base);
  model.id = String(id);
  model.label = String(name ?? '').trim() || 'New Device Profile';
  model.version = '0.1.0';
  model.completeness = 'partial';
  model.provenance = {
    source: 'local',
    verifiedRoundTrip: false,
    verifiedOnHardware: null,
    confirmations: 0,
    contributors: [],
    note: 'Started from Generic MIDI CC in the Device Profile Designer.',
  };
  return model;
}
