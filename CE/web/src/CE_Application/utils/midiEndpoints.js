// midiEndpoints.js — what a row in the MIDI port lists can do.
//
// The device service lists outputs of four kinds: Preview Only and Disabled, which send nothing;
// the computer's MIDI ports; and two that never leave CEditor (DeviceProfileServiceLoopback.cpp):
// four internal cables, and the simulated device, which answers what a role sends from that role's
// profile. Inputs are No MIDI Input, the computer's ports, and the same four cables.
//
// "Is it hardware" and "does it send" were one question while hardware was the only thing that
// sent, and a dozen places asked it as `type === 'hardwareOutput'`. They are two questions now, so
// they are asked here, once each.

export const INTERNAL_CABLE = 'internalCable';
export const SIMULATED_DEVICE = 'simulatedDevice';

/** A port on the computer, not a choice CEditor provides. */
export function isHardwareEndpoint(endpoint) {
  return endpoint?.type === 'hardwareOutput' || endpoint?.type === 'hardwareInput';
}

/** Whether MIDI sent to this output goes anywhere: a port, a cable or the simulated device. */
export function outputSends(destination) {
  const type = destination?.type;
  return type === 'hardwareOutput' || type === INTERNAL_CABLE || type === SIMULATED_DEVICE;
}

/** Whether this input delivers MIDI: a port or a cable. */
export function inputReceives(input) {
  return input?.type === 'hardwareInput' || input?.type === INTERNAL_CABLE;
}

/**
 * Whether an answer to what a role sends can reach it: through its input, or because it sends to
 * the simulated device, which answers on the role itself and needs no input.
 */
export function repliesCanArrive(mapping) {
  return mapping?.midiDestination?.type === SIMULATED_DEVICE || inputReceives(mapping?.midiInput);
}
