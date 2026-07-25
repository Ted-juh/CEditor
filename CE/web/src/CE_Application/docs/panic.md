# Panic — silence everything

> Status: **shipped 🟢**. The button every hardware synth has, and the one thing
> the panel couldn't do. Part of the [panel parts backlog](./README.md).

## What it is

One button, three jobs — and the third is the one that matters.

1. Stops the panel's own note controls: [Chord Pad](./chord-pad.md) pads, a
   running [Arpeggiator](./arpeggiator.md), a held
   [Ribbon](./ribbon-keyboard.md), latched [Drum Pads](./drum-pads.md).
2. Clears the [echoed note display](./note-input-echo.md).
3. **Sends the standard silence set to the synth.** This is the point. A
   note-off lost to a cable, or a keyboard unplugged mid-note, leaves a note
   ringing that no amount of tidying our own bookkeeping will ever stop — MIDI
   gives nobody a way to find out it happened. Panic is the only cure.

## The message order matters

Per channel, in this order:

| | | why |
|---|---|---|
| CC 120 | All Sound Off | cuts even notes still in their release tail |
| CC 123 | All Notes Off | releases anything held |
| CC 121 | Reset All Controllers *(optional)* | drops a mod wheel or pedal left stuck up |
| bend centre | *(optional)* | a Ribbon glide interrupted mid-slide leaves the synth detuned |

**120 before 123** is deliberate: all-notes-off only lifts the keys, so on a long
release you'd still be sitting there waiting for the tail. There's a test
asserting that order, because getting it backwards produces a panic button that
looks like it works and mostly doesn't.

**All 16 channels by default.** A stuck note is by definition one you've lost
track of, so narrowing the search is exactly the wrong instinct. A single
channel is available for a dedicated "drums off" style button.

## It flashes, and that's not decoration

The result of pressing panic is *silence*. Without a visible flash there is no
way to tell a working button from a dead one — you'd press it, hear nothing
change, and have no idea whether the message went out. So it lights for 180 ms
on fire.

## How it works

- **Pure engine** `utils/panicLayout.js` (+ `test/panicLayout.test.js`, 6 tests):
  the channel list, the message set with its optional parts, the label and the
  summary line, and the button geometry. The message *sequence* is what's
  tested — it's the whole behaviour.
- **`PanicRenderer.svelte`** — a red-bordered button face with a second line
  stating exactly what it will send (`all ch · reset CC · centre bend`), so the
  configuration is legible without opening the inspector.
- **Model** — `Panic` controlType + section. It emits MIDI directly, so like the
  note-playing controls it has **no `DeviceBindings`**.
- **Preview** — `silenceLocalNoteControls()` walks every control on the panel and
  stops whichever kind it is, then the messages go out, then the echo clears.

## Caveats

- Needs a hardware output on the `mainSynth` role, like everything else that
  sends MIDI.
- **Reset All Controllers is a blunt instrument** — it returns modulation,
  expression and pedals to their defaults on that channel, which is what you
  want in an emergency and possibly not otherwise. Turn it off if a performance
  patch depends on a controller sitting somewhere.
- It cannot fix a note stuck *inside* a synth that ignores CC 120/123. A few old
  devices do.

## Possible next steps

- **Keyboard shortcut** — a panel-wide Esc binding, so you don't have to find the
  button while something is screaming.
- **Auto-panic on preview exit** — currently leaving preview clears the echo but
  doesn't silence the synth.
- **Panic from a script** — the Scripts command graph could expose it as an
  action, so any button could fire one.
