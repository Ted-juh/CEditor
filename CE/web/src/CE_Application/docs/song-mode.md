# Song mode — a chain of patterns

> Status: **shipped 🟢**. Shared by the [Phrase Sequencer](./phrase-sequencer.md)
> and the [Phrase Recorder](./phrase-recorder.md). Part of the
> [panel parts backlog](./README.md).

## What it is

An ordered list of stored slots with repeat counts: *intro once, verse twice,
chorus, verse twice, out.*

It exists once, in [`songChain.js`](../utils/songChain.js), and both components
use it. A sequence of things with repeat counts is the **same object** whether
the things are patterns or takes, and building it twice is precisely how the two
end up disagreeing about what "three bars in" means.

## The position is a function of the lap

A chain position is derived from a rising lap counter, not held in a cursor that
advances:

```js
[0,1,2,3,4,5,6,7].map(l => slotForLap(chain, l))   // → 0,1,1,2,0,1,1,2
```

Same rule as the [Transport](./transport.md)'s position and the sequencer's step
index, for the same reasons. Nothing drifts, nothing gets stuck, asking twice
gives the same answer, and a stall re-derives instead of catching up. There is no
"advance the chain" call that could be missed or double-fired.

## A lap is one pass of the slot

Not a fixed number of bars. A chain link of `×2` means **two passes of whatever
is in that slot**, whatever length that slot happens to be — so a 16-step verse
and a 32-step chorus can sit in the same chain and each repeat means what you'd
expect.

## Three rules worth stating

**A repeat of zero is not allowed.** It would be a link that never plays *and*
never advances — an infinite loop on one entry. One is the floor.

**A disabled link is skipped, not played for zero laps.** Muting a section
otherwise silently changes the length of everything after it, in a way you can't
see by looking at the chain.

**A one-shot chain holds on its last link.** It doesn't wrap, and it doesn't go
silent. A song that ends should stay ended, on its final section — going quiet
would look like a fault and wrapping would restart the intro.

## Switching, not reloading

The host swaps the pattern only when the **slot changes** between laps, not on
every lap. Reloading the same pattern each time round would throw away any edit
made while it was playing, and reset anything mid-flight.

## Per component

**The Phrase Sequencer** chains **patterns**. Eight slots, stored and loaded from
the inspector; storing and loading are copies, so editing the grid never rewrites
a stored pattern behind your back.

**The Phrase Recorder** chains **takes**, using the slots it already had. A chain
**never advances while recording** — swapping the take out from under a pass
would lose it, which is the one thing a recorder must not do.

## What it doesn't do

- **No nesting.** A chain is flat; a link points at a slot, not at another chain.
- **No per-link transposition or settings.** A link chooses *what* plays, not how.
  Changing key mid-song is the [Setlist](./setlist.md)'s job, and it can do it
  per scene.
- **No jump-to-link from a footswitch.** The chain runs; the Setlist is the
  component you drive with your feet.
