# Zone Splitter — one keyboard, several synths

> Status: **shipped 🟢**. The most-wanted real-world thing the panel couldn't do.
> Part of the [panel parts backlog](./README.md).

## What it is

A routing table. Notes arriving on the hardware MIDI input are matched against a
list of key **zones**; each zone re-sends them on its own channel, transposed,
with its own velocity response.

Lower half to the bass synth on channel 1, an octave down. Upper half to the
lead on channel 2. That is the single most common thing anyone with more than
one box wants to do, and it was impossible here until the
[note-input work](./note-input-echo.md) — you can't split notes you can't see.

## Overlap *is* layering

Zones may overlap, and there is deliberately **no separate "layer" mode**. A note
inside two zones is sent twice, on two channels, with two transpositions. Same
zone twice with `+12` on the second is an octave layer; two channels over the
same range is a stacked patch.

The consequence is that an *accidental* overlap is a real bug with a confusing
symptom — every note sent twice sounds thin and slightly detuned, and nobody
traces that back to a zone boundary. So the inspector lists overlapping ranges
explicitly, alongside the gaps.

## Gaps are shown, not hidden

Keys no zone claims are drawn shaded, and the inspector spells out the range:
*"Silent: C4–B4 — no zone claims those keys."* Dropping unclaimed notes is the
correct default (the point of a split is that the top half does **not** play the
bass patch) but "my top octave went quiet" is otherwise a five-minute mystery.
There's a pass-through mode for while you're setting one up.

## The part that's easy to get wrong

**A note-off must go where its note-on went.**

The obvious implementation re-derives the routing when the key comes up. That
works right up until something changes while a key is held — you drag a split
point, or edit a transposition — and then the off goes to a different channel or
a different pitch. The original note rings forever, and nothing will ever stop
it, because the only message that could has already been sent to the wrong
place.

So a press **remembers** its destinations and a release replays them. That
bookkeeping is a pure reducer in [`splitZoneLayout.js`](../utils/splitZoneLayout.js)
rather than component state, precisely so the rule can be tested:

```js
const down = pressNote(EMPTY_SOUNDING, control, 48, 100);
// → [{ kind: 'on', channel: 1, note: 36, velocity: 100 }]
// …the split now moves so that 48 belongs to channel 2…
releaseNote(down.sounding, 48);
// → [{ kind: 'off', channel: 1, note: 36 }]   ← still the right place
```

The same reducer handles a retrigger with no intervening off (releases the old
routing first, so the first press isn't orphaned), and `reconcileHeld` sends
**nothing** when nothing changed — which is what stops the input pump from
retriggering every held note on every frame.

## Velocity per zone

Four responses, which is what hardware splitters offer and is worth more here
than a drawable curve: a zone is usually feeding a *different synth* whose own
response you're compensating for.

| | |
|---|---|
| Linear | untouched |
| Soft | easier to play loud |
| Hard | needs a firmer touch |
| Fixed | one velocity whatever you play — an organ zone |

Soft and hard both keep the endpoints, so pianissimo is still pianissimo. A
per-zone **range** is applied *after* the curve, so it means what it says: a zone
set to 40–90 never sends 39 or 91 whatever the curve does.

## Controllers, per zone

A split is usually two different synths, and they rarely agree about what CC1
means — so each zone chooses what it forwards: **all**, **none**, or a typed list
(`1, 11, 74`).

**Sustain has its own switch**, separate from that list. It's the one controller
everybody wants per-zone, and burying it in a list of numbers means nobody finds
it. It's on by default, because a split where the pedal silently stopped working
would be reported as a bug — rightly.

Controllers are deduplicated **by channel**: two zones sharing a channel (a
keyboard split into a low and high half of one patch) don't double every
mod-wheel message. That's twice the traffic for no audible difference, and on a
busy wire it matters.

The other half of pedal support is letting go of it. Latching controllers
(sustain, sostenuto, soft, hold-2) are **remembered**, so [Panic](./panic.md) and
an all-off send them back to 0. Releasing the notes and leaving the pedal down is
the half-fix that looks like the panic button doesn't work.

This needed a new store: the expression store answers *"where is the mod wheel
now"*, which is right for a display and wrong for a router. A router has to
forward each message **once, when it arrives** — re-sending a snapshot would
either spam or miss. So `midiCcEvents` publishes event batches with a sequence
number, alongside the state store the displays use.

## Velocity switching

A zone can be set to answer only notes played inside a **velocity window**. Two
zones over the same keys, one at 1–79 and one at 80–127, is the classic
hit-it-hard layer.

A window, not a single threshold, so you can have a soft layer *and* a hard one
without the soft layer also sounding on every fortissimo. Windows may overlap,
and then both sound.

Note the distinction, because the names are close: `velSwitch*` gates the
**input** — does this zone answer at all — while the velocity range gates the
**output**, how loud it plays. One decides whether the zone speaks, the other how
loudly.

Leaving a **hole** between two windows makes notes at those velocities silent,
which is the hardest kind of bug to hear because it only happens sometimes. The
inspector computes the holes and says which velocities reach no zone.

## Presets

Five arrangements, one click: whole keyboard, classic split, split with a layered
lead, three-way, and velocity layers. They're built from the **currently drawn
range** rather than fixed note numbers, so applying one to a 25-key controller
gives boundaries on the keys you actually have rather than zones off the end.

Split points land on white keys — where a player would put them, not
mid-accidental. There's a test that every preset survives normalization
unchanged, because a preset that needs repairing is a preset that will confuse
someone.

## Interaction

- **Drag a split point** along the keyboard. Where two zones abut, they share
  one boundary and both move together — otherwise every drag opens a gap or an
  overlap you then have to fix by hand. Zones with a deliberate gap between them
  are not twins and move independently.
- **Click a key** to audition it through the zones, which is most of the
  editor's life: you rarely have the hardware plugged in while laying a panel
  out. A mouse-held key survives the input pump rather than being released by it.
- Held keys **light up** in the colour of the zone that claimed them, so you can
  see the split working rather than infer it from what you hear.

## A transposition off the end is dropped

Not clamped. Clamping piles every out-of-range note onto note 0 or 127, which
sounds like a stuck key; dropping sounds like nothing, which is what a note
outside the instrument's range should sound like.

## Compatibility

Any synth that responds to MIDI notes, provided a hardware output is selected on
the `mainSynth` device role — the same path the [Chord Pad](./chord-pad.md) and
[Arpeggiator](./arpeggiator.md) use. It also needs a MIDI **input** selected,
being the first control here that is purely a router: it plays nothing of its
own. See [expression-router.md](./expression-router.md) for the same caveat about
input in an exported Player.

[Panic](./panic.md) releases everything the splitter is holding, using the same
remembered routings.

Nothing here touches the DPD profile.

## What it doesn't route

Notes and continuous controllers, and that is the whole list. **Pitch bend and
channel aftertouch are not routed** — they arrive on the input's channel and go
wherever that is wired, not to the zone channels. Bend in particular is a real
omission for a split: bending in the lead zone should not bend the bass. It
isn't done because bend is per-channel with no per-note information, so
"which zone did that bend belong to" has no answer from the message alone —
it needs a rule (last zone played? the zone under the last note?) and picking
one silently would be worse than not doing it.
