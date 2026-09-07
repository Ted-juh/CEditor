# The Sound Browser: a library that has heard everything in it

Status: **Stages A–D are built** (2026-09-07); E and F are a plan, not a commitment. The mockups it describes are in
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
- ~~**B — the auditioner.**~~ **Built, 2026-09-07** — see *Stage B, as built* below. Out-of-process
  hardening is what remains of it, and it is now B2 rather than a precondition.
- ~~**C — instant audition.**~~ **Built, 2026-09-07** — see *Stage C, as built* below.
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

## Stage B, as built

`SonicProbe.h/.cpp` plays a sound and writes down what came out; `SonicProfile` in `Library.h`
is what it wrote. Everything the browser does with measurements is a face on that one struct.

**The probe is fixed on purpose.** C3, velocity 100, held 1.2 s, 0.8 s of tail, then a second
pass at velocity 40. Every sound has to be measured the same way or the numbers cannot be
compared, so the note and the timings are constants rather than settings. The quiet pass is
half the cost of the probe and it is the only way to know whether a sound answers touch, which
is most of what separates a playable instrument from a pad.

**What it measures, and how each one is checked.** Brightness is a spectral centroid taken from
the *sustain*, not from the transient — a transient's spectrum is every frequency at once, which
is why a naive "FFT the whole render" reads every plucked sound as bright. Attack is the time
from the sound leaving the noise floor to nine-tenths of its peak, deliberately not from
note-on, so a plug-in that reports latency it does not remove is not credited with a slow attack
it does not have. Tail is measured from the release to 60 dB below the held level and is bounded
by the probe, so a pad that outlasts it reports the probe rather than a wrong number. Width is
inter-channel correlation, so the same signal twice is not wide however loud. Every one of them
is checked against a test instrument built to have it — a tone at a known frequency, a ramp of a
known length, two decorrelated channels — rather than against itself.

**Every value is kept twice**: normalised 0..1 for the sliders, and in its own unit beside it so
the inspector can say `438 Hz centroid` rather than `0.34`. The mapping lives in one place per
side and the two are pinned to the same constants, because a slider that maps its handle
differently from the filter behind it is a slider that lies.

**Never measured twice.** A profile is keyed to the fingerprint it was measured from, so a
rescan that finds the same bytes never re-renders them: the second run of a twelve-thousand
preset library takes no time at all, and `analyseLibrary {all:true}` is how you ask anyway.

**Absent is not zero.** An unmeasured record carries no profile at all rather than a profile of
zeroes, because "not listened to yet" and "measured and dark" are not the same thing. An active
range therefore refuses anything unmeasured — an unknown brightness is not a dark one — and the
browser says how many that is instead of quietly dropping them.

**Folding is deliberately timid.** Forty plug-ins each shipping an "Init" is forty *different*
sounds with one name, and folding those would lose thirty-nine of them. So a duplicate set is
only ever the same bytes (identical fingerprint) or the same name, the same plug-in and a
measured distance under tolerance. Records from different plug-ins are never folded, however
alike they measure — and there is a test that three identically-measuring presets of one
plug-in with three different names are three sounds.

**Threading, and what is honestly still missing.** The job runs off the controlling thread
through `Options::analysisExecutor`, the same shape the scan already used. Two things come back
through `Options::onControlThread`: destroying a plug-in instance, and writing findings into the
library. Instances are borrowed one per plug-in and every preset that plug-in holds is played
before the next one is made, because instantiating is the expensive part and playing is not.
A plug-in that will not load is skipped with its reason, never fatal.

It is still **in process**, and that is the gap. §17's whole argument is that a plug-in which
takes the process down must not take the editor with it, and the scanner is out of process for
exactly that reason. The argument for running the auditioner in process is real but partial:
these classes have already been vetted by the out-of-process scan, and the host loads them into
the rack anyway. It is not the same as crash isolation. **B2 is moving the job behind the
scanner's worker**, and the shape above was chosen so that is a different `analysisExecutor`
and instantiation hook rather than a rewrite.

**What rendering it found.** The range inputs arrived wearing the browser's own chrome — a light
track and a default thumb inside a dark tool — because `accent-color` colours the fill and
nothing else; they take the workspace's colours through the `-webkit-` track and thumb now.
And tiles without a measurement had no thumbprint, so the grid reflowed as the auditioner worked
through it: an unheard sound now draws the space and says *not heard yet*, which is a different
statement from drawing a flat sound.

**Not in Stage B:** the snapshots that make audition instant (that is C, and it is the feature
people will notice first), the Atlas, "sounds like" in the inspector, and the substitutes. The
distance function they all share is built and tested.

## Stage C, as built

Three pieces, each small enough to prove on its own: `SnapshotStore` keeps the render,
`AuditionPlayer` plays it, `RecentPlay` remembers what you played.

**The promise is that a click makes a sound now.** The auditioner already renders every preset
once; Stage B threw that audio away. It is now kept as a 2-second mono FLAC at 16 kHz — about
35 kB — so `auditionRecord` starts a sound on the same message that begins loading the plug-in.
When the plug-in commits, the snapshot fades out and the real thing takes over.

**It is a cache and it behaves like one.** 400 MB budget, least recently *heard* evicted first —
reading a snapshot touches it, so the ones you actually browse are the ones that survive. A
missing snapshot is not an error anywhere: it degrades to exactly the old behaviour, load the
plug-in and wait, and the indicator says `no snapshot yet — loading the plug-in` rather than
claiming to be the real thing. Snapshots are keyed by content fingerprint, so two copies of one
preset share one file — which is what a library full of duplicates is made of.

**Where the preview sits in the graph.** One node, wired at exactly the point a part's
instrument feeds, so the preview runs through that part's inserts, its fader, its pan and its
sends and is heard at the level the real instrument will be. With no part focused it joins the
master chain instead — a preview rather than a rehearsal, and the difference is worth being
honest about.

**A fade, not a cut.** The snapshot and the live instrument are two renderings of the same sound
arriving a few hundred milliseconds apart; cutting between them clicks, and a click is what
makes a preview feel cheap. The test asserts the shape rather than a magic number: every block
quieter than the last, and the final audible one far enough down to be inaudible.

**"Your last eight bars" is the feature no preset browser has had.** Every note that reaches the
rack goes into a ring stamped in beats — beats, not seconds, because a phrase captured in
seconds replays at the wrong tempo the moment anybody changes it. When the live instrument takes
over, that phrase plays through it. Auditioning a bass with a middle C tells you nothing;
auditioning it with the line you were just playing tells you everything.

Two rules make that phrase usable rather than a curiosity. The window ends at the **last bar line
crossed**, so what comes back starts on a downbeat and loops instead of starting wherever you
happened to stop. And it can never hang: a note still sounding at the end of the window is given
an off, and an off whose on fell outside the window is dropped rather than replayed — on stage a
stuck note is the only bug that matters.

**What rendering it found.** `isPlaying()` was false for one block after `start()`, because
`playing` was only set when the audio thread picked the clip up — so a caller that started a
preview and asked whether anything was sounding was told no, and the indicator lagged the sound.
Starting now means playing now, and a block that cannot take the swap lock outputs silence
rather than a fragment of whatever was playing before. The cache size read `0 MB` for 68 kB,
which looks like a broken number rather than a small one. And "the real thing" was shown while a
plug-in with no snapshot was still loading, which is a lie for as long as the load takes — that
is its own `loading` stage now.

**Not in Stage C:** the snapshot is what the auditioner rendered — one note, dry, as the plug-in
alone made it. Auditioning the *chain* would mean rendering the chain, which is a different
probe. And nothing here is out of process; that is still B2.

## Stage D, as built

Saving a sound is no longer a decision about whether to destroy the old one. Every save is a
version; the record's current state is the newest of them, so nothing that already reads a
record had to learn about versions.

**The rule is the design work, not the rail.** Keeping every save forever costs a state blob
each — eighteen kilobytes for a big synth — and keeping only the newest is the overwrite this
stage exists to abolish. So: everything under 30 days, one a day under a year, and past a year
only what you named. On top of that, three are never dropped at any age — anything you named
(naming it is the whole signal that it matters), the newest (it is the sound), and the origin
(throwing it away loses the comparison the diff exists for). One-a-day keeps the *last* save of
each day, the one you finished on rather than the one you started with. `pruneLibraryVersions`
is pure and the test states each clause.

**A factory preset's first save branches.** A vendor record's versions would be the vendor's,
and a rescan is entitled to refresh everything on one — so saving over a factory preset makes a
record of your own that remembers where it came from. That is also what "against factory" in the
diff is measured against.

**The diff needs the plug-in, and says so.** Two opaque state blobs cannot be compared by
parameter without something that understands them, so the live instrument reads both and what
was on the part when you asked is put back afterwards — a comparison must not be a change. Where
there are no parameter names to be had, a hardware patch routes to `PatchDiff` instead, which
already says the one true thing about the bytes: where they differ. A record with no second
state refuses aloud rather than emitting an empty diff.

**The morph is a parameter blend and is honest about it.** It interpolates between the two saves
on the parameters the plug-in exposes; anything a plug-in keeps out of its parameter list does
not move. That is a real limitation and it is the reason morphing is not offered as "blend these
two sounds".

**What building it found.** `StubSynthProcessor`'s state was one int — a serial number, not a
sound — so two versions of it differed by nothing a parameter diff could name and the feature
looked broken when it was the fixture that was. Its state now carries its three parameters after
the int, which every existing four-byte round-trip still reads. On screen, the version rail's
rows wrapped their timestamp onto a second line, because a grid item's default minimum width is
its content and a nowrap label refuses to shrink; `minmax(0, 1fr)` is the fix. And "1 identical
parameters hidden" is the sort of thing only rendering catches.

**Not in Stage D:** A/B is two clicks on the rail rather than a sample-accurate switch with both
states resident, because applying a state is already fast enough that the difference is not
audible and holding two live instruments to prove otherwise is a large cost for a small claim.

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

- **2026-09-07** — Stage D built; see *Stage D, as built* above. The idea worth carrying: a
  parameter diff cannot be computed from two blobs — it needs the plug-in that understands them,
  which makes "compare" a thing that touches the live instrument and therefore a thing that has
  to put back exactly what it found.

- **2026-09-07** — Stage C built; see *Stage C, as built* above. The idea worth carrying: the
  audition phrase had to be captured in beats and cut at bar lines. Neither was obvious from the
  sketch, and both are the difference between "it replays something" and "it replays your line".

- **2026-09-07** — Stage B built; see *Stage B, as built* above. The one thing worth carrying
  forward: the spectral centroid had to come from the sustain rather than the whole render, or
  every plucked sound measures bright. That was not obvious until two sounds that plainly differ
  came back with the same number.

- **2026-09-07** — Stage A built; see *Stage A, as built* above for what rendering found.

- **2026-09-07** — the proposal above, with five screens drawn:
  [`sound-browser-mockups.html`](sound-browser-mockups.html). What drawing it settled, before any
  code: the facet strip only works horizontally if the chips carry counts (a column of uncounted
  chips is VIP's cage again); the audition bar needs the load *target* on it permanently, because
  "Load" going somewhere unexpected is the same fault the rack canvas plan names as its second
  consequence; and the inspector has to hold provenance above tags, because the first question about
  an unfamiliar sound is where it came from.
