/**
 * Reassembling an NRPN — or an RPN — from the CCs it is made of.
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
 * RPN IS THE SAME MACHINE with 101/100 as the selector instead of 99/98, which is why it lives here
 * rather than in a parallel module. Crucially it is not a SECOND selection: both flavours are set
 * by CC pairs and read by the same Data Entry bytes, so a channel has exactly one selection at a
 * time and the most recent selector wins. Two independent trackers would both claim the next CC 6.
 *
 * Four details that are corrections rather than choices:
 *
 *   DATA ENTRY MSB ZEROES THE LSB. Sending CC 6 conventionally resets the fine byte, so a 14-bit
 *   reader that kept the previous LSB would briefly report a value mixing two different settings.
 *
 *   A SELECTION OF EITHER FLAVOUR REPLACES THE OTHER. CC 101/100 select a *registered* parameter —
 *   pitch bend range, tuning — and the Data Entry that follows belongs to that, not to whatever
 *   NRPN was selected earlier. Without this, setting a synth's bend range drives an NRPN-bound
 *   control. Switching flavour also drops the half-selection: an RPN MSB after an NRPN MSB must not
 *   inherit the NRPN's LSB.
 *
 *   127:127 IS NULL, NOT A PARAMETER. Both flavours reserve it for "nothing selected", and it is
 *   what this app's own sender writes when a binding asks for nullAfterSend. Treating it as a
 *   parameter would attribute every later stray Data Entry to it.
 *
 * Reset All Controllers (CC 121) clears the selection for the same reason: a device that resets
 * controllers mid-stream would otherwise leave a stale one, and the next Data Entry would be read
 * against the old parameter. It used not to — expressionEvent() dropped every controller from 120
 * up, and making one arrive was thought to mean widening a reducer the Router shares. It does not:
 * CC 121 arrives as its own `controllerReset` kind, and every other consumer gates on kind, so it
 * reaches this machine and is inert in all of them.
 *
 */

/** Per channel: which parameter is selected, of which flavour, and the value bytes seen for it. */
export const EMPTY_NRPN_STATE = Object.freeze({ channels: {} });

const NRPN_MSB = 99;
const NRPN_LSB = 98;
const RPN_MSB = 101;
const RPN_LSB = 100;
const DATA_MSB = 6;
const DATA_LSB = 38;

/** The CC numbers that are selector/data plumbing rather than controllers in their own right. */
export const NRPN_CONTROLLERS = new Set([NRPN_MSB, NRPN_LSB, RPN_MSB, RPN_LSB, DATA_MSB, DATA_LSB]);

/** 127:127 is the reserved "nothing selected" pair, for both flavours. */
const isNull = (selection) => selection?.msb === 127 && selection?.lsb === 127;

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
  // Reset All Controllers clears the selection on its channel — see expressionEvent(). Handled
  // before the `cc` gate because it is deliberately not a cc event.
  if (event?.kind === 'controllerReset') {
    const resetChannel = Number(event.channel) || 0;
    if (!(resetChannel in current.channels)) return unchanged;
    const channels = { ...current.channels };
    delete channels[resetChannel];
    return { state: { ...current, channels }, nrpn: null, consumed: false };
  }

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

  // A selector byte. Keep the other half only when the flavour is unchanged — an RPN MSB arriving
  // after an NRPN MSB must not inherit the NRPN's LSB and address a parameter nobody selected.
  const select = (flavour, half) => {
    const base = selection?.kind === flavour ? selection : {};
    return write({ ...base, kind: flavour, [half]: value, dataLsb: 0 });
  };
  if (cc === NRPN_MSB) return select('nrpn', 'msb');
  if (cc === NRPN_LSB) return select('nrpn', 'lsb');
  if (cc === RPN_MSB) return select('rpn', 'msb');
  if (cc === RPN_LSB) return select('rpn', 'lsb');

  if (cc !== DATA_MSB && cc !== DATA_LSB) return unchanged;
  // Data Entry with nothing selected is an ordinary controller as far as this machine knows, and
  // the null pair counts as nothing selected.
  if (!selection || selection.msb === undefined || selection.lsb === undefined) return unchanged;
  if (isNull(selection)) return { state: current, nrpn: null, consumed: true };

  const dataMsb = cc === DATA_MSB ? value : (selection.dataMsb ?? 0);
  const dataLsb = cc === DATA_MSB ? 0 : value;   // a coarse write zeroes the fine byte
  const next = { ...selection, dataMsb, dataLsb };

  return {
    state: { ...current, channels: { ...current.channels, [channel]: next } },
    nrpn: {
      kind: selection.kind,
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
