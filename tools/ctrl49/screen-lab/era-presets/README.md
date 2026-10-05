# CTRL49 era designs

Six screen-lab presets from six eras of synthesizer design, from flat to skeuomorphic. Each one
has five pages: the three the first designs had (Controls, Mixer, Envelope) and two new ones, a
**Sequencer** and an **Arpeggiator**. They are native screen-lab presets loaded by
`Ctrl49ScreenLab.exe preset`, not synth patches, Screen Builder assignments or a HoSTage theme.
The lab makes no sound and sends no parameters; the meters, the sequencer and the arpeggiator
are a moving picture driven by the frame counter.

**Status: software checks only.** None of the six has been on a CTRL49 yet. They need the
preset mode of `Ctrl49ScreenLab.exe`, which lives in a working copy that is not in this
repository yet; the `Ctrl49ScreenLab.cpp` committed here has only `showcase` and `stress`.

| | Design | Folder | Look | Knobs | Upload | Decoded |
|---|---|---|---|---|---|---|
| flat | Swiss Flat 2011 | `swiss-flat-2011` | off-white, black rules, four colour-coded knobs | tinted grey coverage | 59 KB | 3,288 KiB * |
| | Dot Matrix 1983 | `dot-matrix-1983` | a backlit monochrome LCD, ghost segments, pixel art | pixel dot rings | 162 KB | 4,488 KiB |
| | Red Lead 1997 | `red-lead-1997` | red powder-coat, smoked windows, LED ladders | rubber, LED rings | 209 KB | 4,488 KiB |
| | Rhythm Box 1980 | `rhythm-box-1980` | charcoal plastic, the four-colour stripe, coloured step keys | cream caps, ribbed skirts | 405 KB | 4,488 KiB |
| | Walnut 1971 | `walnut-1971` | black panel, walnut cheeks, aluminium bezels, amber lamps | fluted, aluminium caps | 397 KB | 4,488 KiB |
| skeuo | Test Bench 1958 | `test-bench-1958` | hammertone enamel, screws, a green CRT, neon bargraphs | Bakelite chicken-heads | 436 KB | 4,488 KiB |

\* Its knob strip decodes to one byte a pixel. Counted conservatively, at four bytes a pixel for
every image as the check counts, it is 4,488 KiB like the others.

A seventh folder, `rhythm-box-1980-roll`, is not a skin but an instrument: a
[pattern arpeggiator as a piano roll](#the-arpeggiator-mockup), in the Rhythm Box 1980 design.

`Start_CTRL49_Era_Designs.cmd` (in `tools/ctrl49`) asks which one and runs it. Every folder holds
`preview-<n>-<page>.png` — its pages rendered by the real Lua through the firmware shim.

## The pages

| Page | Encoders | What they do |
|---|---|---|
| Controls | E1-E4 | cutoff (20 Hz-20 kHz), resonance, drive, mix, over a live filter-response curve |
| Mixer | E1-E8 | eight channel faders in dB; the meters are demo program material in tempo |
| Envelope | E1-E4 | attack, decay, sustain, release; the curve and its readouts come from the host |
| Sequencer | E1-E8 | the pitch of steps 1-8, C2-C4, about five detents a semitone; **0 is a rest** |
| Arpeggiator | E1-E8 | mode, rate, octaves, gate, swing, tempo, chord, rhythm |

Arpeggiator settings: seven modes (up, down, inclusive, exclusive, order, random, chord), the
CTRL49's own eight divisions (1/4 to 1/32T), 1-4 octaves, gate 10-100 %, swing 50-75 %, 60-187
BPM, eight chords, eight rhythms (even, 3+3+2, gallop, offbeat, skip, pulse, broken, sparse).
The page shows the chord on a three-octave keyboard, one bar of the pattern as a piano roll
with the playhead, and the eight values in cells that sit over the eight encoders.

The arpeggiator's tempo and swing clock the sequencer too. The host only sends a page's
encoders while that page is up, so the sequencer uses the last values the page saw (the
manifest's defaults until then).

## What a sequencer and an arpeggiator can be on this screen

What decided the shape of these two pages, and what would change it:

- **Eight absolute encoders per page, clamped 0-127 by the host.** One knob per step is the
  mapping that needs nothing else, so the sequencer has eight steps, as the classic analogue
  sequencers did. A sixteen-step sequencer edited through "E1 picks a step, E2 sets its note"
  does not work here: the host clamps each encoder, so after a few edits the note knob sits
  at an end and stops moving. That needs the host to keep per-step values and apply encoder
  *deltas* to the selected step, which `Ctrl49Reducer` already reports (`encoderDelta`).
- **Sixteen steps without host work** would be two pages of eight (steps 1-8, 9-16): six pages,
  the host's maximum, and more paging. Five pages was the better trade.
- **The device keeps no time.** The only clock is the frame counter the host sends, so
  `steps = frames x BPM x steps-per-beat / (60 x fps)` with fps the manifest's. The playhead is
  quantised to redraws: at 15 redraws a second a 1/16 at 120 BPM lasts 1.875 frames. For a
  picture that is fine; for anything that plays notes the host must own the clock and send the
  step.
- **No note input in the lab.** The arpeggiator plays a chosen chord. In HoSTage the held keys
  would replace it. The ADVANCE firmware calls a page's `note()` for keyboard notes once hook 2
  is enabled; whether the CTRL49 does is unverified, so nothing here relies on it.
- **The keyboard has the controls for it.** The CTRL49's eight time-division buttons (1/4-1/32T)
  are the arpeggiator's rate, and its eight pads and the eight small buttons above them are
  natural step toggles. The lab reads neither; a HoSTage integration could.
- **The budget is drawing calls, not pictures.** The busiest redraw is 420 calls (the envelope
  with glow); the arpeggiator in chord mode at four octaves is 375. A chord draws one bar per
  note so a full chord stays under the 600-call bound.

## Assets

Three PNGs, the same upload ids as the first four designs, decoded one per redraw after the
loading screen:

| File | Size | PNG id | Buffer | Holds |
|---|---|---|---|---|
| `panels.png` | 480 x 816 | 576 | 577 | Controls, Mixer and Envelope backgrounds |
| `knobs.png` | 80 x 5120 | 578 | 579 | 64 knob frames; value v shows frame `floor(v*63/127 + 0.5)` |
| `parts.png` | 480 x 724 | 580 | 581 | sprites (top 180 rows), Sequencer background (y 180), Arpeggiator background (y 452) |

The two extra backgrounds ride in `parts.png` rather than in a fourth asset or a taller
`panels.png`, so no single decode is bigger than the ones Machined Metal already proved
(1.6 MB at most), and the manifest keeps the three assets the loader was tested with. The cost
is 4.4 MiB decoded in all, against Machined Metal's 3.1 MiB. That is inside the loader's 8 MiB
software guard, but the device's real ceiling has not been measured; the stress page's E5 is
how to find it.

Swiss Flat's `knobs.png` is an 8-bit grey palette PNG, the format the CTRL49 is known to tint:
the device colours each knob as it draws it (blue, green, black, orange), so one strip makes
four knobs and decodes to a quarter of the memory.

The sprite crops in `parts.png` keep the five the first designs share — vertical fader cap
`0,0,34,40`, ADSR cap `38,0,22,28`, meter column `68,0,8,144`, envelope glow `80,0,12,12`,
envelope handle `96,0,14,14` — and add the envelope fill, the peak marker, the sequencer bar,
four keyboard keys, and sixteen step keys (unlit and lit). The full table is the `S` block in
each `Skin.lua`.

## The arpeggiator mockup

`rhythm-box-1980-roll` is a pattern arpeggiator laid out as a piano roll, in the Rhythm Box 1980
design. On the left is a keyboard on its side, one row a semitone, sixteen rows at a time,
scrolled up and down. To its right are sixteen steps, one bar, with the step numbers above.
The view turns to the bar the playhead is in; while you edit, it shows the bar the cursor is
in. A pattern is up to 64 steps (four bars). It is a mockup, and the lab still makes no sound,
but it is live: the pattern plays, the keys light as their notes sound, and every encoder
edits it.

| Page | E1 | E2 | E3 | E4 | E5 | E6 | E7 | E8 |
|---|---|---|---|---|---|---|---|---|
| EDIT | step (the cursor) | note | velocity | length | scroll | key | rate | tempo |
| PLAY | pattern length | direction | swing | gate | octave | follow | | |

- **A step** holds one note: its pitch, velocity, and a length from a quarter of a step to four
  steps, or off. On EDIT, E1 moves the cursor (its column outlined) and E2-E4 edit the step
  under it.
- **Editing picks a value up, like a motorless fader.** The host keeps each encoder's absolute
  position and stops it at 0 and 127, so an encoder cannot simply nudge whichever step the
  cursor is on. E2, E3 and E4 leave the step alone until they reach its value, then carry it.
  Until E2 has picked the note up, a ghost outline in the cursor's column shows where E2 is.
  An empty step takes E2's note, or E4's length, at once, so placing a note is: cursor there,
  turn E2. E4 to OFF empties a step.
- **What you see is what plays:** KEY transposes the whole pattern, as a held key would; PLAY's
  octave moves it by octaves; the gate stretches every length. The grid and the keyboard show
  the result, so a row and the key beside it are always the same note.
- **Notes above or below the sixteen rows** show as a mark on the grid's top or bottom edge.
- **Playback:** forwards, backwards, there and back, or at random, at any of the CTRL49's eight
  divisions (1/4 to 1/32T), with swing. Steps past the pattern's length are shaded off.
- **Colour:** velocity sets a note's colour (soft, normal, loud); the note sounding now, and its
  key, are lit yellow; the cursor's note is orange on the keyboard.

The keyboard and the grid are baked as two strips of 28 semitone rows that start on a B. The
picture repeats every octave, so a single crop of each draws any scroll position. A redraw is
under 90 draw calls. About 1.5 MiB decoded, 49 KB to upload.

What it does not do, and HoSTage would:
- **Own the pattern.** The lab has nowhere else to keep it, so it lives in the page and starts
  again from the generated one on restart.
- **Edit with relative turns.** The reducer already reports each turn (`encoderDelta`), so
  there would be no pick-up.
- **Take the key from the keys held,** not from an encoder.
- **Run the clock.** Here the frame counter is the only clock, so a 1/32 at 120 BPM goes by
  quicker than the redraws.

The CTRL49's eight pads would be natural note toggles for the eight steps nearest the cursor.
The manifest names PLAY as its envelope page because the loader wants one; the page ignores
`set_envelope`.

The lane-page arpeggiator that came before this one is in the history (commit 5d72504).

## Making and checking them

```bash
python tools/ctrl49/screen-lab/era-presets/make_era_designs.py          # all six, about 20 s
python tools/ctrl49/screen-lab/era-presets/make_era_designs.py walnut-1971
python tools/ctrl49/screen-lab/era-presets/make_roll_mockup.py          # the arpeggiator mockup

cd CE/web
npm run test:screen-eras                                    # CTRL49_ERA_PREVIEWS=1 rewrites the previews
```

`make_era_designs.py` needs Pillow and nothing else, and is deterministic. It writes each
folder's three atlases, its manifest, and its `Skin.lua`, which is `EraSkin.lua` with one block
— `GENERATED`, holding the theme, the layout and the sprite crops — replaced. Behaviour belongs
in `EraSkin.lua`; never hand-edit a `Skin.lua`, the check fails if anything outside that block
differs from the template. `make_roll_mockup.py` does the same for the mockup from
`RollSkin.lua`, with the Rhythm Box materials from `make_era_designs.py`.

The check (`browser-checks/ctrl49EraPresets.mjs`) holds each manifest to the loader's rules
(version, 480 x 272, 1-6 pages, 5-30 fps, encoder counts, values 0-127, unique ids below 1024,
companion files beside the manifest, PNG signature and size, the 8 MiB guard), parses every Lua
as 5.2, then runs each design in wasmoon against the firmware draw-API shim: every encoder of
every page through all 128 positions, the ADSR corners, the arpeggiator at its busiest, the
frame counter's wrap. For the mockup it also edits a pattern and checks the pick-up: E2 leaves
a step's note alone until it reaches it, then carries it, and an empty step takes a note at
once. Every rectangle and image must land on the screen, every crop inside its
atlas, every text inside its box; the three atlases must be decoded once; the meters, the
playhead and the arpeggiator must move. It does not run the loader itself — on Windows,
`Ctrl49ScreenLab.exe preset <manifest> --check` does that — and the preview's fonts are not the
device's Aileron.

## Trying them on the keyboard

Close the previous test, HoSTage / CEditor, VIP and the DAW; connect and power the CTRL49; run
the launcher and pick a design. Wait for the upload and the three decode steps, then turn the
encoders and walk the pages. Worth writing down:

- whether the upload or a decode brings the stock screen back (the watchdog): the larger
  uploads are Rhythm Box and Test Bench, the decoded total is 4.4 MiB for all but Swiss Flat;
- whether Swiss Flat's four knobs come out in four colours;
- whether the sequencer's playhead and the arpeggiator move evenly at 15 redraws a second
  (lower `fps` in the manifest and in `make_era_designs.py` together if not: the clock counts it);
- the busiest pages for redraw: Envelope on the glowing designs, and the arpeggiator in chord
  mode at four octaves;
- on the arpeggiator mockup, whether sixteen rows of 10 px read at arm's length (the rows and
  their height are two numbers in `make_roll_mockup.py`), and whether picking up with E2-E4
  feels natural or needs the host's relative turns.
