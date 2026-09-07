# The Sound Browser: a library that has heard everything in it

Status: **Stage A is built** (2026-09-07); B–F are a plan, not a commitment. The mockups it describes are in
[`sound-browser-mockups.html`](sound-browser-mockups.html) — open it in a browser; it is
self-contained. Like the [rack canvas](rack-canvas-plan.md), this is written to be argued with,
and the running log at the end is where new ideas go.

## The complaint

The product this one succeeds was bought for its preset system. VIP's pitch was that every preset
from every installed instrument would be in one browser, tagged, searchable, and reachable from the
keyboard without touching a mouse. It largely delivered that, and it is still the thing people
mention first when they describe what they miss.

It is worth being exact about where it stopped, because "add a preset browser" is not a plan:

**VIP knew a preset's name, its vendor and whatever tags somebody typed. It never once listened
to it.**

Every real complaint follows from that one fact:

1. **The tags disagree**, because they were typed by different people at different companies with
   different ideas of what "Warm" means. A search across a twelve-thousand-preset library returns
   what the marketing copy said, not what the sound is.
2. **Auditioning is gated on load time.** There is nothing to play until the plug-in is up, so
   browsing a heavy instrument is four seconds a preset. In practice people stop browsing.
3. **"Init" appears forty times** and nothing notices, because two presets are only comparable by
   their names.
4. **A multi dies when a plug-in is uninstalled**, because a name is all the multi ever knew about
   what it wanted. On stage that is the end of the song.
5. **Hardware is not in it at all** — which is a strange gap for software sold with a controller
   keyboard, and it is the gap this repository is already best placed to close.

Our own browser is behind VIP on the parts VIP did well: it is a slide-out list of grey type in
`InstrumentHostView.svelte`, with a search box, five filter buttons and a favourite star. Catching
up is a week of front-end work. Beating it is the rest of this document.

## The proposal

**Index sounds, not files.** One record type for anything that makes a noise when you press a key:
a vendor `.vstpreset`, a state you captured, a hardware synth patch, a whole voice chain, a whole
rack. That is already the shape of `Library.h`, and it is the first thing VIP cannot do at all.

**Play everything once, offline, and keep what came back.** One probe per record — C3 at velocity
100 held 1.2 s and released, a second pass at velocity 40, a three-note chord — yields a
`SonicProfile`: spectral centroid and its drift, attack and release times, harmonic-to-noise ratio,
stereo width, dynamic response, peak and RMS, whether it made a sound at all, the CPU it cost and
the latency it declared. Everything below is a face on that one measurement.

- **Filters that are measurements.** Brightness, attack, tail, width and CPU as ranges, alongside
  the vendor facets rather than instead of them. Any facet chip can be *excluded*, not just
  selected — VIP could never say "pads, but nothing distorted".
- **A thumbprint per sound.** The tile draws the sound's own waveform. It is more informative than a
  vendor logo (you can see it is a slow pad before you read the name) and it is the only option
  that is legally clean: product artwork belongs to its maker and this repository is AGPLv3.
- **Instant audition.** The probe render is kept as a ~2 s mono snapshot, so clicking a preset plays
  it *now*; the real instrument loads behind the snapshot and takes over at the next note boundary.
  This is the change people will feel first.
- **Audition in context.** Through the part's own chain, at the session tempo, over a rolling buffer
  of the last eight bars you played — so you hear the preset playing your line, not a middle C.
- **Proposed tags, never applied tags.** The analysis and your own tagging history suggest; you
  accept. A library that retags itself is a library you stop trusting.
- **Duplicate folding**, by fingerprint first and sonic distance second, keeping the copy your
  metadata is on.
- **Versions instead of overwrites.** Every save is a version on a rail, A/B-able, with a
  parameter-level diff from `ParameterModel` and a byte-level one from `PatchDiff` when the sound is
  a hardware patch and there are no parameter names to be had.
- **The Atlas** — the library plotted on two measured axes, clustered, with the unavailable records
  still on the map in grey.
- **Substitutes.** A rack whose plug-in is missing offers the nearest sound you actually own, ranked
  by distance in the same descriptor space, with the axes that agreed and the one that did not shown
  as chips. Session-local: the record keeps naming what it wants, so it plays correctly the day that
  plug-in comes back.
- **Off the mouse, on any surface.** The browser mirrored to whatever the connected profile declares
  — encoders drive the facets, pads hold the top eight, push loads. Generic from the profile's
  capabilities, exactly as the surface drawing already is.

## Why this is cheaper than it looks

Most of the correctness-critical half is built and under test:

| Piece | Where | State |
| --- | --- | --- |
| Records with provenance, missing-not-deleted, user block survives rescans | `CE/src/InstrumentHost/Library.h` | Built |
| Hardware patches as library records | `sourceType == "hardwarePatch"`, minted in `InstrumentHostService.cpp` | Built |
| Chain and rack capture | `saveChainToLibrary`, `saveRackToLibrary` | Built |
| Pure search over the index | `searchLibrary()` in `Library.cpp` | Built; needs facets and range predicates |
| Byte-level patch diff | `CE/src/InstrumentHost/PatchDiff.h` | Built, and it already refuses to guess what a byte means |
| Exposed plug-in parameters | `CE/src/InstrumentHost/ParameterModel.h` | Built |
| An out-of-process worker that survives a plug-in taking itself down | `PluginScannerCoordinator`, `ScannerWorkerMain.cpp` | Built — **the auditioner is this, re-tasked** |
| Surface layout, indices, conformance, live feedback | `CE/src/ControlSurface/SurfaceProfile.h` | Built |
| The analysis, the snapshots, versions, the map | — | **New. All of the genuinely new work is this row.** |

One correction while we are here: `Library.h`'s header comment lists four source types and the code
mints five. `hardwarePatch` is real (`InstrumentHostService.cpp`, the capture path) and is the type
this whole plan leans hardest on.

## What it costs, stated rather than waved at

**Scan time.** The render is 50–200× real time; the expensive part is the plug-in accepting a state,
which is 100–400 ms for a large instrument. Twelve thousand presets is therefore about an hour —
out of process, resumable, incremental, and never repeated for a fingerprint already seen. VIP's own
scan was not faster and produced less.

**Disk.** Forty-odd floats per record is nothing. A 2-second mono snapshot at 16 kHz in FLAC is
about 35 kB, so a twelve-thousand-preset library is roughly 430 MB. That is real, so **the snapshot
is a cache and must say so**: descriptors and thumbprints are kept forever, snapshots are evicted
least-recently-heard down to a budget, and a missing snapshot degrades to exactly today's behaviour
— load the plug-in and wait.

**The hole scanning cannot fill.** Omnisphere, Serum and Diva keep their presets to themselves, and
this is precisely where VIP's "every preset in one place" quietly stopped being true. We cannot fix
that by scanning harder, and a browser that implies it has everything is a browser that lies.

The way round is to stop scanning and start listening: when you browse inside a plug-in's own UI,
the host already has it up and is already rendering its audio. Notice the state blob change, run the
same descriptor pass over the audio that just came out, and offer one unobtrusive *file this*.
Browse Omnisphere for ten minutes and the library has learned ten minutes of Omnisphere, measured
the same way as everything else. Nothing is filed without the user saying so, and the browser says
which instruments are indexed that way.

## The order of work

Each stage ships something on its own.

- ~~**A — the workspace.**~~ **Built, 2026-09-07** — see *Stage A, as built* below.
- **B — the auditioner.** The scanner worker learns to render a probe. Descriptors on the record,
  thumbprints, measured ranges, duplicate folding. The expensive stage, and the one the rest needs.
- **C — instant audition.** Snapshot cache, live handoff at the note boundary, the rolling eight-bar
  buffer, auditioning through the part's chain.
- **D — versions and diff.** Independent of B; could come earlier if saving-over is the louder
  complaint. The real design work is the retention policy, not the UI.
- **E — Atlas and substitutes.** The map, "more like this" and the missing-plug-in flow are one
  distance function with three faces.
- **F — off the mouse.** The browser mirrored to any profile that declares a screen; generic first.

## Stage A, as built

`SoundBrowser.svelte` replaced the slide-out list: a rail, a facet strip, a result grid and an
inspector, over `LibraryQuery` and `libraryFacets` in `Library.h`. No analysis anywhere — this is
a better browser over exactly the data the library already held.

**The exclusion is the point.** Every facet carries `include` and `exclude`, a chip cycles
off → keep → refuse, and alt-clicking refuses in one gesture. "Pads, but nothing distorted" is a
search the product this succeeds could not express at all.

**A count is what clicking the chip does**, and getting that literally true took two passes
rather than one, because the two kinds of chip offer different clicks. An unchosen value joins
the facet's OR group, so its count lifts the facet's keep list and leaves its refusals in force.
A refused value's click takes the refusal off, so that one value is counted again with its own
refusal lifted. Counting inside the current result — the obvious implementation — makes every
unpicked chip in the facet you just used read zero, which is true and says only "you have
already filtered by this". The mixed case, one facet holding a keep and a refusal at once, is
pinned by a test on both sides.

**The view is remembered.** Every mutation used to re-emit `emitLibrary({}, {})`, so favouriting
a record dropped you back to the whole library while the chips on screen still claimed to be
filtering. `libraryView` on the service holds the last query and every mutation replays it.

**Smart collections are saved queries**, kept in `library.json` beside the records, run fresh on
every answer so each rail entry carries its own live count. Static collections — the
`collections` list on a record's user block — were already in the model and had never been
shown; the rail gathers them from the records rather than declaring them anywhere.

**What rendering it found**, in the order it found it, because none of it was visible in the
code. Svelte scopes styles per component, so every control in the new component came up in the
browser's own default chrome — white buttons and a white search field inside a dark tool — until
`InstrumentHostView`'s `button`/`input` rules were repeated in it. A rack capture and a chain
capture are yours by definition, so the `MINE` badge next to `RACK` and `CHAIN` said nothing the
badge beside it had not; it is `userState` only now. And the three-state chip is invisible until
somebody tries it, so the strip says what alt-click does rather than hiding it in a tooltip.

**Not in Stage A, deliberately:** the audition bar as drawn (there is nothing to audition
instantly until Stage B renders the snapshots), thumbprints, the Atlas, versions, substitutes.
The audition toggle that already existed — load into the focused part and play a note — moved
across unchanged.

## What this deliberately does not do

- **No cloud, no account, no gallery.** The library is files on your disk. A Sound Pack is a
  portable bundle you can hand somebody; there is no service in the middle.
- **No vendor artwork, ever.** Same rule the CTRL49 layout settled: a product photograph belongs to
  its maker. A sound's tile is drawn from its own audio.
- **A substitution never rewrites the record.** The rack keeps naming the plug-in it wants. Same
  rule as ratings surviving a missing source: nothing you did is destroyed by something you did not.
- **Nothing is tagged behind your back.**
- **It does not scrape a plug-in's own browser.** Reading another program's UI is brittle, hostile
  and breaks on their next release.
- **It is not a sample manager.** Audio files are not sounds you play.
- **The descriptors are measurements, not opinions.** Brightness is a spectral centroid and says so
  on hover. There is no model here deciding your pad is "emotional".

## Running idea log

New ideas go here with a date, so nothing gets lost between sessions.

- **2026-09-07** — Stage A built; see *Stage A, as built* above for what rendering found.

- **2026-09-07** — the proposal above, with five screens drawn:
  [`sound-browser-mockups.html`](sound-browser-mockups.html). What drawing it settled, before any
  code: the facet strip only works horizontally if the chips carry counts (a column of uncounted
  chips is VIP's cage again); the audition bar needs the load *target* on it permanently, because
  "Load" going somewhere unexpected is the same fault the rack canvas plan names as its second
  consequence; and the inspector has to hold provenance above tags, because the first question about
  an unfamiliar sound is where it came from.
