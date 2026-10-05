# HoSTage feature mockups

Two screen-lab presets, five pages each: ten things the CTRL49's screen could show in HoSTage that
a host on hardware does not usually show. Both are in the Midnight 2020 look (see
[`../era-presets`](../era-presets/README.md)) so that what changes is the idea, not the style.
Like the era designs they are native screen-lab presets loaded by `Ctrl49ScreenLab.exe preset`,
not HoSTage pages. The lab has no library, no rack, no MIDI and no setlist, so every page fakes
its data from the frame counter and from tables the generator wrote into the Lua.

| Preset | Folders | Pages | Made by |
|---|---|---|---|
| HoSTage Features | `hostage-features`, `hostage-features-slim` | Sound Atlas, Motion, Capture, Stage, Chords | `make_feature_mockups.py`, `FeatureSkin.lua` |
| HoSTage Rig | `hostage-rig`, `hostage-rig-slim` | Layers, Effects, Soundcheck, Discover, Changes | `make_rig_mockups.py`, `RigSkin.lua` |

Each comes in two sizes, full and slim, for the stress test: see
[Stress testing them on the keyboard](#stress-testing-them-on-the-keyboard).

**Status: software checks only.** Neither has run on a CTRL49 yet. Like the era designs, they
need the preset mode of `Ctrl49ScreenLab.exe`, which is not in this repository yet.
`Start_CTRL49_Feature_Mockups.cmd` (in `tools/ctrl49`) asks which one and runs it.

## HoSTage Features

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

### The sound's colour

The whole screen takes the colour of the sound picked on the atlas, from its measured
brightness: dark sounds warm (amber, coral), bright ones cold (violet, teal). Pick a different
sound and every page changes colour: the title bar, the focused cell, the capture box, the
section name, the held keys. Everything that carries the colour is either a rectangle or a grey
coverage sprite in `tint.png` that the keyboard tints as it draws it, so recolouring costs
nothing: no second set of images, nothing uploaded again. It is the one idea that spans all five
pages, and it tells you which sound you are on before you read a word.

### What each page is, and what HoSTage already has for it

None of these starts from nothing. Each one draws something HoSTage already knows; the mockup
shows what it would look like on the keyboard.

**Sound Atlas.** This is the app's Sounds map (`sections/sounds/SoundsMap.svelte`) brought to
the keyboard. The auditioner already measures every sound it plays:
`CE/src/InstrumentHost/SonicProbe.h` takes brightness as a spectral centroid and attack as the
time to nine-tenths of the peak, and the app's map already plots those two, takes a dragged box
as a search, and walks to the nearest sound by ear (`nearestSounds` in `Library.h`). Here 1,200 invented
sounds sit in clusters (pads slow and mid, plucks fast and bright, basses dark), five characters
each in `Skin.lua`, and the map is baked into `panels.png`. HoSTage would draw the map from the
library itself and upload it as one image when the library changes, then send the eight nearest
(name, colour, a 15-column thumbprint of the level over the first second) each time the
crosshair moves. The page searches the library in Lua only because the lab has no host. The box
is a library query (how many sounds sit in it); the pads would audition the eight nearest.
Morphing (E5) exists too: a part can already sit between two records of its plug-in (the
`@morph` address, set from the map with Shift-click); E5 would ride it. Between two different
plug-ins it means nothing, so the page should only offer it among same-plug-in neighbours.

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
song's form exists as the arrangement, an ordered, bar-counted chain of named scenes
(`setArrangementItem {name, sceneId, bars}`): section and bars left come from there. What is
new is tying an arrangement to a setlist item, so the cue screen knows each song's form.

**Chords.** The chorder already plays a chord per pad (`padChords` in `MidiInsertRack.h`), and
a CTRL49 pad with nothing else on it already plays the focused part's Chords pads
(`pressSurfacePad` in `InstrumentHostService.h`). What is new is naming what you
hold, and offering the key's next chords on those pads. The page shows the chord, its numeral
and what it is doing in the key, the keys held on a three-octave keyboard with the scale marked,
and the eight pads with the likeliest next chord ringed. HoSTage would send the held keys as a
36-bit mask (5 bytes), the chord's name and numeral, and the eight pad chords.

Every one of those messages fits the 1,000-byte payload the screen's calls already live under.

### Its assets

| File | Size | PNG id | Buffer | Holds |
|---|---|---|---|---|
| `panels.png` | 480 x 816 | 576 | 577 | the Sound Atlas (with its map), Motion and Capture backgrounds |
| `tint.png` | 80 x 5184 | 578 | 579 | 8-bit grey coverage: 64 knob frames, then the rings, dots and lit keys (y 5120) |
| `parts.png` | 480 x 544 | 580 | 581 | the Stage and Chords backgrounds |

Uploads total about 100 KB. Decoded, it is 4,170 KiB counted at four bytes a pixel as the check
counts, or about 2,960 KiB if `tint.png` decodes to one byte a pixel, as the tinted grey format
is expected to. The largest single decode is `tint.png`: 1.66 MB at four bytes a pixel (the era
designs' knob strips are 1.64 MB), 0.41 MB at one.

## HoSTage Rig

| Page | Shows | E1 | E2 | E3 | E4 | E5 | E6 |
|---|---|---|---|---|---|---|---|
| Layers | every part's key range over the 49 keys, and which parts answer the notes played | part | lowest key | highest key | transpose | lowest velocity | highest velocity |
| Effects | the part's effects, each measured by what it does to the sound | slot | the slot's four controls | | | | bypass (turn) |
| Soundcheck | the setlist checked before the show: ready, worth a look, will not play | song | part | check again (turn) | | | |
| Discover | what you own and have never opened, nearest to what you keep loading | pick | reach further | kind | keep (turn) | | |
| Changes | the sound against its saved version: A/B, undo one change, the history | listen, saved to now | change | undo it (turn) | walk back | | |

`hostage-rig/preview-*.png` are its pages, and five moments: `1-layers-bass` (another part
picked: the screen turns amber, and its range waits for E2 and E3 to reach it), `2-effects-delay`,
`3-soundcheck-checking` (the check running), `4-discover-strings` (one kind only) and
`5-changes-half-way` (three edits back, listening half way between saved and now).

**The part's colour.** Here the screen takes the colour of the part picked on Layers, which is
its sound's colour on the first preset's atlas: amber for the sub bass, violet for the pad, teal
for the bell.

**Editing with absolute encoders.** The host keeps each encoder's absolute position, so on the
pages that edit something per part or per slot (Layers, Effects) an encoder takes a value over
only once it reaches it, like a fader without a motor; until then the value stays and its cell
shows it dim, and on Layers a ghost outline shows where E2 or E3 is. HoSTage itself reports each
turn as a relative step (`encoderDelta`), so it would not need this.

### What each page is, and what HoSTage already has for it

**Layers.** A part's zone is already a key range, a velocity range and a transpose
(`PartMidiRules.h`: `keyLow/High`, `velocityLow/High`, `transpose`), and layer groups share one
note decision with velocity or key crossfades (`LayerGroup` in `RackModel.h`). What nobody shows
is the whole keyboard at once: a band per part over the keys, the split drawn where one part ends
and the next begins, how deep the layers go, and, as you play, a light under each part that
answers each note (and grey keys where nothing does, so a dead zone is visible). HoSTage would
send the parts' ranges when they change (a few bytes a part) and the notes sounding each frame.

**Effects.** The insert chain is HoSTage's own (`EffectSlot`, `effects` per part, bus and master
in `RackModel.h`), so HoSTage sees what goes into every slot and what comes out. That is enough
to say what any plug-in is doing without knowing what it is: how much louder or quieter it makes
the part (gain), brighter or darker (tone), how far it brings the loudest moments down towards
the rest (squash), how much wider (width), and how long it rings on (tail). Each card shows the
five as bars and names the one that matters; a slot that changes nothing says so. The selected
slot shows its spectrum and its level over four seconds, in and out. Measuring is new: it would
mean metering before and after each slot. The mockup works the five out from a simulated signal
and the slot's controls (an EQ, a compressor with make-up gain, a chorus, an echo, a plate).

**Soundcheck.** The check already exists without a screen: `soundcheckReferences` in
`SetlistSoundcheck.h` walks a setlist item's parts and reports a missing plug-in or a MIDI output
that is not there, and a plug-in's saved state carries a hash checked on load (`stateBlobHash`).
The page runs it over the whole set, song by song, and says what to do: plug the cable in, play a
state saved by an older version once, preload a slow plug-in, or use the nearest sound you have
(`nearestSounds` again, which `Library.h` already describes as "the substitute for a plug-in you
no longer have"). Load times are the one new measurement.

**Discover.** `unplayedLikeHabits` in `Library.h` is this page: "Here are twenty you have never
opened that sound like the ones you keep loading". `habitualProfile` is the halo marked YOU on
the map, the average of what you load weighted by how often. Each suggestion says which of your
regulars it is like and how often you load that one. E4 keeps one as a favourite
(`setLibraryUserMetadata {favourite}`). The mockup's map shows 720 invented sounds of the 11,903,
sorted by the generator; HoSTage would send the eight on show.

**Changes.** Every save of a sound is kept as a version (`commitVersion`, `diffVersions`,
`morphVersions` in `InstrumentHostService.h`), so "what changed since I saved" is a diff HoSTage
can already take, and listening anywhere between saved and now is `morphVersions`. Undoing one
change puts that parameter back to its saved value; walking back through the history is the
edit history (`restoreEditHistory`). The page shows each changed parameter as the saved value (a
tick), the value now, and what you are hearing (the bar) as E1 moves from A to B.

### Its assets

| File | Size | PNG id | Buffer | Holds |
|---|---|---|---|---|
| `panels.png` | 480 x 816 | 576 | 577 | the Layers (with the keyboard), Effects and Soundcheck backgrounds |
| `tint.png` | 128 x 64 | 578 | 579 | 8-bit grey coverage: dots, rings, the three check marks, a star, the lit keys |
| `parts.png` | 480 x 544 | 580 | 581 | the Discover (with its map) and Changes backgrounds |

Uploads total about 36 KB; decoded, 2,582 KiB at four bytes a pixel. `Skin.lua` is 59 KB, the
largest yet: the invented set, library and history are written into it.

## Making and checking them

```bash
python tools/ctrl49/screen-lab/feature-mockups/make_feature_mockups.py        # full and slim
python tools/ctrl49/screen-lab/feature-mockups/make_rig_mockups.py slim       # or just one size

cd CE/web
npm run test:screen-eras                    # CTRL49_ERA_PREVIEWS=1 rewrites the previews
CTRL49_ERA_ONLY=hostage-rig npm run test:screen-eras        # one design, quicker
```

Both generators need Pillow. `make_feature_mockups.py` borrows its drawing helpers and the
Midnight palette from `../era-presets/make_era_designs.py`, and `make_rig_mockups.py` borrows
them from `make_feature_mockups.py`. Each writes its folder's three atlases, its manifest, and its
`Skin.lua`: the template with the `GENERATED` block (theme, layout, sprite crops and the invented
data) replaced. Behaviour belongs in the templates; never hand-edit a `Skin.lua`. Each prints what
the design asks of the keyboard: its script, its uploads and its decoded images.

The era designs' check covers both, with the same rules (the manifest, Lua 5.2, the template
outside the generated block, every key the template reads given, every encoder of every page
through all 128 positions, every call on the screen and inside its atlas, every text inside its
box, at most 600 calls a redraw, the atlases decoded once, the pages that should move moving).
It also checks that each page answers its encoders the way it says it does. On the first preset:
E5 on Capture keeps the box and says so once, a bigger atlas box finds more sounds and the list
shows eight, Chords names the chord and the key. On the second: Layers names the split, and E2
takes a part's lowest key over only once it reaches it, then carries it; E6 bypasses an effect
and brings it back; Soundcheck gives the set's verdict, the problem and the fix, and E3 runs it
again; Discover lists eight and E3 keeps them to one kind; Changes counts what changed as E4
walks back, and E3 undoes one. The busiest pages are Motion and Effects, about 280 calls in
full and 180-195 slim. A slim `Skin.lua` is compared with its template as parsed code, not as
text, so stripping it can never change what it does without the check failing; and the corner
readout is drawn and held to its box during the sweep, though the previews leave it out.

## Stress testing them on the keyboard

Nobody has measured how much the CTRL49 takes: the largest script, the Lua memory, the draw
calls a redraw at a given rate, the image memory. These pages lean on all four, so each preset
comes in two sizes. The slim one is smaller in every way that could hit a limit; same pages,
same look, coarser where it does not matter much.

| | Features full | Features slim | Rig full | Rig slim |
|---|---|---|---|---|
| `Skin.lua` | 48 KB | 30 KB | 59 KB | 39 KB |
| what is in it | comments, 1,200 sounds | no comments or indentation, 300 sounds | comments, 720 sounds | stripped, 180 sounds |
| uploads (PNG) | 98 KB | 56 KB | 36 KB | 23 KB |
| decoded images, 4 bytes a pixel | 4,170 KiB | 3,370 KiB | 2,582 KiB | 2,582 KiB |
| the same with `tint.png` at 1 byte a pixel | 2,955 KiB | 2,755 KiB | 2,558 KiB | 2,558 KiB |
| knob frames | 64 | 32 | - | - |
| redraws a second | 15 | 10 | 15 | 10 |
| busiest redraw (draw calls) | 271 (Motion) | 195 (Capture) | 282 (Effects) | 176 (Effects) |
| graph columns | Motion 2 px, Capture a bar each | Motion 4 px, Capture 2 bars each | Effects level 2 px, spectrum 4 px | Effects level 4 px, spectrum 8 px |

Every build shows **what it is asking for**, in the corner beside the page dots: the draw calls
of the redraw, then the Lua memory in KB (`collectgarbage("count")`), then, if the firmware has
it, `mem_usage(0)`. That last one comes from the ADVANCE firmware's function list and nobody
knows yet what it counts: write down what it says before and after a page that decodes, and it
will tell us. The two memory numbers update every 15 redraws.

**The order.** Close HoSTage / CEditor, VIP and the DAW, connect the CTRL49, and work up:

1. The lab's **Stress** page first (`Start_CTRL49_Screen_Lab.cmd`, choice 2): the raw ceiling for
   rectangles, sprites, text, decodes and redraw rate, with nothing else in the way.
2. **Features slim**, then **Features full**.
3. **Rig slim**, then **Rig full**.
4. For a heavier redraw than any of these: the Envelope page of Red Lead, Rhythm Box, Walnut or
   Test Bench (`Start_CTRL49_Era_Designs.cmd`) makes about 420 draw calls, at 15 a second.

**On each, write down:**

- **Did it load?** The upload of `Skin.lua` and the PNGs, then the loading screen counting the
  three decodes to 3 / 3. A Lua error shows on the keyboard's own screen; the stock screen coming
  back is the watchdog. If your build of the lab prints the keyboard's replies, `0x42` is out of
  memory and `0x4D` a Lua script error (the committed lab does not read them).
- **The readout on every page**, at rest and while turning encoders: draw calls, Lua KB and the
  firmware number. The highest Lua KB after walking all five pages is the one that counts (the
  pages read their libraries the first time they need them).
- **Does it keep up?** Motion's dots and scopes, Capture's scroll, the Layers lights and the
  Effects level graph all move every redraw. Smooth means the keyboard keeps up at that rate;
  jerky means note the page and its draw calls.
- **Does it answer?** Turn E1 or E2 on Sound Atlas, which searches the whole library at every
  move, and how long before the screen follows. Effects does the most Lua of all every redraw (it
  runs the whole chain over four seconds of signal), so watch whether it keeps up.

**Reading the result.**

| Slim | Full | What it says |
|---|---|---|
| loads | fails at upload or with a Lua error at once | the script, or the memory it builds, is over the limit: the limit lies between the two sizes, and the slim one's readout says how much Lua memory it used |
| loads | stops at a decode (Features) | image memory: between the two totals, 2.7-2.9 MiB if `tint.png` decodes to one byte a pixel, 3.3-4.1 MiB if to four. The rig's images are the same in both sizes |
| smooth | jerky on Motion or Effects | the draw-call budget at 15 a second is under 270-280 |
| jerky too | jerky | under 180-195 calls at 10 a second: lower `fps` further, or widen the columns again |
| slow to answer | slow to answer | the Lua itself is slow: HoSTage must do the searching and the sums, and send results |

Builds in between are a line in `PROFILES` (at the top of each generator): the frame rate,
`knob_frames`, `sounds` or `never`, the column steps, and `minify`. Change one, run the
generator for that size, and the check (`CTRL49_ERA_ONLY=<folder> npm run test:screen-eras`)
says whether it still draws inside its limits.

Also worth writing down, whatever the size:

- whether Aileron Light (face 7) draws the bars-left numeral on Stage. Every earlier page used
  faces 9 and 10 only;
- whether the soft glows on the two maps band (the screen's colour depth);
- whether the colour follows the sound everywhere (pick a sound on the atlas with E4, then walk
  the pages), and whether a tinted dot on the Motion knobs reads as "now" against the arc;
- whether the beat at the screen's edge reads from a distance, and whether it is too much;
- whether the Layers bands and their lights read at arm's length, and whether picking a range up
  with E2-E6 feels natural or needs the host's relative turns.
