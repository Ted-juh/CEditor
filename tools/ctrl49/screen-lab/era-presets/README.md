# CTRL49 era designs

Ten screen-lab presets, from flat to skeuomorphic: four ideas of flat, then six eras of
synthesizer design. Each one
has five pages: the three the first designs had (Controls, Mixer, Envelope) and an
**arpeggiator** on two more, a pattern on a piano roll (Arp Edit, Arp Play). They are native
screen-lab presets loaded by `Ctrl49ScreenLab.exe preset`, not synth patches, Screen Builder
assignments or a HoSTage theme. The lab makes no sound and sends no parameters; the meters and
the arpeggiator are a moving picture driven by the frame counter.

**Status: software checks only.** None of the ten has been on a CTRL49 yet. They run in the
preset mode of `Ctrl49ScreenLab.exe` (`Ctrl49ScreenLab preset <Design.ctrl49preset>`), which
checks the manifest, uploads the page and its PNGs, and prints anything the keyboard refuses.

| | Design | Folder | Look | Knobs | Upload | Decoded |
|---|---|---|---|---|---|---|
| flat | Metro Tiles 2012 | `metro-tiles-2012` | black, a solid colour tile behind each knob, white type, nothing rounded | tinted grey coverage | 71 KB | 3,302 KiB * |
| | Midnight 2020 | `midnight-2020` | a dark software synth: navy cards, thin coloured arcs, rounded | tinted grey coverage | 62 KB | 3,302 KiB * |
| | Swiss Flat 2011 | `swiss-flat-2011` | off-white, black rules, four colour-coded knobs | tinted grey coverage | 65 KB | 3,302 KiB * |
| | Blueprint 1965 | `blueprint-1965` | white line drawing on drafting blue, a fine grid, hatched fills | tinted grey coverage | 71 KB | 3,302 KiB * |
| | Neo Brutal 2023 | `neo-brutal-2023` | cream, thick black outlines, hard shadows with no blur, loud flat colour | outlined, a pink value band | 125 KB | 4,502 KiB |
| | Dot Matrix 1983 | `dot-matrix-1983` | a backlit monochrome LCD, ghost segments, pixel art | pixel dot rings | 131 KB | 4,502 KiB |
| | Red Lead 1997 | `red-lead-1997` | red powder-coat, smoked windows, LED ladders | rubber, LED rings | 185 KB | 4,502 KiB |
| | Rhythm Box 1980 | `rhythm-box-1980` | charcoal plastic, the four-colour stripe | cream caps, ribbed skirts | 380 KB | 4,502 KiB |
| | Walnut 1971 | `walnut-1971` | black panel, walnut cheeks, aluminium bezels, amber lamps | fluted, aluminium caps | 379 KB | 4,502 KiB |
| skeuo | Test Bench 1958 | `test-bench-1958` | hammertone enamel, screws, green CRTs, neon bargraphs | Bakelite chicken-heads | 377 KB | 4,502 KiB |

\* The knob strip decodes to one byte a pixel: these designs' knobs are one shape the keyboard
tints per knob, and colour comes from the panel behind them (Metro's tiles, Midnight's dark
discs, Blueprint's dashed scales). Counted conservatively, at four bytes a pixel for every image
as the check counts, it is 4,502 KiB like the others.

The four flat designs share one rule: no gradient, no glow, no blur. What they differ in is what
flat means. Metro's flat is colour: solid tiles and white type. Midnight's is the dark software
synth: one surface and a thin coloured arc for each value. Blueprint's is line: everything a
stroke, every fill a hatch. Neo Brutal's is weight: black outlines and shadows offset without
softening, flat however heavy they look.

`Start_CTRL49_Era_Designs.cmd` (in `tools/ctrl49`) asks which one and runs it. Every folder holds
`preview-<n>-<page>.png` — its pages rendered by the real Lua through the firmware shim.

## The pages

| Page | E1 | E2 | E3 | E4 | E5 | E6 | E7 | E8 |
|---|---|---|---|---|---|---|---|---|
| Controls | cutoff | resonance | drive | mix | | | | |
| Mixer | channel 1 | 2 | 3 | 4 | 5 | 6 | 7 | channel 8 |
| Envelope | attack | decay | sustain | release | | | | |
| Arp Edit | step (the cursor) | note | velocity | length | scroll | key | rate | tempo |
| Arp Play | pattern length | direction | swing | gate | octave | follow | | |

Controls draws a live filter-response curve under its four knobs (cutoff 20 Hz-20 kHz). The
mixer's faders read in dB and its meters are demo program material in the arpeggiator's tempo.
The envelope's curve and readouts come from the host.

## The arpeggiator

A pattern on a piano roll. On the left is a keyboard on its side, one row a semitone, sixteen
rows at a time, scrolled up and down. To its right are sixteen steps, one bar, with the step
numbers above. The view turns to the bar the playhead is in; while you edit, it shows the bar
the cursor is in. A pattern is up to 64 steps (four bars). Both pages show the same roll; only
the cells under it change. The lab still makes no sound, but the roll is live: the pattern
plays, the keys light as their notes sound, and every encoder edits it.

- **A step** holds one note: its pitch, velocity, and a length from a quarter of a step to four
  steps, or off. On Arp Edit, E1 moves the cursor (its column outlined) and E2-E4 edit the step
  under it.
- **Editing picks a value up, like a motorless fader.** The host keeps each encoder's absolute
  position and stops it at 0 and 127, so an encoder cannot simply nudge whichever step the
  cursor is on. E2, E3 and E4 leave the step alone until they reach its value, then carry it.
  Until E2 has picked the note up, a ghost outline in the cursor's column shows where E2 is.
  An empty step takes E2's note, or E4's length, at once, so placing a note is: cursor there,
  turn E2. E4 to OFF empties a step.
- **What you see is what plays.** KEY transposes the whole pattern, as a held key would; Arp
  Play's octave moves it by octaves; the gate stretches every length. The grid and the keyboard
  show the result, so a row and the key beside it are always the same note.
- **Notes above or below the sixteen rows** show as a mark on the grid's top or bottom edge.
- **Playback:** forwards, backwards, there and back, or at random, at any of the CTRL49's eight
  divisions (1/4 to 1/32T), with swing. Steps past the pattern's length are shaded off.
- **Colour:** velocity sets a note's colour (soft, normal, loud). The note sounding now and its
  key are lit, and the cursor's note is marked on the keyboard, each design in its own
  colours. Test Bench's roll is a green cathode-ray tube, and Dot Matrix's an LCD.

The keyboard and the grid are baked as two strips of 28 semitone rows that start on a B. The
picture repeats every octave, so a single crop of each draws any scroll position. A redraw of
either page is about 100 draw calls.

What it does not do, and HoSTage would:
- **Own the pattern.** The lab has nowhere else to keep it, so it lives in the page and starts
  again from the generated one on restart.
- **Edit with relative turns.** The reducer already reports each turn (`encoderDelta`), so
  there would be no pick-up.
- **Take the key from the keys held,** not from an encoder.
- **Run the clock.** Here the frame counter is the only clock,
  `steps = frames x BPM x steps-per-beat / (60 x fps)`, so the playhead is quantised to redraws
  and a 1/32 at 120 BPM goes by quicker than they do.

The CTRL49's eight pads would be natural note toggles for the eight steps nearest the cursor, and
its time-division buttons the rate. Earlier attempts at this page are in the history:
a sequencer and arpeggiator sharing one clock (86d33c7), a six-page arpeggiator in lanes
(5d72504), and the piano roll as a separate design (b50f9e0).

## Assets

Three PNGs, the same upload ids as the first four designs, decoded one per redraw after the
loading screen:

| File | Size | PNG id | Buffer | Holds |
|---|---|---|---|---|
| `panels.png` | 480 x 816 | 576 | 577 | Controls, Mixer and Envelope backgrounds |
| `knobs.png` | 80 x 5120 | 578 | 579 | 64 knob frames; value v shows frame `floor(v*63/127 + 0.5)` |
| `parts.png` | 480 x 732 | 580 | 581 | sprites (top 180 rows); the roll's grid and keyboard strips (y 180); the arpeggiator's background (y 460) |

The arpeggiator's pieces ride in `parts.png` rather than in a fourth asset or a taller
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
envelope handle `96,0,14,14` — and add the envelope fill, the meters' peak marker, and the
roll keyboard's four lit keys (white and black, sounding and cursor). The full table is the `S`
block in each `Skin.lua`.

## Making and checking them

```bash
python tools/ctrl49/screen-lab/era-presets/make_era_designs.py          # all ten, about 25 s
python tools/ctrl49/screen-lab/era-presets/make_era_designs.py walnut-1971

cd CE/web
npm run test:screen-eras                                    # CTRL49_ERA_PREVIEWS=1 rewrites the previews
```

`make_era_designs.py` needs Pillow and nothing else, and is deterministic. It writes each
folder's three atlases, its manifest, and its `Skin.lua`, which is `EraSkin.lua` with one block
— `GENERATED`, holding the theme, the layout and the sprite crops — replaced. Behaviour belongs
in `EraSkin.lua`; never hand-edit a `Skin.lua`, the check fails if anything outside that block
differs from the template.

The check (`browser-checks/ctrl49EraPresets.mjs`) holds each manifest to the loader's rules
(version, 480 x 272, 1-6 pages, 5-30 fps, encoder counts, values 0-127, unique ids below 1024,
companion files beside the manifest, PNG signature and size, the 8 MiB guard), parses every Lua
as 5.2, then runs each design in wasmoon against the firmware draw-API shim: every encoder of
every page through all 128 positions, the ADSR corners, the arpeggiator at its busiest, the
frame counter's wrap. It also edits a pattern in every design and checks the pick-up: E2 leaves
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
  uploads are Rhythm Box, Walnut and Test Bench, the decoded total is 4.4 MiB for the designs
  with colour knobs and 3.2 MiB for the tinted ones;
- whether the tinted knobs come out in their colours (Swiss Flat's and Midnight's four, Metro's
  white, Blueprint's ink);
- whether the arpeggiator's playhead moves evenly at 15 redraws a second (lower `fps` in the
  manifest and in `make_era_designs.py` together if not: the clock counts it);
- the busiest page for redraw: Envelope on the glowing designs, about 400 calls;
- whether the roll's sixteen rows of 10 px read at arm's length (rows and row height are two
  numbers in `make_era_designs.py`), and whether picking up with E2-E4 feels natural or needs
  the host's relative turns.
