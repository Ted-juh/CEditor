# Roland GAIA SH-01 device profile

```bash
node tools/scripts/qa/roland-gaia/make-gaia-profile.mjs           # regenerate
node tools/scripts/qa/roland-gaia/make-gaia-profile.mjs --check   # fail if the committed copy is stale
```

Emits `CE/profiles/test/roland-gaia-sh01.ceditor-device.json` — **162 parameters**: Patch Common
plus all three tone layers.

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

`CE/web/test/gaiaProfile.test.js`, and the assertion that matters is the first one:

> **Roland's own worked example.** "SH-01 MIDI Implementation" v1.01, §4 Example 1 prints the exact
> bytes for setting Tone 1 OSC Wave to SUPER-SAW:
>
> ```
> F0 41 10 00 00 41 12 10 00 01 00 06 69 F7
> ```
>
> The generated profile's golden vector is that string, character for character. Address
> arithmetic (four 7-bit bytes with carry) and the Roland checksum are both confirmed by something
> outside our own code. No amount of internal consistency would have caught an error in either.

The rest: the 0x0100 stride on **every** parameter rather than a sample, every address 7-bit clean
and unique, every choice parameter's default actually among its choices, and every bipolar
parameter carrying a display range as well as a wire range — that last one is the difference
between a pan knob reading "0" at centre and reading "64".

## What is not transcribed

Patch Distortion, Flanger, Delay, Reverb and Arpeggio. The profile's `coverage.notTranscribed`
names them, and a test asserts it does. The demo profile's real failing was never being wrong; it
was being silent, and repeating that would be worse the second time.

Bulk-dump parsing is also unbuilt (`editBufferDumpParse: notImplemented`), which is the same gap
the 2026-08-03 completeness review flags as the missing preset/librarian layer.

## Source

`address-map.mjs` is transcribed from **"SH-01 MIDI Implementation", Roland Corporation, version
1.01, September 1 2010** — §3 Parameter Address Map. Reserved bytes are dropped; they exist in the
manual to account for each block's total size, and exposing them would put 17 unnamed sliders in
front of a user. Wire ranges and the front-panel display ranges are both kept, because for every
bipolar parameter on the machine they differ.
