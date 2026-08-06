# Roland GAIA SH-01 device profile

```bash
node tools/scripts/qa/roland-gaia/make-gaia-profile.mjs           # regenerate
node tools/scripts/qa/roland-gaia/make-gaia-profile.mjs --check   # fail if the committed copy is stale
```

Emits `CE/profiles/test/roland-gaia-sh01.ceditor-device.json` — **265 parameters**: Patch Common,
all three tone layers, the four effect blocks, and Arpeggio Common.

| Block | Base | Size | Parameters |
|---|---|---|---|
| Patch Common | `10 00 00 00` | `00 00 00 3D` | 26 (+ patch name as one 12-byte field) |
| Patch Tone 1 / 2 / 3 | `10 00 01/02/03 00` | `00 00 00 3E` | 45 each |
| Distortion | `10 00 04 00` | `00 00 01 01` | 33 |
| Flanger | `10 00 06 00` | `00 00 00 51` | 21 |
| Delay | `10 00 08 00` | `00 00 00 51` | 21 |
| Reverb | `10 00 0A 00` | `00 00 00 51` | 21 |
| Arpeggio Common | `10 00 0C 00` | `00 00 00 08` | 7 |

## Why this exists

`roland-gaia.ceditor-device.json` — the profile that was already here — has **15** parameters. All
of them are Tone 1's filter section, and their ids (`filter.cutoff`, `filter.mode`) carry no tone
at all. It is a demo of the profile format, and a good one; it is not an editor for the synth.

Nothing said so, and nothing could. A profile with fifteen correct parameters looks exactly like a
profile with a hundred and sixty until you go looking for the ninety-fifth. That is the same shape
of defect as a missing script verb: no symptom, so no failure.

The demo is left exactly where it was. It is a test fixture with golden SysEx vectors keyed to its
own ids, and `dpdMergeOnDrop.test.js` uses it; overwriting it would have quietly invalidated both.

## Three tones, one table

The GAIA has three tone layers. In the Parameter Address Map they are the same 62-byte block at a
`0x0100` stride:

```
Temporary Patch   10 00 00 00
  Patch Common     + 00 00 00
  Patch Tone 1     + 00 01 00      ->  10 00 01 xx
  Patch Tone 2     + 00 02 00      ->  10 00 02 xx
  Patch Tone 3     + 00 03 00      ->  10 00 03 xx
```

So `address-map.mjs` holds the tone table **once**, and the generator emits it three times against
three bases, putting the tone in the parameter id (`tone2.filter.cutoff`). That is what makes
"show tone 1, 2 and 3 at the same time" a layout decision instead of a profile rewrite — which is
what QA-06 then does.

## How it is verified

`CE/web/test/gaiaProfile.test.js`, and the assertions that matter are the two that come from
outside our own code:

> **Example 1 — a DT1 write.** Setting Tone 1 OSC Wave to SUPER-SAW:
>
> ```
> F0 41 10 00 00 41 12 10 00 01 00 06 69 F7
> ```
>
> **Example 2 — an RQ1 read.** The REVERB block of USER PATCH A-2:
>
> ```
> F0 41 10 00 00 41 11 20 01 0A 00 00 00 00 51 04 F7
> ```
>
> Both are reproduced character for character. They check different things: Example 1 the edit
> buffer, DT1 and a value; Example 2 the user-patch base (`20 nn 00 00`), RQ1 and a block size.
> Address arithmetic (four 7-bit bytes with carry) and the Roland checksum are confirmed by a
> printed answer rather than by our own consistency.

**Block sizes are transcribed, not computed.** Deriving Distortion's size from its last offset
gives `00 00 01 11`; the manual's table foot says `00 00 01 01`. A size that is too large is not a
rounding error — the synth answers a different question, or does not answer at all. That one was
caught by reading the table rather than by any test, which is why `BLOCK_SIZES` exists and why a
test pins it.

The rest: the 0x0100 stride on **every** parameter rather than a sample, every address 7-bit clean
and unique, every choice parameter's default actually among its choices, and every bipolar
parameter carrying a display range as well as a wire range — that last one is the difference
between a pan knob reading "0" at centre and reading "64".

## What is still not covered, and why

**The arpeggio PATTERN blocks** (`00 0D 00` … `00 1C 00`) — sixteen notes, each an original note
plus thirty-two steps. 528 values of step-sequencer data. They are addresses, not controls: a panel
drives them with an Arpeggiator component and a dump, not with 528 knobs. Deliberately not expanded
into parameters; `coverage.notTranscribed` says so and a test asserts it does.

**What an effect parameter actually controls.** The manual gives `Flanger Parameter 3` an address,
a range and that name. What it *does* depends on the selected type, and the mapping — including
which three become the front panel's CONTROL 1/2/3 — lives in the owner's manual, not the MIDI
implementation. The names here are the manual's names. Renaming them from a guess would be worse
than leaving them factual, so `coverage.effectParameterMeanings` records the gap instead.

**Bulk-dump parsing** (`editBufferDumpParse: notImplemented`) — the same gap the 2026-08-03
completeness review flags as the missing preset/librarian layer.

The demo profile's real failing was never being wrong; it was being silent. Repeating that would be
worse the second time.

## Source

`address-map.mjs` is transcribed from **"SH-01 MIDI Implementation", Roland Corporation, version
1.01, September 1 2010** — §3 Parameter Address Map. Reserved bytes are dropped; they exist in the
manual to account for each block's total size, and exposing them would put 17 unnamed sliders in
front of a user. Wire ranges and the front-panel display ranges are both kept, because for every
bipolar parameter on the machine they differ.
