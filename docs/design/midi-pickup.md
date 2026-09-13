# Optional MIDI pickup

In Controller, select an assigned control with a learned CC binding. Its existing
inspector offers **MIDI mode** (Absolute or Relative 1/127). Absolute mode also
offers **Pickup**, off by default. Relative means CC value 1 increments one step
and 127 decrements one step; other relative encodings are not inferred. Choosing
Relative hides pickup while retaining its preference for a later return to Absolute.
Pads and note bindings do not expose these continuous-control options.

The dedicated CTRL49 broker already supplies relative encoder deltas through
`nudgeControlSlot` and remains unchanged. The new options govern ordinary learned
CC bindings, not the physical appearance of a control or a guessed device model.

An absolute control with pickup waits until its physical position reaches or
crosses the software target, allowing one MIDI step of tolerance. It then follows
freely. A subsequent software/preset change rearms pickup. Comparison uses the
mapped range and inversion; modulated parameters use the base value that the
binding actually edits. On-screen writes, dedicated encoder nudges, note bindings
and toggle pads never wait for pickup.

The Controller drawing, its inspector, the control-page value and Stage show a
small up/down arrow only while waiting after a physical movement. The explanation
is in the arrow's tooltip/accessibility label. Waiting memory is transient and
cleared on session restoration or a changed binding; only `midiPickup` and
`midiRelative` persist on each ControlSlot. Older sessions default both fields off.

Controller ingress remains bounded to 64 coalesced messages. Absolute extrema
retain a fast crossing between drains. Relative offsets and clamped limits retain
multiple turns and endpoint reversals without allocating an event per tick.
Runtime pickup entries are removed when their slot disappears or becomes ineligible;
state is announced only when the direction changes.

Validation: `midiPickup.test.js` covers UI defaults, mode changes and direction
normalization. The Controller browser check covers settings, arrows and existing
drag/drop and learning. `InstrumentHostServiceTests::testMidiPickup` covers native
learning, takeover, external changes, mapped ranges, relative bursts and endpoint
reversals, persistence and bypass paths. Native tests are added but have not been
compiled or run; the application build remains the user's step.
