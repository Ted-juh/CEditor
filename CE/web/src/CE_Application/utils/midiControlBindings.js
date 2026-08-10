/**
 * Binding a control to a MIDI message rather than to a device parameter.
 *
 * Every binding in this app was a `deviceParameter`: a semantic id from a profile, which the engine
 * compiles into whatever bytes that instrument wants. That is the right model for an editor built
 * around a device profile, and it has one hard edge — a hardware controller the profile does not
 * describe cannot be bound to anything at all. A generic fader box, a knob the profile author never
 * mapped, any CC on a synth without a profile: MIDI learn could see them move and had nowhere to
 * put them. The learn chips made that visible by having to grey half of themselves out.
 *
 * So: a second kind. It carries the message instead of a name.
 *
 *   { kind: 'midiControl', port: 'value', deviceRole, message: 'cc', controller: 74, channel: 0 }
 *
 * NO SCALING, deliberately. A CC carries 0-127 and the control receives 0-127. That is exactly what
 * `deviceParameter` bindings already do — deviceBindingSync and the Player both hand the wire value
 * straight to the control's session, and controls are configured with matching ranges. Inventing a
 * mapping here would make two binding kinds behave differently in a way nothing else in the app
 * would explain.
 *
 * CHANNEL 0 MEANS ANY, following `polyPressureEntries(state, channel = 0)` — the convention already
 * in midiNoteInput.js. It is the default because it is what learn can honestly infer: the message
 * arrived on some channel, and that a controller was set to channel 3 today does not mean binding it
 * to channel 3 forever is what anyone meant. Sending needs one number, so channel 0 sends on 1.
 *
 * `message` says WHICH message. CC, channel aftertouch, note velocity, poly pressure, pitch bend,
 * NRPN and RPN are implemented; the table below records which of them a control can send as well as
 * follow, and why three of them are inbound-only.
 *
 * NRPN and RPN are the odd ones and worth reading nrpn.js for: neither is a message at all, both are
 * a convention over four CCs, so they are the only kinds whose inbound side needs a state machine
 * rather than a predicate. `numbered` marks them — they are addressed by a parameter number in two
 * halves rather than by a controller, and their value is 7- or 14-bit by declaration because the
 * wire cannot tell you which. RPN is the registered variant: same bytes, 101/100 selecting instead
 * of 99/98, and a handful of parameter numbers the spec itself names.
 */

export const MIDI_CONTROL_KIND = 'midiControl';

/**
 * The message types, and which way each one can go.
 *
 * The asymmetry is real rather than unfinished. A CC and channel pressure are both a controller
 * position, so a control can send one as easily as follow one. The other three cannot be sent:
 *
 *   velocity belongs to a note — there is no "send a velocity" without deciding which note to play,
 *   and a control that silently emitted note-ons would be a surprising thing for a fader to do.
 *
 *   polyAftertouch needs a note number for the same reason.
 *
 *   bend is 14 bits centred at 8192, and expanding a 0-127 control back into it puts centre at
 *   63.5 — not representable, so a control could never sit exactly at no-bend. Following a wheel is
 *   useful and honest; driving one from a 7-bit value is not.
 *
 * `learnable` marks the ones a chip can offer. Bend is authorable but not learnable, because the
 * learn reducer in midiNoteInput.js produces no bend candidate and is shared with the Router, whose
 * source list has no bend either — widening it there to serve this would break routerSettingsForLearned.
 */
export const MIDI_CONTROL_MESSAGES = [
  { id: 'cc', label: 'CC', eventKind: 'cc', sends: true, learnable: true },
  { id: 'aftertouch', label: 'Aftertouch', eventKind: 'aftertouch', sends: true, learnable: true },
  { id: 'velocity', label: 'Note velocity', eventKind: 'velocity', sends: false, learnable: true },
  { id: 'polyAftertouch', label: 'Poly pressure', eventKind: 'polyAftertouch', sends: false, learnable: true },
  { id: 'bend', label: 'Pitch bend', eventKind: 'bend', sends: false, learnable: false },
  { id: 'nrpn', label: 'NRPN', eventKind: 'nrpn', sends: true, learnable: true, numbered: true },
  { id: 'rpn', label: 'RPN', eventKind: 'rpn', sends: true, learnable: true, numbered: true },
];

/**
 * The RPNs the MIDI spec names. Only a label — the value semantics are the parameter's own business
 * and this cannot know them. Worth having because a manual says "set RPN 0:0" and means bend range.
 */
const RPN_NAMES = new Map([
  ['0:0', 'Pitch bend range'],
  ['0:1', 'Fine tuning'],
  ['0:2', 'Coarse tuning'],
  ['0:3', 'Tuning program'],
  ['0:4', 'Tuning bank'],
  ['0:5', 'Modulation depth range'],
]);

const BY_ID = new Map(MIDI_CONTROL_MESSAGES.map((m) => [m.id, m]));

/** The message spec a binding names, or null when it names one that is not implemented. */
export function midiControlMessageSpec(binding) {
  return BY_ID.get(String(binding?.message ?? 'cc')) ?? null;
}

/** Can moving the control send this? False for the three that are inbound-only. */
export function canSendMidiControl(binding) {
  return isMidiControlBinding(binding) && midiControlMessageSpec(binding)?.sends === true;
}

const int = (value, fallback = 0) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : fallback;
};

const isDataByte = (n) => n >= 0 && n <= 127;

export function isMidiControlBinding(binding) {
  if (binding?.kind !== MIDI_CONTROL_KIND) return false;
  const spec = midiControlMessageSpec(binding);
  if (!spec) return false;
  // NRPN and RPN are identified by a parameter number in two 7-bit halves, exactly as
  // DeviceProfileEngine.cpp's recipe writes it and as a synth manual prints it.
  if (spec.numbered) {
    return isDataByte(int(binding?.parameterMsb, -1)) && isDataByte(int(binding?.parameterLsb, -1));
  }
  // A controller number identifies a CC and means nothing for the others — requiring it everywhere
  // would refuse a perfectly good aftertouch binding for lacking a field it has no use for.
  if (spec.id !== 'cc') return true;
  return isDataByte(int(binding?.controller, -1));
}

/** 7 unless the binding says 14. Mirrors the recipe property C++ reads, `valueResolution`. */
export function midiControlResolution(binding) {
  return int(binding?.valueResolution, 7) === 14 ? 14 : 7;
}

/**
 * Does this inbound event belong to this binding?
 *
 * Takes the event shape `expressionEvent` already produces — { kind, channel, cc, value } with
 * channel 1-16 — so nothing here re-parses MIDI.
 */
export function matchesMidiControl(binding, event) {
  if (!isMidiControlBinding(binding)) return false;
  const spec = midiControlMessageSpec(binding);
  if (!spec || event?.kind !== spec.eventKind) return false;
  if (spec.id === 'cc' && int(event.cc, -1) !== int(binding.controller, -1)) return false;
  if (spec.numbered
    && (int(event.parameterMsb, -1) !== int(binding.parameterMsb, -1)
      || int(event.parameterLsb, -1) !== int(binding.parameterLsb, -1))) return false;
  const wanted = int(binding.channel, 0);
  return wanted === 0 || wanted === int(event.channel, 0);
}

/**
 * The number this event carries, for this binding.
 *
 * Only NRPN needs the binding to decide: the same reassembled event offers a 7-bit and a 14-bit
 * reading, and nothing on the wire says which one the device meant. Everything else is one byte.
 */
export function midiControlValue(binding, event) {
  if (!midiControlMessageSpec(binding)?.numbered) return event?.value;
  return midiControlResolution(binding) === 14 ? event?.value14 : event?.value7;
}

/**
 * The bytes a control sends when it moves. Null when the binding cannot send at all, or when the
 * value is not a number — there is no honest byte for that.
 */
export function midiControlMessage(binding, value) {
  if (!canSendMidiControl(binding)) return null;
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return null;
  const channel = Math.min(16, Math.max(1, int(binding.channel, 0) || 1));
  const byte = (n) => (n & 0xff).toString(16).toUpperCase().padStart(2, '0');
  const status = byte(0xb0 + channel - 1);
  const spec = midiControlMessageSpec(binding);

  if (spec.id === 'aftertouch') {
    return `${byte(0xd0 + channel - 1)} ${byte(Math.min(127, Math.max(0, number)))}`;   // one data byte
  }

  // Four CCs, in the order DeviceProfileEngine.cpp's recipe builder emits them, with the selector
  // pair that matches the flavour: 99/98 for an NRPN, 101/100 for an RPN. C++ splits a multi-message
  // stream on the way out (PluginProcessor: "bytes may be a multi-message stream — e.g. NRPN = 4
  // CCs"), so returning them as one hex run is what the send path already expects.
  if (spec.numbered) {
    const [selMsb, selLsb] = spec.id === 'rpn' ? [101, 100] : [99, 98];
    const wide = midiControlResolution(binding) === 14;
    const value = Math.min(wide ? 16383 : 127, Math.max(0, number));
    const parts = [
      `${status} ${byte(selMsb)} ${byte(int(binding.parameterMsb, 0))}`,
      `${status} ${byte(selLsb)} ${byte(int(binding.parameterLsb, 0))}`,
      `${status} ${byte(6)} ${byte(wide ? (value >> 7) & 0x7f : value)}`,
    ];
    if (wide) parts.push(`${status} ${byte(38)} ${byte(value & 0x7f)}`);
    // The null selection C++ writes when a recipe asks for it, so a following Data Entry from
    // anything else cannot land on this parameter.
    if (binding.nullAfterSend === true) parts.push(`${status} ${byte(selMsb)} 7F`, `${status} ${byte(selLsb)} 7F`);
    return parts.join(' ');
  }

  const data = byte(Math.min(127, Math.max(0, number)));
  return `${status} ${byte(int(binding.controller, 0) & 0x7f)} ${data}`;
}

/** "NRPN 1:32" / "RPN 0:0 · Pitch bend range" — the way a manual prints it, named where it is named. */
function numberedLabel(spec, msb, lsb) {
  const pair = `${int(msb, 0)}:${int(lsb, 0)}`;
  const known = spec.id === 'rpn' ? RPN_NAMES.get(pair) : null;
  return `${spec.label} ${pair}${known ? ` · ${known}` : ''}`;
}

/** "CC 74" / "Aftertouch · ch 3" — what the binding is, in the words a synth manual uses. */
export function midiControlLabel(binding) {
  if (!isMidiControlBinding(binding)) return '';
  const spec = midiControlMessageSpec(binding);
  const channel = int(binding.channel, 0);
  const head = spec.id === 'cc' ? `CC ${int(binding.controller, 0)}`
    : spec.numbered ? numberedLabel(spec, binding.parameterMsb, binding.parameterLsb)
    : spec.label;
  return `${head}${channel ? ` · ch ${channel}` : ''}`;
}

/**
 * The active midiControl bindings of a control.
 *
 * Mirrors `activeDeviceBindings`, including the `enabled === false` gate, so turning a component's
 * bindings off turns off both kinds rather than only the one the reader happened to know about.
 */
export function activeMidiControlBindings(control) {
  const section = control?._children?.DeviceBindings;
  if (section?.enabled === false) return [];
  const bindings = section?.bindings;
  return Array.isArray(bindings) ? bindings.filter(isMidiControlBinding) : [];
}

/**
 * A binding built from a learn chip.
 *
 * Channel is dropped on purpose — see the note above. `dryRun` follows the drag-to-bind default for
 * device parameters, which is to compile and monitor rather than send until someone says otherwise.
 */
export function midiControlBindingFrom({
  message = 'cc', controller, parameterMsb, parameterLsb, valueResolution,
  port = 'value', deviceRole = '',
}) {
  const spec = BY_ID.get(String(message));
  if (!spec) return null;
  const cc = int(controller, -1);
  if (spec.id === 'cc' && !isDataByte(cc)) return null;
  const msb = int(parameterMsb, -1);
  const lsb = int(parameterLsb, -1);
  if (spec.numbered && (!isDataByte(msb) || !isDataByte(lsb))) return null;
  return {
    kind: MIDI_CONTROL_KIND,
    port: String(port || 'value'),
    deviceRole: String(deviceRole ?? ''),
    message: spec.id,
    ...(spec.id === 'cc' ? { controller: cc } : {}),
    ...(spec.numbered
      ? { parameterMsb: msb, parameterLsb: lsb, valueResolution: int(valueResolution, 7) === 14 ? 14 : 7 }
      : {}),
    channel: 0,
    dryRun: true,
    feedback: { receiveUpdates: true },
  };
}

/**
 * What a CC looks like to code that asks about device parameters.
 *
 * getBindingCompatibility — which decides whether a control can accept a drop, and drives the
 * highlight on every control during a drag — reads a parameter's `type` and `range`. A CC is a
 * 0-127 integer, so this is not a stand-in for a parameter so much as an honest description of one
 * that happens not to come from a profile.
 */
export function midiControlParameterShape({
  message = 'cc', controller = 0, parameterMsb = 0, parameterLsb = 0, valueResolution = 7,
} = {}) {
  const spec = BY_ID.get(String(message)) ?? BY_ID.get('cc');
  const cc = int(controller, 0);
  if (spec.numbered) {
    const wide = int(valueResolution, 7) === 14;
    return {
      id: `${spec.id}${int(parameterMsb, 0)}_${int(parameterLsb, 0)}`,
      name: numberedLabel(spec, parameterMsb, parameterLsb),
      type: 'integer',
      range: { min: 0, max: wide ? 16383 : 127 },
    };
  }
  const id = spec.id === 'cc' ? `cc${cc}` : spec.id;
  const name = spec.id === 'cc' ? `CC ${cc}` : spec.label;
  return { id, name, type: 'integer', range: { min: 0, max: 127 } };
}
