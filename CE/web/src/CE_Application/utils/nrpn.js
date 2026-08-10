/**
 * Reassembling an NRPN from the CCs it is made of.
 *
 * Every other message this app binds is self-describing: a CC says which controller and what value
 * in three bytes. An NRPN does not exist as a message at all. It is a convention over four ordinary
 * CCs — 99 and 98 select a parameter number, then 6 (and optionally 38) carry the value — so a
 * Data Entry byte means nothing without remembering what was selected before it, on that channel.
 * That is why this is a reducer with state and everything else is a predicate.
 *
 * Written against DeviceProfileEngine.cpp's NRPN recipe builder, which is the app's existing
 * outbound construction: CC 99 = parameter MSB, CC 98 = parameter LSB, CC 6 = value (or value MSB),
 * CC 38 = value LSB when the recipe asks for 14 bits. Reading has to accept exactly what writing
 * produces or a panel could not follow its own output.
 *
 * Three details that are corrections rather than choices:
 *
 *   DATA ENTRY MSB ZEROES THE LSB. Sending CC 6 conventionally resets the fine byte, so a 14-bit
 *   reader that kept the previous LSB would briefly report a value mixing two different settings.
 *
 *   AN RPN SELECTION CANCELS THE NRPN. CC 101/100 select a *registered* parameter — pitch bend
 *   range, tuning — and the Data Entry that follows belongs to that, not to whatever NRPN was
 *   selected earlier. Without this, setting a synth's bend range would drive an NRPN-bound control.
 *
 * Reset All Controllers (CC 121) should clear the selection for the same reason and does not:
 * expressionEvent() in midiNoteInput.js drops every controller from 120 up, so it never arrives
 * here. Making it arrive means widening a reducer the Router shares, which is not worth doing for
 * this — but a device that resets controllers mid-stream will leave a stale selection, and a Data
 * Entry after it would be read against the old parameter.
 *
 * RPN itself is not reassembled. It would be the same machine with 101/100, and nothing binds it.
 */

/** Per channel: which parameter is selected, and the value bytes seen for it. */
export const EMPTY_NRPN_STATE = Object.freeze({ channels: {} });

const NRPN_MSB = 99;
const NRPN_LSB = 98;
const RPN_MSB = 101;
const RPN_LSB = 100;
const DATA_MSB = 6;
const DATA_LSB = 38;

/** The CC numbers that are NRPN plumbing rather than controllers in their own right. */
export const NRPN_CONTROLLERS = new Set([NRPN_MSB, NRPN_LSB, DATA_MSB, DATA_LSB]);

/**
 * Fold one CC event into the assembler.
 *
 * Returns `{ state, nrpn, consumed }`:
 *   `nrpn`     a complete reading — { channel, parameterMsb, parameterLsb, value7, value14 } — or
 *              null when this byte only moved the machine along.
 *   `consumed` true when the event was NRPN plumbing. A caller showing "what moved on the input"
 *              uses this to avoid offering CC 99, 98, 6 and 38 as four meaningless controllers
 *              every time one NRPN knob is turned.
 *
 * A Data Entry with nothing selected is NOT consumed: some gear uses CC 6 on its own, and swallowing
 * it would make a real controller disappear.
 */
export function applyNrpnEvent(state, event) {
  const current = state ?? EMPTY_NRPN_STATE;
  const unchanged = { state: current, nrpn: null, consumed: false };
  if (event?.kind !== 'cc') return unchanged;

  const channel = Number(event.channel) || 0;
  const cc = Number(event.cc);
  const value = Number(event.value) & 0x7f;
  const selection = current.channels[channel] ?? null;

  const write = (next) => ({
    state: { ...current, channels: { ...current.channels, [channel]: next } },
    nrpn: null,
    consumed: true,
  });

  if (cc === NRPN_MSB) return write({ ...(selection ?? {}), msb: value, dataLsb: 0 });
  if (cc === NRPN_LSB) return write({ ...(selection ?? {}), lsb: value, dataLsb: 0 });

  // An RPN selection takes the NRPN out of scope. Not consumed: CC 101/100 are a selection in their
  // own right and a caller may want to see them.
  if (cc === RPN_MSB || cc === RPN_LSB) {
    if (!selection) return unchanged;
    const channels = { ...current.channels };
    delete channels[channel];
    return { state: { ...current, channels }, nrpn: null, consumed: false };
  }

  if (cc !== DATA_MSB && cc !== DATA_LSB) return unchanged;
  // Data Entry with nothing selected is an ordinary controller as far as this machine knows.
  if (!selection || selection.msb === undefined || selection.lsb === undefined) return unchanged;

  const dataMsb = cc === DATA_MSB ? value : (selection.dataMsb ?? 0);
  const dataLsb = cc === DATA_MSB ? 0 : value;   // a coarse write zeroes the fine byte
  const next = { ...selection, dataMsb, dataLsb };

  return {
    state: { ...current, channels: { ...current.channels, [channel]: next } },
    nrpn: {
      kind: 'nrpn',
      channel,
      parameterMsb: selection.msb,
      parameterLsb: selection.lsb,
      value7: dataMsb,
      value14: (dataMsb << 7) | dataLsb,
    },
    consumed: true,
  };
}

/**
 * Fold a batch, keeping the events that were not NRPN plumbing.
 *
 * The shape callers actually want: one pass that both reassembles and tells them what is left over.
 */
export function applyNrpnEvents(state, events) {
  let current = state ?? EMPTY_NRPN_STATE;
  const assembled = [];
  const passthrough = [];
  for (const event of events ?? []) {
    const result = applyNrpnEvent(current, event);
    current = result.state;
    if (result.nrpn) assembled.push(result.nrpn);
    if (!result.consumed) passthrough.push(event);
  }
  return { state: current, assembled, passthrough };
}
