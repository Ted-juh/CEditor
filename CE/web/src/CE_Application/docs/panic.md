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

## Two ways to fire it without pressing it

**A keyboard shortcut**, Escape by default. The whole panel surface listens, so
you don't have to find the button while something is screaming. It only exists
in preview / the Player, so it can't fire while you're designing.

It defers to anything that already claimed the key — Escape is *also* the cancel
for four in-place editors (text field, spinner, range entry, LCD zone), and
stealing it from those would mean every cancelled edit panicked the rig. That
guard is a pure predicate (`isPanicShortcut`) with tests for the deferral cases
rather than the happy path, because those are the ones that would break
something.

**Rebindable**, in Panel Properties → Constraints → *Panic key*. Click the field
and press the keys you want; Backspace clears it, which switches the shortcut
off. The setting lives **on the panel**, not in app preferences, so it travels
with an exported Player — the person using the Player is the one who needs it.

One rule worth knowing: the "not while typing" guard applies to **bare keys
only**. A bare key in a field is always the field's — Escape cancels, and a bare
letter would panic on every keystroke. But `Ctrl+Alt+P` is nobody's typing, so a
modified shortcut still fires with focus in a text box, which is often exactly
where you are when it goes wrong.

**Leaving the panel.** Exiting preview silences the rig. A note the panel was
holding has no other way to stop — once the surface is gone there is nothing
left to send its note-off. It only fires if something actually sounded, so
closing an untouched panel stays quiet.

Both take the **maximal** silence set, never a placed Panic button's config.
Someone may have set one up as a narrow "drums off, ch 10"; an emergency that
silences a third of the rig is worse than useless. Esc also flashes any Panic
buttons on the panel, so the connection is visible.

## From a script

Any button can fire one: `panic` is a command in the Scripts graph
(`scripting/scriptCommandRegistry.js`), so a Program Change button can silence the rig
on the way to the next patch, or an `onPress` route can stop everything before
doing something else.

    on panicBtn.onPress:
      panic scope=all resetControllers=true

It takes `scope`, `channel` and `resetControllers` — but **not** `centreBend`,
and that is a deliberate trade. Every export target's emitter knows `sendCC`
and nothing else, so emitting a `panic()` call would produce exported code
calling a function no host defines, costing export-safety in eleven languages.
Instead the command **expands into the CC sequence it stands for**, through the
same `panicCcMessages` the button uses — so the sound-off-before-notes-off
guarantee holds identically, and the exported Lua / JS / Python / C++ is three
ordinary `sendCC` calls. Per the MIDI spec CC 121 already recentres pitch bend;
the button's explicit bend message is belt-and-braces for devices that
implement 121 only partially.

The JSON export keeps the `panic` step intact, since that is the round-trip
format. The text targets expand.

## How it works

- **Pure engine** `utils/panicLayout.js` (+ `test/panicLayout.test.js`, 19 tests,
  plus `test/scriptPanic.test.js` for the script command end to end). Besides the
  messages it holds the shortcut parser / formatter / matcher, so
  `Ctrl+Shift+P`, `cmd+k` and `option+F8` all mean what you'd expect:
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

- ~~Keyboard shortcut~~ — **done**: Escape by default, rebindable per panel.
- ~~Auto-panic on preview exit~~ — **done**, see above.
- ~~Panic from a script~~ — **done**, see above.
- ~~A configurable shortcut~~ — **done**, see above.
- **A shortcut conflict check** — nothing warns you if the panic key collides
  with something else the panel binds.
