# HoSTage feature mockups

One screen-lab preset, five pages, five things the CTRL49's screen could show in HoSTage that a
host on hardware does not usually show. They are in the Midnight 2020 look (see
[`../era-presets`](../era-presets/README.md)) so that what changes is the idea, not the style.
Like the era designs they are native screen-lab presets loaded by `Ctrl49ScreenLab.exe preset`,
not HoSTage pages. The lab has no library, no modulation, no MIDI and no setlist, so every page
fakes its data from the frame counter and from tables the generator wrote into the Lua.

**Status: software checks only.** Not yet run on a CTRL49. Like the era designs, this needs the
preset mode of `Ctrl49ScreenLab.exe`, which is not in this repository yet.
`Start_CTRL49_Feature_Mockups.cmd` (in `tools/ctrl49`) runs it.

| Page | Shows | E1 | E2 | E3 | E4 | E5 | E6-E8 |
|---|---|---|---|---|---|---|---|
| Sound Atlas | the library as a map: brightness across, attack up | crosshair across | crosshair up | box size | pick one of the eight nearest | morph to the next | |
| Motion | four parameters, each pushed by a modulation source, moving | cutoff | resonance | wave | pan | LFO 1 depth | LFO 2, MSEG and random depth |
| Capture | the last two minutes of playing, and a box of bars to keep | bars to keep | how far back | quantise | loop slot | turn to keep | |
| Stage | the setlist cue screen | song | | | | | |
| Chords | the chord held, its place in the key, the next chords on the pads | key | scale | | | | |

`hostage-features/preview-*.png` are the pages drawn by the real Lua through the firmware shim.
Four of them show one moment each: `1-atlas-dark-sound` and `1-atlas-bright-sound` (the same
page in two colours), `3-capture-kept` (just after E5), `4-stage-failover` (a plug-in restarted).

## The sound's colour

The whole screen takes the colour of the sound picked on the atlas, from its measured
brightness: dark sounds warm (amber, coral), bright ones cold (violet, teal). Pick a different
sound and every page changes colour: the title bar, the focused cell, the capture box, the
section name, the held keys. Everything that carries the colour is either a rectangle or a grey
coverage sprite in `tint.png` that the keyboard tints as it draws it, so recolouring costs
nothing: no second set of images, nothing uploaded again. It is the one idea that spans all five
pages, and it tells you which sound you are on before you read a word.

## What each page is, and what HoSTage already has for it

None of these starts from nothing. Each one draws something HoSTage already knows; the mockup
shows what it would look like on the keyboard.

**Sound Atlas.** The auditioner already measures every sound it plays.
`CE/src/InstrumentHost/SonicProbe.h` takes brightness as a spectral centroid and attack as the
time to nine-tenths of the peak, and those two numbers are the map's axes. Here 1,200 invented
sounds sit in clusters (pads slow and mid, plucks fast and bright, basses dark), five characters
each in `Skin.lua`, and the map is baked into `panels.png`. HoSTage would draw the map from the
library itself and upload it as one image when the library changes, then send the eight nearest
(name, colour, a 15-column thumbprint of the level over the first second) each time the
crosshair moves. The page searches the library in Lua only because the lab has no host. The box
is a library query (how many sounds sit in it); the pads would audition the eight nearest.
Morphing (E5) is the most speculative part: it only means something between two programs of the
same plug-in.

**Motion.** The rack already has MIDI LFOs and a looping breakpoint MSEG (`RackModel.h`). What
nobody shows is the result: the arc is where you set the parameter, and the trail and dot are
where the modulation has pushed it now, in the source's colour, with the source's cycle drawn
underneath and a cursor on it. HoSTage would send each frame four current values and four
phases, 8 bytes, as an addition to `set_frame` or a call of its own.

**Capture.** `MidiCaptureJournal` (`CE/src/Performance/MidiCaptureJournal.h`) is "the
always-listening half of Capture & Replay", and it keeps 120 seconds: the two minutes this page
shows. The roll scrolls with what you play, the strip under it is the whole two minutes a bar to
a column (the pauses show), and the box is what E5 keeps, filed as a loop. The page makes up what
was played from the bar number; HoSTage would send the notes in view (start, length, pitch,
velocity: 4 bytes each, so a busy ten bars is about 500 bytes) when the roll moves, and 60 bar
counts for the strip.

**Stage.** The setlist already warms the next rigs (`setSetlistOptions {preloadAhead}`, 0-2
full rigs) and restarts a processor that throws (`setAutomaticFailover`); both are in
`InstrumentHostService.h`. The cue screen is where you see that happen: song, tempo, section,
bars left, the beat (the screen's edge flashes, the downbeat in the sound's colour), the next
section's sound and whether it is warm yet, and a banner when a plug-in had to restart. The
song's form (intro, verse, chorus, with their lengths) is new: a setlist item today has a name,
notes, a tempo, a scene and a page, not sections.

**Chords.** The chorder already plays a chord per pad (`padChords` in `MidiInsertRack.h`), and
a CTRL49 pad with nothing else on it already plays the focused part's Chords pads
(`pressSurfacePad` in `InstrumentHostService.h`). What is new is naming what you
hold, and offering the key's next chords on those pads. The page shows the chord, its numeral
and what it is doing in the key, the keys held on a three-octave keyboard with the scale marked,
and the eight pads with the likeliest next chord ringed. HoSTage would send the held keys as a
36-bit mask (5 bytes), the chord's name and numeral, and the eight pad chords.

Every one of those messages fits the 1,000-byte payload the screen's calls already live under.

## Assets

| File | Size | PNG id | Buffer | Holds |
|---|---|---|---|---|
| `panels.png` | 480 x 816 | 576 | 577 | the Sound Atlas (with its map), Motion and Capture backgrounds |
| `tint.png` | 80 x 5184 | 578 | 579 | 8-bit grey coverage: 64 knob frames, then the rings, dots and lit keys (y 5120) |
| `parts.png` | 480 x 544 | 580 | 581 | the Stage and Chords backgrounds |

Uploads total about 100 KB. Decoded, it is 4,170 KiB counted at four bytes a pixel as the check
counts, or about 2,960 KiB if `tint.png` decodes to one byte a pixel, as the tinted grey format
is expected to. The largest single decode is `tint.png`: 1.66 MB at four bytes a pixel (the era
designs' knob strips are 1.64 MB), 0.41 MB at one.

## Making and checking it

```bash
python tools/ctrl49/screen-lab/feature-mockups/make_feature_mockups.py

cd CE/web
npm run test:screen-eras                                    # CTRL49_ERA_PREVIEWS=1 rewrites the previews
```

`make_feature_mockups.py` needs Pillow, and borrows its drawing helpers and the Midnight palette
from `../era-presets/make_era_designs.py`. It writes the folder's three atlases, its manifest,
and its `Skin.lua`: `FeatureSkin.lua` with the `GENERATED` block (theme, layout, sprite crops and
the invented data) replaced. Behaviour belongs in `FeatureSkin.lua`; never hand-edit `Skin.lua`.

The era designs' check covers this design too, with the same rules (the manifest, Lua 5.2, the
template outside the generated block, every key the template reads given, every encoder of every
page through all 128 positions, every call on the screen and inside its atlas, every text inside
its box, at most 600 calls a redraw, the atlases decoded once, the pages that should move
moving). It also checks that E5 on Capture keeps the box and says so once, that a bigger atlas
box finds more sounds and the list shows eight, and that Chords names the chord and the key.
The busiest page is Motion, about 270 calls.

## Trying it on the keyboard

As for the era designs: close HoSTage / CEditor, VIP and the DAW, connect the CTRL49, run the
launcher. Worth writing down:

- whether `Skin.lua` loads at all: at 46 KB it is the largest page the lab has sent (the era
  designs are 33 KB). The invented library is most of the difference; `library()` in the
  generator makes fewer sounds if it is too much;
- whether Aileron Light (face 7) draws the bars-left numeral. Every earlier page used faces 9
  and 10 only;
- how long the atlas takes to answer a crosshair move: the first draw after one searches all
  1,200 sounds in Lua;
- whether the colour follows the sound everywhere (pick a sound on the atlas with E4, then walk
  the pages), and whether a tinted dot on the Motion knobs reads as "now" against the arc;
- whether the beat at the screen's edge reads from a distance, and whether it is too much.
