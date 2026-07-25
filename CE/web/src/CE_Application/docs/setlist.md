# Setlist — scenes on a footswitch

> Status: **shipped 🟢**. Unglamorous, and the thing people actually need on
> stage. Part of the [panel parts backlog](./README.md).

## What it is

An ordered list of panel states. You advance it with a footswitch.

Nothing here is novel, and that's the point — everything it needs already
existed. Snapshots are what the [Timbre Space](./timbre-space.md) and the
[Preset Constellation](./preset-constellation.md) store. Program change is a MIDI
message. A footswitch is a CC the [input path](./note-input-echo.md) already
reads. This is the ordering, the stepping and the recall, and it turns a panel
into something you can play a set with.

Each scene carries a name, a cue note, an optional program change (with bank), an
optional tempo, and a captured set of panel values.

## The rule that has to be right

**Step on the rising edge only.**

A momentary footswitch sends 127 when you press it and 0 when you let go. Both
are CC messages on the same number. Act on each one and the setlist steps
**twice per press** — which on stage looks like the pedal skipping a song, and is
the single commonest way a scene stepper is broken.

So the pedal's held state is one boolean, and the step fires on the transition
into it:

```js
footswitchEdge(control, { kind: 'cc', cc: 64, value: 127 }, false)  // → { step: true,  down: true }
footswitchEdge(control, { kind: 'cc', cc: 64, value: 127 }, true)   // → { step: false, down: true }   (repeat)
footswitchEdge(control, { kind: 'cc', cc: 64, value: 0   }, true)   // → { step: false, down: false }  (release)
```

The same rule handles a **sweeping** expression pedal for free: crossing the
threshold on the way up is one press, not thirty. And an event that isn't the
pedal doesn't clear the held state, or the next repeat of the real pedal would
read as a fresh press.

The pedal is read from the router's **event** store rather than the expression
state store, for the reason the [Zone Splitter](./zone-splitter.md) needed the
same thing: a stepper has to see each message once, when it arrives. A snapshot
of "where is the pedal now" would either miss a press or repeat it.

## The end of the list stays put

Wrap is **off by default**. A setlist that jumps back to song one when you press
next at the end of the night is a bad surprise in front of an audience. Press
next at the end and nothing happens, which is the correct amount of drama.

It's a setting, because a backing-track panel that loops four scenes forever is
also a real thing.

## A disabled scene is skipped, not landed on

"Skip this one tonight" is the entire reason to have a disable. Stepping *onto* a
skipped scene would make the pedal appear to do nothing — press, no change,
press again. So the step walks past them, and if everything is disabled it stays
where it is rather than looping forever looking for a home.

## Recall order

MIDI first, then the panel values, then the tempo.

A program change swaps the patch on the synth. The stored values belong to
**that** patch, so writing them first would put them into the old one and then
have the program change wipe them. The plan is returned as data rather than
performed inside the engine, precisely so the order is testable.

Within the MIDI, **bank select comes before the program change** — that is what
bank select means. It selects the bank the *next* program change lands in;
sending it afterwards changes the patch and then changes the bank, which does
nothing until the following scene.

An absent program is `null`, not `0`. Zero is a legal program number, and a
scene without one has to stay distinguishable from a scene that selects patch 1
— otherwise every scene you never configured silently changes the sound.

## Capture takes an explicit list

Not "everything".

The setlist's own index is a panel value. Capture everything and a scene stores
the index it was captured at; recall it and the setlist moves — usually to
itself, occasionally somewhere else, and always confusingly. So the paths are a
list, defaulting to every control on the panel *except* the setlist, and the
inspector has a button to refresh it.

Scenes address controls **by name**, not by id, so a scene survives a re-save.

A path that reads back `undefined` is **left out** rather than stored as `null` —
recalling `null` would write null into a control.

## What the inspector tells you

Per scene: how many values it stores, how many of them **would actually change**
if you recalled it now, and — the useful one — how many paths it **didn't**
capture. That last number is the usual cause of *"that knob stayed where the last
song left it"*: the scene simply has nothing to say about it, so nothing moves
it back.

## The display is a list

A setlist that isn't drawn as a list is a puzzle. The current scene is
highlighted and kept in view with something after it where there's room — a
display that always shows the current song at the bottom tells you nothing about
what's coming. Counts of what's above and below sit in the corner, because a
list that hides its length leaves you unable to tell whether you're near the end.

Rows show the running **number** (on stage you count songs, not names), the name,
the tempo, and the program number: *"which patch does this song select"* is the
question a setlist exists to answer. Skipped scenes are struck through.

Clicking a row jumps to it, through the same recall the pedal uses.

## Driving it from a script

The most obviously needed of the three, because without it the only ways to
advance are a pedal and a mouse — so a panel button saying **Next** couldn't work,
which is exactly the thing a setlist wants:

```lua
setlistNext("Set")
setlistPrev("Set")
setlistGoto("Set", 3)              -- 1-based, as the list shows it
setlistGoto("Set", "Closer")       -- or by name — a name survives a reorder
setlistEnable("Set", "Ballad", false)   -- skip one tonight
setlistWrap("Set", true)
```

**These move the index. They do not recall** — and that's the design, not a
limitation. The recall is driven by the index *changing*, so a scripted step, a
footswitch press, a click on a row and a hand edit in the inspector are all the
same event downstream and cannot drift apart.

One consequence worth knowing: the first sighting of an index only **baselines**
it. Recalling on panel load would fire a program change at the synth every time
you open the editor, which is not what opening a panel means.

A scripted step obeys the same rules the pedal does — the end of the list stays
put without wrap, and disabled scenes are skipped.

Out-of-range numbers, unknown scene names and moves that change nothing are
**no-ops with a trace line**, not throws. Portable, but not export-safe: it edits
the panel's own model, so it needs the panel runtime.

## Compatibility

Program change and bank select go to the `mainSynth` device role — any synth
made in the last forty years. The footswitch needs a MIDI **input** selected; see
[expression-router.md](./expression-router.md) for the same caveat about input in
an exported Player. Recalling values and tempo needs neither, so a setlist driven
by clicking works with nothing plugged in.

A scene's tempo drives the [Transport](./transport.md), which means everything
synced to it follows the song.

Nothing here touches the DPD profile.

## What it doesn't do

- **No per-scene MIDI beyond program change.** No sysex, no CC lists. A script
  step on the panel covers that and this doesn't duplicate it.
- **No crossfade between scenes.** Values are written, not interpolated. The
  [Timbre Space](./timbre-space.md) is the component for morphing between states;
  a setlist wants the change to be instant and complete.
- **No song sections.** One flat list. Verse/chorus within a song is what the
  scenes themselves are for if you want it — at the cost of a longer list.
- **The footswitch is one CC.** No dual-pedal up/down on separate switches
  without a second setlist, and no tap-to-hold gestures.
