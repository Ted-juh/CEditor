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

## Possible next steps

- **Per-zone CC filtering** — a zone that passes the mod wheel and one that
  doesn't; useful when the two synths disagree about what CC1 means.
- **Sustain per zone** — CC64 currently isn't routed at all, so a pedal reaches
  whatever the input is wired to rather than following the zones.
- **Velocity switching** — a zone that only responds above a velocity, for the
  hit-it-hard layer.
- **Zone presets** — the three or four splits anyone actually uses, one click
  away.
