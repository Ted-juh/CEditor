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
 * `message` is a discriminator with one value today. NRPN, notes and bend are all bindable in
 * principle and none of them is implemented; a field is cheaper than a third kind later.
 */

export const MIDI_CONTROL_KIND = 'midiControl';

/** The only message type implemented. Anything else is refused rather than half-handled. */
const SUPPORTED = new Set(['cc']);

const int = (value, fallback = 0) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : fallback;
};

export function isMidiControlBinding(binding) {
  return binding?.kind === MIDI_CONTROL_KIND
    && SUPPORTED.has(String(binding?.message ?? 'cc'))
    && int(binding?.controller, -1) >= 0
    && int(binding?.controller, -1) <= 127;
}

/**
 * Does this inbound event belong to this binding?
 *
 * Takes the event shape `expressionEvent` already produces — { kind, channel, cc, value } with
 * channel 1-16 — so nothing here re-parses MIDI.
 */
export function matchesMidiControl(binding, event) {
  if (!isMidiControlBinding(binding) || event?.kind !== 'cc') return false;
  if (int(event.cc, -1) !== int(binding.controller, -1)) return false;
  const wanted = int(binding.channel, 0);
  return wanted === 0 || wanted === int(event.channel, 0);
}

/** The bytes a control sends when it moves. Null when the binding or the value cannot make one. */
export function midiControlMessage(binding, value) {
  if (!isMidiControlBinding(binding)) return null;
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return null;
  const channel = Math.min(16, Math.max(1, int(binding.channel, 0) || 1));
  const byte = (n) => (n & 0xff).toString(16).toUpperCase().padStart(2, '0');
  return `${byte(0xb0 + channel - 1)} ${byte(int(binding.controller, 0) & 0x7f)} ${byte(Math.min(127, Math.max(0, number)))}`;
}

/** "CC 74" / "CC 74 · ch 3" — what the binding is, in the words a synth manual uses. */
export function midiControlLabel(binding) {
  if (!isMidiControlBinding(binding)) return '';
  const channel = int(binding.channel, 0);
  return `CC ${int(binding.controller, 0)}${channel ? ` · ch ${channel}` : ''}`;
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
export function midiControlBindingFrom({ controller, port = 'value', deviceRole = '' }) {
  const cc = int(controller, -1);
  if (cc < 0 || cc > 127) return null;
  return {
    kind: MIDI_CONTROL_KIND,
    port: String(port || 'value'),
    deviceRole: String(deviceRole ?? ''),
    message: 'cc',
    controller: cc,
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
export function midiControlParameterShape(controller) {
  const cc = int(controller, 0);
  return { id: `cc${cc}`, name: `CC ${cc}`, type: 'integer', range: { min: 0, max: 127 } };
}
